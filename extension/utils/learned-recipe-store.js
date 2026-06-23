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

  // ---- _evictOldestIfOverCap(perOrigin) ------------------------------------
  // LRU (D-16): if the per-origin slug count EXCEEDS PER_ORIGIN_CAP, delete the slug
  // whose entry has the OLDEST lastSuccessAt (the least-recently-succeeded recipe).
  // Mutates the passed-in null-proto map in place.
  function _evictOldestIfOverCap(perOrigin) {
    var slugs = Object.keys(perOrigin);
    if (slugs.length <= PER_ORIGIN_CAP) { return; }
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
      _evictOldestIfOverCap(perOrigin);

      recipes[origin] = perOrigin;
      envelope.recipes = recipes;
      await _write(envelope);
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
    });
  }

  // ---- _reset() -- test hook ------------------------------------------------
  // Clears the persisted envelope so a test starts empty. Best-effort.
  function _reset() {
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
    promote: promote,
    quarantine: quarantine,
    _reset: _reset
  };

  global.FsbLearnedRecipeStore = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;               // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
