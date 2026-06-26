(function(global) {
  'use strict';

  /**
   * Phase 31 plan 03 (v0.9.99 -- LEARN-02 / D-13 / D-16) -- learned-recipe-store.js
   *
   * The NEW per-origin learned-recipe store: a versioned chrome.storage.local
   * envelope keyed by origin + slug, DISTINCT from the 500-cap procedural memory
   * layer (D-13 -- learned recipes do not compete with semantic/task memories, and
   * the router gets per-origin fast lookup). It mirrors the consent-policy-store.js /
   * audit-log.js versioned-envelope idiom (lazy chrome accessor, { v, ... } payload,
   * a promise-chain mutex, a null-proto per-key map so a __proto__/constructor/
   * prototype origin or slug survives the round-trip as own data).
   *
   * Stored shape -- request SHAPE only (LEARN-02). The slot carries the synthesized
   * recipe core (method, path-template, header names via the recipe, csrf-source,
   * extract '@', origin), the paired descriptor, and bookkeeping (capturedAt,
   * lastSuccessAt, successCount, quarantined). NEVER a response body or PII -- the
   * synthesizer + capture-time redactor guarantee the recipe is shape-only before it
   * ever reaches this store.
   *
   * Envelope:
   *   { v: 1, recipes: { [origin]: { [slug]: { recipe, descriptor, capturedAt,
   *                                            lastSuccessAt, successCount,
   *                                            quarantined } } } }
   *
   * Bounding (D-16):
   *   - PER_ORIGIN_CAP + LRU by lastSuccessAt: promoting past the cap evicts the
   *     entry with the OLDEST lastSuccessAt (the least-recently-succeeded recipe).
   *   - quarantine(slug, origin) FLAGS quarantined:true -- it does NOT delete the
   *     entry (Phase 32 heals a quarantined/rotted recipe). getLearned then returns
   *     null for it (demoted from routing).
   *
   * Hard origin scope (Pitfall 6): getLearned(slug, origin) returns a learned recipe
   * ONLY when it lives under that origin AND entry.recipe.origin === origin -- a
   * learned recipe for origin A is NEVER surfaced for origin B (the executeBoundSpec
   * origin-pin is the downstream backstop, but the store does not surface a cross-
   * origin recipe in the first place).
   *
   * Module shell: the dual-export IIFE mirror of consent-policy-store.js. The SW
   * reads global.FsbLearnedRecipeStore after importScripts; Node tests require() the
   * module.exports.
   *
   * Wall-1: this module is on RECIPE_PATH_ALLOWLIST (Plan 01 pre-arm) because a
   * promoted learned recipe is read back by the catalog and BOUND / EXECUTED on the
   * T2 path -- so it is kept dynamic-code-FREE (no run-string-as-code / function-
   * from-string / dynamic module loader constructs, even in comments; the recipe-
   * path CI guard scans comments).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Constants -----------------------------------------------------------
  //
  // STORAGE_KEY is verified DISTINCT from fsbCapabilityIndex (search) /
  // fsbConsentPolicies (consent) / the memory-layer keys -- a new, non-colliding key.
  var STORAGE_KEY = 'fsbLearnedRecipes';
  var PAYLOAD_VERSION = 1;
  // Per-origin LRU cap (Open Q2 -- Claude's discretion). Small + bounded: generous
  // for a single site's API surface, bounded enough to keep chrome.storage.local
  // small. Tunable later as real captures are observed.
  var PER_ORIGIN_CAP = 24;

  // ---- lazy chrome accessor (consent-policy-store.js idiom) -----------------
  // Referenced lazily so the module loads cleanly under a Node test harness where
  // chrome is mocked AFTER module load. Errors swallow to a null/no-op posture.
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  // ---- lazy capability-search accessor (LO-01) ------------------------------
  // typeof-guarded so the store loads cleanly under a Node test harness where the
  // search module may be absent (the store suite loads this module alone). Used
  // ONLY to drop an LRU-evicted slug from the search index so store and index stay
  // in parity (an evicted slug must not linger as a dead search() hit). Degrades to
  // null -> the eviction-index-drop is simply skipped (the next SW-restart restore
  // would rebuild from the post-eviction snapshot anyway).
  function _search() {
    return (typeof globalThis !== 'undefined' && globalThis.FsbCapabilitySearch)
      ? globalThis.FsbCapabilitySearch
      : (typeof FsbCapabilitySearch !== 'undefined' ? FsbCapabilitySearch : null);
  }

  function _hasLocalStorage() {
    var c = _getChrome();
    return !!(c && c.storage && c.storage.local
      && typeof c.storage.local.get === 'function'
      && typeof c.storage.local.set === 'function');
  }

  // ---- promise-chain mutex (consent-policy-store.js _withPolicyLock idiom) ---
  // Module-scope; the single-threaded MV3 service worker means one chain serializes
  // all mutating ops. The .then(fn, fn) shape runs the next handler whether the
  // prior fulfilled or rejected, so one throw does not poison the chain. The .catch
  // on assignment keeps the chain from ever holding a rejected promise.
  var _storeChain = Promise.resolve();
  function _withLock(fn) {
    var next = _storeChain.then(fn, fn);
    _storeChain = next.catch(function() { /* swallow so the chain continues */ });
    return next;
  }

  // ---- SYNCHRONOUS in-memory mirror (Phase 31 plan 06 -- closes the 31-05 gap) --
  //
  // capability-catalog.js resolve() is SYNCHRONOUS (the router reads the resolved
  // recipe immediately), so a learned recipe can only be surfaced inside resolve via
  // a synchronous read. The async getLearned() (the storage-truth read) cannot. This
  // mirror is the synchronous source the catalog's _getLearned reads via
  // getLearnedSync(slug, origin): an in-memory map hydrated from chrome.storage.local
  // at service-worker startup (hydrateSyncCache) and kept in lock-step with
  // promote()/quarantine(). Without it, _getLearned returns null in production and
  // LEARN-04 outranking only fires in the test stub -- this lights it up at runtime.
  //
  // Shape mirrors the persisted envelope's recipes map but stores ONLY what
  // getLearnedSync returns plus the quarantine flag (no bookkeeping needed for a
  // read): _syncMirror[origin][slug] = { recipe, descriptor, quarantined }. Null-proto
  // at both levels (ME-03) so a __proto__ origin/slug survives as own data.
  var _syncMirror = null;   // lazily created on first hydrate/update

  function _syncMirrorMap() {
    if (!_syncMirror) { _syncMirror = Object.create(null); }
    return _syncMirror;
  }

  // ---- null-proto maps (consent-policy-store.js ME-03 idiom) ----------------
  // A prototype-shaped key (__proto__ / constructor / prototype) round-trips as
  // plain OWN data instead of silently vanishing or hitting the prototype chain.
  function _nullProto() {
    return Object.create(null);
  }

  // Copy any persisted/raw object onto a null-proto map by OWN keys. A non-object
  // input degrades to an empty map.
  function _toNullProto(raw) {
    var out = _nullProto();
    if (raw && typeof raw === 'object') {
      for (var k in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, k)) {
          out[k] = raw[k];
        }
      }
    }
    return out;
  }

  // Rehome the persisted recipes map: a null-proto top-level origin map whose each
  // per-origin value is ALSO a null-proto slug map (so a __proto__ origin AND a
  // __proto__ slug both survive as own data).
  function _toNullProtoRecipes(rawRecipes) {
    var out = _nullProto();
    if (rawRecipes && typeof rawRecipes === 'object') {
      for (var origin in rawRecipes) {
        if (Object.prototype.hasOwnProperty.call(rawRecipes, origin)) {
          out[origin] = _toNullProto(rawRecipes[origin]);
        }
      }
    }
    return out;
  }

  function _defaultEnvelope() {
    return { v: PAYLOAD_VERSION, recipes: _nullProto() };
  }

  // ---- sync-mirror writers (kept in lock-step with promote/quarantine) -------
  // _mirrorSet records (or refreshes) a slot in the sync mirror; _mirrorQuarantine
  // flips the flag; _mirrorDelete removes an evicted slot so getLearnedSync never
  // returns an LRU-evicted recipe. All are null-safe + null-proto.
  function _mirrorSet(origin, slug, recipe, descriptor, quarantined) {
    if (typeof origin !== 'string' || typeof slug !== 'string') { return; }
    var map = _syncMirrorMap();
    if (!map[origin] || typeof map[origin] !== 'object') { map[origin] = _nullProto(); }
    map[origin][slug] = {
      recipe: recipe,
      descriptor: (descriptor !== undefined ? descriptor : null),
      quarantined: quarantined === true
    };
  }
  function _mirrorQuarantine(origin, slug) {
    if (typeof origin !== 'string' || typeof slug !== 'string') { return; }
    var map = _syncMirrorMap();
    if (map[origin] && typeof map[origin] === 'object'
      && Object.prototype.hasOwnProperty.call(map[origin], slug)
      && map[origin][slug] && typeof map[origin][slug] === 'object') {
      map[origin][slug].quarantined = true;
    }
  }
  function _mirrorDelete(origin, slug) {
    if (typeof origin !== 'string' || typeof slug !== 'string') { return; }
    var map = _syncMirrorMap();
    if (map[origin] && typeof map[origin] === 'object'
      && Object.prototype.hasOwnProperty.call(map[origin], slug)) {
      delete map[origin][slug];
    }
  }
  // Rebuild the entire sync mirror from a persisted envelope (hydration at startup).
  function _mirrorRebuildFrom(envelope) {
    var fresh = Object.create(null);
    var recipes = envelope && envelope.recipes;
    if (recipes && typeof recipes === 'object') {
      for (var origin in recipes) {
        if (!Object.prototype.hasOwnProperty.call(recipes, origin)) { continue; }
        var perOrigin = recipes[origin];
        if (!perOrigin || typeof perOrigin !== 'object') { continue; }
        var freshPer = Object.create(null);
        for (var slug in perOrigin) {
          if (!Object.prototype.hasOwnProperty.call(perOrigin, slug)) { continue; }
          var entry = perOrigin[slug];
          if (!entry || typeof entry !== 'object' || !entry.recipe) { continue; }
          freshPer[slug] = {
            recipe: entry.recipe,
            descriptor: (entry.descriptor !== undefined ? entry.descriptor : null),
            quarantined: entry.quarantined === true
          };
        }
        fresh[origin] = freshPer;
      }
    }
    _syncMirror = fresh;
  }

  // ---- readAll() -> Promise<envelope> --------------------------------------
  // Reads the versioned envelope. Null-safe: an absent key, a malformed payload, a
  // version mismatch, or a missing recipes map all DEGRADE to a fresh default.
  // chrome absent (Node without the storage stub) -> a fresh default envelope.
  function readAll() {
    if (!_hasLocalStorage()) {
      return Promise.resolve(_defaultEnvelope());
    }
    var c = _getChrome();
    return new Promise(function(resolve) {
      try {
        c.storage.local.get([STORAGE_KEY], function(stored) {
          var payload = stored ? stored[STORAGE_KEY] : null;
          if (!payload || typeof payload !== 'object'
            || payload.v !== PAYLOAD_VERSION
            || !payload.recipes || typeof payload.recipes !== 'object') {
            resolve(_defaultEnvelope());
            return;
          }
          resolve({
            v: PAYLOAD_VERSION,
            // ME-03: rehome onto null-proto maps so a stored __proto__ origin/slug
            // survives as own data.
            recipes: _toNullProtoRecipes(payload.recipes)
          });
        });
      } catch (_e) {
        resolve(_defaultEnvelope());
      }
    });
  }

  // ---- _write(envelope) -> Promise<void> -----------------------------------
  // Persists the envelope. chrome absent -> a resolved no-op.
  function _write(envelope) {
    if (!_hasLocalStorage()) {
      return Promise.resolve();
    }
    var c = _getChrome();
    return new Promise(function(resolve) {
      try {
        var update = {};
        update[STORAGE_KEY] = {
          v: PAYLOAD_VERSION,
          recipes: (envelope && envelope.recipes && typeof envelope.recipes === 'object')
            ? envelope.recipes : {}
        };
        c.storage.local.set(update, function() {
          // chrome.runtime.lastError is best-effort; no throw, no log spam.
          resolve();
        });
      } catch (_e) {
        resolve();
      }
    });
  }

  // ---- getLearned(slug, origin) -> Promise<{recipe, descriptor} | null> -----
  // Returns the learned entry ONLY when: the per-origin map exists, the slug entry
  // exists, it is NOT quarantined, AND entry.recipe.origin === origin (HARD origin
  // scope, Pitfall 6). Otherwise null. Async over the storage truth.
  function getLearned(slug, origin) {
    return readAll().then(function(envelope) {
      if (typeof slug !== 'string' || typeof origin !== 'string') { return null; }
      var recipes = envelope && envelope.recipes;
      if (!recipes || typeof recipes !== 'object') { return null; }
      if (!Object.prototype.hasOwnProperty.call(recipes, origin)) { return null; }
      var perOrigin = recipes[origin];
      if (!perOrigin || typeof perOrigin !== 'object'
        || !Object.prototype.hasOwnProperty.call(perOrigin, slug)) {
        return null;
      }
      var entry = perOrigin[slug];
      if (!entry || typeof entry !== 'object') { return null; }
      if (entry.quarantined === true) { return null; }   // demoted from routing (D-16)
      // HARD origin scope: the stored recipe must declare THIS origin.
      if (!entry.recipe || entry.recipe.origin !== origin) { return null; }
      return { recipe: entry.recipe, descriptor: (entry.descriptor !== undefined ? entry.descriptor : null) };
    });
  }

  // ---- getLearnedSync(slug, origin) -> {recipe, descriptor} | null (Plan 06) --
  // The SYNCHRONOUS read off the in-memory mirror that capability-catalog.js
  // _getLearned calls inside the synchronous resolve(). SAME hard-scope + quarantine
  // semantics as the async getLearned: returns a learned entry ONLY when the
  // per-origin map exists, the slug exists, it is NOT quarantined, AND
  // entry.recipe.origin === origin (Pitfall 6). An un-hydrated / empty mirror returns
  // null (resolve falls through to the REGISTRY, the Phase-29 behavior). NEVER throws
  // -- a malformed mirror degrades to null.
  function getLearnedSync(slug, origin) {
    try {
      if (typeof slug !== 'string' || typeof origin !== 'string') { return null; }
      var map = _syncMirror;
      if (!map || typeof map !== 'object') { return null; }
      if (!Object.prototype.hasOwnProperty.call(map, origin)) { return null; }
      var perOrigin = map[origin];
      if (!perOrigin || typeof perOrigin !== 'object'
        || !Object.prototype.hasOwnProperty.call(perOrigin, slug)) {
        return null;
      }
      var entry = perOrigin[slug];
      if (!entry || typeof entry !== 'object') { return null; }
      if (entry.quarantined === true) { return null; }          // demoted from routing (D-16)
      if (!entry.recipe || entry.recipe.origin !== origin) { return null; }   // hard origin scope
      return { recipe: entry.recipe, descriptor: (entry.descriptor !== undefined ? entry.descriptor : null) };
    } catch (_e) {
      return null;
    }
  }

  // ---- hydrateSyncCache() -> Promise<void> (Plan 06 -- SW-startup hydration) --
  // Reads the persisted envelope ONCE and rebuilds the in-memory sync mirror so
  // getLearnedSync surfaces learned recipes that were promoted in a PRIOR service-
  // worker lifetime. Called from background.js at startup (additive importScripts +
  // a non-blocking hydrate, the buildOrRestore precedent). Best-effort: a read
  // failure leaves the mirror empty (getLearnedSync returns null until the next
  // promote populates it). Serialized through the same lock so a concurrent promote
  // does not race the rebuild.
  function hydrateSyncCache() {
    return _withLock(async function() {
      var envelope = await readAll();
      _mirrorRebuildFrom(envelope);
    });
  }

  // ---- _evictOldestIfOverCap(perOrigin) ------------------------------------
  // LRU (D-16): if the per-origin slug count EXCEEDS PER_ORIGIN_CAP, delete the slug
  // whose entry has the OLDEST lastSuccessAt (the least-recently-succeeded recipe).
  // Mutates the passed-in null-proto map in place.
  function _evictOldestIfOverCap(perOrigin) {
    var slugs = Object.keys(perOrigin);
    if (slugs.length <= PER_ORIGIN_CAP) { return null; }
    var oldestSlug = null;
    var oldestAt = Infinity;
    for (var i = 0; i < slugs.length; i++) {
      var entry = perOrigin[slugs[i]];
      var at = (entry && typeof entry.lastSuccessAt === 'number') ? entry.lastSuccessAt : 0;
      if (at < oldestAt) {
        oldestAt = at;
        oldestSlug = slugs[i];
      }
    }
    if (oldestSlug !== null) {
      delete perOrigin[oldestSlug];
    }
    return oldestSlug;   // the evicted slug (so the caller can mirror the eviction), or null
  }

  // ---- promote(origin, recipe, descriptor, opts) -> Promise<void> ----------
  // Stores (or refreshes) a learned recipe under recipes[origin][recipe.id]. On an
  // existing slot, bumps successCount + lastSuccessAt (re-promotion after another
  // clean replay). LRU-evicts the oldest lastSuccessAt if the per-origin count now
  // exceeds PER_ORIGIN_CAP (D-16). opts.lastSuccessAt (and opts.capturedAt), when
  // provided, override the timestamp -- used by the test to drive deterministic LRU
  // ordering; production omits opts and uses Date.now().
  function promote(origin, recipe, descriptor, opts) {
    if (typeof origin !== 'string' || !origin || !recipe || typeof recipe !== 'object'
      || typeof recipe.id !== 'string' || !recipe.id) {
      return Promise.resolve();
    }
    return _withLock(async function() {
      var envelope = await readAll();
      // null-proto top-level map (ME-03) so a __proto__ origin assigns as own key.
      var recipes = _toNullProtoRecipes(envelope.recipes);
      var perOrigin = (Object.prototype.hasOwnProperty.call(recipes, origin)
        && recipes[origin] && typeof recipes[origin] === 'object')
        ? _toNullProto(recipes[origin])
        : _nullProto();

      var now = Date.now();
      var ts = (opts && typeof opts.lastSuccessAt === 'number') ? opts.lastSuccessAt : now;
      var capturedAt = (opts && typeof opts.capturedAt === 'number') ? opts.capturedAt : now;

      var slug = recipe.id;
      if (Object.prototype.hasOwnProperty.call(perOrigin, slug)
        && perOrigin[slug] && typeof perOrigin[slug] === 'object') {
        // Re-promotion: bump bookkeeping, refresh the recipe/descriptor, un-flag is
        // NOT done here (a re-promoted recipe stays whatever it was; quarantine is a
        // separate explicit op).
        var existing = perOrigin[slug];
        perOrigin[slug] = {
          recipe: recipe,
          descriptor: (descriptor !== undefined ? descriptor : (existing.descriptor !== undefined ? existing.descriptor : null)),
          capturedAt: (typeof existing.capturedAt === 'number') ? existing.capturedAt : capturedAt,
          lastSuccessAt: ts,
          successCount: (typeof existing.successCount === 'number' ? existing.successCount : 0) + 1,
          quarantined: existing.quarantined === true ? true : false
        };
      } else {
        perOrigin[slug] = {
          recipe: recipe,
          descriptor: (descriptor !== undefined ? descriptor : null),
          capturedAt: capturedAt,
          lastSuccessAt: ts,
          successCount: 1,
          quarantined: false
        };
      }

      // LRU eviction past the per-origin cap (D-16).
      var evictedSlug = _evictOldestIfOverCap(perOrigin);

      recipes[origin] = perOrigin;
      envelope.recipes = recipes;
      await _write(envelope);

      // Keep the synchronous mirror in lock-step (Plan 06): record the promoted slot
      // and drop the evicted slug so getLearnedSync reflects the same set the storage
      // truth holds. The slot's quarantined flag is preserved off the persisted slot.
      _mirrorSet(origin, slug, recipe,
        (perOrigin[slug] && perOrigin[slug].descriptor !== undefined ? perOrigin[slug].descriptor : descriptor),
        perOrigin[slug] && perOrigin[slug].quarantined === true);
      if (evictedSlug) {
        _mirrorDelete(origin, evictedSlug);
        // LO-01: drop the evicted slug from the capability search index too, so it
        // stops being a dead search() hit (resolve() -> getLearnedSync null ->
        // RECIPE_NOT_FOUND). Best-effort + fire-and-forget: a failure here never
        // undoes the promotion (the store write already committed) and the index is
        // self-healing on the next SW-restart snapshot restore. Guarded so a missing
        // search module (Node store suite) is a silent no-op.
        var search = _search();
        if (search && typeof search.removeLearnedRecipe === 'function') {
          try {
            Promise.resolve(search.removeLearnedRecipe(evictedSlug)).catch(function() { /* best-effort */ });
          } catch (_idxErr) { /* best-effort -- store/index parity is non-critical */ }
        }
      }
    });
  }

  // ---- quarantine(slug, origin) -> Promise<void> ---------------------------
  // FLAGS the entry quarantined:true (does NOT delete -- Phase 32 heals it, D-16).
  // A no-op if the entry does not exist.
  function quarantine(slug, origin) {
    if (typeof slug !== 'string' || typeof origin !== 'string') {
      return Promise.resolve();
    }
    return _withLock(async function() {
      var envelope = await readAll();
      var recipes = _toNullProtoRecipes(envelope.recipes);
      if (!Object.prototype.hasOwnProperty.call(recipes, origin)) { return; }
      var perOrigin = _toNullProto(recipes[origin]);
      if (!Object.prototype.hasOwnProperty.call(perOrigin, slug)
        || !perOrigin[slug] || typeof perOrigin[slug] !== 'object') {
        return;
      }
      perOrigin[slug].quarantined = true;   // demote from routing; keep for Phase 32
      recipes[origin] = perOrigin;
      envelope.recipes = recipes;
      await _write(envelope);

      // Mirror the demotion synchronously so getLearnedSync stops surfacing it (D-16).
      _mirrorQuarantine(origin, slug);
    });
  }

  // ===========================================================================
  // SCALE-02 (Phase 43 plan 03) -- ADDITIVE recurrence counter + degraded accessor.
  // PURELY ADDITIVE: the envelope/cap/LRU/quarantine/getLearnedSync/promote contract
  // above is byte-unchanged. The recurrence counter layers ON TOP of the UNCHANGED
  // capability-rot-detector classifyRecipeBroken verdict (it consumes the verdict, never
  // edits the taxonomy). getOriginHealth reads the SAME synchronous _syncMirror
  // getLearnedSync uses. Both are bounded + null-proto, mirroring the store discipline.
  // ===========================================================================

  // The recurrence threshold (D-16-style constant): repeated rot on ONE (origin,slug)
  // reaching this count classifies SYSTEMIC (the site changed -> escalate); below it is
  // TRANSIENT (a one-off blip -> retry).
  var RECURRENCE_SYSTEMIC_THRESHOLD = 3;
  // The recurrence store is BOUNDED (never unbounded): cap the tracked origins, evicting
  // the least-recently-touched past the cap. Reuses the PER_ORIGIN_CAP discipline value.
  var RECURRENCE_CAP = PER_ORIGIN_CAP;

  // In-memory bounded per-(origin,slug) recurrence map. Null-proto at BOTH levels (the
  // _syncMirror ME-03 discipline) so a __proto__ origin/slug survives as own data. Each
  // leaf is { count, touchedAt } (touchedAt drives LRU eviction past RECURRENCE_CAP).
  // In-memory (like _syncMirror): a fresh SW start re-accumulates -- the conservative
  // direction (a restart does not carry a stale systemic verdict).
  var _recurrence = null;

  function _recurrenceMap() {
    if (!_recurrence) { _recurrence = Object.create(null); }
    return _recurrence;
  }

  // LRU eviction past RECURRENCE_CAP: drop the origin with the oldest touchedAt.
  function _evictRecurrenceIfOverCap(exceptOrigin) {
    var map = _recurrenceMap();
    var keys = Object.keys(map);
    if (keys.length <= RECURRENCE_CAP) { return; }
    var oldestKey = null;
    var oldestAt = Infinity;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === exceptOrigin) { continue; }
      var per = map[keys[i]];
      var at = (per && typeof per._touchedAt === 'number') ? per._touchedAt : 0;
      if (at < oldestAt) { oldestAt = at; oldestKey = keys[i]; }
    }
    if (oldestKey !== null) { delete map[oldestKey]; }
  }

  // ---- recordRot(origin, slug) -- the broken-only recurrence increment -------
  // Increments the per-(origin,slug) recurrence count. The DOCUMENTED broken-only entry:
  // the caller invokes it ONLY for a broken:true classifyRecipeBroken verdict (a typed
  // RECIPE_* security passthrough is broken:false and MUST NOT be counted -- T-32-PASS).
  // String-typed guards: a no-op on non-string args (never throws).
  function recordRot(origin, slug) {
    if (typeof origin !== 'string' || !origin || typeof slug !== 'string' || !slug) { return; }
    var map = _recurrenceMap();
    if (!map[origin] || typeof map[origin] !== 'object') { map[origin] = Object.create(null); }
    var per = map[origin];
    var leaf = per[slug];
    if (!leaf || typeof leaf !== 'object') { leaf = { count: 0 }; per[slug] = leaf; }
    leaf.count = (typeof leaf.count === 'number' ? leaf.count : 0) + 1;
    per._touchedAt = Date.now();
    _evictRecurrenceIfOverCap(origin);
  }

  // ---- recordOk(origin, slug) -- reset-on-success ---------------------------
  // A NON-broken (ok) outcome RESETS the (origin,slug) recurrence count -- a recovered op
  // stops trending systemic. No-op on non-string args / an unseen pair.
  function recordOk(origin, slug) {
    if (typeof origin !== 'string' || typeof slug !== 'string') { return; }
    var map = _recurrence;
    if (!map || !Object.prototype.hasOwnProperty.call(map, origin)) { return; }
    var per = map[origin];
    if (per && Object.prototype.hasOwnProperty.call(per, slug)) {
      delete per[slug];
    }
  }

  // ---- dispositionFor(origin, slug) -- transient vs systemic ----------------
  // Returns 'systemic' when the (origin,slug) recurrence count >= the threshold, else
  // 'transient' (including an unseen pair / count 0). Never throws.
  function dispositionFor(origin, slug) {
    try {
      if (typeof origin !== 'string' || typeof slug !== 'string') { return 'transient'; }
      var map = _recurrence;
      if (!map || !Object.prototype.hasOwnProperty.call(map, origin)) { return 'transient'; }
      var per = map[origin];
      if (!per || !Object.prototype.hasOwnProperty.call(per, slug)) { return 'transient'; }
      var leaf = per[slug];
      var count = (leaf && typeof leaf.count === 'number') ? leaf.count : 0;
      return count >= RECURRENCE_SYSTEMIC_THRESHOLD ? 'systemic' : 'transient';
    } catch (_e) {
      return 'transient';
    }
  }

  // ---- recurrenceTrackedCount() -- the bound assertion accessor -------------
  function recurrenceTrackedCount() {
    return _recurrence ? Object.keys(_recurrence).length : 0;
  }

  // ---- getOriginHealth(origin) -- the ADDITIVE degraded/needs-re-port accessor --
  // Reads the SYNCHRONOUS _syncMirror (the SAME source getLearnedSync uses): an origin
  // with AT LEAST ONE live, non-quarantined learned recipe is healthy
  // ({ degraded:false, status:'ok', origin }); an origin whose learned recipes are ALL
  // quarantined (or whose recurrence crossed systemic for a learned slug) is degraded
  // ({ degraded:true, status:'needs-re-port', origin }). An unknown / un-hydrated origin
  // returns a defined healthy default (degraded:false) -- absence is not failure. Never
  // throws (a malformed mirror degrades to the healthy default). The degraded state is
  // VISIBLE (retrievable + truthful) so a user/agent SEES "this app needs re-learning"
  // instead of a silent miss.
  function getOriginHealth(origin) {
    var healthy = { degraded: false, status: 'ok', origin: (typeof origin === 'string' ? origin : '') };
    try {
      if (typeof origin !== 'string' || !origin) { return healthy; }
      var map = _syncMirror;
      if (!map || typeof map !== 'object'
        || !Object.prototype.hasOwnProperty.call(map, origin)) {
        return healthy; // un-hydrated / unknown origin -> defined healthy default
      }
      var perOrigin = map[origin];
      if (!perOrigin || typeof perOrigin !== 'object') { return healthy; }
      var slugs = Object.keys(perOrigin);
      if (!slugs.length) { return healthy; } // no learned recipes -> healthy default
      var anyLive = false;
      var allQuarantined = true;
      for (var i = 0; i < slugs.length; i++) {
        var entry = perOrigin[slugs[i]];
        if (!entry || typeof entry !== 'object') { continue; }
        if (entry.quarantined === true) { continue; }
        // a live (non-quarantined) recipe whose recurrence has NOT crossed systemic
        // counts as healthy; a live recipe trending systemic is itself degraded surface.
        allQuarantined = false;
        if (dispositionFor(origin, slugs[i]) !== 'systemic') {
          anyLive = true;
        }
      }
      if (anyLive) { return healthy; }
      // ALL learned recipes are quarantined (or the only live ones crossed systemic) ->
      // the origin is degraded / needs re-port (VISIBLE, not a silent failure).
      if (allQuarantined || !anyLive) {
        return { degraded: true, status: 'needs-re-port', origin: origin };
      }
      return healthy;
    } catch (_e) {
      return healthy;
    }
  }

  // ---- _reset() -- test hook ------------------------------------------------
  // Clears the persisted envelope so a test starts empty. Best-effort. ALSO clears the
  // additive in-memory recurrence map (SCALE-02) so a fresh test starts empty.
  function _reset() {
    _syncMirror = null;   // drop the in-memory mirror so a fresh test starts empty
    _recurrence = null;   // SCALE-02: drop the recurrence map too
    if (!_hasLocalStorage()) {
      return Promise.resolve();
    }
    var c = _getChrome();
    return new Promise(function(resolve) {
      try {
        if (typeof c.storage.local.remove === 'function') {
          c.storage.local.remove(STORAGE_KEY, function() { resolve(); });
        } else {
          var update = {};
          update[STORAGE_KEY] = _defaultEnvelope();
          c.storage.local.set(update, function() { resolve(); });
        }
      } catch (_e) {
        resolve();
      }
    });
  }

  // ---- Export shape (dual-export IIFE; mirror consent-policy-store.js) -------
  var exportsObj = {
    STORAGE_KEY: STORAGE_KEY,
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    PER_ORIGIN_CAP: PER_ORIGIN_CAP,
    readAll: readAll,
    getLearned: getLearned,
    getLearnedSync: getLearnedSync,     // Plan 06: the SYNCHRONOUS catalog-resolve read
    hydrateSyncCache: hydrateSyncCache, // Plan 06: SW-startup mirror hydration
    promote: promote,
    quarantine: quarantine,
    // SCALE-02 (Phase 43 plan 03): ADDITIVE recurrence counter + degraded accessor.
    RECURRENCE_SYSTEMIC_THRESHOLD: RECURRENCE_SYSTEMIC_THRESHOLD,
    RECURRENCE_CAP: RECURRENCE_CAP,
    recordRot: recordRot,               // broken-only recurrence increment
    recordOk: recordOk,                 // reset-on-success
    dispositionFor: dispositionFor,     // 'transient' | 'systemic'
    recurrenceTrackedCount: recurrenceTrackedCount,
    getOriginHealth: getOriginHealth,   // degraded / needs-re-port surfacing
    _reset: _reset
  };

  global.FsbLearnedRecipeStore = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;               // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
