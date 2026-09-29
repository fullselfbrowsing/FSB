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
