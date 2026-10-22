---
phase: 52-on-demand-hud-lifecycle-primitive-shell
plan: 01
subsystem: lifecycle
tags: [chrome-extension, mv3, state-machine, cancellation, node-tests]

requires:
  - phase: v1.1.0
    provides: Chrome MV3 extension baseline and established overlay lifecycle conventions
provides:
  - Pure tab-scoped Skopeo lifecycle reducer with monotonic generation admission
  - Terminal tombstones that reject delayed work before, during, and after teardown
  - Deterministic deferred-completion, reinvocation, idempotence, and tab-isolation regression contract
affects: [52-03-skopeo-runtime, 52-04-mv3-controller, 52-06-release-evidence]

tech-stack:
  added: []
  patterns: [classic-script/CommonJS dual export, generation-first termination, pure immutable reducer]

key-files:
  created:
    - extension/utils/skopeo-session-state.js
    - tests/skopeo-session-lifecycle.test.js
  modified: []

key-decisions:
  - "OFF retains the ended generation as terminalGeneration; only BEGIN from OFF can allocate a strictly newer generation."
  - "STARTING and ACTIVE accept work only for their exact generation, while TERMINATING and OFF accept none."
  - "The sole retained ACTIVE reason is prepared-awaiting-commit, cleared only by a matching COMMIT_READY event."

patterns-established:
  - "Terminal-before-cleanup: TERMINATE writes terminalGeneration before any caller begins resource cleanup."
  - "Explicit tab authority: every reducer event carries a positive tabId and cannot select a different tab's record."
  - "Two-sided stale-work gate: asynchronous callers must pair their own cancellation with acceptsGeneration at commit/render time."

requirements-completed: [HUD-02, HUD-03]

duration: 9min
completed: 2026-07-14
---

# Phase 52 Plan 01: Per-Tab Generation Reducer Summary

**A pure generation-first lifecycle now makes each ended Skopeo session terminal, tab-local, JSON-safe, and immune to delayed asynchronous resurrection.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-14T19:31:14Z
- **Completed:** 2026-07-14T19:40:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a single transition authority for OFF, STARTING, ACTIVE, and TERMINATING records with strict generation and tab validation.
- Preserved terminal generation tombstones through JSON round trips and fresh explicit reinvocation without restoring prior primitive state.
- Proved stale Promise, timer, and message completions cannot reactivate a killed generation, including after generation 2 begins.
- Proved repeated terminal events are harmless and killing one tab leaves another tab's record untouched and renderable.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the tab-scoped generation and terminal-boundary contract** - `ceff4799` (test)
2. **Task 2: Implement the pure per-tab Skopeo session reducer** - `9a3e938d` (feat)

**Plan metadata:** recorded in the final documentation commit.

## Files Created/Modified

- `tests/skopeo-session-lifecycle.test.js` - Deterministic oracle and production contract covering malformed input, deferred completion, tombstones, reinvocation, replay, and tab isolation.
- `extension/utils/skopeo-session-state.js` - Classic-script/CommonJS pure reducer consumed through `globalThis.FSBSkopeoSessionState` or `module.exports`.

## Exported Interface

The module exports `STATUS`, `storageKeyForTab`, `createOffState`, `beginGeneration`, `markActive`, `clearActiveReason`, `beginTermination`, `finishTermination`, `acceptsGeneration`, and `reduceSession` through both supported loading modes.

Persisted records contain only `{tabId, generation, status, terminalGeneration, updatedAt, reason}`. The ACTIVE reason is either `null` or the exact controller marker `prepared-awaiting-commit`; termination reasons are non-empty strings.

## Transition Table

| Current state | Event/helper | Accepted condition | Result |
|---|---|---|---|
| No record / OFF | `BEGIN` / `beginGeneration` | Positive explicit tab, valid timestamp, same tab | STARTING at `max(generation, terminalGeneration) + 1`; prior reason cleared |
| STARTING | `READY` / `markActive` | Exact current generation; reason is null or `prepared-awaiting-commit` | ACTIVE in the same generation |
| ACTIVE with prepared marker | `COMMIT_READY` / `clearActiveReason` | Exact current generation | ACTIVE with reason cleared |
| STARTING or ACTIVE | `TERMINATE` / `beginTermination` | Exact current generation and non-empty reason | TERMINATING with `terminalGeneration` written immediately |
| TERMINATING | `FINISH` / `finishTermination` | Exact current generation | OFF while retaining generation, terminal tombstone, and reason |
| ACTIVE | Duplicate `READY` | Exact current generation | Stable no-op |
| TERMINATING or OFF | Replayed `TERMINATE` / `FINISH` | Any already-ended same-generation replay | Stable no-op |
| Any record | Stale, future, malformed, or cross-tab event | Never admitted | Existing valid record remains unchanged, or malformed state fails closed |

`acceptsGeneration` returns true only for an exact STARTING or ACTIVE generation. OFF and TERMINATING are never renderable.

## T-52-01 Evidence

The test named `late completion after kill cannot resurrect` creates a real deferred Promise while generation 1 is STARTING, transitions that record through TERMINATING to OFF before resolving the Promise, and then executes the delayed continuation. Both admission and attempted activation are rejected. The same record rejects queued timer/message simulations, and generation 1 remains stale after explicit generation 2 begins.

Additional blocking evidence verifies that TERMINATE establishes `terminalGeneration` before FINISH, the tombstone survives JSON serialization, and neither repeated teardown nor a cross-tab event can alter another session.

## Verification Results

- `node tests/skopeo-session-lifecycle.test.js --self-test && node --check tests/skopeo-session-lifecycle.test.js` - PASS
- `node tests/skopeo-session-lifecycle.test.js` - PASS
- `node --check extension/utils/skopeo-session-state.js` - PASS
- Source audit found no DOM, Chrome API, interval, timeout, animation-frame, or implicit active-tab lookup in the reducer.

## Decisions Made

- OFF is a terminal tombstone, not a record deletion signal. Host-page residue remains zero while the service-worker controller can still reject delayed work.
- `beginGeneration` is the only allocation path and runs only from OFF, preventing an active generation from silently replacing itself.
- Duplicate READY, TERMINATE, and FINISH events preserve the exact valid record so replay cannot extend timestamps or loosen admission.
- Reducer events require an explicit tab id and timestamp, keeping the transition surface deterministic and preventing an active-tab lookup race.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved state on a malformed reducer timestamp**

- **Found during:** Task 1 self-test
- **Issue:** The initial local oracle delegated a malformed BEGIN timestamp directly to `beginGeneration`, returning null instead of leaving the existing OFF record unchanged.
- **Fix:** Added event-level timestamp validation before dispatch so malformed events fail closed without discarding valid state.
- **Files modified:** `tests/skopeo-session-lifecycle.test.js`
- **Verification:** The oracle command passed, while normal mode still failed hard until the production module existed.
- **Committed in:** `ceff4799`

**2. [Rule 1 - Tracking] Corrected the phase progress calculation and missing metric table**

- **Found during:** Final tracking update
- **Issue:** `state update-progress` counted three completed plans despite one Phase 52 summary, and `state record-metric` could not write because this legacy STATE file had no Performance Metrics section.
- **Fix:** Reconciled STATE to 1/6 plans (17%), added the missing metrics table and 52-01 row, refreshed the current focus/next action, and normalized the roadmap progress row.
- **Files modified:** `.planning/milestones/v1.2.0-SKOPEO-STATE-SNAPSHOT.md`, `.planning/milestones/v1.2.0-SKOPEO-ROADMAP.md`
- **Verification:** Phase 52 contains six PLAN files and one SUMMARY file; ROADMAP and STATE both report Plan 02 as next with 1/6 complete.
- **Committed in:** Final plan metadata commit

---

**Total deviations:** 2 auto-fixed bugs.
**Impact on plan:** The corrections strengthened fail-closed behavior and restored accurate tracking without changing product scope or architecture.

## Issues Encountered

None after the self-test correction.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 03 and 04 can consume the reducer as their sole per-tab transition authority and persist its JSON-safe records in `chrome.storage.session`.
- Plan 02 can build the one-shell primitive contract independently; no DOM or rendering ownership was introduced here.
- No blocker or manual UAT is attached to this pure lifecycle plan.

## Self-Check: PASSED

- Confirmed both created files and this summary exist.
- Confirmed task commits `ceff4799` and `9a3e938d` exist in git history.
- Re-ran the production lifecycle contract successfully after both task commits.
- Confirmed the working diff has no whitespace errors or accidental tracked-file deletions.

---
*Phase: 52-on-demand-hud-lifecycle-primitive-shell*
*Completed: 2026-07-14*
