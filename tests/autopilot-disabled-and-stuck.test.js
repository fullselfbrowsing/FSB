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
