# Phase 276 -- Dashboard DOM-Streaming Diagnostic

**Gathered:** 2026-05-14
**Status:** template -- HUMAN reproduction required to fill the captured-logs + root-cause sections
**Milestone:** v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix
**Requirements:** STREAM-01..07

---

## Phase boundary

A user pairing the showcase dashboard with an active extension on a non-restricted tab sees the live preview pane resume streaming within 3 seconds of pressing "wake".

The diagnostic order is locked by STREAM-01..02: **reproduce first, capture three logs, walk the 7-hypothesis chain in rank order, then patch the confirmed root cause.**

The autonomous orchestrator that opened this phase landed defensive patches for hypotheses #1, #2, and #4 (hashKey room-state logs, readiness-ping replacing the 300ms heuristic, pending-intent re-arm). Those patches are SAFE regardless of which hypothesis is the actual root cause. This file is the **scaffold for the HUMAN repro pass** that confirms the actual root cause and lands the minimum patch for it.

---

## Reproduction steps (HUMAN action)

1. **Start the showcase server.**
   ```bash
   cd showcase/server && node server.js > /tmp/fsb-server.log 2>&1 &
   echo "server PID: $!"
   ```
2. **Load-unpacked the extension in Chrome** from `extension/` via `chrome://extensions` -> Developer mode -> Load unpacked.
3. **Open the dashboard** in a non-extension tab. Pair the dashboard with the extension via the QR-pair flow if you have not already.
4. **Open a non-restricted target tab** in the same Chrome window (e.g. https://example.com -- NOT `chrome://`, NOT `chrome-extension://`, NOT a CWS page).
5. **Press the "wake" button on the dashboard preview pane.** Note the time.
6. **Wait 5 seconds.** Confirm the preview pane does NOT begin streaming. (This is the bug repro.)
7. **Capture all three logs** per the next section.
8. **Walk the hypothesis matrix below in rank order**, filling Status with PASS / FAIL / UNKNOWN.

---

## Log capture commands

### 1. Showcase server stdout (relay)

Already redirected in step 1 to `/tmp/fsb-server.log`. After the repro press:

```bash
tail -n 200 /tmp/fsb-server.log | tee diagnostic-server.log
```

Look for the room-state log line: `[WS] room-state | roles=ext,dash hashKey=<prefix>`. If absent, the dashboard and the extension did NOT join the same room (hypothesis #1).

### 2. Extension diagnostics ring buffer

From the extension service-worker DevTools console (`chrome://extensions` -> FSB -> "service worker" link -> Console tab):

```javascript
chrome.storage.local.get('fsb_diagnostics_ring').then(r => {
  copy(JSON.stringify(r.fsb_diagnostics_ring, null, 2));
  console.log('Copied diagnostics ring to clipboard. Paste into diagnostic-extension.json');
});
```

Save the clipboard contents to `diagnostic-extension.json` next to this file.

### 3. Dashboard transport-event history

From the dashboard tab's DevTools console:

```javascript
copy(JSON.stringify(window.__fsb_dashboard__?.transportEventHistory?.() || [], null, 2));
console.log('Copied transport-event history to clipboard. Paste into diagnostic-dashboard.json');
```

If `window.__fsb_dashboard__` is undefined, the dashboard component has not exposed the diagnostic hook. Capture the Network tab's WS frames as a fallback (Filter: WS, right-click WS row -> Save all as HAR).

---

## Hypothesis validation matrix (walk in rank order)

| # | Hypothesis                                                         | Predicted symptom                                                                                                          | Verification command (against the 3 captured logs)                                                                                                            | Fix surface                                                                                                                                                | Status (PASS/FAIL/UNKNOWN) |
| - | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1 | hashKey room mismatch (dashboard and extension join different rooms) | server log has only ONE `[WS] room-state` line OR shows `roles=ext` and `roles=dash` with DIFFERENT hashKey prefixes        | `grep '\[WS\] room-state' diagnostic-server.log` -- if no line shows BOTH `ext` AND `dash` against the same hashKey prefix, this hypothesis FIRES              | `showcase/server/src/ws/handler.js:152-156` (already-landed Task 1 logs make this diagnosable). Server-side: confirm `validateHashKey` returns same record. | _                          |
| 2 | stream-tab not ready (content script not yet loaded when stream-start arrives) | extension diag ring has `dom-forward-failed` with `readyState=sendMessage-rejected` AT THE TIME OF the stream-start         | `jq '.[] | select(.event=="dom-forward-failed" and .readyState=="sendMessage-rejected")' diagnostic-extension.json`                                            | `extension/ws/ws-client.js:1406` (already-landed Task 2 replaces `setTimeout(300)` with polling readiness ping). Confirm `pingDomStream` succeeds < 5s.    | _                          |
| 3 | no-tab forward (no tabId resolves on `_forwardToContentScript`)   | extension diag ring has `dom-forward-failed` with `readyState=no-tab`                                                       | `jq '.[] | select(.event=="dom-forward-failed" and .readyState=="no-tab")' diagnostic-extension.json`                                                          | `extension/ws/ws-client.js:1359-1376` (`_streamingTabId` fallback). Fix surface: arm `_streamingTabId` earlier (on `dash:dom-stream-start` payload `tabId`). | _                          |
| 4 | domStreamReady pending-intent (stream-start arrived BEFORE the content script's ready ping) | extension diag ring shows `domStreamReady` arriving AFTER `dash:dom-stream-start` was processed                              | `jq '.[] | select(.event=="domStreamReady" or .event=="dash:dom-stream-start")' diagnostic-extension.json` -- compare timestamps                              | `extension/ws/ws-client.js:1029` (already-landed Task 2 adds `_pendingStreamStart` flag re-arm path).                                                       | _                          |
| 5 | ext:status race (dashboard sends `dash:dom-stream-start` BEFORE `ext:status online=true`)  | dashboard transport events show `dash:dom-stream-start` sent BEFORE `ext:status` `online=true` received                     | `jq '.[] | select(.type=="dash:dom-stream-start" or .type=="ext:status")' diagnostic-dashboard.json` -- compare timestamps                                    | `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts:3411` (handleWSMessage ext:status branch). Gate `wake` button until status received. | _                          |
| 6 | LZ decompression failure (compressed envelope arrives but `LZString` is undefined or returns null) | dashboard console shows `Failed to decompress dashboard WS message` transport-error                                          | `jq '.[] | select(.event=="message-parse-failed")' diagnostic-dashboard.json`                                                                                  | `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts:3319-3325` (decompress branch). Confirm `LZString` global is bundled.                | _                          |
| 7 | stale-mutation loop (mutations arrive against a stale DOM and trigger infinite resync) | dashboard transport events show repeated `mutation-resync-requested` with `reason=stale-mutation-*` within seconds           | `jq '.[] | select(.event=="mutation-resync-requested")' diagnostic-dashboard.json`                                                                            | `showcase/angular/src/app/pages/dashboard/dashboard-page.component.ts:3144,3162,3168,3175` (stale-mutation counter). Snapshot every Nth mutation as guard. | _                          |

### How to read this table

- Walk top-to-bottom. The **first row** whose verification command returns a non-empty result is the **most likely root cause**.
- If hypothesis #1 PASSES (i.e. its symptom appears), root cause is hashKey mismatch -- stop. Land the targeted server-side fix. Re-run repro.
- If hypothesis #1 FAILS, move to #2. Continue.
- Multiple hypotheses can co-fire. The defensive patches landed in this phase already harden #1, #2, and #4 -- so the first NEW row to fire is the unresolved root cause for the v0.9.69 close.
- After 5 successive patch-and-repro attempts (STREAM-07 cap), re-scope unresolved tail to v0.9.70 deferred-items.md.

---

## Captured logs (paste here)

### diagnostic-server.log (tail 200 of /tmp/fsb-server.log)

```
<paste here>
```

### diagnostic-extension.json (fsb_diagnostics_ring contents)

```json
<paste here>
```

### diagnostic-dashboard.json (transport-event history)

```json
<paste here>
```

---

## Root cause identified

_(empty -- to be filled after repro pass)_

---

## Fix applied + commit hash

_(empty -- to be filled after patch landed and repro re-run)_

---

## Re-scope note (if 5-attempt cap is reached)

If after 5 patch attempts the repro still fails, the unresolved hypothesis (and any associated test gap) re-scopes to **v0.9.70** with a deferred-items.md entry. Hard limit per STREAM-07.
