---
phase: 64-opencode-adapter
plan: "06"
subsystem: agent-provider-evidence-projection
tags: [opencode, inventory, diagnostics, compatibility, browser-storage, fail-closed]

requires:
  - phase: 64-opencode-adapter
    plan: "04"
    provides: Retained bounded OpenCode executable/version detector and closed diagnostic codes
  - phase: 64-opencode-adapter
    plan: "05"
    provides: Exact ordered Claude Code/OpenCode production registry and compatibility matrix
provides:
  - Browser-safe availability-only inventory for the exact Claude Code/OpenCode provider roster
  - Local bounded doctor evidence for both providers with OpenCode auth fixed to unknown
  - Exact fail-closed daemon compatibility projection with no local/native field leakage
  - Shipped Claude/OpenCode browser compatibility roster while Codex remains unshipped
affects: [64-07, 64-08, 64-09, 64-10, 64-11, 64-12, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Reuse retained provider detection for local evidence and strip it to availability before browser transport
    - Validate registry and matrix as an exact ordered bijection before collecting or projecting evidence
    - Consume only closed diagnostic codes and descriptor-safe own data across daemon/browser boundaries

key-files:
  created: []
  modified:
    - mcp/src/client-inventory.ts
    - mcp/src/diagnostics.ts
    - mcp/src/agent-providers/serve-delegation.ts
    - extension/utils/mcp-agent-providers.js
    - tests/mcp-client-inventory.test.js
    - tests/mcp-diagnostics-status.test.js
    - tests/mcp-adapter-compatibility.test.js
    - tests/mcp-agent-providers-storage.test.js
    - tests/mcp-bridge-topology.test.js
    - tests/delegation-phase-contract.test.js
    - tests/mcp-client-identity.test.js
    - tests/mcp-client-merged-view.test.js
    - tests/mcp-client-identity-integration.test.js

key-decisions:
  - "Keep browser inventory at exactly detected and checkedAt; executable path, version, auth, model, config, native evidence, and diagnostic text remain local-only."
  - "Require the exact canonical Claude Code then OpenCode registry/matrix order before detection; any missing, duplicate, orphan, case-varied, reordered, accessor, prototype, or malformed evidence fails closed."
  - "Ship exactly Claude Code and OpenCode in compatibility storage while Codex remains adapter_unshipped, and keep every compatibility update observational with no selection, recommendation, settings, dirty-state, or spawn authority."

patterns-established:
  - "Evidence-plane split: local doctor may show bounded executable/version facts, browser inventory and compatibility may not."
  - "Canonical fallback: roster corruption still emits the exact two canonical Unsupported/matrix_invalid rows instead of omitting or trusting hostile identities."
  - "Stable-code classification: version_malformed derives from the retained detector's closed version_unparseable code, never provider-controlled message text."

requirements-completed: [MULTI-01, MULTI-02, MULTI-03]

duration: 38 min
completed: 2026-07-20
---

# Phase 64 Plan 06: Closed Two-Provider Evidence Projection Summary

**The exact Claude Code/OpenCode production roster now drives consistent local inventory and doctor evidence plus a descriptor-safe browser compatibility snapshot, with Codex unshipped and all local/native authority stopped at the daemon boundary.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-07-20T22:03:10Z
- **Completed:** 2026-07-20T22:41:16Z
- **Tasks:** 2 TDD tasks
- **Files modified:** 13 implementation/test paths

## Accomplishments

- Reused `createOpenCodeDetector` for inventory rather than adding a competing PATH or semver implementation, then reduced every browser-bound inventory record to exactly `{detected, checkedAt}`.
- Made local doctor collection iterate the exact compatibility matrix, retain only bounded operator-facing binary/version/status/reason evidence, leave auth unknown, and fail closed to canonical rows when registry/matrix membership disagrees.
- Closed daemon compatibility projection over the exact ordered Claude Code/OpenCode bijection and mapped malformed OpenCode evidence through the detector's stable diagnostic code rather than its message.
- Promoted the existing OpenCode Providers compatibility label while keeping Codex unshipped and accepting only exact descriptor-safe snapshot objects in extension storage and hydration.
- Proved installed, exact, newer, missing, malformed, changed-identity, roster-corruption, accessor/prototype, sentinel-leak, and observational-non-authority cases across inventory, doctor, daemon projection, and browser storage.

## Task Commits

The two planned TDD tasks landed as explicit RED/GREEN pairs:

1. **Inventory and doctor RED tests** — `98feac5f` (test; exact two planned test paths)
2. **Inventory and doctor GREEN implementation** — `18ca71b9` (feat; exact two planned source paths)
3. **Safe compatibility RED tests** — `57100315` (test; exact two planned test paths)
4. **Safe compatibility GREEN implementation** — `716264e6` (feat; exact two planned source paths)

Four proven stale historical/downstream fixtures discovered during affected and full-suite verification were refreshed in isolated test-only commits:

5. **Refresh bridge compatibility roster fixture** — `dfd1c44b` (`tests/mcp-bridge-topology.test.js` only)
6. **Refresh canonical doctor source pin** — `eef58ff3` (`tests/delegation-phase-contract.test.js` only)
7. **Refresh runtime inventory identity fixture** — `3ea25c39` (`tests/mcp-client-identity.test.js` only)
8. **Refresh downstream inventory projection fixtures** — `8c1e9e1d` (exactly the merged-view and identity-integration tests)

## Files Created/Modified

- `mcp/src/client-inventory.ts` — Shared retained OpenCode detection, exact canonical roster enforcement, bounded retained-evidence validation, and availability-only browser records.
- `mcp/src/diagnostics.ts` — Descriptor-safe local two-provider doctor collection, exact matrix/registry parity, canonical failure rows, and unknown auth.
- `mcp/src/agent-providers/serve-delegation.ts` — Exact safe compatibility collector with closed roster validation, stable diagnostic-code mapping, and local/native field removal.
- `extension/utils/mcp-agent-providers.js` — Exact shipped Claude/OpenCode labels and strict availability-only inventory storage while Codex remains unshipped.
- `tests/mcp-client-inventory.test.js` — Shared-detector consistency, browser-key closure, evidence variants, roster attacks, and sentinel negatives.
- `tests/mcp-diagnostics-status.test.js` — Exact local doctor rows, bounded fields, unknown auth, stable reasons, hostile descriptors, and roster mismatch.
- `tests/mcp-adapter-compatibility.test.js` — Exact daemon projection, malformed/changed/newer cases, closed roster attacks, safe keys, and no-authority source assertions.
- `tests/mcp-agent-providers-storage.test.js` — Exact shipped roster, strict storage/hydration grammar, Codex-unshipped behavior, hostile descriptors, sentinel stripping, and state non-authority.
- `tests/mcp-bridge-topology.test.js` — Historical one-provider bridge fixture updated to the exact two-provider projection.
- `tests/delegation-phase-contract.test.js` — Historical doctor source pin updated to the current canonical matrix iteration token.
- `tests/mcp-client-identity.test.js` — Historical runtime inventory fixture updated to provide the required roster and expect availability-only records.
- `tests/mcp-client-merged-view.test.js` — Downstream merged-view fixture updated to the exact provider roster without browser-local path/version fields.
- `tests/mcp-client-identity-integration.test.js` — Downstream integration fixture updated to the exact provider roster without browser-local path/version fields.

## Decisions Made

- Required exact canonical membership and order at each projection boundary. A count match is insufficient; missing, duplicate, orphan, case-varied, reordered, inherited, accessor-bearing, or non-data entries fail closed before adapter detection runs.
- Preserved the retained detector as the only OpenCode version-evidence policy. Inventory validates only that retained evidence is bounded, while doctor and compatibility consume the detector's closed result and diagnostic code without inventing another semver rule.
- Kept local and browser evidence deliberately asymmetric. Local doctor may display bounded executable/version evidence to the local operator, but inventory and extension storage receive neither field and cannot reconstruct them from error text or native objects.
- Returned exactly two canonical Unsupported/matrix_invalid rows on registry/matrix corruption. This keeps the browser grammar stable without trusting hostile roster identities or silently omitting a shipped provider.
- Kept compatibility strictly observational. The projection and storage paths contain no provider selection, recommendation, persistence mutation, dirty-state, spawn, endpoint, topology, port, billing, or credential authority.

## TDD Evidence

- **Task 1 RED:** `98feac5f` added exact inventory/doctor assertions and the plan command failed because OpenCode still flowed through the generic platform resolver rather than the retained provider detector.
- **Task 1 GREEN:** `18ca71b9` reused the retained detector and closed both projections; the exact inventory/doctor wrapper passed, including `298/298` doctor assertions.
- **Task 2 RED:** `57100315` added safe compatibility/storage assertions and the plan command failed because malformed OpenCode evidence was classified as `version_missing` rather than the required stable `version_malformed` result.
- **Task 2 GREEN:** `716264e6` closed daemon projection and browser storage; the exact compatibility/storage wrapper passed.
- Every RED commit changed only its two planned tests, and every GREEN commit changed only its two planned source files.
- The complete Plans 01-05 parser, fixture, drift, provider contract, supervisor, orphan recovery, detector, profile policy, attestation, forbidden-flags, composition, and compatibility regression roster passed through the workspace-preserving builder.
- The final complete guarded root suite exited 0 with `[phase60-full-tests] PASS`, `[mcp-build-preserver] PASS`, and `suite=0 postcheck=0`.

## Security and Privacy

- Browser inventory and durable storage accept no executable path, raw version, semver policy, auth, billing, model, config, native event/body, diagnostic text, endpoint, port, topology, secret, or provider-controlled extra field.
- Own-data and prototype checks run before consuming registries, methods, records, or retained evidence. Accessors are never invoked as a side effect of validation.
- Roster corruption prevents adapter detection and projects canonical unsupported evidence; it cannot inject an identity, obtain an omission, or smuggle a local/provider field downstream.
- Malformed-version classification uses `version_unparseable`, a closed detector diagnostic code. Provider-controlled messages and private fields are discarded.
- OpenCode auth remains exactly unknown. No credential/config/model body is read, printed, stored, or used to infer billing or spawn readiness.
- Compatibility cannot select or recommend a provider, mutate settings or dirty state, grant spawn authority, or change the existing Codex unshipped posture.
- T64-05 and T64-10 are mechanically mitigated by exact/newer/missing/malformed/changed-identity, roster-bijection, hostile-descriptor, sentinel-leak, and authority-negative tests. No HIGH/CRITICAL threat was accepted.
- Genuine authenticated provider/account/browser behavior remains milestone-end human UAT; no live evidence was fabricated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Refreshed the stale one-provider bridge compatibility fixture**

- **Found during:** Adjacent bridge regression verification after Task 2 GREEN.
- **Issue:** The historical fixture still modeled a Claude-only compatibility response even though Plan 05 made the production roster exactly Claude Code/OpenCode.
- **Fix:** Updated only that test's fixture and expectation to the exact two-provider roster.
- **Verification:** The combined bridge/diagnostics/inventory regression bundle passed `311/311` assertions.
- **Committed in:** `dfd1c44b`.

---

**2. [Rule 3 - Blocking] Refreshed the stale historical doctor source pin**

- **Found during:** First guarded root-suite run.
- **Issue:** The Phase contract test pinned the removed `requireMethod.call(registry, adapterId)` source shape rather than the canonical matrix contract id now used by doctor.
- **Fix:** Updated only the historical source assertion to pin `contract.adapterId`; no production behavior changed.
- **Verification:** Historical delegation contract passed `1047/1047` assertions.
- **Committed in:** `eef58ff3`.

---

**3. [Rule 3 - Blocking] Refreshed the stale runtime inventory identity fixture**

- **Found during:** Guarded root-suite rerun after the source-pin correction.
- **Issue:** The fixture omitted the newly required exact provider roster and expected browser-local path/version fields that Plan 06 intentionally removes.
- **Fix:** Supplied the exact canonical roster and asserted availability-only records in that test alone.
- **Verification:** Runtime inventory identity regression passed, followed by the complete root suite.
- **Committed in:** `3ea25c39`.

---

**4. [Rule 3 - Blocking] Refreshed two downstream inventory projection fixtures**

- **Found during:** Proactive downstream merged-view and integration verification.
- **Issue:** Both fixtures retained the old local path/version browser shape and lacked the exact canonical provider roster.
- **Fix:** Updated only those two related tests to the exact roster and availability-only projection.
- **Verification:** Merged view, client identity integration, onboarding clicks, and Providers logic/UI regressions all passed.
- **Committed in:** `8c1e9e1d`.

---

**5. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** Guarded repository-wide verification.
- **Issue:** The outer preservation wrapper detects known external Git stat-refresh interference on seven content-clean generated entries even when the inner tests pass.
- **Fix:** Proved each exact candidate had no worktree/staged diff, was ordinary tracked, and was object-identical to the index before temporarily setting assume-unchanged under EXIT/INT/TERM restoration. The pre-existing dirty `mcp/build/index.js` was excluded and hash-protected.
- **Files modified:** None; temporary local index flags only, all restored.
- **Verification:** Final markers were `suite=0 postcheck=0`; all seven candidates returned to uppercase `H` with worktree/index OIDs identical, and all four protected hashes matched their initial values.
- **Committed in:** n/a.

---

**Total deviations:** 5 auto-fixed blocking regression/environmental conditions.
**Impact on plan:** The planned implementation stayed within its four source paths and four TDD tests. Historical fixture changes were isolated in four test-only commits; the index workaround changed no file bytes or committed state.

## Issues Encountered

- `node tests/delegation-phase-contract.test.js --section phase64-validation` is not available in the current historical harness; its usage lists only Phase 63 sections because Phase 64 Plan 13 owns that validation section. This is expected future work and does not block Plan 06.
- The first unmitigated full-suite attempts correctly exposed the four stale historical/downstream fixtures above before the final exact guarded run passed.

## User Setup Required

None - no dependency, service, credential, account, browser, executable, or local configuration was added.

## Verification

- Exact Task 1 inventory/doctor workspace-preserving command — PASS; doctor `298/298`.
- Exact Task 2 compatibility/storage workspace-preserving command — PASS.
- Plans 01-05 parser, fixture, drift, provider contract, spawn supervisor, orphan recovery, detector, profile policy, attestation, forbidden flags, composition, and compatibility regression bundle — PASS.
- Claude adapter, reverse channel, bridge topology/auth/lifecycle/background dispatch, inventory, diagnostics, and storage regression bundle — PASS; combined bridge-focused assertions `311/311`.
- Historical delegation phase contract — `1047/1047 passed`.
- Onboarding clicks, merged view, client identity integration, and Providers logic/UI downstream bundle — PASS.
- Drift diagnostics, forbidden flags, `verify-agent-provider-flags`, and `verify-native-host-boundary --source` — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` — PASS with inner full-suite, outer workspace-preservation, and restoration postcheck green.
- Scoped `git diff --check`, exact commit path rosters, owned-path clean status, empty staged set, branch `automation`, restored uppercase-`H` index flags, worktree/index object identity, and protected generated-file hashes — PASS.

## Next Phase Readiness

- Plan 07 can bind runtime-owned OpenCode profile resolution and opaque secret materialization to the already-stable adapter and evidence identities.
- Plans 08-12 can build attach, result, lifecycle, and provider-neutral UI behavior against the exact shipped Claude/OpenCode observational roster without widening browser authority.
- Plan 13 remains responsible for the Phase 64 validation section and milestone-end authenticated account/browser UAT.
- No active blocker.

## Self-Check: PASSED

- All 13 declared implementation/regression-maintenance paths plus this summary exist.
- The two RED commits each contain exactly two planned tests; the two GREEN commits each contain exactly two planned source files; all four maintenance commits are test-only with their declared path rosters.
- Exact focused commands, predecessor/adjacent/downstream regressions, the complete guarded root suite, workspace preservation, index restoration, protected hashes, and scoped security/privacy checks pass.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
