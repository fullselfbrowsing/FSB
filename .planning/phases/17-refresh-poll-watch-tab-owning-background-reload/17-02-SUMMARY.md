---
phase: 17-refresh-poll-watch-tab-owning-background-reload
plan: 02
subsystem: extension-content-messaging
tags: [refresh-poll, trigger-read, element-not-found, content-script, node-tests]

requires:
  - phase: 16-live-observe-watch-analyzing-pulse
    provides: triggerRead content route and locked triggerObserve readValue shape
  - phase: 17-refresh-poll-watch-tab-owning-background-reload
    provides: refresh-poll cadence and next_poll_at scheduling from Plan 01
provides:
  - triggerRead ELEMENT_NOT_FOUND response for missing watched selectors
  - typed successful triggerRead response with success/ok/value
  - source-invariant coverage proving missing-element handling precedes value extraction
affects: [phase-17, phase-18-trigger-tools, phase-19-reporting]

tech-stack:
  added: []
  patterns:
    - Content-route source invariant for ordering-sensitive missing-element semantics
    - Additive typed response shape around existing triggerObserve.readValue contract

key-files:
  created:
    - .planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-02-SUMMARY.md
  modified:
    - extension/content/messaging.js
    - tests/trigger-observe.test.js

key-decisions:
  - "triggerRead returns ELEMENT_NOT_FOUND before the successful readValue extraction so refresh-poll can distinguish missing selectors from legitimate empty text."
  - "The missing-module guard keeps its behavior without placing a literal readValue token before the missing-element branch, allowing the source-invariant test to protect the extraction order."

patterns-established:
  - "Content message routes that feed service-worker trigger evaluation should return typed success/error envelopes, not only raw value payloads."
  - "Ordering-sensitive content route behavior is protected by a source-slice invariant in the existing plain Node test harness."

requirements-completed: [WATCH-02]

duration: 2 min
completed: 2026-06-16
---

# Phase 17 Plan 02: TriggerRead Missing-Element Summary

**triggerRead now returns a typed ELEMENT_NOT_FOUND response before value extraction, with source coverage protecting the refresh-poll stale-selector path**

## Performance

- **Duration:** 2 min
- **Started:** 2026-06-16T18:06:51Z
- **Completed:** 2026-06-16T18:09:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a deterministic `tests/trigger-observe.test.js` source invariant for the `triggerRead` content-route block.
- Updated `extension/content/messaging.js` so missing selectors return `{ success:false, ok:false, code:'ELEMENT_NOT_FOUND', reason:'element_not_found', selector }` before calling `FSB.triggerObserve.readValue`.
- Preserved the successful read value shape while adding the typed success envelope `{ success:true, ok:true, value }`.

## Task Commits

1. **Task 2 RED: triggerRead missing-element invariant** - `6cfb2040` (test)
2. **Task 1 GREEN: triggerRead missing-element response** - `94eaa161` (feat)

_Note: Both tasks were marked `tdd="true"`, so the coverage task was committed first as the RED gate and the route implementation followed as the GREEN gate._

## Files Created/Modified

- `extension/content/messaging.js` - Adds the explicit `ELEMENT_NOT_FOUND` branch before successful `readValue` extraction and returns typed success metadata.
- `tests/trigger-observe.test.js` - Adds a source-slice invariant for the `triggerRead` block while leaving the locked `readValue` shape assertions intact.

## Decisions Made

- The missing selector branch lives in `triggerRead`, not `trigger-observe.js`, so `readValue(null)` remains unchanged for live-observe compatibility.
- The content route now returns typed `success` and `ok` flags on successful reads so the service-worker refresh-poll path can consume success/error outcomes consistently.

## Deviations from Plan

None - plan executed with the task-level RED/GREEN sequence required by `tdd="true"`.

## Issues Encountered

- The plan split implementation and coverage into separate tasks while marking both tasks as TDD. The failing source-invariant test was committed first, then the route implementation made it pass. No scope change was required.

## Known Stubs

None - stub scan found only pre-existing source initializers, placeholder selector strings, and existing error strings in the touched files; no new UI-facing placeholder or unwired data path was introduced.

## Verification

- `node tests/trigger-observe.test.js` failed before implementation with `ELEMENT_NOT_FOUND branch present`, confirming the RED gate.
- `node --check extension/content/messaging.js` - passed.
- `node tests/trigger-observe.test.js` - passed, 11/11 assertions.
- `node --check extension/content/messaging.js && node tests/trigger-observe.test.js` - passed.
- `grep -c "ELEMENT_NOT_FOUND" extension/content/messaging.js` - `1`.
- `grep -n "case 'triggerRead'" -A25 extension/content/messaging.js` - confirmed `ELEMENT_NOT_FOUND` appears before the successful `readValue` extraction.
- `grep -c "readValue(null" extension/content/messaging.js` - `0`.
- `grep -c "ELEMENT_NOT_FOUND" tests/trigger-observe.test.js` - `3`.
- `grep -c "readValue emits the locked text and attribute shapes" tests/trigger-observe.test.js` - `1`.

## TDD Gate Compliance

PASS - `test(17-02)` commit `6cfb2040` precedes `feat(17-02)` commit `94eaa161`, and the test failed for the intended missing `ELEMENT_NOT_FOUND` invariant before implementation.

## Self-Check: PASSED

- Found `.planning/phases/17-refresh-poll-watch-tab-owning-background-reload/17-02-SUMMARY.md`.
- Found `extension/content/messaging.js`.
- Found `tests/trigger-observe.test.js`.
- Found commits `6cfb2040` and `94eaa161`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `17-03-PLAN.md`, which can consume the typed `ELEMENT_NOT_FOUND` outcome during refresh-poll reload/read/evaluate handling without evaluating missing elements as empty text.

---
*Phase: 17-refresh-poll-watch-tab-owning-background-reload*
*Completed: 2026-06-16*
