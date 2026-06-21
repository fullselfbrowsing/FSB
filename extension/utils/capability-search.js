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
    storeFields: ['slug', 'service', 'sideEffectClass', 'description']   // returned on hit
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

  var _ms = null;          // MiniSearch instance
  var _slugToRecipe = {};  // slug -> recipe (invoke lookup + schema-on-hit params)

  // ---- D-02: derive sideEffectClass from the recipe method -------------------
  function deriveSideEffect(method) {
    var m = String(method || '').toUpperCase();
    if (m === 'DELETE') return 'destructive';
    if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'mutate';
    return 'read'; // GET / HEAD / unknown
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
        sideEffectClass: derived || d.sideEffectClass || 'read'
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

    // slug -> recipe map (invoke lookup + schema-on-hit params)
    _slugToRecipe = {};
    (cat.recipes || []).forEach(function(r) { if (r && r.id) _slugToRecipe[r.id] = r; });

    // catalogVersion stamp: a content hash over the descriptor slugs + recipe
    // count is robust against same-count edits (Assumption A5).
    var catalogVersion = _computeCatalogVersion(descriptors, cat.recipes || [], cat.version);

    var c = _getChrome();
    // 1. Restore from snapshot when the version matches.
    if (c && c.storage && c.storage.local) {
      try {
        var stored = await c.storage.local.get(STORAGE_KEY);
        var snap = stored && stored[STORAGE_KEY];
        if (snap && snap.catalogVersion === catalogVersion && snap.index) {
          // loadJSON wants a JSON string and the SAME options used at serialize.
          _ms = MS.loadJSON(JSON.stringify(snap.index), INDEX_OPTIONS);
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
      return {
        slug: h.slug,
        service: h.service,
        sideEffectClass: h.sideEffectClass,
        description: h.description,
        score: h.score,
        params: recipe.params || null // schema-on-hit (D-08)
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

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ------
  var exportsObj = {
    buildOrRestore: buildOrRestore,
    buildIndex: buildIndex,
    search: search,
    getRecipeBySlug: getRecipeBySlug,
    deriveSideEffect: deriveSideEffect,
    INDEX_OPTIONS: INDEX_OPTIONS
  };

  global.FsbCapabilitySearch = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
