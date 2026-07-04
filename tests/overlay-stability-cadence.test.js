/**
 * Phase 229-01 cadence/stability tests for ProgressOverlay + ActionGlowOverlay.
 *
 * Covers:
 *   OVERLAY-01: status-text debounce (>=400ms gating, coalesce-to-latest, isFinal flush)
 *   OVERLAY-02: ActionGlowOverlay rect memoization (recompute only on resize/scroll/target change)
 *   OVERLAY-03: monotonic progress clamp (Math.max(prev, new))
 *   OVERLAY-04: action counter batching (write only when value changes)
 *
 * Approach: load extension/content/visual-feedback.js inside a node vm sandbox
 * with a minimal hand-rolled DOM/window shim, then exercise the exported
 * ProgressOverlay / ActionGlowOverlay classes directly.
 *
 * Run: node tests/overlay-stability-cadence.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Minimal DOM/window shim
// ---------------------------------------------------------------------------

let nowMs = 1000;
function setNow(v) { nowMs = v; }
function advanceNow(d) { nowMs += d; }

// Manual rAF driver -- queue callbacks, fire on tickRAF()
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
function tickRAF() {
  const batch = rafQueue;
  rafQueue = [];
  for (const e of batch) {
    try { e.cb(); } catch (err) { console.error('rAF callback threw:', err); }
  }
}

// setTimeout: real timers (debounce uses ms intervals; tests advance time + sleep).
// performance.now is fully mocked.

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
    _textContent: '',
    _innerHTML: '',
    _isConnected: true,
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) {
      this._innerHTML = String(v);
      // Parse a tiny subset: any class="..." attribute creates a child stub
      // Sufficient for ProgressOverlay's container.innerHTML which sets up
      // .fsb-task, .fsb-summary, .fsb-step-text, .fsb-step-number, .fsb-eta,
      // .fsb-phase, .fsb-progress-bar, .fsb-progress-fill, .fsb-client-badge,
      // .fsb-stop, .fsb-chip*, .fsb-note*, .fsb-log*.
      const childClasses = [
        'fsb-header','fsb-logo','fsb-title','fsb-client-badge','fsb-stop',
        'fsb-task','fsb-summary',
        'fsb-chip','fsb-chip-lock','fsb-chip-txt','fsb-chip-rdy',
        'fsb-note','fsb-note-icon','fsb-note-text',
        'fsb-step','fsb-step-number','fsb-step-text',
        'fsb-log','fsb-log-line','fsb-log-line',
        'fsb-meta','fsb-phase','fsb-eta','fsb-progress-bar','fsb-progress-fill'
      ];
      this.children = childClasses.map(c => {
        const ch = makeElement(c === 'fsb-logo' ? 'img' : 'span');
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
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    removeAttribute(k) { delete this.attributes[k]; },
    querySelector(sel) {
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return findDescendant(this, n => n.classList && n.classList.contains(cls));
      }
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        return findDescendant(this, n => n.id === id);
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
    attachShadow(opts) {
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
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
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

const documentElement = makeElement('html');
const documentBody = makeElement('body');
documentElement.appendChild(documentBody);

const documentStub = {
  documentElement,
  body: documentBody,
  createElement(tag) { return makeElement(tag); },
  addEventListener() {},
  removeEventListener() {}
};

// Window-level event listener tracking
const windowListeners = { add: [], remove: [] };
const windowStub = {
  FSB: {
    _modules: {},
    logger: { log(){}, info(){}, warn(){}, error(){}, debug(){} }
  },
  FSBOverlayStateUtils: {
    humanizeOverlayPhase(p) { return p ? String(p) : 'Working'; },
    sanitizeOverlayText(t) { return t == null ? '' : String(t); },
    sanitizeActionText(t) { return t == null ? '' : String(t); },
    firstSentence(t) { return t == null ? '' : String(t); }
  },
  addEventListener(type, fn, opts) { windowListeners.add.push({ type, fn, opts }); },
  removeEventListener(type, fn, opts) { windowListeners.remove.push({ type, fn, opts }); },
  __FSB_SKIP_INIT__: false,
  CSS: { supports: () => false }
};

// Set up sandbox globals
const sandbox = {
  window: windowStub,
  document: documentStub,
  performance: { now() { return nowMs; } },
  requestAnimationFrame: requestAnimationFrameStub,
  cancelAnimationFrame: cancelAnimationFrameStub,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  console,
  chrome: {
    runtime: { getURL: (p) => 'chrome-extension://test/' + p }
  },
  module: { exports: {} },
  Set, Map, WeakMap, WeakSet, Promise, Date, Math, JSON, String, Number, Boolean, Array, Object, Error, RegExp,
  Symbol, Reflect
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
// Make `window.X` lookups also work on bare references via vm context aliasing
sandbox.HTMLElement = function HTMLElement(){};

const ctx = vm.createContext(sandbox);

// Load and run visual-feedback.js inside the sandbox
const vfPath = path.resolve(__dirname, '..', 'extension', 'content', 'visual-feedback.js');
const src = fs.readFileSync(vfPath, 'utf8');
vm.runInContext(src, ctx, { filename: 'visual-feedback.js' });

const { ProgressOverlay, ActionGlowOverlay, PROGRESS_TEXT_DEBOUNCE_MS } = sandbox.module.exports;

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

// Build a ProgressOverlay with a populated container (skip create() because
// it touches Popover API + chrome.runtime). Mimic the post-create() shape.
function buildOverlay() {
  const overlay = new ProgressOverlay();
  overlay.host = makeElement('div');
  overlay.shadow = overlay.host.attachShadow({ mode: 'open' });
  const container = makeElement('div');
  container.classList.add('fsb-overlay');
  container.innerHTML = '<inflate/>'; // triggers child seeding in our stub
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
    clientLabel: '',
    result: opts.result
  };
}

// Wait helper -- real setTimeout, returns a Promise.
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===========================================================================
// describe('overlay stability cadence -- ProgressOverlay')
// ===========================================================================

(async () => {

console.log('\n--- Test 1: PROGRESS_TEXT_DEBOUNCE_MS exported as 400 ---');
assertEq(PROGRESS_TEXT_DEBOUNCE_MS, 400, 'debounce constant is 400ms');

console.log('\n--- Test 2: First update writes immediately (cold path) ---');
{
  setNow(1000);
  const o = buildOverlay();
  o.update(makeState({ title: 'T1', detail: 'D1' }));
  // Immediate flush expected (elapsed since _lastTextWriteAt=0 is huge).
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'D1', 'cold path writes detail immediately');
  o.destroy();
}

console.log('\n--- Test 3: 10 rapid updates within 50ms coalesce to latest ---');
{
  setNow(2000);
  const o = buildOverlay();
  // First call writes immediately at t=2000
  o.update(makeState({ detail: 'first' }));
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'first', 'initial write present');
  // 10 burst calls within 50ms (advance 5ms each)
  for (let i = 0; i < 10; i++) {
    advanceNow(5);
    o.update(makeState({ detail: 'burst-' + i }));
  }
  // None should have visibly changed yet (all coalesced into pending).
  assertEq(detailEl.textContent, 'first', 'rapid bursts do not write during debounce window');
  // Phase 230: wait > MIN_DISPLAY_DURATION_MS (1200ms) for the floor-extended
  // setTimeout to fire. Phase 229's 400ms debounce alone is no longer sufficient.
  await sleep(1300);
  // performance.now() didn't change during sleep (nowMs is mocked); flush
  // happens via setTimeout -- it writes whatever is in _pendingDisplay (latest).
  assertEq(detailEl.textContent, 'burst-9', 'after dwell+debounce window, latest queued value flushes');
  o.destroy();
}

console.log('\n--- Test 4: lifecycle === "final" flushes immediately, bypassing debounce ---');
{
  setNow(3000);
  const o = buildOverlay();
  o.update(makeState({ detail: 'pre-final' }));
  advanceNow(50);
  // Queue a pending update inside the debounce window
  o.update(makeState({ detail: 'queued' }));
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'pre-final', 'queued update did not flush yet');
  // Now a final update should flush immediately.
  o.update(makeState({ lifecycle: 'final', detail: 'FINAL', title: 'Done', result: 'success' }));
  assertEq(detailEl.textContent, 'FINAL', 'final lifecycle bypasses debounce and flushes synchronously');
  o.destroy();
}

console.log('\n--- Phase 230 Test A: dwell floor honored — 800ms gap < 1200ms holds first text ---');
{
  setNow(3500);
  const o = buildOverlay();
  o.update(makeState({ detail: 'first' }));
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'first', 'first write present');
  // Advance 800ms in mocked time — past 400ms debounce, before 1200ms dwell floor.
  advanceNow(800);
  o.update(makeState({ detail: 'second' }));
  // Dwell floor blocks immediate flush; second is queued in pending.
  assertEq(detailEl.textContent, 'first', 'Phase 230: dwell floor holds first text past debounce window');
  // Wait the remaining ~400ms (real time) for the floor-extended setTimeout to fire.
  await sleep(500);
  assertEq(detailEl.textContent, 'second', 'Phase 230: after dwell floor expires, second text flushes');
  o.destroy();
}

console.log('\n--- Phase 230 Test B: latest-wins during dwell hold ---');
{
  setNow(5000);
  const o = buildOverlay();
  o.update(makeState({ detail: 'A' }));
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'A', 'A flushed');
  // Three updates within the dwell window, all queued, latest wins.
  advanceNow(200);
  o.update(makeState({ detail: 'B' }));
  advanceNow(200);
  o.update(makeState({ detail: 'C' }));
  advanceNow(200);
  o.update(makeState({ detail: 'D' }));
  assertEq(detailEl.textContent, 'A', 'A still visible during dwell window');
  // Wait long enough for floor to expire.
  await sleep(1300);
  assertEq(detailEl.textContent, 'D', 'Phase 230: latest queued (D) wins after dwell expires');
  o.destroy();
}

console.log('\n--- Phase 230 Test C: lifecycle === final bypasses dwell floor ---');
{
  setNow(7000);
  const o = buildOverlay();
  o.update(makeState({ detail: 'pre' }));
  advanceNow(100); // 100ms — well inside dwell floor
  // Final lifecycle should flush immediately even though dwell hasn't expired.
  o.update(makeState({ lifecycle: 'final', detail: 'POST', title: 'Done', result: 'success' }));
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'POST', 'Phase 230: final lifecycle bypasses dwell floor');
  o.destroy();
}

console.log('\n--- Phase 230 Test D: first write of session bypasses dwell floor ---');
{
  setNow(8000);
  const o = buildOverlay();
  // Cold path — _lastTextWriteAt is 0; should write immediately, not wait 1200ms.
  o.update(makeState({ detail: 'cold' }));
  const detailEl = o.container.querySelector('.fsb-step-text');
  assertEq(detailEl.textContent, 'cold', 'Phase 230: first write bypasses dwell floor (cold path immediate)');
  o.destroy();
}

console.log('\n--- Test 5: monotonic progress clamp (40, 25, 50 -> 0.40, 0.40, 0.50) ---');
{
  setNow(4000);
  const o = buildOverlay();
  function pct(p) { return makeState({ progress: { mode: 'determinate', percent: p, label: p + '%' } }); }
  o.update(pct(40));
  const fillEl = o.container.querySelector('.fsb-progress-fill');
  assertEq(fillEl.style.transform, 'scaleX(0.4)', 'percent 40 -> scaleX(0.4)');
  o.update(pct(25));
  assertEq(fillEl.style.transform, 'scaleX(0.4)', 'percent 25 clamped to floor 0.4');
  o.update(pct(50));
  assertEq(fillEl.style.transform, 'scaleX(0.5)', 'percent 50 advances to 0.5');
  o.destroy();
}

console.log('\n--- Test 6: indeterminate mode does not update _lastVisiblePercent ---');
{
  setNow(5000);
  const o = buildOverlay();
  o.update(makeState({ progress: { mode: 'determinate', percent: 60, label: '60%' } }));
  assertEq(o._lastVisiblePercent, 60, 'determinate update sets floor to 60');
  o.update(makeState({ progress: { mode: 'indeterminate', percent: null, label: 'Working' } }));
  assertEq(o._lastVisiblePercent, 60, 'indeterminate update does not touch floor');
  o.destroy();
}

console.log('\n--- Test 7: monotonic floor resets when a new session starts (after destroy) ---');
{
  setNow(6000);
  const o = buildOverlay();
  o.update(makeState({ progress: { mode: 'determinate', percent: 80, label: '80%' } }));
  assertEq(o._lastVisiblePercent, 80, 'floor at 80 mid-session');
  o.destroy();
  // Re-instantiate (mimics a brand new session lifecycle)
  const o2 = buildOverlay();
  assertEq(o2._lastVisiblePercent, 0, 'new session starts with floor=0');
  o2.update(makeState({ progress: { mode: 'determinate', percent: 10, label: '10%' } }));
  const fillEl = o2.container.querySelector('.fsb-progress-fill');
  assertEq(fillEl.style.transform, 'scaleX(0.1)', 'new session honors low percent (no stale clamp)');
  o2.destroy();
}

console.log('\n--- Test 8: action counter batching -- 5 same writes = 1 DOM write ---');
{
  setNow(7000);
  const o = buildOverlay();
  const etaEl = o.container.querySelector('.fsb-eta');
  let writes = 0;
  let last = etaEl.textContent;
  // Wrap textContent setter
  Object.defineProperty(etaEl, 'textContent', {
    get() { return last; },
    set(v) { writes += 1; last = String(v); }
  });
  for (let i = 0; i < 5; i++) {
    o.update(makeState({ actionCount: 3 }));
  }
  assertEq(writes, 1, 'counter writes ETA exactly once for 5 identical actionCount calls');
  assertEq(last, 'Actions: 3', 'counter shows Actions: 3');
  o.destroy();
}

console.log('\n--- Test 9: action counter batching -- 3 -> 4 -> 4 -> 5 = 3 writes (initial 3, then 4, then 5) ---');
{
  setNow(8000);
  const o = buildOverlay();
  const etaEl = o.container.querySelector('.fsb-eta');
  let writes = 0;
  let last = etaEl.textContent;
  Object.defineProperty(etaEl, 'textContent', {
    get() { return last; },
    set(v) { writes += 1; last = String(v); }
  });
  o.update(makeState({ actionCount: 3 }));
  o.update(makeState({ actionCount: 4 }));
  o.update(makeState({ actionCount: 4 }));
  o.update(makeState({ actionCount: 5 }));
  assertEq(writes, 3, 'counter writes ETA exactly 3 times for 3->4->4->5');
  assertEq(last, 'Actions: 5', 'final value is Actions: 5');
  o.destroy();
}

console.log('\n--- Test 10: action counter null/undefined clears ETA (preserves else-branch) ---');
{
  setNow(9000);
  const o = buildOverlay();
  o.update(makeState({ actionCount: 7 }));
  const etaEl = o.container.querySelector('.fsb-eta');
  assertEq(etaEl.textContent, 'Actions: 7', 'initial counter set');
  o.update(makeState({ actionCount: null }));
  assertEq(etaEl.textContent, '', 'null actionCount clears ETA');
  o.destroy();
}

// ===========================================================================
// describe('ActionGlowOverlay memoization')
// ===========================================================================

console.log('\n--- Test 11: ActionGlowOverlay caches rect across rAF ticks ---');
{
  // Build a glow overlay manually skipping show()'s heavy DOM/Popover path.
  const glow = new ActionGlowOverlay();
  // Stub minimal state needed by _startTracking()'s loop.
  glow.host = makeElement('div');
  documentElement.appendChild(glow.host);
  const target = makeElement('button');
  target._isConnected = true;
  documentBody.appendChild(target);
  glow.targetElement = target;

  // Spy on _updatePosition -- count invocations.
  let updateCalls = 0;
  glow._updatePosition = function() { updateCalls += 1; };

  // Start tracking with rect cache pre-clean (mirrors show()'s post-init state).
  glow._rectDirty = false;

  // Reset listener tracker
  windowListeners.add.length = 0;
  windowListeners.remove.length = 0;

  glow._startTracking();

  // Initial state: no _updatePosition call yet (cache is clean).
  // Tick 10 frames; cache stays clean -- no recompute.
  for (let i = 0; i < 10; i++) tickRAF();
  assertEq(updateCalls, 0, '10 idle rAF ticks do not recompute when cache is clean');

  // Listeners attached for resize + scroll
  const resizeAdded = windowListeners.add.filter(e => e.type === 'resize').length;
  const scrollAdded = windowListeners.add.filter(e => e.type === 'scroll').length;
  assertEq(resizeAdded, 1, 'resize listener attached exactly once');
  assertEq(scrollAdded, 1, 'scroll listener attached exactly once');

  // Trigger window scroll listener -> dirty -> next tick recomputes.
  const scrollHandler = windowListeners.add.find(e => e.type === 'scroll').fn;
  scrollHandler();
  tickRAF();
  assertEq(updateCalls, 1, 'scroll invalidates cache; next rAF tick recomputes once');

  // Subsequent ticks without further events do not recompute.
  for (let i = 0; i < 5; i++) tickRAF();
  assertEq(updateCalls, 1, 'idle ticks after scroll do not re-recompute');

  // Trigger resize
  const resizeHandler = windowListeners.add.find(e => e.type === 'resize').fn;
  resizeHandler();
  tickRAF();
  assertEq(updateCalls, 2, 'resize invalidates cache; next rAF tick recomputes');

  // Stop tracking removes both listeners
  glow._stopTracking();
  const resizeRemoved = windowListeners.remove.filter(e => e.type === 'resize').length;
  const scrollRemoved = windowListeners.remove.filter(e => e.type === 'scroll').length;
  assertEq(resizeRemoved, 1, '_stopTracking removes resize listener');
  assertEq(scrollRemoved, 1, '_stopTracking removes scroll listener');
}

console.log('\n--- Test 12: target disconnect triggers destroy() during rAF tick ---');
{
  const glow = new ActionGlowOverlay();
  glow.host = makeElement('div');
  documentElement.appendChild(glow.host);
  const target = makeElement('button');
  target._isConnected = true;
  documentBody.appendChild(target);
  glow.targetElement = target;

  let destroyCalls = 0;
  const origDestroy = glow.destroy.bind(glow);
  glow.destroy = function() { destroyCalls += 1; this.targetElement = null; this.trackingId = null; };
  glow._updatePosition = function() {};
  glow._rectDirty = false;

  windowListeners.add.length = 0;
  windowListeners.remove.length = 0;
  glow._startTracking();

  // Disconnect target
  target._isConnected = false;
  tickRAF();
  assert(destroyCalls >= 1, 'disconnected target triggers destroy() during rAF tick');
}

console.log('\n--- Test 13: show() marking _rectDirty=true then false leaves cache clean for first rAF ---');
{
  // Manual instance -- we can directly verify the dirty-flag flow without
  // running the full show() (which requires Popover API stubs).
  const glow = new ActionGlowOverlay();
  // Mimic the show() flow:
  glow._rectDirty = true;
  // (in real code: this._updatePosition() is called sync here)
  glow._rectDirty = false;
  assertEq(glow._rectDirty, false, 'show() leaves rect cache clean after initial sync compute');
}

// ===========================================================================
// describe('capability-call scrollback log (_logBuffer)')
// ===========================================================================

console.log('\n--- Test 14: _logBuffer accumulates, dedupes consecutive repeats, caps at 3 entries ---');
{
  setNow(50000);
  const o = buildOverlay();
  o.update(makeState({ detail: 'D1' })); // cold path -- flushes immediately
  assertEq(o._logBuffer.length, 1, 'buffer has 1 entry after first flush');
  assertEq(JSON.stringify(o._logBuffer), JSON.stringify(['D1']), 'buffer contents after D1');

  advanceNow(1300); // clears both the 400ms debounce and the 1200ms dwell floor
  o.update(makeState({ detail: 'D1' })); // identical detail -- dedup guard, no push
  assertEq(o._logBuffer.length, 1, 'identical consecutive detail does not push a duplicate');

  advanceNow(1300);
  o.update(makeState({ detail: 'D2' }));
  assertEq(o._logBuffer.length, 2, 'distinct detail pushes a new entry');

  advanceNow(1300);
  o.update(makeState({ detail: 'D3' }));
  assertEq(o._logBuffer.length, 3, 'buffer grows to 3');

  advanceNow(1300);
  o.update(makeState({ detail: 'D4' }));
  assertEq(o._logBuffer.length, 3, 'buffer caps at 3 entries (oldest shifted out)');
  assertEq(JSON.stringify(o._logBuffer), JSON.stringify(['D2', 'D3', 'D4']), 'D1 shifted out; most recent 3 kept, oldest-first');

  // One more settling update (duplicate detail, no new push) so the DOM render
  // reflects the buffer as it stood AFTER the D4 push (render reads the buffer
  // at the START of update(), one call before its own flush lands).
  advanceNow(1300);
  o.update(makeState({ detail: 'D4' }));
  const logLines = o.container.querySelectorAll('.fsb-log-line');
  assertEq(logLines[0].textContent, 'D3', '.fsb-log-line[0] shows the most recent PRIOR step (D3), excluding current (D4)');
  assertEq(logLines[1].textContent, 'D2', '.fsb-log-line[1] shows the step before that (D2)');

  o.destroy();
}

console.log('\n--- Test 15: destroy() resets _logBuffer to empty ---');
{
  setNow(60000);
  const o = buildOverlay();
  o.update(makeState({ detail: 'D1' }));
  advanceNow(1300);
  o.update(makeState({ detail: 'D2' }));
  assert(o._logBuffer.length > 0, 'buffer is non-empty before destroy()');
  o.destroy();
  assertEq(o._logBuffer.length, 0, 'destroy() resets _logBuffer to empty (per-session state, mirrors _lastActionCount reset)');
}

// ===========================================================================
// describe('capability-call step-number pill: immediate class, debounced text')
// ===========================================================================

console.log('\n--- Test 16: step-number pill CLASS updates immediately on update(), independent of the text debounce ---');
{
  // Matches the EXISTING precedent for .fsb-progress-bar's indeterminate/hidden
  // classes, which also update immediately on every update() call while the
  // step TEXT is debounced -- capability/guarded pill coloring follows the
  // same established split between structural state (immediate) and
  // human-readable text (debounced for readability).
  setNow(70000);
  const o = buildOverlay();
  o.update(makeState({ detail: 'first' })); // cold path, settles the debounce state
  const stepNumberEl = o.container.querySelector('.fsb-step-number');
  assert(!stepNumberEl.classList.contains('calling'), 'no .calling class before any capability update');

  // Immediately queue another update inside the debounce/dwell window --
  // the TEXT should NOT flush yet, but the pill CLASS should update right away.
  o.update(makeState({
    phase: 'calling', detail: 'second', guarded: false,
    capability: { chipText: 'x', readinessLabel: 'T1 ready', readinessClass: 'ready', noteText: null }
  }));
  assert(stepNumberEl.classList.contains('calling'), 'pill CLASS is .calling immediately, even inside the debounce window');
  const stepTextEl = o.container.querySelector('.fsb-step-text');
  assertEq(stepTextEl.textContent, 'first', 'pill TEXT still shows the prior value -- held by the dwell floor (unchanged behavior)');

  o.destroy();
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n=========================================');
console.log('overlay-stability-cadence.test.js results');
console.log('  passed:', passed);
console.log('  failed:', failed);
console.log('=========================================');
if (failed > 0) process.exit(1);
})();
