---
phase: 19-mcp-tools-blocking-detached-reporting
plan: 03
subsystem: mcp
tags: [trigger, mcp, rearm, hysteresis, lifecycle-cleanup]

requires:
  - phase: 19-01
    provides: blocking/detached trigger reporting envelope and generated trigger IDs
  - phase: 19-02
    provides: durable fire events, timed_out cleanup, and terminal projection
provides:
  - Pure hysteresis reset for numeric trigger edge de-duplication
  - rearm_on_fire lifecycle behavior that keeps triggers armed after a fire
  - Blocking MCP settlement for rearmed fire events while status remains armed
  - Owner-release trigger reap after reconnect grace expiry
affects: [phase-19, trigger-runtime, mcp-tools, agent-registry]

tech-stack:
  added: []
  patterns: [pure hysteresis reset, rearmed fire settlement, best-effort owner cleanup hook]

key-files:
  created:
    - .planning/phases/19-mcp-tools-blocking-detached-reporting/19-03-SUMMARY.md
  modified:
    - extension/utils/trigger-manager.js
    - extension/utils/trigger-lifecycle.js
    - extension/utils/agent-registry.js
    - extension/ws/mcp-bridge-client.js
    - tests/trigger-manager.test.js
    - tests/trigger-lifecycle.test.js
    - tests/agent-grace.test.js
    - tests/trigger-blocking-reporting.test.js
    - tests/mcp-tool-smoke.test.js

key-decisions:
  - "Hysteresis is applied in the pure manager after condition evaluation and before edge detection, preserving storage-free evaluate() behavior."
  - "rearm_on_fire:true keeps status:'armed', increments fire_count, persists last_event/last_fire_event, and leaves default fire-once behavior unchanged."
  - "Blocking waiters settle on increased fire_count plus last_event even when a rearmed snapshot remains armed."
  - "Agent reconnect grace expiry calls trigger owner cleanup best-effort after registry release; reconnect cancellation suppresses that cleanup."

patterns-established:
  - "Numeric hysteresis reset: threshold and percent_change conditions retain was_satisfied until the reset band is crossed."
  - "Rearmed fire projection: status remains armed while fire_count/last_event distinguish the first new fire for blocking callers."
  - "Owner release cleanup: FsbTriggerLifecycle.handleTriggerOwnerReleased(agentId) scans trigger snapshots and clears matching alarms."

requirements-completed: [REPORT-02, REPORT-03, REPORT-07]

duration: 20min
completed: 2026-06-17
---

# Phase 19 Plan 03: Re-arm, Hysteresis, and Owner Cleanup Summary

**Phase 19 is complete: MCP triggers now support blocking/detached reporting, durable fire/timeout outcomes, re-arm-on-fire, hysteresis de-dup, and owner-release cleanup.**

## Performance

- **Completed:** 2026-06-17T02:59:25Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added pure hysteresis reset logic for threshold and percent_change conditions so rearmed triggers do not fire repeatedly on the same satisfied crossing.
- Added `rearm_on_fire:true` lifecycle behavior: snapshots stay `armed`, `fire_count` increments, `last_event` and `last_fire_event` persist, and refresh-poll triggers schedule the next poll.
- Updated MCP blocking settlement to resolve when a rearmed trigger records a new fire while still armed, returning `still_armed:true`.
- Added `handleTriggerOwnerReleased(agentId)` and wired reconnect-grace expiry to reap detached triggers owned by released agents without affecting fast reconnect cancellation.

## Task Commits

1. **Task 1: Implement pure hysteresis reset for re-arm de-dup** - `23e7afa5` (feat)
2. **Task 2: Keep rearm_on_fire triggers armed and resolve blocking callers on first fire** - `8aeeb3d3` (feat)
3. **Task 3: Reap detached triggers when owner reconnect grace expires** - `eeb3ae86` (feat)

## Files Created/Modified

- `extension/utils/trigger-manager.js` - Hysteresis helper and edge-state application.
- `extension/utils/trigger-lifecycle.js` - Rearmed fire write-back and owner-release trigger reap helper.
- `extension/utils/agent-registry.js` - Best-effort trigger owner cleanup hook on staged release expiry.
- `extension/ws/mcp-bridge-client.js` - Blocking settlement for rearmed fires via `fire_count` and `last_event`.
- `tests/trigger-manager.test.js` - Threshold and percent_change hysteresis reset coverage.
- `tests/trigger-lifecycle.test.js` - rearm_on_fire and owner-release cleanup coverage.
- `tests/agent-grace.test.js` - Grace expiry hook and reconnect cancellation suppression coverage.
- `tests/trigger-blocking-reporting.test.js` - Blocking rearmed-fire settlement coverage.
- `tests/mcp-tool-smoke.test.js` - rearm_on_fire bridge payload coverage.

## Decisions Made

- Keep fire-once as the default terminal behavior; rearm is explicit opt-in only.
- Store rearmed fire evidence in the existing flat event fields instead of adding a separate event stream.
- Keep detached trigger TTL at `FSB_TRIGGER_DEFAULT_TTL_MS = 21600000` and layer owner-release cleanup on top of existing TTL/tab-close reaps.

## Deviations from Plan

None - plan executed within intended scope.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- `npm test` refreshed generated showcase crawler timestamps. They were reverted to committed values and not included in phase commits.

## User Setup Required

None.

## Verification

- `node tests/trigger-manager.test.js` - 96 passed.
- `node tests/trigger-lifecycle.test.js` - 155 passed.
- `node tests/agent-grace.test.js` - passed.
- `node tests/trigger-blocking-reporting.test.js` - 47 passed.
- `node tests/mcp-tool-smoke.test.js` - 116 passed.
- `node --check extension/utils/trigger-manager.js extension/utils/trigger-lifecycle.js extension/utils/agent-registry.js extension/ws/mcp-bridge-client.js` - passed.
- `npm --prefix mcp run build` - passed.
- `npm test` - passed.
- `npm run test:mcp-smoke:tools` - 116 passed.

## Next Phase Readiness

Phase 20 can now compose the shipped trigger system into UI/docs/integration work: cap UI, watch-mode conflict/coalescing, README/CHANGELOG updates, package version prep, and live-browser UAT capture.

---
*Phase: 19-mcp-tools-blocking-detached-reporting*
*Completed: 2026-06-17*
