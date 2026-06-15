---
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
plan: 03
subsystem: extension-sw-bridge
tags: [lattice, mv3, sw, agent-loop, bridge-shim, feature-flag, fint-08, wave-3]

# Dependency graph
requires:
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 00
    provides: "tests/lattice-provider-bridge-smoke.test.js Wave 0 scaffold + createChromeRuntimeMock helper; passAssert + passAssertEqual counters"
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 01
    provides: "extension/offscreen/lattice-host.js lattice-provider-execute + lattice-provider-abort handlers (the offscreen-side counterpart that the bridge shim shipped here messages); host_unreachable case is NOT exercisable via the offscreen handler -- only the SW-side bridge throws it"
  - phase: 06-fsb-engine-consumes-lattice-provider-abstraction
    plan: 02
    provides: "extension/background.js importScripts('ai/lattice-provider-bridge.js') slot at line 12; ensureLatticeOffscreen() startup wiring opens the offscreen page so the bridge has a listener to message"
  - phase: 05-mv3-survivability-bundler
    provides: "extension/ai/lattice-runtime-adapter.js dual-export idiom (IIFE + globalThis + module.exports) that lattice-provider-bridge.js mirrors verbatim"
provides:
  - "extension/ai/lattice-provider-bridge.js -- SW-side bridge shim exporting executeViaBridge(providerKey, config, requestBody, opts) via dual export (globalThis.executeViaBridge + module.exports.executeViaBridge); 146 lines"
  - "Bridge shim error taxonomy: aborted | adapter_error | host_unreachable | invalid_provider | fetch_error -- typed via err.code with optional err.providerError pass-through"
  - "extension/ai/agent-loop.js callProviderWithTools tail swap: feature-flag-gated bridge call (default-on idiom: `typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED`); legacy providerInstance.sendRequest(requestBody) preserved as the flag-false fallback (Phase 7 archives)"
  - "tests/lattice-provider-bridge-smoke.test.js Part 1 + Part 3 + Part 5 fills (46 PASS Plan 06-02 baseline -> 61 PASS / 0 FAIL after Plan 06-03; +15 delta well above the >= 10 plan minimum and the > 46 baseline threshold)"
  - "tests/agent-loop-empty-contents.test.js patched: sets globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false BEFORE requiring agent-loop.js so the regression test continues to capture sendRequest payloads from the byte-frozen switch construction (Rule 3 auto-fix)"
affects: [06-04-options-ui-rewrite, 06-05-inv-byte-freeze-verification, 06-06-phase-ceremony]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-export bridge shim idiom: IIFE wrapper + globalScope.executeViaBridge assignment + `if (typeof module !== 'undefined' && module.exports) { module.exports = { executeViaBridge }; }` -- matches Phase 5 Plan 05-05 lattice-runtime-adapter.js template"
    - "Default-on feature flag idiom: `typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` (undefined OR truthy -> default-on); diverges from Phase 5's default-off pattern (`typeof X !== 'undefined' && X`)"
    - "AbortSignal companion-message pattern: per-call crypto.randomUUID() requestId; addEventListener('abort', ..., {once: true}) AND finally{} removeEventListener (Pitfall 3 mitigation belt-and-suspenders)"
    - "Envelope unwrap: ok:true returns `envelope.response.rawResponse` (autopilot raw HTTP body) OR `envelope.response` (test-connection ProviderRunResponse) via simple truthy fallback; ok:false constructs typed Error with err.code from envelope.error.kind"

key-files:
  created:
    - "extension/ai/lattice-provider-bridge.js (146 lines) -- Phase 6 Plan 06-03 SW-side bridge shim; dual export; crypto.randomUUID requestId; AbortSignal routing with listener cleanup; envelope unwrap; typed Error taxonomy"
    - ".planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-03-SUMMARY.md (this file)"
  modified:
    - "extension/ai/agent-loop.js (+16 lines at lines 1044-1059): feature-flag-gated branch around the legacy `return providerInstance.sendRequest(requestBody)` at the tail of callProviderWithTools; switch + requestBody construction at lines 957-1042 BYTE-FROZEN; setTimeout iterator PATTERN at the 4 chained iterator blocks BYTE-FROZEN (absolute line positions shifted from 1841/2439/2508/2518 to 1857/2455/2524/2534 = +16 lines; expected; not an invariant violation)"
    - "tests/lattice-provider-bridge-smoke.test.js (+34 lines): Part 1 fill (2 new bridge-presence PASSes) + Part 3 fill (3 new host_unreachable + pre-abort PASSes) + Part 5 fill (10 new agent-loop.js flag-gating + bridge-shape PASSes); Plan 06-04 placeholder retained"
    - "tests/agent-loop-empty-contents.test.js (+9 lines): sets FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false BEFORE the require() so the legacy sendRequest capture path runs; preserves test intent (seeded-user-turn fix for Anthropic/Gemini empty-conversation 400 per issue #29)"

key-decisions:
  - "Bridge shim returns raw HTTP body (NOT Lattice's normalized envelope) for the autopilot path: agent-loop's downstream consumers in tool-use-adapter.js read the raw HTTP body per-provider shape (Anthropic content[].tool_use, Gemini candidates[].parts[].functionCall, default choices[].tool_calls). Preserves call-site diff to a single function-name substitution and keeps tool-use-adapter.js BYTE-FROZEN."
  - "Default-on flag idiom (`typeof X === 'undefined' || X`) over Phase 5's default-off pattern (`typeof X !== 'undefined' && X`). Rationale: ROADMAP locks bridge as the primary path post-Phase-6; default-off would require an explicit flag-flip during MV3 reload to exercise it. Default-on means the bridge runs silently on upgrade; the flag is the rollback escape hatch, not a beta gate."
  - "Legacy `providerInstance.sendRequest(requestBody)` line PRESERVED in agent-loop.js as the flag-false fallback. Reason: Phase 7 archives universal-provider.js; Phase 6 only ADDS the bridge as the default path. Runtime rollback (set flag to false in DevTools console) restores the pre-Phase-6 behavior without requiring a code revert."
  - "Bridge shim ships standalone (no Lattice imports). The factory dispatch + auth + URL derivation live in the offscreen handler (Plan 06-01); the bridge is purely a message-envelope wrapper. This keeps the SW-side bundle small and respects MV3 classic SW's importScripts() ESM constraints."
  - "Per-call crypto.randomUUID requestId over monotonic counter: 122 bits of cryptographic randomness ensures uniqueness across SW evictions + AbortController identification + future multi-offscreen-doc compatibility. Falls back to timestamp-based ID only in Node test environments where webcrypto polyfill is unavailable (Chrome 92+ has it natively; FSB floor Chrome 116)."
  - "Bridge-side host_unreachable test cases populated in Part 3 (originally deferred by Plan 06-01): two SW-side scenarios (sendMessage reject AND sendMessage resolves undefined) both map to err.code = 'host_unreachable'. The offscreen-side fetch_error case (Plan 06-01) covers a different failure mode (network down from inside the offscreen page); the bridge-side host_unreachable covers the channel-itself-broken case."

patterns-established:
  - "Pattern 1 (SW-side bridge shim with dual export): for any future SW <-> offscreen RPC, ship a thin SW-side shim that wraps chrome.runtime.sendMessage with: (a) per-call crypto.randomUUID() requestId, (b) AbortSignal routing via companion abort message + finally{} removeEventListener cleanup, (c) envelope unwrap to the legacy consumer shape via `response.rawResponse ?? response` truthy fallback, (d) typed Error taxonomy via err.code, (e) dual export (globalScope + CJS module.exports) following the Phase 5 IIFE template."
  - "Pattern 2 (Default-on flag idiom): when the new path is intended as the primary post-rollout AND a runtime rollback hatch is required, use `typeof X === 'undefined' || X` so undefined OR truthy -> new path; explicit false -> legacy path. Diverges from Phase 5's default-off pattern (`typeof X !== 'undefined' && X`) which is the right choice for opt-in beta gates."
  - "Pattern 3 (Regression-test flag pinning): when a feature-flag-gated swap changes the default code path AND existing regression tests depend on the LEGACY path's side effects (e.g., capturing what providerInstance.sendRequest received), the LEAST invasive fix is to set the flag to its non-default value in the test BEFORE requiring the module under test. Preserves the test's intent without modifying production code further."
  - "Pattern 4 (Two-form grep assertion for default-on idiom): the default-on idiom `typeof X === 'undefined' || X` puts the flag identifier TWICE on a SINGLE line. When the plan's acceptance criterion uses `grep -c` (line-count = 1) but the test code uses `match().length` (token-count = 2), assert BOTH: line-count for the grep-c semantics AND token-count for the idiom-natural-shape. Diagnostic clarity over false-fail."

requirements-completed:
  - FINT-08

# Metrics
duration: 8min
completed: 2026-05-27
---

# Phase 6 Plan 06-03: Bridge shim + agent-loop call-site swap Summary

**`extension/ai/lattice-provider-bridge.js` ships as a 146-line dual-export SW-side shim (executeViaBridge with crypto.randomUUID requestId, AbortSignal routing with listener cleanup, envelope unwrap, typed Error taxonomy); `extension/ai/agent-loop.js` callProviderWithTools gets a 16-line feature-flag-gated branch at its tail invoking executeViaBridge when `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` is undefined OR truthy (default-on per ROADMAP) while preserving the legacy `providerInstance.sendRequest(requestBody)` call as the flag-false fallback; switch + requestBody construction BYTE-FROZEN; INV-04 setTimeout count = 8 + 4 single-line iterator blocks calling runAgentIteration(sessionId, options) BYTE-FROZEN PATTERN (absolute positions shift +16 lines, expected); INV-05 universal-provider.js + tool-use-adapter.js BYTE-FROZEN (zero diff); smoke 46 PASS -> 61 PASS / 0 FAIL (+15 new Plan 06-03 PASSes covering bridge presence + host_unreachable + pre-abort + agent-loop grep + bridge-shape); npm test exits 0; agent-loop-empty-contents.test.js regression test patched to pin flag-false (Rule 3 auto-fix).**

## Performance

- **Duration:** 8 min (~11:03:37 -> ~11:11:45 local)
- **Started:** 2026-05-27T16:03:37Z
- **Completed:** 2026-05-27T16:11:45Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 3 surgically edited)

## Accomplishments

- `extension/ai/lattice-provider-bridge.js` (146 lines) ships as the SW-side counterpart to Plan 06-01's offscreen handler. Module pattern mirrors Phase 5 `extension/ai/lattice-runtime-adapter.js` dual-export idiom verbatim.
- `executeViaBridge(providerKey, config, requestBody, opts)` is the sole exported function with full JSDoc covering provider keys, config shape, requestBody contract (provider-formatted HTTP body for autopilot mode; ignored for test-connection mode), opts shape, and the typed Error taxonomy.
- Per-call requestId generated via `crypto.randomUUID()` when available; falls back to `'req-' + Date.now() + '-' + Math.random().toString(36).slice(2)` for Node test environments where webcrypto may not be present (Chrome 92+ has randomUUID natively; FSB floor Chrome 116).
- AbortSignal routing: pre-aborted signal throws synchronously with `err.code = 'aborted'`; mid-flight abort dispatches companion `{type: 'lattice-provider-abort', requestId}` message via `chrome.runtime.sendMessage` (swallowed errors silently because the offscreen page may have evicted); `addEventListener('abort', onAbort, {once: true})` paired with `finally{} removeEventListener('abort', onAbort)` -- belt-and-suspenders Pitfall 3 mitigation.
- Envelope unwrap: `chrome.runtime.sendMessage` reject -> `err.code = 'host_unreachable'`; undefined OR non-object envelope -> `err.code = 'host_unreachable'`; `envelope.ok === true` -> returns `envelope.response.rawResponse` (autopilot raw HTTP body matching what universalProvider.sendRequest returns today) OR `envelope.response` (test-connection ProviderRunResponse) via truthy fallback; `envelope.ok === false` -> constructs typed Error with `err.code = envelope.error.kind`, `err.providerError = envelope.error.providerError`, `err.message = envelope.error.message`.
- SECURITY: bridge NEVER logs `config.apiKey`. The only `console.log` is the boot tag at module evaluation time. Error message + providerError fields may contain provider-supplied masked echoes (e.g. xAI's `xa***cy`) but never the full key. Verified via `grep -nE 'console\.(log|error|warn).*config\.apiKey' extension/ai/lattice-provider-bridge.js` returns zero hits.
- `extension/ai/agent-loop.js` callProviderWithTools tail gains 16 lines: feature-flag-gated branch under `typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` (default-on) invokes `executeViaBridge(providerKey, {apiKey, model, baseUrl}, requestBody, {mode: 'autopilot'})` with config derived from `providerInstance.config` (PROVIDER_CONFIGS slot per provider) + `providerInstance.settings` (chrome storage settings object). Legacy `return providerInstance.sendRequest(requestBody)` PRESERVED as the flag-false fallback at the function's tail.
- INV-04 PRESERVED: `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 (Phase 5 baseline); the 4 chained iterators (`session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, <delay>);`) remain single-line iterator blocks with `runAgentIteration(sessionId, options)` on the SAME LINE as setTimeout. Absolute line positions shifted from 1841/2439/2508/2518 to 1857/2455/2524/2534 (+16 lines due to my +16-line insertion at line 1044); the shift is EXPECTED per the plan's notes and not an invariant violation -- INV-04 is the PATTERN, not the specific line numbers.
- INV-05 PRESERVED: `extension/ai/universal-provider.js` BYTE-FROZEN (`git diff` returns empty); `extension/ai/tool-use-adapter.js` BYTE-FROZEN (`git diff` returns empty). Phase 7 archives universal-provider.js; Phase 6 only ADDS the bridge as the default path.
- `tests/lattice-provider-bridge-smoke.test.js` extends from 569 -> 603 lines (+34 net): Part 1 (+2 PASSes for executeViaBridge CJS + globalThis presence); Part 3 (+3 PASSes for SW-side host_unreachable cases + pre-aborted signal); Part 5 (+10 PASSes for agent-loop flag-gating + bridge shape greps).
- Smoke PASS count: 46 (Plan 06-02 baseline) -> 61 (delta +15, well above the >= 10 plan minimum). FAIL count == 0.
- `npm test` exits 0 (full chain green; bridge smoke runs as final entry; `tests/agent-loop-empty-contents.test.js` regression test patched to pin `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false` so it continues to capture sendRequest payloads from the byte-frozen switch construction).

## Task Commits

Each task was committed atomically:

1. **Task 1: Create extension/ai/lattice-provider-bridge.js with executeViaBridge + dual export + AbortSignal routing + envelope unwrap** -- `fd3408a7` (feat)
2. **Task 2: Swap agent-loop.js line 1044 to feature-flag-gated bridge call (default-on; legacy fallback preserved)** -- `f1aa4734` (feat)
3. **Task 3: Extend bridge smoke Part 1+3+5 + patch agent-loop regression test (Rule 3 auto-fix)** -- `18de341a` (test)

## Files Created/Modified

- `extension/ai/lattice-provider-bridge.js` (CREATED, 146 lines) -- new SW-side bridge shim with dual export (`globalScope.executeViaBridge` + `module.exports = { executeViaBridge }`); JSDoc on executeViaBridge documents provider keys + config shape + requestBody contract + opts shape + typed Error taxonomy + SECURITY: never log config.apiKey; module body covers pre-aborted signal synchronous throw + per-call crypto.randomUUID requestId (with timestamp fallback) + AbortSignal addEventListener with {once: true} + chrome.runtime.sendMessage try/catch with host_unreachable on reject + null-envelope guard with host_unreachable + envelope.ok === true returns response.rawResponse ?? response + envelope.ok === false constructs typed Error with err.code + err.providerError pass-through + finally{} removeEventListener for listener cleanup; boot log at module evaluation time confirms bridge global is registered.
- `extension/ai/agent-loop.js` (MODIFIED, +16 lines at 1044-1059) -- callProviderWithTools tail gains feature-flag-gated branch BEFORE the legacy fallback. Branch derives config from `providerInstance.config` (PROVIDER_CONFIGS slot) + `providerInstance.settings` (chrome storage object), computes baseUrl per-provider for custom/lmstudio/openai cases (others fall through to undefined which lets Lattice's adapter or the offscreen-side default URL handle them), invokes `executeViaBridge(providerKey, {apiKey, model, baseUrl}, requestBody, {mode: 'autopilot'})`. The 957-1042 switch + requestBody construction stays BYTE-FROZEN. The legacy `return providerInstance.sendRequest(requestBody)` line at the function tail stays as the flag-false fallback.
- `tests/lattice-provider-bridge-smoke.test.js` (MODIFIED, 569 -> 603 lines; +34 net) -- Part 1 fill at lines 285-294 (2 new PASSes: CJS require returns function + globalThis assignment returns function; webcrypto polyfill applied if needed); Part 3 fill at lines 425-454 (3 new PASSes: sendMessage reject -> host_unreachable, sendMessage resolves undefined -> host_unreachable, pre-aborted signal -> aborted; chrome mock restored to part1Chrome after the host_unreachable tests so Part 4 abort tests continue to work); Part 5 fill at lines 543-562 (10 new PASSes: 2 agent-loop FSB_LATTICE_PROVIDER_BRIDGE_ENABLED assertions [LINE count = 1, TOKEN count = 2], executeViaBridge invocation count = 1, legacy providerInstance.sendRequest count = 1, setTimeout count = 8, crypto.randomUUID present in bridge, host_unreachable >= 2 paths, bridge module.exports executeViaBridge regex, bridge globalScope.executeViaBridge regex, bridge removeEventListener('abort', ...) cleanup); Plan 06-04 placeholder PASS retained at line 564 for downstream options.js fill.
- `tests/agent-loop-empty-contents.test.js` (MODIFIED, +9 lines at top) -- adds 8-line Phase 6 Plan 06-03 comment block + `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false;` line BEFORE the existing `require('../extension/ai/agent-loop.js')`. The flag pin ensures the test's makeProviderStub.sendRequest capture path runs (Rule 3 auto-fix: my Task 2 swap made bridge default-on, but this regression test exercises the BYTE-FROZEN switch + requestBody construction by capturing what providerInstance.sendRequest receives -- the flag-false fallback path). Test intent preserved: still exercises seeded-user-turn fix for Anthropic/Gemini empty-conversation 400 per issue #29.

## Default-On Flag Idiom Callout

The Phase 6 Plan 06-03 bridge swap uses the **default-on idiom** at agent-loop.js line 1048:

```js
if (typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED) {
```

This evaluates to `true` when:
- The flag is undefined (default state -- no globalThis assignment), OR
- The flag is explicitly truthy.

Only an explicit `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false` falls through to the legacy fallback.

This **diverges from Phase 5's default-off pattern** at e.g. lattice-runtime-adapter.js line 127:

```js
if (typeof globalScope.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED === 'undefined'
    || !globalScope.FSB_LATTICE_RUNTIME_ADAPTER_ENABLED) {
  return; // flag default-off
}
```

Phase 5's default-off pattern is correct for opt-in beta gates (storage-persistence path is OFF unless explicitly enabled). Phase 6's default-on pattern is correct for primary-path rollouts with a runtime rollback hatch (bridge is the default; flag is the escape hatch, not a beta gate).

The token-count asymmetry (default-on idiom has TWO mentions of the flag identifier on ONE line; default-off pattern has ONE mention) drove the Part 5 test assertion split into LINE-count + TOKEN-count for full diagnostic clarity (see Deviations below).

## INV-04 PATTERN Confirmation

```
$ grep -c "setTimeout" extension/ai/agent-loop.js
8                       (Phase 5 baseline; UNCHANGED; INV-04 count invariant preserved)

$ grep -cE "session\._nextIterationTimer\s*=\s*setTimeout" extension/ai/agent-loop.js
4                       (4 chained iterators; INV-04 PATTERN preserved)

$ grep -cE "session\._nextIterationTimer\s*=\s*setTimeout.*runAgentIteration\s*\(\s*sessionId\s*,\s*options\s*\)" extension/ai/agent-loop.js
4                       (each iterator block is a SINGLE-LINE block with runAgentIteration(sessionId, options) on the SAME LINE as setTimeout)

$ grep -nE "session\._nextIterationTimer\s*=\s*setTimeout" extension/ai/agent-loop.js
1857:      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);
2455:    session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 100);
2524:      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 5000);
2534:      session._nextIterationTimer = setTimeout(function() { runAgentIteration(sessionId, options); }, 2000);
```

**Iterator absolute line positions shifted from the Phase 5 baseline (1841/2439/2508/2518) to (1857/2455/2524/2534) -- a uniform +16-line downward shift driven by the +16-line insertion at line 1044.** This shift is EXPECTED per the plan's notes and is NOT an invariant violation. INV-04 invariant is the PATTERN (4 chained iterators each calling runAgentIteration(sessionId, options) on the same line as setTimeout), not the specific absolute line numbers.

The +16-line drift in iterator absolute positions is documented here for traceability so downstream tooling that cross-references the iterator line numbers from earlier phase artifacts (Phases 1-5 SUMMARYs) can locate the iterator hits in the post-Plan-06-03 file.

## INV-05 BYTE-FROZEN Confirmation

```
$ git diff extension/ai/universal-provider.js
                        (empty -- byte-frozen)

$ git diff extension/ai/tool-use-adapter.js
                        (empty -- byte-frozen)
```

Phase 6 only ADDS the bridge as the default path; Phase 7 archives universal-provider.js. The tool-use-adapter consumes the raw HTTP body shape that the bridge returns (via `envelope.response.rawResponse` -> raw provider HTTP body matching universalProvider.sendRequest's return today), so it works unchanged.

## Smoke PASS Count Delta from Plan 06-02 Baseline

| Part | Plan 06-02 (baseline) | After Plan 06-03 | Delta |
|------|------------------------|-------------------|-------|
| Part 1 (surface presence)                       | 9                                 | 11 (9 existing + 2 new: executeViaBridge CJS + globalThis)                                | +2  |
| Part 2 (per-provider round-trip)                | 14                                | 14                                                                                         | 0   |
| Part 3 (error envelope shape)                   | 5                                 | 8 (5 existing offscreen-side + 3 new SW-side: sendMessage reject, undefined envelope, pre-abort) | +3  |
| Part 4 (AbortController)                        | 2                                 | 2                                                                                          | 0   |
| Part 5 (flag/trim/options/wiring)               | 15 (14 + 1 deferred placeholder)  | 25 (14 existing + 10 new + 1 retained Plan 06-04 placeholder)                              | +10 |
| Part 6 (INV byte-freeze)                        | 1 (Wave 0 placeholder)            | 1 (unchanged; Plan 06-05 fills)                                                            | 0   |
| **Total**                                       | **46**                            | **61**                                                                                     | **+15** |

The 10 new Part 5 PASSes break down as:
1. agent-loop.js has exactly 1 LINE referencing FSB_LATTICE_PROVIDER_BRIDGE_ENABLED (grep -c semantics)
2. agent-loop.js has exactly 2 token occurrences of FSB_LATTICE_PROVIDER_BRIDGE_ENABLED (default-on idiom natural shape)
3. agent-loop.js has exactly 1 executeViaBridge invocation
4. agent-loop.js retains exactly 1 legacy providerInstance.sendRequest(requestBody) call as flag-false fallback
5. agent-loop.js setTimeout count = 8 (INV-04 count invariant)
6. bridge uses crypto.randomUUID for requestId
7. bridge handles host_unreachable in >= 2 paths
8. bridge module.exports executeViaBridge (regex test)
9. bridge globalScope.executeViaBridge assigned (regex test)
10. bridge cleans up abort listener in finally{} via removeEventListener (Pitfall 3 mitigation)

The 3 new Part 3 PASSes:
1. sendMessage reject -> err.code:host_unreachable (SW-side bridge throws when channel cannot establish)
2. sendMessage resolves undefined -> err.code:host_unreachable (SW-side bridge throws when listener returns false or didn't sendResponse)
3. pre-aborted signal throws synchronously with code:aborted (SW-side bridge guards against pre-aborted signal at entry)

The 2 new Part 1 PASSes:
1. executeViaBridge exported via CJS (require) -- module.exports.executeViaBridge is typeof function
2. executeViaBridge exported via globalThis (classic SW) -- globalThis.executeViaBridge is typeof function

Delta +15 well above the >= 10 plan minimum AND well above the > 46 baseline threshold mentioned in the prompt's success criteria.

## Decisions Made

- **Raw HTTP body return shape (not Lattice normalized envelope) for autopilot.** Bridge returns `envelope.response.rawResponse` so tool-use-adapter.js consumes the same per-provider shape it does today (Anthropic content[].tool_use, Gemini candidates[].parts[].functionCall, default choices[].tool_calls). Preserves call-site diff to a single function-name substitution; tool-use-adapter.js stays BYTE-FROZEN.
- **Default-on flag idiom over Phase 5's default-off pattern.** ROADMAP locks bridge as the primary path; default-off would require an explicit flag-flip during MV3 reload to exercise it. Default-on (`typeof X === 'undefined' || X`) means the bridge runs silently on upgrade; the flag is the rollback escape hatch, not a beta gate. The token-count asymmetry vs the default-off pattern drove the test assertion split (see Deviations).
- **Legacy `providerInstance.sendRequest(requestBody)` line PRESERVED.** Phase 7 archives universal-provider.js; Phase 6 only ADDS the bridge as the default path. Runtime rollback (set flag to false in DevTools console) restores the pre-Phase-6 behavior without requiring a code revert. The legacy line MUST stay in the file as the flag-false fallback target.
- **Bridge shim ships standalone (no Lattice imports).** Factory dispatch + auth + URL derivation live in the offscreen handler (Plan 06-01); the bridge is purely a message-envelope wrapper. Keeps the SW-side bundle small and respects MV3 classic SW's importScripts() ESM constraints.
- **Per-call crypto.randomUUID requestId.** 122 bits of cryptographic randomness ensures uniqueness across SW evictions + AbortController identification + future multi-offscreen-doc compatibility. Timestamp fallback only for Node test environments where webcrypto polyfill is unavailable; Chrome 92+ has randomUUID natively (FSB floor Chrome 116).
- **Bridge-side host_unreachable cases populated in Part 3.** Originally deferred by Plan 06-01 because the offscreen handler cannot detect a broken channel (it IS the channel target). Two SW-side scenarios map to err.code = 'host_unreachable': sendMessage reject (Chrome 105+ behavior when no listener registered) AND sendMessage resolves undefined (listener returned false / didn't sendResponse). The offscreen-side fetch_error case (Plan 06-01) covers a different failure mode entirely (network down from inside the offscreen page).
- **Regression test flag pinning over agent-loop refactor.** `tests/agent-loop-empty-contents.test.js` depended on the legacy path being default; my Task 2 swap made bridge default-on. The LEAST invasive fix is to set `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false` in the test BEFORE requiring agent-loop.js so the test's makeProviderStub.sendRequest capture path continues to run. Preserves the test's original intent (seeded-user-turn fix for Anthropic/Gemini empty-conversation 400 per issue #29) without modifying production code further.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan-prescribed Part 5 test code asserted wrong FSB_LATTICE_PROVIDER_BRIDGE_ENABLED count**

- **Found during:** Task 3 (smoke fill first execution)
- **Issue:** The plan's prescribed Part 5 code used `(alSource.match(/FSB_LATTICE_PROVIDER_BRIDGE_ENABLED/g) || []).length === 1`. But the default-on idiom `typeof FSB_LATTICE_PROVIDER_BRIDGE_ENABLED === 'undefined' || FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` puts the flag identifier TWICE on a SINGLE line. `match().length` counts ALL OCCURRENCES (= 2), while `grep -c` counts MATCHING LINES (= 1). The plan-prescribed assertion `=== 1` therefore failed (got 2, expected 1) on first run.
- **Fix:** Split the single assertion into two assertions for full diagnostic clarity:
  - LINE-count assertion (`split('\n').filter(...).length === 1`) matches the plan's primary `grep -c` acceptance criterion.
  - TOKEN-count assertion (`match().length === 2`) verifies the default-on idiom's natural shape (typeof X === 'undefined' || X -> 2 mentions on 1 line).
- **Files modified:** `tests/lattice-provider-bridge-smoke.test.js` (Part 5 fill section).
- **Verification:** Re-run smoke; both assertions PASS; total smoke = 61 PASS / 0 FAIL.
- **Commit:** `18de341a` (Task 3 commit, includes the fix).

**2. [Rule 3 - Blocking] tests/agent-loop-empty-contents.test.js broke after Task 2 swap**

- **Found during:** Task 3 (npm test full chain)
- **Issue:** Existing regression test `tests/agent-loop-empty-contents.test.js` (covers issue #29 -- Gemini/Anthropic empty-conversation 400 fix via seeded user turn) calls `callProviderWithTools(makeProviderStub(), ...)` and asserts on `stub.lastRequest`. The stub's `sendRequest` method is what populates `lastRequest`. My Task 2 swap made the bridge call default-on; the test now ran into `ReferenceError: executeViaBridge is not defined` because the bridge module isn't loaded in this regression test's CJS context.
- **Fix:** Added `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false;` line at the top of the test BEFORE the `require('../extension/ai/agent-loop.js')` call. This forces the flag-false fallback path so the test's `stub.sendRequest` capture continues to work. Added an 8-line explanatory comment documenting why the flag pin is needed and what the test exercises.
- **Files modified:** `tests/agent-loop-empty-contents.test.js`.
- **Verification:** Re-run `npm test`; full chain exits 0; the regression test continues to verify all 11 PASSes (issue #29 fix for Gemini + Anthropic + xAI paths).
- **Commit:** `18de341a` (Task 3 commit, includes the fix).

**3. [Rule 1 - Bug] Plan-prescribed Task 1 acceptance criterion `grep -c "module.exports" returns 1` contradicted the plan's own prescribed skeleton**

- **Found during:** Task 1 (acceptance criteria check)
- **Issue:** The plan's Task 1 acceptance criterion says `grep -c "module.exports" extension/ai/lattice-provider-bridge.js returns 1 (CJS export)`. But the plan's prescribed skeleton uses the canonical Phase 5 dual-export idiom:
  ```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { executeViaBridge: executeViaBridge };
  }
  ```
  which naturally produces 2 mentions of `module.exports` (the if-guard check + the assignment). The same pattern appears in `extension/ai/lattice-runtime-adapter.js` which the plan cites as the canonical template.
- **Fix:** Followed the plan's prescribed skeleton verbatim (which is correct per the Phase 5 template), accepting the `module.exports` count of 2 as the natural outcome of the canonical idiom. The Task 3 smoke test uses `regex.test()` not count for the `module.exports` assertion, so this is not actually flagged as a smoke failure -- only the Task 1 acceptance-criterion plan-text is internally inconsistent.
- **Files modified:** None (no fix needed; the prescribed skeleton wins; the acceptance criterion text is wrong).
- **Verification:** Smoke uses `passAssert(/module\.exports\s*=\s*\{\s*executeViaBridge/.test(bridgeSource), '...')` which is a presence check via regex.test, not a count assertion. PASSes correctly.
- **Commit:** N/A (no code change; documented here for plan-text traceability).

---

**Total deviations:** 3 documented (2 auto-fixed in code, 1 plan-text inconsistency noted)
**Impact on plan:** All deviations are plan-side correctness issues (acceptance criteria contradicting prescribed code OR test infrastructure needing flag adjustment after a default-on swap). Zero scope creep; zero production code changes beyond the plan's prescribed swap.

## Issues Encountered

None beyond the 3 Rule 1/3 deviations above. All caught during the first verification run; all fixed inline within Task 3's working window; all documented above.

## User Setup Required

None - no external service configuration required. Plan 06-03 ships the SW-side bridge shim + agent-loop call-site swap + smoke verification. The bridge shim is now loaded into the SW via the importScripts slot Plan 06-02 reserved at line 12 of background.js. The SW will see the bridge shim register `globalThis.executeViaBridge` at boot time, and `callProviderWithTools` will use it for ALL autopilot iterations going forward (default-on idiom). Runtime rollback hatch: set `globalThis.FSB_LATTICE_PROVIDER_BRIDGE_ENABLED = false` in the DevTools SW console to revert to the legacy `universalProvider.sendRequest()` path without a code change.

No MV3 reload needed for this plan's deliverables; verification is entirely via the smoke harness + grep + parse-only check. The full reload UAT happens at the end of Phase 7 per the consolidated `.planning/v0.10.0-MILESTONE-AUDIT.md` UAT-1 procedure.

## Wave 3 -> Wave 4 Handoff

**Plan 06-04 (options.js saveSettings trim + checkApiConnection rewrite) may now begin.** The bridge shim `executeViaBridge` is now available via `globalThis.executeViaBridge` (via the Plan 06-02 importScripts line) for options.js to consume. Plan 06-04 will:

1. Apply defense-in-depth `.trim()` to all 7 API key fields in `extension/ui/options.js` `saveSettings()` (lines 977-1029 baseline).
2. Rewrite `checkApiConnection()` (lines 1077-1131 baseline) to read from `elements.apiKey?.value?.trim()` (NOT from chrome.storage) and delegate to `executeViaBridge(providerKey, config, requestBody, {mode: 'test-connection'})`.
3. Fill Part 5(c)+(d) of the smoke (options.js trim grep + checkApiConnection rewrite grep).

**Subsequent plans (all sequential because they touch the same smoke file):**
- Plan 06-05 (INV byte-freeze verification) -- fills Part 6 (INV-04 setTimeout iterator + INV-01/02 tool-definitions-parity + INV-05 deprecated-module absence + INV-06 Lattice byte-freeze).
- Plan 06-06 (Phase ceremony: LATTICE-PIN bump + REQUIREMENTS.md FINT-07/08 flip + audit).

No blockers. The Plan 06-03 deliverable is downstream-unblocking; FINT-08 a + b (bridge shim + agent-loop swap) closed. The xai-key-rejected-400 P1 (missing trim) + P2 (stale storage read) defects are NOT yet closed -- Plan 06-04 closes them as side effects of the saveSettings trim + checkApiConnection rewrite.

## Self-Check: PASSED

- File exists: `extension/ai/lattice-provider-bridge.js` (FOUND, 146 lines).
- File exists: `.planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-03-SUMMARY.md` (FOUND, this file).
- Commit `fd3408a7` exists in `git log` (FOUND, Task 1 commit).
- Commit `f1aa4734` exists in `git log` (FOUND, Task 2 commit).
- Commit `18de341a` exists in `git log` (FOUND, Task 3 commit).
- `node tests/lattice-provider-bridge-smoke.test.js` exits 0 (61 PASS / 0 FAIL).
- `npm test` exits 0 (full chain green; bridge smoke runs as the final entry; agent-loop-empty-contents.test.js regression test patched to pin flag-false).
- `grep -c "FSB_LATTICE_PROVIDER_BRIDGE_ENABLED" extension/ai/agent-loop.js` returns 1 (single LINE; default-on idiom puts 2 token occurrences on 1 line; smoke asserts both LINE-count and TOKEN-count).
- `grep -c "executeViaBridge" extension/ai/agent-loop.js` returns 1 (single invocation in the flag-true branch).
- `grep -c "providerInstance.sendRequest(requestBody)" extension/ai/agent-loop.js` returns 1 (legacy fallback preserved -- Phase 7 archives it).
- `grep -c "setTimeout" extension/ai/agent-loop.js` returns 8 (Phase 5 baseline; INV-04 count invariant preserved).
- `grep -cE "session\._nextIterationTimer\s*=\s*setTimeout" extension/ai/agent-loop.js` returns 4 (INV-04 PATTERN: 4 chained iterators).
- `grep -cE "session\._nextIterationTimer\s*=\s*setTimeout.*runAgentIteration\s*\(\s*sessionId\s*,\s*options\s*\)" extension/ai/agent-loop.js` returns 4 (each iterator block contains runAgentIteration(sessionId, options) on the SAME LINE as setTimeout; single-line iterator block PATTERN invariant).
- `git diff extension/ai/universal-provider.js` returns empty (INV-05 BYTE-FROZEN).
- `git diff extension/ai/tool-use-adapter.js` returns empty (INV-05 BYTE-FROZEN; tool-use-adapter consumes bridge's raw HTTP body shape unchanged).
- `grep -c "executeViaBridge" extension/ai/lattice-provider-bridge.js` returns 4 (function declaration + JSDoc + globalScope assignment + CJS export).
- `grep -c "host_unreachable" extension/ai/lattice-provider-bridge.js` returns 5 (>= 2 minimum; covers sendMessage reject + undefined envelope + null envelope guard + JSDoc taxonomy + error class doc).
- `grep -c "crypto.randomUUID" extension/ai/lattice-provider-bridge.js` returns 3 (typeof check + function call + JSDoc reference).
- `grep -c "removeEventListener" extension/ai/lattice-provider-bridge.js` returns 1 (Pitfall 3 listener cleanup in finally{}).
- Node load test: `node -e "globalThis.crypto = require('crypto').webcrypto; const m = require('./extension/ai/lattice-provider-bridge.js'); console.log(typeof m.executeViaBridge)"` outputs `function`.
- Parse-only check: `node -e "require('vm').compileFunction(require('fs').readFileSync('extension/ai/agent-loop.js', 'utf8'), [])"` exits 0.

---
*Phase: 06-fsb-engine-consumes-lattice-provider-abstraction*
*Completed: 2026-05-27*
