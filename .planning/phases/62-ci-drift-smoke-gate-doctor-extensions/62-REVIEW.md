---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16T19:56:07Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - .github/workflows/ci.yml
  - extension/background.js
  - extension/ui/control_panel.html
  - extension/ui/options.css
  - extension/ui/options.js
  - extension/ui/providers-panel.js
  - extension/utils/agent-protocol-drift-diagnostics.js
  - extension/utils/mcp-agent-providers.js
  - extension/ws/mcp-bridge-client.js
  - mcp/src/agent-providers/claude-detect.ts
  - mcp/src/agent-providers/claude-profile.ts
  - mcp/src/agent-providers/compatibility.ts
  - mcp/src/agent-providers/serve-delegation.ts
  - mcp/src/agent-providers/spawn-supervisor.ts
  - mcp/src/diagnostics.ts
  - mcp/src/index.ts
  - package.json
  - tests/agent-protocol-drift-diagnostics.test.js
  - tests/delegation-phase-contract.test.js
  - tests/mcp-adapter-compatibility.test.js
  - tests/mcp-agent-drift-smoke.test.js
  - tests/mcp-agent-providers-storage.test.js
  - tests/mcp-bridge-background-dispatch.test.js
  - tests/mcp-bridge-client-lifecycle.test.js
  - tests/mcp-bridge-topology.test.js
  - tests/mcp-claude-code-adapter.test.js
  - tests/mcp-client-identity-integration.test.js
  - tests/mcp-client-merged-view.test.js
  - tests/mcp-diagnostics-status.test.js
  - tests/mcp-reverse-channel-contract.test.js
  - tests/mcp-spawn-supervisor.test.js
  - tests/mcp-version-parity.test.js
  - tests/providers-panel-logic.test.js
  - tests/providers-panel-ui.test.js
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
status: issues_found
---

# Phase 62 Code Review

## Summary

Phase 62 has one critical integration defect and three narrower correctness gaps. The matrix, detector/profile, spawn supervision, drift redaction, and bounded smoke-gate work are otherwise internally consistent with the phase plans. The blocking issue is cross-context: a successful compatibility refresh writes the same storage key whose Options listener requests another successful compatibility refresh, creating an unbounded sequential probe/write loop while the panel is open and the daemon is paired.

The review cross-referenced `62-CONTEXT.md`, `62-RESEARCH.md`, `62-UI-SPEC.md`, all six Phase 62 plans and summaries, `62-VALIDATION.md`, and `62-HUMAN-UAT.md`. No live UAT was performed; the three milestone-end UAT rows remain deferred as requested.

## Critical Findings

### CR-01 — Compatibility persistence recursively starts another live compatibility refresh

**Severity:** Critical

**Files:** `extension/background.js:142-153`, `extension/background.js:8674-8682`, `extension/utils/mcp-agent-providers.js:366-375`, `extension/ui/options.js:1030-1044`, `extension/ui/options.js:1082-1091`, `extension/ui/options.js:1433-1441`

**Issue:** Every `getMcpClients` request invokes `fsbRefreshMcpCompatibility()`. When paired, that function requests a new daemon snapshot and durably replaces `fsbAgentProviders`. The Options storage listener treats that replacement as an invalidation and schedules another `refreshProviderEvidence()`, which sends another `getMcpClients`. If the storage event arrives while the first request is pending, the `providerEvidenceRefreshQueued` branch explicitly starts the next request after settlement; if it arrives later, the debounce starts it. Each daemon snapshot advances `checkedAt`, so the replacement continues to generate a real storage change. Promise coalescing bounds concurrent work but cannot stop this sequential feedback loop.

**Impact:** With Options open and the bridge paired, one refresh can continuously probe the CLI/version, cross the reverse channel, and write extension storage. It can persist until the view or pairing state changes, causing unnecessary process work, storage churn, UI rerenders, and bridge traffic.

**Fix:** Separate cached inventory reads from explicit live compatibility refreshes. For example, keep a read-only `getMcpClients` path that only projects durable cache and live registry data, and expose a distinct exact-shape refresh action used by the manual button and the bounded pairing refresh. A `fsbAgentProviders` storage event must hydrate/reproject cached state without causing another daemon request or compatibility write. Add an integrated regression harness that wires `replaceCompatibility` through a storage-change event into the Options listener and proves one user refresh produces exactly one daemon request and one durable write.

**Why tests missed it:** `tests/mcp-bridge-background-dispatch.test.js` validates background refresh persistence without an Options storage listener, while `tests/providers-panel-ui.test.js:2165-2216` emits storage changes without making its runtime mock persist another compatibility snapshot. Each half passes independently, but the production feedback edge is not composed.

## Warning Findings

### WR-01 — A stale refresh outcome can contradict the compatibility badge and announcement

**Severity:** Warning

**Files:** `extension/background.js:121-127`, `extension/background.js:160-162`, `extension/utils/mcp-agent-providers.js:424-428`, `extension/ui/options.js:1044-1062`

**Issue:** The background labels any valid cached snapshot as `stale` after a refresh failure, irrespective of the cache age or row status. It then independently projects the cached clients at the current time. A fresh cached `supported` row therefore remains Supported, and a cached `unsupported` row remains Unsupported, while Options announces: “Cached support is now Degraded.” The existing UI test supplies a pre-degraded client row alongside `refreshOutcome: 'stale'`, so it does not cover the contradictory combinations the background can actually return.

**Fix:** Make the outcome and returned projection one coherent state. Either project eligible supported cache to `degraded/evidence_stale` whenever returning `stale`, or derive truthful failure copy from the actual selected compatibility model instead of assuming Degraded. Add background-to-UI cases for refresh failure with fresh supported, already degraded, and unsupported cached rows.

### WR-02 — An open panel never ages Supported evidence into Degraded

**Severity:** Warning

**Files:** `extension/utils/mcp-agent-providers.js:398-428`, `extension/ui/options.js:1030-1049`, `extension/ui/providers-panel.js:288-326`

**Issue:** The 15-minute freshness rule is applied only when the background constructs a merged-client projection. Options stores that projected row, and the display helper trusts its status/reason without comparing `checkedAt` to current time. There is no compatibility-expiry timer. Consequently, a panel that received Supported evidence can display Supported indefinitely after the freshness bound if no section entry, storage event, or manual refresh causes another projection. This violates the phase requirement that cached support visibly becomes Degraded once stale. CR-01 currently causes incidental refresh traffic, but removing that loop without adding a bounded expiry path exposes this defect directly.

**Fix:** Schedule one cache-only re-projection for the next compatibility expiry (`checkedAt + FSB_AGENT_COMPATIBILITY_MAX_AGE_MS`), cancel and replace it when a newer snapshot arrives, and do not contact the daemon or write storage from that timer. Alternatively, derive the effective display status from `checkedAt` and a validated current clock on each render. Cover the boundary with fake-clock tests and verify no live refresh or authority mutation occurs.

### WR-03 — A safe-integer injected clock can still crash doctor timestamp formatting

**Severity:** Warning

**File:** `mcp/src/diagnostics.ts:187-193`, `mcp/src/diagnostics.ts:680-686`

**Issue:** `readNowMs()` accepts every non-negative safe integer, but JavaScript `Date` supports only values through `8_640_000_000_000_000`. A dependency seam returning `8_640_000_000_000_001` passes validation and makes `new Date(nowMs).toISOString()` throw `RangeError: Invalid time value`, aborting doctor instead of failing malformed clock authority closed. The existing malformed-authority coverage tests future rotation metadata but not an out-of-Date-domain injected `now` value.

**Fix:** Validate the clock against the ECMAScript Date range before returning it, and/or wrap ISO formatting and fall back to the deterministic epoch on failure. Add a regression using the first safe integer above the Date maximum and assert doctor still returns a bounded snapshot with no exception text.

## Informational Findings

None.

## Verification Context

- Review-time focused checks passed: `mcp-agent-providers-storage`, `mcp-bridge-background-dispatch` (275 assertions), `providers-panel-logic`, and `providers-panel-ui`.
- A direct standalone run of `mcp-diagnostics-status` reported 58 passes and 26 formatting failures because that test imports `mcp/build/*`, while the protected generated build artifact was intentionally not regenerated. `package.json` normally runs `npm --prefix mcp run build` before this test. This standalone result is therefore recorded as non-authoritative workspace evidence, not as an additional source finding.
- The guarded full-suite wrapper was previously invoked exactly once. It failed at `tests/mcp-client-identity-integration.test.js:395` because the extracted background VM harness did not yet model the additive `fsbRefreshMcpCompatibility` dependency and compatibility row. Commit `f3ffcefe` repaired that harness; the guarded wrapper was deliberately not rerun.
- Post-fix focused evidence recorded by Plan 06 is green for `mcp-client-identity-integration`, all six Phase 57 identity/provider tests, provider storage and merged view, bridge lifecycle and background dispatch, provider logic, the Plan 06 gates, and the delegation phase contract (763 assertions). This does not establish a post-fix full-suite pass; that confirmation remains outstanding.
- No implementation or test files were modified, no protected artifacts were regenerated, and no commit was created by this review.

---

**Review status:** Issues found — CR-01 should be resolved before Phase 62 is treated as code-review clean.
