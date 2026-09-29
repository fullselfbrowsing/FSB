'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { getToolByName } = require('../extension/ai/tool-definitions.js');

const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const actions = fs.readFileSync(path.join(__dirname, '../extension/content/actions.js'), 'utf8');

test('text tools publish replacement, append, and position controls', () => {
  assert.equal(getToolByName('type_text').inputSchema.properties.clear_first.type, 'boolean');
  assert.deepEqual(getToolByName('insert_text').inputSchema.properties.position.enum,
    ['caret', 'end', 'replace_all']);
  assert.equal(getToolByName('insert_text').inputSchema.properties.selector.type, 'string');
});

test('CDP replacement selects once before one insertion', async () => {
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const commands = [];
  const context = {
    prepareCdpTextTarget: async () => ({ success: true }),
    chrome: { debugger: { sendCommand: async (_target, method, params) => commands.push({ method, params }) } },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' }
  };
  const dispatch = vm.runInNewContext(`${background.slice(start, end)}\ndispatchCdpTextInsertion`, context);
  const result = await dispatch(42, 'new\ntext', 'replace_all', '#draft');
  assert.equal(result.success, true);
  assert.deepEqual(commands.map(c => c.method),
    ['Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.insertText']);
  assert.equal(commands[0].params.windowsVirtualKeyCode, 65);
  assert.equal(commands[0].params.commands[0], 'selectAll');
  assert.equal(commands[2].params.text, 'new\ntext');
  commands.length = 0;
  await dispatch(42, ' more', 'end', '#draft');
  assert.deepEqual(commands.map(c => c.method), ['Input.insertText']);
});

test('editable target resolution rejects ambiguous wrappers', () => {
  const start = actions.indexOf('  function resolveTextEntryTarget(');
  const end = actions.indexOf('\n  function readEditorText(', start);
  const resolve = vm.runInNewContext(`${actions.slice(start, end)}\nresolveTextEntryTarget`);
  const first = { tagName: 'TEXTAREA' };
  const second = { tagName: 'TEXTAREA' };
  assert.equal(resolve({ tagName: 'DIV', isContentEditable: false,
    querySelectorAll: () => [first, second] }), null);
  assert.equal(resolve({ tagName: 'DIV', isContentEditable: false,
    querySelectorAll: () => [first] }), first);
});

function loadCdpTextInsertion(activeElement, commands) {
  const start = background.indexOf('async function prepareCdpTextTarget(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const context = {
    document: { activeElement },
    chrome: {
      scripting: { executeScript: async ({ func, args }) => [{ result: func(...args) }] },
      debugger: { sendCommand: async (_target, method, params) => commands.push({ method, params }) }
    },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' }
  };
  return vm.runInNewContext(`${background.slice(start, end)}\ndispatchCdpTextInsertion`, context);
}

test('CDP replacement reaches a canvas editor focused inside a nested frame', async () => {
  const commands = [];
  const dispatch = loadCdpTextInsertion({ tagName: 'IFRAME', querySelectorAll: () => [] }, commands);
  const result = await dispatch(42, 'replacement', 'replace_all', null);
  assert.equal(result.success, true);
  assert.deepEqual(commands.map(c => c.method),
    ['Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.insertText']);
  assert.equal(commands[2].params.text, 'replacement');
});

test('CDP replacement still refuses a focused element that is not editable', async () => {
  const commands = [];
  const dispatch = loadCdpTextInsertion(
    { tagName: 'DIV', isContentEditable: false, querySelectorAll: () => [] }, commands);
  const result = await dispatch(42, 'replacement', 'replace_all', null);
  assert.equal(result.success, false);
  assert.deepEqual(commands, []);
});

test('a CDP insertion that is refused before dispatch releases the debugger', async () => {
  const start = background.indexOf('async function handleCDPInsertTextUnlocked(');
  const end = background.indexOf('\n/**\n * Handle CDP-based mouse click', start);
  const detached = [];
  const responses = [];
  const refusal = { success: false, error: 'Target is not editable' };
  const context = {
    attachFsbDebugger: async () => {},
    dispatchCdpTextInsertion: async () => refusal,
    automationLogger: { logActionExecution() {}, debug() {} },
    cdpFailureResult: (error) => ({ success: false, error: error.message }),
    chrome: { debugger: { detach: async (target) => detached.push(target) } }
  };
  const handler = vm.runInNewContext(`${background.slice(start, end)}\nhandleCDPInsertTextUnlocked`, context);
  await handler({ text: 'replacement', clearFirst: true }, { tab: { id: 42 } }, (response) => responses.push(response));
  assert.deepEqual(JSON.parse(JSON.stringify(detached)), [{ tabId: 42 }]);
  assert.deepEqual(responses, [refusal]);
});
