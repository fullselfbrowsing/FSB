'use strict';

/**
 * FSB v0.10.0-attempt-2 Phase 5 Plan 05-05 -- standalone MV3-survivability
 * adapter implementing Lattice's SurvivabilityAdapter<TState> contract over
 * chrome.storage.session.
 *
 * INV-06 compliance: the CONTRACT (SurvivabilityAdapter interface +
 * ResumePolicy taxonomy + SerializedSnapshot envelope) lives in Lattice at
 * lattice/packages/lattice/src/runtime/survivability.ts (Plan 05-02 +
 * Plan 05-03). This file is the FSB-side IMPLEMENTATION over the MV3
 * runtime's chrome.storage.session persistence. The contract is consumer-
 * agnostic; the implementation is host-specific.
 *
 * Standalone module per CONTEXT.md D-19:
 *   - Does NOT modify extension/ai/agent-loop.js (INV-04 setTimeout iterator
 *     at lines 1824/2418/2487/2497 stays byte-frozen).
 *   - Does NOT modify extension/background.js (153 importScripts chain
 *     byte-frozen per D-17).
 *   - Does NOT register itself globally; the consumer (Plan 05-04 offscreen
 *     handler + a future agent-loop integration phase) explicitly imports
 *     and constructs the adapter instance.
 *
 * Feature flag (D-20 + CD-D resolution):
 *   globalThis.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED -- boolean, defaults
 *   `false`. Lives in-code (CD-D); a follow-on phase MAY add a
 *   chrome.storage.local override for runtime-switchability, but Phase 5
 *   keeps the flag in code for atomicity + reversibility.
 *
 *   Uniform check pattern (CONTEXT.md deep_work_rules):
 *     if (typeof FSB_LATTICE_RUNTIME_ADAPTER_ENABLED !== "undefined"
 *         && FSB_LATTICE_RUNTIME_ADAPTER_ENABLED) {
 *       // adapter-enabled code path
 *     }
 *
 *   Every production code path in this module follows that pattern. The
 *   adapter factory itself ALWAYS produces a working adapter (so tests can
 *   exercise it); the flag gates whether any consumer wires the adapter
 *   into the SW eviction recovery dispatcher.
 *
 * D-22 carryforward: CONSERVATIVE recovery dispatcher EXPLICITLY OUT OF
 * SCOPE for Phase 5. The adapter's resume() method ships the
 * ResumePolicy taxonomy + the storage layer; the actual rewiring into
 * runAgentLoop's restored-mode branches is a follow-on milestone. INV-04
 * setTimeout iterator stays byte-frozen because Phase 5 does not touch
 * agent-loop.js at all.
 *
 * Threat model (CONTEXT.md Phase 5):
 *   - chrome.storage.session size leak (row 3 of CONTEXT.md threat model):
 *     this adapter accumulates per-step snapshots without cleanup. The
 *     JSDoc on createFsbLatticeRuntimeAdapter below documents an
 *     LRU-bound contract (default cap = 50 snapshots per sessionId);
 *     enforced in Phase 9 (FINT-15) via enforceLruCap() inside
 *     persistInternal. The Phase 9 smoke (Part 6.5) asserts the cap
 *     holds: writing 51 snapshots leaves exactly 50 retained.
 *   - PII via serialized state (row 5 of CONTEXT.md threat model):
 *     callers MUST ensure state contains only stable identifiers per
 *     Phase 2 D-04 + Phase 3 conventions; documented + not enforced.
 *
 * Resolution path for `lattice` import:
 *   - This file lives in extension/ai/ which is loaded by the classic SW
 *     via importScripts(). importScripts() does NOT support ES module
 *     imports, so this file uses globalThis access to Lattice OR is
 *     loaded via the offscreen bundle path (Plan 05-04).
 *   - For Node-side testing (Plan 05-05 Task 2 smoke), the smoke uses
 *     `await import('lattice')` + injects the imported namespace into
 *     globalThis before requiring this file. See the smoke for the
 *     pattern.
 *   - This file therefore does NOT use `import` syntax (CJS-compatible
 *     for the classic SW loader and the Node test harness).
 */

(function (globalScope) {
  const ADAPTER_TAG = '[FSB lattice-runtime-adapter]';
  const STORAGE_KEY_PREFIX = 'fsb_lattice_snapshot_';
  const DEFAULT_LRU_CAP = 50; // JSDoc-documented contract; enforced in Phase 9 (FINT-15)
  const REDACTED_SENTINEL = '[REDACTED_BY_LATTICE_ADAPTER]';
  // Keys whose values are auth material or session-bound secrets that must
  // never land in chrome.storage.session. Match is case-insensitive on the
  // full key name; conservative allowlist over broad regex to keep the walk
  // predictable. `apiKey`/`openaiApiKey`/`geminiApiKey`/... all end in
  // `apikey` after lower-casing; `providerInstance` is a live provider that
  // itself carries the raw settings bag, so we drop it whole rather than
  // trying to walk into it.
  const REDACT_KEYS_LOWER = new Set([
    'apikey', 'openaiapikey', 'anthropicapikey', 'geminiapikey',
    'openrouterapikey', 'xaiapikey', 'customapikey',
    'authorization', 'cookie', 'cookies', 'setcookie',
    'token', 'accesstoken', 'refreshtoken', 'bearer', 'bearertoken',
    'secret', 'clientsecret', 'apisecret',
    'password', 'passphrase',
    'providerinstance'
  ]);

  // Walk `state`, returning a structurally-identical value with any secret-
  // named key replaced by REDACTED_SENTINEL. Non-plain objects (functions,
  // WebSocket handles, DOM refs) are dropped. Arrays and plain objects are
  // recursed. Primitives pass through unchanged.
  function _redactSecrets(state) {
    return _redactWalk(state, new Set());
  }

  function _redactWalk(value, seen) {
    if (value === null) return null;
    if (typeof value !== 'object') {
      return (typeof value === 'function') ? undefined : value;
    }
    if (seen.has(value)) return undefined; // cycle guard
    seen.add(value);
    if (Array.isArray(value)) {
      const out = [];
      for (let i = 0; i < value.length; i++) {
        const v = _redactWalk(value[i], seen);
        // preserve indices even when a slot redacts to undefined; JSON.stringify
        // will render undefined as null which matches the caller expectation
        // that array positions stay stable.
        out.push(v === undefined ? null : v);
      }
      return out;
    }
    const out = {};
    for (const key of Object.keys(value)) {
      if (REDACT_KEYS_LOWER.has(String(key).toLowerCase())) {
        out[key] = REDACTED_SENTINEL;
        continue;
      }
      const v = _redactWalk(value[key], seen);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }

  /**
   * Build an FSB MV3-survivability adapter backed by chrome.storage.session.
   *
   * Conformance: returns an object implementing Lattice's
   * SurvivabilityAdapter<TState> contract (Plan 05-02
   * lattice/packages/lattice/src/runtime/survivability.ts). The 4 contract
   * methods (serialize, deserialize, onEviction, resume) preserve the
   * Lattice-side signatures byte-equivalently.
   *
   * Options:
   *   - sessionId: required. The chrome.storage.session key prefix used
   *     to scope this adapter's snapshots.
   *   - storage: optional. A drop-in for chrome.storage.session (must
   *     expose get/set/remove); default = globalScope.chrome.storage.session.
   *     The Node smoke supplies an in-memory mock.
   *   - lruCap: optional. Documented bound on snapshot count per
   *     sessionId; default = 50. ENFORCED in Phase 9 (FINT-15) via
   *     enforceLruCap() invoked from persistInternal after each write
   *     commits (keep-latest-N; oldest evicted, newest retained).
   *
   * Returns: SurvivabilityAdapter-shaped object.
   */
  function createFsbLatticeRuntimeAdapter(options) {
    if (!options || typeof options !== 'object') {
      throw new TypeError(ADAPTER_TAG + ' createFsbLatticeRuntimeAdapter(options) requires {sessionId: string}');
    }
    const sessionId = String(options.sessionId || '');
    if (!sessionId) {
      throw new TypeError(ADAPTER_TAG + ' options.sessionId is required (non-empty string)');
    }
    const storage = options.storage
      || (globalScope.chrome && globalScope.chrome.storage && globalScope.chrome.storage.session)
      || null;

    if (!storage) {
      // Standalone usage in environments without chrome.storage.session
      // (e.g., classic Node test outside our smoke) -- the adapter still
      // builds, but persist/load short-circuit. The Node smoke ALWAYS
      // supplies an in-memory mock so this branch is dev-only.
      console.warn(ADAPTER_TAG, 'no chrome.storage.session detected; persist/load short-circuit');
    }

    const lruCap = Number.isFinite(options.lruCap) ? options.lruCap : DEFAULT_LRU_CAP;
    const hooks = new Set();

    /**
     * Phase 9 FINT-15 -- keep-latest-N LRU enforcement per JSDoc line 76
     * contract (default cap = 50 per sessionId). Fire-and-forget per Phase 9
     * RESEARCH Section 7 sync/async resolution: brief excursions to cap+1 are
     * harmless (chrome.storage.session 10MB quota gives ~2000-4000 typical
     * snapshot headroom above cap=50). Lists all keys matching the sessionId
     * prefix, sorts (ISO-8601 capturedAt suffix is lexicographically
     * chronological), and removes the oldest entries beyond the cap.
     *
     * Errors are logged + swallowed: a single failed eviction does not throw
     * upstream because the next serialize call re-attempts eviction
     * idempotently (mirrors Phase 5 D-07 best-effort design).
     */
    function enforceLruCap(sessionIdArg, storageArg, cap) {
      try {
        const prefix = STORAGE_KEY_PREFIX + sessionIdArg + '_';
        storageArg.get(null, function (all) {
          if (typeof globalScope.chrome !== 'undefined'
              && globalScope.chrome.runtime
              && globalScope.chrome.runtime.lastError) {
            return;
          }
          const matches = Object.keys(all || {})
            .filter(function (k) { return k.indexOf(prefix) === 0; })
            .sort();
          if (matches.length <= cap) return;
          const toDelete = matches.slice(0, matches.length - cap);
          storageArg.remove(toDelete, function () {
            if (typeof globalScope.chrome !== 'undefined'
                && globalScope.chrome.runtime
                && globalScope.chrome.runtime.lastError) {
              console.warn(ADAPTER_TAG, 'enforceLruCap remove lastError:',
                globalScope.chrome.runtime.lastError);
            }
          });
        });
      } catch (err) {
        console.warn(ADAPTER_TAG, 'enforceLruCap threw:', err && err.message);
      }
    }

    /**
     * Persist a SerializedSnapshot to chrome.storage.session keyed by
     * sessionId + snapshot.capturedAt. Wrapped in the feature-flag check
     * (D-20 uniform pattern). Best-effort: storage failures log + return.
     *
     * Phase 9 FINT-15: invokes enforceLruCap(sessionId, storage, lruCap) from
     * inside the storage.set callback so the new snapshot commits before
     * eviction sweep (keep-latest-N semantics; oldest evicted, newest
     * retained per JSDoc line 76 contract).
     */
    function persistInternal(snapshot) {
      if (typeof globalScope.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED === 'undefined'
          || !globalScope.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED) {
        return; // flag default-off; production paths byte-identical to baseline
      }
      if (!storage) return;
      const key = STORAGE_KEY_PREFIX + sessionId + '_' + snapshot.capturedAt;
      try {
        storage.set({ [key]: snapshot }, () => {
          // chrome.storage.session.set MAY emit a runtime.lastError; the
          // adapter does not surface this beyond logging (best-effort).
          // Phase 9 FINT-15 -- enforce LRU cap after write commits.
          enforceLruCap(sessionId, storage, lruCap);
        });
      } catch (err) {
        console.warn(ADAPTER_TAG, 'persistInternal threw:', err && err.message);
      }
    }

    return {
      kind: 'survivability-adapter',
      id: 'fsb-mv3-chrome-storage-session',
      sessionId: sessionId,

      /**
       * SurvivabilityAdapter.serialize(state) -- produces a
       * SerializedSnapshot envelope per Lattice Plan 05-02 contract.
       * Also writes the snapshot to chrome.storage.session when the
       * feature flag is on (best-effort persistence; D-20).
       *
       * Defense-in-depth: before stringify, walk the state tree and
       * redact any key whose name looks like an auth material (apiKey,
       * openaiApiKey, authorization, cookie, token, secret, ...). The
       * adapter contract asks callers to pass stable identifiers only
       * (threat-model row 5), but the FSB session object as-invoked by
       * agent-loop.js carries `providerConfig.apiKey` and the whole
       * spread-in provider settings bag, so an unsanitized serialize
       * would land plaintext keys in chrome.storage.session under an
       * LRU of 50 snapshots per session. Redacting inside the adapter
       * keeps the never-persist-keys posture true regardless of caller
       * hygiene.
       */
      serialize: function serialize(state) {
        const snapshot = {
          kind: 'survivability-snapshot',
          version: 'lattice-survivability/v1',
          payload: JSON.stringify(_redactSecrets(state === undefined ? null : state)),
          capturedAt: new Date().toISOString()
        };
        persistInternal(snapshot);
        return snapshot;
      },

      /**
       * SurvivabilityAdapter.deserialize(snapshot) -- inverse of
       * serialize. Trusts the snapshot shape; the caller is responsible
       * for matching the payload to TState (mirrors Lattice noop adapter).
       */
      deserialize: function deserialize(snapshot) {
        if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.payload !== 'string') {
          throw new TypeError(ADAPTER_TAG + ' deserialize(snapshot) requires a valid SerializedSnapshot');
        }
        return JSON.parse(snapshot.payload);
      },

      /**
       * SurvivabilityAdapter.onEviction(hook) -- register a best-effort
       * pre-eviction callback. MV3 SW eviction has no synchronous signal
       * (carries forward Plan 05-02 D-08), so the hook is invoked only
       * when the consumer explicitly calls fireEvictionHooks() (e.g.,
       * from a user-initiated stop path). Returns idempotent UnsubscribeFn.
       */
      onEviction: function onEviction(hook) {
        if (typeof hook !== 'function') {
          throw new TypeError(ADAPTER_TAG + ' onEviction(hook) requires a function');
        }
        hooks.add(hook);
        let unsubscribed = false;
        return function unsubscribe() {
          if (unsubscribed) return;
          unsubscribed = true;
          hooks.delete(hook);
        };
      },

      /**
       * Internal helper for consumers (e.g., the SW's user-initiated stop
       * path) to invoke all registered eviction hooks. Not part of the
       * Lattice contract; FSB-specific extension.
       */
      fireEvictionHooks: async function fireEvictionHooks(state) {
        for (const h of hooks) {
          try {
            await h(state);
          } catch (err) {
            console.warn(ADAPTER_TAG, 'eviction hook threw:', err && err.message);
          }
        }
      },

      /**
       * SurvivabilityAdapter.resume(snapshot) -- return ResumePolicy
       * verdict. Phase 5 ships the taxonomy; the actual CONSERVATIVE
       * dispatch into runAgentLoop is OUT OF SCOPE per D-22.
       *
       * Default verdict logic:
       *   - SAFE if the snapshot's payload deserializes successfully
       *     AND contains no in-flight markers.
       *   - ON_ERROR_SW_EVICTION_MID_REQUEST if the payload includes
       *     a `_currentStepName === "BEFORE_API_REQUEST"` (FSB attempt-1
       *     marker carry-forward).
       *   - ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH if the payload
       *     includes `_currentStepName === "BEFORE_TOOL_EXECUTION"`.
       *   - RECOVERY_AMBIGUOUS if `_currentStepName` matches a non-safe
       *     boundary not listed above.
       *
       * The marker vocabulary preserves Phase 2 D-04 (stable identifiers
       * only) + the attempt-1 02-04-PLAN.md taxonomy (CD-E carryforward).
       */
      resume: async function resume(snapshot) {
        if (!snapshot || typeof snapshot.payload !== 'string') {
          return 'RECOVERY_AMBIGUOUS';
        }
        let state;
        try {
          state = JSON.parse(snapshot.payload);
        } catch (err) {
          return 'RECOVERY_AMBIGUOUS';
        }
        if (!state || typeof state !== 'object') {
          return 'SAFE';
        }
        const marker = state._currentStepName;
        if (marker === 'BEFORE_API_REQUEST') {
          return 'ON_ERROR_SW_EVICTION_MID_REQUEST';
        }
        if (marker === 'BEFORE_TOOL_EXECUTION') {
          return 'ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH';
        }
        if (marker === 'BEFORE_ITERATION'
            || marker === 'BEFORE_NEXT_ITERATION_SCHEDULE'
            || marker === undefined) {
          return 'SAFE';
        }
        return 'RECOVERY_AMBIGUOUS';
      }
    };
  }

  // Export the factory. CJS-compatible (for Node tests + classic SW
  // importScripts). The factory is exposed via globalThis so the
  // offscreen bundle (Plan 05-04) can ALSO consume it if a future
  // phase wires that path. Plan 05-05 ships the factory + smoke;
  // wiring is a follow-on.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createFsbLatticeRuntimeAdapter };
  }
  if (typeof globalScope !== 'undefined') {
    globalScope.FsbLatticeRuntimeAdapter = { createFsbLatticeRuntimeAdapter };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
