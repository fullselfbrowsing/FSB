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

test('CDP native replacement selects once before one insertion', async () => {
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const commands = [];
  const context = {
    requireForegroundNativeInput: async () => {},
    prepareCdpTextTarget: async (_tab, _css, position) => ({ success: true, keyboardEnd: position === 'replace_all' }),
    chrome: { debugger: { sendCommand: async (_target, method, params) => commands.push({ method, params }) } },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    setTimeout, clearTimeout
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

test('editable target resolution finds the field inside a web component', () => {
  const start = actions.indexOf('  function resolveTextEntryTarget(');
  const end = actions.indexOf('\n  function readEditorText(', start);
  const roots = new Map();
  const resolve = vm.runInNewContext(`${actions.slice(start, end)}\nresolveTextEntryTarget`, {
    FSB: { openOrClosedShadowRoot: (element) => roots.get(element) || null }
  });
  const component = (fields, activeElement = null) => {
    const host = { tagName: 'TEXT-FIELD', isContentEditable: false, querySelectorAll: () => [] };
    roots.set(host, { activeElement, querySelectorAll: () => fields });
    return host;
  };
  const first = { tagName: 'INPUT' };
  const second = { tagName: 'INPUT' };
  assert.equal(resolve(component([first])), first);
  assert.equal(resolve(component([first, second], second)), second);
  assert.equal(resolve(component([first, second])), null);
  assert.equal(resolve({ tagName: 'DIV', isContentEditable: false, querySelectorAll: () => [] }), null);
});

function loadCdpTextInsertion(activeElement, commands, dom) {
  const start = background.indexOf('async function prepareCdpTextTarget(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const context = {
    document: { activeElement },
    location: { hostname: 'fixture.test', pathname: '/' },
    chrome: {
      dom,
      tabs: { get: async () => ({ active: true, windowId: 1 }) },
      windows: { get: async () => ({ focused: true, state: 'normal' }) },
      scripting: { executeScript: async ({ func, args }) => [{ result: func(...args) }] },
      debugger: { sendCommand: async (_target, method, params) => commands.push({ method, params }) }
    },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    setTimeout, clearTimeout
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

test('CDP append moves the caret to the end of an editor focused inside a nested frame', async () => {
  const commands = [];
  const dispatch = loadCdpTextInsertion({ tagName: 'IFRAME', querySelectorAll: () => [] }, commands);
  const result = await dispatch(42, ' more', 'end', null);
  assert.equal(result.success, true);
  assert.deepEqual(commands.map(c => c.method),
    ['Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.insertText']);
  assert.deepEqual(commands.map(c => c.params.type).slice(0, 2), ['keyDown', 'keyUp']);
  assert.equal(commands[0].params.key, 'ArrowDown');
  assert.equal(commands[0].params.modifiers, 4);
  assert.equal(commands[0].params.commands[0], 'moveToEndOfDocument');
});

test('CDP append moves a code editor cursor with its own shortcut, not a DOM selection', async () => {
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const commands = [];
  let prepared = 0;
  const dispatch = vm.runInNewContext(`${background.slice(start, end)}\ndispatchCdpTextInsertion`, {
    requireForegroundNativeInput: async () => {},
    prepareCdpTextTarget: async () => { prepared++; return { success: true }; },
    chrome: { debugger: { sendCommand: async (_target, method, params) => commands.push({ method, params }) } },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    setTimeout, clearTimeout
  });
  const result = await dispatch(42, ' more', 'end', null, { editorOwnsCaret: true });
  assert.equal(result.success, true);
  assert.equal(prepared, 0);
  assert.deepEqual(commands.map(c => c.method),
    ['Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.insertText']);
  assert.deepEqual(commands.map(c => c.params.type).slice(0, 2), ['keyDown', 'keyUp']);
  assert.equal(commands[0].params.key, 'ArrowDown');
  assert.equal(commands[0].params.modifiers, 4);
  assert.equal(commands[0].params.commands[0], 'moveToEndOfDocument');
  // Replacement selects all with the editor's own shortcut, also without a lookup.
  commands.length = 0;
  await dispatch(42, 'new', 'replace_all', null, { editorOwnsCaret: true });
  assert.equal(prepared, 0);
  assert.deepEqual(commands.map(c => c.method),
    ['Input.dispatchKeyEvent', 'Input.dispatchKeyEvent', 'Input.insertText']);
  assert.equal(commands[0].params.commands[0], 'selectAll');
  // A selector names the field, so the DOM lookup still runs.
  await dispatch(42, ' more', 'end', '#draft', { editorOwnsCaret: true });
  assert.equal(prepared, 1);
});

test('CDP append reaches a field focused inside a shadow root', async () => {
  const commands = [];
  const input = { tagName: 'INPUT', value: 'hello', focus() {},
    setSelectionRange(start, end) { this.selection = [start, end]; } };
  const host = { tagName: 'SHADOW-FIELD', isContentEditable: false, querySelectorAll: () => [],
    shadowRoot: { activeElement: input } };
  const dispatch = loadCdpTextInsertion(host, commands);
  const result = await dispatch(42, ' world', 'end', null);
  assert.equal(result.success, true, result.error);
  assert.deepEqual(input.selection, [5, 5]);
  assert.deepEqual(commands.map(c => c.method), ['Input.insertText']);
  assert.equal(commands[0].params.text, ' world');
});

test('CDP append reaches a field focused inside a closed shadow root', async () => {
  const commands = [];
  const input = { tagName: 'INPUT', value: 'hello', focus() {},
    setSelectionRange(start, end) { this.selection = [start, end]; } };
  const host = { tagName: 'CLOSED-FIELD', isContentEditable: false, querySelectorAll: () => [], shadowRoot: null };
  const closedRoot = { activeElement: input };
  const dispatch = loadCdpTextInsertion(host, commands,
    { openOrClosedShadowRoot: (node) => (node === host ? closedRoot : null) });
  const result = await dispatch(42, ' world', 'end', null);
  assert.equal(result.success, true, result.error);
  assert.deepEqual(input.selection, [5, 5]);
  assert.deepEqual(commands.map(c => c.method), ['Input.insertText']);
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

test('a content-script CDP insertion passes the code editor caret hint through', async () => {
  const calls = [];
  const handler = loadInsertHandler({
    dispatchCdpTextInsertion: async (...args) => { calls.push(args); return { success: true }; }
  });
  await handler({ text: ' more', position: 'end', editorOwnsCaret: true }, { tab: { id: 42 } }, () => {});
  await handler({ text: ' more', position: 'end' }, { tab: { id: 42 } }, () => {});
  assert.deepEqual(JSON.parse(JSON.stringify(calls.map(args => args.slice(2)))), [
    ['end', null, { editorOwnsCaret: true }],
    ['end', null, { editorOwnsCaret: false }]
  ]);
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
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' }, setTimeout, clearTimeout, ...context
  });
  const afterInput = load({
    requireForegroundNativeInput: async () => {},
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

test('a CDP text target on a hung page fails before any input is sent', async () => {
  const start = background.indexOf('async function prepareCdpTextTarget(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const commands = [];
  const dispatch = vm.runInNewContext(`${background.slice(start, end).replaceAll('6000', '20')}\ndispatchCdpTextInsertion`, {
    chrome: {
      scripting: { executeScript: () => new Promise(() => {}) },
      debugger: { sendCommand: async (_target, method) => commands.push(method) }
    },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    setTimeout, clearTimeout
  });
  const result = await dispatch(42, 'late', 'end', '#draft');
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'PAGE_UNRESPONSIVE');
  assert.equal(result.retryable, true);
  assert.equal(result.mayHaveExecuted, undefined);
  assert.deepEqual(commands, []);
});

test('a CDP text target script that runs after its deadline leaves the page alone', async () => {
  const start = background.indexOf('async function prepareCdpTextTarget(');
  const end = background.indexOf('\nasync function dispatchCdpTextInsertion', start);
  let injected;
  let focused = 0;
  const field = { tagName: 'TEXTAREA', value: 'kept', focus: () => { focused++; }, setSelectionRange() {} };
  const prepare = vm.runInNewContext(`${background.slice(start, end)}\nprepareCdpTextTarget`, {
    document: { querySelectorAll: () => [field] },
    chrome: { scripting: { executeScript: async (options) => {
      injected = options;
      return [{ result: options.func(...options.args) }];
    } } },
    setTimeout, clearTimeout
  });
  assert.equal((await prepare(42, '#draft', 'end')).success, true);
  assert.equal(focused, 1);
  const late = injected.func('#draft', 'end', Date.now() - 1);
  assert.equal(late.success, false);
  assert.equal(focused, 1);
});

test('CDP text input the page never acknowledges is reported as possibly executed', async () => {
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const dispatch = vm.runInNewContext(`${background.slice(start, end).replaceAll('8000', '20')}\ndispatchCdpTextInsertion`, {
    requireForegroundNativeInput: async () => {},
    prepareCdpTextTarget: async () => ({ success: true }),
    chrome: { debugger: { sendCommand: () => new Promise(() => {}) } },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    setTimeout, clearTimeout
  });
  await assert.rejects(dispatch(42, 'text', 'caret', null), (error) => error.mayHaveExecuted === true);
});

test('CDP text input sends nothing more once the page has timed out', async () => {
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const sent = [];
  let acknowledgeFirst;
  const dispatch = vm.runInNewContext(`${background.slice(start, end).replaceAll('8000', '20')}\ndispatchCdpTextInsertion`, {
    requireForegroundNativeInput: async () => {},
    prepareCdpTextTarget: async () => ({ success: true, keyboardEnd: true }),
    chrome: { debugger: { sendCommand: (_target, method, params) => {
      sent.push(params.type || method);
      // The page answers the first key only after the call has given up.
      return sent.length === 1 ? new Promise(resolve => { acknowledgeFirst = resolve; }) : Promise.resolve();
    } } },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    setTimeout, clearTimeout
  });
  await assert.rejects(dispatch(42, 'replacement', 'replace_all', '#draft'),
    (error) => error.mayHaveExecuted === true);
  acknowledgeFirst();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent, ['keyDown']);
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

// lengths: Docs paragraph text per measurement (before, then after) as a length or the text itself;
// null means no paragraph elements.
function loadClipboardPaste({ clipboardWrite = async () => {}, lengths = [0], keyReply = { success: true },
  foregroundReply = { success: true }, savedTexts = [], savedViewTexts = [], replaceAll = false,
  locationHref = 'https://docs.google.com/document/d/test/edit?authuser=tvnm%40example.test' } = {}) {
  const start = messaging.indexOf('  async function clipboardPasteHTML(');
  const end = messaging.indexOf('\n  /**', start);
  const sent = [];
  const savedUrls = [];
  let measurements = 0;
  let savesRead = 0;
  let viewsRead = 0;
  const context = {
    Blob: class {},
    ClipboardItem: class {},
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh', clipboard: { write: clipboardWrite } },
    document: { querySelectorAll: () => {
      const entry = lengths[Math.min(measurements++, lengths.length - 1)];
      if (entry === null) return [];
      return [{ textContent: typeof entry === 'string' ? entry : 'x'.repeat(entry) }];
    } },
    chrome: { runtime: { lastError: null, sendMessage: (message, reply) => {
      if (message.method === 'checkForeground') return reply(foregroundReply);
      sent.push(message); reply(keyReply);
    } } },
    logger: { warn() {}, debug() {} },
    URL, AbortSignal,
    location: savedTexts.length || savedViewTexts.length ? new URL(locationHref) : undefined,
    DOMParser: class {
      parseFromString(text) {
        return { querySelector: () => ({ textContent: text, querySelectorAll: () => [] }) };
      }
    },
    fetch: async url => {
      savedUrls.push(url);
      assert.equal(new URL(url).searchParams.get('authuser'), new URL(locationHref).searchParams.get('authuser'));
      if (new URL(url).pathname.endsWith('/mobilebasic')) {
        return { ok: true, headers: { get: () => 'text/html' },
          text: async () => savedViewTexts[Math.min(viewsRead++, savedViewTexts.length - 1)] };
      }
      if (!savedTexts.length) throw new Error('Cross-origin export blocked');
      return { ok: true, headers: { get: () => 'text/plain' },
        text: async () => savedTexts[Math.min(savesRead++, savedTexts.length - 1)] };
    },
    setTimeout: (fn) => fn()
  };
  const paste = vm.runInNewContext(`${messaging.slice(start, end)}\nclipboardPasteHTML`, context);
  return { paste: () => paste('<p><strong>hi</strong></p>', 'hi', { replaceAll }), sent, savedUrls, measurements: () => measurements };
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

test('a formatted paste that replaces an equally long selection stays uncertain', async () => {
  const result = await loadClipboardPaste({ lengths: ['old cat', 'old dog'] }).paste();
  assert.equal(result.success, false);
  assert.equal(result.nothingInserted, false);
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

test('a formatted paste whose key was never sent reports that nothing was inserted', async () => {
  // Unmeasurable Docs text, so only the key reply can decide.
  const busy = await loadClipboardPaste({ lengths: [null],
    keyReply: { success: false, error: 'The debugger for tab 1 is busy.', retryable: true } }).paste();
  assert.equal(busy.nothingInserted, true);
  const unattached = await loadClipboardPaste({ lengths: [null],
    keyReply: { success: false, error: 'Failed to attach debugger', result: { success: false, keyDownDispatched: false } } }).paste();
  assert.equal(unattached.nothingInserted, true);
  const sent = await loadClipboardPaste({ lengths: [null],
    keyReply: { success: false, error: 'Detached', result: { success: false, keyDownDispatched: true, mayHaveExecuted: true } } }).paste();
  assert.equal(sent.nothingInserted, false);
});

function formattedPasteBlock() {
  const start = actions.indexOf('// --- FORMATTED PASTE PATH ---');
  const end = actions.indexOf('// --- END FORMATTED PASTE PATH ---', start);
  return actions.slice(start, end);
}

test('Docs formatted replacement selects the document without deleting before paste', () => {
  const block = formattedPasteBlock();
  assert.equal(block.includes("key: 'Backspace'"), false);
  assert.match(block, /if \(!selected\?\.success\) return/);
  assert.ok(block.indexOf("key: 'a'") < block.indexOf('FSB.clipboardPasteHTML('));
});

test('Docs formatted paste falls back to plain insertion when it fails before pasting', () => {
  const block = formattedPasteBlock();
  assert.ok(block.indexOf('pasteStarted = true;') < block.indexOf('FSB.clipboardPasteHTML('));
  assert.match(block, /catch \(fmtError\) \{\s*if \(pasteStarted\) \{/);
});

function loadCdpRefusal() {
  const start = actions.indexOf('function cdpRefusedBeforeInput(');
  const end = actions.indexOf('\n}\n', start) + 2;
  return vm.runInNewContext(`${actions.slice(start, end)}\ncdpRefusedBeforeInput`, {});
}

test('a CDP insertion refused before input is a retryable failure, not an unknown outcome', () => {
  const refused = loadCdpRefusal();
  const busy = refused({ success: false, error: 'busy', code: 'SCREENSHOT_DEBUGGER_BUSY', retryable: true });
  assert.equal(busy.success, false);
  assert.equal(busy.outcome, 'failed');
  assert.equal(busy.mayHaveExecuted, false);
  assert.equal(busy.retryable, true);
  assert.equal(busy.code, 'SCREENSHOT_DEBUGGER_BUSY');
  const hung = refused({ success: false, errorCode: 'PAGE_UNRESPONSIVE', retryable: true,
    error: 'The page did not respond while locating the editable field. No text was sent.' });
  assert.equal(hung.outcome, 'failed');
  assert.equal(hung.retryable, true);
  assert.equal(refused({ success: false, outcome: 'unknown', mayHaveExecuted: true, retryable: false }), null);
  assert.equal(refused({ success: true }), null);
  assert.equal(refused(undefined), null);
});

test('every content-script CDP insertion keeps the background reply for classification', () => {
  const sites = actions.split("action: 'cdpInsertText'").length - 1;
  assert.equal(sites, 3);
  assert.equal(actions.split('{ response }))').length - 1, sites);
  assert.equal(actions.split('cdpRefusedBeforeInput(').length - 1, sites + 1);
  assert.equal(actions.includes('clearSent'), false);
});

function loadTypeAction({ docs = false, formatted = false, missingTarget = false,
  editorType = null, cdpReply = { success: true }, rejectDomInput = false, commandSucceeds = true } = {}) {
  const requests = [];
  const events = [];
  let domInsertions = 0;
  const field = {
    tagName: docs ? 'DIV' : 'TEXTAREA', value: 'old', isContentEditable: false,
    focus() {}, click() {}, select() { this.selection = [0, this.value.length]; },
    setSelectionRange(start, end) { this.selection = [start, end]; },
    getRootNode() { return { activeElement: this }; }, getAttribute() { return null; },
    dispatchEvent(event) {
      events.push({ type: event.type, key: event.key });
      if (rejectDomInput && event.type === 'input') this.value = 'old';
    },
  };
  const logger = { logActionExecution() {}, debug() {}, warn() {}, error() {} };
  const context = {
    logger, FSB: { sessionId: 'test',
      querySelectorWithShadow: () => missingTarget ? null : field,
      smartEnsureReady: async () => ({ ready: true }), isCanvasBasedEditor: () => docs,
      detectCodeEditor: () => ({ isCodeEditor: Boolean(editorType), type: editorType }),
      hasMarkdownFormatting: () => formatted, stripMarkdown: text => text.replaceAll('**', ''),
      markdownToHTML: text => `<b>${text}</b>`, clipboardPasteHTML: async () => ({ success: true }),
      generateMessagingSelectors: () => [], getClassName: () => '' },
    window: { location: { hostname: docs ? 'docs.google.com' : 'example.test', pathname: docs ? '/document/d/test/edit' : '/' } },
    document: { querySelector: () => field, querySelectorAll: () => [],
      execCommand(_command, _ui, text) {
        domInsertions++;
        if (!commandSucceeds) return false;
        const [start, end] = field.selection;
        field.value = field.value.slice(0, start) + text + field.value.slice(end);
        return true;
      } },
    chrome: { runtime: { sendMessage(request, callback) { requests.push(request); callback(request.action === 'monacoEditorInsert'
        ? { success: false, error: 'No editor API found on page' } : cdpReply); } } },
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    Event: class { constructor(type) { this.type = type; } },
    KeyboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    waitForStability: async () => {}, waitForPageStability: async () => {},
    captureActionState: () => ({}), verifyActionEffect: () => ({ verified: true, changes: {} }),
    captureElementDetails: () => ({}), actionRecorder: { record() {} },
    cdpRefusedBeforeInput: loadCdpRefusal(),
  };
  const helpers = actions.slice(actions.indexOf('  function normalizeEditorText('),
    actions.indexOf('// COORDINATE FALLBACK UTILITIES'));
  const method = actions.slice(actions.indexOf('  type: async (params) => {'),
    actions.indexOf('  // Press Enter key on an element with verification'));
  const type = vm.runInNewContext(`${helpers}\n({${method}}).type`, context);
  return { type, field, requests, events, domInsertions: () => domInsertions };
}

for (const formatted of [false, true]) {
  for (const [options, expected] of [ [{}, false], [{ clear_first: true }, true],
    [{ clear_first: false }, false], [{ clearFirst: true }, true], [{ clearFirst: false }, false],
    [{ clear_first: true, clearFirst: false }, false] ]) {
    test(`Docs ${formatted ? 'formatted' : 'plain'} typing preserves explicit/default replacement: ${JSON.stringify(options)}`, async () => {
      const { type, requests } = loadTypeAction({ docs: true, formatted });
      const result = await type({ selector: '#document', text: formatted ? '**new**' : 'new', ...options });
      assert.equal(result.success, true, result.error);
      if (formatted) {
        assert.equal(requests.filter(r => r.action === 'keyboardDebuggerAction').length, expected ? 1 : 0);
      } else {
        assert.equal(requests.find(r => r.action === 'cdpInsertText').clearFirst, expected);
      }
    });
  }
}

test('Docs selector fallback inserts at the cursor by default', async () => {
  const { type, requests } = loadTypeAction({ docs: true, missingTarget: true });
  assert.equal((await type({ selector: '#missing', text: 'new' })).success, true);
  assert.equal(requests.find(r => r.action === 'cdpInsertText').clearFirst, false);
});

test('ordinary fields still replace by default and append when requested', async () => {
  for (const [options, expected] of [[{}, 'new'], [{ clear_first: false }, 'oldnew']]) {
    const { type, field } = loadTypeAction();
    assert.equal((await type({ selector: '#input', text: 'new', ...options })).success, true);
    assert.equal(field.value, expected);
  }
});

test('code editor CDP typing appends at the end and replaces by default', async () => {
  for (const [options, position] of [[{ clear_first: false }, 'end'], [{}, 'replace_all']]) {
    const { type, requests } = loadTypeAction({ editorType: 'ace' });
    assert.equal((await type({ selector: '#editor', text: 'new', ...options })).success, true);
    const request = requests.find(r => r.action === 'cdpInsertText');
    assert.equal(request.position, position);
    assert.equal(request.editorOwnsCaret, true);
  }
});

for (const editorType of ['ace', 'codemirror']) {
  test(`${editorType} DOM fallback runs once after confirmed CDP refusal`, async () => {
    const { type, field, domInsertions, requests } = loadTypeAction({ editorType,
      cdpReply: { success: false, code: 'SCREENSHOT_DEBUGGER_BUSY', retryable: true } });
    const result = await type({ selector: '#editor', text: 'new' });
    assert.equal(result.success, true, result.error);
    assert.equal(field.value, 'new');
    assert.equal(domInsertions(), 1);
    assert.equal(requests.filter(r => r.action === 'cdpInsertText').length, 1);
  });
}

for (const reply of [null, {}, { success: false, outcome: 'unknown' },
  { success: false, mayHaveExecuted: true, outcome: 'unknown' }]) {
  test(`uncertain CDP insertion never falls back: ${JSON.stringify(reply)}`, async () => {
    const other = loadTypeAction({ editorType: 'ace', cdpReply: reply });
    const result = await other.type({ selector: '#editor', text: 'new' });
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.mayHaveExecuted, true);
    assert.equal(other.domInsertions(), 0);
    assert.equal(other.field.value, 'old');
  });
}

test('DOM editor fallback cannot report success when the editor rejects the input', async () => {
  const { type, domInsertions } = loadTypeAction({ editorType: 'ace', rejectDomInput: true, commandSucceeds: false,
    cdpReply: { success: false, mayHaveExecuted: false, retryable: true } });
  // A refused execCommand allows the value/input-event fallback to run.
  // The simulated editor resets its hidden input when it rejects that event.
  const result = await type({ selector: '#editor', text: 'new' });
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
  assert.equal(domInsertions(), 1);
});

test('an input handler consuming text before Enter cannot report that retrying is safe', async () => {
  const { type, events } = loadTypeAction({ rejectDomInput: true });
  const result = await type({ selector: '#input', text: 'new', pressEnter: true });
  assert.equal(result.success, false);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
  assert.equal(events.filter(event => event.key === 'Enter').length, 0);
});

for (const type of ['email', 'number']) {
  for (const position of ['end', 'replace_all']) {
    test(`unsupported ${type} DOM selection uses native ${position} placement`, async () => {
      const commands = [];
      const field = { tagName: 'INPUT', value: '12', focus() {},
        setSelectionRange() { throw Object.assign(new Error('unsupported selection'), { name: 'InvalidStateError' }); } };
      const dispatch = loadCdpTextInsertion(field, commands);
      assert.equal((await dispatch(42, '34', position, null)).success, true);
      assert.equal(commands.filter(c => c.method === 'Input.insertText').length, 1);
      assert.equal(commands[0].params.key, position === 'end' ? 'End' : 'a');
    });
  }
}

test('unexpected selection failure sends no CDP input', async () => {
  const commands = [];
  const dispatch = loadCdpTextInsertion({ tagName: 'INPUT', value: 'old', focus() {},
    setSelectionRange() { throw new Error('selection failed'); } }, commands);
  const result = await dispatch(42, 'new', 'replace_all');
  assert.equal(result.success, false);
  assert.equal(result.mayHaveExecuted, false);
  assert.deepEqual(commands, []);
});

for (const state of [
  { active: false, focused: true, state: 'normal' },
  { active: true, focused: false, state: 'normal' },
  { active: true, focused: true, state: 'minimized' }
]) {
  test(`native text placement refuses a hidden or unfocused target without sending input: ${JSON.stringify(state)}`, async () => {
    const start = background.indexOf('async function requireForegroundNativeInput(');
    const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
    const sent = [];
    const dispatch = vm.runInNewContext(`${background.slice(start, end)}\ndispatchCdpTextInsertion`, {
      prepareCdpTextTarget: async () => ({ success: true, nestedFrame: true }),
      chrome: { tabs: { get: async () => ({ active: state.active, windowId: 1 }) },
        windows: { get: async () => state },
        debugger: { sendCommand: async (...args) => sent.push(args) } },
      setTimeout, clearTimeout
    });
    await assert.rejects(dispatch(42, 'new', 'replace_all'), error =>
      error.code === 'TAB_NOT_FOREGROUND' && error.mayHaveExecuted === false && error.retryable === true);
    assert.equal(sent.length, 0);
    assert.equal((await dispatch(42, 'new', 'caret')).success, true);
    assert.equal(sent.length, 1);
  });
}

test('Docs plain replacement uses its own select-all followed by deletion and one insertion', async () => {
  const sent = [];
  const start = background.indexOf('async function dispatchCdpTextInsertion(');
  const end = background.indexOf('\nasync function handleCDPInsertTextUnlocked', start);
  const dispatch = vm.runInNewContext(`${background.slice(start, end)}\ndispatchCdpTextInsertion`, {
    prepareCdpTextTarget: async () => ({ success: true, nestedFrame: true, docsCanvas: true }),
    requireForegroundNativeInput: async () => {},
    navigator: { platform: 'MacIntel', userAgent: 'Macintosh' },
    chrome: { debugger: { sendCommand: async (_target, method, params) => sent.push({ method, params }) } },
    setTimeout: (fn, ms) => setTimeout(fn, ms === 150 ? 0 : ms), clearTimeout
  });
  await dispatch(42, 'replacement', 'replace_all');
  assert.deepEqual(sent.map(c => c.params.key || c.method), ['a', 'a', 'Backspace', 'Backspace', 'Input.insertText']);
  assert.equal(sent[0].params.commands, undefined);
  assert.equal(sent.at(-1).params.text, 'replacement');
});

test('native paste on macOS sends the paste editing command exactly once', async () => {
  const harness = loadClipboardPaste({ lengths: [0, 2] });
  assert.equal((await harness.paste()).success, true);
  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0].commands[0], 'paste');
});

test('a foreground refusal never falls back to writing a code editor hidden textarea', async () => {
  const harness = loadTypeAction({ editorType: 'ace', cdpReply: {
    success: false, code: 'TAB_NOT_FOREGROUND', retryable: true, mayHaveExecuted: false
  } });
  const result = await harness.type({ selector: '#editor', text: 'new' });
  assert.equal(result.success, false);
  assert.equal(result.code, 'TAB_NOT_FOREGROUND');
  assert.equal(harness.domInsertions(), 0);
  assert.equal(harness.field.value, 'old');
});

test('canvas Docs can confirm an equally long formatted replacement from its saved text', async () => {
  const h = loadClipboardPaste({ lengths: [null], savedTexts: ['no', 'no', 'hi'], replaceAll: true });
  const result = await h.paste();
  assert.equal(result.success, true);
  assert.equal(result.verifiedVia, 'saved_document');
  assert.equal(h.sent.length, 1);
});

test('a stale Docs export never authorizes a second insertion', async () => {
  const h = loadClipboardPaste({ lengths: [null], savedTexts: ['old'] });
  const result = await h.paste();
  assert.equal(result.success, false);
  assert.equal(result.nothingInserted, false);
  assert.equal(h.sent.length, 1);
});

test('Docs confirms a formatted replacement through its saved HTML when export is blocked', async () => {
  const h = loadClipboardPaste({ lengths: [null], savedViewTexts: ['old', 'old', 'hi'], replaceAll: true });
  const result = await h.paste();
  assert.equal(result.success, true);
  assert.equal(result.verifiedVia, 'saved_document');
  assert.equal(h.sent.length, 1);
});

test('a stale saved HTML view never authorizes a second insertion', async () => {
  const h = loadClipboardPaste({ lengths: [null], savedViewTexts: ['old'] });
  const result = await h.paste();
  assert.equal(result.success, false);
  assert.equal(result.nothingInserted, false);
  assert.equal(h.sent.length, 1);
});

test('Docs saved-document verification keeps the signed-in account path', async () => {
  const h = loadClipboardPaste({ lengths: [null], savedViewTexts: ['old', 'hi'], replaceAll: true,
    locationHref: 'https://docs.google.com/document/u/2/d/test/edit' });
  assert.equal((await h.paste()).success, true);
  assert.ok(h.savedUrls.every(url => new URL(url).pathname.startsWith('/document/u/2/d/test/')));
  assert.equal(h.savedUrls.filter(url => new URL(url).pathname.endsWith('/export')).length, 1);
});

test('a background formatted paste refuses before touching the clipboard', async () => {
  let writes = 0;
  const h = loadClipboardPaste({ clipboardWrite: async () => { writes++; },
    foregroundReply: { success: false, code: 'TAB_NOT_FOREGROUND', retryable: true } });
  const result = await h.paste();
  assert.equal(result.code, 'TAB_NOT_FOREGROUND');
  assert.equal(result.nothingInserted, true);
  assert.equal(writes, 0);
  assert.equal(h.sent.length, 0);
});

function editorApiHarness(document, globals = {}) {
  const start = background.indexOf('async function handleMonacoEditorInsert(');
  const end = background.indexOf('\nasync function handleListTabs', start);
  const handler = vm.runInNewContext(`${background.slice(start, end)}\nhandleMonacoEditorInsert`, {
    document, ...globals,
    chrome: { scripting: { executeScript: async ({ func, args }) => [{ result: func(...args) }] } }
  });
  return async request => {
    let reply;
    await handler(request, { tab: { id: 42 } }, result => { reply = result; });
    return reply;
  };
}

test('a selector chooses its Monaco model even when neither editor has foreground focus', async () => {
  const first = { contains: node => node === first };
  const second = { contains: node => node === second };
  const edits = [[], []];
  const editors = [first, second].map((node, i) => ({
    getDomNode: () => node, hasTextFocus: () => false,
    getModel: () => ({ getFullModelRange: () => ({ endLineNumber: 1, endColumn: 4 }),
      getLineCount: () => 1, getLineMaxColumn: () => 7 }),
    executeEdits: (_source, operations) => edits[i].push(operations), setPosition() {}
  }));
  const insert = editorApiHarness({ querySelector: () => second }, { monaco: {
    editor: { getEditors: () => editors, getModels: () => [] }
  } });
  const result = await insert({ text: 'new', selector: '#second', clearFirst: true });
  assert.equal(result.success, true);
  assert.equal(edits[0].length, 0);
  assert.equal(edits[1].length, 1);
});

for (const binding of ['cmTile', 'rootView', 'cmView']) {
  test(`CodeMirror 6 appends and replaces through its ${binding} model binding`, async () => {
    let value = 'old';
    let transactions = 0;
    const view = { state: { get doc() { return { length: value.length }; } }, dispatch({ changes, selection }) {
      transactions++;
      value = value.slice(0, changes.from) + changes.insert + value.slice(changes.to);
      assert.equal(selection.anchor, value.length);
    } };
    const content = binding === 'cmTile' ? { cmTile: { root: { view } } }
      : binding === 'rootView' ? { cmView: { rootView: { view } } } : { cmView: { view } };
    const wrapper = { querySelector: () => content };
    const target = { closest: selector => selector === '.cm-editor' ? wrapper : null };
    const insert = editorApiHarness({ querySelector: () => target });
    assert.equal((await insert({ text: ' more', clearFirst: false, selector: '#cm' })).success, true);
    assert.equal(value, 'old more');
    assert.equal((await insert({ text: 'replacement', clearFirst: true, selector: '#cm' })).success, true);
    assert.equal(value, 'replacement');
    assert.equal(transactions, 2);
  });
}
