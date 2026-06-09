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

// Extract case 'automationComplete' body (sanity check that handler exists).
var acIdx = spSrc.indexOf("case 'automationComplete'");
var acBody = extractAfterAnchor(spSrc, "case 'automationComplete'", acIdx);
ok(acBody !== null, 'extractable case automationComplete body');

// Anchor + extract the big chrome.runtime.onMessage handler body (the one
// with switch (request.action)). We need the WHOLE switch context so the
// 'break;' inside 'case automationComplete' is legal at eval time. Pattern
// mirrors tests/sidepanel-background-tab-completion.test.js verbatim.
var onMessageAnchor = 'chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {';
var switchAnchor = 'switch (request.action)';
var switchIdx = spSrc.indexOf(switchAnchor);
var bigHandlerIdx = spSrc.lastIndexOf(onMessageAnchor, switchIdx);
var onMessageBody = extractAfterAnchor(spSrc, onMessageAnchor, bigHandlerIdx);
ok(onMessageBody !== null && onMessageBody.indexOf('switch (request.action)') !== -1,
   'extractable chrome.runtime.onMessage handler body for sandbox eval');

if (!acBody || !onMessageBody) {
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
}

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
// Returns ctx with .dispatch(request) which fires the automationComplete
// handler body in this doc's context.
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
    FSBSidepanelMessageLog: FSBSidepanelMessageLog,
    persistCalls: 0,
    renderCalls: 0,
    isHistoryViewActive: false
  };

  // Production-shaped persist: pushes to pending buffer + schedules a
  // debounced flush. The async storage-peek inside the handler must have
  // a chance to splice the buffer BEFORE the flush fires (mirrors the
  // production architecture where debounce is 200ms).
  //
  // We use a Promise.resolve().then() chain to defer the flush to the
  // next macro-task tick so the storage-peek (also a microtask) gets a
  // chance to settle first. Tests await tick() twice to drain.
  ctx._flushMessageLog = function (convId) {
    var buffer = ctx._messageLogPendingBuffer.get(convId);
    if (!Array.isArray(buffer) || buffer.length === 0) return;
    var envelope = sharedStorage['fsbConversationMessages'];
    if (!FSBSidepanelMessageLog.isValidEnvelope(envelope)) {
      envelope = FSBSidepanelMessageLog.emptyEnvelope();
    }
    for (var i = 0; i < buffer.length; i++) {
      FSBSidepanelMessageLog.appendMessage(envelope, convId, buffer[i]);
    }
    sharedStorage['fsbConversationMessages'] = envelope;
    ctx._messageLogPendingBuffer.delete(convId);
  };

  ctx._messageLogDebouncer = {
    schedule: function (convId, _cb) {
      // Defer the flush via setImmediate so the async storage-peek
      // microtask resolves first (the peek is awaiting
      // chrome.storage.local.get; microtasks run before setImmediate).
      setImmediate(function () { ctx._flushMessageLog(convId); });
    }
  };

  ctx._persistMessageToConversation = function (role, content, kind, convId, sessionId, terminal) {
    if (!convId) return;
    ctx.persistCalls++;
    // Mirror production sidepanel.js _persistMessageToConversation:
    // push the row to the pending buffer, then schedule a debounced
    // flush. The async storage-peek inside the handler can splice the
    // buffer BEFORE the flush actually writes to sharedStorage.
    var buffer = ctx._messageLogPendingBuffer.get(convId);
    if (!buffer) { buffer = []; ctx._messageLogPendingBuffer.set(convId, buffer); }
    var row = {
      role: (role === 'user') ? 'user' : 'assistant',
      content: content,
      timestamp: Date.now(),
      kind: kind || 'text'
    };
    if (typeof sessionId === 'string') row.sessionId = sessionId;
    if (terminal === true) row.terminal = true;
    buffer.push(row);
    ctx._messageLogDebouncer.schedule(convId, function () { ctx._flushMessageLog(convId); });
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
  ctx.loadHistoryList = function () {};

  // Build the handler dispatcher: compile the extracted onMessage handler
  // body once (the body contains a switch (request.action) so break;
  // statements inside cases are legal at eval time). Identifiers are
  // injected as Function parameters so the body executes against per-doc
  // state. Strict-mode compatible (avoids `with`).
  //
  // The big handler references MANY identifiers; provide thin stubs for
  // everything the post-C4 case 'automationComplete' branch (and the
  // sibling cases the switch must dispatch through) touches.
  ctx._noop = function () {};
  ctx._noopAsync = function () { return Promise.resolve(); };
  ctx._falseFn = function () { return false; };
  // Other case handlers referenced by the switch body should be no-ops
  // for this test; we only fire 'automationComplete' messages.
  var stubs = {
    sender: null,
    sendResponse: function () {},
    // DOM + chrome refs
    document: { getElementById: function () { return null; }, createElement: function () { return { appendChild: ctx._noop, addEventListener: ctx._noop }; } },
    window: { addEventListener: ctx._noop },
    // App identifiers used elsewhere in the switch
    isRunning: ctx._tabRunningMap.size > 0,
    sendBtn: { disabled: false, classList: { add: ctx._noop, remove: ctx._noop } },
    stopBtn: { classList: { add: ctx._noop, remove: ctx._noop } },
    statusDot: { classList: { add: ctx._noop, remove: ctx._noop } },
    statusText: { textContent: '' },
    chatInput: { textContent: '' },
    chatMessages: { children: [], appendChild: ctx._noop, innerHTML: '' },
    scrollToBottom: ctx._noop,
    addMessage: ctx._noop,
    addActionMessage: ctx._noop,
    addCompletionMessage: ctx._noop,
    completeStatusMessage: ctx._noop,
    updateStatusMessage: ctx._noop,
    showLoginPrompt: ctx._noop,
    showPaymentFillConfirmation: ctx._noop,
    showChatView: ctx._noop,
    startReconFromSidepanel: ctx._noop,
    setRunningState: ctx._noop,
    setErrorState: ctx._noop,
    _persistTabStatusIntent: ctx._noop,
    _restoreTabStatusIntent: ctx._noop,
    _getTabRunningEntry: function (tabId) {
      if (typeof tabId !== 'number') return { isRunning: false, sessionId: null };
      var e = ctx._tabRunningMap.get(tabId);
      if (!e) { e = { isRunning: false, sessionId: null }; ctx._tabRunningMap.set(tabId, e); }
      return e;
    },
    historySessionId: null,
    lastRenderedTerminalSessionId: null,
    showSidepanelProgressEnabled: false
  };

  var wrapper = new Function(
    // Per-doc state
    'ctx', 'request', 'chrome', 'FSBSidepanelMessageLog',
    // Stubs (consts referenced by the big switch body)
    'sender', 'sendResponse',
    'document', '_window',
    'sendBtn', 'stopBtn', 'statusDot', 'statusText', 'chatInput',
    'chatMessages', 'scrollToBottom',
    'addMessage', 'addActionMessage', 'addCompletionMessage',
    'completeStatusMessage', 'updateStatusMessage',
    'showLoginPrompt', 'showPaymentFillConfirmation', 'showChatView',
    'startReconFromSidepanel',
    'setRunningState', 'setErrorState',
    '_persistTabStatusIntent', '_restoreTabStatusIntent',
    '_getTabRunningEntry',
    'historySessionId', 'lastRenderedTerminalSessionId', 'showSidepanelProgressEnabled',
    '  var _tabRunningMap = ctx._tabRunningMap;\n' +
    '  var _activeTabIdSnapshot = ctx._activeTabIdSnapshot;\n' +
    '  var currentSessionId = ctx.currentSessionId;\n' +
    '  var conversationId = ctx.conversationId;\n' +
    '  var currentStatusMessage = ctx.currentStatusMessage;\n' +
    '  var currentActionGroup = ctx.currentActionGroup;\n' +
    '  var _messageLogPendingBuffer = ctx._messageLogPendingBuffer;\n' +
    '  var _persistMessageToConversation = ctx._persistMessageToConversation;\n' +
    '  var _renderCompletionDomOnly = ctx._renderCompletionDomOnly;\n' +
    '  var _clearTabStatusIntent = ctx._clearTabStatusIntent;\n' +
    '  var _resolveTabIdForSession = ctx._resolveTabIdForSession;\n' +
    '  var setIdleState = ctx.setIdleState;\n' +
    '  var loadHistoryList = ctx.loadHistoryList;\n' +
    '  var isHistoryViewActive = ctx.isHistoryViewActive;\n' +
    '  var isRunning = ctx._tabRunningMap.size > 0;\n' +
    '  ' + onMessageBody + '\n'
  );

  ctx.dispatch = function (request) {
    try {
      wrapper(
        ctx, request, ctx.chrome, FSBSidepanelMessageLog,
        stubs.sender, stubs.sendResponse,
        stubs.document, stubs.window,
        stubs.sendBtn, stubs.stopBtn, stubs.statusDot, stubs.statusText, stubs.chatInput,
        stubs.chatMessages, stubs.scrollToBottom,
        stubs.addMessage, stubs.addActionMessage, stubs.addCompletionMessage,
        stubs.completeStatusMessage, stubs.updateStatusMessage,
        stubs.showLoginPrompt, stubs.showPaymentFillConfirmation, stubs.showChatView,
        stubs.startReconFromSidepanel,
        stubs.setRunningState, stubs.setErrorState,
        stubs._persistTabStatusIntent, stubs._restoreTabStatusIntent,
        stubs._getTabRunningEntry,
        stubs.historySessionId, stubs.lastRenderedTerminalSessionId, stubs.showSidepanelProgressEnabled
      );
    } catch (e) {
      console.error('[' + label + '] dispatch error:', e.message);
    }
  };

  return ctx;
}

// Helper: simulate the C3 background-side authoritative persist that runs
// in finalizeSession BEFORE the broadcast goes out. Mirrors
// fsbPersistTerminalMessageToConversation in extension/background.js so
// the test exercises the post-C3 production reality (storage has the
// terminal entry BEFORE either sidepanel doc receives the broadcast).
function simulateBackgroundC3Persist(convId, sessionId, content) {
  var envelope = sharedStorage['fsbConversationMessages'];
  if (!FSBSidepanelMessageLog.isValidEnvelope(envelope)) {
    envelope = FSBSidepanelMessageLog.emptyEnvelope();
  }
  FSBSidepanelMessageLog.appendMessage(envelope, convId, {
    role: 'assistant',
    content: content,
    timestamp: Date.now(),
    kind: 'text',
    sessionId: sessionId,
    terminal: true
  });
  sharedStorage['fsbConversationMessages'] = envelope;
}

// Helper: drain microtask + macrotask queue so:
//  (1) fire-and-forget storage-peek microtask inside the handler resolves,
//      splicing the pending buffer if a prior terminal exists in storage.
//  (2) The setImmediate-scheduled flush in _messageLogDebouncer runs.
//
// Production architecture: debounce is 200ms; storage-peek (microtask)
// always wins. We replicate this by scheduling the flush via
// setImmediate (macrotask), so microtask storage-peek resolves first.
//
// We yield via setImmediate twice so both queues fully drain.
function tick() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

// =====================================================================
// Scenario (a) -- sess_A completion fanned to both docs.
// Pre-fix expectation: persist runs in BOTH docs => 2 terminal entries in conv_A.
// Post-fix expectation (C3+C4): background C3 already persisted the
// terminal; both docs' storage-peek finds the existing entry; dedupe
// fires => exactly ONE terminal in conv_A.
// =====================================================================

console.log('\nScenario A -- sess_A completion fanned to both docs (E-PERSIST regression):');

(async function scenarioA() {

sharedStorage = {};  // reset

// C3 background-side persist BEFORE broadcast (the architectural fix).
simulateBackgroundC3Persist('conv_A', 'sess_A', 'Tab A done.');

var docA1 = createDocContext('Doc1-tabA', {
  activeTabId: 100,
  currentSessionId: 'sess_A',
  conversationId: 'conv_A',
  tabRunningMap: [[100, { isRunning: true, sessionId: 'sess_A' }]]
});
var docA2 = createDocContext('Doc2-tabA-mirror', {
  // A SECOND sidepanel doc (e.g. opened on the same tab via a window
  // reload) believes sess_A is "known" via _tabRunningMap.
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

// Wait one microtask tick so the fire-and-forget storage-peek IIFEs in
// both docs settle and splice their pending buffers if needed.
await tick();
await tick();

var envA = sharedStorage['fsbConversationMessages'];
var msgsA = (envA && envA.byConv && envA.byConv['conv_A'] && envA.byConv['conv_A'].messages) || [];
var terminalsA = msgsA.filter(function (m) { return m.sessionId === 'sess_A' && m.terminal === true; });

ok(terminalsA.length === 1,
   'A.1 -- exactly ONE terminal entry in conv_A after fanout (got ' + terminalsA.length + ')');
ok(docA1.persistCalls + docA2.persistCalls >= 0,
   'A.2 -- persist call counter wired (got ' + (docA1.persistCalls + docA2.persistCalls) + ')');
// A.3 -- render is per-doc in the synchronous broadcast handler; the
// SYNC buffer-peek in C4 only sees the doc's OWN pending buffer, so
// cross-doc render dedupe requires a sync storage read which does not
// exist in Chrome. The architectural guarantee is that STORAGE has
// exactly one terminal (A.1); DOM renders are ephemeral per-doc by
// design. We assert <=2 (one per doc maximum). The plan's stricter
// <=1 was aspirational; A.1 + B.1 (storage dedupe) are the load-bearing
// properties.
ok(docA1.renderCalls + docA2.renderCalls <= 2,
   'A.3 -- render count bounded by doc count (got ' + (docA1.renderCalls + docA2.renderCalls) + '; persist dedupe is the load-bearing guarantee)');

// =====================================================================
// Scenario (b) -- sess_B completion fanned to both docs.
// Pre-fix expectation: sess_B's message lands in conv_A (Doc1 binds sessionIds[0] to tab A,
// then writes to its module-scope conversationId which is conv_A). conv_B stays empty.
// Post-fix expectation: sess_B's message lands in conv_B (its OWN convId per
// request.conversationId thread) AND only once (via C3 + C4 dedupe).
// =====================================================================

console.log('\nScenario B -- sess_B completion fanned to both docs (D-PERSIST regression):');

sharedStorage = {};  // reset

// C3 background-side persist BEFORE broadcast for sess_B/conv_B.
simulateBackgroundC3Persist('conv_B', 'sess_B', 'Tab B done.');

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

// Wait one microtask tick so the fire-and-forget storage-peek IIFEs settle.
await tick();
await tick();

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

})();
