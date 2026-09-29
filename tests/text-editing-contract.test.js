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
