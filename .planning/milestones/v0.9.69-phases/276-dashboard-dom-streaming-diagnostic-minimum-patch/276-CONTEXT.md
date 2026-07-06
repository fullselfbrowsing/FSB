# Phase 276: Dashboard DOM-Streaming Diagnostic + Minimum Patch - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning (diagnostic-first phase; scope finalises after step 1-2 reproduction)
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** STREAM-01..07

<domain>
## Phase Boundary

A user pairing the showcase dashboard with an active extension on a non-restricted tab sees the live preview pane resume streaming within 3 seconds of pressing "wake".

**The diagnostic order MUST be followed** — reproducing the bug first, capturing 3 logs, walking the 7-hypothesis chain in rank order before applying any patch. This is locked by STREAM-01..02.

**In scope:**
- Write `.planning/phases/276-.../DIAGNOSTIC.md` documenting:
  - Three captured logs (showcase server stdout, extension `fsbDiagnostics_ring`, dashboard transport-event history).
  - Reproduction steps explicit.
  - 7-hypothesis chain validation in rank order (from research SUMMARY.md): #1 hashKey room mismatch → #2 stream-tab not-ready → #3 no-tab forward → #4 domStreamReady pending-intent → #5 ext:status race → #6 LZ decompression → #7 stale-mutation loop.
- Land the MINIMUM patch for whichever hypothesis confirms.
- Add new stream-state pill tooltip surfaces (last-frame-ago, mutations applied, apply failures, stale-mutation count — all values already exist as component state per `dashboard-page.component.ts`).
- (Optional defensive bonuses if time allows): watchdog auto-resnapshot when streamingActive; sendToClients backpressure drop with counter.
- Hard cap: 5 fix attempts before re-scoping unresolved tail to v0.9.70.

**Explicitly NOT in scope:**
- Full dashboard streaming rewrite (deferred per DASHBOARD-FUTURE-01).
- New streaming features beyond the fix + tooltip surfaces.
- Performance tuning of existing streaming code beyond what the fix touches.

**Operating mode for AUTONOMOUS execution:**
- I (the autonomous orchestrator) cannot drive a real browser. The reproduction step REQUIRES a human to:
  1. Start the showcase server (`cd showcase/server && node server.js`).
  2. Load-unpacked the extension in Chrome.
  3. Open the dashboard, pair extension + dashboard, observe streaming fail.
  4. Capture 3 logs.
- Phase 276 in autonomous mode delivers:
  - DIAGNOSTIC.md framework with the 7-hypothesis checklist + space for the human to paste captured logs.
  - Pre-emptive code fixes for the TWO HIGHEST-PROBABILITY hypotheses (#1 hashKey room mismatch + #2 stream-tab not-ready) as defensive improvements — they're hardening regardless of which hypothesis is actually the root cause.
  - Stream-state pill tooltip surfaces (STREAM-04) — pure UI add, no reproduction needed.
  - The 2 defensive bonuses (STREAM-05 watchdog + STREAM-06 backpressure) — same reasoning, harmless improvements.
  - VERIFICATION.md with `status: human_needed` — the actual fix-confirmation step is HUMAN. The user runs the repro, confirms the highest-probability fix landed correctly, and if streaming still fails, follows the documented hypothesis chain.

</domain>

<decisions>
## Implementation Decisions

### Pre-emptive defensive patches (land regardless of repro outcome)
Both #1 and #2 hypotheses have **clear defensive improvements that are SAFE TO LAND even if they aren't the root cause**:

**Hypothesis #1 fix — hashKey room consistency:**
- In `showcase/server/src/ws/handler.js`, when extension AND dashboard both connect, log BOTH with the hashKey prefix `[WS] {role} connected | hashKey={prefix}` at lines 152 + 156.
- Add a `[WS] room-state` log when both roles are present in the same room, including the room's hashKey prefix. Helps future debugging.
- Add comment block at `server.js:241-262` explaining the pair-handshake contract.

**Hypothesis #2 fix — stream-tab readiness ping:**
- In `extension/ws/ws-client.js` around line 1029 (`_handleDashboardStreamStart`) and line 1406 (the `setTimeout(300)` heuristic):
  - Replace `setTimeout(300)` with a polling readiness ping via `chrome.tabs.sendMessage(tabId, {action:'pingDomStream'}, {frameId:0})` until success (5s overall timeout, 200ms intervals).
  - Add corresponding `case 'pingDomStream':` handler in `extension/content/dom-stream.js` around line 971 that responds with `{ready: true}`.
- Add `_pendingStreamStart` flag pattern (Hypothesis #4): track a pending stream-start intent that arrived before the content script was ready; re-arm it from the `domStreamReady` handler.

**Stream-state pill tooltip (STREAM-04 — pure UI add):**
- In `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts` + `.html`, update the existing `dash-preview-tooltip` element to render: `last-frame-ago: {seconds}s`, `mutations: {count}`, `apply failures: {count}`, `stale mutations: {count}`. All values are private state already.

**Defensive bonuses (STREAM-05 + STREAM-06):**
- `extension/background.js:12942-12945` watchdog-alarm handler: if `_streamingActive` true, send `ext:request-snapshot` to relay.
- `showcase/server/src/ws/handler.js:74-80` `sendToClients`: check `client.bufferedAmount > 16MB`, increment `backpressure-dropped` counter, drop frame to that client.

### DIAGNOSTIC.md scaffold
- File: `.planning/phases/276-.../DIAGNOSTIC.md`
- Sections:
  - **Reproduction steps** (numbered).
  - **Log capture commands** (server stdout redirect, extension diagnostics ring export, dashboard transport-event history dump).
  - **Hypothesis validation matrix**:
    | # | Hypothesis | Predicted symptom | Verification command | Fix surface | Status (PASS/FAIL/UNKNOWN) |
    |---|------------|-------------------|----------------------|-------------|---------------------------|
  - **Captured logs (paste here)** — empty subsections for the user to fill.
  - **Root cause identified** — empty section.
  - **Fix applied + commit hash** — empty section.

### 5-attempt cap (STREAM-07)
- If the user runs the repro and 5 successive patches fail to resolve, the unresolved tail re-scopes to v0.9.70 with a deferred-items.md entry. Hard limit.

### Tests
- `tests/dashboard-stream-readiness-ping.test.js` — exercises the new pingDomStream handler in dom-stream.js + the readiness polling loop in ws-client.js. Mock chrome.tabs.sendMessage.
- `tests/dashboard-stream-pending-intent.test.js` — exercises the `_pendingStreamStart` flag re-arm pattern.
- `tests/server-ws-backpressure.test.js` — exercises the bufferedAmount > 16MB drop counter.

Note: the existing dashboard streaming integration test surface is heavyweight (real WS + browser). These new tests are unit-level — mock the layers underneath, assert the call sequencing.

### Status routing
- **`passed`** would require successful repro + verified fix. Cannot achieve from autonomous mode without browser.
- **`human_needed`** is the realistic status: code patches landed; manual repro required to confirm fix lands.
- Document the 8-step manual repro under `<human_verification>` in VERIFICATION.md.

### Claude's Discretion
- Whether the readiness-ping polling interval is 100ms vs 200ms (recommend 200ms).
- Whether to add a "Resync now" button to the dashboard preview pane (recommend yes — uses existing `requestPreviewResync` pathway at component line 994).
- Exact wording of the new tooltip labels.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showcase/server/src/ws/handler.js` (283 lines) — relay broker; lines 74-80 sendToClients; lines 152-203 connection + room delivery; line 156 ext-side connect log.
- `extension/ws/ws-client.js` (huge) — dashboard stream handling; line 1029 _handleDashboardStreamStart; line 1359-1376 _forwardToContentScript no-tab branch; line 1406 setTimeout(300) heuristic; line 1029-1407 the streaming chain.
- `extension/content/dom-stream.js` (huge) — DOM streaming content script; line 971 message handler; line 1063-1070 domStreamReady ping on load.
- `extension/background.js` lines 6130 (existing chrome.alarms `fsb-domstream-watchdog`), 6179-6184 (domStreamReady handler), 12942-12945 (watchdog handler — currently `console.log` only).
- `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts` (huge) — dashboard UI; line ~3315 ws.onmessage; line 3411 handleWSMessage; line 3425 scheduleStreamRecovery; line 3319-3325 decompress branch; line 994 requestPreviewResync.
- `showcase/angular/src/app/pages/dashboard/dashboard-page.component.html` — dash-preview-tooltip element (existing).

### Established Patterns
- Server WS relay broadcasts via `wss.emit('connection', ws, request, {hashKey, role})`.
- Extension diagnostics ring at `chrome.storage.local.fsb_diagnostics_ring`.
- All WS message types prefixed `dash:` (dashboard → extension) or `ext:` (extension → dashboard).

### Integration Points
- `showcase/server/src/ws/handler.js`: lines 74-80 (backpressure), 152-160 (hashKey logs), 166-173 (ext:status broadcast).
- `extension/ws/ws-client.js`: line 1029 (_handleDashboardStreamStart entry), line 1406 (setTimeout to replace with readiness ping).
- `extension/content/dom-stream.js`: line 971 (handler dispatch — add pingDomStream case), line 1063-1070 (domStreamReady — wire pending-intent re-arm).
- `extension/background.js`: line 12942-12945 (watchdog upgrade), line 6179-6184 (domStreamReady handler).
- `showcase/angular/src/app/pages/dashboard/dashboard-page.component.html` — dash-preview-tooltip element + add Resync button.

</code_context>

<specifics>
## Specific Ideas

- The defensive patches for #1 and #2 are SAFE even if the actual root cause is #3-7. They harden the system regardless.
- The DIAGNOSTIC.md template guides the human through the repro and gives them the exact hypothesis-by-hypothesis test commands.
- 5-attempt cap from STREAM-07 protects the milestone close date.

</specifics>

<deferred>
## Deferred Ideas

- Full dashboard streaming rewrite (DASHBOARD-FUTURE-01).
- E2E browser test for streaming pipeline (would need Puppeteer or Playwright — not in v0.9.69 scope).
- Performance metrics dashboard for streaming (FPS, bytes/sec, frame count) — recommended for v0.9.70.
- Stream replay / inspection tool for debugging.

</deferred>
