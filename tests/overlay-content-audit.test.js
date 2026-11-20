/**
 * Phase 229-02 content-audit + reduced-motion regression tests.
 *
 * Covers:
 *   OVERLAY-05: isThinkingPhase helper, thinking-suppression gate (<1s elapsed),
 *               first-sentence regression guard on legacy state.stepText path.
 *   OVERLAY-06: Strict reduced-motion CSS for ProgressOverlay text surfaces;
 *               green-flash completion preserved under reduced-motion;
 *               ActionGlowOverlay reduced-motion block intact.
 *
 * Approach: same vm-sandbox pattern as overlay-stability-cadence.test.js.
 *
 * Run: node tests/overlay-content-audit.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Load real overlay-state.js into a fresh sandbox to test isThinkingPhase
// ---------------------------------------------------------------------------

function loadOverlayStateModule() {
  const sandbox = {
    module: { exports: {} },
    globalThis: {},
    console
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'extension', 'utils', 'overlay-state.js'),
    'utf8'
  );
  vm.runInContext(src, ctx, { filename: 'overlay-state.js' });
  return sandbox.module.exports;
}

function declarationSource(source, name) {
  let start = source.indexOf('function ' + name + '(');
  if (start === -1) start = source.indexOf('async function ' + name + '(');
  if (start === -1) throw new Error('missing function ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error('unterminated function ' + name);
}

// ---------------------------------------------------------------------------
// DOM/window shim (mirrors overlay-stability-cadence.test.js)
// ---------------------------------------------------------------------------

let nowMs = 1000;
function setNow(v) { nowMs = v; }
function advanceNow(d) { nowMs += d; }

let rafQueue = [];
let rafSeq = 0;
function requestAnimationFrameStub(cb) {
  rafSeq += 1;
  rafQueue.push({ id: rafSeq, cb });
  return rafSeq;
}
function cancelAnimationFrameStub(id) {
  rafQueue = rafQueue.filter(e => e.id !== id);
}

function makeElement(tag, opts) {
  opts = opts || {};
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    children: [],
    parentNode: null,
    classList: {
      _set: new Set(),
      add(...names) { names.forEach(n => this._set.add(n)); },
      remove(...names) { names.forEach(n => this._set.delete(n)); },
      contains(n) { return this._set.has(n); },
      toggle(n, force) {
        if (force === true) { this._set.add(n); return true; }
        if (force === false) { this._set.delete(n); return false; }
        if (this._set.has(n)) { this._set.delete(n); return false; }
        this._set.add(n); return true;
      }
    },
    style: {},
    attributes: {},
    dataset: {},
    disabled: false,
    value: '',
    _listeners: {},
    _textContent: '',
    _innerHTML: '',
    _isConnected: true,
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) {
      this._innerHTML = String(v);
      const childClasses = [
        'pl-body','pl-row','pl-mark','pl-wm','pl-div','pl-agent','pl-name','pl-gap','pl-ok','pl-time','pl-stop',
        'pl-text','pl-out','pl-in','pl-count',
        'pl-more','pl-meta','pl-tick','pl-who','pl-slug','pl-tag','pl-note',
        'pl-track','pl-fill','pl-ping','pl-ring','pl-bead','pl-cap'
      ];
      this.children = childClasses.map(c => {
        const ch = makeElement('span');
        ch.classList.add(c);
        ch.parentNode = this;
        return ch;
      });
    },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter(c => c !== child);
      child.parentNode = null;
      return child;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener(type, listener) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(listener);
    },
    dispatchEvent(event) {
      (this._listeners[event.type] || []).forEach(listener => listener(event));
    },
    querySelector(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return findDescendant(this, n => n.classList && n.classList.contains(cls));
      }
      if (sel === 'style') {
        return findDescendant(this, n => n.tagName === 'STYLE');
      }
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      walkAll(this, n => {
        if (cls && n.classList && n.classList.contains(cls)) out.push(n);
      });
      return out;
    },
    attachShadow() {
      this._shadow = makeElement('shadow-root');
      this._shadow.host = this;
      return this._shadow;
    },
    showPopover() {},
    hidePopover() {},
    get isConnected() { return this._isConnected; },
    set isConnected(v) { this._isConnected = v; },
    contains(node) {
      if (!node) return false;
      let cur = node;
      while (cur) { if (cur === this) return true; cur = cur.parentNode; }
      return false;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 100, height: 40, right: 100, bottom: 40 };
    }
  };
  if (opts.id) el.id = opts.id;
  return el;
}

function findDescendant(root, pred) {
  if (pred(root)) return root;
  for (const c of (root.children || [])) {
    const found = findDescendant(c, pred);
    if (found) return found;
  }
  if (root._shadow) {
    const found = findDescendant(root._shadow, pred);
    if (found) return found;
  }
  return null;
}

function walkAll(root, fn) {
  fn(root);
  for (const c of (root.children || [])) walkAll(c, fn);
  if (root._shadow) walkAll(root._shadow, fn);
}

// ---------------------------------------------------------------------------
// Build sandbox with real FSBOverlayStateUtils loaded
// ---------------------------------------------------------------------------

const overlayStateExports = loadOverlayStateModule();

const MEASURED = {
  'Continuing to payment': 136,
  'Submitting checkout': 122,
  'Filling in the delivery address from the saved profile': 331,
  'Comparing jacket prices': 146
};

const documentElement = makeElement('html');
const documentBody = makeElement('body');
documentElement.appendChild(documentBody);

const documentStub = {
  documentElement,
  body: documentBody,
  createElement(tag) {
    const el = makeElement(tag);
    // The pill measures its status line on a canvas. These are the widths
    // Chrome's system-ui gives the spec boards' strings, so the spec sizes hold.
    if (tag === 'canvas') {
      el.getContext = () => ({
        font: '',
        measureText: (text) => ({ width: Object.prototype.hasOwnProperty.call(MEASURED, text) ? MEASURED[text] : text.length * 6.5 })
      });
    }
    return el;
  },
  addEventListener() {},
  removeEventListener() {}
};

// matchMedia mock -- controllable per-test via setMatchMedia()
let matchMediaResult = false;
function setMatchMedia(v) { matchMediaResult = v; }

const windowListeners = { add: [], remove: [] };
const windowStub = {
  FSB: {
    _modules: {},
    logger: { log(){}, info(){}, warn(){}, error(){}, debug(){} }
  },
  FSBOverlayStateUtils: overlayStateExports,
  addEventListener(type, fn, opts) { windowListeners.add.push({ type, fn, opts }); },
  removeEventListener(type, fn, opts) { windowListeners.remove.push({ type, fn, opts }); },
  matchMedia(q) {
    return {
      matches: matchMediaResult,
      media: q,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}
    };
  },
  __FSB_SKIP_INIT__: false,
  CSS: { supports: () => false }
};

const sandbox = {
  window: windowStub,
  document: documentStub,
  performance: { now() { return nowMs; } },
  requestAnimationFrame: requestAnimationFrameStub,
  cancelAnimationFrame: cancelAnimationFrameStub,
  setTimeout, clearTimeout, setInterval, clearInterval,
  console,
  chrome: { runtime: { getURL: (p) => 'chrome-extension://test/' + p, sendMessage: () => Promise.resolve({ success: true }) } },
  module: { exports: {} },
  Set, Map, WeakMap, WeakSet, Promise, Date, Math, JSON, String, Number, Boolean, Array, Object, Error, RegExp,
  Symbol, Reflect
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.HTMLElement = function HTMLElement(){};

const ctx = vm.createContext(sandbox);
const vfPath = path.resolve(__dirname, '..', 'extension', 'content', 'visual-feedback.js');
const src = fs.readFileSync(vfPath, 'utf8');
vm.runInContext(src, ctx, { filename: 'visual-feedback.js' });

const { ProgressOverlay, ActionGlowOverlay } = sandbox.module.exports;

// Capture the raw shadow-style source by re-reading the file (simpler than
// trying to execute the create() Popover path inside the stub).
const visualFeedbackSrc = src;
const messagingSrc = fs.readFileSync(
  path.resolve(__dirname, '..', 'extension', 'content', 'messaging.js'),
  'utf8'
);

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.error('  FAIL:', msg); }
}
function assertEq(a, b, msg) {
  assert(a === b, msg + ' (expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a) + ')');
}

function buildOverlay() {
  const overlay = new ProgressOverlay();
  overlay.host = makeElement('div');
  overlay.shadow = overlay.host.attachShadow({ mode: 'open' });
  const container = makeElement('div');
  container.classList.add('pl-host');
  container.innerHTML = '<inflate/>';
  overlay.shadow.appendChild(container);
  overlay.container = container;
  return overlay;
}

function makeState(opts) {
  opts = opts || {};
  return {
    lifecycle: opts.lifecycle || 'running',
    phase: opts.phase || 'planning',
    display: {
      title: opts.title != null ? opts.title : 'Task',
      subtitle: opts.subtitle != null ? opts.subtitle : '',
      detail: opts.detail != null ? opts.detail : 'Working'
    },
    progress: opts.progress !== undefined ? opts.progress : {
      mode: 'indeterminate', percent: null, label: 'Working', eta: ''
    },
    actionCount: opts.actionCount,
    clientLabel: opts.clientLabel || '',
    agentIdShort: opts.agentIdShort,
    result: opts.result,
    guarded: opts.guarded,
    capability: opts.capability,
    stoppable: opts.stoppable,
    replay: opts.replay
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {

// ===========================================================================
// describe('isThinkingPhase')
// ===========================================================================
console.log('\n=== describe: isThinkingPhase ===');

assert(typeof overlayStateExports.isThinkingPhase === 'function',
  'isThinkingPhase exported on module.exports');
assertEq(overlayStateExports.isThinkingPhase('planning'), true, "isThinkingPhase('planning') === true");
assertEq(overlayStateExports.isThinkingPhase('thinking'), true, "isThinkingPhase('thinking') === true");
assertEq(overlayStateExports.isThinkingPhase('navigation'), false, "isThinkingPhase('navigation') === false");
assertEq(overlayStateExports.isThinkingPhase('extraction'), false, "isThinkingPhase('extraction') === false");
assertEq(overlayStateExports.isThinkingPhase('click'), false, "isThinkingPhase('click') === false");
assertEq(overlayStateExports.isThinkingPhase('acting'), false, "isThinkingPhase('acting') === false");
assertEq(overlayStateExports.isThinkingPhase(null), false, 'isThinkingPhase(null) === false');
assertEq(overlayStateExports.isThinkingPhase(undefined), false, 'isThinkingPhase(undefined) === false');
assertEq(overlayStateExports.isThinkingPhase(''), false, "isThinkingPhase('') === false");
assertEq(overlayStateExports.isThinkingPhase('PLANNING'), true, "isThinkingPhase('PLANNING') case-insensitive");
const replacementPolicyContext = { Boolean };
vm.createContext(replacementPolicyContext);
vm.runInContext(
  declarationSource(messagingSrc, 'fsbShouldReplaceFinalOverlay') + '\n' +
    'this.shouldReplaceFinalOverlay = fsbShouldReplaceFinalOverlay;',
  replacementPolicyContext,
  { filename: 'extension/content/messaging.js' }
);
const shouldReplaceFinalOverlay = replacementPolicyContext.shouldReplaceFinalOverlay;
assert(
  messagingSrc.includes('fsbShouldReplaceFinalOverlay(previousOverlayState, overlayState)') &&
    messagingSrc.indexOf('FSB.progressOverlay.reset();') < messagingSrc.indexOf('FSB.overlayState = overlayState;') &&
    messagingSrc.indexOf('FSB.replayPlayerOverlay.destroy();') < messagingSrc.indexOf('FSB.overlayState = overlayState;'),
  'an accepted replacement resets the finished pill and destroys the replay player before rendering'
);
assertEq(shouldReplaceFinalOverlay(
  { lifecycle: 'final', sessionToken: 'replay-token' },
  { lifecycle: 'running' }
), true, 'a tokenless automation replaces a finalized replay overlay');
assertEq(shouldReplaceFinalOverlay(
  { lifecycle: 'final' },
  { lifecycle: 'running' }
), true, 'tokenless running lifecycles replace tokenless finalized overlays');
assertEq(shouldReplaceFinalOverlay(
  { lifecycle: 'final', sessionToken: 'old-token' },
  { lifecycle: 'final', sessionToken: 'new-token' }
), true, 'a different finalized session replaces the prior final overlay');
assertEq(shouldReplaceFinalOverlay(
  { lifecycle: 'final', sessionToken: 'same-token' },
  { lifecycle: 'final', sessionToken: 'same-token' }
), false, 'same-session final updates preserve the frozen overlay');
assertEq(shouldReplaceFinalOverlay(
  { lifecycle: 'final', sessionToken: 'old-token' },
  { lifecycle: 'cleared', sessionToken: 'new-token' }
), false, 'explicit clears continue through the existing clear path');

console.log('\n--- Test: a finished pill holds three seconds, then runs the exit and is removed ---');
{
  const scheduled = [];
  const realSetTimeout = sandbox.setTimeout;
  const realClearTimeout = sandbox.clearTimeout;
  sandbox.setTimeout = function(fn, delay) {
    const timer = { fn, delay, cleared: false };
    scheduled.push(timer);
    return timer;
  };
  sandbox.clearTimeout = function(timer) {
    if (timer) timer.cleared = true;
  };
  const live = (delay) => scheduled.find((timer) => timer.delay === delay && !timer.cleared);

  const o = buildOverlay();
  o.update(makeState({ lifecycle: 'final', result: 'success', detail: 'Replay complete' }));
  assert(o.container.classList.contains('done'), 'a successful final state takes the done tone');
  assertEq(o.container.querySelector('.pl-in').textContent, 'Done', 'a successful final state reads Done');
  const hold = live(3000);
  assert(!!hold, 'the finished pill schedules its three-second hold');
  hold.fn();
  assertEq(o._leaving, 1, 'after the hold the exit starts by folding the status');
  assert(o.container.classList.contains('head'), 'the first exit beat folds to the top line');
  const toSeed = live(300);
  const lift = live(760);
  const remove = live(1080);
  assert(!!toSeed && !!lift && !!remove, 'the exit beats land at 300, 760 and 1080ms');
  toSeed.fn();
  assert(o.container.classList.contains('seed'), 'at 300ms the pill draws back to the seed');
  lift.fn();
  assert(o.container.classList.contains('gone'), 'at 760ms the seed lifts away');
  remove.fn();
  assertEq(o.host, null, 'at 1080ms the pill is removed');
  assertEq(o.container, null, 'the removed pill drops its DOM references');
  assertEq(o._frozen, false, 'the frozen state resets after removal');

  sandbox.setTimeout = realSetTimeout;
  sandbox.clearTimeout = realClearTimeout;
}

console.log('\n--- Test: a new call during the exit morphs the pill straight back ---');
{
  setNow(5000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'acting', detail: 'Entering contact email' }));
  o.dismiss();
  assertEq(o._leaving, 1, 'dismiss() starts the exit');
  o.update(makeState({ phase: 'acting', detail: 'Placing the order' }));
  assertEq(o._leaving, 0, 'a running update cancels the exit');
  assertEq(o._stage, 2, 'the pill returns to its full shape');
  assert(!o.container.classList.contains('head') && !o.container.classList.contains('seed'), 'no fold or seed shape remains');
  o.destroy();
}

console.log('\n--- Test: reset() lets a new session take over a finished pill ---');
{
  setNow(6000);
  const o = buildOverlay();
  o.update(makeState({ lifecycle: 'final', result: 'success', detail: 'Task completed' }));
  assertEq(o._frozen, true, 'the finished pill is frozen');
  o.update(makeState({ phase: 'acting', detail: 'Ignored while frozen' }));
  assertEq(o.container.querySelector('.pl-in').textContent, 'Done', 'a frozen pill ignores further updates');
  o.reset();
  assertEq(o._frozen, false, 'reset() unfreezes the pill');
  o.update(makeState({ phase: 'acting', detail: 'Continuing to payment' }));
  assertEq(o.container.querySelector('.pl-in').textContent, 'Continuing to payment', 'the new session writes at once');
  assertEq(o.container.querySelector('.pl-time').textContent, '0:00', 'the timer starts again');
  assert(o.container.classList.contains('acting'), 'the new session takes its own tone');
  o.destroy();
}

// ===========================================================================
// describe('thinking suppression in ProgressOverlay.update()')
// ===========================================================================
console.log('\n=== describe: thinking suppression in ProgressOverlay.update() ===');

console.log('\n--- Test: first update with planning phase + generic detail = suppressed ---');
{
  setNow(10000);
  const o = buildOverlay();
  // detail equals the default phase fallback 'Planning next step' would be set upstream;
  // the gate's "generic" check covers 'Working' and the phaseLabel string. Pass 'Working'
  // to simulate the no-real-status-text condition.
  o.update(makeState({ phase: 'planning', detail: 'Working' }));
  const stepTextEl = o.container.querySelector('.pl-in');
  assertEq(stepTextEl.textContent, '', 'thinking-class + elapsed=0 + generic detail -> empty status line');
  assert(o.container.classList.contains('head'), 'with no status the pill shows only its top line');
  o.destroy();
}

console.log('\n--- Test: after 1100ms elapsed, planning phase no longer suppressed ---');
{
  setNow(20000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'planning', detail: 'Working' }));
  const stepTextEl = o.container.querySelector('.pl-in');
  assertEq(stepTextEl.textContent, '', 'initial suppressed');
  // Advance mocked time past 1s
  advanceNow(1100);
  o.update(makeState({ phase: 'planning', detail: 'Working' }));
  // Wait for any debounce flush
  await sleep(500);
  assertEq(stepTextEl.textContent, 'Working', 'after >1000ms elapsed, suppression released; "Working" written');
  o.destroy();
}

console.log('\n--- Test: navigation phase NOT suppressed even at elapsed=0 ---');
{
  setNow(30000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'navigation', detail: 'Loading https://example.com' }));
  const stepTextEl = o.container.querySelector('.pl-in');
  assertEq(stepTextEl.textContent, 'Loading https://example.com',
    'concrete action phase writes detail immediately regardless of elapsed');
  o.destroy();
}

console.log('\n--- Test: planning phase + REAL non-generic detail NOT suppressed ---');
{
  setNow(40000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'planning', detail: 'Reviewing search results' }));
  const stepTextEl = o.container.querySelector('.pl-in');
  assertEq(stepTextEl.textContent, 'Reviewing search results',
    'real status detail (not "Working" / phaseLabel) writes through even under thinking phase');
  o.destroy();
}

// ===========================================================================
// describe('first-sentence regression guard')
// ===========================================================================
console.log('\n=== describe: first-sentence regression guard ===');

console.log('\n--- Test: legacy state.stepText path collapses multi-sentence to first sentence ---');
{
  setNow(50000);
  const o = buildOverlay();
  // Legacy non-display.* shape -- triggers the fallback at ~line 620.
  // No display key, just stepText.
  o.update({
    phase: 'navigation',
    stepText: 'Sentence one. Sentence two. Sentence three.',
    taskName: 'Legacy task'
  });
  const stepTextEl = o.container.querySelector('.pl-in');
  assert(stepTextEl.textContent === 'Sentence one.' || stepTextEl.textContent.indexOf('Sentence two') < 0,
    'legacy stepText collapses to first sentence; got: ' + JSON.stringify(stepTextEl.textContent));
  o.destroy();
}

console.log('\n--- Test: display.detail multi-sentence smoke (sanitized upstream) ---');
{
  setNow(60000);
  const o = buildOverlay();
  // In real flow, buildOverlayDisplay() applies firstSentence upstream. Here we
  // simulate the already-sanitized payload arriving at update().
  o.update(makeState({ phase: 'navigation', detail: 'Sentence one.' }));
  const stepTextEl = o.container.querySelector('.pl-in');
  assertEq(stepTextEl.textContent, 'Sentence one.',
    'pre-sanitized display.detail flows through unchanged');
  o.destroy();
}

// ===========================================================================
// describe('reduced-motion strict mode')
// ===========================================================================
console.log('\n=== describe: reduced-motion strict mode ===');

console.log('\n--- Test: ProgressOverlay shadow CSS has reduced-motion block covering text surfaces ---');
{
  // Locate the ProgressOverlay shadow style block (~line 410-560 of visual-feedback.js)
  // and verify the @media block contains text-surface selectors.
  // Match an @media block with up to ~6 nested rule blocks (covers both
  // ProgressOverlay and ActionGlowOverlay reduced-motion sections).
  const reducedMotionRegex = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(?:[^{}]*\{[^{}]*\}){1,12}[^{}]*\}/g;
  const blocks = visualFeedbackSrc.match(reducedMotionRegex) || [];
  assert(blocks.length >= 2,
    'at least 2 @media (prefers-reduced-motion: reduce) blocks present (ProgressOverlay + ActionGlowOverlay); got ' + blocks.length);

  // The first block (the status pill) turns off every transition and keyframe.
  const textSurfaces = [
    '.pl-host', '.pl-in', '.pl-out', '.pl-name', '.pl-agent', '.pl-text', '.pl-more', '.pl-time', '.pl-stop', '.pl-bead'
  ];
  const progressBlock = blocks[0] || '';
  textSurfaces.forEach(sel => {
    assert(progressBlock.indexOf(sel) >= 0,
      'status pill reduced-motion block contains ' + sel);
  });
  assert(progressBlock.indexOf('transition: none') >= 0,
    'status pill reduced-motion block uses transition: none');
  assert(progressBlock.indexOf('animation: none') >= 0,
    'status pill reduced-motion block uses animation: none');
}

console.log('\n--- Test: the done state keeps its green fill and ring (colour still changes under reduced motion) ---');
{
  const completeRule = visualFeedbackSrc.match(/\.pl-host\.done \.pl-fill\s*\{[^}]*background:\s*#34d399/);
  assert(completeRule, '.pl-host.done .pl-fill sets background: #34d399');
  assert(/\.pl-host\.done\s*\{[^}]*--ring:\s*rgba\(52, 211, 153, 0\.55\)/.test(visualFeedbackSrc),
    '.pl-host.done sets the green ring');
}

console.log('\n--- Test: completion under matchMedia(reduced-motion)=true STILL turns green ---');
{
  setMatchMedia(true);
  setNow(70000);
  const o = buildOverlay();
  o.update(makeState({
    lifecycle: 'final',
    result: 'success',
    phase: 'complete',
    detail: 'Task completed',
    progress: { mode: 'determinate', percent: 100, label: 'Done' }
  }));
  assert(o.container.classList.contains('done'), 'done tone still set under reduced-motion');
  assert(o.container.classList.contains('track'), 'the filled track still shows under reduced-motion');
  o.destroy();
  setMatchMedia(false);
}

console.log('\n--- Test: ActionGlowOverlay reduced-motion block still present (regression guard) ---');
{
  // Find the second @media (prefers-reduced-motion: reduce) block.
  // Match an @media block with up to ~6 nested rule blocks (covers both
  // ProgressOverlay and ActionGlowOverlay reduced-motion sections).
  const reducedMotionRegex = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(?:[^{}]*\{[^{}]*\}){1,12}[^{}]*\}/g;
  const blocks = visualFeedbackSrc.match(reducedMotionRegex) || [];
  // Last block should be ActionGlowOverlay's
  const glowBlock = blocks[blocks.length - 1] || '';
  assert(glowBlock.indexOf('.box-overlay') >= 0,
    'ActionGlowOverlay reduced-motion block contains .box-overlay');
  assert(glowBlock.indexOf('.text-highlight') >= 0,
    'ActionGlowOverlay reduced-motion block contains .text-highlight');
  assert(glowBlock.indexOf('transition: none') >= 0,
    'ActionGlowOverlay reduced-motion block has transition: none');
  assert(glowBlock.indexOf('animation: none') >= 0,
    'ActionGlowOverlay reduced-motion block has animation: none');
}

// ---------------------------------------------------------------------------
// Capability-call overlay: violet "calling" mode + amber "guarded" state
// ---------------------------------------------------------------------------
console.log('\n=== describe: capability/guarded visual states ===');

console.log('\n--- Test: phase=calling + ready capability opens the third row with slug and readiness ---');
{
  setNow(80000);
  const o = buildOverlay();
  o.update(makeState({
    phase: 'calling',
    detail: 'Checking existing escalation issues',
    guarded: false,
    capability: {
      chipText: 'github.com · github.issues.list',
      readinessLabel: 'T1 ready',
      readinessClass: 'ready',
      noteText: null
    },
    stoppable: true
  }));
  assert(o.container.classList.contains('calling'), 'pill takes the calling tone');
  assert(!o.container.classList.contains('guarded'), 'pill is NOT guarded');
  assert(o.container.classList.contains('more') && o.container.classList.contains('k-cap'), 'the third row opens for the capability');
  assertEq(o.container.querySelector('.pl-slug').textContent, 'github.com · github.issues.list', 'slug text set');
  assertEq(o.container.querySelector('.pl-tag').textContent, 'T1 ready', 'readiness label set');
  assert(o.container.querySelector('.pl-tag').classList.contains('ready'), 'readiness tag has .ready class');
  assert(!o.container.classList.contains('k-guard'), 'no blocked note when not guarded');
  assert(o.container.classList.contains('stoppable'), 'Stop shows when stoppable=true');
  assertEq(o.container.style.width, '248px', 'a capability call takes the full 248px');
  o.destroy();
}

console.log('\n--- Test: phase=calling + guarded=true shows the amber note ---');
{
  setNow(90000);
  const o = buildOverlay();
  o.update(makeState({
    phase: 'calling',
    detail: 'Filing new escalation issue',
    guarded: true,
    capability: {
      chipText: 'github.com · github.issues.create',
      readinessLabel: 'Guarded',
      readinessClass: 'guarded',
      noteText: 'Blocked — nothing was created. Needs your approval to run write actions.'
    },
    stoppable: false
  }));
  assert(o.container.classList.contains('guarded'), 'pill takes the guarded tone');
  assert(!o.container.classList.contains('calling'), 'guarded wins over calling (mockup precedence)');
  assert(o.container.classList.contains('more') && o.container.classList.contains('k-guard'), 'the third row opens for the note');
  assertEq(o.container.querySelector('.pl-note').textContent,
    'Blocked — nothing was created. Needs your approval to run write actions.', 'note text set');
  assert(!o.container.classList.contains('stoppable'), 'Stop stays hidden when stoppable=false');
  assertEq(o._foldTimer, null, 'a blocked pill stays open: no fold is armed');
  o.destroy();
}

console.log('\n--- Test: ordinary non-capability update leaves every extra surface closed (regression guard) ---');
{
  setNow(100000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'acting', detail: 'Clicking submit' }));
  assert(o.container.classList.contains('acting'), 'ordinary acting update takes the acting tone');
  assert(!o.container.classList.contains('calling'), 'ordinary update: no calling tone');
  assert(!o.container.classList.contains('guarded'), 'ordinary update: no guarded tone');
  assert(!o.container.classList.contains('more'), 'ordinary update: no third row');
  assert(!o.container.classList.contains('stoppable'), 'ordinary update: Stop stays hidden');
  o.destroy();
}

console.log('\n--- Test: replay metadata does not add controls to the ordinary overlay ---');
{
  setNow(105000);
  const o = buildOverlay();
  o.update(makeState({
    phase: 'acting',
    detail: 'Clicking submit',
    replay: {
      sessionId: 'replay-overlay-test',
      status: 'paused',
      speed: 2,
      positionMs: 4200,
      durationMs: 10000,
      currentStep: 2,
      totalSteps: 5,
      forwardSeekOnly: true
    }
  }));
  assertEq(o.container.querySelector('.fsb-replay-toggle'), null, 'ordinary overlay contains no replay button');
  assertEq(o.container.querySelector('.fsb-replay-scrubber'), null, 'ordinary overlay contains no replay timeline');
  assert(!o.container.classList.contains('replay'), 'ordinary overlay receives no replay presentation class');
  o.destroy();
}

console.log('\n--- Test: replay status card uses normal presentation with Replay-only identity ---');
{
  setNow(106000);
  const replayState = overlayStateExports.buildOverlayState({
    sessionId: 'replay-overlay-test',
    sessionToken: 'replay-overlay-test',
    phase: 'acting',
    taskName: 'Replay: Safe demo',
    statusText: 'Scrolling page',
    progress: { mode: 'determinate', percent: 40, label: '' },
    clientLabel: 'Replay',
    stoppable: false,
    replay: {
      sessionId: 'replay-overlay-test',
      status: 'playing',
      speed: 1,
      positionMs: 4000,
      durationMs: 10000,
      currentStep: 2,
      totalSteps: 5,
      forwardSeekOnly: true
    }
  }, null);
  const o = buildOverlay();
  o.update(replayState);
  await sleep(500);

  assertEq(o.container.querySelector('.pl-name').textContent, 'Replay',
    'replay pill names Replay as the driver');
  assert(!o.container.classList.contains('stoppable'),
    'replay pill keeps the shared stop control hidden');
  assertEq(o.container.querySelector('.pl-in').textContent, 'Scrolling page',
    'replay pill shows the current action text');
  assertEq(o.container.querySelector('.pl-time').textContent, '0:00',
    'replay pill keeps the normal elapsed timer');
  assertEq(o.container.querySelector('.pl-fill').style.transform, 'scaleX(0.4)',
    'replay pill fills the track to its determinate progress');
  assertEq(o.container.querySelector('.pl-count').textContent, '',
    'a percent with no count label adds no count');
  o.destroy();
}

console.log('\n--- Test: ordinary sessions retain agent identity and stop controls ---');
{
  setNow(107000);
  const o = buildOverlay();
  o.update(makeState({
    phase: 'acting',
    detail: 'Clicking submit',
    clientLabel: 'Codex',
    agentIdShort: 'agent_abc123',
    stoppable: true,
    progress: { mode: 'determinate', percent: 25, label: 'Acting…', eta: null }
  }));
  await sleep(500);

  assertEq(o.container.querySelector('.pl-name').textContent, 'Codex',
    'the pill names the client');
  assertEq(o.container.querySelector('.pl-who').textContent, 'agent_abc123',
    'the agent id waits in the hover row');
  assert(!o.container.classList.contains('more'), 'the hover row is closed until the pointer is over the pill');
  const closedHeight = o.container.style.height;
  o._pointerAt(50, 20);
  assert(o.container.classList.contains('more') && o.container.classList.contains('k-who'),
    'hover opens the agent id row');
  assertEq(parseInt(o.container.style.height, 10), parseInt(closedHeight, 10) + 20, 'the agent id row adds 20px');
  o._pointerAt(-1, -1);
  assert(!o.container.classList.contains('more'), 'leaving the pill closes the agent id row');
  assert(o.container.classList.contains('stoppable'),
    'ordinary stoppable session retains the stop control');
  o.destroy();
}

console.log('\n--- Test: FSB autopilot carries no name ---');
{
  setNow(108000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'acting', detail: 'Comparing jacket prices', clientLabel: 'Autopilot', stoppable: true }));
  assert(o.container.classList.contains('anon'), 'the autopilot pill drops the name and divider');
  assertEq(o.container.querySelector('.pl-name').textContent, '', 'no name is written');
  // 12 + 32 + 10 (gap) + timer 0:00 (28) + Stop (26) + 14 = 122; the status is wider
  assertEq(o.container.style.width, (146 + 6 + 26) + 'px', 'width follows the status');
  o.destroy();
}

console.log('\n--- Test: shapes and sizes match the spec board ---');
{
  setNow(109000);
  const o = buildOverlay();
  o._stage = 0;
  o.update(makeState({ phase: 'acting', detail: 'Continuing to payment', clientLabel: 'Claude' }));
  assertEq(o.container.style.width + ' ' + o.container.style.height, '56px 36px', 'seed is 56 x 36');
  o._stage = 1;
  o._render();
  assertEq(o.container.style.width + ' ' + o.container.style.height, '161px 36px', 'top line is 89 plus name and timer: 161 x 36');
  o._stage = 2;
  o._render();
  assertEq(o.container.style.width + ' ' + o.container.style.height, '168px 58px', 'two lines are the status plus 26: 168 x 58');
  o._folded = true;
  o._render();
  assertEq(o.container.style.width + ' ' + o.container.style.height, '161px 36px', 'folded is the top line');
  assert(o.container.classList.contains('shrink'), 'folding uses the shrinking curve');
  o.destroy();

  const wrap = buildOverlay();
  wrap.update(makeState({ phase: 'acting', detail: 'Filling in the delivery address from the saved profile', clientLabel: 'Claude' }));
  assertEq(wrap.container.style.width + ' ' + wrap.container.style.height, '248px 75px', 'a long status wraps once at 248: 248 x 75');
  wrap.destroy();

  const cap = buildOverlay();
  cap.update(makeState({ phase: 'calling', detail: 'Submitting checkout', clientLabel: 'Claude',
    capability: { chipText: 'northwind.checkout.submit', readinessLabel: 'T1 ready', readinessClass: 'ready' } }));
  assertEq(cap.container.style.width + ' ' + cap.container.style.height, '248px 78px', 'a capability row: 248 x 78');
  cap.destroy();

  const blocked = buildOverlay();
  blocked.update(makeState({ phase: 'calling', guarded: true, detail: 'Submitting checkout', clientLabel: 'Claude',
    capability: { chipText: 'northwind.checkout.submit', noteText: 'Blocked. This site needs your approval before FSB can act here.' } }));
  assertEq(blocked.container.style.width + ' ' + blocked.container.style.height, '248px 96px', 'blocked is the tallest: 248 x 96');
  blocked.destroy();

  const done = buildOverlay();
  done.update(makeState({ lifecycle: 'final', result: 'success', detail: 'Task completed', clientLabel: 'Claude' }));
  // 161 for the top line plus the 20px tick
  assertEq(done.container.style.width, '181px', 'done adds the 20px tick by the timer');
  done.destroy();
}

console.log('\n--- Test: the status folds 2.6s after an action ends, and stays open while it runs ---');
{
  const scheduled = [];
  const realSetTimeout = sandbox.setTimeout;
  const realClearTimeout = sandbox.clearTimeout;
  sandbox.setTimeout = function(fn, delay) { const t = { fn, delay, cleared: false }; scheduled.push(t); return t; };
  sandbox.clearTimeout = function(t) { if (t) t.cleared = true; };
  const live = (delay) => scheduled.filter((t) => t.delay === delay && !t.cleared);

  setNow(110000);
  const o = buildOverlay();
  o.update(makeState({ phase: 'planning', detail: 'Continuing to payment', clientLabel: 'Claude' }));
  assertEq(live(2600).length, 1, 'writing a status arms the 2.6s fold');
  o.noteAction(true);
  assertEq(live(2600).length, 0, 'an action running on the page holds the status open');
  assert(o.container.classList.contains('acting'), 'the pill takes the acting tone while the action runs');
  o.noteAction(false);
  assert(o.container.classList.contains('thinking'), 'it returns to thinking when the action ends');
  const fold = live(2600);
  assertEq(fold.length, 1, 'the fold is armed again when the action ends');
  fold[0].cleared = true; // spent
  fold[0].fn();
  assert(o.container.classList.contains('head'), 'the status folds away');
  o.update(makeState({ phase: 'planning', detail: 'Entering contact email', clientLabel: 'Claude' }));
  assert(!o.container.classList.contains('head'), 'a new status opens it again');
  o.setMotion({ form: 'ring', startedAt: 1 });
  assertEq(live(2600).length, 0, 'a capability call in flight holds the status open');
  o.setMotion({ form: 'sweep', startedAt: 1 });
  assertEq(live(2600).length, 1, 'the fold returns once the ring ends');
  o.destroy();
  assertEq(live(2600).length, 0, 'destroy() clears the fold timer');

  sandbox.setTimeout = realSetTimeout;
  sandbox.clearTimeout = realClearTimeout;
}

console.log('\n--- Test: a stopped trigger watch only drops the watching tone ---');
{
  setNow(111000);
  const o = buildOverlay();
  o.update({ lifecycle: 'running', phase: 'trigger-watch', mode: 'trigger-watch',
    display: { title: 'FSB Trigger', subtitle: '', detail: 'Watching #price >= 250 (live)' },
    progress: { mode: 'indeterminate', percent: null, label: 'Watching', eta: null } });
  assert(o.container.classList.contains('watching'), 'a trigger caption takes the watching tone');
  assertEq(o._foldDelay, 4000, 'a watch caption folds after 4s');
  o.update({ lifecycle: 'cleared', phase: 'cleared', mode: 'trigger-watch', display: { title: '', subtitle: '', detail: '' }, progress: null });
  assert(o.container.classList.contains('thinking') && !o.container.classList.contains('watching'), 'clearing the watch returns to thinking');
  assertEq(o.container.querySelector('.pl-in').textContent, 'Watching #price >= 250 (live)', 'the pill itself stays up');
  o.destroy();
}

console.log('\n--- Test: the watchdog degraded state is Waiting: grey and still ---');
{
  setNow(112000);
  const o = buildOverlay();
  o.update(Object.assign(makeState({ phase: 'planning', detail: 'Waiting for next automation update' }), { reconnecting: true }));
  assert(o.container.classList.contains('waiting'), 'a degraded state takes the waiting tone');
  assertEq(o._foldTimer, null, 'a waiting pill does not fold');
  o.destroy();
}

// ---------------------------------------------------------------------------
// Phase 230: pill shows phase wording instead of percent during run
// ---------------------------------------------------------------------------
console.log('\n=== describe: Phase 230 — pill phase wording ===');

const overlayMod = loadOverlayStateModule();

console.log('\n--- Phase 230: determinate progress at 37% with phase=acting → label is "Acting…", percent preserved ---');
{
  const state = overlayMod.buildOverlayState({
    phase: 'acting',
    progressPercent: 37,
    statusText: 'Clicking submit'
  }, null);
  assertEq(state.progress.label, 'Acting…',
    'Phase 230: determinate label is phase wording with ellipsis, not percent');
  assertEq(state.progress.percent, 37,
    'Phase 230: numeric .percent preserved on progress for the scaleX bar');
  assertEq(state.progress.mode, 'determinate',
    'Phase 230: determinate mode preserved');
}

console.log('\n--- Phase 230: phase=writing → "Writing…" with ellipsis ---');
{
  const state = overlayMod.buildOverlayState({
    phase: 'writing',
    progressPercent: 60
  }, null);
  assertEq(state.progress.label, 'Writing…',
    'Phase 230: writing phase shows "Writing…"');
}

console.log('\n--- Phase 230: phase=complete → "Complete" with NO ellipsis (terminal) ---');
{
  const state = overlayMod.buildOverlayState({
    phase: 'complete',
    progressPercent: 100,
    statusText: 'All done'
  }, null);
  // Note: depending on lifecycle the label may be 'Done' from the final-state branch,
  // but it should NEVER be 'Complete…' or any ellipsis-suffixed terminal label.
  assert(state.progress.label.indexOf('…') === -1,
    'Phase 230: complete-phase label has no ellipsis suffix');
}

console.log('\n--- Phase 230: phase=error → "Error" with NO ellipsis (terminal) ---');
{
  const state = overlayMod.buildOverlayState({
    phase: 'error',
    statusText: 'Something failed'
  }, null);
  assert(state.progress.label.indexOf('…') === -1,
    'Phase 230: error-phase label has no ellipsis suffix');
}

console.log('\n--- Phase 230: unknown/degraded phase falls back without ellipsis ---');
{
  const state = overlayMod.buildOverlayState({
    phase: 'waiting',
    lifecycle: 'running',
    sessionToken: 'tok',
    version: 1
  }, null);
  assert(state.progress.label.indexOf('…') === -1,
    'Phase 230: unknown phase ("waiting") falls back without ellipsis (degraded behavior preserved)');
}

console.log('\n--- Phase 230: indeterminate planning phase → "Planning…" ---');
{
  const state = overlayMod.buildOverlayState({
    phase: 'planning'
  }, null);
  assertEq(state.progress.label, 'Planning…',
    'Phase 230: indeterminate planning shows "Planning…"');
  assertEq(state.progress.mode, 'indeterminate',
    'Phase 230: indeterminate mode preserved');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n=========================================');
console.log('overlay-content-audit.test.js results');
console.log('  passed:', passed);
console.log('  failed:', failed);
console.log('=========================================');
if (failed > 0) process.exit(1);
})();
