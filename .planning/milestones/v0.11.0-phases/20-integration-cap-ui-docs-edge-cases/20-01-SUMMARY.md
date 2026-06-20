---
phase: 20-integration-cap-ui-docs-edge-cases
plan: "01"
subsystem: ui
tags: [chrome-extension, options-ui, trigger-cap, source-shape-tests]

requires:
  - phase: 15-fire-condition-engine-value-extraction
    provides: runtime `fsbTriggerCap` enforcement
provides:
  - Trigger Concurrency settings card beside Agent Concurrency
  - `fsbTriggerCap` options-page load/input/reset/save wiring
  - active trigger counter helper for `armed`, `needs_attention`, and `blocked`
  - focused source-shape regression test for Trigger Concurrency UI
affects: [phase-20, trigger-watchers, options-ui]

tech-stack:
  added: []
  patterns: [plain-node-source-shape-test, classic-extension-options-js, dual-commonjs-browser-helper-export]

key-files:
  created:
    - tests/trigger-cap-settings-ui.test.js
  modified:
    - extension/ui/control_panel.html
    - extension/ui/options.js
    - extension/ui/cap-counter-helpers.js
    - tests/agent-cap-ui.test.js

key-decisions:
  - "Trigger Concurrency UI clones Agent Concurrency instead of adding a new settings pattern."
  - "Active trigger count includes armed, needs_attention, and blocked; terminal fired, timed_out, and stopped records are excluded."
  - "Agent cap source-shape regression now accepts the existing clamped save IIFE."

patterns-established:
  - "Trigger cap UI uses the same 1..64 clamp-on-input/load/save defense as Agent Cap."
  - "Informational cap counters swallow storage/runtime errors instead of surfacing options-page failures."

requirements-completed: ["Integration/composition"]

duration: 22 min
completed: 2026-06-17
---

# Phase 20 Plan 01: Trigger Concurrency UI Summary

**Options-page Trigger Concurrency card with `fsbTriggerCap` persistence and active trigger-count context**

## Performance

- **Duration:** 22 min
- **Started:** 2026-06-17T03:38:00Z
- **Completed:** 2026-06-17T04:00:22Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `tests/trigger-cap-settings-ui.test.js`, a plain Node source-shape contract for D-01 through D-05.
- Added a Trigger Concurrency settings card directly after Agent Concurrency with locked IDs, copy, range, reset button, validation hint, and active counter.
- Wired `fsbTriggerCap` through default settings, element cache, input/reset handling, load/save clamps, and debounced storage refreshes.
- Added `computeActiveTriggerCount()` to the existing dual CommonJS/browser helper export.

## Task Commits

1. **Task 1: Add Trigger Concurrency source-shape tests** - `2a497f67` (`test`)
2. **Task 2: Implement Trigger Concurrency card, persistence, and active counter** - `1f9796e4` (`feat`)
3. **Task 3: Run cap and settings regressions** - `49cdf8b1` (`test`)

## Files Created/Modified

- `tests/trigger-cap-settings-ui.test.js` - verifies Trigger Concurrency card shape, storage key, clamp range, active statuses, and debounce wiring.
- `extension/ui/control_panel.html` - adds the Trigger Concurrency card adjacent to Agent Concurrency.
- `extension/ui/options.js` - loads, clamps, saves, resets, and refreshes `fsbTriggerCap` and `fsbTriggerCapCurrentActive`.
- `extension/ui/cap-counter-helpers.js` - adds `computeActiveTriggerCount()` and exports it for Node/browser use.
- `tests/agent-cap-ui.test.js` - keeps the existing Agent Cap source-shape test current with the production clamped save IIFE.

## Decisions Made

- Used the existing `formatCounterText()` helper for trigger counter text so both agent and trigger counters render `N of M active`.
- Kept trigger counter behavior best-effort: storage read errors are swallowed because the value is informational.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated stale Agent Cap source-shape assertion**
- **Found during:** Task 3 (Run cap and settings regressions)
- **Issue:** `tests/agent-cap-ui.test.js` still expected `fsbAgentCap: parseInt(elements.fsbAgentCap...)`, but production already used a clamped IIFE to prevent out-of-range persisted values.
- **Fix:** Broadened the assertion to accept either the historical direct parse or the current clamped IIFE while still requiring serialization from `elements.fsbAgentCap`.
- **Files modified:** `tests/agent-cap-ui.test.js`
- **Verification:** `node tests/agent-cap-ui.test.js`
- **Committed in:** `49cdf8b1`

---

**Total deviations:** 1 auto-fixed blocking test drift.
**Impact on plan:** No behavior scope change; the fix makes the required regression suite reflect existing production behavior.

## Issues Encountered

- The regression suite initially failed on stale Agent Cap test source-shape expectations; resolved in `49cdf8b1`.

## User Setup Required

None - no external service configuration required.

## Verification

Executed successfully:

```bash
node tests/trigger-cap-settings-ui.test.js
node tests/trigger-cap.test.js
node tests/cap-counter-live.test.js
node tests/agent-cap-ui.test.js
```

## Next Phase Readiness

- Trigger cap settings UI is ready for final release-readiness verification.
- Plan 20-02 can proceed independently; Plan 20-05 will use this summary for final UAT/release records.

## Self-Check: PASSED

- Created file exists: `tests/trigger-cap-settings-ui.test.js`
- Modified UI files contain `fsbTriggerCap`, `fsbTriggerCapCurrentActive`, and `computeActiveTriggerCount`
- Task commits recorded: `2a497f67`, `1f9796e4`, `49cdf8b1`

---
*Phase: 20-integration-cap-ui-docs-edge-cases*
*Completed: 2026-06-17*
