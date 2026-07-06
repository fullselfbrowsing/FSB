---
phase: 20-integration-cap-ui-docs-edge-cases
plan: "03"
subsystem: trigger-runtime
tags: [chrome-extension, refresh-poll, batching, background]

requires:
  - phase: 17-refresh-poll-watch-tab-owning-background-reload
    provides: background-owned refresh-poll reload/read/evaluate path
  - phase: 20-integration-cap-ui-docs-edge-cases
    plan: "02"
    provides: watch-mode conflict guard before trigger arm side effects
provides:
  - same-tab refresh-poll due batch coalescing
  - per-tab in-flight refresh-poll lock
  - per-trigger ownership, blocked-page, lifecycle, and pulse semantics after shared reload
affects: [phase-20, refresh-poll, trigger-runtime, chrome-alarms]

tech-stack:
  added: []
  patterns: [per-tab-promise-lock, due-snapshot-scan, vm-refresh-poll-tests]

key-files:
  created: []
  modified:
    - extension/background.js
    - tests/trigger-refresh-poll.test.js

key-decisions:
  - "Refresh-poll coalescing lives in `fsbTriggerHandleRefreshPollAlarm`, not MCP."
  - "Due same-tab snapshots are collected from `FsbTriggerStore.hydrate()` and include the required alarm trigger even when `next_poll_at` is absent."
  - "Ownership and blocked-page checks run before the shared reload; lifecycle evaluation remains per trigger after the reload."

patterns-established:
  - "Use `fsbTriggerRefreshPollTabLocks` to join concurrent same-tab alarm work."
  - "Re-read each trigger snapshot after the shared reload before staging reported values or calling lifecycle."

requirements-completed: ["Integration/composition"]

duration: 29 min
completed: 2026-06-17
---

# Phase 20 Plan 03: Refresh-Poll Coalescing Summary

**Background refresh-poll batches now share one same-tab reload per due batch**

## Performance

- **Duration:** 29 min
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added VM refresh-poll tests for same-tab reload coalescing, other-tab independence, required alarm inclusion, terminal exclusions, ownership failures, blocked pages, and pulse reassertion guards.
- Added `fsbTriggerRefreshPollTabLocks` and due-batch helpers in `extension/background.js`.
- Updated `fsbTriggerHandleRefreshPollAlarm()` so refresh-poll alarm work flows through the per-tab batch helper.
- Preserved no-focus behavior: reloads remain `chrome.tabs.reload(tabId)`, with no active-tab query or activation.
- Verified lifecycle, manager, dispatcher conflict, and blocking/detached trigger reporting regressions.

## Task Commits

1. **Task 1: Add refresh-poll coalescing tests** - `29bbf43b` (`test`)
2. **Task 2: Implement per-tab due batch and in-flight lock** - `32456851` (`feat`)
3. **Task 3: Run trigger runtime regression slice** - no code changes; verification passed on `32456851`

## Files Created/Modified

- `tests/trigger-refresh-poll.test.js` - adds VM behavior tests and source guards for same-tab coalescing.
- `extension/background.js` - adds the per-tab lock, due-snapshot collection, batch reload path, and per-trigger post-reload evaluation.

## Decisions Made

- Joined existing in-flight work for a tab instead of issuing a second reload.
- Kept the existing single-trigger tick helper intact as a fallback and compatibility shape.
- Marked invalid ownership and restricted-page cases with existing attention paths instead of evaluating or staging page text.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

Executed successfully:

```bash
node --check extension/background.js
node --check tests/trigger-refresh-poll.test.js
node tests/trigger-refresh-poll.test.js
node tests/trigger-lifecycle.test.js
node tests/trigger-tool-dispatcher.test.js
node tests/trigger-manager.test.js
node tests/trigger-blocking-reporting.test.js
```

## Next Phase Readiness

- Plan 20-04 can proceed to MCP `0.10.0` metadata, docs, package-lock handling, and parity gates.
- Plan 20-05 can cite this plan for the coalesced refresh-poll UAT scenario.

## Self-Check: PASSED

- `extension/background.js` contains `fsbTriggerRefreshPollTabLocks`
- Same-tab due refresh-poll tests assert one reload and two per-trigger evaluations
- Other-tab tests assert independent reloads
- Task commits recorded: `29bbf43b`, `32456851`

---
*Phase: 20-integration-cap-ui-docs-edge-cases*
*Completed: 2026-06-17*
