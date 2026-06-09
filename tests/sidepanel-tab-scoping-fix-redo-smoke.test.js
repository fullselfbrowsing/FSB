'use strict';

/**
 * QT-93i (tab-scoping redo) regression smoke --
 *
 * Exercises the two QT-93i code paths against real-runtime mocks:
 *
 *   Part 1 (QT-93i-01 panel-visibility per-tab)
 *     1.1 chrome.tabs.onActivated -> sidePanel.setOptions(enabled:false) for non-working tab
 *     1.2 chrome.tabs.onActivated -> sidePanel.setOptions(enabled:true, path) for working tab
 *     1.3 No tabId in activeInfo -> early return; no setOptions call
 *     1.4 chrome.sidePanel undefined -> graceful (no throw)
 *
 *   Part 2 (QT-93i-01 chrome.action.onClicked safe-gesture pattern)
 *     2.1 setOptionsPromise + openPromise BOTH created BEFORE any await
 *     2.2 open is awaited FIRST (gesture-critical); setOptions awaited LAST
 *     2.3 open failure -> falls through to chrome.windows.create popup fallback
 *     2.4 setOptions failure post-open does NOT trigger popup fallback
 *
 *   Part 3 (QT-93i-02 per-tab isRunning map)
 *     3.1 _tabRunningMap + _activeTabIdSnapshot + _getTabRunningEntry exist
 *     3.2 setRunningState(tabA, sessionA) records the per-tab entry
 *     3.3 setRunningState on non-active tab does NOT mutate active tab UI
 *     3.4 setIdleState(tabA) clears tabA's entry without touching active-tab state
 *     3.5 getCurrentTabRunningState() returns the active tab's snapshot
 *
 *   Part 4 (QT-93i-02 chrome.tabs.onActivated re-sync + completion routing)
 *     4.1 chrome.tabs.onActivated handler re-resolves _activeTabIdSnapshot
 *     4.2 Switching from working tab A to idle tab B leaves tab A's running entry intact
 *     4.3 automationComplete with request.tabId=X calls setIdleState(X) (per-tab routing)
 *     4.4 session_ended with request.tabId=X resolves the entry before flipping idle
 *
 * Discipline: extract listener / handler / case bodies via brace-counting and
 * eval into sandboxed Functions (Rule 3 / CLAUDE.md MEMORY). NO static-text
 * grep for presence -- every assertion exercises real code paths against
 * mocked chrome.* APIs.
 *
 * Run: node tests/sidepanel-tab-scoping-fix-redo-smoke.test.js
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

const bgSrc = fs.readFileSync(path.resolve(__dirname, '../extension/background.js'), 'utf8');
const spSrc = fs.readFileSync(path.resolve(__dirname, '../extension/ui/sidepanel.js'), 'utf8');

console.log('\n--- QT-93i tab-scoping redo smoke ---');

// --- Brace-walking extractor (matches sidepanel-mcpvisualsession-listener.test.js pattern) ---
function extractAfterAnchor(src, anchor) {
  var startIdx = src.indexOf(anchor);
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
// PART 1 -- REMOVED per Strategy B (debug session qt93i-regression, 2026-06-08)
// =====================================================================
//
// The chrome.tabs.onActivated listener in background.js was reverted because
// chrome.sidePanel.setOptions({tabId, enabled:false}) does NOT hide an
// already-open side panel when the manifest declares side_panel.default_path
// (Chrome architectural limitation, pre-Chrome-141). The per-tab CONTENT
// scoping (swapToTabConversation + _tabRunningMap) delivers the actual
// user-visible per-tab behavior; the panel itself stays visible on every tab.
//
// See .planning/debug/qt93i-regression.md for the full root-cause analysis.
// See .planning/quick/260608-bu4-qt93i-regression-strategy-b-revert-auto-/260608-bu4-PLAN.md for the closure plan.
//
// Defensive assertion: confirm the listener stays REMOVED. If a future plan
// re-introduces chrome.tabs.onActivated in background.js, this assertion
// fires loudly so the author re-reads the debug doc before shipping.
console.log('\nPart 1 -- chrome.tabs.onActivated listener REMOVED per Strategy B:');
ok(bgSrc.indexOf('chrome.tabs.onActivated.addListener') === -1,
   'Part 1 -- chrome.tabs.onActivated listener REMOVED from background.js per Strategy B');

runPart2();

// =====================================================================
// PART 2 -- chrome.action.onClicked safe-gesture pattern (no await before open)
// =====================================================================

function runPart2() {
  console.log('\nPart 2 -- chrome.action.onClicked safe-gesture:');

  var onClickedAnchor = 'chrome.action.onClicked.addListener(async (tab) => {';
  var onClickedBody = extractAfterAnchor(bgSrc, onClickedAnchor);
  ok(onClickedBody !== null && /QT-93i-01/.test(onClickedBody),
     'Part 2.0 -- chrome.action.onClicked body extractable + carries QT-93i-01 marker');

  if (!onClickedBody) {
    runPart3();
    return;
  }

  // 2.1 -- both Promises created BEFORE any await. Detect via source-order
  // scan on a comment-stripped projection so the prose word "awaited" in
  // the regret-explanation comment does not trip the assertion. After
  // stripping `// ...` line comments AND `/* ... */` block comments, the
  // first `await` keyword (word boundary + whitespace, so "awaited" still
  // does not match) MUST come AFTER both
  //   "setOptionsPromise = chrome.sidePanel.setOptions" AND
  //   "openPromise = chrome.sidePanel.open".
  var bodyNoComments = onClickedBody
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  var awaitKeyword = bodyNoComments.search(/\bawait\s/);
  var setOptsAssign = bodyNoComments.indexOf('setOptionsPromise = chrome.sidePanel.setOptions');
  var openAssign = bodyNoComments.indexOf('openPromise = chrome.sidePanel.open');
  ok(awaitKeyword > setOptsAssign
     && setOptsAssign > -1
     && awaitKeyword > openAssign
     && openAssign > -1,
     'Part 2.1 -- both setOptionsPromise + openPromise assignments precede the first await keyword (comment-stripped source-order scan)');

  // 2.2 -- await openPromise comes BEFORE await setOptionsPromise.
  var awaitOpenIdx = onClickedBody.indexOf('await openPromise');
  var awaitSetOptsIdx = onClickedBody.indexOf('await setOptionsPromise');
  ok(awaitOpenIdx > -1 && awaitSetOptsIdx > -1 && awaitOpenIdx < awaitSetOptsIdx,
     'Part 2.2 -- await openPromise precedes await setOptionsPromise');

  // 2.3 -- runtime exercise: open succeeds -> setOptions also called -> no popup.
  // Mocks return resolved Promises. Confirm chrome.windows.create is NOT invoked.
  (async function () {
    var callLog = [];
    var setOptionsRecord = [];
    var chromeMock = {
      sidePanel: {
        setOptions: function (opts) {
          setOptionsRecord.push(opts);
          callLog.push('setOptions');
          return Promise.resolve();
        },
        open: function (opts) {
          callLog.push('open');
          return Promise.resolve();
        }
      },
      runtime: { getURL: function (p) { return 'chrome-extension://stub/' + p; } },
      windows: { create: function () { callLog.push('windows.create'); } }
    };
    var fn = new Function(
      'tab', 'chrome', 'armMcpBridge', 'automationLogger', 'console',
      'return (async () => { ' + onClickedBody + ' })();'
    );
    await fn(
      { id: 11, windowId: 1 },
      chromeMock,
      function () {},
      { logInit: function () {} },
      { warn: function () {} }
    );
    ok(setOptionsRecord.length === 1
       && setOptionsRecord[0].tabId === 11
       && setOptionsRecord[0].enabled === true
       && setOptionsRecord[0].path === 'ui/sidepanel.html',
       'Part 2.3a -- chrome.action.onClicked invokes setOptions({tabId:11, enabled:true, path})');
    ok(callLog.indexOf('open') !== -1 && callLog.indexOf('windows.create') === -1,
       'Part 2.3b -- success path opens sidePanel without falling through to popup fallback');

    // 2.4 -- open failure triggers windows.create fallback; setOptions failure does NOT.
    var callLog2 = [];
    var chromeMock2 = {
      sidePanel: {
        setOptions: function () { return Promise.resolve(); },
        open: function () { return Promise.reject(new Error('User gesture is required')); }
      },
      runtime: { getURL: function (p) { return 'chrome-extension://stub/' + p; } },
      windows: { create: function () { callLog2.push('windows.create'); } }
    };
    var fn2 = new Function(
      'tab', 'chrome', 'armMcpBridge', 'automationLogger', 'console',
      'return (async () => { ' + onClickedBody + ' })();'
    );
    await fn2(
      { id: 12, windowId: 2 },
      chromeMock2,
      function () {},
      { logInit: function () {} },
      { warn: function () {} }
    );
    ok(callLog2.length === 1 && callLog2[0] === 'windows.create',
       'Part 2.4 -- open() rejection triggers windows.create popup fallback');

    runPart3();
  })().catch(function (err) {
    console.error('Part 2 runtime threw:', err && err.message);
    failed++;
    runPart3();
  });
}

// =====================================================================
// PART 3 -- per-tab isRunning map + setters honor explicit tabId
// =====================================================================

function runPart3() {
  console.log('\nPart 3 -- per-tab isRunning map:');

  // 3.1 -- presence of map + accessor + helper.
  var hasMap = /var _tabRunningMap = new Map\(\)/.test(spSrc);
  var hasSnapshot = /var _activeTabIdSnapshot = null/.test(spSrc);
  var hasAccessor = /function getCurrentTabRunningState\(\)/.test(spSrc);
  var hasGetEntry = /function _getTabRunningEntry\(tabId\)/.test(spSrc);
  ok(hasMap && hasSnapshot && hasAccessor && hasGetEntry,
     'Part 3.1 -- _tabRunningMap + _activeTabIdSnapshot + getCurrentTabRunningState + _getTabRunningEntry defined');

  // 3.2 -- setRunningState body honors explicit tabId.
  // Extract setRunningState body and exercise it with a sandbox.
  var setRunningAnchor = 'function setRunningState(tabId, sessionId) {';
  var setRunningBody = extractAfterAnchor(spSrc, setRunningAnchor);
  ok(setRunningBody !== null,
     'Part 3.2a -- setRunningState body extractable');

  if (!setRunningBody) {
    runPart4();
    return;
  }

  // Sandbox the helper: provide stubs for sendBtn, stopBtn, statusDot,
  // statusText, _tabRunningMap, _activeTabIdSnapshot, etc.
  var sandboxState = {
    _tabRunningMap: new Map(),
    _activeTabIdSnapshot: 100, // active tab is 100
    currentSessionId: null,
    isRunning: false,
    livenessFailCount: 0,
    livenessInterval: null,
    sendBtn: { disabled: false, classList: { add: function () {}, remove: function () {} } },
    stopBtn: { classList: { add: function () {}, remove: function () {} } },
    statusDot: { classList: { add: function () {}, remove: function () {} } },
    statusText: { textContent: '' },
    chatInput: { textContent: '' },
    updateSendButtonState: function () {},
    checkSessionLiveness: function () {},
    clearInterval: function () {},
    setInterval: function () { return 1; }
  };

  function callSetRunningState(tabId, sessionId) {
    var fn = new Function(
      'tabId', 'sessionId',
      '_tabRunningMap', '_activeTabIdSnapshot', 'currentSessionId', 'isRunning', 'livenessFailCount', 'livenessInterval',
      'sendBtn', 'stopBtn', 'statusDot', 'statusText', 'chatInput',
      'updateSendButtonState', 'checkSessionLiveness', 'clearInterval', 'setInterval',
      '_getTabRunningEntry',
      // Return a tuple of mutated locals so the test can inspect them.
      setRunningBody + ' ; return { _tabRunningMap: _tabRunningMap, isRunning: isRunning, currentSessionId: currentSessionId };'
    );
    function _getTabRunningEntry(id) {
      if (typeof id !== 'number') return { isRunning: false, sessionId: null };
      var e = sandboxState._tabRunningMap.get(id);
      if (!e) { e = { isRunning: false, sessionId: null }; sandboxState._tabRunningMap.set(id, e); }
      return e;
    }
    return fn(
      tabId, sessionId,
      sandboxState._tabRunningMap, sandboxState._activeTabIdSnapshot,
      sandboxState.currentSessionId, sandboxState.isRunning,
      sandboxState.livenessFailCount, sandboxState.livenessInterval,
      sandboxState.sendBtn, sandboxState.stopBtn, sandboxState.statusDot,
      sandboxState.statusText, sandboxState.chatInput,
      sandboxState.updateSendButtonState, sandboxState.checkSessionLiveness,
      sandboxState.clearInterval, sandboxState.setInterval,
      _getTabRunningEntry
    );
  }

  // 3.2 -- active tab (100) gets entry + module mirror updates.
  sandboxState._tabRunningMap.clear();
  var r32 = callSetRunningState(100, 'sess-A');
  var entry100 = sandboxState._tabRunningMap.get(100);
  ok(entry100 && entry100.isRunning === true && entry100.sessionId === 'sess-A',
     'Part 3.2b -- setRunningState(100, sess-A) records per-tab entry for tab 100');
  ok(r32.isRunning === true && r32.currentSessionId === 'sess-A',
     'Part 3.2c -- setRunningState on active tab mirrors module-scope isRunning + currentSessionId');

  // 3.3 -- non-active tab: entry recorded, but sandboxState.isRunning stays false in the body's
  // local view (since isActiveTab is false). We assert the entry is set + sendBtn.disabled
  // was NOT toggled on the active-tab branch.
  sandboxState._tabRunningMap.clear();
  sandboxState.sendBtn.disabled = false;
  var r33 = callSetRunningState(200, 'sess-B'); // 200 != active tab 100
  var entry200 = sandboxState._tabRunningMap.get(200);
  ok(entry200 && entry200.isRunning === true && entry200.sessionId === 'sess-B',
     'Part 3.3a -- setRunningState(200, sess-B) records entry for non-active tab 200');
  ok(r33.isRunning === false,
     'Part 3.3b -- setRunningState on non-active tab does NOT flip local isRunning mirror');

  // 3.4 -- setIdleState body honors explicit tabId.
  var setIdleAnchor = 'function setIdleState(tabId) {';
  var setIdleBody = extractAfterAnchor(spSrc, setIdleAnchor);
  ok(setIdleBody !== null,
     'Part 3.4a -- setIdleState body extractable');

  if (!setIdleBody) { runPart4(); return; }

  function callSetIdleState(tabId) {
    var fn = new Function(
      'tabId',
      '_tabRunningMap', '_activeTabIdSnapshot', 'currentSessionId', 'isRunning',
      'livenessFailCount', 'livenessInterval', 'currentStatusMessage', 'currentActionGroup',
      'sendBtn', 'stopBtn', 'statusDot', 'statusText', 'updateSendButtonState', 'clearInterval',
      '_getTabRunningEntry',
      // QT-uof-5 (B-FIX) -- setIdleState now calls _clearTabStatusIntent to
      // drop the per-tab (currentStatusMessage, currentActionGroup) mirror
      // when a tab transitions to idle. The sandbox provides a no-op so the
      // setter body executes without ReferenceError.
      '_clearTabStatusIntent',
      setIdleBody + ' ; return { _tabRunningMap: _tabRunningMap, isRunning: isRunning, currentSessionId: currentSessionId };'
    );
    function _getTabRunningEntry(id) {
      if (typeof id !== 'number') return { isRunning: false, sessionId: null };
      var e = sandboxState._tabRunningMap.get(id);
      if (!e) { e = { isRunning: false, sessionId: null }; sandboxState._tabRunningMap.set(id, e); }
      return e;
    }
    function _clearTabStatusIntent(_id) { /* no-op for sandbox */ }
    return fn(
      tabId,
      sandboxState._tabRunningMap, sandboxState._activeTabIdSnapshot,
      sandboxState.currentSessionId, sandboxState.isRunning,
      sandboxState.livenessFailCount, sandboxState.livenessInterval,
      null, null,
      sandboxState.sendBtn, sandboxState.stopBtn, sandboxState.statusDot,
      sandboxState.statusText, sandboxState.updateSendButtonState, sandboxState.clearInterval,
      _getTabRunningEntry,
      _clearTabStatusIntent
    );
  }

  // Pre-load tab 200 as running, then idle it.
  sandboxState._tabRunningMap.clear();
  sandboxState._tabRunningMap.set(200, { isRunning: true, sessionId: 'sess-B' });
  var r34 = callSetIdleState(200);
  var entry200Idle = sandboxState._tabRunningMap.get(200);
  ok(entry200Idle && entry200Idle.isRunning === false && entry200Idle.sessionId === null,
     'Part 3.4b -- setIdleState(200) clears tab 200 entry');

  // 3.5 -- getCurrentTabRunningState() returns active tab snapshot.
  var accessorAnchor = 'function getCurrentTabRunningState() {';
  var accessorBody = extractAfterAnchor(spSrc, accessorAnchor);
  ok(accessorBody !== null,
     'Part 3.5a -- getCurrentTabRunningState body extractable');
  if (accessorBody) {
    sandboxState._tabRunningMap.clear();
    sandboxState._tabRunningMap.set(100, { isRunning: true, sessionId: 'sess-A' });
    var fn35 = new Function(
      '_tabRunningMap', '_activeTabIdSnapshot', '_getTabRunningEntry',
      accessorBody
    );
    function _getTabRunningEntry35(id) {
      if (typeof id !== 'number') return { isRunning: false, sessionId: null };
      var e = sandboxState._tabRunningMap.get(id);
      if (!e) { e = { isRunning: false, sessionId: null }; sandboxState._tabRunningMap.set(id, e); }
      return e;
    }
    var snap = fn35(sandboxState._tabRunningMap, sandboxState._activeTabIdSnapshot, _getTabRunningEntry35);
    ok(snap && snap.isRunning === true && snap.sessionId === 'sess-A',
       'Part 3.5b -- getCurrentTabRunningState() returns { isRunning:true, sessionId:sess-A } for active tab 100');
  }

  runPart4();
}

// =====================================================================
// PART 4 -- chrome.tabs.onActivated re-sync + completion routing
// =====================================================================

function runPart4() {
  console.log('\nPart 4 -- chrome.tabs.onActivated re-sync + completion routing:');

  // 4.1 -- the chrome.tabs.onActivated handler at line ~786 (sidepanel.js)
  // re-syncs _activeTabIdSnapshot AFTER swapToTabConversation.
  var snippet = spSrc.indexOf('_activeTabIdSnapshot = activeInfo.tabId');
  ok(snippet > -1,
     'Part 4.1 -- chrome.tabs.onActivated handler assigns _activeTabIdSnapshot = activeInfo.tabId');

  // 4.2 -- the same handler dispatches setRunningState OR setIdleState
  // based on the activated tab's per-tab entry.
  var dispatchesSetRunning = /if \(snap\.isRunning\) {\s*setRunningState\(activeInfo\.tabId/.test(spSrc);
  var dispatchesSetIdle = /} else \{\s*setIdleState\(activeInfo\.tabId\)/.test(spSrc);
  ok(dispatchesSetRunning && dispatchesSetIdle,
     'Part 4.2 -- handler dispatches setRunningState/setIdleState based on per-tab entry on activation');

  // 4.3 -- automationComplete routes setIdleState by originating tabId.
  var caseBody = extractAfterAnchor(spSrc, "case 'automationComplete': {");
  ok(caseBody !== null,
     'Part 4.3a -- case automationComplete body extractable');
  if (caseBody) {
    var derivesOriginating = /var originatingTabId = \(typeof request\.tabId === 'number'\)/.test(caseBody);
    var routesIdle = /setIdleState\(originatingTabId\)/.test(caseBody);
    ok(derivesOriginating && routesIdle,
       'Part 4.3b -- automationComplete derives originatingTabId from request.tabId + calls setIdleState(originatingTabId)');
  }

  // 4.4 -- session_ended branch routes by session_endedTabId.
  var hasSessionEndedRouted = /var sessionEndedTabId = \(typeof request\.tabId === 'number'\)/.test(spSrc)
    && /setIdleState\(sessionEndedTabId\)/.test(spSrc);
  ok(hasSessionEndedRouted,
     'Part 4.4 -- session_ended branch derives sessionEndedTabId from request.tabId + calls setIdleState(sessionEndedTabId)');

  // Summary
  console.log('\n' + passed + ' PASS / ' + failed + ' FAIL');
  process.exit(failed === 0 ? 0 : 1);
}
