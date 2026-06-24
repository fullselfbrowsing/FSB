(function(global) {
  'use strict';

  /**
   * Phase 30 plan 02 (v0.9.99 -- GOV-01/GOV-02/GOV-03; D-02/D-04) --
   * consent-policy-store.js
   *
   * The per-origin consent policy spine. Owns the answer to "may a capability
   * run against THIS origin, and may it MUTATE there?" -- the credential-replay
   * safety baseline (D-01..D-04). The shipped default is OPT-OUT ("fully open"):
   * an origin with no stored record inherits the global defaultMode (shipped
   * 'auto'), so FSB may act on any non-denylisted origin unless the user opts it
   * OUT (per-origin Off) or reverts the global default. The global default lives
   * in the envelope's defaultMode field and is set via setDefaultMode (the
   * "Default for new sites" control) -- there is still no separate global enable
   * key, so the GOV-02 forbidden-key contract holds. The finance/gov service
   * denylist remains the one hard block; the per-origin mutating flag is retained
   * in storage but no longer enforced at the gate under 'auto' (GOV-03 relaxed).
   *
   * Storage: a versioned envelope persisted to chrome.storage.LOCAL (D-02 -- the
   * policy must survive SW restart AND browser restart, so NOT chrome.storage.
   * session). The envelope shape:
   *   { v:1, defaultMode:'auto', policies: { [origin]: { mode, mutating } } }
   *
   * The read/write helpers clone agent-registry.js:87-138 (lazy globalThis.chrome
   * accessor, swallow-to-null on error, remove-on-empty, v:1 envelope guard) but
   * over chrome.storage.local. Concurrent setters serialize through the
   * agent-registry withRegistryLock promise-chain mutex (RESEARCH Pitfall 7).
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js. The
   * service worker reads global.FsbConsentPolicyStore after importScripts; Node
   * tests require() the module.exports.
   *
   * Wall-1: this module is on RECIPE_PATH_ALLOWLIST (Plan 01 pre-arm) because the
   * Plan-02 consent gate reads it at the invoke chokepoint -- so it is kept
   * dynamic-code-FREE (no run-string-as-code / function-from-string / dynamic
   * module loader constructs, even in comments; the guard scans comments).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Constants -----------------------------------------------------------

  var STORAGE_KEY = 'fsbConsentPolicies';
  var PAYLOAD_VERSION = 1;
  var DEFAULT_MODE = 'auto';
  var VALID_MODES = { off: true, ask: true, auto: true };

  // ---- lazy chrome accessor (agent-registry.js:87-89 idiom) ----------------
  // Referenced lazily so the module loads cleanly under a Node test harness
  // where chrome is mocked AFTER module load. Errors swallow to a null/no-op
  // posture -- a storage hiccup must NEVER poison the SW boot path.
  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  function _hasLocalStorage() {
    var c = _getChrome();
    return !!(c && c.storage && c.storage.local
      && typeof c.storage.local.get === 'function'
      && typeof c.storage.local.set === 'function');
  }

  // ---- promise-chain mutex (agent-registry.js withRegistryLock idiom) -------
  // Module-scope; the single-threaded MV3 service worker means one chain
  // serializes all setters. The .then(fn, fn) shape runs the next handler
  // whether the prior fulfilled or rejected, so one throw does not poison the
  // chain. The .catch on assignment keeps _policyChain itself from ever holding
  // a rejected promise (which would leak to UnhandledRejection).
  var _policyChain = Promise.resolve();
  function _withPolicyLock(fn) {
    var next = _policyChain.then(fn, fn);
    _policyChain = next.catch(function() { /* swallow so the chain continues */ });
    return next;
  }

  // ---- a fresh default-OFF envelope ----------------------------------------
  // ME-03: the policies map is built on a NULL prototype so a prototype-shaped
  // origin key (__proto__ / constructor / prototype) round-trips as plain OWN
  // data instead of silently vanishing. On a normal {} object,
  // policies['__proto__'] = {...} sets the prototype rather than an own key, so
  // after a readPolicies round-trip that origin record DISAPPEARS. The
  // null-prototype map (the same idiom capability-interpreter.js:200 adopted for
  // this exact round-trip-drop class) makes every key a real own property; the
  // existing hasOwnProperty.call lookups stay correct, and JSON serialization of
  // an own __proto__ key survives the storage round-trip.
  function _emptyPolicies() {
    return Object.create(null);
  }

  // Copy any persisted/raw policies object onto a null-proto map by OWN keys, so
  // a stored __proto__ origin (which JSON.parse already places as an own key)
  // becomes a real own property on a map that also accepts future __proto__
  // assignments as own keys. A non-object input degrades to an empty map.
  function _toNullProtoPolicies(raw) {
    var out = _emptyPolicies();
    if (raw && typeof raw === 'object') {
      for (var k in raw) {
        if (Object.prototype.hasOwnProperty.call(raw, k)) {
          out[k] = raw[k];
        }
      }
    }
    return out;
  }

  function _defaultEnvelope() {
    return { v: PAYLOAD_VERSION, defaultMode: DEFAULT_MODE, policies: _emptyPolicies() };
  }

  // ---- readPolicies() -> Promise<envelope> ---------------------------------
  // Reads the versioned envelope from chrome.storage.local. Null-safe: an absent
  // key, a malformed payload, or a version mismatch all DEGRADE to a fresh
  // default-OFF envelope. chrome absent (Node) -> a default-OFF envelope.
  function readPolicies() {
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
            || !payload.policies || typeof payload.policies !== 'object') {
            resolve(_defaultEnvelope());
            return;
          }
          resolve({
            v: PAYLOAD_VERSION,
            defaultMode: (typeof payload.defaultMode === 'string') ? payload.defaultMode : DEFAULT_MODE,
            // ME-03: rehome the persisted policies onto a null-proto map so a
            // stored __proto__/constructor/prototype origin survives as own data.
            policies: _toNullProtoPolicies(payload.policies)
          });
        });
      } catch (_e) {
        resolve(_defaultEnvelope());
      }
    });
  }

  // ---- _writeEnvelope(envelope) -> Promise<void> ---------------------------
  // Persists the envelope. chrome absent -> a resolved no-op (the setter still
  // resolves without throwing per the Node contract).
  function _writeEnvelope(envelope) {
    if (!_hasLocalStorage()) {
      return Promise.resolve();
    }
    var c = _getChrome();
    return new Promise(function(resolve) {
      try {
        var update = {};
        update[STORAGE_KEY] = {
          v: PAYLOAD_VERSION,
          defaultMode: (envelope && typeof envelope.defaultMode === 'string') ? envelope.defaultMode : DEFAULT_MODE,
          policies: (envelope && envelope.policies && typeof envelope.policies === 'object') ? envelope.policies : {}
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

  // ---- getConsentForOrigin(envelope, origin) -> { mode, mutating } ----------
  // PURE. Falls back to envelope.defaultMode then the shipped DEFAULT_MODE for an
  // unknown origin, and false for mutating. The single source of truth for the
  // gate's per-origin decision (GOV-01/GOV-02/GOV-03).
  function getConsentForOrigin(envelope, origin) {
    var policies = (envelope && envelope.policies && typeof envelope.policies === 'object') ? envelope.policies : {};
    var p = (typeof origin === 'string' && Object.prototype.hasOwnProperty.call(policies, origin))
      ? policies[origin] : null;
    var fallbackMode = (envelope && typeof envelope.defaultMode === 'string') ? envelope.defaultMode : DEFAULT_MODE;
    return {
      mode: (p && typeof p.mode === 'string' && VALID_MODES[p.mode]) ? p.mode : fallbackMode,
      mutating: !!(p && p.mutating)
    };
  }

  // ---- setOriginMode(origin, mode) -> Promise<void> -------------------------
  // Validates mode against {off,ask,auto} and writes policies[origin].mode,
  // creating the per-origin record. Leaves the separate mutating flag untouched.
  // An invalid mode is a no-op (degrade, never throw).
  function setOriginMode(origin, mode) {
    if (typeof origin !== 'string' || !origin || !VALID_MODES[mode]) {
      return Promise.resolve();
    }
    return _withPolicyLock(async function() {
      var envelope = await readPolicies();
      // null-proto map (ME-03) so a __proto__ origin assigns as an own key, not
      // the prototype. _toNullProtoPolicies is idempotent on an already-null-proto
      // map and re-homes any stray normal object the read path produced.
      var policies = _toNullProtoPolicies(envelope.policies);
      var existing = (Object.prototype.hasOwnProperty.call(policies, origin)
        && policies[origin] && typeof policies[origin] === 'object') ? policies[origin] : {};
      policies[origin] = {
        mode: mode,
        mutating: !!existing.mutating
      };
      envelope.policies = policies;
      await _writeEnvelope(envelope);
    });
  }

  // ---- setOriginMutating(origin, allowed) -> Promise<void> ------------------
  // Writes policies[origin].mutating as a boolean WITHOUT touching mode (the
  // elevated opt-in is separate from read-Auto, D-04). Creates the per-origin
  // record (defaulting mode to the current default) if absent.
  function setOriginMutating(origin, allowed) {
    if (typeof origin !== 'string' || !origin) {
      return Promise.resolve();
    }
    return _withPolicyLock(async function() {
      var envelope = await readPolicies();
      // null-proto map (ME-03): a __proto__ origin assigns as an own key.
      var policies = _toNullProtoPolicies(envelope.policies);
      var existing = (Object.prototype.hasOwnProperty.call(policies, origin)
        && policies[origin] && typeof policies[origin] === 'object') ? policies[origin] : {};
      var fallbackMode = (typeof envelope.defaultMode === 'string') ? envelope.defaultMode : DEFAULT_MODE;
      policies[origin] = {
        mode: (typeof existing.mode === 'string' && VALID_MODES[existing.mode]) ? existing.mode : fallbackMode,
        mutating: !!allowed
      };
      envelope.policies = policies;
      await _writeEnvelope(envelope);
    });
  }

  // ---- setDefaultMode(mode) -> Promise<void> -------------------------------
  // Sets the GLOBAL default mode applied to any origin with no explicit per-origin
  // policy (the "Default for new sites" control). Validated against {off,ask,auto}.
  // Stored in the envelope's existing defaultMode field -- NOT a new global-enable
  // key, so the GOV-02 forbidden-key contract is unaffected. An invalid mode is a
  // no-op (degrade, never throw). Per-origin policies are left untouched, so an
  // origin the user explicitly set keeps its mode regardless of the global default.
  function setDefaultMode(mode) {
    if (!VALID_MODES[mode]) {
      return Promise.resolve();
    }
    return _withPolicyLock(async function() {
      var envelope = await readPolicies();
      var policies = _toNullProtoPolicies(envelope.policies);
      envelope.defaultMode = mode;
      envelope.policies = policies;
      await _writeEnvelope(envelope);
    });
  }

  // ---- _reset() -- test hook -----------------------------------------------
  // Clears the persisted envelope so each test starts at the shipped default. Best-effort.
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

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js) ----
  var exportsObj = {
    STORAGE_KEY: STORAGE_KEY,
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    getConsentForOrigin: getConsentForOrigin,
    readPolicies: readPolicies,
    setOriginMode: setOriginMode,
    setOriginMutating: setOriginMutating,
    setDefaultMode: setDefaultMode,
    _reset: _reset
  };

  global.FsbConsentPolicyStore = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;               // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
