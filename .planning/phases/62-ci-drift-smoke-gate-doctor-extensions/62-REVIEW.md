---
phase: 62-ci-drift-smoke-gate-doctor-extensions
reviewed: 2026-07-16T21:37:23Z
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

# Phase 62 Code Review — Terminal Re-review

## Summary

Iteration three closes the two orderings reported by the preceding review: causal provider-storage delivery is preserved both before the live response and after settlement, and an older expiry projection is discarded for both manual-first and expiry-first completion orders. Timer cancellation/replacement, compatibility-only expiry merging, the newer external generation path, and all asserted non-compatibility and UI identity invariants pass.

Two adjacent supersession gaps remain. A provider-storage debounce armed before a newer manual refresh can be reclassified as queued work and erase that successful refresh. Separately, a newer external/cache-only full evidence generation does not supersede an older expiry projection, so the late expiry result can overwrite it and cancel its deadline. Both were reproduced in the existing source VM harness with controlled response/timer ordering.

All findings predating iteration three remain closed: the daemon/write recursion, stale badge/copy mismatch, exact-boundary expiry defect, doctor Date-range failure, duplicate compatibility live-region ownership, snapshot-only canonical-row defect, stale executable-contract pins, late causal storage ordering, and manual/expiry overlap ordering. This terminal standard review covers the original 34-file Phase 62 scope and iteration-three commits `695b9171` and `7bab77a3` at HEAD `25e9746119d7dbbf86de82a0923022a381599f28`.

## Iteration-Three Disposition

| Reviewed behavior | Terminal disposition |
|---|---|
| Causal provider storage before the live response settles | **Resolved.** One cache-only hydration retains the manual `ready` state, polite announcement, and fresh evidence markers without repeating the daemon request or durable write. |
| Causal provider storage after settlement | **Resolved.** The matching checked-at token preserves the settled manual success through the debounced cache hydration. |
| Newer external provider generation after the causal event | **Resolved for the tested sequential path.** The newer generation hydrates normally and is not suppressed by causal deduplication. |
| Expiry/manual overlap in manual-first and expiry-first completion orders | **Resolved.** Beginning the manual generation invalidates the older expiry projection in both orders. |
| Compatibility expiry timer cancellation/replacement | **Resolved for the tested manual path.** The old deadline cannot fire after the manual generation replaces it, and the newer deadline remains armed. |
| Compatibility-only and non-compatibility/UI invariants | **Resolved.** Expiry work preserves non-compatibility evidence, recommendation, focus, provider/model selection, row order, form values, dirty state, and storage writes. |

## Critical Findings

None.

## Warning Findings

### WR-01 — A pending older provider-storage debounce can erase a newer manual success

**Severity:** Warning

**Files:** `extension/ui/options.js:1277-1420`, `tests/providers-panel-ui.test.js:2610-2767`

**Issue:** A storage notification can arm `providerEvidenceRefreshDebounceHandle` before the user starts a newer manual refresh. Manual generation startup invalidates expiry work but does not cancel or generation-order that pending evidence debounce (`extension/ui/options.js:1289-1296`). If the debounce fires while the manual request is active, it moves its older checked-at value into `providerEvidenceRefreshQueued` (`extension/ui/options.js:1405-1414`). After the newer manual result succeeds, `finally` launches the queued cache hydration (`extension/ui/options.js:1372-1378`). Because the queued checked-at predates the manual result, `getProviderManualSuccessToken()` returns no preservation token, and the ordinary cache path clears the announcement and maps the response to global `stale`.

**Reproduction:** The source VM scheduled a provider-storage event at checked-at 600, began and held a manual refresh that would return checked-at 700, fired the old 100 ms debounce while the manual request was active, then resolved the manual response. The queued cache read ran afterward. Final state was `evidenceStatus === 'stale'` and an empty announcement, with one live request followed by one cache request.

**Impact:** An invalidation already represented by the newer manual result can deterministically erase its visible and accessible success state. The outcome depends on whether an older debounce happens to fire during the manual request.

**Fix:** Supersede or cancel pending older evidence debounce/queued invalidations when a manual generation starts, or retain their observed checked-at values and discard them after a newer manual result. Add a held-response test that schedules checked-at 600, starts manual checked-at 700, fires the debounce during the manual request, and asserts that no older post-manual hydration downgrades `ready` or clears the one success announcement.

### WR-02 — An older expiry projection can overwrite a newer external evidence generation

**Severity:** Warning

**Files:** `extension/ui/options.js:1227-1306`, `extension/ui/options.js:1385-1420`, `tests/providers-panel-ui.test.js:2395-2555`, `tests/providers-panel-ui.test.js:2686-2767`

**Issue:** `refreshProviderCompatibilityProjection()` protects its result with `providerCompatibilityProjectionGeneration`, but only a manual live refresh advances that generation and clears the expiry timer (`extension/ui/options.js:1289-1296`). A full cache-only refresh started by a newer external provider-storage generation does neither. Therefore, if an old expiry read is pending, the newer external hydration can finish first and install Supported compatibility plus a new deadline; the old expiry response can then still pass its generation check, merge Degraded compatibility, and clear the newer deadline through `scheduleProviderCompatibilityExpiry(null)` (`extension/ui/options.js:1231-1248`).

**Reproduction:** The source VM held an old expiry cache response, delivered a newer external provider-storage generation, completed its full cache hydration with Supported compatibility and a newer deadline, then released the old Degraded expiry response. Final compatibility was Degraded and no replacement expiry timer remained; the runtime performed the initial cache read, the held expiry read, and the external hydration read.

**Impact:** Newer external evidence can be overwritten by older automatic expiry work, and its valid deadline can be silently cancelled. The final projection violates checked-at ordering even though each individual path works sequentially.

**Fix:** Any full provider-evidence generation capable of returning a newer compatibility projection—manual or cache hydration—must supersede older expiry work, or expiry application must compare checked-at/generation ordering before merging. Add a held-response test that starts old expiry work, completes a newer external Supported hydration, releases old Degraded expiry, and asserts that Supported compatibility and the newer timer remain unchanged.

## Informational Findings

None.

## Verification Context

- Syntax checks passed for `extension/ui/options.js` and `tests/providers-panel-ui.test.js`.
- Focused stock suites passed: `providers-panel-ui`, `providers-panel-logic`, `mcp-agent-providers-storage`, `mcp-bridge-background-dispatch` (293/0), and `delegation-phase-contract` (763/0).
- The stock UI suite verifies both causal storage orders, the later newer external generation, both expiry/manual completion orders, old-timer cancellation/new-timer replacement, compatibility-only merging, and all non-compatibility/UI identity invariants listed above.
- Two read-only in-memory VM compositions reproduced WR-01's pre-existing-debounce ordering and WR-02's expiry/external-generation ordering. The temporary probe was removed; implementation and test files were not modified.
- `git diff --check a93d6a0f..25e97461` passed.
- No full or guarded root suite, live browser, installed CLI/native integration, network operation, or human UAT was run. All UAT remains deferred to the milestone-end sweep.
- No commit was created by this review. Existing unrelated workspace changes were preserved.

---

**Review status:** Issues found — two warnings remain before Phase 62 is code-review clean.
