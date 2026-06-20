---
phase: 20-integration-cap-ui-docs-edge-cases
status: human_needed
source:
  - 20-VALIDATION.md
  - 20-CONTEXT.md
  - ../16-live-observe-watch-analyzing-pulse/16-HUMAN-UAT.md
  - ../17-refresh-poll-watch-tab-owning-background-reload/17-HUMAN-UAT.md
created: 2026-06-17T05:55:00Z
updated: 2026-06-17T05:55:00Z
evidence_boundary: "No live installed-browser extension session was run in this workspace; Node, VM, and source-shape tests cannot prove visual focus, BF-cache, reduced-motion, or full MCP/browser E2E behavior."
---

# Phase 20 Human UAT

This artifact carries the deferred Phase 16 live-observe browser checks and the Phase 20 composed trigger browser checks. Status values are explicit: `passed`, `blocked`, or `human_needed`.

## Summary

| Group | Total | passed | blocked | human_needed |
|-------|-------|--------|---------|--------------|
| Phase 16 deferred live-observe | 4 | 0 | 0 | 4 |
| Phase 20 composed trigger flows | 8 | 0 | 0 | 8 |
| Total | 12 | 0 | 0 | 12 |

## Environment

| Field | Value |
|-------|-------|
| Workspace | `/Users/lakshman/conductor/workspaces/fsb/louisville` |
| Date | 2026-06-17 |
| Browser | human_needed - no installed browser session captured |
| Extension build | human_needed - no loaded-extension session captured |
| MCP server | automated gates only; no live MCP/browser UAT session captured |

## Phase 16 Deferred Scenarios

### 1. Live SPA Ticker Fires With No Reload

- status: `human_needed`
- environment: live installed Chrome/Chromium extension session required
- steps:
  1. Open a React, Vue, or Angular ticker page in an owned tab.
  2. Arm a `live-observe` trigger on the ticker selector.
  3. Let the page update without user navigation.
  4. Confirm the trigger fires through lifecycle without page reload.
- expected: MutationObserver report reaches the service worker and fires exactly once without reloading the page.
- result: `human_needed`
- evidence: Automated coverage proves observer/source wiring (`tests/trigger-observe.test.js`, `tests/trigger-lifecycle.test.js`), but not live SPA rendering or no-reload visual behavior.
- notes: Carry-forward from Phase 16.

### 2. BF-cache Re-Arm Timing

- status: `human_needed`
- environment: live browser navigation with BF-cache behavior required
- steps:
  1. Arm a `live-observe` trigger on a page eligible for BF-cache.
  2. Navigate away.
  3. Use Back to restore the page.
  4. Confirm the observer remains valid or re-arms once.
- expected: A restored page fires once on the next qualifying change, with no duplicate observer and no missed report.
- result: `human_needed`
- evidence: Source tests cover re-arm paths; Node cannot force real BF-cache freeze/restore semantics.
- notes: Carry-forward from Phase 16.

### 3. Busy-Ticker Frame Budget

- status: `human_needed`
- environment: live browser performance observation required
- steps:
  1. Open a high-frequency ticker or test page with rapid DOM mutations.
  2. Arm a `live-observe` trigger.
  3. Observe responsiveness, animation smoothness, and visible jank.
- expected: The page remains responsive while the trigger is armed and mutation batching does not cause visible frame-budget degradation.
- result: `human_needed`
- evidence: Automated tests verify debounce/source behavior, but not real rendering performance.
- notes: Carry-forward from Phase 16.

### 4. Pulse Visual Distinction And Reduced Motion

- status: `human_needed`
- environment: live browser visual inspection plus reduced-motion OS/browser setting required
- steps:
  1. Arm a trigger and inspect the trigger pulse.
  2. Compare it with the run_task glow.
  3. Enable reduced motion.
  4. Confirm animation stops while a static cue remains.
- expected: The pulse is visually gentle, distinct from run_task glow, and reduced-motion friendly.
- result: `human_needed`
- evidence: Source tests verify CSS/reduced-motion hooks; visual quality requires live inspection.
- notes: Carry-forward from Phase 16.

## Phase 20 Composed Trigger Scenarios

### 5. blocking fire return

- status: `human_needed`
- environment: live MCP client plus installed extension session required
- steps:
  1. Start MCP server and confirm extension bridge connected.
  2. Arm `trigger` in default blocking mode on a changing selector.
  3. Cause the watched condition to fire before timeout.
  4. Confirm the MCP call returns a structured `fired` outcome.
- expected: Blocking call returns success with `outcome: "fired"`, `trigger_id`, event data, matched condition, old value, new value, URL, and timestamp.
- result: `human_needed`
- evidence: `tests/trigger-blocking-reporting.test.js` covers blocking settlement in Node; no live browser/MCP session was captured.
- notes: Phase 19/20 automated gates support this contract.

### 6. detached poll/status

- status: `human_needed`
- environment: live MCP client plus installed extension session required
- steps:
  1. Arm `trigger` with `detached:true`.
  2. Confirm immediate detached response includes `trigger_id`.
  3. Poll with `get_trigger_status`.
  4. List active triggers with `list_triggers`.
- expected: Detached arm returns immediately; status/list reflect the same active trigger for the owning agent.
- result: `human_needed`
- evidence: `tests/mcp-tool-smoke.test.js` and `tests/trigger-tool-dispatcher.test.js` cover bridge payload and status/list routing, but not live browser E2E.
- notes: Companion trigger tools bypass pending mutation work by design.

### 7. timeout

- status: `human_needed`
- environment: live MCP client plus installed extension session required
- steps:
  1. Arm a blocking trigger with a short `timeout_ms`.
  2. Keep the watched condition unsatisfied.
  3. Wait for timeout.
- expected: The call settles as `timed_out`, persists a timed-out snapshot, clears lifecycle work, and does not report a fire.
- result: `human_needed`
- evidence: `tests/trigger-blocking-reporting.test.js` and lifecycle tests cover timeout cleanup in Node.
- notes: No live browser timeout run was captured.

### 8. rearm_on_fire still armed

- status: `human_needed`
- environment: live MCP client plus installed extension session required
- steps:
  1. Arm a trigger with `rearm_on_fire:true`.
  2. Cause the first fire.
  3. Confirm the blocking caller receives the fire event.
  4. Query status and confirm the trigger remains `armed`.
- expected: Fire evidence is returned while the persisted snapshot remains armed with incremented `fire_count` and hysteresis state.
- result: `human_needed`
- evidence: `tests/trigger-lifecycle.test.js`, `tests/trigger-manager.test.js`, and `tests/trigger-blocking-reporting.test.js` cover rearm/hysteresis behavior.
- notes: No live browser E2E run was captured.

### 9. refresh-poll background focus retention

- status: `human_needed`
- environment: installed Chrome/Chromium extension session with two tabs required
- steps:
  1. Arm a `refresh-poll` trigger on a background owned tab.
  2. Keep another tab foregrounded.
  3. Wait for a poll tick.
  4. Confirm the watched tab reloads without becoming active.
- expected: Refresh-poll reloads the watched tab by explicit tab id and the foreground tab remains active.
- result: `human_needed`
- evidence: `tests/trigger-refresh-poll.test.js` proves no focus-stealing API and explicit `chrome.tabs.reload(tabId)` source shape, but not user-visible focus retention.
- notes: Carry-forward from Phase 17.

### 10. cross-mode TRIGGER_TAB_WATCH_CONFLICT

- status: `human_needed`
- environment: live MCP client plus installed extension session required
- steps:
  1. Arm an active `live-observe` trigger on a tab.
  2. Attempt to arm a `refresh-poll` trigger on the same tab.
  3. Repeat in reverse order.
- expected: Same-tab opposite watch mode rejects with `TRIGGER_TAB_WATCH_CONFLICT` before DOM read, persistence, observer startup, or pulse startup.
- result: `human_needed`
- evidence: `tests/trigger-tool-dispatcher.test.js` proves source ordering and VM behavior; no live MCP/browser run was captured.
- notes: Same-mode co-location remains allowed.

### 11. coalesced reload

- status: `human_needed`
- environment: live MCP client plus installed extension session required
- steps:
  1. Arm two due `refresh-poll` triggers on the same owned tab.
  2. Wait for the same cadence window.
  3. Observe reload count and per-trigger results.
- expected: The same-tab due batch performs one explicit reload and still evaluates each due trigger independently.
- result: `human_needed`
- evidence: `tests/trigger-refresh-poll.test.js` VM coverage proves one reload and per-trigger lifecycle calls; no live browser E2E run was captured.
- notes: Other-tab triggers should reload independently.

### 12. owner disconnect cleanup

- status: `human_needed`
- environment: live MCP client disconnect/reconnect flow plus installed extension required
- steps:
  1. Arm a detached trigger owned by an MCP agent.
  2. Disconnect the MCP client and allow reconnect grace to expire.
  3. Query or inspect storage after cleanup.
- expected: Owner-release cleanup reaps triggers owned by the released agent without affecting other owners.
- result: `human_needed`
- evidence: `tests/agent-grace.test.js` and `tests/trigger-lifecycle.test.js` cover owner cleanup in Node; no live client disconnect UAT was captured.
- notes: Fast reconnect cancellation should suppress cleanup.

## Evidence Boundary

Automated tests completed across Plans 20-01 through 20-04 cover source contracts, VM behavior, lifecycle semantics, MCP bridge payloads, and schema parity. They do not prove live browser focus retention, BF-cache behavior, visual pulse quality, reduced-motion rendering, or end-to-end installed-extension/MCP workflows. Those checks remain `human_needed` until a human runs them in a live browser session and records evidence here.
