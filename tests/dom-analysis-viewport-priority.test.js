'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed++;
    console.log('  PASS:', label);
  } catch (err) {
    failed++;
    console.error('  FAIL:', label);
    console.error('    ', err && err.message ? err.message : err);
  }
}

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'extension', 'content', 'dom-analysis.js'), 'utf8');

const noop = () => {};

// Scrolled page: scrollY is large so viewport-relative and document-absolute
// coordinate spaces diverge — the regression this suite guards against.
const windowStub = {
  __FSB_SKIP_INIT__: false,
  innerWidth: 1280,
  innerHeight: 800,
  scrollX: 0,
  scrollY: 1500,
  FSB: {
    _modules: {},
    logger: { log: noop, info: noop, warn: noop, error: noop, debug: noop, logDOMOperation: noop },
  },
  location: { href: 'https://example.test/', hostname: 'example.test' },
};

const sandbox = {
  window: windowStub,
  document: {},
  console,
  Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
};

vm.runInNewContext(source, sandbox, { filename: 'dom-analysis.js' });

const FSB = windowStub.FSB;

console.log('--- dom-analysis viewport prioritization (scrolled page) ---');

check('exports isInViewport and prioritizeElements', () => {
  assert.equal(typeof FSB.isInViewport, 'function');
  assert.equal(typeof FSB.prioritizeElements, 'function');
});

check('visible element on a scrolled page is in viewport', () => {
  assert.equal(FSB.isInViewport({ position: { x: 100, y: 100, width: 50, height: 20 } }), true);
});

check('element a full viewport below the fold is not in viewport', () => {
  // Viewport-relative y=1600 sat inside [scrollY, scrollY+innerHeight] under the
  // old document-absolute comparison, so it wrongly earned the viewport bonus.
  assert.equal(FSB.isInViewport({ position: { x: 100, y: 1600, width: 50, height: 20 } }), false);
});

check('precomputed position.inViewport is authoritative when present', () => {
  assert.equal(FSB.isInViewport({ position: { x: -9999, y: -9999, inViewport: true } }), true);
  assert.equal(FSB.isInViewport({ position: { x: 10, y: 10, inViewport: false } }), false);
});

check('element without position is not in viewport', () => {
  assert.equal(FSB.isInViewport({}), false);
});

check('prioritizeElements ranks the visible twin first on a scrolled page', () => {
  const visible = { text: 'Buy now', isButton: true, position: { x: 100, y: 200, width: 120, height: 40 } };
  const offscreen = { text: 'Buy now', isButton: true, position: { x: 100, y: 2400, width: 120, height: 40 } };
  const ranked = FSB.prioritizeElements([offscreen, visible]);
  assert.equal(ranked[0].position.y, 200, 'visible element sorts first');
  assert.equal(ranked[0].relevanceScore - ranked[1].relevanceScore, 100, 'visible element carries the +100 viewport bonus');
});

console.log(`\ndom-analysis viewport prioritization: ${passed} PASS / ${failed} FAIL`);
if (failed > 0) process.exit(1);
