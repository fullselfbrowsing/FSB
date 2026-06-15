---
phase: 276
plan: implicit-from-context
subsystem: dashboard-dom-streaming + diagnostic + defensive-patches
tags: [streaming, diagnostic, dashboard, ws-relay, defensive-hardening, v0.9.69]
requires: [Phase 211-02 dom-stream watchdog, Phase 212 dashboard-page handleWSMessage, Phase 274 dashboard preview pane scaffolding]
provides: [276-DIAGNOSTIC.md scaffold, hashKey room-state log lines in relay handler, content-script readiness ping (pingDomStream), _pendingStreamStart parked-intent re-arm, stream-state pill tooltip with 4 new counters, dash-preview-resync-btn UI control, watchdog auto-resnapshot, WS backpressure drop counter]
affects: [showcase/server/src/ws/handler.js, extension/ws/ws-client.js, extension/content/dom-stream.js, extension/background.js, showcase/angular/src/app/pages/dashboard/{dashboard-page.component.{ts,html,scss}}, tests/, package.json]
requirements_satisfied: [STREAM-01 (defensive subset), STREAM-02 (DIAGNOSTIC scaffold), STREAM-04 (tooltip surfaces), STREAM-05 (watchdog auto-resnapshot), STREAM-06 (backpressure drop), STREAM-07 (5-attempt cap honoured -- this is attempt 1 of 5)]
blockers_closed: []
tech_added: [content-script readiness-ping protocol, _pendingStreamStart parked-intent flag, backpressureDroppedCount counter]
patterns_reinforced: [defensive-first patches that are safe regardless of root cause, diagnostic-before-patch ordering per STREAM-01..02, atomic per-task commits, mock-chrome stub testing for ws-client + dom-stream interactions]
key_files_created: [.planning/phases/276-.../276-DIAGNOSTIC.md, .planning/phases/276-.../276-SUMMARY.md, .planning/phases/276-.../276-VERIFICATION.md, tests/dashboard-stream-readiness-ping.test.js, tests/dashboard-stream-pending-intent.test.js, tests/server-ws-backpressure.test.js]
key_files_modified: [showcase/server/src/ws/handler.js, extension/ws/ws-client.js, extension/content/dom-stream.js, extension/background.js, showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts, showcase/angular/src/app/pages/dashboard/dashboard-page.component.html, showcase/angular/src/app/pages/dashboard/dashboard-page.component.scss, package.json]
decisions: [Land defensive patches for hypotheses #1 + #2 + #4 pre-emptively since they are SAFE regardless of which hypothesis is the actual root cause; Use 200ms polling interval / 5s overall budget for _waitForContentScriptReady; Wire Resync button without i18n attributes for parity with surrounding PiP/Maximize/Fullscreen buttons which are also untranslated; Drop frames at 16 MiB bufferedAmount threshold; Export sendToClients + counter accessors from handler.js for test access only; Status = human_needed because autonomous mode cannot drive a real Chrome browser repro; The 4 new tooltip counter lines append AFTER existing tooltip rows to preserve backwards-compatible reading order; mutationsAppliedTotal resets on every generation cycle (resetPreviewGenerationState) but lastFrameTime is left as-is so the timer reading does not jump back mid-cycle]
metrics:
  duration: 17m54s
  duration_sec: 1074
  task_count: 5
  files_changed: 11
  insertions: ~1130
  test_count_new: 52  # 16 readiness + 14 pending-intent + 22 backpressure
  defensive_patches_landed: 3  # hypotheses #1 + #2 + #4
  ui_controls_added: 1  # Resync button
  diagnostic_artifacts: 1  # 276-DIAGNOSTIC.md
completed: 2026-05-14
---

# Phase 276 Plan implicit-from-context: Dashboard DOM-Streaming Diagnostic + Minimum Patch Summary

**One-liner:** Landed the diagnostic scaffold (276-DIAGNOSTIC.md with 7-hypothesis matrix) + safe defensive patches for hypotheses #1 (hashKey room-state logs), #2 (replace setTimeout(300) heuristic with pingDomStream readiness poll), #4 (parked-intent re-arm via _pendingStreamStart) + stream-state tooltip with 4 new diagnostic counters + Resync button + the two STREAM-05/06 bonuses (watchdog auto-resnapshot, WS backpressure drop counter); attempt 1 of the 5-attempt cap (STREAM-07), with status `human_needed` because the autonomous orchestrator cannot drive a real Chrome browser for fix confirmation.

## What landed

### 1. DIAGNOSTIC.md scaffold (Task 1)

Created `.planning/phases/276-.../276-DIAGNOSTIC.md`. Sections:
- Reproduction steps (8 numbered).
- Log capture commands for the three required logs (server stdout, fsb_diagnostics_ring, dashboard transport-event history).
- 7-hypothesis validation matrix with predicted symptom + verification command (grep / jq) + fix surface per row, plus a "how to read this table" explainer.
- Empty `Captured logs (paste here)` sections + empty `Root cause identified` + `Fix applied + commit hash` sections for the HUMAN repro pass.
- 5-attempt cap reminder per STREAM-07.

### 2. Hypothesis #1 defensive patches (Task 1)

`showcase/server/src/ws/handler.js`:
- Log line per connect: `[WS] <role> connected | hashKey=<prefix>` (was: `[WS] <role> connected, hashKey: <prefix>...`). Format normalised so DIAGNOSTIC.md row-1 grep targets a single pattern.
- New structured log per connect: `[WS] room-state | roles=<comma-separated> hashKey=<prefix>`. When both ext and dash have joined the same room you see `roles=ext,dash` against ONE hashKey; a hashKey-mismatch bug manifests as two `room-state` lines with DIFFERENT hashKey prefixes.
- Pair-handshake contract documented in the setupWSHandler JSDoc block.

### 3. Hypothesis #2 + #4 defensive patches (Task 2)

`extension/ws/ws-client.js`:
- Module-level state: `_pendingStreamStart = null`, `FSB_CONTENT_READY_POLL_INTERVAL_MS = 200`, `FSB_CONTENT_READY_TIMEOUT_MS = 5000`.
- `_waitForContentScriptReady(tabId, timeoutMs)`: polls `chrome.tabs.sendMessage({ action: 'pingDomStream' }, { frameId: 0 })` every 200ms until the dom-stream module responds `{ ready: true }` or the 5s deadline elapses. Returns `Promise<boolean>`.
- `_onDomStreamReady(senderTabId)`: re-arms a parked dash:dom-stream-start payload. Idempotent (no-op if `_pendingStreamStart` is null) and clears the flag before re-dispatch so a duplicate ready ping does not double-fire.
- `_handleDashboardStreamStart`: now probes readiness before issuing `domStreamStart`. On 5s timeout, parks payload in `_pendingStreamStart`. On readiness, clears any stale parked intent.
- `_forwardToContentScript` reinjection branch: replaced `setTimeout(r, 300)` with `_waitForContentScriptReady(tabId)`. On timeout, records `dom-forward-failed` with `readyState=ping-timeout-after-inject` instead of issuing a stale sendMessage.

`extension/content/dom-stream.js`:
- Added `case 'pingDomStream':` in the chrome.runtime.onMessage listener. Synchronous `sendResponse({ ready: true })` -- the IIFE having installed the listener IS the readiness signal.

`extension/background.js`:
- `case 'domStreamReady':` after the existing `fsbWebSocket.send('ext:dom-ready', ...)` call, invokes `_onDomStreamReady(sender.tab?.id)` inside a try/catch (non-blocking). Defensive only; the readiness ping normally succeeds on the first poll.

### 4. Stream-state tooltip + Resync button (Task 3)

`showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`:
- Added state: `private mutationsAppliedTotal = 0`, `private lastFrameTime = 0`, `private previewResyncBtn!: HTMLElement | null`.
- Added getter: `lastFrameAgo()` returning seconds-since-last-frame.
- `resetPreviewGenerationState()`: also resets `mutationsAppliedTotal` (lastFrameTime intentionally left as-is to avoid the timer reading jumping back mid-cycle).
- `handleDOMSnapshot`: also refreshes `lastFrameTime = lastSnapshotTime`.
- `handleDOMMutations`: refreshes `lastFrameTime = Date.now()` at envelope entry; increments `mutationsAppliedTotal` once per ACCEPTED DOM op inside the forEach (per the 4 cases: add / rm / attr / text).
- `updatePreviewTooltip`: appends 4 new lines after the existing snapshot/state/reason rows:
  - `last-frame: <N>s ago`
  - `mutations: <count>`
  - `apply failures: <count>`
  - `stale: <count>`
- Resync button wiring: `this.previewResyncBtn = this.el('dash-preview-resync-btn')` + `this.listen(this.previewResyncBtn, 'click', () => this.requestPreviewResync('user-resync-button'))`.

`showcase/angular/src/app/pages/dashboard/dashboard-page.component.html`:
- Added `<button id="dash-preview-resync-btn">` as the first control in `.dash-preview-controls`. No i18n attributes (parity with PiP / Maximize / Fullscreen buttons which are also untranslated).

`showcase/angular/src/app/pages/dashboard/dashboard-page.component.scss`:
- `.dash-preview-tooltip`: relaxed `white-space: nowrap` to `normal` with `word-break: break-word; max-width: 360px; line-height: 1.35` so the 4 new diagnostic lines remain legible at narrow viewport widths.
- `.dash-preview-resync-btn:hover`: tinted icon with the accent colour to distinguish from the play/pause toggle glyph.

### 5. Defensive bonuses (Task 4)

`extension/background.js` `fsb-domstream-watchdog` alarm handler:
- If `_streamingActive` is true AND the WS is connected, send `ext:request-snapshot` `{ reason: 'sw-watchdog-tick', ts: Date.now() }` on every watchdog tick. The dashboard's existing `ext:request-snapshot` handler routes this through `requestPreviewResync`. Best-effort; wrapped in try/catch.

`showcase/server/src/ws/handler.js`:
- `BACKPRESSURE_BUFFER_LIMIT_BYTES = 16 * 1024 * 1024` (16 MiB).
- Module-level `backpressureDroppedCount` counter + `getBackpressureDroppedCount()` accessor + `_resetBackpressureDroppedCount()` test helper. All exported.
- `sendToClients`: before each `client.send(data)`, checks `client.bufferedAmount > BACKPRESSURE_BUFFER_LIMIT_BYTES`. If so, increments the counter, increments `droppedCount`, pushes a `backpressure-drop` event into the room diagnostics ring (carrying type / bufferedAmount / limitBytes), and skips the send. The pre-existing `readyState != OPEN` drop path is NOT routed through the backpressure counter.

### 6. Tests + chain wiring (Task 5)

Three new tests added to `tests/`, all wired into root `package.json` test chain AFTER `tests/verify-store-listing.test.js`:

| File | Asserts | Counts |
| ---- | ------- | ------ |
| `tests/dashboard-stream-readiness-ping.test.js` | static invariants on pingDomStream case + _waitForContentScriptReady function shape + 300ms heuristic removal; 3 behavioural simulations (ready on 3rd poll, never-ready timeout, immediate ready) | 16/16 PASS |
| `tests/dashboard-stream-pending-intent.test.js` | static invariants on _pendingStreamStart + _onDomStreamReady wiring; behavioural simulation of park/re-arm/idempotency cycle | 14/14 PASS |
| `tests/server-ws-backpressure.test.js` | 5 scenarios: single-wedged-drop + happy path + CLOSING-state not double-counted + counter accumulation + ring-buffer event recorded | 22/22 PASS |

**Total new asserts: 52.**

Regression sweep (10 representative existing tests): all green. Full `tests/showcase-build-smoke.test.js` (including the 14-second Angular production build): **134/134 PASS** (up from 130 with the Phase 275 baseline — the +4 is the existing showcase-stats trans-units count).

## Commits (5 atomic per-task)

| Task | Commit  | Title                                                                                                                                                            |
| ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 647df1c | `feat(276-01): DIAGNOSTIC scaffold + hashKey room-state logging (hypothesis #1)`                                                                                 |
| 2    | 7005823 | `feat(276-02): replace 300ms heuristic with readiness ping + pending-intent re-arm (hypotheses #2 + #4)`                                                          |
| 3    | 4b9d992 | `feat(276-03): stream-state pill tooltip with last-frame, mutations, failures, stale counts + Resync button`                                                     |
| 4    | 634c0e7 | `feat(276-04): watchdog auto-resnapshot + WS backpressure drop counter (bonuses)`                                                                                |
| 5    | (this)  | `test(276-05): test chain wiring + VERIFICATION human_needed status`                                                                                              |

## Deviations from Plan

**None automatic-fixed.** Every patch in this phase lines up with the CONTEXT.md `<decisions>` block. The two notable judgement calls (Claude's Discretion):

1. **200ms polling interval** for `_waitForContentScriptReady` (vs. 100ms). Recommended by CONTEXT.md. Yields under 250ms on the happy path while keeping the SW wakeup budget low.
2. **Resync button**: added per CONTEXT.md recommendation. Wired via the existing `requestPreviewResync` pathway with reason `user-resync-button`. No i18n attributes -- parity with the surrounding control buttons.

A third minor judgement call:

3. The Resync button intentionally has NO i18n attributes (no `i18n-title` / `i18n-aria-label`). Adding them would have required filling in 5 non-en locales (es / de / ja / zh-CN / zh-TW) in `messages.{lang}.xlf` and would have driven scope creep into an i18n task. The surrounding control buttons (PiP, Maximize, Fullscreen) are also unmarked for i18n; consistency wins.

## Authentication gates encountered

None. All work was inside the local repo / extension / showcase server source tree.

## Known stubs

None introduced by this phase. The 4 new tooltip lines (`last-frame`, `mutations`, `apply failures`, `stale`) all surface real, live, already-tracked state -- they are not placeholders.

## Threat surface flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Constraint compliance

- [x] Atomic commits per task: 5 commits, one per task (`feat(276-01)`, `feat(276-02)`, `feat(276-03)`, `feat(276-04)`, `test(276-05)`).
- [x] Did NOT touch sitemap.xml, llms.txt, llms-full.txt, prerender-routes.txt (verified post-build: still no `/stats` references).
- [x] Did NOT modify the existing dom-stream-perf.test.js -- only added 3 new test files.
- [x] 5-attempt cap honoured per STREAM-07: this counts as **1** of 5 (combined hypotheses #1 + #2 + #4 hardening).
- [x] Status routes to `human_needed` since the autonomous orchestrator cannot drive a real Chrome browser for fix-confirmation.

## What remains for the HUMAN repro pass

The user (running locally) performs the 8-step repro in `276-VERIFICATION.md`, walks the 7-hypothesis matrix in `276-DIAGNOSTIC.md`, and:

- If hypotheses #1, #2, or #4 were the actual root cause: the defensive patches landed here resolve them. Confirm via a successful "wake" -> streaming-within-3s smoke test. Re-record VERIFICATION as `passed`.
- If hypotheses #3, #5, #6, or #7 are the actual root cause: file a follow-up phase that lands the targeted minimum patch, walking through the matrix in rank order. STREAM-07's 5-attempt cap leaves 4 more swings before the unresolved tail re-scopes to v0.9.70.

## Self-Check: PASSED

- **Files created (6) -- all exist:**
  - `.planning/phases/276-dashboard-dom-streaming-diagnostic-minimum-patch/276-DIAGNOSTIC.md` (this commit's predecessor)
  - `.planning/phases/276-dashboard-dom-streaming-diagnostic-minimum-patch/276-SUMMARY.md` (this file)
  - `.planning/phases/276-dashboard-dom-streaming-diagnostic-minimum-patch/276-VERIFICATION.md` (this commit)
  - `tests/dashboard-stream-readiness-ping.test.js`
  - `tests/dashboard-stream-pending-intent.test.js`
  - `tests/server-ws-backpressure.test.js`
- **Files modified (8) -- all confirmed via `git diff --stat`:**
  - `showcase/server/src/ws/handler.js`
  - `extension/ws/ws-client.js`
  - `extension/content/dom-stream.js`
  - `extension/background.js`
  - `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts`
  - `showcase/angular/src/app/pages/dashboard/dashboard-page.component.html`
  - `showcase/angular/src/app/pages/dashboard/dashboard-page.component.scss`
  - `package.json`
- **Commits 647df1c, 7005823, 4b9d992, 634c0e7 confirmed in `git log` (the 5th -- this metadata commit -- is final).**
- **All 3 new tests exit 0** (16 + 14 + 22 = 52 PASS, 0 FAIL).
- **No regressions** in the 10-sample existing-test sweep nor in `showcase-build-smoke.test.js` (134/134 PASS).

## Cross-references

- CONTEXT: `.planning/phases/276-.../276-CONTEXT.md` (commit `0a032e4`)
- DIAGNOSTIC: `.planning/phases/276-.../276-DIAGNOSTIC.md` (commit `647df1c`)
- VERIFICATION: `.planning/phases/276-.../276-VERIFICATION.md` (this commit)
- Prior phase close-out: `.planning/phases/275-.../275-SUMMARY.md` (commit `340d6a8`)
- Research: `.planning/research/` (out-of-scope here -- references v0.9.61 milestone)
