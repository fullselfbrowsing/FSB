(function(global) {
  'use strict';

  /**
   * Phase 28 plan 01 (v0.9.99 Native Capability Catalog) -- capability-search.js
   *
   * The capability-search index layer (SURF-04 / SURF-01). Owns the single
   * MiniSearch instance and the slug -> recipe map. Built from the NEW separate
   * capability-descriptor documents (D-01; the Phase 26 closed recipe schema is
   * byte-untouched). Snapshots the index to chrome.storage.local under
   * 'fsbCapabilityIndex' alongside a catalogVersion stamp and restores it on a
   * service-worker wake when the version matches (D-05) -- never rebuilding on
   * every wake (cold-start + SW-eviction regression).
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js -- the
   * service worker reads global.FsbCapabilitySearch after importScripts; Node
   * tests require() the module.exports. Every vendored global (MiniSearch, chrome,
   * the build-time FsbRecipeIndex catalog) is reached only through a typeof-guarded
   * accessor so the module loads cleanly under the Node test harness (the global
   * may be absent -> degrade, never throw).
   *
   * Locked decisions implemented here (28-CONTEXT.md):
   *   - D-02 sideEffectClass derives from the frozen recipe method (GET/HEAD=read,
   *          POST/PUT/PATCH=mutate, DELETE=destructive), mirroring MUTATING_METHODS
   *          at capability-fetch.js:228; the descriptor's authored sideEffectClass
   *          is cross-checked against the derived value at index-build time.
   *   - D-03 sideEffectClass is surfaced in every search hit.
   *   - D-04 this is the NEW service-worker module; it is on the recipe-path
   *          allowlist and is free of dynamic-code constructs even in comments.
   *   - D-05 toJSON/loadJSON snapshot under 'fsbCapabilityIndex' with catalogVersion.
   *   - D-08 schema-on-hit: every hit carries the matched recipe's params schema.
   *   - D-11 owned-tab origin bias via a per-document boost; the origin is resolved
   *          service-worker-side in the dispatcher and passed IN as an arg (this
   *          module never reads chrome.tabs).
   *
   * LOAD-BEARING (Pitfall 3): MiniSearch.loadJSON(json, options) THROWS
   * 'loadJSON should be given the same options used when serializing the index'
   * unless given the SAME options object used at construction. INDEX_OPTIONS is a
   * single module-level constant passed to BOTH new MiniSearch(INDEX_OPTIONS) and
   * MiniSearch.loadJSON(json, INDEX_OPTIONS), and is EXPORTED so the eval test
   * reuses it (no options drift). toJSON() returns an object; loadJSON wants a JSON
   * string -> JSON.stringify the snapshot before restoring.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- The load-bearing construction options (reused verbatim at loadJSON) ----
  var INDEX_OPTIONS = {
    idField: 'slug',
    fields: ['intentSynonyms', 'description', 'service', 'actionVerb'], // searchable
    // returned on hit. `backing` (BRDTH-03) is the canonical seam enum
    // (recipe/handler/learn/dom) search() annotates invocable-vs-discovery-pending by.
    storeFields: ['slug', 'service', 'sideEffectClass', 'description', 'backing']
  };

  var STORAGE_KEY = 'fsbCapabilityIndex';
  var ORIGIN_BOOST = 4; // Claude's Discretion -- tuned via the eval harness

  // ---- typeof-guarded vendored-global accessors -----------------------------
  function _getMiniSearch() {
    return (typeof MiniSearch !== 'undefined' && MiniSearch) ? MiniSearch : null; // UMD global (background.js:120)
  }
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }
  // The catalog source is the build-time generated dual-export IIFE (D-16). Absent
  // under the Node test harness -> degrade to an empty catalog.
  function _getCatalog() {
    return (typeof FsbRecipeIndex !== 'undefined' && FsbRecipeIndex)
      ? FsbRecipeIndex
      : { recipes: [], descriptors: [] };
  }

  var _ms = null;              // MiniSearch instance
  var _slugToRecipe = {};      // slug -> recipe (invoke lookup + schema-on-hit params)
  var _slugToDescriptor = {};  // slug -> descriptor (handler schema-on-hit params)

  // ---- Learned-recipe snapshot bookkeeping (LEARN-03 / D-14) ----------------
  // The descriptors fed by addLearnedRecipe AFTER the base build, plus a strictly
  // monotonic learned-add counter. The counter is appended (as '+learnedN') to the
  // re-snapshot's catalogVersion so the stored value differs from the prior snapshot
  // even on a re-promotion that adds no new slug. CRITICAL (HI-01 fix): the suffix is
  // appended to the BASE-catalog version (computed over cat.descriptors only), so on
  // restart buildOrRestore can compare the base PREFIX and re-attach the persisted
  // index (which already carries the learned docs) -- the learned slugs survive the
  // SW restart. After such a restore _learnedAddSeq is re-seeded from the stored
  // suffix (see _reseedLearnedFromSnapshot) to stay monotonic across the restart.
  var _learnedDescriptors = [];
  var _learnedAddSeq = 0;

  // ---- D-02: derive sideEffectClass from the recipe method -------------------
  function deriveSideEffect(method) {
    var m = String(method || '').toUpperCase();
    if (m === 'DELETE') return 'destructive';
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'mutate';
    return 'read'; // GET / HEAD / unknown
  }

  function normalizeSideEffectClass(value) {
    var c = String(value || '').toLowerCase();
    if (c === 'destructive' || c === 'delete') { return 'destructive'; }
    if (c === 'mutate' || c === 'mutating' || c === 'write' || c === 'writes') { return 'mutate'; }
    return 'read';
  }

  // ---- BRDTH-03: backing-status enum + the invocable/display annotation ------
  // The CANONICAL backing field value is one of recipe/handler/learn/dom (the value
  // resolve() in capability-catalog.js routes to a seam tier; 'learn' -> T2, 'dom' ->
  // T3). A descriptor with no backing defaults to 'dom' (the safe DOM-fallback seam,
  // matching the resolve() else-branch). 'discovery-pending'/'learn-pending' is the
  // DISPLAY LABEL only -- never the field value -> no resolve() change.
  function normalizeBacking(value) {
    var b = String(value || '').toLowerCase();
    if (b === 'recipe' || b === 'handler' || b === 'learn' || b === 'dom') { return b; }
    return 'dom'; // absent/unknown -> the DOM-fallback seam (resolve() else -> T3)
  }
  // A descriptor is a CONFIDENT INVOCABLE hit ONLY when it is backed by a bundled
  // recipe or a registered handler (day-one invocable). A backing 'learn'/'dom'
  // descriptor RETURNS from search but is discovery-pending -- never surfaced as a
  // confident invocable hit (T-37-02: a pending-only descriptor must not look
  // invocable). The DISPLAY label maps learn -> 'learn-pending', dom -> 'discovery-
  // pending'; recipe/handler carry no pending label.
  function isInvocableBacking(backing) {
    var b = normalizeBacking(backing);
    return b === 'recipe' || b === 'handler';
  }
  function backingDisplayLabel(backing) {
    var b = normalizeBacking(backing);
    if (b === 'learn') { return 'learn-pending'; }
    if (b === 'dom') { return 'discovery-pending'; }
    return b; // recipe / handler -> the backing itself (no pending label)
  }

  // ---- Pure index builder (the SINGLE source of truth the eval test reuses) ---
  //
  // Constructs a MiniSearch over INDEX_OPTIONS and adds the descriptor docs. The
  // authored sideEffectClass is cross-checked against the recipe-derived value
  // (D-02): when a paired recipe is present its method wins, so a mis-authored
  // descriptor cannot under-state a destructive call in a search hit.
  function buildIndex(descriptors, slugToRecipe) {
    var MS = _getMiniSearch();
    if (!MS) return null;
    var map = slugToRecipe || {};
    var ms = new MS(INDEX_OPTIONS);
    ms.addAll((descriptors || []).map(function(d) {
      var recipe = map[d.slug] || {};
      var derived = recipe.method ? deriveSideEffect(recipe.method) : null;
      return {
        slug: d.slug,
        service: d.service || '',
        intentSynonyms: d.intentSynonyms || [],
        description: d.description || '',
        actionVerb: d.actionVerb || '',
        // recipe-derived class wins when a paired recipe exists (integrity check)
        sideEffectClass: derived || normalizeSideEffectClass(d.sideEffectClass),
        // BRDTH-03: a paired recipe makes the entry recipe-backed; else carry the
        // descriptor's own backing enum (defaults to 'dom' -> the DOM-fallback seam).
        backing: (map[d.slug] ? 'recipe' : normalizeBacking(d.backing))
      };
    }));
    return ms;
  }

  // ---- D-05: build at startup, restore from a version-matched snapshot --------
  async function buildOrRestore() {
    var MS = _getMiniSearch();
    if (!MS) return false;
    var cat = _getCatalog();
    var descriptors = cat.descriptors || [];

    // slug -> recipe/descriptor maps (invoke lookup + schema-on-hit params)
    _slugToRecipe = {};
    (cat.recipes || []).forEach(function(r) { if (r && r.id) _slugToRecipe[r.id] = r; });
    _slugToDescriptor = {};
    (descriptors || []).forEach(function(d) { if (d && d.slug) _slugToDescriptor[d.slug] = d; });

    // catalogVersion stamp: a content hash over the descriptor slugs + recipe
    // count is robust against same-count edits (Assumption A5).
    var catalogVersion = _computeCatalogVersion(descriptors, cat.recipes || [], cat.version);

    var c = _getChrome();
    // 1. Restore from snapshot when the BASE version matches (HI-01 / D-14 fix).
    //
    // A snapshot written by addLearnedRecipe carries a '+learnedN' suffix on top of
    // the base-catalog version (e.g. "1:3fe8b718+learned3"); a base-only snapshot has
    // no suffix. We compare the base PREFIX (everything before '+learned') against the
    // freshly recomputed base catalogVersion. A match means the persisted index --
    // which already contains the learned docs -- is current for THIS base catalog, so
    // we restore it verbatim and the learned slugs survive the SW restart (LEARN-03).
    // A genuine base-catalog change shifts catalogVersion, the prefixes diverge, and
    // we correctly fall through to rebuild (invalidation still holds).
    if (c && c.storage && c.storage.local) {
      try {
        var stored = await c.storage.local.get(STORAGE_KEY);
        var snap = stored && stored[STORAGE_KEY];
        var storedBase = String((snap && snap.catalogVersion) || '').split('+learned')[0];
        if (snap && storedBase === catalogVersion && snap.index) {
          // loadJSON wants a JSON string and the SAME options used at serialize.
          _ms = MS.loadJSON(JSON.stringify(snap.index), INDEX_OPTIONS);
          // Re-seed the learned-add bookkeeping from the restored suffix so the next
          // addLearnedRecipe keeps the '+learnedN' counter strictly monotonic across
          // the restart (a fresh module starts _learnedAddSeq at 0 otherwise, which
          // would re-issue an already-used suffix on the next add).
          _reseedLearnedFromSnapshot(snap, _ms);
          return true;
        }
      } catch (e) { /* fall through to rebuild */ }
    }

    // 2. Rebuild + re-snapshot.
    _ms = buildIndex(descriptors, _slugToRecipe);
    if (c && c.storage && c.storage.local && _ms) {
      try {
        var payload = {};
        payload[STORAGE_KEY] = { catalogVersion: catalogVersion, index: _ms.toJSON() };
        await c.storage.local.set(payload);
      } catch (e) { /* best-effort snapshot */ }
    }
    return !!_ms;
  }

  // ---- A deterministic catalogVersion stamp (count + slug-content hash) -------
  function _computeCatalogVersion(descriptors, recipes, declaredVersion) {
    var parts = (descriptors || []).map(function(d) { return d && d.slug ? d.slug : ''; }).sort();
    var seed = parts.join('|') + '#' + (recipes ? recipes.length : 0) + '#' + (declaredVersion || '');
    // Simple, dependency-free 32-bit string hash (djb2). Pure arithmetic -- no
    // dynamic-code constructs on the recipe path.
    var hash = 5381;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
    }
    return (descriptors ? descriptors.length : 0) + ':' + (hash >>> 0).toString(16);
  }

  // ---- HI-01 / D-14: re-seed learned bookkeeping after a snapshot restore ------
  //
  // When buildOrRestore re-attaches a persisted snapshot whose version carried a
  // '+learnedN' suffix, the in-memory learned counters (_learnedAddSeq /
  // _learnedDescriptors) are still at their fresh-module defaults (0 / []). Left
  // unseeded, the next addLearnedRecipe would emit '+learned1' again -- a NON-
  // monotonic version that could equal a value already written before the restart.
  // We recover the prior count from the stored suffix so the next add continues the
  // sequence (e.g. restored "...+learned3" -> next add writes "...+learned4").
  function _reseedLearnedFromSnapshot(snap, ms) {
    try {
      var ver = String((snap && snap.catalogVersion) || '');
      var marker = ver.indexOf('+learned');
      if (marker !== -1) {
        var n = parseInt(ver.slice(marker + '+learned'.length), 10);
        if (isFinite(n) && n > _learnedAddSeq) { _learnedAddSeq = n; }
      }
    } catch (e) { /* best-effort -- a malformed suffix just leaves the counter at 0 */ }
  }

  // ---- SURF-01: ranked, origin-biased, schema-on-hit results (<=topN) ---------
  function search(query, ownedOrigin, topN) {
    if (!_ms) return [];
    var ownedService = null;
    try { ownedService = ownedOrigin ? new URL(ownedOrigin).host : null; } catch (e) { ownedService = null; }

    var hits = _ms.search(String(query || ''), {
      combineWith: 'OR',                          // any matching term contributes (recall)
      prefix: true,
      fuzzy: 0.2,
      boost: { intentSynonyms: 3, description: 1 },
      // D-11 origin bias. minisearch 7.2.0 invokes boostDocument(id, term, stored)
      // (confirmed: boostDocument(id, '', this._storedFields.get(shortId))).
      boostDocument: function(id, term, stored) {
        return (ownedService && stored && stored.service && stored.service.indexOf(ownedService) !== -1)
          ? ORIGIN_BOOST : 1;
      }
    });

    // Defensive fallback (Open Question 1): if the boostDocument signature ever
    // drifts and the owned service did NOT float to the top, re-rank by an
    // owned-service match. A stable sort keeps minisearch's relevance order
    // within each bias bucket.
    if (ownedService && hits.length > 1) {
      var topService = hits[0] && hits[0].service;
      var ownedTopAlready = topService && topService.indexOf(ownedService) !== -1;
      if (!ownedTopAlready) {
        hits = _stableSortByOwnedService(hits, ownedService);
      }
    }

    var k = Math.max(1, Math.min(Number(topN) || 5, 5));
    return hits.slice(0, k).map(function(h) {
      var recipe = _slugToRecipe[h.slug] || {};
      var descriptor = _slugToDescriptor[h.slug] || {};
      // BRDTH-03 backing annotation: a recipe/handler-backed hit is a CONFIDENT
      // invocable hit (invocable:true); a learn/dom-backed hit RETURNS but is
      // discovery-pending (invocable:false, backingStatus display label) -- never
      // presented as a confident invocable hit (T-37-02). A hit with a paired recipe
      // in the slug->recipe map is recipe-backed even if its stored backing differs.
      var backing = (_slugToRecipe[h.slug]) ? 'recipe' : normalizeBacking(h.backing);
      return {
        slug: h.slug,
        service: h.service,
        sideEffectClass: normalizeSideEffectClass(h.sideEffectClass),
        description: h.description,
        score: h.score,
        params: recipe.params || descriptor.params || null, // schema-on-hit (D-08)
        backing: backing,                                    // canonical seam enum
        backingStatus: backingDisplayLabel(backing),         // display label
        invocable: isInvocableBacking(backing)               // confident-invocable flag
      };
    });
  }

  // Stable re-rank: owned-service hits first, original relative order preserved.
  function _stableSortByOwnedService(hits, ownedService) {
    var owned = [];
    var rest = [];
    for (var i = 0; i < hits.length; i++) {
      var svc = hits[i] && hits[i].service;
      if (svc && svc.indexOf(ownedService) !== -1) { owned.push(hits[i]); }
      else { rest.push(hits[i]); }
    }
    return owned.concat(rest);
  }

  // ---- invoke lookup (used by Plan 03) ---------------------------------------
  function getRecipeBySlug(slug) {
    return _slugToRecipe[slug] || null;
  }

  // ---- LEARN-03 / D-14: feed a learned recipe into the ONE index + slug map ---
  //
  // addLearnedRecipe(recipe, descriptor) makes the learned slug findable via
  // search() AND getRecipeBySlug on this and the next visit. It MUTATES the
  // EXISTING _ms instance (built with INDEX_OPTIONS) and NEVER constructs a fresh
  // MiniSearch (Pitfall 5) -- a second index with a divergent options object would
  // make a later MiniSearch.loadJSON(snapshot, INDEX_OPTIONS) throw "loadJSON
  // should be given the same options". When _ms is not yet built it is built via
  // the same buildIndex path first; when MiniSearch is absent (Node harness without
  // the constructor) it no-op-degrades and returns false.
  //
  // The indexed document mirrors buildIndex's addAll mapper EXACTLY, including the
  // D-02 integrity rule: the recipe method derives sideEffectClass and WINS over a
  // mis-authored descriptor class. After the index mutation the snapshot under
  // STORAGE_KEY is re-persisted with a BUMPED catalogVersion (a content hash over
  // the grown descriptor set plus a strictly monotonic learned-add suffix) so an SW
  // restart restores WITH the learned entry instead of a stale snapshot that lacks
  // it (D-14). Best-effort: a missing chrome.storage.local skips only the persist.
  async function addLearnedRecipe(recipe, descriptor) {
    var MS = _getMiniSearch();
    if (!MS) return false;                         // no constructor -> degrade
    if (!recipe || typeof recipe.id !== 'string' || !recipe.id) return false;
    var desc = descriptor || {};
    var slug = recipe.id;                          // the recipe id IS the slug

    // Build the index over INDEX_OPTIONS if it does not exist yet -- REUSING the
    // single buildIndex path (no fresh options object); never a second index.
    if (!_ms) {
      _ms = buildIndex([], _slugToRecipe);
      if (!_ms) return false;
    }

    // Mirror buildIndex's addAll mapper (the recipe-derived class wins, D-02). A
    // learned recipe is recipe-backed (BRDTH-03) -> a confident invocable hit.
    var doc = {
      slug: slug,
      service: desc.service || '',
      intentSynonyms: desc.intentSynonyms || [],
      description: desc.description || '',
      actionVerb: desc.actionVerb || '',
      sideEffectClass: (recipe.method ? deriveSideEffect(recipe.method) : normalizeSideEffectClass(desc.sideEffectClass)),
      backing: 'recipe'
    };

    // Re-promotion safety: discard any existing doc with this slug before add so
    // MiniSearch does not throw on a duplicate id.
    try { _ms.discard(slug); } catch (e) { /* not present -> nothing to discard */ }
    try { _ms.add(doc); } catch (e) { return false; }

    // Wire the slug -> recipe map (getRecipeBySlug + schema-on-hit params).
    _slugToRecipe[slug] = recipe;

    // Track the learned descriptor so the re-snapshot version reflects the grown
    // catalog; bump the strictly monotonic learned-add counter unconditionally.
    _learnedDescriptors.push({ slug: slug });
    _learnedAddSeq += 1;

    // Re-persist the snapshot with a BUMPED '+learnedN' catalogVersion (D-14 /
    // HI-01) -- see _persistLearnedSnapshot for the base-prefix invalidation rule.
    await _persistLearnedSnapshot();
    return true;
  }

  // ---- Re-persist the snapshot with a BUMPED '+learnedN' catalogVersion --------
  //
  // Shared by addLearnedRecipe and removeLearnedRecipe (LO-01). The stored version
  // is the BASE-catalog version (computed over cat.descriptors ONLY -- the exact
  // input buildOrRestore recomputes on restart) plus a '+learnedN' suffix, so the
  // prefix-tolerant restore re-attaches the persisted index (which carries the
  // current learned docs) and a base-catalog change still invalidates it (HI-01).
  // Best-effort: a missing chrome.storage.local skips only the persist.
  async function _persistLearnedSnapshot() {
    var c = _getChrome();
    if (!(c && c.storage && c.storage.local && _ms)) { return; }
    try {
      var cat = _getCatalog();
      var baseDescriptors = (cat.descriptors || []);
      var baseRecipes = (cat.recipes || []);
      var bumped = _computeCatalogVersion(baseDescriptors, baseRecipes, cat.version)
        + '+learned' + _learnedAddSeq;
      var payload = {};
      payload[STORAGE_KEY] = { catalogVersion: bumped, index: _ms.toJSON() };
      await c.storage.local.set(payload);
    } catch (e) { /* best-effort snapshot -- the in-memory index is already updated */ }
  }

  // ---- LO-01: drop an evicted learned slug from the index (store/index parity) -
  //
  // removeLearnedRecipe(slug) is the inverse of addLearnedRecipe. The learned store
  // LRU-evicts the oldest slug past its per-origin cap (learned-recipe-store.promote
  // -> _evictOldestIfOverCap); without a matching index drop the evicted slug stayed
  // a DEAD search() hit (resolve() -> getLearnedSync null -> RECIPE_NOT_FOUND). This
  // discards the doc from the ONE _ms instance, drops the slug -> recipe map entry,
  // bumps the monotonic learned-add counter, and re-persists the snapshot so the
  // removal survives an SW restart. Idempotent + no-op-safe: an unknown slug, an
  // absent index, or an absent MiniSearch all degrade to false without throwing.
  async function removeLearnedRecipe(slug) {
    if (typeof slug !== 'string' || !slug) { return false; }
    if (!_ms) { return false; }   // nothing built -> nothing to remove
    var removed = false;
    try { _ms.discard(slug); removed = true; } catch (e) { /* not present -> nothing to discard */ }
    if (Object.prototype.hasOwnProperty.call(_slugToRecipe, slug)) {
      delete _slugToRecipe[slug];
      removed = true;
    }
    // Drop the tracked learned descriptor (best-effort; bookkeeping only).
    _learnedDescriptors = _learnedDescriptors.filter(function(d) { return d && d.slug !== slug; });
    // Bump the monotonic counter so the re-persisted version differs from the prior
    // snapshot (a removal is a catalog change too).
    _learnedAddSeq += 1;
    await _persistLearnedSnapshot();
    return removed;
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ------
  var exportsObj = {
    buildOrRestore: buildOrRestore,
    buildIndex: buildIndex,
    search: search,
    getRecipeBySlug: getRecipeBySlug,
    addLearnedRecipe: addLearnedRecipe,
    removeLearnedRecipe: removeLearnedRecipe,
    deriveSideEffect: deriveSideEffect,
    INDEX_OPTIONS: INDEX_OPTIONS
  };

  global.FsbCapabilitySearch = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
