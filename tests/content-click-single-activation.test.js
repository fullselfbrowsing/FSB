'use strict';

/**
 * Content-script clicks must activate their target exactly once.
 *
 * Two layers:
 *   1. Behaviour: the click verification utilities count toggle-state changes
 *      (ARIA state, data-state, open, checked, a label's control, a toggle-like
 *      ancestor, the target's own text) as click effects. Without that, a
 *      correct single click on a toggle reads as an unconfirmed outcome and
 *      invites the caller to click again, which flips it straight back.
 *   2. Source contract: the click tool and clickAtCoordinates dispatch one
 *      synthetic click, never follow it with element.click(), and mark the
 *      events composed. clickAtCoordinates never sends a second (CDP) click;
 *      it reports the outcome as unknown instead.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ACTIONS_PATH = path.join(__dirname, '..', 'extension', 'content', 'actions.js');
const source = fs.readFileSync(ACTIONS_PATH, 'utf8');

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return text.slice(start, end);
}

// ---------------------------------------------------------------------------
// Behaviour: verification utilities run in a vm with a minimal DOM stand-in
// ---------------------------------------------------------------------------

const verificationSource = sliceBetween(source, '// ACTION VERIFICATION UTILITIES', 'function diagnoseElementFailure(');

function loadVerification() {
  const documentStub = {
    body: { innerText: 'stable page text' },
    activeElement: { tagName: 'BODY' },
    contains: (el) => Boolean(el && el.connected !== false),
    querySelector: () => null,
    querySelectorAll: () => ({ length: 42 })
  };
  const context = {
    window: { location: { href: 'https://example.test/page' } },
    document: documentStub,
    FSB: { getClassName: (el) => (el && typeof el.className === 'string' ? el.className : '') },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    CSS: { escape: (value) => String(value) }
  };
  vm.createContext(context);
  vm.runInContext(
    `${verificationSource}\n;globalThis.__verification = { captureActionState, detectChanges, verifyActionEffect, EXPECTED_EFFECTS };`,
    context,
    { filename: 'actions.js#verification' }
  );
  return context.__verification;
}

function fakeElement(tagName, { attrs = {}, parent = null, ...props } = {}) {
  const el = {
    tagName,
    attrs: { ...attrs },
    parentElement: parent,
    id: '',
    className: '',
    innerText: '',
    connected: true,
    nextElementSibling: null,
    ...props
  };
  el.getAttribute = (name) => (Object.prototype.hasOwnProperty.call(el.attrs, name) ? el.attrs[name] : null);
  el.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(el.attrs, name);
  el.setAttribute = (name, value) => { el.attrs[name] = String(value); };
  el.querySelector = () => null;
  el.getBoundingClientRect = () => ({ height: 10 });
  Object.defineProperty(el, 'isConnected', { get: () => el.connected !== false });
  return el;
}

const verification = loadVerification();

function clickVerifies(target, mutate) {
  const pre = verification.captureActionState(target, 'click');
  mutate();
  const post = verification.captureActionState(target, 'click');
  return verification.verifyActionEffect(pre, post, 'click');
}

test('a click that flips aria-pressed verifies', () => {
  const button = fakeElement('BUTTON', { attrs: { 'aria-pressed': 'false' } });
  assert.equal(clickVerifies(button, () => button.setAttribute('aria-pressed', 'true')).verified, true);
});

test('a click that flips a switch aria-checked verifies', () => {
  const sw = fakeElement('DIV', { attrs: { role: 'switch', 'aria-checked': 'false' } });
  assert.equal(clickVerifies(sw, () => sw.setAttribute('aria-checked', 'true')).verified, true);
});

test('a click that changes data-state verifies', () => {
  const trigger = fakeElement('BUTTON', { attrs: { 'data-state': 'closed' } });
  assert.equal(clickVerifies(trigger, () => trigger.setAttribute('data-state', 'open')).verified, true);
});

test('a click that selects a tab verifies', () => {
  const tab = fakeElement('BUTTON', { attrs: { role: 'tab', 'aria-selected': 'false' } });
  assert.equal(clickVerifies(tab, () => tab.setAttribute('aria-selected', 'true')).verified, true);
});

test('a click that opens the element verifies', () => {
  const details = fakeElement('DETAILS', { open: false });
  assert.equal(clickVerifies(details, () => { details.open = true; }).verified, true);
});

test('a click that flips a typeless checked property verifies', () => {
  const custom = fakeElement('MD-CHECKBOX', { checked: false });
  assert.equal(clickVerifies(custom, () => { custom.checked = true; }).verified, true);
});

test('a click on a label verifies through its control', () => {
  const input = fakeElement('INPUT', { type: 'checkbox', checked: false });
  const label = fakeElement('LABEL', { control: input });
  assert.equal(clickVerifies(label, () => { input.checked = true; }).verified, true);
});

test('a click on text inside a label verifies through the label control', () => {
  const input = fakeElement('INPUT', { type: 'checkbox', checked: false });
  const label = fakeElement('LABEL', { control: input });
  const span = fakeElement('SPAN', { parent: label, innerText: 'Bravo option' });
  assert.equal(clickVerifies(span, () => { input.checked = true; }).verified, true);
});

test('a click on text inside a switch verifies through the switch state', () => {
  const sw = fakeElement('DIV', { attrs: { role: 'switch', 'aria-checked': 'false' } });
  const span = fakeElement('SPAN', { parent: sw, innerText: 'Weekly digest' });
  assert.equal(clickVerifies(span, () => sw.setAttribute('aria-checked', 'true')).verified, true);
});

test('a click on text inside a summary verifies through the details state', () => {
  const details = fakeElement('DETAILS', { open: false });
  const summary = fakeElement('SUMMARY', { parent: details });
  const span = fakeElement('SPAN', { parent: summary, innerText: 'More options' });
  assert.equal(clickVerifies(span, () => { details.open = true; }).verified, true);
});

test('a click that changes the target text verifies', () => {
  const button = fakeElement('BUTTON', { innerText: 'Follow' });
  assert.equal(clickVerifies(button, () => { button.innerText = 'Following'; }).verified, true);
});

test('a click with no observable change does not verify', () => {
  const button = fakeElement('BUTTON', { attrs: { 'aria-pressed': 'false' }, innerText: 'Silent' });
  const result = clickVerifies(button, () => {});
  assert.equal(result.verified, false);
  assert.equal(result.changes.controlStateChanged, false);
});

test('a checkbox inside its own label has no separate control state', () => {
  const label = fakeElement('LABEL');
  const input = fakeElement('INPUT', { type: 'checkbox', checked: false, parent: label });
  label.control = input;
  const state = verification.captureActionState(input, 'click');
  assert.equal(state.element.controlState, null);
});

test('an element removed before the second capture does not throw', () => {
  const button = fakeElement('BUTTON', { attrs: { 'aria-pressed': 'false' } });
  const pre = verification.captureActionState(button, 'click');
  button.connected = false;
  const post = verification.captureActionState(button, 'click');
  const result = verification.verifyActionEffect(pre, post, 'click');
  assert.equal(result.changes.controlStateChanged, false);
  assert.equal(result.changes.innerTextChanged, false);
});

test('only the click expectations widened', () => {
  const plain = (value) => JSON.parse(JSON.stringify(value));
  const effects = verification.EXPECTED_EFFECTS;
  assert.deepEqual(plain(effects.type), { anyOf: ['valueChanged', 'textContentChanged'], timeout: 200 });
  assert.deepEqual(plain(effects.selectOption), { required: ['selectedIndexChanged'], anyOf: ['valueChanged'], timeout: 200 });
  assert.deepEqual(plain(effects.toggleCheckbox), { required: ['checkedChanged'], timeout: 200 });
  assert.deepEqual(plain(effects.pressEnter), { anyOf: ['urlChanged', 'elementCountChanged', 'contentChanged', 'focusChanged'], timeout: 1000 });
  assert.deepEqual(plain(effects.navigate), { required: ['urlChanged'], timeout: 5000 });
  assert.deepEqual(plain(effects.hover), { anyOf: ['classChanged', 'ariaExpandedChanged', 'relatedVisibilityChanged'], optional: true });
  assert.deepEqual(plain(effects.focus), { required: ['focusChanged'], timeout: 100 });
  for (const flag of ['checkedChanged', 'controlStateChanged', 'ariaCheckedChanged', 'ariaPressedChanged',
    'ariaSelectedChanged', 'dataStateChanged', 'openChanged', 'innerTextChanged']) {
    assert.ok(effects.click.anyOf.includes(flag), `click expectations include ${flag}`);
  }
});

// ---------------------------------------------------------------------------
// Source contract: one synthetic activation per click path
// ---------------------------------------------------------------------------

const clickToolBody = sliceBetween(source, '  click: async (params) => {', '  clickSearchResult: async (params) => {');
const coordinateBody = sliceBetween(source, 'async function clickAtCoordinates(params) {', '// END COORDINATE FALLBACK UTILITIES');

function singleActivationViolations(body) {
  const violations = [];
  const dispatchMarker = "new MouseEvent('click'";
  const dispatches = body.split(dispatchMarker).length - 1;
  if (dispatches !== 1) violations.push(`expected exactly one synthetic click dispatch, found ${dispatches}`);
  const dispatchAt = body.indexOf(dispatchMarker);
  if (dispatchAt !== -1 && body.indexOf('.click()', dispatchAt) !== -1) {
    violations.push('a .click() call follows the synthetic click dispatch');
  }
  const initStart = body.indexOf('const mouseEventInit = {');
  const initEnd = initStart === -1 ? -1 : body.indexOf('};', initStart);
  if (initStart === -1 || !body.slice(initStart, initEnd).includes('composed: true')) {
    violations.push('mouseEventInit does not set composed: true');
  }
  return violations;
}

test('the click tool activates its target once', () => {
  assert.deepEqual(singleActivationViolations(clickToolBody), []);
  assert.match(clickToolBody, /loadingDetected \|\| toggledState \|\| false/,
    'the anchor branch of hadEffect counts toggle-state changes');
});

test('clickAtCoordinates activates its target once and reports an unknown outcome', () => {
  assert.deepEqual(singleActivationViolations(coordinateBody), []);
  assert.equal(coordinateBody.indexOf('.click()'), -1, 'clickAtCoordinates never calls .click()');
  assert.equal(coordinateBody.indexOf('cdpMouseClick'), -1, 'clickAtCoordinates never sends a second, trusted click');
  assert.match(coordinateBody, /outcome: 'unknown',\s*mayHaveExecuted: true/,
    'the result tells the caller to inspect the page instead of retrying');
});

test('the source contract catches a reintroduced second activation', () => {
  const dispatch = "element.dispatchEvent(new MouseEvent('click', mouseEventInit));";
  assert.ok(clickToolBody.includes(dispatch), 'click tool dispatch line is present');
  const regressed = clickToolBody.replace(dispatch, `${dispatch}\n      element.click();`);
  assert.ok(singleActivationViolations(regressed).length > 0);
});
