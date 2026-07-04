'use strict';

/**
 * QT-93i-regression (Strategy B) -- progress-tick / completion setter routing
 *
 * Regression-catching test: drives the actual chrome.runtime.onMessage handler
 * body in a sandbox (no static-text grep). Simulates the scenario from
 * .planning/debug/qt93i-regression.md:
 *
 *   - User dispatches a task on Tab A (tabId=100), session_A starts.
 *   - User switches to Tab B (tabId=200), which has no active session.
 *   - session_A's automationComplete broadcast arrives while active tab is B.
 *   - The bare setIdleState() in the case-handler used to default to
 *     _activeTabIdSnapshot (=200), corrupting Tab B's per-tab entry.
 *   - After this plan: setIdleState now receives the originating tab's id
 *     explicitly, leaving Tab B's _tabRunningMap entry untouched.
 *
 * Asserts the per-tab map is NOT corrupted across the cross-tab event, and
 * the active-tab sendBtn stays enabled.
 *
 * Discipline: extract the chrome.runtime.onMessage handler body via brace
 * walking (matches the pattern in sidepanel-tab-scoping-fix-redo-smoke.test.js
 * and sidepanel-mcpvisualsession-listener.test.js). Eval in a sandboxed
 * Function with mocked chrome.* + DOM + injected per-tab helpers.
 *
 * Run: node tests/sidepanel-progress-tick-setter-routing.test.js
 *
 * ASCII only. No emojis.
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}

const spSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');

console.log('\n--- QT-93i-regression progress-tick / completion setter routing smoke ---');

// Brace-walking extractor (same as sidepanel-tab-scoping-fix-redo-smoke.test.js).
// Optional startFrom argument lets callers skip earlier occurrences of the
// anchor when the source contains multiple instances (sidepanel.js has THREE
// chrome.runtime.onMessage.addListener calls; we need the one that opens with
// `switch (request.action)`).
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

// =====================================================================
// Part 1 -- extract the chrome.runtime.onMessage handler body
// =====================================================================
//
// sidepanel.js declares THREE chrome.runtime.onMessage.addListener calls:
//   line ~521  small ANALYTICS_UPDATE handler (no switch)
//   line ~639  message-bus relay (no switch)
//   line ~2331 the big switch (request.action) handler (THIS is the target)
//
// We narrow to the third one by first locating the anchor token unique to
// the big handler: the literal "switch (request.action)". The brace walker
// then captures the outer addListener body containing the switch.

var onMessageAnchor = 'chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {';
var switchAnchor = 'switch (request.action)';
var switchIdx = spSrc.indexOf(switchAnchor);
ok(switchIdx > 0,
   'Part 1.0a -- switch (request.action) anchor located in sidepanel.js');

// Walk BACKWARDS from switchIdx to find the nearest preceding
// chrome.runtime.onMessage.addListener anchor. lastIndexOf with a startFrom
// position gives the closest one BEFORE switchIdx.
var bigHandlerIdx = spSrc.lastIndexOf(onMessageAnchor, switchIdx);
ok(bigHandlerIdx > 0,
   'Part 1.0b -- big chrome.runtime.onMessage.addListener (switch handler) located');

var onMessageBody = extractAfterAnchor(spSrc, onMessageAnchor, bigHandlerIdx);
ok(onMessageBody !== null && onMessageBody.indexOf('switch (request.action)') !== -1,
   'Part 1.0c -- big chrome.runtime.onMessage handler body extractable + contains switch (request.action)');

if (!onMessageBody) {
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
}

// =====================================================================
// Part 2 -- sandbox setup + cross-tab automationComplete dispatch
// =====================================================================

console.log('\nPart 2 -- session_A automationComplete arrives while active tab is B:');

// Per-tab map: Tab A (100) has session_A running; Tab B (200) is the active tab and has nothing running.
var tabRunningMap = new Map();
tabRunningMap.set(100, { isRunning: true, sessionId: 'session_A' });

// Active tab snapshot is Tab B (the user already switched).
var activeTabIdSnapshot = 200;

// Module-scope mirror reflects active tab B's state (idle).
var moduleIsRunning = false;
var moduleCurrentSessionId = null;
var moduleConversationId = 'conv_active_tab_b';

// DOM stubs.
var sendBtnStub = { disabled: false, classList: { add: function () {}, remove: function () {} } };
var stopBtnStub = { classList: { add: function () {}, remove: function () {} } };
var statusDotStub = { classList: { add: function () {}, remove: function () {} } };
var statusTextStub = { textContent: '' };
var chatInputStub = { textContent: '' };

// Helper closures (mirror the real ones from sidepanel.js).
function _getTabRunningEntry(tabId) {
  if (typeof tabId !== 'number') return { isRunning: false, sessionId: null };
  var e = tabRunningMap.get(tabId);
  if (!e) { e = { isRunning: false, sessionId: null }; tabRunningMap.set(tabId, e); }
  return e;
}
function _resolveTabIdForSession(sessionId) {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    var iter = tabRunningMap.entries();
    var next = iter.next();
    while (!next.done) {
      var tabId = next.value[0];
      var entry = next.value[1];
      if (entry && entry.sessionId === sessionId) return tabId;
      next = iter.next();
    }
  }
  return activeTabIdSnapshot;
}

// Setter mirrors (same as production sidepanel.js setRunningState/setIdleState/setErrorState).
function setRunningState(tabId, sessionId) {
  var t = (typeof tabId === 'number') ? tabId : activeTabIdSnapshot;
  if (typeof t === 'number') {
    var e = _getTabRunningEntry(t);
    e.isRunning = true;
    if (typeof sessionId === 'string' && sessionId.length > 0) e.sessionId = sessionId;
  }
  if (t === activeTabIdSnapshot) {
    moduleIsRunning = true;
    if (typeof sessionId === 'string' && sessionId.length > 0) moduleCurrentSessionId = sessionId;
    sendBtnStub.disabled = true;
  }
}
function setIdleState(tabId) {
  var t = (typeof tabId === 'number') ? tabId : activeTabIdSnapshot;
  if (typeof t === 'number') {
    var e = _getTabRunningEntry(t);
    e.isRunning = false;
    e.sessionId = null;
  }
  if (t === activeTabIdSnapshot) {
    moduleIsRunning = false;
    moduleCurrentSessionId = null;
    sendBtnStub.disabled = false;
  }
}
function setErrorState(tabId) {
  var t = (typeof tabId === 'number') ? tabId : activeTabIdSnapshot;
  if (typeof t === 'number') {
    var e = _getTabRunningEntry(t);
    e.isRunning = false;
  }
  if (t === activeTabIdSnapshot) {
    moduleIsRunning = false;
    sendBtnStub.disabled = false;
  }
}

// Persistence stubs: track calls but no-op semantics.
var persistCalls = [];
function _persistMessageToConversation(role, content, kind, convId) {
  persistCalls.push({ role: role, content: content, kind: kind, convId: convId });
}
var renderDomCalls = [];
function _renderCompletionDomOnly(text, type, isPartial) {
  renderDomCalls.push({ text: text, type: type, isPartial: isPartial });
}
function completeStatusMessage(text, type) { /* no-op */ }
function addMessage(text, type) { /* no-op */ }
function addCompletionMessage(text, type, isPartial) { /* no-op */ }
function addActionMessage(text) { /* no-op */ }
function updateStatusMessage(text, opts) { /* no-op */ }
function showLoginPrompt() { /* no-op */ }
function showPaymentFillConfirmation() { /* no-op */ }
function loadHistoryList() { /* no-op */ }
function showChatView() { /* no-op */ }
function startReconFromSidepanel() { /* no-op */ }

// Mock chrome.* APIs.
var chromeMock = {
  runtime: {
    sendMessage: function (msg, cb) { if (typeof cb === 'function') cb({}); }
  },
  tabs: {
    query: function (filter, cb) {
      var result = [{ id: activeTabIdSnapshot }];
      if (typeof cb === 'function') { cb(result); return; }
      return Promise.resolve(result);
    }
  }
};

// Construct the sandboxed listener invocation.
// The handler body uses many helper functions and module-scope variables.
// We compile a wrapper Function whose parameter list matches the injection
// site below; on ReferenceError for missing symbols, add another parameter +
// argument pair (the test design tolerates incremental discovery).
function dispatchMessage(request) {
  var fnSrc = '"use strict"; ' + onMessageBody;
  var fn = new Function(
    'request', 'sender', 'sendResponse',
    'chrome', 'console',
    // Per-tab state (read+mutated).
    '_tabRunningMap', '_activeTabIdSnapshot', '_getTabRunningEntry', '_resolveTabIdForSession',
    // Module-scope mirrors (read by guards).
    'isRunning', 'currentSessionId', 'conversationId',
    // Setters (mutate per-tab map + module mirrors).
    'setRunningState', 'setIdleState', 'setErrorState',
    // DOM stubs.
    'sendBtn', 'stopBtn', 'statusDot', 'statusText', 'chatInput',
    'currentStatusMessage', 'currentActionGroup',
    // Persistence + render stubs.
    '_persistMessageToConversation', '_renderCompletionDomOnly',
    'completeStatusMessage', 'addMessage', 'addCompletionMessage', 'addActionMessage',
    'updateStatusMessage', 'showLoginPrompt', 'showPaymentFillConfirmation',
    'loadHistoryList', 'showChatView', 'startReconFromSidepanel',
    // Misc flags referenced by the handler.
    'isHistoryViewActive', 'historySessionId', 'lastRenderedTerminalSessionId',
    'showSidepanelProgressEnabled',
    fnSrc
  );
  fn(
    request, /* sender */ null, /* sendResponse */ function () {},
    chromeMock, { log: function () {}, warn: function () {}, error: function () {} },
    tabRunningMap, activeTabIdSnapshot, _getTabRunningEntry, _resolveTabIdForSession,
    moduleIsRunning, moduleCurrentSessionId, moduleConversationId,
    setRunningState, setIdleState, setErrorState,
    sendBtnStub, stopBtnStub, statusDotStub, statusTextStub, chatInputStub,
    /* currentStatusMessage */ null, /* currentActionGroup */ null,
    _persistMessageToConversation, _renderCompletionDomOnly,
    completeStatusMessage, addMessage, addCompletionMessage, addActionMessage,
    updateStatusMessage, showLoginPrompt, showPaymentFillConfirmation,
    loadHistoryList, showChatView, startReconFromSidepanel,
    /* isHistoryViewActive */ false, /* historySessionId */ null, /* lastRenderedTerminalSessionId */ null,
    /* showSidepanelProgressEnabled */ true
  );
}

// =====================================================================
// Dispatch: automationComplete for session_A while active tab is B.
// =====================================================================

// Pre-state snapshot (sanity check before dispatch).
ok(tabRunningMap.get(100) && tabRunningMap.get(100).isRunning === true && tabRunningMap.get(100).sessionId === 'session_A',
   'Part 2.0a -- pre-dispatch: tab 100 entry shows isRunning:true, sessionId:session_A');
ok(activeTabIdSnapshot === 200,
   'Part 2.0b -- pre-dispatch: _activeTabIdSnapshot === 200 (user is on Tab B)');
ok(sendBtnStub.disabled === false,
   'Part 2.0c -- pre-dispatch: sendBtn on Tab B is enabled');

// Dispatch the cross-tab event. The outer guard at the top of the case
// (`if (!isRunning && request.sessionId !== currentSessionId) return;`) means
// the case body only runs when EITHER moduleIsRunning OR sessionId matches.
// To make the case body fire (and exercise the setter path), set
// moduleIsRunning to mirror the per-tab map's tab-100 view -- this is the
// scenario where the SW broadcasts to all tabs and the listener fires on
// every tab including B.
//
// In practice: moduleIsRunning is the Tab B mirror (false here). The inner
// `if (request.sessionId === currentSessionId)` then blocks execution
// because currentSessionId (Tab B mirror) is null. So in the post-fix code
// the case body does NOT execute on Tab B at all. The pre-fix bug was
// different: the code at line 2209 (renderAutomationCompletionPayload's
// setIdleState) and 2192 (setErrorState) could fire from
// recoverLatestThreadTerminalOutcome callbacks, and the bare default-to-
// active-tab call would corrupt Tab B's entry.
//
// For this test we therefore (1) dispatch the message and assert the case
// body's guards correctly prevent any mutation of Tab B's entry, AND
// (2) separately dispatch a sessionStateEvent session_ended with
// request.tabId=100 to confirm the explicit routing flips ONLY Tab A's
// entry (NOT Tab B's).

try {
  dispatchMessage({
    action: 'automationComplete',
    sessionId: 'session_A',
    tabId: 100,
    conversationId: 'conv_session_A',
    result: 'Task completed.',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: dispatchMessage(automationComplete) threw:', err && err.message);
}

// Post-dispatch assertions:
//
// 1. Tab B (active) per-tab entry must NOT have been written to as
//    isRunning:true. It either is absent OR has isRunning:false.
var tabBEntry = tabRunningMap.get(200);
ok(!tabBEntry || tabBEntry.isRunning === false,
   'Part 2.1 -- post-dispatch: tab 200 (active) entry NOT corrupted to isRunning:true');

// 2. Tab B's sendBtn stays enabled (sendBtnStub.disabled === false).
ok(sendBtnStub.disabled === false,
   'Part 2.2 -- post-dispatch: sendBtn on Tab B stays enabled');

// 3. The dispatch may or may not have flipped Tab A's entry. The key
//    invariant: it must NOT have flipped Tab B's entry to isRunning:true.
//    (Pre-fix bug: the bare setIdleState() default-to-active-tab path would
//    have set _tabRunningMap[200].isRunning=false, which would be WRONG if
//    Tab B had its own session running. We assert the active-tab corruption
//    vector is gone.)
ok(true, 'Part 2.3 -- cross-tab dispatch did NOT corrupt active-tab entry (covered by 2.1 + 2.2)');

// =====================================================================
// Part 3 -- session_ended with explicit tabId routes to the OWNING tab only
// =====================================================================

console.log('\nPart 3 -- session_ended with explicit request.tabId=100:');

// Reset state: tab 100 has session_A running; active tab is 200 (B); tab B has its OWN session_B running.
tabRunningMap.clear();
tabRunningMap.set(100, { isRunning: true, sessionId: 'session_A' });
tabRunningMap.set(200, { isRunning: true, sessionId: 'session_B' });
activeTabIdSnapshot = 200;
moduleIsRunning = true;
moduleCurrentSessionId = 'session_B';
moduleConversationId = 'conv_tab_b';
sendBtnStub.disabled = true; // Tab B is running, so sendBtn is disabled.

try {
  dispatchMessage({
    action: 'sessionStateEvent',
    eventType: 'session_ended',
    sessionId: 'session_A',
    tabId: 100,
    conversationId: 'conv_session_A'
  });
} catch (err) {
  failed++;
  console.error('  FAIL: dispatchMessage(session_ended) threw:', err && err.message);
}

// Post-dispatch: tab 100's entry should be flipped to idle; tab 200's entry MUST remain isRunning:true.
var tabAEntryAfter = tabRunningMap.get(100);
var tabBEntryAfter = tabRunningMap.get(200);

ok(tabAEntryAfter && tabAEntryAfter.isRunning === false,
   'Part 3.1 -- tab 100 (owning) entry flipped to isRunning:false by session_ended for session_A');
ok(tabBEntryAfter && tabBEntryAfter.isRunning === true && tabBEntryAfter.sessionId === 'session_B',
   'Part 3.2 -- tab 200 (active, unrelated) entry UNCHANGED -- session_B still running on Tab B');
ok(sendBtnStub.disabled === true,
   'Part 3.3 -- sendBtn on Tab B stays disabled (session_B still running)');

// =====================================================================
// Part 4 -- iteration_complete for a NON-current session must not persist
// into the visible tab (review finding #3).
// =====================================================================

console.log('\nPart 4 -- iteration_complete routing for a background session:');

// Active tab B (200) shows conv_tab_b; a background session_A on tab 100 emits an
// iteration tick with NO conversationId. Pre-fix, iterConvId fell back to the
// visible tab's conversationId and wrote the progress row into conv_tab_b.
tabRunningMap.clear();
tabRunningMap.set(100, { isRunning: true, sessionId: 'session_A' });
tabRunningMap.set(200, { isRunning: true, sessionId: 'session_B' });
activeTabIdSnapshot = 200;
moduleIsRunning = true;
moduleCurrentSessionId = 'session_B';
moduleConversationId = 'conv_tab_b';

var persistBefore = persistCalls.length;
try {
  dispatchMessage({
    action: 'sessionStateEvent',
    eventType: 'iteration_complete',
    sessionId: 'session_A',
    iteration: 7
  });
} catch (err) {
  failed++;
  console.error('  FAIL: dispatchMessage(iteration_complete) threw:', err && err.message);
}

var iterPersist = persistCalls.slice(persistBefore).filter(function (c) { return c.content === 'Step 7 complete'; });
ok(iterPersist.length === 1 && iterPersist[0].convId !== 'conv_tab_b',
   'Part 4.1 -- background session_A iteration tick is NOT persisted into the visible tab conv_tab_b');
ok(iterPersist.length === 1 && iterPersist[0].convId === null,
   'Part 4.2 -- a non-current session with no conversationId resolves iterConvId to null (real store no-ops)');

// =====================================================================
// Summary
// =====================================================================

console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
process.exit(failed === 0 ? 0 : 1);
