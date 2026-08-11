'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const visualFeedbackPath = path.resolve(__dirname, '..', 'extension', 'content', 'visual-feedback.js');
const visualFeedbackSource = fs.readFileSync(visualFeedbackPath, 'utf8');

function makeClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
    toggle(name, force) {
      if (force === true) { values.add(name); return true; }
      if (force === false) { values.delete(name); return false; }
      if (values.has(name)) { values.delete(name); return false; }
      values.add(name);
      return true;
    }
  };
}

function findDescendant(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const found = findDescendant(child, predicate);
    if (found) return found;
  }
  if (root.shadowRoot) {
    const found = findDescendant(root.shadowRoot, predicate);
    if (found) return found;
  }
  return null;
}

function makeElement(tagName) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    parentNode: null,
    shadowRoot: null,
    classList: makeClassList(),
    style: {},
    attributes: {},
    _listeners: new Map(),
    _className: '',
    _innerHTML: '',
    _textContent: '',
    disabled: false,
    value: '',
    max: '',
    step: '',
    id: '',
    get className() { return this._className; },
    set className(value) {
      this._className = String(value);
      this._className.split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
    },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) {
      this._innerHTML = String(value);
      const replayClasses = [
        ['div', 'fsb-replay-controls'],
        ['button', 'fsb-replay-toggle'],
        ['span', 'fsb-replay-time'],
        ['div', 'fsb-replay-timeline'],
        ['div', 'fsb-replay-progress-track'],
        ['div', 'fsb-replay-progress-fill'],
        ['input', 'fsb-replay-scrubber'],
        ['select', 'fsb-replay-speed'],
        ['div', 'fsb-replay-minimal-track'],
        ['div', 'fsb-replay-minimal-fill']
      ];
      this.children = replayClasses.map(([tag, className]) => {
        const child = makeElement(tag);
        child.className = className;
        child.parentNode = this;
        return child;
      });
    },
    get textContent() { return this._textContent; },
    set textContent(value) { this._textContent = String(value); },
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((candidate) => candidate !== child);
      child.parentNode = null;
      return child;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    attachShadow() {
      this.shadowRoot = makeElement('shadow-root');
      this.shadowRoot.host = this;
      return this.shadowRoot;
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(type, listener) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      if (this._listeners.has(type)) this._listeners.get(type).delete(listener);
    },
    dispatchEvent(event) {
      const normalized = Object.assign({
        type: '',
        relatedTarget: null,
        stopPropagation() {},
        preventDefault() {}
      }, event || {});
      normalized.target = normalized.target || this;
      normalized.currentTarget = this;
      for (const listener of this._listeners.get(normalized.type) || []) listener(normalized);
    },
    querySelector(selector) {
      if (!selector.startsWith('.')) return null;
      const className = selector.slice(1);
      return findDescendant(this, (candidate) => candidate.classList && candidate.classList.contains(className));
    },
    contains(candidate) {
      let current = candidate;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
    showPopover() {},
    hidePopover() {},
    get isConnected() {
      let current = this;
      while (current) {
        if (current === documentElement) return true;
        current = current.parentNode;
      }
      return false;
    }
  };
  return element;
}

const documentElement = makeElement('html');
const documentListeners = new Map();
const documentStub = {
  documentElement,
  createElement: makeElement,
  addEventListener(type, listener) {
    if (!documentListeners.has(type)) documentListeners.set(type, new Set());
    documentListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) {
    if (documentListeners.has(type)) documentListeners.get(type).delete(listener);
  }
};

function dispatchDocument(type) {
  for (const listener of documentListeners.get(type) || []) listener({ type });
}

let nextTimerId = 0;
const timers = new Map();
function fakeSetTimeout(callback, delay) {
  const id = ++nextTimerId;
  timers.set(id, { callback, delay });
  return id;
}
function fakeClearTimeout(id) {
  timers.delete(id);
}
function fireTimer(delay) {
  const match = Array.from(timers.entries()).find(([, timer]) => timer.delay === delay);
  assert.ok(match, 'expected pending timer with delay ' + delay);
  timers.delete(match[0]);
  match[1].callback();
}
function hasTimer(delay) {
  return Array.from(timers.values()).some((timer) => timer.delay === delay);
}

let reducedMotion = false;
const windowListeners = new Map();
const sentMessages = [];
const windowStub = {
  FSB: { _modules: {}, logger: { log() {}, info() {}, warn() {}, error() {}, debug() {} } },
  __FSB_SKIP_INIT__: false,
  addEventListener(type, listener) {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(listener);
  },
  removeEventListener(type, listener) {
    if (windowListeners.has(type)) windowListeners.get(type).delete(listener);
  },
  matchMedia() { return { matches: reducedMotion }; },
  CSS: { supports() { return false; } }
};

const sandbox = {
  window: windowStub,
  document: documentStub,
  chrome: {
    runtime: {
      getURL(value) { return 'chrome-extension://test/' + value; },
      sendMessage(message) { sentMessages.push(message); return Promise.resolve({ success: true }); }
    }
  },
  performance: { now() { return 0; } },
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  setInterval() { return 1; },
  clearInterval() {},
  module: { exports: {} },
  console,
  Promise,
  Date,
  Math,
  JSON,
  String,
  Number,
  Boolean,
  Array,
  Object,
  Error,
  RegExp,
  Set,
  Map,
  WeakMap,
  WeakSet,
  Symbol,
  Reflect
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.HTMLElement = function HTMLElement() {};

vm.runInContext(visualFeedbackSource, vm.createContext(sandbox), { filename: visualFeedbackPath });
const {
  ReplayPlayerOverlay,
  REPLAY_PLAYER_HIDE_DELAY_MS,
  REPLAY_PLAYER_FADE_MS
} = sandbox.module.exports;

function replayState(overrides) {
  return Object.assign({
    sessionId: 'session-replay-player',
    status: 'playing',
    speed: 1,
    positionMs: 2500,
    durationMs: 10000,
    currentStep: 1,
    totalSteps: 3,
    forwardSeekOnly: true
  }, overrides || {});
}

function resetHarness() {
  timers.clear();
  sentMessages.length = 0;
  reducedMotion = false;
}

function assertMessage(actual, expected) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
}

console.log('--- Replay player overlay ---');

{
  resetHarness();
  const player = new ReplayPlayerOverlay();
  player.update(replayState(), 'running');
  const progressSegment = visualFeedbackSource.slice(
    visualFeedbackSource.indexOf('class ProgressOverlay'),
    visualFeedbackSource.indexOf('class ReplayPlayerOverlay')
  );

  assert.equal(player.host.id, 'fsb-replay-player-host');
  assert.equal(player.host.getAttribute('data-fsb-overlay-role'), 'replay-player-host');
  assert.equal(player.host.hasAttribute('aria-hidden'), false, 'interactive player remains in the accessibility tree');
  assert.equal(player.container.classList.contains('fsb-replay-shell'), true);
  assert.equal(player.container.querySelector('.fsb-overlay'), null, 'player does not contain the normal progress overlay');
  assert.equal(progressSegment.includes('fsb-replay-'), false, 'ProgressOverlay contains no replay-specific DOM or state');
  assert.match(player.host.style.cssText, /left:\s*50%/);
  assert.match(player.host.style.cssText, /bottom:\s*max\(16px/);
  assert.match(visualFeedbackSource, /\.fsb-replay-minimal-track\s*\{[\s\S]*?height:\s*3px/);
  player.destroy();
}

{
  resetHarness();
  const player = new ReplayPlayerOverlay();
  player.update(replayState(), 'running');

  assert.equal(REPLAY_PLAYER_HIDE_DELAY_MS, 3000);
  assert.equal(hasTimer(3000), true, 'playing replay arms inactivity timer');
  fireTimer(3000);
  assert.equal(player.container.classList.contains('controls-hidden'), true, 'controls collapse after inactivity');
  assert.ok(player.container.querySelector('.fsb-replay-minimal-track'), 'minimal rail remains in the DOM');

  player.update(replayState({ positionMs: 5000 }), 'running');
  assert.equal(player.container.classList.contains('controls-hidden'), true, 'clock updates do not reveal hidden controls');
  assert.equal(player.container.querySelector('.fsb-replay-minimal-fill').style.transform, 'scaleX(0.5)');

  dispatchDocument('pointermove');
  assert.equal(player.container.classList.contains('controls-hidden'), false, 'pointer movement anywhere reveals controls');
  assert.equal(hasTimer(3000), true, 'pointer movement restarts the inactivity timer');
  fireTimer(3000);
  assert.equal(player.container.classList.contains('controls-hidden'), true, 'restarted timer collapses controls again');
  player.destroy();
}

{
  resetHarness();
  const player = new ReplayPlayerOverlay();
  player.update(replayState(), 'running');
  const shell = player.container;

  shell.dispatchEvent({ type: 'pointerenter' });
  assert.equal(hasTimer(3000), false, 'hover pins controls open');
  shell.dispatchEvent({ type: 'pointerleave' });
  assert.equal(hasTimer(3000), true, 'leaving controls resumes inactivity timer');

  player.update(replayState({ status: 'paused' }), 'running');
  assert.equal(shell.classList.contains('controls-hidden'), false, 'paused replay keeps controls visible');
  assert.equal(hasTimer(3000), false, 'paused replay has no inactivity timer');

  player.update(replayState({ status: 'decision' }), 'running');
  assert.equal(shell.querySelector('.fsb-replay-toggle').disabled, true, 'decision state disables playback control');
  assert.equal(shell.classList.contains('controls-hidden'), false, 'decision state stays visible');

  player.update(replayState({ status: 'playing' }), 'running');
  shell.dispatchEvent({ type: 'focusin' });
  assert.equal(hasTimer(3000), false, 'keyboard focus pins controls open');
  shell.dispatchEvent({ type: 'focusout', relatedTarget: null });
  assert.equal(hasTimer(3000), true, 'leaving keyboard focus resumes inactivity timer');
  player.destroy();
}

{
  resetHarness();
  const player = new ReplayPlayerOverlay();
  player.update(replayState(), 'running');
  const scrubber = player.container.querySelector('.fsb-replay-scrubber');

  scrubber.dispatchEvent({ type: 'pointerdown' });
  assert.equal(hasTimer(3000), false, 'scrubbing pins controls open');
  scrubber.value = '7000';
  scrubber.dispatchEvent({ type: 'input' });
  assert.equal(player.container.querySelector('.fsb-replay-time').textContent, '0:07 / 0:10');
  scrubber.dispatchEvent({ type: 'change' });
  assertMessage(sentMessages.pop(), {
    action: 'controlReplay',
    sessionId: 'session-replay-player',
    command: 'seek',
    positionMs: 7000
  });

  const messageCount = sentMessages.length;
  scrubber.value = '1000';
  scrubber.dispatchEvent({ type: 'change' });
  assert.equal(sentMessages.length, messageCount, 'backward seek does not send a command');
  assert.equal(scrubber.value, '2500', 'backward seek snaps to the current position');

  player.update(replayState({ status: 'paused' }), 'running');
  player.container.querySelector('.fsb-replay-toggle').dispatchEvent({ type: 'click' });
  assertMessage(sentMessages.pop(), {
    action: 'controlReplay',
    sessionId: 'session-replay-player',
    command: 'play'
  });

  player.update(replayState({ status: 'playing' }), 'running');
  player.container.querySelector('.fsb-replay-toggle').dispatchEvent({ type: 'click' });
  assert.equal(sentMessages.at(-1).command, 'pause');
  const speed = player.container.querySelector('.fsb-replay-speed');
  speed.value = '4';
  speed.dispatchEvent({ type: 'change' });
  assertMessage(sentMessages.at(-1), {
    action: 'controlReplay',
    sessionId: 'session-replay-player',
    command: 'setSpeed',
    speed: 4
  });
  player.destroy();
}

{
  resetHarness();
  const player = new ReplayPlayerOverlay();
  player.update(replayState(), 'running');
  player.update(replayState({ status: 'completed', positionMs: 10000 }), 'final');

  assert.equal(player.container.querySelector('.fsb-replay-toggle').disabled, true);
  assert.equal(player.container.classList.contains('controls-hidden'), false, 'terminal controls remain visible initially');
  fireTimer(3000);
  assert.equal(player.container.classList.contains('terminal-hidden'), true, 'terminal player begins fading after three seconds');
  fireTimer(REPLAY_PLAYER_FADE_MS);
  assert.equal(player.host, null, 'terminal player is destroyed after its fade');
  assert.equal((documentListeners.get('pointermove') || new Set()).size, 0, 'terminal cleanup removes pointer listener');
  assert.equal((documentListeners.get('pointerdown') || new Set()).size, 0, 'terminal cleanup removes pointer-down listener');
}

{
  resetHarness();
  reducedMotion = true;
  const player = new ReplayPlayerOverlay();
  player.update(replayState({ status: 'failed' }), 'final');
  fireTimer(3000);
  fireTimer(0);
  assert.equal(player.host, null, 'reduced motion skips the terminal fade delay');
  assert.match(visualFeedbackSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.fsb-replay-controls[\s\S]*?transition:\s*none/);
}

console.log('PASS replay player overlay behavior and lifecycle');
