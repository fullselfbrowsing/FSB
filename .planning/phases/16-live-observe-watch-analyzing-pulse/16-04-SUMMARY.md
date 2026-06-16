---
phase: 16-live-observe-watch-analyzing-pulse
plan: 04
subsystem: service-worker
tags: [trigger, background, service-worker, value-report, watchdog, re-arm]
requires:
  - phase: 16-live-observe-watch-analyzing-pulse
    provides: "Plan 01 triggerValueChanged reports and Plan 03 triggerObserveStart/triggerPulseStart router actions"
provides:
  - "Service-worker value-report ingress for triggerValueChanged and triggerValueReport"
  - "Live-observe watchdog alarm fsbTriggerObserveWatchdog:<id> with stale re-arm"
  - "Owned-tab full-reload re-arm via webNavigation.onCommitted and tabs.onUpdated complete"
  - "CONTENT_SCRIPT_FILES registration for content/trigger-observe.js in dependency order"
  - "Test-only globalThis.fsbTriggerArmLiveObserveForTest arm helper"
affects: [phase-16, phase-17-refresh-poll, phase-18-tool-registry, trigger-lifecycle]
tech-stack:
  added: []
  patterns: [service-worker-value-report-ingress, owned-tab-rearm, recurring-watchdog-backstop, lifecycle-seam-fire]
key-files:
  created: []
  modified:
    - extension/background.js
    - extension/utils/trigger-lifecycle.js
    - tests/trigger-lifecycle.test.js
key-decisions:
  - "OQ-1 resolved by invoking FsbTriggerLifecycle.handleTriggerAlarm after writing reported_value; no new evaluator or duplicate fire-path writer was added."
  - "Watchdog name is fsbTriggerObserveWatchdog:<id>, recurring every 1 minute, stale after 2 minutes using last_reported_at || last_evaluated_at || armed_at."
  - "Value-report action strings accepted are triggerValueChanged and triggerValueReport."
  - "The test arm entrypoint is globalThis.fsbTriggerArmLiveObserveForTest; no MCP/autopilot tool schema was registered."
patterns-established:
  - "Background value reports write sanitized snapshot fields, then delegate fire decisions to the Phase 15 lifecycle seam."
  - "Full-reload re-arm is SW-owned and tab-owned: store lookup by target_tab_id, ensureContentScriptInjected(tabId), then triggerObserveStart plus triggerPulseStart."
  - "Recurring live-observe watchdogs are cleared once the snapshot is no longer an armed live-observe trigger."
requirements-completed: [WATCH-01, WATCH-05]
duration: 5 min
completed: 2026-06-16
---

# Phase 16 Plan 04: Live Observe Service Worker Summary

**Service-worker live-observe ingress now turns content value reports into lifecycle-seam trigger evaluation, with owned-tab re-arm and a watchdog backstop**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-16T16:43:43Z
- **Completed:** 2026-06-16T16:49:10Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Registered `content/trigger-observe.js` in `CONTENT_SCRIPT_FILES` after `visual-feedback.js` and before `messaging.js`.
- Added `triggerValueChanged` and `triggerValueReport` background ingress that validates report shape, stores `reported_value` / `reported_attributes`, and drives `FsbTriggerLifecycle.handleTriggerAlarm`.
- Added owned-tab full-reload re-arm from `webNavigation.onCommitted` and `tabs.onUpdated` complete.
- Added `fsbTriggerObserveWatchdog:<id>` recurring alarm dispatch and stale re-arm.
- Added `globalThis.fsbTriggerArmLiveObserveForTest` for test-only arm/start/pulse wiring without adding a public tool schema.

## Task Commits

1. **Tasks 1-2: Service-worker value ingress, watchdog, re-arm, and trigger observe registration** - `532f7ee9` (feat)

## Files Created/Modified

- `extension/background.js` - Adds trigger-observe content registration, value-report ingress, owned-tab re-arm, watchdog alarm handling, and test arm helper.
- `extension/utils/trigger-lifecycle.js` - Preserves `reported_attributes` in the reportedValue contract passed to `FsbTriggerManager.evaluate`.
- `tests/trigger-lifecycle.test.js` - Adds report-driven fire, reported-attribute fire, and background source invariant coverage.

## Decisions Made

- OQ-1 used the full shipped seam: value reports write snapshot fields, then call `FsbTriggerLifecycle.handleTriggerAlarm({ name: FsbTriggerLifecycle.TRIGGER_ALARM_PREFIX + triggerId })`.
- The watchdog stale threshold is 2 minutes, derived from `FSB_TRIGGER_OBSERVE_WATCHDOG_PERIOD_MINUTES * 60 * 1000 * 2`.
- Staleness uses `last_reported_at || last_evaluated_at || armed_at`, so fresh reports and ordinary evaluations both suppress unnecessary re-arm.
- The value-report case accepts both `triggerValueChanged` and `triggerValueReport`; Plan 01 emits `triggerValueChanged`.
- The recurring watchdog is cleared after a fired result and when a watchdog tick discovers the snapshot is no longer an armed live-observe trigger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved reported attributes through the lifecycle seam**
- **Found during:** Task 1 (value-report ingress)
- **Issue:** Plan 01 emits `{ text, attributes? }` and the value extractor supports attribute conditions, but `trigger-lifecycle.js` only passed `text` to `FsbTriggerManager.evaluate`.
- **Fix:** Added `reported_attributes` to the existing `reportedValue` object when present.
- **Files modified:** `extension/utils/trigger-lifecycle.js`, `tests/trigger-lifecycle.test.js`
- **Verification:** Case T proves an attribute condition fires through the lifecycle seam.
- **Committed in:** `532f7ee9`

---

**Total deviations:** 1 auto-fixed missing critical contract gap.
**Impact on plan:** Required for correctness of the documented Phase 16 report contract; no public API or tool-schema scope was added.

## Issues Encountered

None during execution. The watchdog cleanup was tightened before commit so recurring alarms do not remain active for non-armed snapshots.

## User Setup Required

None - no external service configuration required.

## Verification

- `node --check extension/background.js`
- `node --check extension/utils/trigger-lifecycle.js`
- `node --check tests/trigger-lifecycle.test.js`
- `node tests/trigger-lifecycle.test.js`
- `node tests/trigger-store.test.js`
- `node tests/value-extractor.test.js`
- `node tests/trigger-manager.test.js`
- `node tests/trigger-cap.test.js`
- `node tests/trigger-observe.test.js`
- `node tests/trigger-observe-pulse.test.js`

## Next Phase Readiness

Phase 17 can reuse the owned-tab re-arm and report-to-lifecycle seam shape for refresh-poll. Phase 18 can register public trigger tooling without changing the internal test-only arm helper.

---
*Phase: 16-live-observe-watch-analyzing-pulse*
*Completed: 2026-06-16*
