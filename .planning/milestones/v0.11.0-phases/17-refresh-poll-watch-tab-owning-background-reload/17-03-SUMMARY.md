---
phase: 17-refresh-poll-watch-tab-owning-background-reload
plan: 03
subsystem: extension-refresh-poll
tags: [refresh-poll, background-reload, tab-ownership, trigger-read, chrome-alarms, node-tests]

requires:
  - phase: 17-refresh-poll-watch-tab-owning-background-reload
    provides: Plan 01 refresh-poll cadence, next_poll_at scheduling, and poll interval floor
  - phase: 17-refresh-poll-watch-tab-owning-background-reload
    provides: Plan 02 triggerRead ELEMENT_NOT_FOUND response shape
  - phase: 16-live-observe-watch-analyzing-pulse
    provides: shared triggerRead content route and trigger value shape
  - phase: 15-fire-condition-engine-value-extraction
    provides: storage-first lifecycle evaluation seam and fire write-back owner
provides:
  - Own-tab refresh-poll ownership validation before reload
  - Background reload, frame-0 triggerRead, value staging, and lifecycle delegation
  - Refresh-poll fsbTrigger alarm routing before the plain lifecycle fallback
affects: [phase-17, phase-18-trigger-tools, phase-19-reporting]

tech-stack:
  added: []
  patterns:
    - Ownership-before-Chrome-tab-side-effect for refresh-poll reloads
    - Direct frame-0 tabs.sendMessage triggerRead path, bypassing generic retry/focus recovery
    - Storage-first staging followed by FsbTriggerLifecycle.handleTriggerAlarm

key-files:
  created:
    - .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-03-SUMMARY.md
  modified:
    - extension/background.js
    - tests/trigger-refresh-poll.test.js

key-decisions:
  - "Refresh-poll ownership validation returns typed TAB_NOT_OWNED before any chrome.tabs.reload side effect."
  - "Refresh-poll reads use chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }) directly instead of sendMessageWithRetry."
  - "The background refresh-poll path stages reported values and delegates fired/no-fire decisions to FsbTriggerLifecycle.handleTriggerAlarm."

patterns-established:
  - "Refresh-poll alarm handling returns handled:false for non-refresh snapshots so existing lifecycle behavior remains the fallback."
  - "Missing or failed refresh-poll reads become attention states instead of feeding empty or invalid values into evaluation."

requirements-completed: [WATCH-02, WATCH-04]

duration: 8 min
completed: 2026-06-16
---

# Phase 17 Plan 03: Refresh-Poll Background Reload Summary

**Owned-tab refresh-poll alarms now reload in the background, read via triggerRead, stage values, and delegate evaluation to the lifecycle seam**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-16T18:14:24Z
- **Completed:** 2026-06-16T18:22:30Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added `fsbTriggerValidateRefreshPollOwnership()` and `fsbTriggerIsRefreshPollSnapshot()` in `extension/background.js`, enforcing agent registry ownership before refresh-poll reloads.
- Added `fsbTriggerRunRefreshPollTick()` with explicit `chrome.tabs.reload(tabId)`, no activation APIs, frame-0 `triggerRead`, `reported_value` staging, `ELEMENT_NOT_FOUND` attention handling, and lifecycle delegation.
- Routed `fsbTrigger:<id>` alarms through `fsbTriggerHandleRefreshPollAlarm()` before the existing `FsbTriggerLifecycle.handleTriggerAlarm(alarm)` fallback.
- Extended `tests/trigger-refresh-poll.test.js` with source guards for ownership, no-focus behavior, explicit-tab reload, frame-0 read, staging before delegation, and alarm branch order.

## Task Commits

1. **Task 1 RED: ownership/no-focus source guards** - `c4ac5af4` (test)
2. **Task 1 GREEN: refresh-poll ownership gate** - `2245a03e` (feat)
3. **Task 2 RED: reload/read/evaluate source guards** - `a2459020` (test)
4. **Task 2 GREEN: refresh-poll reload tick** - `e5456d9a` (feat)
5. **Task 3 RED: alarm route source guard** - `795caeb4` (test)
6. **Task 3 GREEN: refresh-poll alarm routing** - `00094240` (feat)

## Files Created/Modified

- `extension/background.js` - Adds refresh-poll ownership validation, direct read helper, attention marking, reload/read/stage/evaluate tick, alarm router, and test hook.
- `tests/trigger-refresh-poll.test.js` - Adds source-level guards covering ownership, no-focus/no-generic-retry invariants, reload/read order, and alarm fallback preservation.
- `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-03-SUMMARY.md` - This execution summary.

## Decisions Made

- The refresh-poll alarm handler returns `{ handled:false }` for missing, non-refresh, or non-armed snapshots so the plain lifecycle fallback remains authoritative for other trigger modes.
- The refresh-poll path writes `needs_attention` for missing elements and failed reads, while leaving `status:'fired'` exclusively owned by `trigger-lifecycle.js`.
- `scheduleNextRefreshPollAlarm()` is called after non-firing lifecycle results only after re-reading the latest snapshot and confirming it is still armed refresh-poll.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added attention handling for invalid selectors and failed refresh-poll reads**
- **Found during:** Task 2 (background reload/read/evaluate helper)
- **Issue:** The plan specified `ELEMENT_NOT_FOUND` attention handling, but a missing selector or failed `triggerRead` response after a reload would otherwise leave an armed snapshot without evaluating or reliably scheduling the next poll.
- **Fix:** `fsbTriggerRunRefreshPollTick()` now marks `invalid_selector` and `read_failed` as `needs_attention` through `fsbTriggerMarkRefreshPollAttention()`, preserving selector/code/error details.
- **Files modified:** `extension/background.js`
- **Verification:** `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/agent-tab-resolver.test.js && node tests/open-tab-background-default.test.js && node --check extension/background.js`
- **Committed in:** `e5456d9a`

---

**Total deviations:** 1 auto-fixed (Rule 2: missing critical handling)
**Impact on plan:** Keeps failed post-reload reads from becoming silent armed zombies; no new public surface or schema change.

## Issues Encountered

- The Task 2 RED source guard initially matched the `typeof chrome.tabs.reload` availability check before the actual reload side effect. The guard was narrowed to `await chrome.tabs.reload`, preserving the intended order assertion.

## Known Stubs

None. Stub scan found only pre-existing source initializers/placeholders and ordinary test arrays; no new UI-facing placeholder or unwired data path was introduced.

## Verification

- `node tests/trigger-refresh-poll.test.js && node tests/trigger-lifecycle.test.js && node tests/agent-tab-resolver.test.js && node tests/open-tab-background-default.test.js && node --check extension/background.js` - passed.
- `grep -c "function fsbTriggerValidateRefreshPollOwnership" extension/background.js` - `1`.
- `grep -c "TAB_NOT_OWNED" extension/background.js tests/trigger-refresh-poll.test.js` - `2` in `extension/background.js`, `2` in tests.
- `grep -c "sendMessageWithRetry" tests/trigger-refresh-poll.test.js` - `2`.
- `grep -c "frameId: 0" extension/background.js` - `14`.
- `grep -c "chrome.tabs.reload(tabId" extension/background.js` plus `grep -c "chrome.tabs.reload(Number(tabId" extension/background.js` - `1`.
- `grep -c "reported_value" extension/background.js` - `2`; `grep -c "handleTriggerAlarm" extension/background.js` - `7`.
- `grep -c "fsbTriggerHandleRefreshPollAlarm" extension/background.js` - `3`.
- `grep -c "fsbTriggerHandleRefreshPollForTest" extension/background.js` - `1`.

## TDD Gate Compliance

PASS - each task has a RED `test(17-03)` commit before its corresponding GREEN `feat(17-03)` commit.

## Self-Check: PASSED

- Found `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-03-SUMMARY.md`.
- Found `extension/background.js`.
- Found `tests/trigger-refresh-poll.test.js`.
- Found commits `c4ac5af4`, `2245a03e`, `a2459020`, `e5456d9a`, `795caeb4`, and `00094240`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `17-04-PLAN.md`, which can add challenge-page classification and pulse reassertion on top of the owned-tab reload/read/evaluate path.

---
*Phase: 17-refresh-poll-watch-tab-owning-background-reload*
*Completed: 2026-06-16*
