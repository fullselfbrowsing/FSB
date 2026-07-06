---
phase: 17-refresh-poll-watch-tab-owning-background-reload
plan: 01
subsystem: extension-trigger-lifecycle
tags: [refresh-poll, chrome-alarms, trigger-manager, trigger-lifecycle, node-tests]

requires:
  - phase: 14-trigger-survivability-foundation
    provides: storage-backed trigger registry, fsbTrigger alarm namespace, restore/reap lifecycle
  - phase: 15-fire-condition-engine-value-extraction
    provides: FsbTriggerManager arm/evaluate seam and storage-first concurrency cap
  - phase: 16-live-observe-watch-analyzing-pulse
    provides: trigger watch-mode snapshot conventions and trigger read/pulse path for later refresh-poll plans
provides:
  - Wave 0 refresh-poll cadence harness and package test-chain entry
  - arm-time refresh-poll interval normalization with 60000ms default and 30000ms hard floor
  - typed REFRESH_POLL_INTERVAL_TOO_LOW rejection with live-observe guidance
  - persisted poll_interval_ms and next_poll_at snapshot fields for refresh-poll watches
  - deadline-safe refresh-poll alarm scheduling and restore-time rescheduling
affects: [phase-17, phase-18-trigger-tools, phase-19-reporting]

tech-stack:
  added: []
  patterns:
    - Plain Node Chrome mock harness for refresh-poll cadence
    - next_poll_at cadence field separate from deadline_at TTL
    - Deterministic poll_jitter_ms test hook with production Math.random jitter

key-files:
  created:
    - tests/trigger-refresh-poll.test.js
  modified:
    - extension/utils/trigger-manager.js
    - extension/utils/trigger-lifecycle.js
    - package.json

key-decisions:
  - "Refresh-poll interval validation runs before snapshot persistence or lifecycle delegation so invalid sub-floor requests cannot consume cap slots or create alarms."
  - "Refresh-poll cadence uses next_poll_at while deadline_at remains the absolute TTL/reap boundary."

patterns-established:
  - "Refresh-poll snapshots persist watch:'refresh-poll', poll_interval_ms, and next_poll_at."
  - "Restore reuses a valid future next_poll_at, otherwise recomputes a floor-safe poll wake capped by deadline_at."

requirements-completed: [WATCH-03]

duration: 8 min
completed: 2026-06-16
---

# Phase 17 Plan 01: Refresh-Poll Cadence Summary

**Refresh-poll cadence contract with typed sub-floor rejection, persisted poll_interval_ms, and deadline-safe next_poll_at alarm scheduling**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-16T17:53:45Z
- **Completed:** 2026-06-16T18:01:59Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `tests/trigger-refresh-poll.test.js`, a Wave 0 Node harness covering refresh-poll default interval, accepted interval, alias rejection, non-refresh behavior, arm-time scheduling, restore scheduling, jitter, and deadline-floor behavior.
- Added refresh-poll normalization in `FsbTriggerManager.armTrigger()` with a 60000ms default, a 30000ms floor, accepted interval aliases, and the required `REFRESH_POLL_INTERVAL_TOO_LOW` response.
- Extended `FsbTriggerLifecycle` so refresh-poll snapshots persist `next_poll_at` and schedule `fsbTrigger:<id>` alarms at the next poll tick while keeping `deadline_at` as TTL.

## Task Commits

1. **Task 1 RED: refresh-poll Wave 0 cadence harness** - `856f33d1` (test)
2. **Task 1 GREEN: arm-time interval normalization** - `1b582d76` (feat)
3. **Task 2 RED: refresh-poll scheduling tests** - `accc8754` (test)
4. **Task 2 GREEN: next_poll_at lifecycle scheduling** - `e57c7116` (feat)

## Files Created/Modified

- `tests/trigger-refresh-poll.test.js` - New Node harness for refresh-poll cadence, interval rejection, next-poll scheduling, restore behavior, and deterministic jitter.
- `extension/utils/trigger-manager.js` - Normalizes refresh-poll interval aliases, rejects sub-floor/non-finite intervals, persists `watch:'refresh-poll'` and `poll_interval_ms`.
- `extension/utils/trigger-lifecycle.js` - Computes and schedules `next_poll_at` for refresh-poll arm/restore/non-fire paths while preserving `deadline_at`.
- `package.json` - Adds `node tests/trigger-refresh-poll.test.js` to the root test chain.

## Decisions Made

- Refresh-poll interval validation occurs before cap counting and before lifecycle delegation. This keeps invalid requests from consuming cap slots or persisting partial snapshots.
- `next_poll_at` is the cadence field. `deadline_at` remains the absolute TTL/reap boundary and can own the next wake only when the remaining TTL is below the Chrome alarm floor.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The raw `grep -c "setInterval" extension/utils/trigger-lifecycle.js` acceptance check counted two comment mentions. The comments were rephrased so the source-level guard returns `0`; no runtime logic changed for that fix.

## Known Stubs

None - stub scan found only ordinary source/test initializers, not UI-facing placeholders or unwired data.

## Verification

- `node tests/trigger-refresh-poll.test.js && node tests/trigger-manager.test.js && node tests/trigger-cap.test.js && node tests/trigger-lifecycle.test.js` - passed.
- `grep -c "REFRESH_POLL_INTERVAL_TOO_LOW" tests/trigger-refresh-poll.test.js extension/utils/trigger-manager.js` - `2` in tests and `3` in manager.
- `grep -c "poll_interval_ms" extension/utils/trigger-manager.js` - `3`.
- `grep -c "node tests/trigger-refresh-poll.test.js" package.json` - `1`.
- `grep -c "scheduleNextRefreshPollAlarm" extension/utils/trigger-lifecycle.js` - `3`.
- `grep -c "next_poll_at" extension/utils/trigger-lifecycle.js tests/trigger-refresh-poll.test.js` - `9` in lifecycle and `18` in tests.
- `grep -c "setInterval" extension/utils/trigger-lifecycle.js` - `0`.

## TDD Gate Compliance

PASS - both tasks have RED `test(17-01)` commits before their corresponding GREEN `feat(17-01)` commits.

## Self-Check: PASSED

- Found `tests/trigger-refresh-poll.test.js`.
- Found `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-01-SUMMARY.md`.
- Found commits `856f33d1`, `1b582d76`, `accc8754`, and `e57c7116`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `17-02-PLAN.md`, which can build explicit `triggerRead` missing-element outcomes on top of the refresh-poll cadence and persisted scheduling fields.

---
*Phase: 17-refresh-poll-watch-tab-owning-background-reload*
*Completed: 2026-06-16*
