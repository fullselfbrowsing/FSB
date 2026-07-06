---
phase: 07-archive-fsb-custom-provider-stack
reviewed: 2026-05-28T09:38:19Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - extension/ai/agent-loop.js
  - extension/ai/lattice-provider-bridge.js
  - tests/lattice-provider-bridge-smoke.test.js
  - tests/agent-loop-empty-contents.test.js
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-28T09:38:19Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 7 Plan 07-01 performs a clean, surgical strip of the
`FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` feature flag from `agent-loop.js` and
flips the corresponding smoke-test assertions from "expect present" to
"expect absent". The diff is minimal and the surface area is contained
exactly where the Phase 7 plan promised:

- `extension/ai/agent-loop.js` — the `if (flag) executeViaBridge(...) else providerInstance.sendRequest(...)`
  wrapper at the tail of `callProviderWithTools` is collapsed into a single
  unconditional `return executeViaBridge(...)` call (lines 1044-1067). The
  surrounding `providerInstance` metadata reads (`.config.keyField`,
  `.settings[keyField]`, `.model`, `customEndpoint`, `lmstudioBaseUrl`) are
  preserved, which is correct under Strategy B (universal-provider.js stays
  on disk as a metadata-only shim).
- `extension/ai/lattice-provider-bridge.js` — JSDoc lines 17-20 add a
  Phase 7 amendment paragraph; boot log at line 169 reads "Phase 7 bridge
  shim registered (unconditional; legacy fallback removed)". Functional
  code is byte-identical to Phase 6.
- `tests/lattice-provider-bridge-smoke.test.js` — Part 5 Phase 7 fill at
  lines 573-583 asserts ZERO `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED` line/
  token occurrences, exactly 1 `executeViaBridge(` call site, 0
  `providerInstance.sendRequest(requestBody)` calls, and preserves the
  INV-04 setTimeout count = 8. Assertion messages intentionally embed the
  flag literal because they verify its absence.
- `tests/agent-loop-empty-contents.test.js` — fully rewired from the Phase 6
  `FSB_LATTICE_PROVIDER_BRIDGE_ENABLED=false` legacy stub to a
  `chrome.runtime.sendMessage` intercept that captures
  `envelope.requestBody` and returns a minimal `{ok:true, response:{rawResponse:{...}}}`
  envelope. Issue #29 regression coverage (gemini empty `contents`,
  anthropic empty `messages`, xai empty `messages`) is preserved.

Hard invariants verified preserved by the diff itself:
- INV-04: `setTimeout` count = 8, iterator pattern hits = 4 (asserted in
  smoke Part 5).
- INV-05 / INV-06: out of Phase 7 scope (Strategy B keeps
  universal-provider.js; Lattice SHA unchanged).

No critical issues. No warnings. Three info-level observations follow,
all pre-existing or stylistic.

## Info

### IN-01: AbortSignal is never plumbed from agent loop into bridge

**File:** `extension/ai/agent-loop.js:957`, `extension/ai/agent-loop.js:1061-1067`
**Issue:** `callProviderWithTools` does not accept or forward an
`AbortSignal`, and the unconditional bridge call at line 1061 passes only
`{ mode: 'autopilot' }` as opts. `executeViaBridge` supports `opts.signal`
with a full abort message companion (lines 78-87 of
`lattice-provider-bridge.js`) and the offscreen handler honors it (smoke
Part 4 (a) at lines 472-500 of the smoke test exercises it), but the
production autopilot loop has no path to cancel an in-flight provider
request. This is pre-existing behavior carried unchanged from Phase 6 —
Phase 7's flag strip neither introduces nor worsens it — but it is worth
recording because the bridge's abort plumbing is dead code from the
autopilot's perspective until a future plan threads `session.abortController.signal`
through `callProviderWithTools` -> `executeViaBridge`.
**Fix:** Out of Phase 7 scope. Track as a follow-on (e.g., Phase 8+ or
v0.11.0 ergonomics pass):
```javascript
// agent-loop.js callProviderWithTools signature
async function callProviderWithTools(providerInstance, model, apiKey, messages, tools, providerKey, opts) {
  // ...
  return executeViaBridge(providerKey, {...}, requestBody, {
    mode: 'autopilot',
    signal: opts && opts.signal
  });
}
// agent-loop.js call site at ~line 1699
response = await callProviderWithTools(
  providerInstance, model, null, turnMessages, session.tools, providerKey,
  { signal: session.abortController && session.abortController.signal }
);
```

### IN-02: `apiKey` parameter remains unused after flag strip

**File:** `extension/ai/agent-loop.js:951`, `extension/ai/agent-loop.js:957`
**Issue:** The `apiKey` parameter of `callProviderWithTools` was already
documented as "unused, kept for interface consistency" pre-Phase 7. After
the flag strip the apiKey-equivalent now flows exclusively through
`_settings[_cfg.keyField]` at line 1062, making the parameter even more
clearly vestigial. Every caller (line 1700 + the empty-contents test at
lines 74, 84, 90, 96) passes `null`. Removing the parameter is a
breaking-signature change and out of Phase 7 scope (Phase 7 ethos: minimal
diff, byte-frozen elsewhere), so this is INFO not WARN. The current
docstring already acknowledges this, so no action is required for Phase 7
correctness.
**Fix:** Defer to a future ergonomics pass; document in
`07-VERIFICATION.md` follow-ups if not already captured. The signature
collapse can be done atomically with IN-01's `opts` addition.

### IN-03: Empty-contents test never resets `globalThis.chrome` between providers

**File:** `tests/agent-loop-empty-contents.test.js:19-34`
**Issue:** The test installs `globalThis.chrome` once at module top and
re-uses the same `sendMessage` stub across all four provider scenarios
(gemini empty, gemini ongoing, anthropic empty, xai empty). The closure
variable `lastCapturedRequestBody` IS correctly reset to `null` before
each `callProviderWithTools` call (lines 73, 83, 89, 95) which keeps the
assertions hermetic, so this is not a correctness bug — but a test that
runs in parallel with another suite that also writes `globalThis.chrome`
would leak state. Today the test runs serially under `node tests/...` and
no other suite mutates `globalThis.chrome` during its execution window, so
the risk is theoretical.
**Fix:** Optional hardening — wrap state install/teardown in a
try/finally so the chrome stub is removed after the suite exits:
```javascript
const _origChrome = globalThis.chrome;
globalThis.chrome = { runtime: { id: 'fsb-test', sendMessage: async (envelope) => { /* ... */ } } };
try {
  require('../extension/ai/lattice-provider-bridge.js');
  const { callProviderWithTools } = require('../extension/ai/agent-loop.js');
  await run();
} finally {
  if (_origChrome === undefined) delete globalThis.chrome; else globalThis.chrome = _origChrome;
}
```
Acceptable to defer — current behavior is bug-free under the serial test
chain.

---

_Reviewed: 2026-05-28T09:38:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
