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
  const context = { sendMessageWithRetry: () => new Promise(() => {}), setTimeout, clearTimeout };
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
