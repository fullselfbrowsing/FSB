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

function busyDebuggerError() {
  const error = new Error('The debugger for tab 42 is busy. Retry the operation.');
  error.code = 'SCREENSHOT_DEBUGGER_BUSY';
  error.retryable = true;
  return error;
}

const cdpFailureResultStub = (error, extra) => Object.assign({
  success: false, error: error.message, code: error.code, retryable: Boolean(error.retryable)
}, extra || {});

function loadInsertHandler(overrides) {
  const start = background.indexOf('async function handleCDPInsertTextUnlocked(');
  const end = background.indexOf('\n/**\n * Handle CDP-based mouse click', start);
  const context = {
    attachFsbDebugger: async () => {},
    dispatchCdpTextInsertion: async () => ({ success: true }),
    automationLogger: { logActionExecution() {}, debug() {} },
    cdpFailureResult: cdpFailureResultStub,
    chrome: { debugger: { detach: async () => {} } },
    ...overrides
  };
  return vm.runInNewContext(`${background.slice(start, end)}\nhandleCDPInsertTextUnlocked`, context);
}

test('a CDP insertion that cannot attach the debugger stays retryable', async () => {
  let dispatched = 0;
  const detached = [];
  const responses = [];
  const handler = loadInsertHandler({
    attachFsbDebugger: async () => { throw busyDebuggerError(); },
    dispatchCdpTextInsertion: async () => { dispatched++; return { success: true }; },
    chrome: { debugger: { detach: async (target) => detached.push(target) } }
  });
  await handler({ text: 'replacement' }, { tab: { id: 42 } }, (response) => responses.push(response));
  assert.equal(responses.length, 1);
  assert.equal(responses[0].code, 'SCREENSHOT_DEBUGGER_BUSY');
  assert.equal(responses[0].retryable, true);
  assert.equal(responses[0].mayHaveExecuted, undefined);
  assert.equal(dispatched, 0);
  assert.equal(detached.length, 0);
});

test('a CDP insertion that fails after input began stays uncertain', async () => {
  const responses = [];
  const handler = loadInsertHandler({
    dispatchCdpTextInsertion: async () => {
      const error = new Error('Detached while handling command.');
      error.mayHaveExecuted = true;
      throw error;
    }
  });
  await handler({ text: 'replacement' }, { tab: { id: 42 } }, (response) => responses.push(response));
  assert.equal(responses[0].outcome, 'unknown');
  assert.equal(responses[0].mayHaveExecuted, true);
  assert.equal(responses[0].retryable, false);
});

test('CDP text dispatch marks only failures after input as possibly executed', async () => {
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const load = (context) => vm.runInNewContext(`${background.slice(start, end)}\ndispatchCdpTextInsertion`, {
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' }, ...context
  });
  const afterInput = load({
    prepareCdpTextTarget: async () => ({ success: true }),
    chrome: { debugger: { sendCommand: async (_target, method) => {
      if (method === 'Input.insertText') throw new Error('Detached while handling command.');
    } } }
  });
  await assert.rejects(afterInput(42, 'text', 'replace_all', '#draft'), (error) => error.mayHaveExecuted === true);
  let commands = 0;
  const beforeInput = load({
    prepareCdpTextTarget: async () => { throw new Error('Cannot access contents of the page.'); },
    chrome: { debugger: { sendCommand: async () => { commands++; } } }
  });
  await assert.rejects(beforeInput(42, 'text', 'caret', '#draft'), (error) => error.mayHaveExecuted === undefined);
  assert.equal(commands, 0);
});

test('a direct CDP insertion that cannot attach the debugger stays retryable', async () => {
  const start = background.indexOf('async function executeCDPToolDirectUnlocked(');
  const end = background.indexOf('\nasync function handleMonacoEditorInsert', start);
  let dispatched = 0;
  const context = {
    attachFsbDebugger: async () => { throw busyDebuggerError(); },
    dispatchCdpTextInsertion: async () => { dispatched++; return { success: true }; },
    automationLogger: { logActionExecution() {}, debug() {} },
    cdpFailureResult: cdpFailureResultStub,
    chrome: { debugger: { detach: async () => {} } }
  };
  const execute = vm.runInNewContext(`${background.slice(start, end)}\nexecuteCDPToolDirectUnlocked`, context);
  const result = await execute({ tool: 'cdpInsertText', params: { text: 'replacement' } }, 42);
  assert.equal(result.code, 'SCREENSHOT_DEBUGGER_BUSY');
  assert.equal(result.retryable, true);
  assert.equal(result.mayHaveExecuted, undefined);
  assert.equal(dispatched, 0);
});

const messaging = fs.readFileSync(path.join(__dirname, '../extension/content/messaging.js'), 'utf8');

// lengths: Docs paragraph text length per measurement (before, then after); null means no paragraph elements.
function loadClipboardPaste({ clipboardWrite = async () => {}, lengths = [0], keyReply = { success: true } } = {}) {
  const start = messaging.indexOf('  async function clipboardPasteHTML(');
  const end = messaging.indexOf('\n  /**', start);
  const sent = [];
  let measurements = 0;
  const context = {
    Blob: class {},
    ClipboardItem: class {},
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh', clipboard: { write: clipboardWrite } },
    document: { querySelectorAll: () => {
      const length = lengths[Math.min(measurements++, lengths.length - 1)];
      return length === null ? [] : [{ textContent: 'x'.repeat(length) }];
    } },
    chrome: { runtime: { lastError: null, sendMessage: (message, reply) => { sent.push(message); reply(keyReply); } } },
    logger: { warn() {}, debug() {} },
    setTimeout: (fn) => fn()
  };
  const paste = vm.runInNewContext(`${messaging.slice(start, end)}\nclipboardPasteHTML`, context);
  return { paste: () => paste('<p><strong>hi</strong></p>', 'hi'), sent, measurements: () => measurements };
}

test('a formatted paste whose clipboard write fails reports that nothing was inserted', async () => {
  const harness = loadClipboardPaste({ clipboardWrite: async () => { throw new Error('Document is not focused.'); } });
  const result = await harness.paste();
  assert.equal(result.success, false);
  assert.equal(result.nothingInserted, true);
  assert.equal(harness.sent.length, 0);
});

test('a formatted paste that leaves measurable Docs text unchanged reports that nothing was inserted', async () => {
  const harness = loadClipboardPaste({ lengths: [5] });
  const result = await harness.paste();
  assert.equal(result.success, false);
  assert.equal(result.nothingInserted, true);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.measurements(), 5);
});

test('a formatted paste stays uncertain when Docs text cannot be measured or changed oddly', async () => {
  assert.equal((await loadClipboardPaste({ lengths: [null] }).paste()).nothingInserted, false);
  assert.equal((await loadClipboardPaste({ lengths: [5, 3] }).paste()).nothingInserted, false);
  const keyFailed = await loadClipboardPaste({ lengths: [5], keyReply: { success: false, error: 'Detached' } }).paste();
  assert.equal(keyFailed.success, false);
  assert.equal(keyFailed.nothingInserted, false);
});

test('a formatted paste that lands late still counts as inserted', async () => {
  const result = await loadClipboardPaste({ lengths: [5, 5, 5, 9] }).paste();
  assert.equal(result.success, true);
  assert.equal(result.textLenAfter, 9);
});

test('Docs formatted paste falls back to plain insertion only when nothing was inserted', () => {
  const start = actions.indexOf('// --- FORMATTED PASTE PATH ---');
  const end = actions.indexOf('// --- END FORMATTED PASTE PATH ---', start);
  const block = actions.slice(start, end);
  assert.match(block, /if \(!pasteResult\.nothingInserted\) \{\s*return \{ success: false, outcome: 'unknown', mayHaveExecuted: true,/);
  assert.equal(block.split("outcome: 'unknown'").length - 1, 2);
});
