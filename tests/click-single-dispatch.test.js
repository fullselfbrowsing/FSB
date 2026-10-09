'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const actions = fs.readFileSync(path.join(__dirname, '../extension/content/actions.js'), 'utf8');
const coordinateStart = actions.indexOf('async function clickAtCoordinates(');
const coordinateEnd = actions.indexOf('// =============================================================================\n// END COORDINATE FALLBACK', coordinateStart);
assert(coordinateStart >= 0 && coordinateEnd > coordinateStart);
const coordinateSource = actions.slice(coordinateStart, coordinateEnd);

function fixtureElement(kind) {
  const calls = { click: 0, nativeClick: 0, submit: 0, toggle: 0 };
  const element = {
    tagName: kind === 'submit' ? 'BUTTON' : 'INPUT',
    id: 'target',
    checked: false,
    dispatchEvent(event) {
      if (event.type === 'click') {
        calls.click++;
        if (kind === 'submit') calls.submit++;
        else { this.checked = !this.checked; calls.toggle++; }
      }
    },
    click() { calls.nativeClick++; },
  };
  return { element, calls };
}

for (const kind of ['submit', 'checkbox']) {
  test(`coordinate fallback dispatches one ${kind} activation`, async () => {
    const { element, calls } = fixtureElement(kind);
    let cdpCalls = 0;
    const context = {
      MouseEvent: class MouseEvent { constructor(type) { this.type = type; } },
      window: { scrollX: 0, scrollY: 0, screenX: 0, screenY: 0 },
      ensureCoordinatesVisible: async () => ({ scrolled: false }),
      validateCoordinates: () => ({ valid: true, element }),
      waitForStability: async () => {},
      logger: { warn() {}, log() {} },
      FSB: { sessionId: 'fixture', getClassName: () => '' },
      chrome: { runtime: { sendMessage: async () => { cdpCalls++; } } },
    };
    const clickAtCoordinates = vm.runInNewContext(`${coordinateSource}\nclickAtCoordinates`, context);
    const result = await clickAtCoordinates({ x: 10, y: 10, width: 20, height: 20 });
    assert.equal(calls.click, 1);
    assert.equal(calls.nativeClick, 0);
    assert.equal(cdpCalls, 0);
    assert.equal(calls[kind === 'submit' ? 'submit' : 'toggle'], 1);
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.mayHaveExecuted, true);
  });
}

test('selector click does not dispatch a second action after its click event', () => {
  const start = actions.indexOf('// Dispatch full mouse event sequence for proper JS handler triggering');
  const end = actions.indexOf('// VERIFY-04: Wait for page stability', start);
  const dispatch = actions.slice(start, end);
  assert.equal((dispatch.match(/new MouseEvent\('click'/g) || []).length, 1);
  assert.doesNotMatch(dispatch, /element\.click\(/);
  const uncertainStart = actions.indexOf('if (!hadEffect)', end);
  const uncertainEnd = actions.indexOf('// Record successful action', uncertainStart);
  assert.doesNotMatch(actions.slice(uncertainStart, uncertainEnd), /form\.submit\(|cdpMouseClick|window\.location\.href/);
});

test('site search sends Enter once and leaves an unchanged page uncertain', async () => {
  const start = actions.indexOf('  siteSearch: async (params) => {');
  const end = actions.indexOf('  // Wait for element to appear', start);
  assert(start >= 0 && end > start);
  const calls = { enter: 0, submit: 0, google: 0 };
  const searchInput = {
    value: '',
    focus() {},
    click() {},
    dispatchEvent(event) { if (event.type === 'keydown' && event.key === 'Enter') calls.enter++; },
    closest() { return { submit() { calls.submit++; } }; },
  };
  const context = {
    FSB: { smartEnsureReady: async () => ({ ready: true }) },
    detectSiteSearchInput: () => ({ element: searchInput, tier: 1, selector: '#search' }),
    Event: class { constructor(type) { this.type = type; } },
    KeyboardEvent: class { constructor(type, options) { this.type = type; this.key = options.key; } },
    setTimeout: (callback) => { callback(); return 0; },
    waitForPageStability: async () => {},
    window: { location: { href: 'https://example.test/' } },
  };
  const tools = vm.runInNewContext(`({${actions.slice(start, end)}})`, context);
  tools.searchGoogle = () => { calls.google++; return { success: true }; };
  const result = await tools.siteSearch({ query: 'hello' });
  assert.equal(calls.enter, 1);
  assert.equal(calls.submit, 0);
  assert.equal(calls.google, 0);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.mayHaveExecuted, true);
});
