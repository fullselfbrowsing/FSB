'use strict';

/**
 * QT-uof-3 (SIMULATOR-PROMOTE) -- D-FIX + E-FIX real-runtime regression test
 *
 * Promotes the debugger's /tmp simulator (cluster1-sim2.js.orig) into a
 * real-runtime test that drives the actual chrome.runtime.onMessage handler
 * body via brace-walk + sandbox eval. Pattern mirrors
 * tests/sidepanel-progress-tick-setter-routing.test.js verbatim.
 *
 * Scenarios covered:
 *
 *   Part 1 -- structural sanity. The post-Task-1 handler body must contain
 *   the relaxed outer guard (sessionKnown scan of _tabRunningMap), the
 *   unconditional _persistMessageToConversation call, and the
 *   _renderCompletionDomOnly call. It must NOT call completeStatusMessage
 *   in the if-branch (that was the double-persist site).
 *
 *   Part 2 (D-FIX): Tab B's session completes while user is on Tab A.
 *   Pre-Task-1 this dropped the entire handler body for Tab B (outer bail).
 *   Post-fix: _persistMessageToConversation called against conv_B; Tab B's
 *   per-tab entry flips isRunning:false; Tab A's entry untouched; the
 *   active-tab UI stays running (moduleIsRunning, moduleCurrentSessionId,
 *   sendBtn.disabled all preserved).
 *
 *   Part 3 (E-FIX): Tab A's session completes with currentStatusMessage
 *   non-null (active tab loader visible). Pre-Task-1 this called
 *   completeStatusMessage which routed through addCompletionMessage which
 *   called _persistMessage AGAIN against the module-scope conversationId,
 *   producing TWO persists into conv_A. Post-fix: persistence fires EXACTLY
 *   ONCE; completeStatusMessage NOT called; addCompletionMessage NOT called;
 *   _renderCompletionDomOnly called exactly once; currentStatusMessage.remove()
 *   called for manual loader cleanup.
 *
 *   Part 4: A background tab's session errors while user is on Tab A.
 *   Post-fix: Tab B's per-tab entry flips isRunning:false; Tab A's entry
 *   and visible error UI stay untouched.
 *
 *   Part 5 -- pre-Task-1 sanity comment block (informational only). The
 *   assertions in Part 2 would have FAILED against pre-Task-1 sidepanel.js
 *   because the outer bail + strict-match `if (request.sessionId === currentSessionId)`
 *   dropped the entire body for background-tab completions. Assertion 3.1
 *   would have FAILED because the pre-fix double-persist produced 2 persist
 *   calls for conv_A.
 *
 * Run: node tests/sidepanel-background-tab-completion.test.js
 *
 * Ref: .planning/debug/cluster1-routing.md
 *      .planning/quick/260608-uof-cluster-1-2-bundled-fix-d-fix-open-autom/260608-uof-PLAN.md
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

console.log('\n--- QT-uof-3 D-FIX + E-FIX sidepanel background-tab completion smoke ---');

// Brace-walking extractor copied from sidepanel-progress-tick-setter-routing.test.js.
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
// Part 1 -- structural sanity on the case automationComplete body
// =====================================================================

console.log('\nPart 1 -- post-Task-1 structural sanity:');

var autoCompleteIdx = spSrc.indexOf("case 'automationComplete'");
ok(autoCompleteIdx > 0,
   'Part 1.1 -- case automationComplete anchor located');

var autoCompleteBody = extractAfterAnchor(spSrc, "case 'automationComplete'", autoCompleteIdx);
ok(autoCompleteBody !== null,
   'Part 1.2 -- case automationComplete body extractable');

if (!autoCompleteBody) {
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
}

ok(autoCompleteBody.indexOf('sessionKnown') !== -1,
   'Part 1.3 -- relaxed outer guard variable sessionKnown present (D-FIX)');
ok(autoCompleteBody.indexOf('_tabRunningMap.values()') !== -1,
   'Part 1.4 -- relaxed outer guard scans _tabRunningMap for background-tab session match');
ok(autoCompleteBody.indexOf('_persistMessageToConversation') !== -1,
   'Part 1.5 -- _persistMessageToConversation present (unconditional persist)');
ok(autoCompleteBody.indexOf('_renderCompletionDomOnly') !== -1,
   'Part 1.6 -- _renderCompletionDomOnly present (DOM-only render path)');
ok(autoCompleteBody.match(/completeStatusMessage\s*\(/) === null,
   'Part 1.7 -- NO completeStatusMessage call in body (E-FIX: avoids double-persist via addCompletionMessage)');
ok(autoCompleteBody.indexOf('isOriginatingActive') !== -1,
   'Part 1.8 -- isOriginatingActive flag gates DOM render only');

var automationErrorIdx = spSrc.indexOf("case 'automationError'");
ok(automationErrorIdx > 0,
   'Part 1.9 -- case automationError anchor located');

var automationErrorBody = extractAfterAnchor(spSrc, "case 'automationError'", automationErrorIdx);
ok(automationErrorBody !== null,
   'Part 1.10 -- case automationError body extractable');
if (automationErrorBody) {
  ok(automationErrorBody.indexOf('errorSessionKnown') !== -1,
     'Part 1.11 -- automationError uses relaxed session-known guard');
  ok(automationErrorBody.indexOf('_tabRunningMap.values()') !== -1,
     'Part 1.12 -- automationError scans _tabRunningMap for background-tab session match');
  ok(automationErrorBody.indexOf('isErrorOriginatingActive') !== -1,
     'Part 1.13 -- automationError gates active-tab UI rendering');
}

// =====================================================================
// Anchor the outer chrome.runtime.onMessage handler for sandbox eval
// =====================================================================
//
// sidepanel.js declares THREE chrome.runtime.onMessage.addListener calls;
// we need the one with the switch (request.action). Pattern copied verbatim
// from sidepanel-progress-tick-setter-routing.test.js.

var onMessageAnchor = 'chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {';
var switchAnchor = 'switch (request.action)';
var switchIdx = spSrc.indexOf(switchAnchor);
var bigHandlerIdx = spSrc.lastIndexOf(onMessageAnchor, switchIdx);
var onMessageBody = extractAfterAnchor(spSrc, onMessageAnchor, bigHandlerIdx);
ok(onMessageBody !== null && onMessageBody.indexOf('switch (request.action)') !== -1,
   'Part 1.14 -- big chrome.runtime.onMessage handler body extractable for sandbox eval');

if (!onMessageBody) {
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
}

// =====================================================================
// Shared sandbox harness
// =====================================================================

// Build a dispatcher that compiles the listener body once and lets each
// scenario inject its own per-tab map, module-scope mirrors, and stubs.

function buildDispatcher(injection) {
  var fnSrc = '"use strict"; ' + onMessageBody;
  var fn = new Function(
    'request', 'sender', 'sendResponse',
    'chrome', 'console',
    // Per-tab state.
    '_tabRunningMap', '_activeTabIdSnapshot', '_getTabRunningEntry', '_resolveTabIdForSession',
    // Module-scope mirrors.
    'isRunning', 'currentSessionId', 'conversationId',
    // Setters.
    'setRunningState', 'setIdleState', 'setErrorState',
    // DOM stubs.
    'sendBtn', 'stopBtn', 'statusDot', 'statusText', 'chatInput',
    'currentStatusMessage', 'currentActionGroup',
    // Persistence + render stubs.
    '_persistMessageToConversation', '_renderCompletionDomOnly',
    'completeStatusMessage', 'addMessage', 'addCompletionMessage', 'addActionMessage',
    'updateStatusMessage', 'showLoginPrompt', 'showPaymentFillConfirmation',
    'loadHistoryList', 'showChatView', 'startReconFromSidepanel',
    // Misc flags.
    'isHistoryViewActive', 'historySessionId', 'lastRenderedTerminalSessionId',
    'showSidepanelProgressEnabled',
    'chatMessages', 'scrollToBottom',
    // QT-uof-5 (B-FIX) -- per-tab status intent helpers. The handler's
    // if-branch calls _clearTabStatusIntent after manual loader cleanup.
    '_clearTabStatusIntent', '_persistTabStatusIntent', '_restoreTabStatusIntent',
    // QT-wnz Codex-4 -- dedupe guard references _messageLogPendingBuffer
    // (sync buffer-peek) and FSBSidepanelMessageLog.hasTerminalForSession
    // + .STORAGE_KEY (async storage-peek). Inject as test stubs.
    '_messageLogPendingBuffer', 'FSBSidepanelMessageLog',
    fnSrc
  );
  return function dispatch(request) {
    fn(
      request, /* sender */ null, /* sendResponse */ function () {},
      injection.chrome, injection.console,
      injection.tabRunningMap, injection.activeTabIdSnapshot,
      injection.getTabRunningEntry, injection.resolveTabIdForSession,
      injection.moduleIsRunning, injection.moduleCurrentSessionId, injection.moduleConversationId,
      injection.setRunningState, injection.setIdleState, injection.setErrorState,
      injection.sendBtn, injection.stopBtn, injection.statusDot, injection.statusText, injection.chatInput,
      injection.currentStatusMessage, injection.currentActionGroup,
      injection.persistMessageToConversation, injection.renderCompletionDomOnly,
      injection.completeStatusMessage, injection.addMessage, injection.addCompletionMessage, injection.addActionMessage,
      injection.updateStatusMessage, injection.showLoginPrompt, injection.showPaymentFillConfirmation,
      injection.loadHistoryList, injection.showChatView, injection.startReconFromSidepanel,
      injection.isHistoryViewActive, injection.historySessionId, injection.lastRenderedTerminalSessionId,
      injection.showSidepanelProgressEnabled,
      injection.chatMessages, injection.scrollToBottom,
      injection.clearTabStatusIntent, injection.persistTabStatusIntent, injection.restoreTabStatusIntent,
      injection.messageLogPendingBuffer, injection.fsbSidepanelMessageLog
    );
  };
}

function makeInjection(opts) {
  var tabRunningMap = new Map();
  if (opts && opts.tabEntries) {
    opts.tabEntries.forEach(function (e) { tabRunningMap.set(e.tabId, { isRunning: e.isRunning, sessionId: e.sessionId }); });
  }
  var activeTabIdSnapshot = (opts && typeof opts.activeTabId === 'number') ? opts.activeTabId : null;

  // Mutable state mirrors -- closed-over by setters so tests can read post-state.
  var state = {
    moduleIsRunning: !!(opts && opts.moduleIsRunning),
    moduleCurrentSessionId: (opts && opts.moduleCurrentSessionId) || null,
    moduleConversationId: (opts && opts.moduleConversationId) || null,
    sendBtnDisabled: !!(opts && opts.sendBtnDisabled),
    setIdleCalls: [],
    setErrorCalls: [],
    persistCalls: [],
    renderCalls: [],
    completeStatusCalls: [],
    addCompletionCalls: [],
    addMessageCalls: []
  };

  function getTabRunningEntry(tabId) {
    if (typeof tabId !== 'number') return { isRunning: false, sessionId: null };
    var e = tabRunningMap.get(tabId);
    if (!e) { e = { isRunning: false, sessionId: null }; tabRunningMap.set(tabId, e); }
    return e;
  }
  function resolveTabIdForSession(sessionId) {
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      var iter = tabRunningMap.entries();
      var nxt = iter.next();
      while (!nxt.done) {
        var tabId = nxt.value[0];
        var entry = nxt.value[1];
        if (entry && entry.sessionId === sessionId) return tabId;
        nxt = iter.next();
      }
    }
    return activeTabIdSnapshot;
  }
  function setIdleState(tabId) {
    var t = (typeof tabId === 'number') ? tabId : activeTabIdSnapshot;
    state.setIdleCalls.push({ tabId: t });
    if (typeof t === 'number') {
      var e = getTabRunningEntry(t);
      e.isRunning = false;
      e.sessionId = null;
    }
    if (t === activeTabIdSnapshot) {
      state.moduleIsRunning = false;
      state.moduleCurrentSessionId = null;
      state.sendBtnDisabled = false;
    }
  }
  function setRunningState(tabId, sessionId) {
    var t = (typeof tabId === 'number') ? tabId : activeTabIdSnapshot;
    if (typeof t === 'number') {
      var e = getTabRunningEntry(t);
      e.isRunning = true;
      if (typeof sessionId === 'string' && sessionId.length > 0) e.sessionId = sessionId;
    }
    if (t === activeTabIdSnapshot) {
      state.moduleIsRunning = true;
      if (typeof sessionId === 'string' && sessionId.length > 0) state.moduleCurrentSessionId = sessionId;
      state.sendBtnDisabled = true;
    }
  }
  function setErrorState(tabId) {
    var t = (typeof tabId === 'number') ? tabId : activeTabIdSnapshot;
    state.setErrorCalls.push({ tabId: t });
    if (typeof t === 'number') {
      var e = getTabRunningEntry(t);
      e.isRunning = false;
    }
    if (t === activeTabIdSnapshot) {
      state.moduleIsRunning = false;
      state.sendBtnDisabled = false;
    }
  }

  // QT-uof-5 (B-FIX) -- per-tab status intent helpers. Track calls but
  // do not mutate test state; correctness for these helpers is verified
  // structurally elsewhere.
  state.clearTabStatusIntentCalls = [];
  function clearTabStatusIntent(tabId) { state.clearTabStatusIntentCalls.push(tabId); }
  function persistTabStatusIntent(_tabId) { /* no-op */ }
  function restoreTabStatusIntent(_tabId) { /* no-op */ }

  function persistMessageToConversation(role, content, kind, convId) {
    state.persistCalls.push({ role: role, content: content, kind: kind, convId: convId });
  }
  function renderCompletionDomOnly(text, type, isPartial) {
    state.renderCalls.push({ text: text, type: type, isPartial: isPartial });
  }
  function completeStatusMessage(text, type) {
    state.completeStatusCalls.push({ text: text, type: type });
  }
  function addCompletionMessage(text, type, isPartial) {
    state.addCompletionCalls.push({ text: text, type: type, isPartial: isPartial });
  }
  function addMessage(text, type) { state.addMessageCalls.push({ text: text, type: type }); }
  function addActionMessage(text) { /* no-op */ }
  function updateStatusMessage(text, opts2) { /* no-op */ }
  function showLoginPrompt() { /* no-op */ }
  function showPaymentFillConfirmation() { /* no-op */ }
  function loadHistoryList() { /* no-op */ }
  function showChatView() { /* no-op */ }
  function startReconFromSidepanel() { /* no-op */ }

  // currentStatusMessage spy: if opts says non-null, provide a stub with
  // a tracked remove() and a querySelector that returns null (so loader
  // cleanup paths short-circuit). We expose the same object via getter so
  // the test can inspect .removeCount post-dispatch.
  var statusStub = null;
  if (opts && opts.currentStatusMessage) {
    statusStub = {
      removeCount: 0,
      remove: function () { this.removeCount++; },
      querySelector: function () { return null; },
      appendChild: function () {}
    };
  }
  var actionGroupStub = (opts && opts.currentActionGroup) ? opts.currentActionGroup : null;

  return {
    tabRunningMap: tabRunningMap,
    activeTabIdSnapshot: activeTabIdSnapshot,
    getTabRunningEntry: getTabRunningEntry,
    resolveTabIdForSession: resolveTabIdForSession,
    moduleIsRunning: state.moduleIsRunning,
    moduleCurrentSessionId: state.moduleCurrentSessionId,
    moduleConversationId: state.moduleConversationId,
    setRunningState: setRunningState,
    setIdleState: setIdleState,
    setErrorState: setErrorState,
    sendBtn: { get disabled() { return state.sendBtnDisabled; }, set disabled(v) { state.sendBtnDisabled = v; }, classList: { add: function () {}, remove: function () {} } },
    stopBtn: { classList: { add: function () {}, remove: function () {} } },
    statusDot: { classList: { add: function () {}, remove: function () {} } },
    statusText: { textContent: '' },
    chatInput: { textContent: '' },
    currentStatusMessage: statusStub,
    currentActionGroup: actionGroupStub,
    persistMessageToConversation: persistMessageToConversation,
    renderCompletionDomOnly: renderCompletionDomOnly,
    completeStatusMessage: completeStatusMessage,
    addMessage: addMessage,
    addCompletionMessage: addCompletionMessage,
    addActionMessage: addActionMessage,
    updateStatusMessage: updateStatusMessage,
    showLoginPrompt: showLoginPrompt,
    showPaymentFillConfirmation: showPaymentFillConfirmation,
    loadHistoryList: loadHistoryList,
    showChatView: showChatView,
    startReconFromSidepanel: startReconFromSidepanel,
    isHistoryViewActive: false,
    historySessionId: null,
    lastRenderedTerminalSessionId: null,
    showSidepanelProgressEnabled: true,
    chatMessages: { children: [], appendChild: function () {}, innerHTML: '' },
    scrollToBottom: function () {},
    clearTabStatusIntent: clearTabStatusIntent,
    persistTabStatusIntent: persistTabStatusIntent,
    restoreTabStatusIntent: restoreTabStatusIntent,
    // QT-wnz Codex-4 -- empty Map so the sync buffer-peek finds no
    // pre-existing terminal entries (dedupe-flag stays false; existing
    // assertions about persist+render call counts remain valid).
    messageLogPendingBuffer: new Map(),
    // QT-wnz Codex-4 -- hasTerminalForSession stub returns false so the
    // async storage peek never triggers buffer trim (existing assertions
    // hold). STORAGE_KEY is a string so the typeof check passes.
    fsbSidepanelMessageLog: {
      STORAGE_KEY: 'fsbConversationMessages',
      hasTerminalForSession: function () { return false; }
    },
    chrome: {
      runtime: {
        sendMessage: function (msg, cb) { if (typeof cb === 'function') cb({}); return Promise.resolve({}); }
      },
      storage: {
        local: {
          get: function () { return Promise.resolve({}); }
        }
      },
      tabs: {
        query: function (filter, cb) {
          var result = [{ id: activeTabIdSnapshot, url: '' }];
          if (typeof cb === 'function') { cb(result); return; }
          return Promise.resolve(result);
        }
      }
    },
    console: { log: function () {}, warn: function () {}, error: function () {} },
    state: state,
    statusStubRef: statusStub
  };
}

// =====================================================================
// Part 2 -- D-FIX scenario: Tab B completes while user is on Tab A
// =====================================================================
//
// Setup: _tabRunningMap = { 100: {isRunning:true, sessionId:'sess_A'},
//                           200: {isRunning:true, sessionId:'sess_B'} }
//        _activeTabIdSnapshot = 100
//        moduleIsRunning = true, moduleCurrentSessionId = 'sess_A',
//        moduleConversationId = 'conv_A'
//        currentStatusMessage = active loader stub
// Dispatch: automationComplete for sess_B, conv_B, tabId=200, result='B done'

console.log('\nPart 2 -- D-FIX: Tab B completes while user is on Tab A:');

var inj2 = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' },
    { tabId: 200, isRunning: true, sessionId: 'sess_B' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: 'conv_A',
  sendBtnDisabled: true,
  currentStatusMessage: true,
  currentActionGroup: { fake: 'group' }
});

var dispatch2 = buildDispatcher(inj2);
try {
  dispatch2({
    action: 'automationComplete',
    sessionId: 'sess_B',
    conversationId: 'conv_B',
    tabId: 200,
    result: 'B done',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 2 dispatch threw:', err && err.message);
}

// 2.1 _persistMessageToConversation called with convId='conv_B' (NOT 'conv_A')
ok(inj2.state.persistCalls.length === 1 && inj2.state.persistCalls[0].convId === 'conv_B' && inj2.state.persistCalls[0].content === 'B done',
   'Part 2.1 -- _persistMessageToConversation called EXACTLY ONCE with convId=conv_B, content=B done');

// 2.2 _persistMessageToConversation called EXACTLY ONCE this dispatch
ok(inj2.state.persistCalls.length === 1,
   'Part 2.2 -- exactly one persist (D-FIX persists unconditionally; no double-persist because if-branch is NOT active)');

// 2.3 Tab B's _tabRunningMap entry now has isRunning:false, sessionId:null
var tabB2 = inj2.tabRunningMap.get(200);
ok(tabB2 && tabB2.isRunning === false && tabB2.sessionId === null,
   'Part 2.3 -- Tab B per-tab entry flipped to isRunning:false, sessionId:null (D-FIX flips background-tab entry)');

// 2.4 Tab A's _tabRunningMap entry UNTOUCHED
var tabA2 = inj2.tabRunningMap.get(100);
ok(tabA2 && tabA2.isRunning === true && tabA2.sessionId === 'sess_A',
   'Part 2.4 -- Tab A per-tab entry UNCHANGED (isRunning:true, sessionId:sess_A)');

// 2.5 moduleIsRunning UNTOUCHED and moduleCurrentSessionId UNTOUCHED.
//     setIdleState called with tabId=200 mutates ONLY the per-tab entry for
//     tab 200; module-scope mirrors stay attached to the active tab (100).
ok(inj2.state.moduleIsRunning === true,
   'Part 2.5a -- moduleIsRunning still true (active-tab UI not disturbed by background completion)');
ok(inj2.state.moduleCurrentSessionId === 'sess_A',
   'Part 2.5b -- moduleCurrentSessionId still sess_A');

// 2.6 _renderCompletionDomOnly NOT called (isOriginatingActive=false because
//     originatingConvId=conv_B != moduleConversationId=conv_A)
ok(inj2.state.renderCalls.length === 0,
   'Part 2.6 -- _renderCompletionDomOnly NOT called (isOriginatingActive=false for background tab)');

// 2.7 sendBtn stays disabled (active-tab UI undisturbed)
ok(inj2.state.sendBtnDisabled === true,
   'Part 2.7 -- sendBtn stays disabled (active-tab session_A is still running)');

// 2.8 currentStatusMessage stub NOT removed (if-branch did not run)
ok(inj2.statusStubRef && inj2.statusStubRef.removeCount === 0,
   'Part 2.8 -- currentStatusMessage.remove() NOT called (if-branch skipped for background tab)');

// 2.9 setIdleState called exactly once with tabId=200
ok(inj2.state.setIdleCalls.length === 1 && inj2.state.setIdleCalls[0].tabId === 200,
   'Part 2.9 -- setIdleState called exactly once with tabId=200 (originating tab routing)');

// 2.10 completeStatusMessage and addCompletionMessage NOT called.
ok(inj2.state.completeStatusCalls.length === 0,
   'Part 2.10 -- completeStatusMessage NOT called (E-FIX guarantee preserved on background path)');
ok(inj2.state.addCompletionCalls.length === 0,
   'Part 2.11 -- addCompletionMessage NOT called (E-FIX guarantee preserved on background path)');

// =====================================================================
// Part 3 -- E-FIX scenario: Tab A completes, currentStatusMessage non-null
// =====================================================================
//
// Setup: Tab A active, sess_A running, currentStatusMessage non-null,
//        moduleConversationId='conv_A'.
// Dispatch: automationComplete for sess_A, conv_A, tabId=100, result='A done'.
// E-FIX: EXACTLY ONE persist to conv_A; NO completeStatusMessage;
// NO addCompletionMessage; ONE _renderCompletionDomOnly; manual remove() fires.

console.log('\nPart 3 -- E-FIX: Tab A completes, currentStatusMessage non-null:');

var inj3 = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' },
    { tabId: 200, isRunning: true, sessionId: 'sess_B' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: 'conv_A',
  sendBtnDisabled: true,
  currentStatusMessage: true,
  currentActionGroup: { fake: 'group' }
});

var dispatch3 = buildDispatcher(inj3);
try {
  dispatch3({
    action: 'automationComplete',
    sessionId: 'sess_A',
    conversationId: 'conv_A',
    tabId: 100,
    result: 'A done',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 3 dispatch threw:', err && err.message);
}

// 3.1 EXACTLY ONE _persistMessageToConversation against conv_A (E-FIX: no double-persist)
ok(inj3.state.persistCalls.length === 1 && inj3.state.persistCalls[0].convId === 'conv_A' && inj3.state.persistCalls[0].content === 'A done',
   'Part 3.1 -- _persistMessageToConversation called EXACTLY ONCE with convId=conv_A (E-FIX: no double-persist)');

// 3.2 completeStatusMessage NOT called (if-branch uses manual cleanup + _renderCompletionDomOnly)
ok(inj3.state.completeStatusCalls.length === 0,
   'Part 3.2 -- completeStatusMessage NOT called (E-FIX: if-branch bypasses double-persist site)');

// 3.3 addCompletionMessage NOT called (its internal _persistMessage was the second-persist site)
ok(inj3.state.addCompletionCalls.length === 0,
   'Part 3.3 -- addCompletionMessage NOT called (E-FIX: avoids internal _persistMessage write to module-scope conversationId)');

// 3.4 _renderCompletionDomOnly called EXACTLY ONCE with text='A done'
ok(inj3.state.renderCalls.length === 1 && inj3.state.renderCalls[0].text === 'A done',
   'Part 3.4 -- _renderCompletionDomOnly called EXACTLY ONCE with text=A done');

// 3.5 currentStatusMessage.remove() called (manual cleanup)
ok(inj3.statusStubRef && inj3.statusStubRef.removeCount === 1,
   'Part 3.5 -- currentStatusMessage.remove() called EXACTLY ONCE (manual loader cleanup)');

// 3.6 setIdleState called with tabId=100 (per-tab routing)
ok(inj3.state.setIdleCalls.length === 1 && inj3.state.setIdleCalls[0].tabId === 100,
   'Part 3.6 -- setIdleState called EXACTLY ONCE with tabId=100 (originating tab routing)');

// 3.7 Tab A's _tabRunningMap entry now has isRunning:false
var tabA3 = inj3.tabRunningMap.get(100);
ok(tabA3 && tabA3.isRunning === false && tabA3.sessionId === null,
   'Part 3.7 -- Tab A per-tab entry flipped to isRunning:false');

// 3.8 Module-scope mirrors flipped to idle by setIdleState (target === active).
ok(inj3.state.moduleIsRunning === false,
   'Part 3.8a -- moduleIsRunning flipped to false (active tab idled)');
ok(inj3.state.moduleCurrentSessionId === null,
   'Part 3.8b -- moduleCurrentSessionId cleared to null');
ok(inj3.state.sendBtnDisabled === false,
   'Part 3.8c -- sendBtn re-enabled on active tab');

// 3.9 Tab B's entry untouched.
var tabB3 = inj3.tabRunningMap.get(200);
ok(tabB3 && tabB3.isRunning === true && tabB3.sessionId === 'sess_B',
   'Part 3.9 -- Tab B per-tab entry UNCHANGED (sess_B still running on its own tab)');

// =====================================================================
// Part 4 -- background-tab automationError routing
// =====================================================================
//
// Setup: Tab A active, sess_A running; Tab B has sess_B running in the
// background. Dispatch automationError for sess_B. The handler must flip
// Tab B's per-tab running state without rendering retry/error UI into Tab A.

console.log('\nPart 4 -- background-tab automationError routes to owning tab only:');

var inj4 = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' },
    { tabId: 200, isRunning: true, sessionId: 'sess_B' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: 'conv_A',
  sendBtnDisabled: true,
  currentStatusMessage: true,
  currentActionGroup: { fake: 'group' }
});

var dispatch4 = buildDispatcher(inj4);
try {
  dispatch4({
    action: 'automationError',
    sessionId: 'sess_B',
    tabId: 200,
    error: 'B failed',
    task: 'retry B'
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 4 dispatch threw:', err && err.message);
}

var tabB4 = inj4.tabRunningMap.get(200);
ok(tabB4 && tabB4.isRunning === false && tabB4.sessionId === 'sess_B',
   'Part 4.1 -- Tab B per-tab entry flipped to isRunning:false and keeps sessionId for error resolution');

var tabA4 = inj4.tabRunningMap.get(100);
ok(tabA4 && tabA4.isRunning === true && tabA4.sessionId === 'sess_A',
   'Part 4.2 -- Tab A per-tab entry UNCHANGED (active session still running)');

ok(inj4.state.setErrorCalls.length === 1 && inj4.state.setErrorCalls[0].tabId === 200,
   'Part 4.3 -- setErrorState called exactly once with tabId=200');

ok(inj4.state.moduleIsRunning === true,
   'Part 4.4a -- moduleIsRunning still true (active-tab UI not disturbed by background error)');
ok(inj4.state.moduleCurrentSessionId === 'sess_A',
   'Part 4.4b -- moduleCurrentSessionId still sess_A');
ok(inj4.state.sendBtnDisabled === true,
   'Part 4.4c -- sendBtn stays disabled for active session_A');

ok(inj4.state.completeStatusCalls.length === 0,
   'Part 4.5 -- completeStatusMessage NOT called for background-tab error');
ok(inj4.state.addMessageCalls.length === 0,
   'Part 4.6 -- addMessage NOT called for background-tab error');
ok(inj4.statusStubRef && inj4.statusStubRef.removeCount === 0,
   'Part 4.7 -- active currentStatusMessage.remove() NOT called for background-tab error');

try {
  dispatch4({
    action: 'automationError',
    sessionId: 'sess_B',
    tabId: 200,
    error: 'B failed again',
    task: 'retry B'
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 4 duplicate dispatch threw:', err && err.message);
}

ok(inj4.state.setErrorCalls.length === 1,
   'Part 4.8 -- duplicate background-tab automationError is ignored after the tab is no longer running');

// =====================================================================
// Part 6 -- conv-less completion routing (replay/legacy-loop fallback)
// =====================================================================
//
// A session-matched automationComplete that carries NO conversationId must
// resolve the module-scope fallback ONLY when the completed session IS the
// visible conversation's session. For any OTHER session (a conversation-less
// replay or a legacy path), the completion must NOT be persisted into the
// currently-visible conversation -- while the per-tab idle flip still runs.

console.log('\nPart 6 -- conv-less completion never persists into the visible conversation:');

var inj6 = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' },
    { tabId: 200, isRunning: true, sessionId: 'sess_B' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: 'conv_A',
  sendBtnDisabled: true,
  currentStatusMessage: true,
  currentActionGroup: { fake: 'group' }
});

var dispatch6 = buildDispatcher(inj6);
try {
  dispatch6({
    action: 'automationComplete',
    sessionId: 'sess_B',
    tabId: 200,
    result: 'replay done',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 6 dispatch threw:', err && err.message);
}

ok(inj6.state.persistCalls.length === 0,
   'Part 6.1 -- a conv-less completion for a NON-current session persists NOTHING (never into the visible conv_A)');
var tabB6 = inj6.tabRunningMap.get(200);
ok(tabB6 && tabB6.isRunning === false && tabB6.sessionId === null,
   'Part 6.2 -- the per-tab idle flip still runs for the originating tab');
ok(inj6.state.renderCalls.length === 0,
   'Part 6.3 -- no completion bubble rendered into the visible conversation');

// The module-scope fallback stays valid for the VISIBLE session: a conv-less
// completion for the current session still persists into the active conv.
var inj6b = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: 'conv_A',
  sendBtnDisabled: true,
  currentStatusMessage: false,
  currentActionGroup: null
});

var dispatch6b = buildDispatcher(inj6b);
try {
  dispatch6b({
    action: 'automationComplete',
    sessionId: 'sess_A',
    tabId: 100,
    result: 'A done (legacy broadcast, no convId)',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 6b dispatch threw:', err && err.message);
}

ok(inj6b.state.persistCalls.length === 1 && inj6b.state.persistCalls[0].convId === 'conv_A',
   'Part 6.4 -- a conv-less completion for the CURRENT session still falls back to the visible conv (module-scope fallback preserved)');

// Review finding #2: when the visible tab is UNMINTED (module conv is null), a
// FOREIGN background session's conv-less completion must NOT render into it.
// Pre-fix, originatingConvId (null) === conversationId (null) made
// isOriginatingActive true and painted another session's bubble into the
// current tab. The identity guard (originatingConvId !== null ||
// request.sessionId === currentSessionId) closes it.
var inj6c = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' },
    { tabId: 200, isRunning: true, sessionId: 'sess_B' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: null,
  sendBtnDisabled: true,
  currentStatusMessage: true,
  currentActionGroup: { fake: 'group' }
});

var dispatch6c = buildDispatcher(inj6c);
try {
  dispatch6c({
    action: 'automationComplete',
    sessionId: 'sess_B',
    tabId: 200,
    result: 'background done, no convId',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 6c dispatch threw:', err && err.message);
}

ok(inj6c.state.renderCalls.length === 0,
   'Part 6.5 -- foreign conv-less completion does NOT render into an UNMINTED visible tab (null===null guard)');
ok(inj6c.state.persistCalls.length === 0,
   'Part 6.6 -- foreign conv-less completion persists nothing when the visible tab is unminted');

// The guard must PRESERVE the legitimate case: the CURRENT session completing
// in an unminted tab still renders its bubble (both convIds null, but the
// session IS the visible one).
var inj6d = makeInjection({
  tabEntries: [
    { tabId: 100, isRunning: true, sessionId: 'sess_A' }
  ],
  activeTabId: 100,
  moduleIsRunning: true,
  moduleCurrentSessionId: 'sess_A',
  moduleConversationId: null,
  sendBtnDisabled: true,
  currentStatusMessage: true,
  currentActionGroup: { fake: 'group' }
});

var dispatch6d = buildDispatcher(inj6d);
try {
  dispatch6d({
    action: 'automationComplete',
    sessionId: 'sess_A',
    tabId: 100,
    result: 'current session done in unminted tab',
    partial: false
  });
} catch (err) {
  failed++;
  console.error('  FAIL: Part 6d dispatch threw:', err && err.message);
}

ok(inj6d.state.renderCalls.length === 1,
   'Part 6.7 -- the CURRENT session still renders its completion in an unminted visible tab (guard preserves it)');

// =====================================================================
// Part 5 -- pre-Task-1 regression sanity (informational comment)
// =====================================================================
//
// The assertions in Part 2 would have FAILED against pre-Task-1 sidepanel.js
// because the outer bail at L2334 + the strict `if (request.sessionId === currentSessionId)`
// at L2340 together dropped the entire body for background-tab completions:
// no per-tab map update, no persistence. Specifically:
//
//   Part 2.1 (persist called with convId=conv_B) would FAIL -- persist never fires
//   Part 2.3 (Tab B per-tab entry flipped) would FAIL -- entry stays isRunning:true
//   Part 2.9 (setIdleState called with tabId=200) would FAIL -- setIdleState never fires
//
// Assertion 3.1 (exactly one persist) would have FAILED -- pre-fix the active-tab
// path persisted via _persistMessageToConversation AND again via the
// completeStatusMessage -> addCompletionMessage -> _persistMessage chain
// (line 1775 in pre-Task-1 sidepanel.js).
//
// No actual pre-fix reproduction code -- the comment block above documents
// the regression coverage. The presence of the assertions above in green
// state proves the fix is in place.

console.log('\nPart 5 -- pre-Task-1 regression coverage (informational):');
console.log('  Part 2 assertions would have FAILED against pre-Task-1 sidepanel.js');
console.log('  (outer bail + strict-match dropped entire body for background tabs).');
console.log('  Part 3.1 would have FAILED -- pre-fix double-persist via');
console.log('  completeStatusMessage -> addCompletionMessage -> _persistMessage chain.');

// =====================================================================
// Summary
// =====================================================================

console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
process.exit(failed === 0 ? 0 : 1);
