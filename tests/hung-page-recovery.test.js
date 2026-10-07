'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const bridge = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-bridge-client.js'), 'utf8');
const dispatcher = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-tool-dispatcher.js'), 'utf8');
const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');

test('a hung page read returns a typed bounded error', async () => {
  const start = bridge.indexOf('  async _sendToContentScript(tabId, message) {');
  const end = bridge.indexOf('\n  async _handleGetTabs(', start);
  const method = bridge.slice(start, end).replace('12000);', '20);');
  const context = {
    sendMessageWithRetry: () => new Promise(() => {}),
    setTimeout, clearTimeout
  };
  const send = vm.runInNewContext(`({${method}})._sendToContentScript`, context);
  const result = await send(9, { action: 'readPage' });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
});

test('a hung mutation reports uncertain execution', async () => {
  const start = bridge.indexOf('  async _sendToContentScript(tabId, message) {');
  const end = bridge.indexOf('\n  async _handleGetTabs(', start);
  const method = bridge.slice(start, end).replace('12000);', '20);');
  const context = { sendMessageWithRetry: (_tabId, _message, _retries, options) => {
    options.onDeliveryState('dispatching');
    return new Promise(() => {});
  }, setTimeout, clearTimeout };
  const send = vm.runInNewContext(`({${method}})._sendToContentScript`, context);
  const result = await send(9, { action: 'executeAction', tool: 'click' });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
});

test('navigation and close skip page-side change reports', () => {
  const wrapper = dispatcher.slice(dispatcher.indexOf('async function wrapWithChangeReport('),
    dispatcher.indexOf('\n// ', dispatcher.indexOf('async function wrapWithChangeReport(') + 20));
  assert.match(wrapper, /'navigate', 'close_tab'/);
  assert.match(wrapper, /return execute\(\)/);
});

test('an expired mutation is never sent after delayed page recovery', async () => {
  const start = background.indexOf('async function sendMessageWithRetry(');
  const end = background.indexOf('\n// Alternative action strategies', start);
  let sent = 0;
  const context = {
    Date,
    chrome: { tabs: {
      get: async () => ({ url: 'https://example.com' }),
      sendMessage: async () => { sent++; return { success: true }; }
    } },
    checkContentScriptHealth: async () => true
  };
  const send = vm.runInNewContext(`${background.slice(start, end)}\nsendMessageWithRetry`, context);
  const result = await send(7, { action: 'executeAction', tool: 'click',
    _fsbDeadlineAt: Date.now() - 1 });
  assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
  assert.equal(result.mayHaveExecuted, false);
  assert.equal(sent, 0);
});

test('CDP lease watchdog releases a hung holder for the next tab operation', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../extension/utils/cdp-lease.js'), 'utf8');
  const timers = [];
  const context = {
    Map, Promise, Number, Error, TypeError,
    setTimeout(callback, delay) {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cancelled = true; },
    module: { exports: {} }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  const lease = await context.module.exports.acquire(11);
  const next = context.module.exports.acquire(11);
  const watchdog = timers.find(timer => timer.delay === 20000);
  assert.ok(watchdog);
  watchdog.callback();
  const secondLease = await next;
  assert.equal(secondLease.tabId, 11);
  secondLease.release();
  lease.release();
});

function leaseContext() {
  const source = fs.readFileSync(path.join(__dirname, '../extension/utils/cdp-lease.js'), 'utf8');
  const timers = [];
  const context = {
    Map, Promise, Number, Error, TypeError,
    setTimeout(callback, delay) {
      const timer = { callback, delay, unref() {} };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cancelled = true; },
    module: { exports: {} }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { lease: context.module.exports, timers };
}

test('a holder that asks for a longer lease is not preempted at the default watchdog', async () => {
  const { lease, timers } = leaseContext();
  const capture = await lease.acquire(11, { holdMs: 40000 });
  assert.deepEqual(timers.map(timer => timer.delay), [40000]);
  const typing = lease.acquire(11, { holdMs: 65000 });
  capture.release();
  const handedOff = await typing;
  assert.equal(timers.filter(timer => !timer.cancelled && timer.delay !== 10000).at(-1).delay, 65000);
  handedOff.release();
});

test('long typing and hold verbs size their lease past the work they do', () => {
  const pick = (name, endMarker) => {
    const start = background.indexOf(`function ${name}(`);
    return background.slice(start, background.indexOf(endMarker, start));
  };
  const typingHold = vm.runInNewContext(
    `${pick('keyboardActionLeaseHoldMs', '\n}\n')}\n}\nkeyboardActionLeaseHoldMs`, { Number, Math, Array });
  const verbHold = vm.runInNewContext(
    `${pick('cdpToolLeaseHoldMs', '\n}\n')}\n}\ncdpToolLeaseHoldMs`, { Number });
  // typeWithKeys spends ~45ms a character at delay 30; 400 characters already pass 20s.
  assert.ok(typingHold('typeText', 'x'.repeat(400), undefined, 30) > 400 * 45 + 20000);
  assert.ok(typingHold('pressKeySequence', undefined, new Array(300).fill('a'), 50) > 300 * 60 + 20000);
  assert.equal(typingHold('pressKey', undefined, undefined, 50), 20150);
  assert.ok(verbHold({ holdMs: 30000 }) > 30000 + 20000 - 1);
  assert.ok(verbHold({ steps: 500, maxDelayMs: 40 }) > 500 * 40 + 20000);
  assert.equal(verbHold(undefined), 20000);
});

test('content-script hold and drag requests size their lease like the direct verbs', async () => {
  const pick = (name) => {
    const start = background.indexOf(`function ${name}(`);
    return background.slice(start, background.indexOf('\n}\n', start) + 3);
  };
  const acquired = [];
  const context = {
    Number,
    FsbCdpLease: {
      acquire: async (tabId, options) => {
        acquired.push(options);
        return { release() {} };
      }
    }
  };
  const run = vm.runInNewContext(
    `async ${pick('runLegacyCdpMessageWithLease')}\n${pick('cdpToolLeaseHoldMs')}\nrunLegacyCdpMessageWithLease`,
    context);
  const sender = { tab: { id: 4 } };
  await run(async () => {}, { x: 1, y: 2, holdMs: 30000 }, sender, () => {});
  await run(async () => {}, { startX: 0, startY: 0, endX: 9, endY: 9, steps: 500, maxDelayMs: 40 }, sender, () => {});
  await run(async () => {}, { x: 1, y: 2 }, sender, () => {});
  assert.ok(acquired[0].holdMs >= 30000 + 20000);
  assert.ok(acquired[1].holdMs > 500 * 40 + 20000);
  assert.equal(acquired[2].holdMs, 20000);
  assert.ok(acquired.every(options => options.timeoutMs === 10000));
});

function harvestPage() {
  const startAt = dispatcher.indexOf('function _fsbHarvestStartInPage(');
  const stopAt = dispatcher.indexOf('function _fsbHarvestStopInPage(');
  const source = dispatcher.slice(startAt, dispatcher.indexOf('\n// Page-context harvest stop', startAt))
    + dispatcher.slice(stopAt, dispatcher.indexOf('\n// Wait for DOM-stable', stopAt));
  const observers = [];
  const timers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const root = { tagName: 'HTML', className: '', textContent: '', parentElement: null, getAttribute: () => null };
  const window = { location: { href: 'https://example.com/' } };
  const context = {
    window,
    document: {
      documentElement: root, title: 'Example', activeElement: null,
      querySelector: () => null, querySelectorAll: () => []
    },
    MutationObserver: FakeMutationObserver,
    Date, String,
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; }
  };
  const page = vm.runInNewContext(`${source}\n({ start: _fsbHarvestStartInPage, stop: _fsbHarvestStopInPage })`, context);
  return { page, window, observers, timers, root };
}

test('a change-report start that lands after the service worker gave up installs no observer', () => {
  const { page, window, observers } = harvestPage();
  const result = page.start(null, 'late', Date.now() - 1);
  assert.equal(result.ok, false);
  assert.equal(observers.length, 0);
  assert.equal(window.__fsbChangeReportHandles, undefined);
});

test('overlapping change-report harvests only stop their own observer', () => {
  const { page, window, observers } = harvestPage();
  assert.equal(page.start(null, 'a', Date.now() + 1000).ok, true);
  assert.equal(page.start(null, 'b', Date.now() + 1000).ok, true);
  page.stop('a');
  assert.equal(observers[0].connected, false);
  assert.equal(observers[1].connected, true);
  page.stop('b');
  assert.equal(observers[1].connected, false);
  assert.equal(Object.keys(window.__fsbChangeReportHandles).length, 0);
});

test('an unstopped change-report observer keeps bounded records and expires', () => {
  const { page, window, observers, timers, root } = harvestPage();
  page.start(null, 'orphan', Date.now() + 1000);
  const record = { type: 'attributes', attributeName: 'class', oldValue: '', target: root };
  observers[0].callback(new Array(6000).fill(record));
  const handle = window.__fsbChangeReportHandles.orphan;
  assert.equal(handle.mutations.length, 5000);
  assert.equal(handle.mutationCount, 6000);
  timers.find(timer => timer.delay === 120000).callback();
  assert.equal(observers[0].connected, false);
  assert.equal(window.__fsbChangeReportHandles.orphan, undefined);
});

test('a stopped change-report harvest reports the full mutation count', () => {
  const { page, observers, timers, root } = harvestPage();
  page.start(null, 'a', Date.now() + 1000);
  observers[0].callback(new Array(6000).fill({ type: 'attributes', attributeName: 'class', oldValue: '', target: root }));
  const stopped = page.stop('a');
  assert.equal(stopped.mutations.length, 5000);
  assert.equal(stopped.mutation_count, 6000);
  assert.equal(timers.find(timer => timer.delay === 120000).cleared, true);
});

test('a change-report start that times out queues the stop for its own token', async () => {
  const calls = [];
  const priorChrome = global.chrome;
  global.chrome = {
    tabs: { get: async (id) => ({ id, url: 'https://example.com/' }) },
    scripting: {
      executeScript(options) {
        calls.push(options);
        return options.func.name === '_fsbHarvestStartInPage'
          ? new Promise(() => {})
          : Promise.resolve([{ result: null }]);
      }
    },
    storage: { local: { get: (_key, callback) => callback({}) }, onChanged: { addListener() {} } }
  };
  try {
    const modulePath = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
    delete require.cache[modulePath];
    const loaded = require(modulePath);
    loaded._setChangeReportsEnabledForTest(true);
    const response = await loaded.wrapWithChangeReport({
      toolName: 'click', tabId: 3, params: { selector: '#go' },
      execute: async () => ({ success: true })
    });
    assert.equal(response.success, true);
    assert.equal(response.change_report, undefined);
    assert.equal(calls[0].func.name, '_fsbHarvestStartInPage');
    assert.equal(calls[1].func.name, '_fsbHarvestStopInPage');
    assert.equal(calls[1].args[0], calls[0].args[1]);
    assert.ok(calls[0].args[2] <= Date.now());
  } finally {
    global.chrome = priorChrome;
  }
});

test('an injection that never settles does not pin the tab past its timeout', async () => {
  const start = background.indexOf('const contentScriptInjectionFlights = new Map();');
  const end = background.indexOf('\nasync function ensureContentScriptInjectedUnlocked', start);
  const source = background.slice(start, end).replace('12000', '20');
  let injections = 0;
  const context = {
    setTimeout,
    ensureContentScriptInjectedUnlocked: () => (++injections === 1 ? new Promise(() => {}) : Promise.resolve(true))
  };
  const ensure = vm.runInNewContext(`${source}\nensureContentScriptInjected`, context);
  const results = await Promise.allSettled([ensure(5), ensure(5)]);
  assert.equal(injections, 1);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason.code, 'PAGE_UNRESPONSIVE');
  }
  assert.equal(await ensure(5), true);
  assert.equal(injections, 2);
});

test('an undelivered mutation is reported as not executed', async () => {
  const start = bridge.indexOf('  async _sendToContentScript(tabId, message) {');
  const end = bridge.indexOf('\n  async _handleGetTabs(', start);
  const context = {
    sendMessageWithRetry: async () => {
      throw { message: 'Failed after 3 attempts: Could not establish connection. Receiving end does not exist.' };
    },
    setTimeout, clearTimeout
  };
  const send = vm.runInNewContext(`({${bridge.slice(start, end)}})._sendToContentScript`, context);
  const result = await send(9, { action: 'executeAction', tool: 'click' });
  assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mayHaveExecuted, false);
});

test('a direct send that loses its port after dispatch stays uncertain', async () => {
  const start = bridge.indexOf('  async _sendToContentScript(tabId, message) {');
  const end = bridge.indexOf('\n  async _handleGetTabs(', start);
  const chrome = { runtime: {}, tabs: {
    sendMessage(_tabId, _message, _options, callback) {
      chrome.runtime.lastError = { message: 'The message port closed before a response was received.' };
      callback();
      delete chrome.runtime.lastError;
    }
  } };
  const context = { ensureContentScriptInjected: async () => true, chrome, Date, setTimeout, clearTimeout };
  const send = vm.runInNewContext(`({${bridge.slice(start, end)}})._sendToContentScript`, context);
  const result = await send(9, { action: 'executeAction', tool: 'click' });
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
});

test('a direct send to a closed tab is reported as not delivered', async () => {
  const start = bridge.indexOf('  async _sendToContentScript(tabId, message) {');
  const end = bridge.indexOf('\n  async _handleGetTabs(', start);
  const chrome = { runtime: {}, tabs: {
    sendMessage(_tabId, _message, _options, callback) {
      chrome.runtime.lastError = { message: 'No tab with id: 9.' };
      callback();
      delete chrome.runtime.lastError;
    }
  } };
  const context = { ensureContentScriptInjected: async () => true, chrome, Date, setTimeout, clearTimeout };
  const send = vm.runInNewContext(`({${bridge.slice(start, end)}})._sendToContentScript`, context);
  const result = await send(9, { action: 'executeAction', tool: 'click' });
  assert.equal(result.outcome, 'failed');
  assert.equal(result.mayHaveExecuted, false);
});

test('a send to a closed tab is not reported as possibly executed', async () => {
  const start = background.indexOf('async function sendMessageWithRetry(');
  const end = background.indexOf('\n// Alternative action strategies', start);
  let sent = 0;
  const context = {
    Date, Math,
    chrome: { tabs: {
      get: async () => ({ url: 'https://example.com' }),
      sendMessage: async () => {
        sent++;
        throw new Error('No tab with id: 7.');
      }
    } },
    checkContentScriptHealth: async () => true,
    ensureContentScriptInjected: async () => true,
    classifyFailure: () => 'communication',
    FAILURE_TYPES: { BF_CACHE: 'bf_cache', COMMUNICATION: 'communication' },
    contentScriptHealth: new Map(),
    automationLogger: { logComm() {}, logRecovery() {}, logTiming() {}, debug() {} },
    setTimeout: (callback) => { callback(); return 0; }
  };
  const send = vm.runInNewContext(`${background.slice(start, end)}\nsendMessageWithRetry`, context);
  await assert.rejects(send(7, { action: 'executeAction', tool: 'click' }, 1),
    (error) => /No tab with id/.test(error.message));
  assert.equal(sent, 1);
});

test('a retry that fails before sending is not reported as possibly executed', async () => {
  const start = background.indexOf('async function sendMessageWithRetry(');
  const end = background.indexOf('\n// Alternative action strategies', start);
  let sent = 0;
  let injections = 0;
  const context = {
    Date, Math,
    chrome: { tabs: {
      get: async () => ({ url: 'https://example.com' }),
      sendMessage: async () => {
        sent++;
        throw new Error('Could not establish connection. Receiving end does not exist.');
      }
    } },
    checkContentScriptHealth: async () => sent === 0,
    ensureContentScriptInjected: async () => {
      if (++injections > 1) {
        const error = new Error('Content script injection timed out');
        error.code = 'PAGE_UNRESPONSIVE';
        throw error;
      }
      return true;
    },
    classifyFailure: (error) => (/receiving end/i.test(error.message) ? 'communication' : 'unknown'),
    FAILURE_TYPES: { BF_CACHE: 'bf_cache', COMMUNICATION: 'communication' },
    contentScriptHealth: new Map(),
    automationLogger: { logComm() {}, logRecovery() {}, logTiming() {}, debug() {} },
    setTimeout: (callback) => { callback(); return 0; }
  };
  const send = vm.runInNewContext(`${background.slice(start, end)}\nsendMessageWithRetry`, context);
  await assert.rejects(send(7, { action: 'executeAction', tool: 'click' }, 2),
    (error) => /injection timed out/.test(error.message));
  assert.equal(sent, 1);
});

function sheetDeliveryFixture() {
  let now = 0, nextId = 0, finish, notify;
  const timers = new Map();
  const Clock = class extends Date { static now() { return now; } };
  const context = {
    Date: Clock,
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    sendMessageWithRetry(_tab, _message, _retries, options) {
      notify = options.onDeliveryState;
      return new Promise(resolve => { finish = resolve; });
    }
  };
  const start = bridge.indexOf('  async _sendToContentScript(tabId, message) {');
  const end = bridge.indexOf('\n  async _handleGetTabs(', start);
  const send = vm.runInNewContext(`({${bridge.slice(start, end)}})._sendToContentScript`, context);
  return {
    send, timers, dispatch: () => notify('dispatching'), undelivered: () => notify('undelivered'),
    finish: value => finish(value),
    async advance(milliseconds) {
      const target = now + milliseconds;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        now = next[1].at; timers.delete(next[0]); next[1].callback();
        await Promise.resolve(); await Promise.resolve();
      }
      now = target;
    }
  };
}

for (const tool of ['fillsheet', 'readsheet', 'fill_sheet', 'read_sheet']) {
  test(`${tool} can finish beyond 12 seconds without being labelled hung`, async () => {
    const fixture = sheetDeliveryFixture();
    const pending = fixture.send(42, { action: 'executeAction', tool });
    fixture.dispatch();
    await fixture.advance(20000);
    assert.equal(fixture.timers.size, 1);
    fixture.finish({ success: true });
    assert.equal((await pending).success, true);
    assert.equal(fixture.timers.size, 0);
  });
}

test('sheet delivery remains bounded at 12 seconds before any dispatch', async () => {
  const fixture = sheetDeliveryFixture();
  const pending = fixture.send(42, { action: 'executeAction', tool: 'fillsheet' });
  await fixture.advance(12000);
  const result = await pending;
  assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
  assert.equal(result.mayHaveExecuted, false);
  assert.equal(result.outcome, 'failed');
});

test('a pending sheet write expires as uncertain execution at its separate reply deadline', async () => {
  const fixture = sheetDeliveryFixture();
  const pending = fixture.send(42, { action: 'executeAction', tool: 'fillsheet' });
  await fixture.advance(11000);
  fixture.dispatch();
  await fixture.advance(124999);
  assert.equal(fixture.timers.size, 1);
  await fixture.advance(1);
  const result = await pending;
  assert.equal(result.errorCode, 'ACTION_RESPONSE_TIMEOUT');
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
  fixture.finish({ success: true });
  assert.equal(fixture.timers.size, 0);
});

test('a proven undelivered retry does not acquire a new sheet execution window', async () => {
  const fixture = sheetDeliveryFixture();
  const pending = fixture.send(42, { action: 'executeAction', tool: 'fillsheet' });
  await fixture.advance(11000); fixture.dispatch(); fixture.undelivered();
  await fixture.advance(1000);
  const result = await pending;
  assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
  assert.equal(result.mayHaveExecuted, false);
});

test('content execution timeout keeps a still-running sheet write uncertain', async () => {
  const messaging = fs.readFileSync(path.join(__dirname, '../extension/content/messaging.js'), 'utf8');
  const start = messaging.indexOf('  async function executeContentAction(');
  const end = messaging.indexOf('\n  function fsbShouldReplaceFinalOverlay', start);
  let expire, delay, finish;
  const execute = vm.runInNewContext(`${messaging.slice(start, end)}\nexecuteContentAction`, {
    FSB: { tools: { fillsheet: () => new Promise(resolve => { finish = resolve; }) } },
    setTimeout(callback, ms) { expire = callback; delay = ms; return 1; }, clearTimeout() {}
  });
  const pending = execute('fillsheet', {});
  const rejected = assert.rejects(pending, error => error.errorCode === 'ACTION_RESPONSE_TIMEOUT' &&
    error.outcome === 'unknown' && error.mayHaveExecuted === true);
  assert.equal(delay, 120000);
  expire(); await rejected;
  finish({ success: true });
});

test('both MCP sheet registrations give delivery and execution time to return', async () => {
  const { createToolHarness, loadAgentScope, loadBuildModule } = require('./mcp-smoke-harness.js');
  const harness = createToolHarness();
  const agentScope = await loadAgentScope();
  const manual = await loadBuildModule('tools/manual.js');
  const readOnly = await loadBuildModule('tools/read-only.js');
  manual.registerManualTools(harness.server, harness.bridge, harness.queue, agentScope);
  readOnly.registerReadOnlyTools(harness.server, harness.bridge, harness.queue, agentScope);
  await harness.getHandler('fill_sheet')({ start_cell: 'A1', data: 'one,two',
    visual_reason: 'Fill the regression-test sheet', client: 'Codex', is_final: false });
  await harness.getHandler('read_sheet')({ range: 'A1:B1' });
  const actions = harness.bridgeCalls.filter(call => call.message.type === 'mcp:execute-action');
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map(call => call.options.timeout), [150000, 150000]);
});

test('MCP execution timeout advice preserves the pending write without suggesting navigation', async () => {
  const { loadBuildModule } = require('./mcp-smoke-harness.js');
  const { mapFSBError } = await loadBuildModule('errors.js');
  const result = mapFSBError({ success: false, errorCode: 'ACTION_RESPONSE_TIMEOUT', outcome: 'unknown',
    mayHaveExecuted: true, error: 'The write exceeded its response deadline.' });
  const text = result.content.map(item => item.text).join('\n');
  assert.match(text, /may still be running/);
  assert.match(text, /outcome unknown/);
  assert.doesNotMatch(text, /navigate|close_tab/);
});
