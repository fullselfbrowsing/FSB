---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16T21:12:40Z
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
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 62 Code Review — Final Fix Re-review

## Summary

Iteration two resolves the snapshot-only row defect and the stale executable-contract pins. It also makes the ordinary expiry transition compatibility-only and preserves a manual success when the causal storage event arrives before the live response settles. Two composition gaps remain: the manual-success preservation depends on that event ordering, and the new expiry request is not tracked against a concurrent manual live refresh. Both were reproduced in the existing provider VM harness with adversarial response ordering.

The earlier CR-01 daemon/write recursion, stale badge/copy mismatch, missing exact-boundary expiry, doctor Date-range failure, and duplicate compatibility live-region owner remain resolved. This final standard review covered the original 34-file Phase 62 scope, the prior fix series, and iteration-two commits `79634d66`, `1cbafdcc`, `560db4ba`, `48983332`, and `d005d1eb` at HEAD `d005d1ebc1f27f8ce5812da85527aa9c75555649`.

## Iteration-Two Finding Disposition

| Prior finding | Final disposition |
|---|---|
| WR-01 — manual success erased by causal storage hydration | **Not fully resolved.** The new preservation path works when `fsbAgentProviders` changes while the live promise is still active, and the stock causal test covers that order. If the same cross-context notification is delivered after settlement, the generic debounce path still clears the announcement and changes `ready` to `stale`. |
| WR-02 — expiry mutates unrelated evidence/recommendation | **Core side-effect resolved; concurrency regression remains.** Sequential expiry now merges compatibility only and preserves non-compatibility state. Its cache request is not registered as in flight, so an older expiry response can overwrite a newer manual refresh. |
| WR-03 — snapshot-only compatibility has no agent rows | **Resolved.** A valid snapshot seeds exactly Claude Code, OpenCode, and Codex canonical rows with null clicked/installed/connected/live evidence; recommendation remains the API fallback and API rows are not manufactured. |
| WR-04 — Phase 62 contract pins pre-fix source | **Resolved.** The pins now target the exact `>=` boundary and separated cache/live functions, and the complete contract passes 763/0 without dropping task, requirement, threat, authority, leakage, or deferred-UAT checks. |

## Critical Findings

None.

## Warning Findings

### WR-01 — Manual-success preservation depends on storage-event delivery order

**Severity:** Warning

**Files:** `extension/background.js:244-260`, `extension/ui/options.js:1209-1312`, `extension/ui/options.js:1626-1637`, `tests/providers-panel-ui.test.js:2423-2483`

**Issue:** `preserveSuccessfulRefresh` is passed only when `providerEvidenceRefreshQueued` was set before the live refresh's `finally` clears `providerEvidenceRefreshPromise`. The durable compatibility write and the Options `chrome.storage.onChanged` callback cross extension contexts, but the implementation carries no refresh generation or causal token across that boundary. If `fsbAgentProviders` is delivered after the live promise settles, `scheduleProviderEvidenceRefresh()` sees no active promise and starts its ordinary debounced hydration. That call enters with `preserveSuccessfulRefresh: false`, clears the shared announcement, and maps the valid cache response to global `stale`. The new stock test emits storage synchronously inside the runtime dispatcher before returning the live response, so it exercises only the favorable ordering.

**Reproduction:** A source-only VM composition completed a manual `refreshed` response first, then emitted its causal local storage notification. Final state was `announcement === ''` and `evidenceStatus === 'stale'` after one cache hydration.

**Impact:** Depending on cross-context scheduling, the same successful authenticated refresh can either retain its one polite result or immediately lose it and display stale evidence. The accessibility and visible outcome is nondeterministic.

**Fix:** Carry an explicit manual-refresh generation through the next matching provider-storage hydration, independent of whether the notification arrives before or after promise settlement. Consume it only when the cache projection corresponds to the just-written or newer compatibility snapshot. Add both event-before-response and event-after-settlement cases, asserting one retained announcement, `ready`, no stale markers, one daemon request, and one durable write.

### WR-02 — An untracked expiry read can overwrite a newer manual refresh

**Severity:** Warning

**Files:** `extension/ui/options.js:1157-1206`, `extension/ui/options.js:1209-1233`, `tests/providers-panel-ui.test.js:2251-2361`

**Issue:** `refreshProviderCompatibilityProjection()` checks `providerEvidenceRefreshPromise` at entry but never registers its own cache request in shared in-flight or generation state. Once the expiry request has started, `refreshProviderEvidence({ announce: true })` can concurrently start a live compatibility refresh. If the live response returns fresh Supported evidence first and the older expiry response returns Degraded afterward, the expiry merge applies that older compatibility to the newly refreshed client map and wins final state. The stock expiry test is sequential and resolves the cache projection before any other refresh, so it cannot expose this ordering.

**Reproduction:** A source-only VM composition held the expiry cache response, completed a manual live refresh to Supported, then released the older Degraded expiry response. Final visible compatibility was Degraded while the retained live region still said `Provider status refreshed.`

**Impact:** A user can successfully refresh compatibility and immediately see older stale evidence overwrite it, with the success announcement contradicting the final badge. The stale response also replaces the newer expiry schedule with its own null deadline.

**Fix:** Serialize or generation-order compatibility projections without causing a manual request to coalesce into a cache-only expiry operation. A manual live generation should supersede any older expiry read, and late results must be ignored. Add a held-response test that completes manual Supported before releasing old Degraded and asserts the final Supported projection, matching announcement, and newer deadline remain intact.

## Informational Findings

None.

## Verification Context

- Syntax checks passed for the modified UI/storage sources and all three modified test files.
- Focused stock checks passed: `providers-panel-ui`, `providers-panel-logic`, `mcp-agent-providers-storage`, `mcp-bridge-background-dispatch` (293/0), and `delegation-phase-contract` (763/0).
- WR-03 was verified through the new snapshot-only test: exactly three neutral canonical agent rows, Claude Supported, OpenCode/Codex Unsupported, no API rows, no recommendation authority, and an available Claude expiry deadline.
- WR-04 was verified against the updated exact-boundary and separated cache/live source pins; all 763 contract assertions passed.
- Two read-only in-memory VM compositions reproduced WR-01's late-storage order and WR-02's expiry/manual response race. The temporary probe was removed; implementation and test files were not edited.
- No full or guarded root suite, live browser, installed CLI/native integration, network operation, or human UAT was run. All UAT remains deferred to the milestone-end sweep.
- No commit was created by this review. Existing unrelated workspace changes were preserved.

---

**Review status:** Issues found — two warnings remain before Phase 62 is code-review clean.
