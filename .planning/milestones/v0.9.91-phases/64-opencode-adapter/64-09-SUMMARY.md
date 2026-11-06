---
phase: 64-opencode-adapter
plan: "09"
subsystem: browser-delegation-authorization
tags: [opencode, providers, preflight, consent, routing, service-worker]

requires:
  - phase: 64-opencode-adapter
    plan: "06"
    provides: Shipped Claude/OpenCode production roster, compatibility evidence, inventory, and diagnostics projection
provides:
  - One descriptor-safe canonical browser table for shipped Claude Code and OpenCode identity and billing metadata
  - Exact two-provider preflight with authoritative compatibility, pairing, and saved-selection checks
  - Independent provider-bound trust and one-time task challenges with stale-selection rejection
  - Immutable accepted-run provider context for start, streamed events, final settlement, and hydration recovery
affects: [64-10, 64-11, 64-12, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Resolve shipped provider identity through one frozen exact-own-data helper at every browser authorization boundary
    - Keep client start intent provider-free and bind adapter authority only from background-owned saved settings
    - Persist canonical provider identity at accepted start and derive every later event/final context from that immutable record

key-files:
  created:
    - extension/utils/delegation-providers.js
  modified:
    - extension/utils/mcp-agent-providers.js
    - extension/utils/delegation-preflight.js
    - extension/utils/delegation-consent.js
    - extension/utils/delegation-event-store.js
    - extension/utils/delegation-controller.js
    - extension/background.js
    - tests/mcp-agent-providers-storage.test.js
    - tests/delegation-consent.test.js
    - tests/delegation-routing.test.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/mcp-client-merged-view.test.js
    - tests/lattice-provider-bridge-smoke.test.js
    - tests/provider-parity.test.js

key-decisions:
  - "Canonicalize only the exact shipped Claude Code/subscription and OpenCode/unknown records; keep Codex dormant and outside authorization."
  - "Reread and recheck background-owned selection before trust mutation and challenge consumption; never accept provider authority on a side-panel start request."
  - "Commit controller state from the request-bound started callback before resolving Start, then retain a frozen id/label/profileVersion/billingKind context independent of later settings."
  - "Reconstruct evicted-run context only from validated persisted provider/init metadata, never from current settings or daemon-supplied presentation fields."

patterns-established:
  - "Provider-bound authorization: compatibility, trust, challenge, selected adapter, and accepted run identity all use the same canonical id."
  - "Immutable run attribution: once delegation.started matches the selected adapter, settings changes cannot relabel identity or billing."
  - "Closed browser projection: accepted context contains only provider id, canonical label, bounded profile version, and closed billing kind."

requirements-completed: [MULTI-01, MULTI-02]

duration: 42 min
completed: 2026-07-21
---

# Phase 64 Plan 09: Provider Authorization and Immutable Routing Summary

**Browser delegation now authorizes exactly Claude Code or OpenCode through background-owned selection and provider-bound consent, then preserves canonical identity and honest billing in an immutable accepted-run context.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-07-21T00:40:29Z
- **Completed:** 2026-07-21T01:22:25Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 14 implementation/test paths

## Accomplishments

- Added one UMD/CommonJS canonical provider helper whose deeply frozen, descriptor-safe table exposes exactly Claude Code (`subscription`) and OpenCode (`unknown`), while Codex remains unshipped.
- Derived shipped compatibility labels/roster and delegation preflight from that helper, retained the seven API-provider contract, and computed expiry across the exact shipped rows without selection mutation.
- Generalized consent storage to independent Claude/OpenCode trust entries and one-time provider-plus-task challenges while preserving valid legacy Claude-only envelopes, concurrent consume semantics, and provider-change failure before authority consumption.
- Kept `FSB_DELEGATION_START` provider-free; background rereads authoritative saved settings, rechecks preflight, consumes only the matching challenge, and sends the selected canonical adapter id solely at the authenticated `delegate.start` boundary.
- Bound a frozen `{providerId,label,profileVersion,billingKind}` context only after an exact matching `delegation.started` payload and durable controller start; events, finals, terminal cleanup, and eviction hydration no longer consult mutable settings.
- Preserved honest billing across the lifecycle: Claude remains `subscription`, OpenCode remains `unknown`, and neither can inherit the other's identity after a settings change.

## Task Commits

All three planned TDD tasks landed as explicit RED/GREEN pairs:

1. **Canonical provider/preflight RED** — `dbe67229` (test; exact table, shipped roster, compatibility, load order, and provider-free authority negatives)
2. **Canonical provider/preflight GREEN** — `b217baa0` (feat; frozen provider helper plus derived storage/preflight/background composition)
3. **Provider-isolated consent RED** — `3c283580` (test; migration, independent trust, cross-provider replay, stale selection, and concurrency)
4. **Provider-isolated consent GREEN** — `dcffd253` (feat; canonical trust/challenge parsing and background selection rechecks)
5. **Immutable provider routing RED** — `e0d1d900` (test; Claude/OpenCode routing, mismatch, settings race, terminal cleanup, and hydration)
6. **Immutable provider routing GREEN** — `e227606f` (feat; accepted-run context, generalized controller/store persistence, and provider-honest settlement)

Downstream regression fixtures were repaired in separate test-only commits:

7. **Merged-view load-order fixture** — `e8dffb1f` (test; seed the canonical provider helper before its consumer)
8. **Background import-count fixture** — `571fe91f` (test; account for the one new canonical helper import)
9. **Shipped provider parity fixture** — `0a9558df` (test; exact Claude/OpenCode plus supported-compatibility matrix)

## Files Created/Modified

- `extension/utils/delegation-providers.js` — Exact-own-data, deeply frozen Claude/OpenCode metadata and closed lookup/roster validation API.
- `extension/utils/mcp-agent-providers.js` — Derives shipped compatibility roster and labels from the canonical helper while retaining dormant Codex inventory.
- `extension/utils/delegation-preflight.js` — Authorizes either exact shipped provider only with canonical supported compatibility and existing paired/connected evidence.
- `extension/utils/delegation-consent.js` — Isolates provider trust and one-time provider/task challenges with legacy Claude compatibility.
- `extension/background.js` — Owns provider selection rechecks, exact adapter routing, immutable accepted-run contexts, settlement, cleanup, and hydration restoration.
- `extension/utils/delegation-event-store.js` — Persists exact canonical Claude/OpenCode client identity without accepting provider-native extras.
- `extension/utils/delegation-controller.js` — Accepts, snapshots, and hydrates either canonical shipped provider while preserving the legacy Claude default for direct callers.
- `tests/mcp-agent-providers-storage.test.js` — Canonical table, roster, storage, compatibility, and hostile-object coverage.
- `tests/delegation-consent.test.js` — Independent trust, legacy migration, cross-provider challenge, expiry, corruption, and concurrent consume coverage.
- `tests/delegation-routing.test.js` — Exact two-provider preflight and namespace/compatibility negatives.
- `tests/mcp-bridge-background-dispatch.test.js` — Authoritative selection, consent ordering, immutable routing, mismatched adapter, settlement, and hydration contracts.
- `tests/mcp-client-merged-view.test.js` — Production-equivalent canonical-helper load order in isolated VM harnesses.
- `tests/lattice-provider-bridge-smoke.test.js` — Current service-worker import and call-site counts.
- `tests/provider-parity.test.js` — Exact two-provider delegated parity while API-provider routing remains disjoint and unchanged.

## Decisions Made

- Used defensive frozen metadata copies instead of exporting a mutable table reference, so callers cannot change canonical labels or billing classification.
- Kept compatibility observational and provider selection authoritative: neither stored compatibility nor a client request can select, recommend, or write the adapter.
- Placed durable controller start inside the request-bound async bridge callback because the bridge serializes global observers and request events; the global observer validates the closed envelope while the request callback proves the adapter matches the selected provider.
- Restored accepted context after service-worker eviction only when persisted snapshot provider and init client/profile agree exactly.
- Deleted accepted-run context on terminal settlement, terminal stream events, failed start lookup, and boot quarantine; no automatic retry, adoption, or replay was added.

## Security and Verification

- **T64-04 (CRITICAL, consent replay): mitigated.** Provider-free requests, authoritative saved-selection rereads, provider-plus-task challenge binding, pre-consume selection recheck, one-time concurrent consume, and cross-provider negatives all pass.
- **T64-10 (HIGH, metadata disclosure): mitigated.** Canonical exact-key contexts contain only id, label, bounded profile version, and closed billing kind; secret, topology, task, native, path, version-policy, and provider-native fields remain absent.
- **T64-01 (HIGH, adapter authority): mitigated.** Only background preflight converts an exact saved shipped id into `delegate.start.adapterId`; unknown, Codex, case-variant, and mismatched started ids fail closed.
- No HIGH or CRITICAL finding was accepted.

Verification receipts:

- Exact Task 1, Task 2, and Task 3 commands — PASS after each RED/GREEN pair and again as an accumulated gate; bridge dispatcher reported `349 passed, 0 failed`.
- Delegation controller — `39 passed, 0 failed`; event store — `28 passed, 0 failed`; historical phase contract — `1047 passed, 0 failed`; side-panel, provider-storage, merged-view, Providers logic/UI, Lattice bridge, and provider-parity regressions — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` — PASS with fresh source/compiled native boundaries, the complete root extension suite, inner workspace preservation, and outer MCP preservation.
- `verify-agent-provider-flags`, source and compiled `verify-native-host-boundary`, scoped commit-path/whitespace checks, provider-free request source contracts, protected hashes, and canonical context negative scans — PASS.
- Final workspace audit retained branch `automation`, empty staging, the exact original 406 dirty-status entries, six ordinary generated index entries with worktree/index object identity, and all four protected hashes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Generalized persisted controller/event-store provider consumers**

- **Found during:** Task 3 GREEN.
- **Issue:** Routing OpenCode through background alone would still reject or relabel it when the controller persisted its init event and later hydrated the run.
- **Fix:** Reused the canonical provider helper in `delegation-controller.js` and `delegation-event-store.js`, retaining exact shapes, closed validation, and the legacy Claude direct-call default.
- **Files modified:** `extension/utils/delegation-controller.js`, `extension/utils/delegation-event-store.js`.
- **Verification:** Controller `39/0`, event store `28/0`, phase contract `1047/0`, OpenCode start/event/final/hydration bridge matrix PASS.
- **Committed in:** `e227606f`.

**2. [Rule 3 - Blocking] Refreshed three historical downstream fixtures**

- **Found during:** Guarded full-suite verification.
- **Issue:** Isolated merged-view VMs omitted the newly required canonical helper; the Lattice smoke retained pre-helper import counts; provider parity still modeled Claude-only preflight without compatibility evidence.
- **Fix:** Loaded the helper in both merged-view harnesses, advanced the exact import/call-site counts by one, and tested the exact shipped Claude/OpenCode roster with canonical supported compatibility.
- **Files modified:** `tests/mcp-client-merged-view.test.js`, `tests/lattice-provider-bridge-smoke.test.js`, `tests/provider-parity.test.js`.
- **Verification:** Each repaired test passed directly, the remainder of the root chain was screened, and the final complete guarded root suite passed.
- **Committed in:** `e8dffb1f`, `571fe91f`, `0a9558df`.

**3. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** First guarded root-suite invocation.
- **Issue:** The outer wrapper reproduced the known external raw-index stat refresh on six content-clean generated entries while restoring all bytes and protected dirty artifacts.
- **Fix:** Proved the exact six entries ordinary tracked, clean in worktree/staging, and object-identical to the index; temporarily marked only those entries assume-unchanged under EXIT/INT/TERM restoration, excluding the dirty MCP index and three showcase artifacts.
- **Files modified:** None; reversible local index flags only, all restored.
- **Verification:** Final inner and outer preservation markers passed; all six flags returned to ordinary `H`, status returned byte-identically to the 406-entry baseline, and protected hashes matched.
- **Committed in:** n/a.

---

**Total deviations:** 3 auto-fixed (one missing critical persistence consumer, one downstream fixture group, one environmental preservation workaround).
**Impact on plan:** Every change was required to carry the planned exact provider model through existing consumers or keep established regression/preservation gates current. No request-side authority, transport surface, dependency, or product scope was added.

## Issues Encountered

- The first full-suite run exposed the merged-view harness before later gates; the next run exposed the import-count pin; a tail screening pass then exposed provider parity. Each was repaired as a separate test-only commit before the authoritative full rerun.
- A manual compiled identity test after wrapper restoration observed the intentionally restored stale build tree, so it was not counted as evidence; the authoritative guarded suite rebuilt first and passed that integration seam.
- No implementation or security blocker remains.

## User Setup Required

None - no dependency, credential, account, browser, executable, or external-service configuration was added.

## Next Phase Readiness

- Plan 10 can expose provider-neutral side-panel delegation UI against one canonical Claude/OpenCode authorization and run-attribution contract.
- Plans 11-12 can rely on immutable provider identity/billing through lifecycle and result presentation; Plan 13 retains milestone validation and genuine authenticated/browser UAT.
- Codex remains dormant and must enter only through a later explicit shipped-provider plan.
- No active blocker.

## Self-Check: PASSED

- All 14 declared implementation/regression-maintenance paths and this summary exist.
- Three planned RED/GREEN pairs and three separate downstream test-only repairs have exact, reviewable path rosters.
- Exact focused commands, affected delegation/storage/UI regressions, the complete guarded root suite, fresh compiled boundaries, workspace restoration, index-flag restoration, protected hashes, and HIGH/CRITICAL threat checks pass.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-21*
