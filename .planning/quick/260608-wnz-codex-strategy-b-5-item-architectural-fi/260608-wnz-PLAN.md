---
quick_task: 260608-wnz
title: "Codex Strategy B 5-item architectural fix for cluster1 persistence (D-PERSIST + E-PERSIST)"
created: 2026-06-08
branch: automation
mode: quick-full
type: execute
autonomous: true
files_modified:
  - extension/background.js
  - extension/ui/sidepanel.js
  - extension/ui/sidepanel-message-log.js
  - tests/sidepanel-multi-document-fanout.test.js  # NEW
  - package.json  # scripts.test chain extended
ref:
  - .planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/CODEX-RESPONSE.md
  - .planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/CODEX-BRIEF.md
  - .planning/debug/cluster1-routing.md
  - .planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/260608-uof-SUMMARY.md
preserves_uof:
  - 24d05f72  # handler shape (sessionKnown scan + unconditional persist + isOriginatingActive render gate)
  - 62c34443  # 13-site tabId thread on automationComplete broadcasts
  - 021b7f60  # 32-PASS background-tab-completion test (must still pass)

must_haves:
  truths:
    - "Tab B's natural completion lands in conv_B's persisted log (fsbConversationMessages) exactly once after the session terminates, regardless of which tab is active when the broadcast fires."
    - "Tab A's natural completion appears exactly once in conv_A's DOM AND exactly once in conv_A's persisted log, even when two or more sidepanel documents simultaneously receive the automationComplete broadcast."
    - "Boot getStatus on a fresh sidepanel document only adopts session(s) whose owning tabId matches the document's active tab; sessions belonging to other tabs are not silently appropriated."
    - "handleStartAutomation does NOT rekey/reopen the sidepanel document when the start request originated from inside that same sidepanel document (sender.url ends in 'ui/sidepanel.html')."
    - "Background-side completion persistence fires once per (sessionId, conversationId) terminal, BEFORE the cross-context broadcast, so the durable write is independent of which sidepanel context lives long enough to handle the broadcast."
    - "The persisted message schema supports an optional sessionId + terminal:true marker; both the persist path and the live automationComplete handler skip duplicate writes/renders when a terminal entry for the same sessionId already exists."
  artifacts:
    - path: "extension/background.js"
      provides: "C1: sender-URL no-reopen gate in handleStartAutomation around L6493 (skip chrome.sidePanel.setOptions + chrome.sidePanel.open when sender.url ends in 'ui/sidepanel.html'). C2: case 'getStatus' becomes tab-scoped (around L5390) - filters activeSessions by request.activeTabId === session.tabId; backward-compat: when activeTabId omitted, returns sessionIds[0] global behavior + console.warn citing this task. C3: new helper fsbPersistTerminalMessageToConversation(convId, sessionId, content) called from finalizeSession BEFORE notifySidepanel emits; reads + writes fsbConversationMessages with idempotent guard (no-op if conv already has terminal entry for that sessionId)."
      contains: ["sender.url.endsWith('ui/sidepanel.html')", "request.activeTabId", "fsbPersistTerminalMessageToConversation"]
    - path: "extension/ui/sidepanel.js"
      provides: "C2: boot getStatus payload around L1052 includes activeTabId: (tab && tab.id) || _activeTabIdSnapshot so background returns tab-scoped sessions only. C4: case 'automationComplete' handler around L2466 adds sessionId+terminal dedupe guard BEFORE _persistMessageToConversation call AND BEFORE _renderCompletionDomOnly call - reads current conv log, skips persist+render if any existing entry has sessionId === request.sessionId AND terminal === true. _persistMessageToConversation signature extended with optional 5th + 6th args (sessionId, terminal) that flow through to the message log buffer."
      contains: ["activeTabId:", "request.sessionId", "terminal: true"]
    - path: "extension/ui/sidepanel-message-log.js"
      provides: "C4: message schema extended with OPTIONAL sessionId + terminal:true fields; ALLOWED_KINDS unchanged; appendMessage accepts sessionId/terminal and stores them when present (backward-compat: absent fields default to undefined and are NOT serialized into the stored row). New helper hasTerminalForSession(envelope, convId, sessionId) returns boolean for idempotency checks. _isValidMessage allows the new optional fields (presence is checked only when defined)."
      contains: ["sessionId", "terminal", "hasTerminalForSession"]
    - path: "tests/sidepanel-multi-document-fanout.test.js"
      provides: "C5: real-runtime regression. Instantiates TWO sandbox copies of the chrome.runtime.onMessage handler body (Doc1 + Doc2) with SEPARATE _tabRunningMap state, mocks chrome.runtime.onMessage so a single broadcast dispatches to BOTH listeners, mocks chrome.storage.local with a shared backing Map (reflects production where both docs share fsbConversationMessages). Three scenarios: (a) sess_A completion fanned to both docs => conv_A has EXACTLY ONE terminal message; (b) sess_B completion fanned to both docs => conv_B has EXACTLY ONE terminal message and sess_B's message lives in conv_B (NOT conv_A); (c) boot getStatus from Doc2 with activeTabId=200 returns ONLY sess_B (not sess_A, not sessionIds[0])."
      contains: ["createDoc1", "createDoc2", "activeTabId"]
    - path: "package.json"
      provides: "scripts.test &&-chain extended to include tests/sidepanel-multi-document-fanout.test.js as the FINAL entry (after sidepanel-background-tab-completion.test.js)."
      contains: ["sidepanel-multi-document-fanout"]
  key_links:
    - from: "extension/background.js handleStartAutomation"
      to: "chrome.sidePanel.setOptions/open"
      via: "sender.url ends in 'ui/sidepanel.html' gate"
      pattern: "sender\\.url.*sidepanel\\.html"
    - from: "extension/ui/sidepanel.js boot getStatus call"
      to: "extension/background.js case 'getStatus'"
      via: "activeTabId payload field"
      pattern: "activeTabId:"
    - from: "extension/ai/agent-loop.js finalizeSession (notifySidepanel call site)"
      to: "fsbPersistTerminalMessageToConversation (background-side durable write)"
      via: "called BEFORE notifySidepanel within finalizeSession"
      pattern: "fsbPersistTerminalMessageToConversation"
    - from: "extension/ui/sidepanel.js case 'automationComplete'"
      to: "FSBSidepanelMessageLog.hasTerminalForSession"
      via: "render+persist dedupe guard"
      pattern: "hasTerminalForSession"
    - from: ".planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/CODEX-RESPONSE.md"
      to: "this plan"
      via: "5-item architectural fix mapped 1:1 to T1..T5"
      pattern: "5-item"
---

<objective>
Apply Codex's 5-item architectural fix for cluster1 persistence (D-PERSIST + E-PERSIST symptoms that survived the 260608-uof handler restructure).

The 260608-uof commits restructured the sidepanel automationComplete handler correctly (run persist + per-tab state UNCONDITIONALLY, gate only DOM render on isOriginatingActive), but the symptoms persist because the bugs are UPSTREAM of the handler:

- D-PERSIST root cause (per Codex): sess_B is never reliably recorded in the live sidepanel document's _tabRunningMap because handleStartAutomation REOPENS the tab-scoped sidepanel BEFORE sendResponse, the start-response recording happens only in the sidepanel callback at sidepanel.js:1286 (the reopen kills that document), AND boot getStatus at sidepanel.js:1051 + background.js:5390 globally maps sessionIds[0] to whatever tab is active.
- E-PERSIST root cause (per Codex): a SECOND sidepanel document/listener can believe sess_A is "known" (via boot getStatus global misroute) and append the SAME completion; automationComplete persistence is append-only with no sessionId/terminal dedupe at sidepanel.js:2466 + sidepanel-message-log.js:140.

Codex's prescription (5 items, sequenced):
1. C1 (no-reopen): skip chrome.sidePanel.open when sender.url ends in 'ui/sidepanel.html'
2. C2 (tab-scoped getStatus): sidepanel sends activeTabId; background filters by session.tabId
3. C3 (background-side durable persist): write terminal to fsbConversationMessages from finalizeSession BEFORE broadcast, keyed by conversationId
4. C4 (sessionId+terminal dedupe): message schema gets optional sessionId+terminal:true; persist+render skip if already present
5. C5 (multi-document fanout test): two sandbox sidepanel docs side-by-side + shared storage + scoped getStatus

Purpose: restore single-source-of-truth semantics for completion persistence. After this task, Tab B completes once into conv_B regardless of active tab, and Tab A renders/persists once regardless of how many sidepanel contexts are alive.

Output: 5 commits (C1->C5) on automation branch. Existing 4 sidepanel smokes + 28 PASS green; new multi-document-fanout smoke green.

DO NOT REVERT the 260608-uof handler restructure (commit 24d05f72) - the handler shape stays identical. C3 makes background AUTHORITATIVE for the durable write; sidepanel becomes idempotent backup. C4 adds dedupe to both paths.

ELIMINATED (per Codex; do not touch): state-emitter.js, session_ended emission, MCP bridge - none of these are duplicate sources in this flow.
</objective>

<execution_context>
Mode: quick-full with --validate. After commits land, plan-checker reviews this plan. Verifier later runs against the must_haves block.

Sequencing rationale (strict):
- C1 reduces sidepanel context fanout (E root cause). Smallest surface, biggest blast-radius reduction. First so subsequent fixes operate on a less-chaotic runtime.
- C2 fixes the session-to-tab binding leak (D root cause for BOOT path). Independent of C1 mechanically but tighter to think about with fanout already gone.
- C3 moves authoritative durable write to background. Sidepanel persist becomes idempotent backup. Both D and E benefit.
- C4 adds the idempotency that makes the redundant sidepanel persist actually safe. Both D and E benefit. C3 + C4 together are the architectural fix.
- C5 locks the entire regression class. Must FAIL against pre-C1 code shape and PASS against post-C4 code.

Each task is its own commit. npm test MUST exit 0 after EACH commit.
</execution_context>

<context>
@.planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/CODEX-RESPONSE.md
@.planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/CODEX-BRIEF.md
@.planning/debug/cluster1-routing.md
@.planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/260608-uof-SUMMARY.md

# Source files
@extension/background.js
@extension/ui/sidepanel.js
@extension/ui/sidepanel-message-log.js
@extension/ai/agent-loop.js

# Test templates
@tests/sidepanel-progress-tick-setter-routing.test.js
@tests/sidepanel-background-tab-completion.test.js
@tests/sidepanel-message-log-smoke.test.js

# Test chain
@package.json

<interfaces>
# Key contracts the executor needs. Extracted from codebase.
# Executor: DO NOT re-explore. Use these directly.

# extension/background.js handleStartAutomation (lines ~6476-6816)
async function handleStartAutomation(request, sender, sendResponse) {
  const { task, tabId, conversationId, source } = request;
  let targetTabId = tabId || sender.tab?.id;
  // C1 INSERT POINT: gate the next block on sender.url NOT ending in 'ui/sidepanel.html'.
  if (targetTabId && typeof chrome.sidePanel !== 'undefined') {
    try {
      await chrome.sidePanel.setOptions({ tabId: targetTabId, enabled: true, path: 'ui/sidepanel.html' });
      await chrome.sidePanel.open({ tabId: targetTabId });
    } catch (sidePanelErr) { /* ... */ }
  }
  // ... rest of session creation + sendResponse at ~L6809
}

# extension/background.js case 'getStatus' (line ~5390)
case 'getStatus':
  const sessionIds = Array.from(activeSessions.keys());
  const firstSession = sessionIds.length > 0 ? activeSessions.get(sessionIds[0]) : null;
  sendResponse({
    status: 'ready',
    activeSessions: activeSessions.size,
    sessionIds: sessionIds,
    currentSessionId: sessionIds[0] || null,
    currentTask: firstSession?.task || null,
    currentStartTime: firstSession?.startTime || null,
    currentIterationCount: firstSession?.iterationCount || 0,
    currentMaxIterations: firstSession?.maxIterations || 100,
    currentActionCount: firstSession?.actionHistory?.length || 0
  });
  break;

# extension/ai/agent-loop.js finalizeSession (lines 1513-1522)
async function finalizeSession(sid, sess, terminal) {
  saveToLogger(sid, sess, sess.status);
  notifySidepanel(sid, sess, terminal);  # C3 INSERT POINT: persist BEFORE this call
  await sleep(900);
  if (typeof cleanupSession === 'function') {
    try { await cleanupSession(sid); } catch (_e) { /* non-fatal */ }
  }
}

# extension/ui/sidepanel.js boot getStatus (line ~1052)
chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {  # C2 INSERT POINT: add activeTabId
  if (chrome.runtime.lastError) { /* ... */ return; }
  if (response && response.activeSessions > 0) {
    setRunningState(_activeTabIdSnapshot, response.currentSessionId || null);
    if (!currentSessionId && response.currentSessionId) { currentSessionId = response.currentSessionId; }
  }
});

# extension/ui/sidepanel.js case 'automationComplete' (lines 2432-end of case)
case 'automationComplete': {
  var sessionKnown = (request.sessionId === currentSessionId);
  if (!sessionKnown) { /* scan _tabRunningMap */ }
  if (!sessionKnown) return;

  var completionMessage = request.result || '...';
  var originatingConvId = request.conversationId || conversationId;
  # C4 INSERT POINT: dedupe guard BEFORE the next two lines
  _persistMessageToConversation('assistant', completionMessage, 'text', originatingConvId);
  var originatingTabId = (typeof request.tabId === 'number') ? request.tabId : _resolveTabIdForSession(request.sessionId);
  var isOriginatingActive = (originatingConvId === conversationId);
  if (isOriginatingActive) {
    if (currentStatusMessage) { /* manual cleanup */ }
    _renderCompletionDomOnly(completionMessage, isPartial ? 'partial' : 'ai', isPartial);
  }
  # ... per-tab state update + recon IIFE
}

# extension/ui/sidepanel-message-log.js appendMessage (lines 124-150)
function appendMessage(envelope, convId, msg) {
  if (!isValidEnvelope(envelope)) return false;
  var key = _normalizeConvId(convId);
  if (key === null) return false;
  if (!_isValidMessage(msg)) return false;
  var log = envelope.byConv[key];
  # ... lazy-create log ...
  log.messages.push({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    kind: msg.kind
    # C4: add `sessionId: msg.sessionId` and `terminal: msg.terminal` IF present
  });
  log.lastWriteAt = now;
  _touchLru(envelope, key);
  _enforceLruCap(envelope, DEFAULT_CAP);
  return true;
}

# extension/ui/sidepanel.js _persistMessageToConversation (lines 1953-1977)
function _persistMessageToConversation(role, content, kind, convId) {  # C4: extend signature with optional sessionId, terminal
  if (typeof FSBSidepanelMessageLog === 'undefined') return;
  if (!convId || typeof convId !== 'string') return;
  if (typeof content !== 'string' || content.length === 0) return;
  if (!_messageLogDebouncer) return;
  var resolvedRole = (role === 'user') ? 'user' : 'assistant';
  var resolvedKind = (typeof kind === 'string' && kind.length > 0) ? kind : 'text';
  var buffer = _messageLogPendingBuffer.get(convId);
  if (!buffer) { buffer = []; _messageLogPendingBuffer.set(convId, buffer); }
  buffer.push({ role: resolvedRole, content: content, timestamp: Date.now(), kind: resolvedKind });
  _messageLogDebouncer.schedule(convId, function () { return _flushMessageLog(convId); });
}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>C1: no-reopen gate in handleStartAutomation (sender already-in-sidepanel)</name>
  <files>extension/background.js</files>
  <action>
In `extension/background.js` `handleStartAutomation` (around L6493), wrap the existing `chrome.sidePanel.setOptions` + `chrome.sidePanel.open` block with a sender-URL gate.

Codex offered two options; per the task constraint we pick (a) (skip entirely when sender is the sidepanel itself), NOT (b) (move after sendResponse). Option (b) introduces a race where if open() resolves before the receiver processes sendResponse, the document still rekeys.

Implementation:
1. Compute `var _senderIsSidepanel = sender && typeof sender.url === 'string' && sender.url.endsWith('ui/sidepanel.html');` near the top of handleStartAutomation (BEFORE the existing setOptions/open block).
2. Change the existing `if (targetTabId && typeof chrome.sidePanel !== 'undefined')` block to ALSO require `!_senderIsSidepanel`. The existing try/catch + best-effort failure handling stays identical.
3. Add an inline comment block explaining the rationale: "QT-wnz Codex-1 -- the sidepanel reopen rekeys the document, which loses the post-send callback that records currentSessionId in this tab's _tabRunningMap. When the start request originated from inside an already-open sidepanel context (sender.url ends in 'ui/sidepanel.html'), skip the reopen. sender.tab may be undefined for sidepanel senders; sender.url is the durable discriminator per Chrome MV3 docs."

Use `sender.url.endsWith('ui/sidepanel.html')` verbatim (both the gate-line literal AND the verify-line literal must match exactly).

DO NOT touch any other site in handleStartAutomation. DO NOT remove the existing setOptions/open block (keep it; just gate it).

Commit: `fix(wnz-1): C1 skip chrome.sidePanel.open when sender is already in sidepanel.html (no-reopen gate)`
  </action>
  <verify>
    <automated>node -e "var s=require('fs').readFileSync('extension/background.js','utf8');var i=s.indexOf('handleStartAutomation');if(i===-1)throw new Error('handleStartAutomation not found');var body=s.slice(i,i+4000);if(body.indexOf(\"sender.url.endsWith('ui/sidepanel.html')\")===-1)throw new Error('C1 gate missing: sender.url.endsWith(ui/sidepanel.html)');if(body.indexOf('chrome.sidePanel.setOptions')===-1)throw new Error('existing setOptions block was removed -- must be preserved (just gated)');if(body.indexOf('chrome.sidePanel.open')===-1)throw new Error('existing open call removed -- must be preserved');console.log('C1 OK');" && node --check extension/background.js && npm test</automated>
  </verify>
  <done>
- `sender.url.endsWith('ui/sidepanel.html')` literal appears inside handleStartAutomation body.
- The existing chrome.sidePanel.setOptions + chrome.sidePanel.open calls are still present (wrapped by gate; NOT deleted).
- node --check passes.
- npm test exits 0; existing sidepanel-background-tab-completion.test.js (32 PASS) still green; sidepanel-progress-tick-setter-routing.test.js still green.
- Commit message starts with `fix(wnz-1):`.
  </done>
</task>

<task type="auto">
  <name>C2: tab-scoped getStatus (sidepanel sends activeTabId; background filters by session.tabId)</name>
  <files>extension/background.js, extension/ui/sidepanel.js</files>
  <action>
Sub-task A -- background.js case 'getStatus' (around L5390):

Restructure the case body to filter activeSessions by tabId when `request.activeTabId` is provided. Wrap the case body in braces (the original lacks braces; adding them scopes the new `var` declarations without leaking via switch fall-through).

Replacement body:

```javascript
case 'getStatus': {
  // QT-wnz Codex-2 -- tab-scoped status lookup.
  // Pre-wnz: returned sessionIds[0] globally; a fresh sidepanel document
  // on Tab B would adopt sess_A if sess_A was activeSessions.keys()[0],
  // poisoning Tab B's currentSessionId. See CODEX-RESPONSE.md L10042.
  var _allSessionIds = Array.from(activeSessions.keys());
  var _scopedSessionIds = _allSessionIds;
  var _scopedFirst = null;
  if (typeof request.activeTabId === 'number') {
    _scopedSessionIds = _allSessionIds.filter(function (sid) {
      var s = activeSessions.get(sid);
      return s && s.tabId === request.activeTabId;
    });
    _scopedFirst = _scopedSessionIds.length > 0 ? activeSessions.get(_scopedSessionIds[0]) : null;
  } else {
    // Backward-compat: legacy callers (popup.js, dashboard.js) may omit activeTabId.
    // Preserve global sessionIds[0] behavior + warn so we can find them.
    console.warn('[FSB] getStatus called without activeTabId -- legacy global-scope fallback. See .planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/');
    _scopedFirst = _allSessionIds.length > 0 ? activeSessions.get(_allSessionIds[0]) : null;
  }
  sendResponse({
    status: 'ready',
    activeSessions: _scopedSessionIds.length,
    sessionIds: _scopedSessionIds,
    currentSessionId: _scopedSessionIds[0] || null,
    currentTask: _scopedFirst?.task || null,
    currentStartTime: _scopedFirst?.startTime || null,
    currentIterationCount: _scopedFirst?.iterationCount || 0,
    currentMaxIterations: _scopedFirst?.maxIterations || 100,
    currentActionCount: _scopedFirst?.actionHistory?.length || 0
  });
  break;
}
```

Sub-task B -- sidepanel.js boot getStatus (around L1052):

Modify the boot call. Only the message-object literal changes; the callback body stays identical:

```javascript
// QT-wnz Codex-2 -- send activeTabId so background returns only sessions
// owned by THIS tab. Pre-wnz the call omitted activeTabId and background
// returned sessionIds[0] globally, which is wrong when another tab has
// an older active session.
chrome.runtime.sendMessage({ action: 'getStatus', activeTabId: _activeTabIdSnapshot }, (response) => {
  if (chrome.runtime.lastError) {
    console.log('Background script not ready yet');
    return;
  }
  if (response && response.activeSessions > 0) {
    setRunningState(_activeTabIdSnapshot, response.currentSessionId || null);
    if (!currentSessionId && response.currentSessionId) {
      currentSessionId = response.currentSessionId;
      console.log('FSB: Recovered sessionId from background:', currentSessionId);
    }
  }
});
```

DO NOT touch other call sites of action: 'getStatus' (popup.js, options.js, dashboard.js are intentionally left on legacy global behavior + warn).

Commit: `fix(wnz-2): C2 tab-scoped getStatus -- sidepanel sends activeTabId, background filters by session.tabId`
  </action>
  <verify>
    <automated>node -e "var fs=require('fs');var bg=fs.readFileSync('extension/background.js','utf8');var i=bg.indexOf(\"case 'getStatus'\");if(i===-1)throw new Error('getStatus case not found');var body=bg.slice(i,i+2500);if(body.indexOf('request.activeTabId')===-1)throw new Error('C2 background-side: request.activeTabId missing in getStatus body');if(body.indexOf('.tabId === request.activeTabId')===-1)throw new Error('C2 background-side: session.tabId comparison missing');if(body.indexOf('legacy global-scope fallback')===-1)throw new Error('C2 background-side: legacy warn missing');var sp=fs.readFileSync('extension/ui/sidepanel.js','utf8');if(sp.indexOf(\"action: 'getStatus', activeTabId\")===-1)throw new Error('C2 sidepanel-side: getStatus call missing activeTabId payload');console.log('C2 OK');" && node --check extension/background.js && node --check extension/ui/sidepanel.js && npm test</automated>
  </verify>
  <done>
- background.js `case 'getStatus'` body references `request.activeTabId` and filters by `.tabId === request.activeTabId`.
- background.js getStatus has legacy fallback console.warn containing 'legacy global-scope fallback'.
- sidepanel.js boot getStatus call payload has `activeTabId: _activeTabIdSnapshot`.
- Both files node --check clean.
- npm test exits 0; sidepanel-background-tab-completion.test.js still 32 PASS.
- Commit message starts with `fix(wnz-2):`.
  </done>
</task>

<task type="auto">
  <name>C3: background-side durable terminal persist BEFORE broadcast (fsbPersistTerminalMessageToConversation helper)</name>
  <files>extension/background.js, extension/ai/agent-loop.js</files>
  <action>
Step 1 -- add the helper in background.js (immediately AFTER the `fsbBroadcastAutomationLifecycle` function definition around L2131, BEFORE the `globalThis.fsbBroadcastAutomationLifecycle = fsbBroadcastAutomationLifecycle;` export block):

```javascript
/**
 * QT-wnz Codex-3 -- background-side authoritative terminal persist.
 *
 * Writes an assistant terminal message into chrome.storage.local key
 * 'fsbConversationMessages' (the same envelope sidepanel reads via
 * FSBSidepanelMessageLog) so the durable record exists BEFORE the
 * broadcast goes out. Sidepanel's automationComplete handler still
 * persists as an idempotent backup (C4 adds dedupe to make this safe).
 *
 * Idempotency: scans the per-conv log for any existing message with
 * sessionId === sessionId AND terminal === true. If found, no-op.
 *
 * Best-effort: chrome.storage failures swallowed silently. The broadcast
 * still goes out via the caller (finalizeSession -> notifySidepanel).
 *
 * @param {string} convId
 * @param {string} sessionId
 * @param {string} content
 * @returns {Promise<void>}
 */
async function fsbPersistTerminalMessageToConversation(convId, sessionId, content) {
  if (typeof convId !== 'string' || convId.length === 0) return;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return;
  if (typeof content !== 'string' || content.length === 0) return;
  try {
    var STORAGE_KEY = 'fsbConversationMessages';
    var bag = await chrome.storage.local.get(STORAGE_KEY);
    var envelope = bag[STORAGE_KEY];
    if (!envelope || envelope.v !== 1 || !envelope.byConv || !Array.isArray(envelope.lru)) {
      envelope = { v: 1, byConv: {}, lru: [] };
    }
    var log = envelope.byConv[convId];
    var now = Date.now();
    if (!log || !Array.isArray(log.messages)) {
      log = { v: 1, messages: [], lastWriteAt: now, createdAt: now };
      envelope.byConv[convId] = log;
    }
    // Idempotency: skip if terminal for this sessionId already present.
    for (var i = 0; i < log.messages.length; i++) {
      var m = log.messages[i];
      if (m && m.sessionId === sessionId && m.terminal === true) {
        return;
      }
    }
    log.messages.push({
      role: 'assistant',
      content: content,
      timestamp: now,
      kind: 'text',
      sessionId: sessionId,
      terminal: true
    });
    log.lastWriteAt = now;
    // LRU touch (head).
    var idx = envelope.lru.indexOf(convId);
    if (idx !== -1) envelope.lru.splice(idx, 1);
    envelope.lru.unshift(convId);
    // Cap = 50 (matches sidepanel-message-log.js DEFAULT_CAP).
    while (envelope.lru.length > 50) {
      var tailKey = envelope.lru.pop();
      if (tailKey) delete envelope.byConv[tailKey];
    }
    var payload = {};
    payload[STORAGE_KEY] = envelope;
    await chrome.storage.local.set(payload);
  } catch (_e) {
    // Best-effort: do not block broadcast on storage failure.
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.fsbPersistTerminalMessageToConversation = fsbPersistTerminalMessageToConversation;
}
```

This mirrors the existing `globalThis.fsbBroadcastAutomationLifecycle` export pattern so agent-loop.js (importScripts'd into the SW global) can call it.

Step 2 -- modify finalizeSession in agent-loop.js (around L1513):

Replace the body of `async function finalizeSession(sid, sess, terminal) { ... }` with:

```javascript
async function finalizeSession(sid, sess, terminal) {
  saveToLogger(sid, sess, sess.status);
  // QT-wnz Codex-3 -- background-side authoritative terminal persist
  // BEFORE broadcast. Defends against sidepanel context fanout +
  // ephemeral doc lifetime; the durable write must not depend on which
  // sidepanel happens to be alive when the broadcast fires.
  try {
    var helperHost = (typeof globalThis !== 'undefined') ? globalThis : null;
    if (helperHost && typeof helperHost.fsbPersistTerminalMessageToConversation === 'function') {
      var _convId = sess && sess.conversationId;
      var _content = (terminal && (terminal.resultText || terminal.summary))
        || (sess && (sess.completionMessage || sess.result))
        || 'Task completed.';
      if (typeof _convId === 'string' && _convId.length > 0) {
        await helperHost.fsbPersistTerminalMessageToConversation(_convId, sid, _content);
      }
    }
  } catch (_e) { /* non-fatal */ }
  notifySidepanel(sid, sess, terminal);
  await sleep(900);
  if (typeof cleanupSession === 'function') {
    try { await cleanupSession(sid); } catch (_e) { /* non-fatal */ }
  }
}
```

DO NOT touch notifySidepanel internals. DO NOT touch the 13 OTHER finalizeSession CALL sites (just modify the function body once).

Note: `terminal.resultText` is the canonical content field per notifySidepanel L1441 (`result: terminal.resultText || 'Task completed.'`). We use the SAME chain so what gets persisted MATCHES what notifySidepanel broadcasts as `request.result`. C4's dedupe correctly recognizes it as "the same message."

Commit: `feat(wnz-3): C3 background-side durable terminal persist in fsbPersistTerminalMessageToConversation, called from finalizeSession BEFORE notifySidepanel`
  </action>
  <verify>
    <automated>node -e "var fs=require('fs');var bg=fs.readFileSync('extension/background.js','utf8');if(bg.indexOf('function fsbPersistTerminalMessageToConversation')===-1)throw new Error('C3 helper function definition missing');if(bg.indexOf('globalThis.fsbPersistTerminalMessageToConversation = fsbPersistTerminalMessageToConversation')===-1)throw new Error('C3 globalThis export missing');if(bg.indexOf('terminal: true')===-1)throw new Error('C3 helper does not write terminal:true marker');if(bg.indexOf('m.sessionId === sessionId && m.terminal === true')===-1)throw new Error('C3 idempotency guard missing');var al=fs.readFileSync('extension/ai/agent-loop.js','utf8');var f=al.indexOf('async function finalizeSession');if(f===-1)throw new Error('finalizeSession not found');var body=al.slice(f,f+2500);if(body.indexOf('fsbPersistTerminalMessageToConversation')===-1)throw new Error('C3 finalizeSession does not call helper');var persistIdx=body.indexOf('fsbPersistTerminalMessageToConversation');var notifyIdx=body.indexOf('notifySidepanel(sid');if(notifyIdx===-1||persistIdx===-1||persistIdx>notifyIdx)throw new Error('C3 ordering violated: persist must be BEFORE notifySidepanel');console.log('C3 OK');" && node --check extension/background.js && node --check extension/ai/agent-loop.js && npm test</automated>
  </verify>
  <done>
- `function fsbPersistTerminalMessageToConversation` defined in background.js.
- Exported via `globalThis.fsbPersistTerminalMessageToConversation = fsbPersistTerminalMessageToConversation;`.
- Helper writes `terminal: true` + `sessionId` fields into message.
- Helper has idempotency guard (`m.sessionId === sessionId && m.terminal === true` early-return).
- `finalizeSession` in agent-loop.js calls the helper BEFORE `notifySidepanel`.
- Both files node --check clean.
- npm test exits 0; all sidepanel smokes still green.
- Commit message starts with `feat(wnz-3):`.
  </done>
</task>

<task type="auto">
  <name>C4: sessionId+terminal dedupe in message log schema + sidepanel handler</name>
  <files>extension/ui/sidepanel-message-log.js, extension/ui/sidepanel.js</files>
  <action>
Step 1 -- extend message log schema in extension/ui/sidepanel-message-log.js:

A. Extend `_isValidMessage` (around L106-113) to accept the optional fields. Add these two checks immediately BEFORE the final `return true;`:

```javascript
// QT-wnz Codex-4 -- OPTIONAL sessionId + terminal fields. Validate ONLY
// when defined (preserves backward-compat: existing rows without these
// fields keep validating).
if (msg.sessionId !== undefined && typeof msg.sessionId !== 'string') return false;
if (msg.terminal !== undefined && typeof msg.terminal !== 'boolean') return false;
```

B. Modify `appendMessage` (around L124-150). Replace the `log.messages.push({ ... })` block with a conditional row builder:

```javascript
// QT-wnz Codex-4 -- conditionally include sessionId + terminal so rows
// without these fields look identical to pre-wnz rows (backward-compat
// for getMessages consumers + on-disk envelope shape).
var row = {
  role: msg.role,
  content: msg.content,
  timestamp: msg.timestamp,
  kind: msg.kind
};
if (typeof msg.sessionId === 'string') row.sessionId = msg.sessionId;
if (msg.terminal === true) row.terminal = true;
log.messages.push(row);
```

C. Modify `getMessages` (around L158-175). Replace the per-message push block with the same conditional row builder:

```javascript
var m = log.messages[i];
var row = { role: m.role, content: m.content, timestamp: m.timestamp, kind: m.kind };
if (typeof m.sessionId === 'string') row.sessionId = m.sessionId;
if (m.terminal === true) row.terminal = true;
out.push(row);
```

D. Add new helper `hasTerminalForSession` immediately AFTER `getMessages` (before `dropConversationMessages`):

```javascript
/**
 * QT-wnz Codex-4 -- idempotency check for terminal completion messages.
 * Returns true if any message in convId's log has sessionId === sessionId
 * AND terminal === true. Used by sidepanel automationComplete handler to
 * skip duplicate persist+render when background or another sidepanel
 * context has already written the terminal.
 *
 * @param {object} envelope
 * @param {string} convId
 * @param {string} sessionId
 * @returns {boolean}
 */
function hasTerminalForSession(envelope, convId, sessionId) {
  if (!isValidEnvelope(envelope)) return false;
  var key = _normalizeConvId(convId);
  if (key === null) return false;
  if (typeof sessionId !== 'string' || sessionId.length === 0) return false;
  var log = envelope.byConv[key];
  if (!log || !Array.isArray(log.messages)) return false;
  for (var i = 0; i < log.messages.length; i++) {
    var m = log.messages[i];
    if (m && m.sessionId === sessionId && m.terminal === true) return true;
  }
  return false;
}
```

E. Export `hasTerminalForSession` -- add `hasTerminalForSession: hasTerminalForSession,` to the `exportsObj` literal (around L279-292) immediately after `dropConversationMessages: dropConversationMessages,`.

Step 2 -- extend _persistMessageToConversation signature in extension/ui/sidepanel.js (around L1953):

Add two trailing parameters and forward them into the buffered row when present:

```javascript
function _persistMessageToConversation(role, content, kind, convId, sessionId, terminal) {
  if (typeof FSBSidepanelMessageLog === 'undefined') return;
  if (!convId || typeof convId !== 'string') return;
  if (typeof content !== 'string' || content.length === 0) return;
  if (!_messageLogDebouncer) return;

  var resolvedRole = (role === 'user') ? 'user' : 'assistant';
  var resolvedKind = (typeof kind === 'string' && kind.length > 0) ? kind : 'text';

  var buffer = _messageLogPendingBuffer.get(convId);
  if (!buffer) {
    buffer = [];
    _messageLogPendingBuffer.set(convId, buffer);
  }
  var row = {
    role: resolvedRole,
    content: content,
    timestamp: Date.now(),
    kind: resolvedKind
  };
  // QT-wnz Codex-4 -- carry sessionId + terminal through to envelope so
  // hasTerminalForSession can dedupe redundant terminal writes (post-C3
  // the background already persisted; sidepanel is now idempotent backup).
  if (typeof sessionId === 'string' && sessionId.length > 0) row.sessionId = sessionId;
  if (terminal === true) row.terminal = true;
  buffer.push(row);

  _messageLogDebouncer.schedule(convId, function () {
    return _flushMessageLog(convId);
  });
}
```

Other call sites of `_persistMessageToConversation` (e.g. sidepanel.js L2661 progress-tick path) continue to use the 4-arg form -- their omitted sessionId/terminal stay absent, which is the backward-compat path.

Step 3 -- dedupe guard in sidepanel.js case 'automationComplete' (around L2466):

Insert the dedupe guard BEFORE the existing `_persistMessageToConversation(...)` call (the one that writes the terminal). The switch handler is synchronous, so we use a synchronous best-effort buffer-peek for the primary guard, plus a fire-and-forget async storage-peek that cancels a pending buffered terminal if the storage check confirms a prior write.

Replace the block starting at the existing `_persistMessageToConversation('assistant', completionMessage, 'text', originatingConvId);` call (around L2466) and ending at the close of the `if (isOriginatingActive) { ... }` block (around L2495) with:

```javascript
// QT-wnz Codex-4 -- dedupe guard. Background C3 already persisted the
// terminal entry BEFORE this broadcast fired. Check fsbConversationMessages
// for an existing terminal entry for this sessionId on this convId; if
// present, skip BOTH the redundant persist AND the redundant DOM render
// (the user already saw it, or will see it via hydrate-on-swap from the
// authoritative background write).
var _wnzTerminalDedupe = false;
try {
  var _pendingBuf = (typeof _messageLogPendingBuffer !== 'undefined' && _messageLogPendingBuffer)
    ? _messageLogPendingBuffer.get(originatingConvId)
    : null;
  if (Array.isArray(_pendingBuf)) {
    for (var _bi = 0; _bi < _pendingBuf.length; _bi++) {
      var _bm = _pendingBuf[_bi];
      if (_bm && _bm.sessionId === request.sessionId && _bm.terminal === true) {
        _wnzTerminalDedupe = true;
        break;
      }
    }
  }
} catch (_e) { /* swallow -- best-effort */ }

if (!_wnzTerminalDedupe && typeof FSBSidepanelMessageLog !== 'undefined' &&
    typeof FSBSidepanelMessageLog.hasTerminalForSession === 'function' &&
    typeof FSBSidepanelMessageLog.STORAGE_KEY === 'string') {
  // Fire-and-forget async storage peek. If storage confirms a prior
  // terminal write (background C3 path or another sidepanel context),
  // remove any same-sessionId+terminal entry we just buffered so the
  // debounced flush does not produce a duplicate. Cannot await here
  // (handler is sync) -- the buffer-peek above is the primary guard.
  (async function () {
    try {
      var bag = await chrome.storage.local.get(FSBSidepanelMessageLog.STORAGE_KEY);
      if (FSBSidepanelMessageLog.hasTerminalForSession(bag[FSBSidepanelMessageLog.STORAGE_KEY], originatingConvId, request.sessionId)) {
        if (typeof _messageLogPendingBuffer !== 'undefined' && _messageLogPendingBuffer) {
          var _b = _messageLogPendingBuffer.get(originatingConvId);
          if (Array.isArray(_b)) {
            for (var _i = _b.length - 1; _i >= 0; _i--) {
              if (_b[_i] && _b[_i].sessionId === request.sessionId && _b[_i].terminal === true) {
                _b.splice(_i, 1);
              }
            }
          }
        }
      }
    } catch (_storageErr) { /* swallow */ }
  })();
}

if (!_wnzTerminalDedupe) {
  _persistMessageToConversation('assistant', completionMessage, 'text', originatingConvId, request.sessionId, true);
}

// (existing) Resolve originating tabId, isOriginatingActive, render gate.
var originatingTabId = (typeof request.tabId === 'number')
  ? request.tabId
  : _resolveTabIdForSession(request.sessionId);
var isOriginatingActive = (originatingConvId === conversationId);
if (!_wnzTerminalDedupe && isOriginatingActive) {
  if (currentStatusMessage) {
    try { currentStatusMessage.remove(); } catch (_e) {}
    currentStatusMessage = null;
    currentActionGroup = null;
    _clearTabStatusIntent(_activeTabIdSnapshot);
  }
  _renderCompletionDomOnly(completionMessage, isPartial ? 'partial' : 'ai', isPartial);
}
```

The remainder of the case body (per-tab state update via setIdleState + recon-suggestion IIFE + intent-clear) stays IDENTICAL to the post-260608-uof shape.

Test sandbox impact: `tests/sidepanel-background-tab-completion.test.js` extracts the case body via brace-walk and runs structural assertions. The new body references `_messageLogPendingBuffer` and `FSBSidepanelMessageLog.hasTerminalForSession`. The sandbox in that test file already injects `_clearTabStatusIntent` / `_persistTabStatusIntent` / `_restoreTabStatusIntent` as no-ops (per T5 of 260608-uof). Apply the SAME pattern:
- Inject `_messageLogPendingBuffer: new Map()` in the sandbox context.
- Inject `FSBSidepanelMessageLog: { STORAGE_KEY: 'fsbConversationMessages', hasTerminalForSession: function () { return false; } }` in the sandbox context.

DO NOT change ANY existing test assertion text. Only inject the new identifiers the post-C4 handler body references. Existing 32 PASS must stay 32 PASS.

Sibling test impact: `tests/sidepanel-message-log-smoke.test.js` REQUIREs the message-log sidecar and exercises appendMessage / getMessages. Since the new fields are OPTIONAL and existing rows pass through unchanged, the existing parts should stay green. If a part fails because the test asserts `Object.keys(row).length === 4`, update that assertion to accept the optional fields (NOT a behavior change; the smoke test was tracking shape).

Commit: `feat(wnz-4): C4 sessionId+terminal dedupe in message-log schema + automationComplete handler guard`
  </action>
  <verify>
    <automated>node -e "var fs=require('fs');var ml=fs.readFileSync('extension/ui/sidepanel-message-log.js','utf8');if(ml.indexOf('function hasTerminalForSession')===-1)throw new Error('C4 message-log: hasTerminalForSession not defined');if(ml.indexOf('hasTerminalForSession: hasTerminalForSession')===-1)throw new Error('C4 message-log: hasTerminalForSession not exported');if(ml.indexOf('msg.sessionId !== undefined')===-1)throw new Error('C4 message-log: _isValidMessage missing sessionId check');if(ml.indexOf('msg.terminal !== undefined')===-1)throw new Error('C4 message-log: _isValidMessage missing terminal check');if(ml.indexOf('row.sessionId = msg.sessionId')===-1)throw new Error('C4 message-log: appendMessage does not store sessionId');if(ml.indexOf('row.terminal = true')===-1)throw new Error('C4 message-log: appendMessage does not store terminal');var sp=fs.readFileSync('extension/ui/sidepanel.js','utf8');var pmcIdx=sp.indexOf('function _persistMessageToConversation');if(pmcIdx===-1)throw new Error('_persistMessageToConversation not found');var pmcBody=sp.slice(pmcIdx,pmcIdx+1500);if(pmcBody.indexOf('sessionId, terminal')===-1)throw new Error('C4 sidepanel: _persistMessageToConversation signature missing sessionId,terminal params');if(pmcBody.indexOf('row.sessionId = sessionId')===-1)throw new Error('C4 sidepanel: _persistMessageToConversation does not forward sessionId to row');var acIdx=sp.indexOf(\"case 'automationComplete'\");var acBody=sp.slice(acIdx,acIdx+8000);if(acBody.indexOf('_wnzTerminalDedupe')===-1)throw new Error('C4 sidepanel: automationComplete handler missing dedupe variable');if(acBody.indexOf('hasTerminalForSession')===-1)throw new Error('C4 sidepanel: handler does not call hasTerminalForSession');if(acBody.indexOf('request.sessionId, true')===-1)throw new Error('C4 sidepanel: _persistMessageToConversation call missing new sessionId+terminal args');console.log('C4 OK');" && node --check extension/ui/sidepanel-message-log.js && node --check extension/ui/sidepanel.js && npm test</automated>
  </verify>
  <done>
- sidepanel-message-log.js: `function hasTerminalForSession` defined and exported.
- sidepanel-message-log.js: `_isValidMessage` accepts optional sessionId + terminal fields (validates type only when defined).
- sidepanel-message-log.js: `appendMessage` and `getMessages` use conditional row builder (only set sessionId / terminal when present).
- sidepanel.js: `_persistMessageToConversation` accepts optional 5th (sessionId) + 6th (terminal) params and forwards into buffered row.
- sidepanel.js: case 'automationComplete' has `_wnzTerminalDedupe` variable + sync buffer-peek + async storage-peek + dedupe-gated persist and render.
- The new persist call passes `request.sessionId, true` as the trailing args.
- Existing sidepanel-background-tab-completion.test.js (32 PASS) still passes after sandbox identifier injection.
- sidepanel-message-log-smoke.test.js still passes (optional-field backward-compat preserved).
- All sibling sidepanel smokes still pass.
- node --check passes for both modified files.
- npm test exits 0.
- Commit message starts with `feat(wnz-4):`.
  </done>
</task>

<task type="auto">
  <name>C5: multi-document fanout regression test (real-runtime, two sidepanel docs + shared storage)</name>
  <files>tests/sidepanel-multi-document-fanout.test.js, package.json</files>
  <action>
Create `tests/sidepanel-multi-document-fanout.test.js` -- the regression test that locks the entire D-PERSIST + E-PERSIST class.

Strategy (per Codex's recommendation): two sandboxed sidepanel handler bodies side-by-side in the SAME Node process with SEPARATE state Maps (Doc1 + Doc2 represent two sidepanel documents -- e.g. Tab A's panel doc + Tab B's panel doc -- which is the real runtime model in MV3 when sidepanel-per-tab is in use). Mock `chrome.runtime.onMessage` so a single broadcast dispatches to BOTH listeners. Mock `chrome.storage.local` with a SHARED backing Map (production model: both contexts share local storage).

Template: copy structural patterns from `tests/sidepanel-progress-tick-setter-routing.test.js` (brace-walk + sandbox eval) and `tests/sidepanel-background-tab-completion.test.js` (the existing 32-PASS handler test). Mirror their ok() helper / extractAfterAnchor / sandbox build pattern verbatim.

File outline (executor: implement to spec):

```javascript
'use strict';

/**
 * QT-wnz Codex-5 -- multi-document fanout regression test.
 *
 * Locks the cluster1 persistence regression class (D-PERSIST + E-PERSIST)
 * by simulating TWO sidepanel documents alive concurrently, sharing
 * chrome.storage.local but with separate per-document module state
 * (_tabRunningMap, _activeTabIdSnapshot, currentSessionId, etc.).
 *
 * Without the C1..C4 architectural fix, this test reproduces:
 *  - D-PERSIST: Doc2 boot getStatus adopts sess_A (the global sessionIds[0])
 *    instead of its tab-scoped sess_B.
 *  - E-PERSIST: both docs append sess_A's terminal to conv_A on broadcast,
 *    producing TWO terminal entries in fsbConversationMessages.byConv.conv_A.
 *
 * With the C1..C4 fix:
 *  - boot getStatus payload carries activeTabId; background filters by
 *    session.tabId; Doc2 receives ONLY sess_B (or [] if no sess on Tab B).
 *  - dedupe gate in automationComplete handler reads
 *    FSBSidepanelMessageLog.hasTerminalForSession + the in-buffer peek and
 *    skips the second persist/render.
 *
 * Run: node tests/sidepanel-multi-document-fanout.test.js
 *
 * ASCII only. No emojis.
 */

const path = require('path');
const fs = require('fs');
const FSBSidepanelMessageLog = require('../extension/ui/sidepanel-message-log.js');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const spSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');

console.log('\n--- QT-wnz Codex-5 multi-document fanout regression ---');

// Brace-walk extractor (copied from sibling test).
function extractAfterAnchor(src, anchor, startFrom) {
  var from = (typeof startFrom === 'number' && startFrom >= 0) ? startFrom : 0;
  var startIdx = src.indexOf(anchor, from);
  if (startIdx === -1) return null;
  var braceIdx = src.indexOf('{', startIdx);
  if (braceIdx === -1) return null;
  var depth = 1;
  var i = braceIdx + 1;
  while (i < src.length && depth > 0) {
    var c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  return src.slice(braceIdx + 1, i);
}

// Extract case 'automationComplete' body.
var acIdx = spSrc.indexOf("case 'automationComplete'");
var acBody = extractAfterAnchor(spSrc, "case 'automationComplete'", acIdx);
ok(acBody !== null, 'extractable case automationComplete body');

// Shared storage simulating chrome.storage.local (both docs share the envelope).
var sharedStorage = {};

function makeChromeMock() {
  return {
    runtime: { lastError: null },
    storage: {
      local: {
        get: function (key) {
          var bag = {};
          if (typeof key === 'string') {
            if (sharedStorage[key] !== undefined) bag[key] = sharedStorage[key];
          } else if (Array.isArray(key)) {
            for (var k of key) if (sharedStorage[k] !== undefined) bag[k] = sharedStorage[k];
          }
          return Promise.resolve(bag);
        },
        set: function (payload) {
          Object.assign(sharedStorage, payload);
          return Promise.resolve();
        }
      }
    }
  };
}

// Factory: build one sandboxed "document context" with its own module state.
// Returns the dispatch function (call dispatch(request) to fire the
// automationComplete handler body in this doc's context).
function createDocContext(label, opts) {
  opts = opts || {};
  var ctx = {
    label: label,
    chrome: makeChromeMock(),
    _tabRunningMap: new Map(opts.tabRunningMap || []),
    _activeTabIdSnapshot: opts.activeTabId || null,
    currentSessionId: opts.currentSessionId || null,
    conversationId: opts.conversationId || null,
    currentStatusMessage: null,
    currentActionGroup: null,
    _messageLogPendingBuffer: new Map(),
    _messageLogDebouncer: {
      schedule: function (convId, cb) {
        // Synchronous flush (advance time-zero) so the test sees the persist
        // land immediately in sharedStorage.
        try { Promise.resolve(cb()).catch(function () {}); } catch (_e) {}
      }
    },
    FSBSidepanelMessageLog: FSBSidepanelMessageLog,
    persistCalls: 0,
    renderCalls: 0
  };

  ctx._persistMessageToConversation = function (role, content, kind, convId, sessionId, terminal) {
    if (!convId) return;
    ctx.persistCalls++;
    // Real flush path: append directly to sharedStorage envelope so the
    // second document's sync peek can see it (mirrors production where
    // chrome.storage.local writes propagate across contexts).
    var envelope = sharedStorage['fsbConversationMessages'];
    if (!FSBSidepanelMessageLog.isValidEnvelope(envelope)) {
      envelope = FSBSidepanelMessageLog.emptyEnvelope();
    }
    var msg = {
      role: (role === 'user') ? 'user' : 'assistant',
      content: content,
      timestamp: Date.now(),
      kind: kind || 'text'
    };
    if (typeof sessionId === 'string') msg.sessionId = sessionId;
    if (terminal === true) msg.terminal = true;
    FSBSidepanelMessageLog.appendMessage(envelope, convId, msg);
    sharedStorage['fsbConversationMessages'] = envelope;
  };

  ctx._renderCompletionDomOnly = function () { ctx.renderCalls++; };
  ctx._clearTabStatusIntent = function () {};
  ctx._resolveTabIdForSession = function (sid) {
    var iter = ctx._tabRunningMap.entries();
    var n = iter.next();
    while (!n.done) {
      if (n.value[1] && n.value[1].sessionId === sid) return n.value[0];
      n = iter.next();
    }
    return null;
  };
  ctx.setIdleState = function () {};

  // Build the handler dispatcher: takes a request, sets local switch vars,
  // executes the extracted case body in ctx's scope via new Function.
  // The body uses `request`, `currentSessionId`, `_tabRunningMap`, etc. as
  // free identifiers; we pass them as arguments.
  var fnBody = '\n      var isRunning = ctx._tabRunningMap.size > 0;\n      ' + acBody + '\n    ';
  // Note: the extracted body references `conversationId` (module-scope mirror),
  // `currentSessionId`, `currentStatusMessage`, etc. Provide them via `with` or
  // explicit assigns from ctx. We use explicit variable shadowing in the
  // wrapper rather than `with` (strict-mode compatible).
  var wrapper = new Function('ctx', 'request', '_messageLogPendingBuffer', 'FSBSidepanelMessageLog', 'chrome',
    '  var _tabRunningMap = ctx._tabRunningMap;\n' +
    '  var _activeTabIdSnapshot = ctx._activeTabIdSnapshot;\n' +
    '  var currentSessionId = ctx.currentSessionId;\n' +
    '  var conversationId = ctx.conversationId;\n' +
    '  var currentStatusMessage = ctx.currentStatusMessage;\n' +
    '  var currentActionGroup = ctx.currentActionGroup;\n' +
    '  var _persistMessageToConversation = ctx._persistMessageToConversation;\n' +
    '  var _renderCompletionDomOnly = ctx._renderCompletionDomOnly;\n' +
    '  var _clearTabStatusIntent = ctx._clearTabStatusIntent;\n' +
    '  var _resolveTabIdForSession = ctx._resolveTabIdForSession;\n' +
    '  var setIdleState = ctx.setIdleState;\n' +
    '  var isRunning = ctx._tabRunningMap.size > 0;\n' +
    fnBody);

  ctx.dispatch = function (request) {
    try {
      wrapper(ctx, request, ctx._messageLogPendingBuffer, ctx.FSBSidepanelMessageLog, ctx.chrome);
    } catch (e) {
      console.error('[' + label + '] dispatch error:', e.message);
    }
  };

  return ctx;
}

// =====================================================================
// Scenario (a) -- sess_A completion fanned to both docs.
// Pre-fix expectation: persist runs in BOTH docs => 2 terminal entries in conv_A.
// Post-fix expectation: dedupe gate => exactly ONE terminal entry in conv_A.
// =====================================================================

console.log('\nScenario A -- sess_A completion fanned to both docs (E-PERSIST regression):');

sharedStorage = {};  // reset

var docA1 = createDocContext('Doc1-tabA', {
  activeTabId: 100,
  currentSessionId: 'sess_A',
  conversationId: 'conv_A',
  tabRunningMap: [[100, { isRunning: true, sessionId: 'sess_A' }]]
});
var docA2 = createDocContext('Doc2-tabA-mirror', {
  // Pre-fix bug: a SECOND sidepanel doc (e.g. opened on the same tab via
  // a window reload) believes sess_A is "known" via _tabRunningMap.
  activeTabId: 100,
  currentSessionId: 'sess_A',
  conversationId: 'conv_A',
  tabRunningMap: [[100, { isRunning: true, sessionId: 'sess_A' }]]
});

var completionA = {
  action: 'automationComplete',
  sessionId: 'sess_A',
  tabId: 100,
  conversationId: 'conv_A',
  result: 'Tab A done.',
  partial: false
};

docA1.dispatch(completionA);
docA2.dispatch(completionA);

var envA = sharedStorage['fsbConversationMessages'];
var msgsA = (envA && envA.byConv && envA.byConv['conv_A'] && envA.byConv['conv_A'].messages) || [];
var terminalsA = msgsA.filter(function (m) { return m.sessionId === 'sess_A' && m.terminal === true; });

ok(terminalsA.length === 1,
   'A.1 -- exactly ONE terminal entry in conv_A after fanout (got ' + terminalsA.length + ')');
ok(docA1.persistCalls + docA2.persistCalls >= 1,
   'A.2 -- at least one persist call fired across the two docs');
ok(docA1.renderCalls + docA2.renderCalls <= 1,
   'A.3 -- AT MOST ONE render call across two docs (got ' + (docA1.renderCalls + docA2.renderCalls) + ')');

// =====================================================================
// Scenario (b) -- sess_B completion fanned to both docs.
// Pre-fix expectation: sess_B's message lands in conv_A (Doc1 binds sessionIds[0] to tab A,
// then writes to its module-scope conversationId which is conv_A). conv_B stays empty.
// Post-fix expectation: sess_B's message lands in conv_B (its OWN convId per
// request.conversationId thread) AND only once.
// =====================================================================

console.log('\nScenario B -- sess_B completion fanned to both docs (D-PERSIST regression):');

sharedStorage = {};  // reset

var docB1 = createDocContext('Doc1-tabA-bg', {
  // Doc1 is the active tab (Tab A) doc; sess_B is a background-tab session
  // (Tab B). _tabRunningMap entry for tab B exists because boot getStatus
  // (now tab-scoped post-C2) would NOT include sess_B in this doc -- but
  // for the dispatch path the sessionKnown scan needs sess_B somewhere to
  // not bail. We seed it as a Tab B entry to mirror the case where
  // setRunningState was called from a different path.
  activeTabId: 100,
  currentSessionId: 'sess_A',
  conversationId: 'conv_A',
  tabRunningMap: [
    [100, { isRunning: true, sessionId: 'sess_A' }],
    [200, { isRunning: true, sessionId: 'sess_B' }]
  ]
});
var docB2 = createDocContext('Doc2-tabB', {
  activeTabId: 200,
  currentSessionId: 'sess_B',
  conversationId: 'conv_B',
  tabRunningMap: [
    [200, { isRunning: true, sessionId: 'sess_B' }]
  ]
});

var completionB = {
  action: 'automationComplete',
  sessionId: 'sess_B',
  tabId: 200,
  conversationId: 'conv_B',
  result: 'Tab B done.',
  partial: false
};

docB1.dispatch(completionB);
docB2.dispatch(completionB);

var envB = sharedStorage['fsbConversationMessages'];
var msgsB_inB = (envB && envB.byConv && envB.byConv['conv_B'] && envB.byConv['conv_B'].messages) || [];
var msgsB_inA = (envB && envB.byConv && envB.byConv['conv_A'] && envB.byConv['conv_A'].messages) || [];
var terminalsB_inB = msgsB_inB.filter(function (m) { return m.sessionId === 'sess_B' && m.terminal === true; });
var terminalsB_inA = msgsB_inA.filter(function (m) { return m.sessionId === 'sess_B' && m.terminal === true; });

ok(terminalsB_inB.length === 1,
   'B.1 -- exactly ONE terminal in conv_B for sess_B (got ' + terminalsB_inB.length + ')');
ok(terminalsB_inA.length === 0,
   'B.2 -- ZERO sess_B terminals in conv_A (got ' + terminalsB_inA.length + ' -- regression if > 0)');

// =====================================================================
// Scenario (c) -- boot getStatus tab-scoping (C2 contract).
// Static text check that sidepanel boot sends activeTabId. The actual
// background filter is exercised via the C2 verify line.
// =====================================================================

console.log('\nScenario C -- boot getStatus carries activeTabId (C2 contract):');

ok(spSrc.indexOf("action: 'getStatus', activeTabId") !== -1,
   'C.1 -- boot getStatus call payload includes activeTabId');

console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
process.exit(failed === 0 ? 0 : 1);
```

Notes for the executor:
- The handler body is extracted at module-init via brace-walk. Mirror the pattern from `tests/sidepanel-background-tab-completion.test.js` exactly so future structural changes break BOTH tests consistently.
- The `_messageLogDebouncer.schedule` mock is synchronous so the persist landed in shared storage by the time the second doc's dispatch runs. This MATCHES the dedupe-correctness requirement: if production debounce is 200ms, the dedupe must still hold under the worst case where the second doc dispatches AFTER the first doc's debounce flushes. The sync mock represents that worst case.
- If the handler body referenced an identifier the wrapper does not provide, the executor MUST extend the wrapper's variable list -- DO NOT modify production sidepanel.js to "make it testable."
- Goal: scenarios (a) and (b) PASS post-C4; B.2 (zero sess_B in conv_A) FAILS pre-C4 (the bug). Scenario (c) is a static contract check that passes once C2 ships.

Step 2 -- register in package.json scripts.test chain:

Append ` && node tests/sidepanel-multi-document-fanout.test.js` to the END of the scripts.test value, immediately after `sidepanel-background-tab-completion.test.js`.

Commit: `test(wnz-5): C5 multi-document fanout regression test (locks D-PERSIST + E-PERSIST class)`
  </action>
  <verify>
    <automated>node tests/sidepanel-multi-document-fanout.test.js && node -e "var p=require('./package.json');if(p.scripts.test.indexOf('sidepanel-multi-document-fanout.test.js')===-1)throw new Error('test not registered in scripts.test chain');console.log('package.json registration OK');" && npm test</automated>
  </verify>
  <done>
- tests/sidepanel-multi-document-fanout.test.js exists.
- File is real-runtime (brace-walks the production sidepanel.js handler body, NOT static-text grep).
- Three scenarios: (a) E-PERSIST regression -- exactly ONE terminal in conv_A after fanout; (b) D-PERSIST regression -- ONE terminal in conv_B AND zero sess_B in conv_A; (c) C2 contract -- boot call includes activeTabId.
- All scenarios PASS post-C1..C4. Scenario B.2 would FAIL on pre-C4 code shape (proves the test exercises the bug; this property is a quality check on the test, not a runtime assertion).
- Registered in package.json scripts.test as the FINAL chained entry.
- node tests/sidepanel-multi-document-fanout.test.js exits 0.
- npm test exits 0 end-to-end (existing 4 sidepanel smokes + new C5 test all pass).
- Commit message starts with `test(wnz-5):`.
  </done>
</task>

<task type="auto">
  <name>T6 (audit-only, no commit): integration sanity verification</name>
  <files>(none -- audit-only)</files>
  <action>
This task does NOT commit. It is the verifier's primary signal that the 5-item architectural fix lands coherently.

Execute the following checks in sequence and report any failure:

1. Re-run `npm test`. Exit code 0 expected. Capture the new test count for sidepanel-multi-document-fanout.test.js (expected: at least 7 PASS / 0 FAIL).

2. Verify the C1..C4 artifacts via consolidated grep:

```
node -e "
var fs = require('fs');
var bg = fs.readFileSync('extension/background.js', 'utf8');
var sp = fs.readFileSync('extension/ui/sidepanel.js', 'utf8');
var ml = fs.readFileSync('extension/ui/sidepanel-message-log.js', 'utf8');
var al = fs.readFileSync('extension/ai/agent-loop.js', 'utf8');

var checks = [
  ['C1 background no-reopen gate', bg.indexOf(\"sender.url.endsWith('ui/sidepanel.html')\") !== -1],
  ['C2 background tab-scoped getStatus', bg.indexOf('request.activeTabId') !== -1 && bg.indexOf('.tabId === request.activeTabId') !== -1],
  ['C2 sidepanel boot sends activeTabId', sp.indexOf(\"action: 'getStatus', activeTabId\") !== -1],
  ['C3 helper defined', bg.indexOf('function fsbPersistTerminalMessageToConversation') !== -1],
  ['C3 helper exported on globalThis', bg.indexOf('globalThis.fsbPersistTerminalMessageToConversation') !== -1],
  ['C3 helper called in finalizeSession BEFORE notifySidepanel', (function () {
    var f = al.indexOf('async function finalizeSession');
    if (f === -1) return false;
    var body = al.slice(f, f + 2500);
    var p = body.indexOf('fsbPersistTerminalMessageToConversation');
    var n = body.indexOf('notifySidepanel(sid');
    return p !== -1 && n !== -1 && p < n;
  })()],
  ['C4 message-log has hasTerminalForSession', ml.indexOf('function hasTerminalForSession') !== -1 && ml.indexOf('hasTerminalForSession: hasTerminalForSession') !== -1],
  ['C4 sidepanel dedupe variable', sp.indexOf('_wnzTerminalDedupe') !== -1],
  ['C4 sidepanel calls hasTerminalForSession', sp.indexOf('hasTerminalForSession') !== -1],
  ['Preserved uof handler shape: sessionKnown variable', sp.indexOf('var sessionKnown') !== -1],
  ['Preserved uof handler shape: _renderCompletionDomOnly call', sp.indexOf('_renderCompletionDomOnly') !== -1],
  ['Preserved uof handler shape: NO completeStatusMessage in case automationComplete', (function () {
    var acIdx = sp.indexOf(\"case 'automationComplete'\");
    var nextCase = sp.indexOf('case ', acIdx + 30);
    var acBody = sp.slice(acIdx, nextCase === -1 ? acIdx + 6000 : nextCase);
    return acBody.indexOf('completeStatusMessage(') === -1;
  })()]
];

var fail = 0;
for (var i = 0; i < checks.length; i++) {
  console.log((checks[i][1] ? '  PASS:' : '  FAIL:') + ' ' + checks[i][0]);
  if (!checks[i][1]) fail++;
}
if (fail > 0) { console.error(fail + ' integration check(s) failed'); process.exit(1); }
console.log('all 12 integration checks passed');
"
```

3. Verify the commit log shape (`git log --oneline -5`) shows the 5 commits in order (newest first):
   - test(wnz-5): C5 multi-document fanout regression test
   - feat(wnz-4): C4 sessionId+terminal dedupe ...
   - feat(wnz-3): C3 background-side durable terminal persist ...
   - fix(wnz-2): C2 tab-scoped getStatus ...
   - fix(wnz-1): C1 skip chrome.sidePanel.open ...

4. Confirm files_modified matches frontmatter declaration:

```
git diff --name-only HEAD~5..HEAD
```

Expected output (set):
- extension/background.js
- extension/ui/sidepanel.js
- extension/ui/sidepanel-message-log.js
- extension/ai/agent-loop.js
- tests/sidepanel-multi-document-fanout.test.js
- package.json

(agent-loop.js was added by C3; everything else matches the frontmatter declaration.)

If any of the four checks fail, do NOT proceed to SUMMARY-write. Report the failure and stop.

This task creates NO commit. Verification only.
  </action>
  <verify>
    <automated>node -e "var fs=require('fs');var bg=fs.readFileSync('extension/background.js','utf8');var sp=fs.readFileSync('extension/ui/sidepanel.js','utf8');var ml=fs.readFileSync('extension/ui/sidepanel-message-log.js','utf8');var al=fs.readFileSync('extension/ai/agent-loop.js','utf8');var f=0;function check(n,c){console.log((c?'PASS':'FAIL')+': '+n);if(!c)f++;}check('C1',bg.indexOf(\"sender.url.endsWith('ui/sidepanel.html')\")!==-1);check('C2-bg',bg.indexOf('request.activeTabId')!==-1);check('C2-sp',sp.indexOf(\"action: 'getStatus', activeTabId\")!==-1);check('C3-helper',bg.indexOf('function fsbPersistTerminalMessageToConversation')!==-1);check('C3-export',bg.indexOf('globalThis.fsbPersistTerminalMessageToConversation')!==-1);check('C3-call',al.indexOf('fsbPersistTerminalMessageToConversation')!==-1);check('C4-ml-helper',ml.indexOf('function hasTerminalForSession')!==-1);check('C4-sp-dedupe',sp.indexOf('_wnzTerminalDedupe')!==-1);check('preserve-uof-sessionKnown',sp.indexOf('var sessionKnown')!==-1);check('preserve-uof-renderDomOnly',sp.indexOf('_renderCompletionDomOnly')!==-1);if(f>0){console.error(f+' integration checks failed');process.exit(1);}console.log('all integration checks passed');" && npm test</automated>
  </verify>
  <done>
- All 10+ integration checks pass.
- npm test exits 0.
- Commit log shows 5 commits in correct order (wnz-1..wnz-5).
- No commit produced from this task.
  </done>
</task>

</tasks>

<verification>
After ALL 5 commits land and T6 verification passes:

1. `npm test` exits 0.
2. New test `tests/sidepanel-multi-document-fanout.test.js` reports at least 7 PASS / 0 FAIL.
3. Existing `tests/sidepanel-background-tab-completion.test.js` STILL reports 32 PASS / 0 FAIL (handler shape preserved + sandbox identifier injection added per C4 action).
4. `tests/sidepanel-progress-tick-setter-routing.test.js` STILL reports 12 PASS / 0 FAIL.
5. `tests/sidepanel-message-log-smoke.test.js` STILL passes its existing assertions (optional-field backward-compat preserved).
6. `tests/sidepanel-tab-scoping-fix-redo-smoke.test.js` STILL passes.
7. All artifacts in the must_haves block exist and contain the required identifiers.
8. Codex's 5-item fix maps 1:1 to C1..C5 commits (1 = wnz-1, 2 = wnz-2, 3 = wnz-3, 4 = wnz-4, 5 = wnz-5).
9. The 260608-uof handler restructure (commit 24d05f72) is PRESERVED -- handler still uses sessionKnown scan + unconditional persist + isOriginatingActive render gate + NO completeStatusMessage call.
10. UAT items deferred to milestone manual verification (Codex's prescription is structural; full runtime UAT in Chrome must validate the user-visible outcomes -- Tab B completion lands once after swap-back, Tab A completion appears exactly once even with multiple sidepanel contexts open).
</verification>

<success_criteria>
1. 5 commits land in order on `automation` branch:
   - C1 (wnz-1) -- background.js no-reopen gate
   - C2 (wnz-2) -- background.js + sidepanel.js tab-scoped getStatus
   - C3 (wnz-3) -- background.js helper + agent-loop.js call site
   - C4 (wnz-4) -- sidepanel-message-log.js schema + sidepanel.js handler guard
   - C5 (wnz-5) -- new tests/sidepanel-multi-document-fanout.test.js + package.json registration
2. T6 audit-only integration check exits 0.
3. `npm test` exits 0 at every commit AND at the end.
4. NO files outside files_modified are touched.
5. NO emojis in any commit message, code comment, or test output.
6. NO destructive git operations (no force push, no rebase, no reset).
7. 260608-uof handler restructure is PRESERVED (sessionKnown variable + _renderCompletionDomOnly call + NO completeStatusMessage call inside automationComplete case).
8. Eliminated paths (state-emitter.js, session_ended emission, MCP bridge) NOT touched.
</success_criteria>

<output>
After completion, write `.planning/quick/260608-wnz-codex-strategy-b-5-item-architectural-fi/260608-wnz-SUMMARY.md` with:

- frontmatter: quick_task, title, created, completed, branch, plan, ref, commits (5 SHAs in order), files_modified, verification (npm_test exit + new test PASS count)
- One-liner: "Codex Strategy B 5-item architectural fix for cluster1 persistence: C1 no-reopen gate, C2 tab-scoped getStatus, C3 background-side durable persist, C4 sessionId+terminal dedupe, C5 multi-document fanout regression test."
- "What Shipped" section: one paragraph per C1..C5 with the commit SHA and key code-level change.
- "Verification Summary" code block with npm test exit + sibling test pass counts.
- "Self-Check" section: 10 PASS lines mirroring the integration checks from T6.
- "Deviations from Plan" section: any minor adjustments under Rules 1-3; if none, state "None".
- "UAT Items" section: defer the human-visible runtime checks (Tab B completion after swap-back; Tab A no-dupe with two contexts) to milestone manual verification.
- "Ref" section: links to CODEX-RESPONSE.md, CODEX-BRIEF.md, cluster1-routing.md, 260608-uof-SUMMARY.md, this plan.
</output>
</content>
</invoke>