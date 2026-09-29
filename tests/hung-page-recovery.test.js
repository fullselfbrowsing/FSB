'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const bridge = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-bridge-client.js'), 'utf8');
const dispatcher = fs.readFileSync(path.join(__dirname, '../extension/ws/mcp-tool-dispatcher.js'), 'utf8');

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
