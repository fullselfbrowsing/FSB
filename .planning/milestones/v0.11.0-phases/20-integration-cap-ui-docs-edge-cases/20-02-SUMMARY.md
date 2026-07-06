---
phase: 20-integration-cap-ui-docs-edge-cases
plan: "02"
subsystem: trigger-runtime
tags: [chrome-extension, trigger-watchers, watch-mode-conflict, background]

requires:
  - phase: 19-mcp-tools-blocking-detached-reporting
    provides: MCP trigger reporting and owner cleanup semantics
provides:
  - `TRIGGER_TAB_WATCH_CONFLICT` rejection for same-tab opposite watch modes
  - conflict ordering before DOM read, persistence, observer start, or pulse start
  - same-mode co-location preservation
affects: [phase-20, refresh-poll, live-observe, trigger-runtime]

tech-stack:
  added: []
  patterns: [background-owned-conflict-scan, vm-trigger-dispatcher-tests]

key-files:
  created: []
  modified:
    - extension/background.js
    - tests/trigger-tool-dispatcher.test.js

key-decisions:
  - "Conflict detection runs in `fsbTriggerHandleToolArm` after watch normalization and before initial triggerRead."
  - "Conflict scans ignore malformed and terminal records, and filter through existing owner visibility checks."
  - "Same watch modes remain co-locatable; only active opposite modes on the same tab reject."

patterns-established:
  - "Background trigger arm guards should reject before read/persist/startup side effects."
  - "Conflict responses expose only trigger id/watch mode metadata after owner access checks pass."

requirements-completed: ["Integration/composition"]

duration: 13 min
completed: 2026-06-17
---

# Phase 20 Plan 02: Watch-Mode Conflict Summary

**Background-owned `TRIGGER_TAB_WATCH_CONFLICT` guard before trigger arm side effects**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-17T04:01:00Z
- **Completed:** 2026-06-17T04:04:26Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added VM/source tests proving cross-mode conflicts reject before read, arm, live-observe startup, or pulse startup.
- Implemented `fsbTriggerFindTabWatchConflict()` in `extension/background.js`.
- Preserved same-mode live/live and refresh/refresh co-location and ignored terminal/malformed records.
- Verified Phase 19 blocking/detached behavior and the Phase 17 refresh-poll/lifecycle/manager runtime slice still pass.

## Task Commits

1. **Task 1: Add conflict rejection tests before implementation** - `0276b9b2` (`test`)
2. **Task 2: Implement background conflict guard before read, persist, and startup** - `c9da4364` (`feat`)
3. **Task 3: Run trigger runtime regression slice** - no code changes; verification passed on `c9da4364`

## Files Created/Modified

- `tests/trigger-tool-dispatcher.test.js` - adds source-order and VM behavior coverage for cross-mode conflict, reverse conflict, same-mode pass, and terminal record exclusions.
- `extension/background.js` - adds the conflict helper and invokes it before initial read/arm/startup.

## Decisions Made

- Used `fsbTriggerSnapshotVisibleToContext()` during conflict scanning to avoid leaking another owner's trigger metadata.
- Kept conflict detection out of MCP and trigger-manager code because only background owns tab, owner, and startup side effects together.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

Executed successfully:

```bash
node tests/trigger-tool-dispatcher.test.js
node tests/trigger-blocking-reporting.test.js
node tests/trigger-refresh-poll.test.js
node tests/trigger-lifecycle.test.js
node tests/trigger-manager.test.js
```

## Next Phase Readiness

- Plan 20-03 can build refresh-poll coalescing on top of the background trigger arm conflict semantics.
- Plan 20-05 can cite this plan for the cross-mode conflict UAT scenario.

## Self-Check: PASSED

- `extension/background.js` contains `TRIGGER_TAB_WATCH_CONFLICT`
- Tests prove conflict rejection happens before read/arm/startup side effects
- Task commits recorded: `0276b9b2`, `c9da4364`

---
*Phase: 20-integration-cap-ui-docs-edge-cases*
*Completed: 2026-06-17*
