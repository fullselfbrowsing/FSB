'use strict';

// An action whose content-script connection closes because the page navigated.
//
// Part 1 drives runActionAcrossNavigation (extension/ws/mcp-tool-dispatcher.js)
// against a fake chrome: a closed connection with a changed URL or a newly
// committed main-frame document becomes a success that names the navigation; a
// closed connection with no sign of one keeps the unknown outcome and waits
// for nothing; a navigation that never commits is given up on after
// ACTION_NAVIGATION_WAIT_MS; an action that got its answer is untouched.
//
// Part 2 loads the real bridge client and background.js's sendMessageWithRetry
// in a vm and routes mcp:execute-action through _handleMessage, with a
// tabs.sendMessage that rejects the way Chrome does when the port closes: the
// wire frame carries the navigation and the new page's view, or today's
// unknown outcome byte for byte. A replay and a caller that passes no delivery
// callback (the autopilot) get the unknown outcome as before.
//
// Node 20 compatible; binds no port.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

const PORT_CLOSED = 'The message port closed before a response was received.';
const UNKNOWN_OUTCOME = Object.freeze({
  success: false,
  outcome: 'unknown',
  mayHaveExecuted: true,
  error: 'The action may have run before the content-script connection closed. Inspect the page before retrying.',
});
const CART = 'https://shop.example/cart';
const ORDER = 'https://shop.example/orders/42';

function makeBrowser() {
  const listeners = { committed: [], fragment: [], history: [], dcl: [] };
  const event = (key) => ({
    addListener(fn) { listeners[key].push(fn); },
    removeListener(fn) { const i = listeners[key].indexOf(fn); if (i >= 0) listeners[key].splice(i, 1); },
  });
  const page = {
    url: CART,
    pendingUrl: '',
    title: 'Cart - Shop',
    documentId: 'doc-cart',
    readyState: 'complete',
    fsbLoaded: false,
    view: 'Order 42 - Shop | https://shop.example/orders/42\n# Order 42\ne5001 button "Refund"',
  };
  const calls = { tabsGet: 0, getFrame: 0, builds: 0, sent: [] };
  const chrome = {
    webNavigation: {
      onCommitted: event('committed'),
      onReferenceFragmentUpdated: event('fragment'),
      onHistoryStateUpdated: event('history'),
      onDOMContentLoaded: event('dcl'),
      async getFrame({ tabId, frameId }) {
        calls.getFrame++;
        return { tabId, frameId, url: page.url, documentId: page.documentId };
      },
    },
    tabs: {
      async get(id) {
        calls.tabsGet++;
        return {
          id,
          url: page.url,
          pendingUrl: page.pendingUrl || undefined,
          title: page.title,
          status: page.readyState === 'complete' ? 'complete' : 'loading',
        };
      },
    },
    scripting: {
      async executeScript({ func }) {
        if (func.name === '_fsbPageViewProbeInPage') {
          return [{ frameId: 0, documentId: page.documentId, result: { readyState: page.readyState, fsbLoaded: page.fsbLoaded } }];
        }
        if (func.name === '_fsbBuildPageViewInPage') {
          calls.builds++;
          return [{ frameId: 0, documentId: page.documentId, result: { view: page.view } }];
        }
        return [{ frameId: 0, result: null }];
      },
    },
  };
  // The tab commits a new main-frame document; report: false holds the
  // webNavigation event back, as when it trails the closed connection.
  const navigate = (url, { documentId = 'doc-next', title = 'shop.example/orders/42', report = true } = {}) => {
    page.url = url;
    page.pendingUrl = '';
    page.title = title;
    page.documentId = documentId;
    if (report) reportCommit(url);
  };
  const reportCommit = (url, tabId = 7) => {
    for (const fn of listeners.committed.slice()) fn({ frameId: 0, tabId, url });
  };
  return { chrome, page, calls, listeners, navigate, reportCommit };
}

let browser = makeBrowser();
global.chrome = browser.chrome;
global.ensureContentScriptInjected = async () => true;
global.markContentScriptKnownEmpty = () => {};
const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');

function freshBrowser() {
  browser = makeBrowser();
  global.chrome = browser.chrome;
  return browser;
}

function listenerCount(b) {
  return Object.values(b.listeners).reduce((sum, list) => sum + list.length, 0);
}

// Runs one action whose connection closes after `duringAction` has run.
async function runClosed(b, duringAction, toolName = 'click') {
  const unknown = { ...UNKNOWN_OUTCOME };
  let closed = false;
  const started = Date.now();
  const result = await dispatcher.runActionAcrossNavigation({
    toolName,
    tabId: 7,
    execute: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      if (duringAction) duringAction();
      closed = true;
      return unknown;
    },
    connectionClosed: () => closed,
  });
  return { result, unknown, elapsed: Date.now() - started };
}

// ---------------------------------------------------------------------------
// Part 1: what a closed connection becomes

test('a closed connection with a changed URL is a success that names the navigation', async () => {
  const b = freshBrowser();
  const { result, unknown, elapsed } = await runClosed(b, () => b.navigate(ORDER, { title: 'Order 42 - Shop' }));
  assert.notEqual(result, unknown);
  assert.deepEqual(result, {
    success: true,
    tool: 'click',
    tabId: 7,
    url: ORDER,
    domain: 'shop.example',
    title: 'Order 42 - Shop',
    hadEffect: true,
    navigationTriggered: true,
  });
  assert.equal(JSON.stringify(result).includes('mayHaveExecuted'), false);
  assert.ok(elapsed < 300, `a committed navigation is not waited for (${elapsed} ms)`);
  assert.equal(listenerCount(b), 0, 'every listener is removed');
});

test('a wire verb is reported under its tool name', async () => {
  const b = freshBrowser();
  const { result } = await runClosed(b, () => b.navigate('https://shop.example/search?q=shoes'), 'pressEnter');
  assert.equal(result.success, true);
  assert.equal(result.tool, 'press_enter');
  assert.equal(result.url, 'https://shop.example/search?q=shoes');
});

test('a new document at the same URL counts once its commit is reported', async () => {
  const reported = freshBrowser();
  const sameUrl = await runClosed(reported, () => reported.navigate(CART, { documentId: 'doc-cart-2' }));
  assert.equal(sameUrl.result.success, true);
  assert.equal(sameUrl.result.navigationTriggered, true);
  assert.equal(sameUrl.result.url, CART);

  // The commit report trails the closed connection by a moment.
  const trailing = freshBrowser();
  const late = await runClosed(trailing, () => {
    trailing.navigate(CART, { documentId: 'doc-cart-2', report: false });
    setTimeout(() => trailing.reportCommit(CART), 120);
  });
  assert.equal(late.result.success, true);
  assert.equal(late.result.navigationTriggered, true);
  assert.ok(late.elapsed >= 100 && late.elapsed < 700, `answered when the commit was reported (${late.elapsed} ms)`);
  assert.equal(listenerCount(trailing), 0);
});

test('a closed connection with no sign of a navigation keeps the unknown outcome and waits for nothing', async () => {
  const b = freshBrowser();
  const { result, unknown, elapsed } = await runClosed(b, null);
  assert.equal(result, unknown, 'the same result object');
  assert.deepEqual(result, UNKNOWN_OUTCOME, 'with nothing added or removed');
  assert.ok(elapsed < 150, `no wait where nothing navigated (${elapsed} ms)`);
  assert.equal(listenerCount(b), 0);

  // A commit in another tab, and one in a subframe, are not this tab's navigation.
  const other = freshBrowser();
  const elsewhere = await runClosed(other, () => {
    other.reportCommit('https://elsewhere.example/', 9);
    for (const fn of other.listeners.committed.slice()) fn({ frameId: 3, tabId: 7, url: 'https://ads.example/frame' });
  });
  assert.equal(elsewhere.result, elsewhere.unknown);
});

test('a pending navigation is waited for until it commits', async () => {
  const b = freshBrowser();
  const { result, elapsed } = await runClosed(b, () => {
    b.page.pendingUrl = ORDER;
    setTimeout(() => b.navigate(ORDER), 200);
  });
  assert.equal(result.success, true);
  assert.equal(result.url, ORDER);
  assert.ok(elapsed >= 180 && elapsed < 800, `answered at the commit (${elapsed} ms)`);
  assert.equal(listenerCount(b), 0);
});

test('a navigation that never commits is given up on after the bounded wait', async () => {
  assert.equal(dispatcher.ACTION_NAVIGATION_WAIT_MS, 1000);
  assert.ok(dispatcher.ACTION_NAVIGATION_WAIT_MS <= dispatcher.PAGE_VIEW_WAIT_MS);

  const b = freshBrowser();
  const pending = await runClosed(b, () => { b.page.pendingUrl = 'https://slow.example/'; });
  assert.equal(pending.result, pending.unknown, 'no commit, no success');
  assert.deepEqual(pending.result, UNKNOWN_OUTCOME);
  assert.ok(pending.elapsed >= 950 && pending.elapsed < 1600, `gave up after ${pending.elapsed} ms`);
  assert.equal(listenerCount(b), 0);

  // A main frame that reports another document id but never a commit (a
  // renderer that went away, say) is not a navigation either.
  const gone = freshBrowser();
  const replaced = await runClosed(gone, () => { gone.page.documentId = 'doc-unreported'; });
  assert.equal(replaced.result, replaced.unknown);
  assert.ok(replaced.elapsed >= 950 && replaced.elapsed < 1600, `gave up after ${replaced.elapsed} ms`);
});

test('a tab that was already navigating when the action was sent keeps the unknown outcome', async () => {
  const b = freshBrowser();
  b.page.pendingUrl = ORDER;
  const { result, unknown, elapsed } = await runClosed(b, () => b.navigate(ORDER));
  assert.equal(result, unknown);
  assert.ok(elapsed < 150, `and is not waited on (${elapsed} ms)`);
});

test('an action that got its answer is untouched, whatever the tab did', async () => {
  const answers = [
    { success: true, clicked: '#add', hadEffect: true, pageStable: true },
    { success: false, error: 'Element not found' },
  ];
  for (const answer of answers) {
    const b = freshBrowser();
    const copy = JSON.stringify(answer);
    const started = Date.now();
    const result = await dispatcher.runActionAcrossNavigation({
      toolName: 'click',
      tabId: 7,
      execute: async () => { b.navigate(ORDER); return answer; },
      connectionClosed: () => false,
    });
    assert.equal(result, answer, 'the same result object');
    assert.equal(JSON.stringify(result), copy, 'unchanged');
    assert.ok(Date.now() - started < 150, 'and not delayed');
    assert.equal(listenerCount(b), 0);
  }
});

// ---------------------------------------------------------------------------
// A click or an Enter answered before its navigation committed

const UNCONFIRMED_CLICK = Object.freeze({
  success: false,
  outcome: 'unknown',
  mayHaveExecuted: true,
  hadEffect: false,
  error: 'Click was dispatched but its effect could not be confirmed. Inspect the page before retrying.',
});

// Runs one action that the content script answers with `answer`, after
// `duringAction` has run. The connection stays open.
async function runAnswered(b, duringAction, toolName = 'click', answer = UNCONFIRMED_CLICK) {
  const given = { ...answer };
  const started = Date.now();
  const result = await dispatcher.runActionAcrossNavigation({
    toolName,
    tabId: 7,
    execute: async () => {
      await new Promise((resolve) => setImmediate(resolve));
      if (duringAction) duringAction();
      return given;
    },
    connectionClosed: () => false,
  });
  return { result, given, elapsed: Date.now() - started };
}

test('an unconfirmed click whose navigation is pending is answered by that navigation once it commits', async () => {
  const b = freshBrowser();
  const { result, given, elapsed } = await runAnswered(b, () => {
    b.page.pendingUrl = ORDER;
    setTimeout(() => b.navigate(ORDER, { title: 'Order 42 - Shop' }), 200);
  });
  assert.notEqual(result, given);
  assert.deepEqual(result, {
    success: true,
    tool: 'click',
    tabId: 7,
    url: ORDER,
    domain: 'shop.example',
    title: 'Order 42 - Shop',
    hadEffect: true,
    navigationTriggered: true,
  });
  assert.ok(elapsed >= 180 && elapsed < 900, `answered at the commit (${elapsed} ms)`);
  assert.equal(listenerCount(b), 0);

  // The commit can also land between the script's answer and this check.
  const done = freshBrowser();
  const committed = await runAnswered(done, () => done.navigate(ORDER));
  assert.equal(committed.result.success, true);
  assert.equal(committed.result.navigationTriggered, true);
  assert.ok(committed.elapsed < 300, `a committed navigation is not waited for (${committed.elapsed} ms)`);
});

test('an unconfirmed click or Enter with no navigation due keeps its unknown outcome and waits for nothing', async () => {
  for (const toolName of ['click', 'pressEnter']) {
    const b = freshBrowser();
    const { result, given, elapsed } = await runAnswered(b, null, toolName);
    assert.equal(result, given, 'the same result object');
    assert.deepEqual(result, UNCONFIRMED_CLICK, 'with nothing added or removed');
    assert.ok(elapsed < 150, `no wait where nothing navigated (${elapsed} ms)`);
    assert.equal(listenerCount(b), 0);
  }
});

test('an unconfirmed click whose navigation never commits is given up on after the longer bounded wait', async () => {
  assert.equal(dispatcher.ACTION_LATE_NAVIGATION_WAIT_MS, 3000);
  const b = freshBrowser();
  const { result, given, elapsed } = await runAnswered(b, () => { b.page.pendingUrl = 'https://slow.example/'; });
  assert.equal(result, given, 'no commit, no success');
  assert.deepEqual(result, UNCONFIRMED_CLICK);
  assert.ok(elapsed >= 2950 && elapsed < 3700, `gave up after ${elapsed} ms`);
  assert.equal(listenerCount(b), 0);
});

test('only a click or an Enter is looked at again after an answer, and never a tab that was already navigating', async () => {
  // Typing answered "unknown": the URL moving is not taken as its result.
  const typed = freshBrowser();
  const typing = await runAnswered(typed, () => typed.navigate(ORDER), 'type');
  assert.equal(typing.result, typing.given);
  assert.ok(typing.elapsed < 150);

  // The tab was on its way elsewhere before the click was sent.
  const busy = freshBrowser();
  busy.page.pendingUrl = ORDER;
  const already = await runAnswered(busy, () => busy.navigate(ORDER));
  assert.equal(already.result, already.given);
  assert.ok(already.elapsed < 150, `and is not waited on (${already.elapsed} ms)`);

  // An answer that is a plain failure is never rewritten.
  const failed = freshBrowser();
  const refusal = await runAnswered(failed, () => failed.navigate(ORDER), 'click', { success: false, error: 'Element not found' });
  assert.equal(refusal.result, refusal.given);
});

test('reads, sheet fills and tools that do not run in the content script are never answered by a navigation', async () => {
  for (const toolName of ['getText', 'read_page', 'fillsheet', 'navigate', 'cdpClickAt', 'not_a_tool']) {
    const b = freshBrowser();
    const { result, unknown } = await runClosed(b, () => b.navigate(ORDER), toolName);
    assert.equal(result, unknown, `${toolName}: the unknown outcome stands`);
    assert.equal(b.calls.tabsGet + b.calls.getFrame, 0, `${toolName}: the tab is not even read`);
  }
});

test('an action that did not navigate costs one tab read it never waits for, and leaves no listener', async () => {
  const b = freshBrowser();
  let listenersDuringAction = -1;
  const answer = { success: true, typed: 'shoes' };
  const result = await dispatcher.runActionAcrossNavigation({
    toolName: 'type',
    tabId: 7,
    execute: async () => { listenersDuringAction = b.listeners.committed.length; return answer; },
    connectionClosed: () => false,
  });
  assert.equal(result, answer);
  assert.equal(listenersDuringAction, 1, 'new documents are recorded while the action runs');
  assert.equal(b.listeners.fragment.length + b.listeners.history.length, 0);
  assert.equal(b.calls.tabsGet, 1, 'the tab is read once, before the action');
  assert.equal(b.calls.getFrame, 1);
  assert.equal(listenerCount(b), 0);
});

test('a navigated result gets the new page\'s view without a change_report, and its final title', async () => {
  const b = freshBrowser();
  const { result } = await runClosed(b, () => b.navigate(ORDER));
  assert.equal(result.title, 'shop.example/orders/42', 'the title the tab had at the commit');
  assert.equal(result.change_report, undefined);
  const sameFields = { ...result };

  b.page.title = 'Order 42 - Shop';
  const withView = await dispatcher.runActionWithPageView({
    toolName: 'click',
    tabId: null,
    params: { selector: '#checkout' },
    execute: async () => result,
  });
  assert.equal(withView, result);
  assert.equal(withView.view, b.page.view);
  assert.equal(withView.view_pending, undefined);
  assert.equal(withView.title, 'Order 42 - Shop', 'read again once the document had parsed');
  assert.equal(withView.url, ORDER);

  // Another result with the same fields is not taken for one built from a navigation.
  const lookalike = await dispatcher.runActionWithPageView({
    toolName: 'click',
    tabId: 7,
    params: {},
    execute: async () => sameFields,
  });
  assert.equal(lookalike.view, undefined);
  assert.equal(lookalike.title, 'shop.example/orders/42');
});

test('a navigated result whose page is not ready in time carries view_pending', async () => {
  const b = freshBrowser();
  const { result } = await runClosed(b, () => { b.navigate(ORDER); b.page.readyState = 'loading'; });
  const started = Date.now();
  const withView = await dispatcher.runActionWithPageView({
    toolName: 'click', tabId: null, params: {}, execute: async () => result,
  });
  const elapsed = Date.now() - started;
  assert.equal(withView.success, true);
  assert.equal(withView.view_pending, true);
  assert.equal(withView.view, undefined);
  assert.ok(elapsed >= 2450 && elapsed < 3300, `the view kept to its own ${dispatcher.PAGE_VIEW_WAIT_MS} ms budget (${elapsed} ms)`);
});

// ---------------------------------------------------------------------------
// Part 2: the bridge, with the real delivery path

const BACKGROUND = read('extension/background.js');

function sendMessageWithRetrySource() {
  const start = BACKGROUND.indexOf('async function sendMessageWithRetry(');
  const end = BACKGROUND.indexOf('\n// Alternative action strategies', start);
  assert.ok(start > 0 && end > start, 'sendMessageWithRetry present');
  return BACKGROUND.slice(start, end);
}

function loadBridge(b) {
  const definitions = require('../extension/ai/tool-definitions.js');
  const av = require('../extension/utils/action-verification.js');
  const storageArea = () => ({ async get() { return {}; }, async set() {}, async remove() {} });
  class FakeWebSocket {
    constructor() { this.readyState = FakeWebSocket.OPEN; this.sent = []; }
    send(data) { this.sent.push(data); }
    close() {}
  }
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  // What the page does with a delivered action: resolve with the content
  // script's answer, or reject as Chrome does when the port closes.
  const delivery = { answer: async () => ({ success: true }) };
  Object.assign(b.chrome, {
    runtime: { id: 'action-navigation-test', onMessage: { addListener() {}, removeListener() {} }, sendMessage() {} },
    storage: { session: storageArea(), local: storageArea() },
    alarms: { async create() {}, async clear() { return true; }, async getAll() { return []; } },
  });
  b.chrome.tabs.sendMessage = async (tabId, message) => {
    b.calls.sent.push({ tabId, tool: message.tool, source: message.source });
    return delivery.answer(message);
  };
  const context = {
    chrome: b.chrome,
    WebSocket: FakeWebSocket,
    console, Math, Date, URL, EventTarget, CustomEvent,
    setTimeout: () => ({}),
    clearTimeout() {},
    setInterval: () => ({}),
    clearInterval() {},
    getToolByNameOrVerb: definitions.getToolByNameOrVerb,
    isEmptyChangeReport: av.isEmptyChangeReport,
    wrapWithChangeReport: dispatcher.wrapWithChangeReport,
    runActionWithPageView: dispatcher.runActionWithPageView,
    runActionAcrossNavigation: dispatcher.runActionAcrossNavigation,
    // What sendMessageWithRetry reaches for in background.js.
    checkContentScriptHealth: async () => true,
    ensureContentScriptInjected: async () => true,
    contentScriptHealth: new Map(),
    classifyFailure: () => 'communication',
    FAILURE_TYPES: { BF_CACHE: 'bfcache', COMMUNICATION: 'communication' },
    automationLogger: { logComm() {}, logRecovery() {}, logNavigation() {}, logTiming() {}, debug() {} },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(sendMessageWithRetrySource(), context, { filename: 'background.js#sendMessageWithRetry' });
  vm.runInContext(`${read('extension/ws/mcp-bridge-client.js')}\nthis.__bridge = mcpBridgeClient;`, context, { filename: 'ws/mcp-bridge-client.js' });
  const client = context.__bridge;
  client.setInboundAuthorityReady(true);
  client.setDelegationAuthorityReady(true);
  context.resolveAgentTabOrError = async () => ({ success: true, tabId: 7 });
  client._resolveMcpSessionRecordTarget = async () => ({ targetOriginResolved: true, targetUrl: b.page.url, targetOrigin: 'https://shop.example' });
  client._recordVisualSessionTickIfPresent = async () => {};
  client._clearVisualSessionIfFinal = async () => {};
  const recorded = [];
  context.fsbMcpSessionRecorder = { recordAction(entry) { recorded.push({ success: entry.success, response: { ...entry.response } }); } };
  const frames = [];
  client._send = (frame) => frames.push(frame);
  let calls = 0;
  // The result frame's payload as the MCP server parses it off the socket.
  const call = async (tool, params) => {
    const id = `call-${++calls}`;
    await client._handleMessage(JSON.stringify({
      id,
      type: 'mcp:execute-action',
      payload: { tool, params, agentId: 'agent-1' },
    }));
    const frame = frames.find((f) => f && f.id === id && f.type === 'mcp:result');
    assert.ok(frame, 'an mcp:result frame was sent');
    return plain(frame.payload);
  };
  return { context, client, delivery, recorded, call };
}

// As JSON carries it; also drops the vm realm's prototypes before a deepEqual.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function portClosed() {
  return Promise.reject(new Error(PORT_CLOSED));
}

test('a click that navigates reaches the host as a navigation with the new page\'s view', async () => {
  const b = freshBrowser();
  const bridge = loadBridge(b);
  bridge.delivery.answer = () => {
    b.navigate(ORDER);
    // The document sets its title while it parses, after the commit.
    setTimeout(() => { b.page.title = 'Order 42 - Shop'; }, 20);
    b.page.readyState = 'loading';
    setTimeout(() => {
      b.page.readyState = 'interactive';
      for (const fn of b.listeners.dcl.slice()) fn({ frameId: 0, tabId: 7 });
    }, 60);
    return portClosed();
  };
  const started = Date.now();
  const payload = await bridge.call('click', { selector: '#checkout' });
  const elapsed = Date.now() - started;

  assert.deepEqual(payload, {
    success: true,
    tool: 'click',
    tabId: 7,
    url: ORDER,
    domain: 'shop.example',
    title: 'Order 42 - Shop',
    hadEffect: true,
    navigationTriggered: true,
    view: b.page.view,
  });
  assert.ok(elapsed < 1000, `answered soon after DOMContentLoaded (${elapsed} ms)`);
  assert.deepEqual(b.calls.sent, [{ tabId: 7, tool: 'click', source: 'mcp-manual' }], 'the action was sent once');
  assert.equal(bridge.recorded.length, 1);
  assert.equal(bridge.recorded[0].success, true, 'the session records a success');
  assert.equal(bridge.recorded[0].response.navigationTriggered, true);
  assert.equal(bridge.recorded[0].response.view, undefined, 'recorded before the view was read');
  assert.equal(listenerCount(b), 0);
});

test('a closed connection with no navigation reaches the host as today\'s unknown outcome', async () => {
  const b = freshBrowser();
  const bridge = loadBridge(b);
  bridge.delivery.answer = () => portClosed();
  const started = Date.now();
  const payload = await bridge.call('click', { selector: '#checkout' });
  assert.deepEqual(payload, UNKNOWN_OUTCOME);
  assert.deepEqual(Object.keys(payload), ['success', 'outcome', 'mayHaveExecuted', 'error']);
  assert.ok(Date.now() - started < 300, 'without a wait');
  assert.equal(b.calls.builds, 0, 'and no view is read');
  assert.equal(bridge.recorded[0].success, false);
  assert.equal(listenerCount(b), 0);
});

test('an action the page answered is sent on as the page answered it', async () => {
  const b = freshBrowser();
  const bridge = loadBridge(b);
  const answer = { success: true, clicked: '#add', hadEffect: true, scrolled: false };
  bridge.delivery.answer = async () => ({ ...answer });
  assert.deepEqual(await bridge.call('click', { selector: '#add' }), answer);
  assert.equal(bridge.recorded[0].success, true);

  // The page moved on after it had answered: still the page's own answer.
  bridge.delivery.answer = async () => { b.navigate(ORDER); return { success: false, error: 'Element not found' }; };
  assert.deepEqual(await bridge.call('click', { selector: '#gone' }), { success: false, error: 'Element not found' });
  assert.equal(b.calls.builds, 0);
  assert.equal(listenerCount(b), 0);
});

test('a replay keeps the unknown outcome even when the tab navigated', async () => {
  const b = freshBrowser();
  const bridge = loadBridge(b);
  bridge.delivery.answer = () => { b.navigate(ORDER); return portClosed(); };
  const result = await bridge.client._handleExecuteAction({ tool: 'click', params: { selector: '#checkout' }, agentId: 'agent-1' });
  assert.deepEqual(plain(result), UNKNOWN_OUTCOME);
  assert.equal(listenerCount(b), 0);
});

test('a caller without a delivery callback gets the unknown outcome from sendMessageWithRetry as before', async () => {
  const b = freshBrowser();
  const bridge = loadBridge(b);
  bridge.delivery.answer = () => { b.navigate(ORDER); return portClosed(); };
  const send = vm.runInContext('sendMessageWithRetry', bridge.context);
  const result = await send(7, { action: 'executeAction', tool: 'click', params: { selector: '#checkout' } });
  assert.deepEqual(plain(result), UNKNOWN_OUTCOME);
  assert.deepEqual(Object.keys(result), ['success', 'outcome', 'mayHaveExecuted', 'error']);

  const states = [];
  const onDeliveryState = (state) => states.push(state);
  await send(7, { action: 'executeAction', tool: 'click', params: {} }, 3, { onDeliveryState });
  assert.deepEqual(states, ['dispatching', 'closed'], 'a caller that asks is told the connection closed');

  // An action Chrome could not deliver is never reported as a closed connection.
  states.length = 0;
  bridge.delivery.answer = () => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
  await assert.rejects(send(7, { action: 'executeAction', tool: 'click', params: {} }, 1, { onDeliveryState }));
  assert.deepEqual(states, ['dispatching', 'undelivered']);
});

test('the suite runs once in the npm test chain and the refinements command list', () => {
  const pkg = JSON.parse(read('package.json'));
  const command = 'node tests/mcp-action-navigation.test.js';
  const chain = pkg.scripts.test.split(' && ');
  assert.equal(chain.filter((cmd) => cmd === command).length, 1);
  assert.equal(read('tests/delegation-phase-contract.test.js').split(`'${command}',`).length - 1, 1);
});
