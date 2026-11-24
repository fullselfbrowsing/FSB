'use strict';

// Regression tests for #156 (autopilot acted through a disabled button) and
// #157 (stuck detector never fired in real sessions).
// Run: node --test tests/autopilot-disabled-and-stuck.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const background = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
const accessibility = fs.readFileSync(path.join(__dirname, '../extension/content/accessibility.js'), 'utf8');

function sliceFunction(source, signature) {
  const start = source.indexOf(signature);
  assert(start >= 0, 'missing ' + signature);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unterminated ' + signature);
}

// Minimal DOM-ish element: supports matches(':disabled'), closest(), attributes.
function el(tagName, opts = {}) {
  const node = {
    nodeType: 1, tagName, parentNode: null, attrs: opts.attrs || {},
    disabled: !!opts.disabled, innerText: opts.text || '',
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); },
    matches(sel) {
      return sel.split(',').map(s => s.trim()).some(s => {
        if (s === ':disabled') return ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FIELDSET'].includes(this.tagName) && this.disabled;
        if (s === 'button:disabled') return this.tagName === 'BUTTON' && this.disabled;
        if (s === '[aria-disabled="true"]') return this.getAttribute('aria-disabled') === 'true';
        if (s === '[inert], [inert] *' || s === '[inert]') return this.hasAttribute('inert');
        if (s === '[inert] *') { let p = this.parentNode; while (p) { if (p.hasAttribute && p.hasAttribute('inert')) return true; p = p.parentNode; } return false; }
        return false;
      });
    },
    closest(sel) { let n = this; while (n && n.nodeType === 1) { if (n.matches(sel)) return n; n = n.parentNode; } return null; },
  };
  return node;
}
function child(parent, node) { node.parentNode = parent; return node; }

// --- #156: cdpClickAt disabled-target probe -------------------------------

const probeSource = sliceFunction(background, 'function fsbDisabledTargetProbe(');
function runProbe(hit) {
  return vm.runInNewContext(probeSource + '\nfsbDisabledTargetProbe(5, 5)', {
    document: { elementFromPoint: () => hit },
  });
}

test('#156 probe flags a natively disabled button', () => {
  const r = runProbe(el('BUTTON', { disabled: true, text: 'Place order' }));
  assert.equal(r.disabled, true);
  assert.equal(r.reason, 'native_disabled');
});

test('#156 probe flags aria-disabled button and its inner span', () => {
  const btn = el('BUTTON', { attrs: { 'aria-disabled': 'true' }, text: 'Place order' });
  const span = child(btn, el('SPAN', { text: 'Place order' }));
  assert.equal(runProbe(btn).reason, 'aria_disabled');
  assert.equal(runProbe(span).reason, 'aria_disabled');
});

test('#156 probe flags inner span of a natively disabled button', () => {
  const btn = el('BUTTON', { disabled: true });
  assert.equal(runProbe(child(btn, el('SPAN'))).reason, 'native_disabled');
});

test('#156 probe passes an enabled control in the first legend of a disabled fieldset', () => {
  // The browser exempts first-legend controls from fieldset disabling, so the
  // control itself does not match :disabled while the fieldset does.
  const fieldset = el('FIELDSET', { disabled: true });
  const legend = child(fieldset, el('LEGEND'));
  const toggle = child(legend, el('INPUT'));
  assert.equal(runProbe(toggle).disabled, false);
  assert.equal(runProbe(child(legend, el('SPAN'))).disabled, false);
  // A control the fieldset does disable reports itself as :disabled.
  assert.equal(runProbe(child(fieldset, el('BUTTON', { disabled: true }))).reason, 'native_disabled');
});

test('#156 probe passes enabled targets and empty hits', () => {
  assert.equal(runProbe(child(el('DIV'), el('BUTTON'))).disabled, false);
  assert.equal(runProbe(null).disabled, false);
});

test('#156 cdpClickAt probes before dispatching the trusted press', () => {
  const block = background.slice(background.indexOf("case 'cdpClickAt': {"), background.indexOf("case 'cdpClickAndHold': {"));
  const probeAt = block.indexOf('fsbDisabledTargetProbe');
  const refuseAt = block.indexOf("code: 'TARGET_DISABLED'");
  const pressAt = block.indexOf("type: 'mousePressed'");
  assert(probeAt > 0 && refuseAt > probeAt && pressAt > refuseAt, 'probe -> refuse -> press order');
  assert.match(block.slice(refuseAt - 400, refuseAt), /success: false/);
});

// --- #156: content readiness checks ---------------------------------------

const enabledSource = sliceFunction(accessibility, 'function checkElementEnabled(');
const checkElementEnabled = vm.runInNewContext(enabledSource + '\ncheckElementEnabled', {});

test('#156 checkElementEnabled rejects a child of a disabled button', () => {
  const btn = el('BUTTON', { disabled: true });
  const r = checkElementEnabled(child(btn, el('SPAN')));
  assert.equal(r.passed, false);
  assert.match(r.reason, /Ancestor button is disabled/);
});

test('#156 checkElementEnabled still passes an enabled button child', () => {
  assert.equal(checkElementEnabled(child(el('BUTTON'), el('SPAN'))).passed, true);
});

test('#156 quick readiness fast path considers disabled ancestors', () => {
  const quick = sliceFunction(accessibility, 'function performQuickReadinessCheck(');
  assert.match(quick, /closest\('button:disabled, \[aria-disabled="true"\]'\)/);
  assert.match(quick, /&& !disabledAncestor/);
});

// --- #157: stuck detector must be wired into the session hook pipeline ---

test('#157 createSessionHooks registers stuck detection on AFTER_ITERATION', async () => {
  const { HookPipeline, LIFECYCLE_EVENTS } = require('../extension/ai/hook-pipeline.js');
  const { createSafetyBreakerHook, createStuckDetectionHook } = require('../extension/ai/hooks/safety-hooks.js');
  const { detectStuck, checkSafetyBreakers } = require('../extension/ai/agent-loop.js');
  const createSessionHooks = vm.runInNewContext(
    sliceFunction(background, 'function createSessionHooks(') + '\ncreateSessionHooks',
    { HookPipeline, LIFECYCLE_EVENTS, createSafetyBreakerHook, createStuckDetectionHook, detectStuck, checkSafetyBreakers, automationLogger: { debug() {} } }
  );
  const pipeline = createSessionHooks('s1');

  // Simulate the BU 02c / BU 03 loop: the model re-tries the same field and
  // nothing changes. Before the fix this ran to the 100-iteration cap.
  const session = { agentState: { consecutiveNoChangeCount: 0, actionFingerprints: [], stuckWarningCount: 0 }, actionHistory: [] };
  const toolResults = [{ callId: 'c', name: 'type_text', args: { selector: '#name', text: 'Ada' }, result: { success: false, hadEffect: false } }];
  let stoppedAt = null;
  for (let i = 1; i <= 100 && stoppedAt === null; i++) {
    session.agentState.iterationCount = i;
    const r = await pipeline.emit(LIFECYCLE_EVENTS.AFTER_ITERATION, { session, toolResults, iteration: i });
    if (r.stopped) stoppedAt = i;
  }
  assert.ok(stoppedAt !== null && stoppedAt <= 10, 'expected force-stop within 10 iterations, got ' + stoppedAt);
});

test('#157 every iteration result handed to the stuck detector carries its call args', () => {
  const agentLoop = fs.readFileSync(path.join(__dirname, '../extension/ai/agent-loop.js'), 'utf8');
  const pushes = agentLoop.match(/toolResults\.push\(\{[^}]*\}\)/g) || [];
  assert.ok(pushes.length >= 3, 'found the iteration result pushes');
  for (const push of pushes) assert.match(push, /args: call\.args/, push);
});

test('#157 filling five different fields is not mistaken for a stuck loop', async () => {
  const { HookPipeline, LIFECYCLE_EVENTS } = require('../extension/ai/hook-pipeline.js');
  const { createSafetyBreakerHook, createStuckDetectionHook } = require('../extension/ai/hooks/safety-hooks.js');
  const { detectStuck, checkSafetyBreakers } = require('../extension/ai/agent-loop.js');
  const createSessionHooks = vm.runInNewContext(
    sliceFunction(background, 'function createSessionHooks(') + '\ncreateSessionHooks',
    { HookPipeline, LIFECYCLE_EVENTS, createSafetyBreakerHook, createStuckDetectionHook, detectStuck, checkSafetyBreakers, automationLogger: { debug() {} } }
  );
  const pipeline = createSessionHooks('s2');
  const session = { agentState: { consecutiveNoChangeCount: 0, actionFingerprints: [], stuckWarningCount: 0 }, actionHistory: [] };
  const fields = ['#first', '#last', '#email', '#phone', '#city', '#zip'];
  for (let i = 0; i < fields.length; i++) {
    session.agentState.iterationCount = i + 1;
    const toolResults = [{ callId: 'c' + i, name: 'type_text', args: { selector: fields[i], text: 'x' }, result: { success: true, hadEffect: true } }];
    const r = await pipeline.emit(LIFECYCLE_EVENTS.AFTER_ITERATION, { session, toolResults, iteration: i + 1 });
    assert.equal(r.stopped, false, 'stopped while filling ' + fields[i]);
  }
});

test('a tool call through the session hooks logs no progress-hook error', async () => {
  const { HookPipeline, LIFECYCLE_EVENTS } = require('../extension/ai/hook-pipeline.js');
  const { createSafetyBreakerHook, createStuckDetectionHook } = require('../extension/ai/hooks/safety-hooks.js');
  const { createToolProgressHook } = require('../extension/ai/hooks/progress-hook.js');
  const { detectStuck, checkSafetyBreakers } = require('../extension/ai/agent-loop.js');
  const sent = [];
  // Every global the worker has when createSessionHooks runs, the progress hook included.
  const createSessionHooks = vm.runInNewContext(
    sliceFunction(background, 'function createSessionHooks(') + '\ncreateSessionHooks',
    {
      HookPipeline, LIFECYCLE_EVENTS, createSafetyBreakerHook, createStuckDetectionHook, createToolProgressHook,
      detectStuck, checkSafetyBreakers, automationLogger: { debug() {} },
      sendSessionStatus: (tabId, data) => sent.push({ tabId, data })
    }
  );
  const pipeline = createSessionHooks('s-progress');
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    for (let i = 1; i <= 3; i++) {
      const r = await pipeline.emit(LIFECYCLE_EVENTS.AFTER_TOOL_EXECUTION, {
        toolName: 'click', toolResult: { success: true }, session: { tabId: 7 }, sessionId: 's-progress', iteration: i
      });
      assert.equal(r.stopped, false);
    }
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(warnings, [], 'warnings logged: ' + warnings.join(' | '));
  assert.deepEqual(sent, [], 'no status is sent from this hook point');
});

// The meta-cognitive attempt counter, loaded the way meta-cognitive-tracker.test.js
// loads it: agent-loop.js needs chrome globals to require in full, but this
// section stands alone.
function loadMetaAttemptTracker() {
  const agentLoop = fs.readFileSync(path.join(__dirname, '../extension/ai/agent-loop.js'), 'utf8');
  const start = agentLoop.indexOf('var _META_INTERACT_TOOLS = {');
  const end = agentLoop.indexOf('\n}\n', agentLoop.indexOf('\nfunction _trackMetaAttempt(session, call, iterNum) {')) + 2;
  assert(start >= 0 && end > 2, 'missing the meta-cognitive section of agent-loop.js');
  return vm.runInNewContext(agentLoop.slice(start, end) + '\n({ _trackMetaAttempt, _META_INTERACT_TOOLS })', {});
}

// Runs `iterations` rounds of makeResults(i) through the detectors a real
// iteration runs, in its order: the meta-cognitive attempt counter on the last
// interaction, then the session hooks (stuck detection). Returns the iteration
// that stopped the run, or null.
async function iterationThatStops(makeResults, iterations) {
  const { HookPipeline, LIFECYCLE_EVENTS } = require('../extension/ai/hook-pipeline.js');
  const { createSafetyBreakerHook, createStuckDetectionHook } = require('../extension/ai/hooks/safety-hooks.js');
  const { detectStuck, checkSafetyBreakers } = require('../extension/ai/agent-loop.js');
  const createSessionHooks = vm.runInNewContext(
    sliceFunction(background, 'function createSessionHooks(') + '\ncreateSessionHooks',
    { HookPipeline, LIFECYCLE_EVENTS, createSafetyBreakerHook, createStuckDetectionHook, detectStuck, checkSafetyBreakers, automationLogger: { debug() {} } }
  );
  const { _trackMetaAttempt, _META_INTERACT_TOOLS } = loadMetaAttemptTracker();
  const pipeline = createSessionHooks('s3');
  const session = { agentState: { consecutiveNoChangeCount: 0, actionFingerprints: [], stuckWarningCount: 0 }, actionHistory: [] };
  for (let i = 1; i <= iterations; i++) {
    session.agentState.iterationCount = i;
    const toolResults = makeResults(i);
    const interaction = toolResults.filter(tr => _META_INTERACT_TOOLS[tr.name]).pop();
    if (interaction) {
      const signal = _trackMetaAttempt(session, { name: interaction.name, args: interaction.args }, i);
      if (signal && signal.forceStop) return i;
    }
    const r = await pipeline.emit(LIFECYCLE_EVENTS.AFTER_ITERATION, { session, toolResults, iteration: i });
    if (r.stopped) return i;
  }
  return null;
}

// 14 iterations runs past the goal-progress window (8), so these also cover
// the no-goal-progress check, not only the repetition check.
test('#157 visiting several pages or scrolling a long page is not mistaken for a stuck loop', async () => {
  const visits = await iterationThatStops(i => [
    { callId: 'n' + i, name: 'navigate', args: { url: 'https://shop.example/item/' + i, visual_reason: 'open item ' + i }, result: { success: true, hadEffect: true, result: { navigatingTo: 'https://shop.example/item/' + i } } },
    { callId: 'r' + i, name: 'read_page', args: {}, result: { success: true, hadEffect: false } }
  ], 14);
  assert.equal(visits, null, 'stopped while visiting pages, at iteration ' + visits);

  const scrolls = await iterationThatStops(i => [
    { callId: 's' + i, name: 'scroll', args: { direction: 'down' }, result: { success: true, hadEffect: true, result: { scrollY: 700 * i, atBottom: false } } }
  ], 14);
  assert.equal(scrolls, null, 'stopped while scrolling a long page, at iteration ' + scrolls);
});

// The meta-cognitive counter allows five attempts on one target in 12
// iterations. Stuck detection must not cut these runs shorter: a new query or
// a script on a new row is not a repeat.
test('#157 retrying one target with new text or a new script runs five attempts and stops at the sixth', async () => {
  const queries = await iterationThatStops(i => [
    { callId: 'q' + i, name: 'type_text', args: { selector: '#search', text: 'query ' + i }, result: { success: true, hadEffect: true } }
  ], 14);
  assert.equal(queries, 6, 'typing different queries into one field stops at iteration 6, got ' + queries);

  // Same 40-character prefix, different row each time; a repeat would stop at 5.
  const scripts = await iterationThatStops(i => [
    { callId: 'j' + i, name: 'execute_js', args: { code: "const rows = document.querySelectorAll('.result-row'); rows[" + i + '].click()' }, result: { success: true, hadEffect: true } }
  ], 14);
  assert.equal(scripts, 6, 'scripts on different rows of one list stop at iteration 6, got ' + scripts);
});

// hadEffect only says the tool is not read-only, so new coordinates or a new
// script text must not count as goal progress. The meta-cognitive counter has
// no key for either of these, so goal progress is what stops them.
test('#157 nudging a click to new coordinates or rewriting a script is not progress', async () => {
  const nudges = await iterationThatStops(i => [
    { callId: 'c' + i, name: 'click_at', args: { x: 300 + (i % 7), y: 200 + (i % 5) }, result: { success: true, hadEffect: true, result: { success: true, method: 'cdp_direct' } } }
  ], 20);
  assert.equal(nudges, 10, 'a click nudged around one spot stops at iteration 10, got ' + nudges);

  const rewrites = await iterationThatStops(i => [
    { callId: 'j' + i, name: 'execute_js', args: { code: '/* attempt ' + i + " */ document.getElementsByClassName('go')[0].click()" }, result: { success: true, hadEffect: true } }
  ], 20);
  assert.equal(rewrites, 10, 'a script rewritten to try the same thing again stops at iteration 10, got ' + rewrites);
});

test('#157 every argument a tool declares tells its calls apart', async () => {
  const chunks = await iterationThatStops(i => [
    { callId: 'f' + i, name: 'fill_sheet', args: { startCell: 'A' + (1 + 50 * (i - 1)), csvData: 'row ' + i + ',ok\n', visual_reason: 'chunk ' + i }, result: { success: true, hadEffect: true } }
  ], 14);
  assert.equal(chunks, null, 'stopped while writing a sheet in chunks, at iteration ' + chunks);

  const uploads = await iterationThatStops(i => [
    { callId: 'u' + i, name: 'upload_file', args: { selector: '#attachment', file_path: '/Users/me/Documents/report-' + i + '.pdf' }, result: { success: true, hadEffect: true } }
  ], 14);
  assert.equal(uploads, null, 'stopped while uploading different files, at iteration ' + uploads);

  const sameChunk = await iterationThatStops(i => [
    { callId: 'f' + i, name: 'fill_sheet', args: { startCell: 'A1', csvData: 'row,ok\n', visual_reason: 'attempt ' + i }, result: { success: true, hadEffect: true } }
  ], 10);
  assert.equal(sameChunk, 5, 'writing the same chunk to the same cell again stops at iteration 5');
});

test('#157 scroll_at ticks that move the view are new actions, ticks that do not are repeats', async () => {
  const tick = position => ({ success: true, method: 'cdp_direct', x: 400, y: 500, deltaX: 0, deltaY: 120, position });
  const view = (url, containerTop) => ({ url, scrollX: 0, scrollY: 0, containerTop, containerLeft: containerTop === null ? null : 0 });

  const zooming = await iterationThatStops(i => [
    { callId: 'z' + i, name: 'scroll_at', args: { x: 400, y: 500, deltaY: -120, visual_reason: 'zoom in' }, result: { success: true, hadEffect: true, result: tick(view('https://maps.example/@40.7,-74.0,' + (8 + i) + 'z', null)) } }
  ], 14);
  assert.equal(zooming, null, 'stopped while zooming a map, at iteration ' + zooming);

  const paging = await iterationThatStops(i => [
    { callId: 'p' + i, name: 'scroll_at', args: { x: 400, y: 500, deltaY: 120 }, result: { success: true, hadEffect: true, result: tick(view('https://chat.example/c/1', 360 * i)) } }
  ], 14);
  assert.equal(paging, null, 'stopped while paging through an inner list, at iteration ' + paging);

  const atEnd = await iterationThatStops(() => [
    { callId: 'e', name: 'scroll_at', args: { x: 400, y: 500, deltaY: 120 }, result: { success: true, hadEffect: true, result: tick(view('https://chat.example/c/1', 5040)) } }
  ], 10);
  assert.equal(atEnd, 5, 'wheel ticks at the end of the list stop at iteration 5');
});

test('#157 the scroll_at tool asks cdpScrollAt for the position; other CDP tools do not', async () => {
  const { executeTool } = require('../extension/ai/tool-executor.js');
  const calls = [];
  const position = { url: 'https://maps.example/@40.7,-74.0,12z', scrollX: 0, scrollY: 0, containerTop: null, containerLeft: null };
  const cdpHandler = async (verb, params) => {
    calls.push({ verb, params });
    return verb === 'cdpScrollAt' ? { success: true, method: 'cdp_direct', position } : { success: true, method: 'cdp_direct' };
  };

  const scrolled = await executeTool('scroll_at', { x: 10, y: 20, deltaY: 120 }, 7, { cdpHandler });
  assert.equal(calls[0].verb, 'cdpScrollAt');
  assert.equal(calls[0].params.reportPosition, true);
  assert.equal(calls[0].params.deltaY, 120);
  assert.deepEqual(scrolled.result.position, position, 'the position reaches the tool result');

  await executeTool('click_at', { x: 10, y: 20 }, 7, { cdpHandler });
  assert.equal(calls[1].verb, 'cdpClickAt');
  assert.equal(calls[1].params.reportPosition, undefined);
});

test('#157 cdpScrollAt reads the position after the tick, only when asked', () => {
  const start = background.indexOf("case 'cdpScrollAt': {");
  const block = background.slice(start, background.indexOf("case '", start + 1));
  const wheelAt = block.indexOf("type: 'mouseWheel'");
  const gateAt = block.indexOf('params.reportPosition === true');
  const probeAt = block.indexOf('fsbWheelPositionProbe');
  const detachAt = block.indexOf('.detach({ tabId })', probeAt);
  assert(wheelAt > 0 && gateAt > wheelAt && probeAt > gateAt && detachAt > probeAt, 'wheel -> gate -> probe -> detach order');

  // Remote control drives cdpScrollAt directly and must not pay for the probe.
  const wsClient = fs.readFileSync(path.join(__dirname, '../extension/ws/ws-client.js'), 'utf8');
  const remote = wsClient.slice(wsClient.indexOf("tool: 'cdpScrollAt'"), wsClient.indexOf("tool: 'cdpScrollAt'") + 200);
  assert.doesNotMatch(remote, /reportPosition/);
});

test('#157 repeats are still caught when only the free-text reason changes or the page stops moving', async () => {
  const atBottom = await iterationThatStops(() => [
    { callId: 's', name: 'scroll', args: { direction: 'down' }, result: { success: true, hadEffect: true, result: { scrollY: 4200, atBottom: true } } }
  ], 10);
  assert.equal(atBottom, 5, 'scrolling that no longer moves the page stops at iteration 5');

  const retries = await iterationThatStops(i => [
    { callId: 't' + i, name: 'type_text', args: { selector: '#name', text: 'Ada', visual_reason: 'attempt ' + i }, result: { success: false, hadEffect: false } }
  ], 10);
  assert.equal(retries, 5, 'the same typing retried with a new visual_reason stops at iteration 5');
});
