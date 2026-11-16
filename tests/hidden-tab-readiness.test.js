'use strict';

// Element readiness in a hidden document.
//
// A tab that is not the active one in its window is hidden: it gets no
// animation frames and does not run smooth scrolls. open_tab opens tabs in
// the background by default, so an MCP host's action on an element outside
// the viewport used to wait for a frame that never came, until the action's
// deadline, and did nothing.
//
// Loads the real extension/content/accessibility.js into a vm context and
// checks that:
//   - the stability check finishes without an animation frame, in a hidden
//     document and in a visible one whose frames have stalled;
//   - it still uses the frame when frames arrive;
//   - scrolling an element into view is instant in a hidden document and
//     smooth in a visible one;
//   - the two scroll tools in actions.js take the same behaviour.
//
// Node 20 compatible; binds no port.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const accessibilitySource = fs.readFileSync(path.join(repoRoot, 'extension/content/accessibility.js'), 'utf8');
const actionsSource = fs.readFileSync(path.join(repoRoot, 'extension/content/actions.js'), 'utf8');

function load({ hidden, frames }) {
  const calls = { frames: 0 };
  const logger = { debug() {}, info() {}, warn() {}, error() {}, log() {} };
  const FSB = { logger, _modules: {} };
  const document = { visibilityState: hidden ? 'hidden' : 'visible', querySelectorAll: () => [] };
  const window = { FSB, innerWidth: 1000, innerHeight: 700, scrollBy() {} };
  const sandbox = {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    getComputedStyle: () => ({ position: 'static' }),
    requestAnimationFrame: (callback) => {
      calls.frames += 1;
      if (frames) setTimeout(callback, 5);
      return calls.frames;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(accessibilitySource, sandbox, { filename: 'accessibility.js' });
  return { FSB, calls, document };
}

function element(top) {
  const scrolls = [];
  return {
    scrolls,
    getBoundingClientRect: () => ({ top, left: 10, bottom: top + 20, right: 110, width: 100, height: 20 }),
    scrollIntoView: (options) => scrolls.push(options),
  };
}

async function timed(promise) {
  const started = Date.now();
  const value = await promise;
  return { value, ms: Date.now() - started };
}

test('the stability check finishes in a hidden document, which gets no animation frames', async () => {
  const { FSB, calls } = load({ hidden: true, frames: false });
  const { value, ms } = await timed(FSB.checkElementStable(element(1200), 300));
  assert.equal(value.passed, true);
  assert.ok(ms < 250, `took ${ms} ms`);
  assert.equal(calls.frames, 0, 'a hidden document is not asked for a frame');
});

test('the stability check finishes in a visible document whose frames have stalled', async () => {
  const { FSB, calls } = load({ hidden: false, frames: false });
  const { value, ms } = await timed(FSB.checkElementStable(element(100), 300));
  assert.equal(value.passed, true);
  assert.ok(ms < 600, `took ${ms} ms`);
  assert.equal(calls.frames, 1);
});

test('the stability check still uses the animation frame when frames arrive', async () => {
  const { FSB, calls } = load({ hidden: false, frames: true });
  const { value, ms } = await timed(FSB.checkElementStable(element(100), 300));
  assert.equal(value.passed, true);
  assert.equal(calls.frames, 1);
  assert.ok(ms < 90, `the frame, not the fallback timer, should settle it; took ${ms} ms`);
});

test('scrolling into view is instant in a hidden document and smooth in a visible one', async () => {
  const hidden = load({ hidden: true, frames: false });
  const below = element(1200);
  const scrolled = await hidden.FSB.scrollIntoViewIfNeeded(below);
  assert.equal(scrolled.scrolled, true);
  assert.equal(below.scrolls.length, 1);
  assert.equal(below.scrolls[0].behavior, 'instant');
  assert.equal(hidden.FSB.scrollBehavior(), 'instant');

  const visible = load({ hidden: false, frames: true });
  const belowVisible = element(1200);
  await visible.FSB.scrollIntoViewIfNeeded(belowVisible);
  assert.equal(belowVisible.scrolls[0].behavior, 'smooth');
  assert.equal(visible.FSB.scrollBehavior(), 'smooth');
});

test('an element already in view is not scrolled, hidden or not', async () => {
  for (const hiddenState of [true, false]) {
    const { FSB } = load({ hidden: hiddenState, frames: !hiddenState });
    const inView = element(300);
    const result = await FSB.scrollIntoViewIfNeeded(inView);
    assert.equal(result.scrolled, false);
    assert.equal(inView.scrolls.length, 0);
  }
});

test('the behaviour follows the document when it becomes hidden later', () => {
  const { FSB, document } = load({ hidden: false, frames: true });
  assert.equal(FSB.scrollBehavior(), 'smooth');
  document.visibilityState = 'hidden';
  assert.equal(FSB.scrollBehavior(), 'instant');
});

test('the scroll tools in actions.js take the same behaviour', () => {
  const uses = actionsSource.match(/FSB\.scrollBehavior\(\)/g) || [];
  assert.equal(uses.length, 2, 'ensureCoordinatesVisible and scrollToElement');
  const literalSmooth = actionsSource.match(/behavior:\s*'smooth'/g) || [];
  assert.equal(literalSmooth.length, 0, "no scroll in actions.js is hard-coded to 'smooth'");
  assert.equal((accessibilitySource.match(/behavior:\s*'smooth'/g) || []).length, 0);
});
