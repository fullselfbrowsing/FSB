---
phase: 12
slug: side-panel-follows-automation
depth: standard
reviewed: 2026-06-08
status: findings
findings_count: { critical: 0, warning: 2, info: 6 }
---

# Phase 12: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 5

- extension/ui/sidepanel-message-log.js (NEW sidecar)
- extension/ui/sidepanel.js (3-tier hydrate + write-through + EC-05 defense)
- extension/ui/options.js (DEFAULT_SETTINGS default flip)
- extension/ui/sidepanel.html (sidecar script tag insert)
- extension/background.js (handleStartAutomation sidePanel.setOptions+open)

**Status:** findings (2 Warning, 6 Info; 0 Critical)

## Summary

Phase 12 ships three coupled surfaces (FINT-22 live progress, FINT-23 message log + hydrate, FINT-24 per-tab sidepanel auto-open) across one new sidecar and four modified files. The code is generally well-structured, follows established Phase 11 sidecar patterns (IIFE dual-export, in-place envelope mutation, defensive shape checks), and demonstrates careful attention to MV3 service-worker concurrency edges (debouncer cancel-then-drop in chrome.tabs.onRemoved, await ordering in handleStartAutomation for user-gesture preservation, chronological sort on hydrate replay).

Confirmation of high-leverage invariants:

- **INV-04 / INV-06 / INV-01 / INV-02 / INV-05 UPHELD.** `git log --since=2026-06-07 -- extension/ai/agent-loop.js lattice/ extension/tool-definitions.js` returns zero commits in Phase 12 window. No protected paths were touched.
- **renderPersistedMessage (sidepanel.js:1671-1682) uses `textContent` (line 1680), NOT `innerHTML`.** XSS-safe for arbitrary persisted message content. Pitfall 3 defense holds: Tier 1 + Tier 2 hydrate calls render through this helper, NOT through addMessage, so a hydrate replay cannot re-trigger the write-through hook (no infinite re-persist loop).
- **iteration_complete handler (sidepanel.js:2174-2187) persists BEFORE the updateStatusMessage gate.** D-10 contract satisfied: persistence fires even when `currentStatusMessage` is null or `isRunning` is false.
- **chrome.sidePanel.setOptions + open are the FIRST two awaits in handleStartAutomation (background.js:6438-6443).** User-gesture context preserved per Chrome MV3 contract (12-RESEARCH Section 7.1 + Pitfall 2).
- **Tier 1 / Tier 2 mutual exclusion (sidepanel.js:309-321) is correct.** Tier 1 early-returns the message count when `messages.length > 0`, so Tier 2 never runs for Phase-12+ conversations.
- **EC-05 defense (sidepanel.js:780-823) cancel-then-drop ordering is correct.** Debouncer cancel + in-memory buffer delete fire BEFORE the storage envelope drop, so a pending timer cannot resurrect a dropped entry.

Findings below are concurrency / behavior edge cases (Warnings) and quality observations (Info). No security vulnerabilities, no data-loss paths, no breakage of locked decisions.

## Warnings

### WR-01: addMessage write-through fires during early-boot welcome message with null conversationId — silently drops persistence

**File:** `extension/ui/sidepanel.js:1013` (caller) and `:1589-1593` (drop gate)

**Issue:** The boot path at lines 1006-1014 calls `addMessage('Welcome to FSB. How can I help?', 'system')` when `hydratedCount === 0`. addMessage now unconditionally fires the `_persistMessage` write-through (line 1752). However, on a fresh tab the boot sequence does NOT mint a conversationId — initTabConversationStore leaves `conversationId = null` (D-17 lazy mint deferred until first send). The `_persistMessage` early-return at line 1591 (`if (!conversationId || typeof conversationId !== 'string') return;`) silently drops the welcome message.

This is INTENTIONAL by design (CONTEXT D-26 + the _persistMessage docstring at 1580-1581 explicitly call this out as a guard). However, the same gate fires for the `startNewChat` welcome message at line 1257 — and there `ensureTabConversationForActiveTab(true)` is invoked fire-and-forget at line 1241 (4 lines BEFORE `addMessage('Welcome...')`). The mint may not have completed when addMessage runs, so the welcome message is dropped from the new conversation's persisted log. Subsequent user messages persist correctly, but the conversation transcript on the next reopen is missing its opening line.

This is a UX consistency gap, not a correctness bug. The welcome message is generated client-side and is identical for every conversation, so the next-reopen hydrate will see (user msg, assistant reply, ...) without the welcome, and the Tier-3 fallback at hydrateChatFromConversationId returns 0 only when ZERO messages exist, so the welcome is re-rendered. But for hydrated conversations the welcome is silently elided.

**Fix:** Either (a) await ensureTabConversationForActiveTab(true) before addMessage in startNewChat (line 1241):
```js
async function startNewChat() {
  // ...
  await ensureTabConversationForActiveTab(true);
  // ... (rest unchanged including chatMessages.innerHTML = '' and addMessage welcome)
}
```
Or (b) explicitly skip persisting welcome messages by passing a marker through addMessage:
```js
addMessage('Welcome to FSB. How can I help?', 'system', '__skip_persist__');
```
and gating `_persistMessage` on the kind. Option (a) is cleaner and aligns with the existing send-path mint-before-persist ordering at handleSendMessage line 1106.

### WR-02: `_flushMessageLog` resurrection race — items appended DURING the storage `await` are not auto-flushed on success

**File:** `extension/ui/sidepanel.js:1626-1652`

**Issue:** `_flushMessageLog(convId)` reads the buffer at line 1627, copies a snapshot at line 1629, clears `buffer.length = 0` at line 1630, then `await chrome.storage.local.get(...)` and `await chrome.storage.local.set(...)`. During those two awaits, additional `_persistMessage(...)` calls can run (the chrome.* API yields the microtask queue), pushing new items into the same `buffer` reference (the Map entry, not the snapshot).

Two paths:

1. **Storage write succeeds (try-block reaches end):** the snapshot is durably persisted, the items appended during the await window stay in `buffer` — but the debouncer timer for this convId has already fired (debouncer entered the .schedule cleared at `delete _pending[key]` in the sidecar's `schedule` timer callback at line 1583). No new schedule call fires unless an additional `_persistMessage` runs AFTER the storage await resolves. If the user is idle, the items remain in buffer until the next chat message, the next addMessage call, or a beforeunload force-flush. Lost-on-crash window grows from the documented 200ms to "200ms + time-to-next-write-or-close." Acceptable UX-grade per D-03, but the documented bound is violated.

2. **Storage write throws (catch-block at 1643-1651):** the resurrection logic at lines 1645-1650 does `_messageLogPendingBuffer.set(convId, snapshot.concat(current))`. If `current` exists (additional items appended during the await), the resurrection prepends the failed snapshot. The next debouncer flush fires when the NEXT `_persistMessage` is called — but if the user closes the panel here, the beforeunload `flushAll()` (line 884) iterates `_pending` (the debouncer-internal map), NOT `_messageLogPendingBuffer`. The buffer is stuck. This is the same observable as case (1) — bounded UX-grade staleness only.

Neither path is a correctness defect (no data corruption, no double-write), but the lost-on-crash window stretches beyond the documented 200ms bound. The fix is to re-schedule the debouncer on a successful flush if the in-memory buffer still has items:

**Fix:**
```js
async function _flushMessageLog(convId) {
  var buffer = _messageLogPendingBuffer.get(convId);
  if (!buffer || buffer.length === 0) return;
  var snapshot = buffer.slice();
  buffer.length = 0;
  try {
    var bag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
    var envelope = bag[FSBSidepanelMessageLog.STORAGE_KEY];
    if (!FSBSidepanelMessageLog.isValidEnvelope(envelope)) {
      envelope = FSBSidepanelMessageLog.emptyEnvelope();
    }
    for (var i = 0; i < snapshot.length; i++) {
      FSBSidepanelMessageLog.appendMessage(envelope, convId, snapshot[i]);
    }
    var payload = {};
    payload[FSBSidepanelMessageLog.STORAGE_KEY] = envelope;
    await chrome.storage.local.set(payload);

    // Phase 12 WR-02 fix: items appended DURING the await stay in buffer.
    // Re-schedule so they flush within the documented 200ms-after-last-call bound.
    var residual = _messageLogPendingBuffer.get(convId);
    if (residual && residual.length > 0 && _messageLogDebouncer) {
      _messageLogDebouncer.schedule(convId, function () {
        return _flushMessageLog(convId);
      });
    }
  } catch (_e) {
    var current = _messageLogPendingBuffer.get(convId);
    if (current && current.length > 0) {
      _messageLogPendingBuffer.set(convId, snapshot.concat(current));
    } else {
      _messageLogPendingBuffer.set(convId, snapshot);
    }
    // Also re-schedule on failure so the retry fires bounded-time later.
    if (_messageLogDebouncer) {
      _messageLogDebouncer.schedule(convId, function () {
        return _flushMessageLog(convId);
      });
    }
  }
}
```

## Info

### IN-01: `iteration_complete` handler hardcodes `maxIterations: 100` even though session-aware value is available

**File:** `extension/ui/sidepanel.js:2183`

**Issue:** Line 2183 passes `maxIterations: 100` to updateStatusMessage in the iteration_complete handler. The actual user-configured `maxIterations` setting (default 100, range 50-2000 per options.js:16) is stored in chrome.storage.local and read by background.js on session start (background.js:6605 `userMaxIterations`). The progress bar at line 2184 computes percent using this constant, so if a user lowered maxIterations to 50, the bar shows "50%" when iteration is 25 (real progress: 50%). Pre-Phase-12 the case 'statusUpdate' path at line 2099-2103 read `request.maxIterations` from the broadcast, but the new iteration_complete handler does not.

**Fix:** Either read maxIterations from the request payload (if background.js can include it in the iteration_complete event), or read from chrome.storage.local once at boot and cache:
```js
case 'iteration_complete':
  _persistMessage('assistant', 'Step ' + request.iteration + ' complete', 'progress');
  if (currentStatusMessage && isRunning) {
    var maxIter = request.maxIterations || _cachedMaxIterations || 100;
    updateStatusMessage('Step ' + request.iteration + ' complete', {
      iteration: request.iteration,
      maxIterations: maxIter,
      progressPercent: Math.min(100, Math.round((request.iteration / maxIter) * 100))
    });
  }
  break;
```

### IN-02: Sidecar `_enforceLruCap` byConv-reaping step is unnecessary when called from `appendMessage`

**File:** `extension/ui/sidepanel-message-log.js:92-97`

**Issue:** The byConv-vs-lru consistency reap at lines 92-97 iterates ALL byConv keys and drops any not present in lru. This is defensive against corrupt envelopes (DevTools tampering, partial writes) but on the happy path called from `appendMessage` (line 148) it runs on every message append. With cap=50 and typical envelope size, this is O(50) per append — negligible CPU, but slightly wasteful since `_touchLru` immediately above already ensures the active key is in lru.

This is a defense-in-depth pattern with a documented rationale in the docstring (lines 80-82). Not a bug, but the helper's two responsibilities (tail-eviction + corruption reap) could be split so callers opt into the corruption-reap pass only at envelope-load boundaries. Defer if the convention is established codebase-wide.

**Fix (optional, low priority):** Extract the corruption reap into a separate `_reapOrphanedByConv` helper called from `appendMessage` only once on first-call-with-suspect-envelope, or move it to `isValidEnvelope` as part of the validation pass.

### IN-03: Sidecar `createDebouncer` schedule fires async callback inside try/catch but swallows the resulting promise rejection silently

**File:** `extension/ui/sidepanel-message-log.js:229-234`

**Issue:** The debouncer's timer callback wraps `cb()` in `Promise.resolve(cb()).catch(function () {})` at line 232. This silently swallows any rejection from the flush callback. Phase 11 review WR-04 flagged the same `catch (_e) { /* swallow */ }` pattern as needing a console.warn breadcrumb. Phase 12's silent swallow at lines 232-233 is a regression of the same anti-pattern.

The flush callback is `_flushMessageLog(convId)`, which has its own try/catch for storage failures, so legitimate failures already swallow inside the flush. A truly unexpected rejection bubbling through this catch indicates a programming bug (e.g., the cb threw synchronously, or _flushMessageLog itself crashed before its own try). Silent swallow makes the bug invisible.

**Fix:**
```js
entry.timerId = _setTimeoutFn(function () {
  entry.timerId = null;
  delete _pending[key];
  try {
    Promise.resolve(cb()).catch(function (err) {
      try { console.warn('[FSBSidepanelMessageLog] debouncer cb rejected', err && err.message); } catch (_e) {}
    });
  } catch (err) {
    try { console.warn('[FSBSidepanelMessageLog] debouncer cb threw sync', err && err.message); } catch (_e) {}
  }
}, debounceMs);
```
Apply the same pattern to `flush` (line 244-245) and `flushAll` (line 251).

### IN-04: `beforeunload` flushAll is best-effort but caller does not await — guaranteed not to complete before panel teardown

**File:** `extension/ui/sidepanel.js:882-886`

**Issue:** The beforeunload handler calls `_messageLogDebouncer.flushAll().catch(function () {})` at line 884 but does NOT await it. beforeunload fires synchronously during page-unload; any async work scheduled inside MUST complete before the page is destroyed. Chrome will sometimes allow ~30ms of grace time for already-scheduled microtasks, but `flushAll` does a `chrome.storage.local.get` + `chrome.storage.local.set` round-trip that takes 5-50ms typically. The first await yields the microtask queue; if the page is being torn down, the await may never resolve.

In practice, the user closing the side panel does NOT always trigger an immediate teardown — the panel may stay alive briefly. AND the debouncer is also designed to flush on the next addMessage call OR on the EC-05 onRemoved path. So this is mostly belt-and-suspenders. But the contract at D-03 ("forced flush on beforeunload") is not actually guaranteed by this implementation.

**Fix:** Switch to `chrome.storage.local.set()` with the SYNCHRONOUS callback form INSIDE a synchronous traversal of `_messageLogPendingBuffer` (no awaits). The fire-and-forget callback may or may not run before teardown, but the write request is queued in the IPC channel before unload begins. Storage writes initiated this way usually persist even if the page dies before the callback returns. Pattern:
```js
function _flushAllSync() {
  // Synchronous best-effort: read once, apply all pending buffers, write once.
  // Cannot await; relies on chrome.storage IPC queue surviving page unload.
  try {
    chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY, function (bag) {
      var envelope = bag && bag[FSBSidepanelMessageLog.STORAGE_KEY];
      if (!FSBSidepanelMessageLog.isValidEnvelope(envelope)) {
        envelope = FSBSidepanelMessageLog.emptyEnvelope();
      }
      _messageLogPendingBuffer.forEach(function (buffer, convId) {
        for (var i = 0; i < buffer.length; i++) {
          FSBSidepanelMessageLog.appendMessage(envelope, convId, buffer[i]);
        }
      });
      var payload = {};
      payload[FSBSidepanelMessageLog.STORAGE_KEY] = envelope;
      chrome.storage.local.set(payload);
    });
  } catch (_e) { /* swallow */ }
}
window.addEventListener('beforeunload', _flushAllSync);
```
This is callback-based, single-pass, and does not yield to the event loop until the storage IPC is queued.

### IN-05: `_persistMessage` length check uses `content.length === 0` but allows whitespace-only content

**File:** `extension/ui/sidepanel.js:1592`

**Issue:** Line 1592 gates persistence on `typeof content !== 'string' || content.length === 0`. A whitespace-only string (e.g., `'   '` or `'\n'`) passes this gate and gets persisted. Most call sites trim before passing, but the `case 'iteration_complete'` handler at line 2179 passes a constructed string that cannot be whitespace-only, so the impact is theoretical. Adding `content.trim().length === 0` makes the gate consistent with the `handleSendMessage` trim at line 1089.

**Fix:**
```js
if (typeof content !== 'string' || content.trim().length === 0) return;
```

### IN-06: chrome.tabs.onRemoved EC-05 listener nests three layers of try/catch with all swallowing — debugging is impossible

**File:** `extension/ui/sidepanel.js:780-823`

**Issue:** The EC-05 defense listener has THREE separate try/catch blocks (lines 789-795, 797, 810-821) all using `catch (_e) { /* swallow */ }`. If the EC-05 defense fails in production (e.g., the message-log envelope drop throws), there is no trace anywhere — the symptom is a stale entry that LRU eviction reaps eventually (line 821 comment). Phase 11 review WR-04 flagged the same swallow pattern.

Per the CLAUDE.md project guidance ("Real-runtime tests, not static-text") and the broader Phase 11 fix philosophy of making rare races visible (see the no-active-tab WR-02 fix at line 245 which added a console.warn breadcrumb), the EC-05 swallows should each emit a console.warn with the catch reason. Future debugging (e.g., "why did this tab's messages survive after close?") becomes possible.

**Fix:** Replace each `catch (_e) { /* swallow */ }` in the EC-05 path with `catch (e) { try { console.warn('[FSB EC-05] step X failed:', e && e.message); } catch (_w) {} }`. Three small breadcrumbs, zero behavior change, full diagnosability gain.

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

## Fixes Applied

**Fixed at:** 2026-06-08
**Fixer:** Claude (gsd-code-fixer)
**Scope:** Critical + Warning (2 of 2 in-scope findings addressed)

| Finding | Status | Commit | Files Modified |
|---------|--------|--------|----------------|
| WR-01 | Fixed | `1f2ceb73` | `extension/ui/sidepanel.js` |
| WR-02 | Fixed | `78483056` | `extension/ui/sidepanel.js` |

### WR-01: addMessage write-through fires during early-boot welcome message with null conversationId -- silently drops persistence

**Commit:** `1f2ceb73` -- `fix(12-fix): WR-01 await ensureTabConversationForActiveTab before welcome addMessage`

Applied REVIEW option (a). `startNewChat` is now `async`; `ensureTabConversationForActiveTab(true)` is `await`-ed inside a try/catch BEFORE the chat-clear + `addMessage('Welcome to FSB. How can I help?', 'system')` call site. This guarantees the fresh `conversationId` is bound before the welcome message's `_persistMessage` write-through hook fires, so the welcome lands in the correct fresh conversation's persisted log and hydrates consistently on next reopen. The only call site is the `newChatBtn` click event listener (line 1048) which accepts async handlers natively. Try/catch swallow preserves the prior fire-and-forget `.catch(function () {})` semantics so UI clearing still proceeds on mint failure.

### WR-02: `_flushMessageLog` resurrection race -- items appended DURING the storage `await` are not auto-flushed on success

**Commit:** `78483056` -- `fix(12-fix): WR-02 re-schedule debouncer if buffer has residual items after flush`

Applied REVIEW recommended fix verbatim shape. After the `await chrome.storage.local.set(payload)` resolves, `_flushMessageLog` now checks `_messageLogPendingBuffer.get(convId)` for residual items appended during the await window. If residuals exist AND the debouncer is still mounted, it re-schedules another 200ms flush cycle. The catch-block also re-schedules on storage failure so the resurrected buffer is retried bounded-time later rather than waiting for the next `_persistMessage` call. Both re-schedule sites gate on `_messageLogDebouncer && typeof _messageLogDebouncer.schedule === 'function'` so beforeunload teardown ordering degrades silently. Restores the documented D-03 200ms lost-on-crash bound.

**Post-fix verification:**

- `node tests/sidepanel-message-log-smoke.test.js` -> 61 PASS / 0 FAIL.
- `npm test` -> exit 0; cumulative 61 PASS / 0 FAIL.
- `node -c extension/ui/sidepanel.js` -> clean.
- INV-04: `grep -c "setTimeout" extension/ai/agent-loop.js` == 8 (UPHELD).
- INV-06: `cd lattice && git rev-parse HEAD` == `e95067bfa87ed1b75838fc3b3ef217a3b01acbd3` (UPHELD; SHA frozen).
- INV-01 / INV-02 / INV-05: protected paths untouched (only `extension/ui/sidepanel.js` modified across both fix commits).

**Info findings (IN-01 through IN-06):** Out of scope for this fix pass. Documented in REVIEW above for future enhancement consideration; no Phase 12 ship-blocker carry-forward.

_Fixed: 2026-06-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
