---
phase: 06-fsb-engine-consumes-lattice-provider-abstraction
fixed_at: 2026-05-27T00:00:00Z
review_path: .planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-05-27T00:00:00Z
**Source review:** .planning/phases/06-fsb-engine-consumes-lattice-provider-abstraction/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01..WR-04; IN-01..IN-06 excluded per critical_warning scope)
- Fixed: 4
- Skipped: 0

**Test gate:** `node tests/lattice-provider-bridge-smoke.test.js` -> 85 PASS / 0 FAIL (baseline preserved across all 4 fixes). `npm test` full chain green at end of session.

**Invariant gate:** INV-04 setTimeout count = 8 preserved; INV-06 LATTICE-PIN.md SHA unchanged; all 6 invariants verified by smoke Part 6.

## Fixed Issues

### WR-01: AbortController race -- empty requestId rejection

**Files modified:** `extension/offscreen/lattice-host.js`
**Commit:** `f6d49b0c`
**Applied fix:** Added explicit `if (!requestId)` guard immediately after the `String(message.requestId || "")` normalization, BEFORE the existing unknown-provider check and BEFORE `_inflightAborts.set(requestId, controller)`. Returns the same synchronous `ok:false / kind:'invalid_provider' / message:'Missing requestId'` envelope shape the unknown-provider branch uses (closed-enum reuse per REVIEW.md guidance). Inline comment block explains why: production traffic synthesizes UUIDs SW-side via `crypto.randomUUID()`, but the offscreen handler is the trust boundary and two concurrent execute calls without a requestId would clobber each other's controllers via `_inflightAborts.set("", ...)`. The fix is structural defense-in-depth, not a runtime fix for a current-traffic bug.

### WR-02: Bridge silent-undefined on missing envelope.response

**Files modified:** `extension/ai/lattice-provider-bridge.js`
**Commit:** `fe603fab`
**Applied fix:** In the `envelope.ok === true` branch, added an explicit `r === undefined || r === null` guard that throws `new Error('Offscreen Lattice host returned empty response in success envelope')` with `err.code = 'adapter_error'`. The legacy ternary `(r && r.rawResponse) ? r.rawResponse : r` is preserved underneath so the success path is unchanged for valid envelopes (both autopilot `{rawResponse: ...}` and test-connection `ProviderRunResponse` shapes). Inline comment block documents the asymmetry the fix closes: missing envelope -> `host_unreachable` throw (existing); missing response in ok envelope -> `adapter_error` throw (new). Forward-defensive; not currently exploitable because the offscreen handler always sets `response`.

### WR-03: Silent contract mismatch on openai baseUrl

**Files modified:** `extension/ai/agent-loop.js`, `extension/offscreen/lattice-host.js`
**Commit:** `c0966eee`
**Applied fix:** Two coordinated changes in a single atomic commit (multi-file fix):
- **agent-loop.js (lines 1054-1056 area):** Removed the `: providerKey === 'openai' ? 'https://api.openai.com/v1'` branch from the `baseUrl:` ternary. The bridge call now only passes a `baseUrl` for `'custom'` (`_settings.customEndpoint`) and `'lmstudio'` (the local-LM endpoint), which are the only branches `computeUrl()` actually honors. Added an inline comment explaining the constraint and pointing future contributors at `computeUrl()` if they want to add proxy support for first-party providers.
- **lattice-host.js computeUrl (lines 176-197 area):** Added a leading comment block listing which provider branches honor `config.baseUrl` (`lmstudio`, `custom`) and which intentionally ignore it (`xai`, `openai`, `anthropic`, `gemini`, `openrouter`). Added an inline `// baseUrl ignored (see WR-03 note above)` marker on the openai case line. Mirrors the hardcoding in `extension/ai/universal-provider.js` `PROVIDER_CONFIGS.endpoint`.

Per REVIEW.md guidance, deferred the "preferred long term" option of having `computeUrl` honor `config.baseUrl` for openai (proxy support) to a follow-on phase; the WR-03 fix only closes the documentation/contract gap.

### WR-04: err.status propagation for terminal classification

**Files modified:** `extension/offscreen/lattice-host.js`, `extension/ai/lattice-provider-bridge.js`
**Commit:** `e60a25ba`
**Applied fix:** Two coordinated changes in a single atomic commit (multi-file fix). The agent-loop catch block (`handleProviderError` at line 2457+) already reads `error.status` and branches on 401/403/400/429 for immediate terminal classification, so no change was needed there:
- **lattice-host.js (autopilot catch block, ~lines 517-530):** The error envelope now includes `status: (err && typeof err.status === "number") ? err.status : undefined`. Used `typeof err.status === "number"` instead of REVIEW.md's `err && err.status` truthiness check because `0` is a valid Number but not a meaningful HTTP status, and a defensive type-check avoids accidentally propagating non-Number values from a future code path. Added inline comment block explaining the propagation chain and the user-visible regression it closes.
- **lattice-provider-bridge.js (`ok:false` branch, ~lines 145-149):** The thrown error now carries `err.status = errObj.status`. Placed immediately after `err.code = errObj.kind || 'adapter_error'` and before `err.providerError = errObj.providerError` for the natural "code, status, providerError" ordering that mirrors a stdlib HTTP error shape. Added inline comment block explaining the contract with the agent-loop catch.

The smoke (Part 3) error-envelope-shape assertions all still pass since they assert presence of `kind`/`message`/`providerError` without asserting the absence of `status`.

---

_Fixed: 2026-05-27T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
