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

function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(...names) { names.forEach((name) => set.add(name)); },
    remove(...names) { names.forEach((name) => set.delete(name)); },
    contains(name) { return set.has(name); },
    toggle(name, force) {
      if (force === true) { set.add(name); return true; }
      if (force === false) { set.delete(name); return false; }
      if (set.has(name)) { set.delete(name); return false; }
      set.add(name);
      return true;
    }
  };
}

function makeElement(tag, opts) {
  opts = opts || {};
  const attrs = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    children: [],
    parentNode: null,
    parentElement: null,
    classList: makeClassList(),
    style: { cssText: '', setProperty(name, value) { this[name] = value; } },
    attributes: attrs,
    dataset: {},
    id: opts.id || '',
    _textContent: opts.text || '',
    _innerText: opts.text || '',
    _isConnected: opts.connected !== false,
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    get innerText() { return this._innerText; },
    set innerText(v) { this._innerText = String(v); },
    appendChild(child) {
      child.parentNode = this;
      child.parentElement = this;
      child._isConnected = true;
      this.children.push(child);
      return child;
    },
    remove() {
      this._isConnected = false;
      if (this.parentNode && this.parentNode.children) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
      this.parentNode = null;
      this.parentElement = null;
    },
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    removeAttribute(name) { delete attrs[name]; },
    attachShadow() {
      const shadow = makeElement('shadow-root');
      shadow.host = this;
      this._shadow = shadow;
      return shadow;
    },
    querySelector(selector) {
      if (selector.startsWith('.')) {
        return findDescendant(this, (node) => node.classList && node.classList.contains(selector.slice(1)));
      }
      return null;
    },
    querySelectorAll(selector) {
      const out = [];
      if (selector.startsWith('.')) {
        walkAll(this, (node) => {
          if (node.classList && node.classList.contains(selector.slice(1))) out.push(node);
        });
      }
      return out;
    },
    showPopover() {},
    hidePopover() {},
    get isConnected() { return this._isConnected; },
    set isConnected(v) { this._isConnected = !!v; },
    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    },
    getBoundingClientRect() {
      return { top: 20, left: 30, width: 120, height: 44, right: 150, bottom: 64 };
    },
    getClientRects() {
      return [this.getBoundingClientRect()];
    }
  };
  if (opts.role) el.setAttribute('role', opts.role);
  return el;
}

function findDescendant(root, pred) {
  if (pred(root)) return root;
  for (const child of root.children || []) {
    const found = findDescendant(child, pred);
    if (found) return found;
  }
  if (root._shadow) return findDescendant(root._shadow, pred);
  return null;
}

function walkAll(root, fn) {
  fn(root);
  for (const child of root.children || []) walkAll(child, fn);
  if (root._shadow) walkAll(root._shadow, fn);
}

let rafSeq = 0;
const rafCallbacks = new Map();
function requestAnimationFrameStub(fn) {
  rafSeq += 1;
  rafCallbacks.set(rafSeq, fn);
  return rafSeq;
}
function cancelAnimationFrameStub(id) {
  rafCallbacks.delete(id);
}

const documentElement = makeElement('html');
const documentBody = makeElement('body');
documentElement.appendChild(documentBody);
const windowListeners = {};

const sandbox = {
  window: {
    FSB: {
      _modules: {},
      logger: { log() {}, info() {}, warn() {}, error() {}, debug() {} }
    },
    FSBOverlayStateUtils: {
      humanizeOverlayPhase(phase) { return phase ? String(phase) : 'Working'; },
      sanitizeOverlayText(value) { return value == null ? '' : String(value); },
      sanitizeActionText(value) { return value == null ? '' : String(value); },
      firstSentence(value) { return value == null ? '' : String(value); }
    },
    FSBBadgeCombine: { combineBadgeText(a, b) { return a && b ? a + ' / ' + b : (a || b || ''); } },
    __FSB_SKIP_INIT__: false,
    innerWidth: 1280,
    innerHeight: 800,
    CSS: { supports() { return false; } },
    getComputedStyle() { return { display: 'block', borderTopLeftRadius: '8px', position: 'static' }; },
    addEventListener(type, fn, opts) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push({ fn, opts });
    },
    removeEventListener() {}
  },
  document: {
    documentElement,
    body: documentBody,
    createElement(tag) { return makeElement(tag); },
    addEventListener() {},
    removeEventListener() {}
  },
  module: { exports: {} },
  requestAnimationFrame: requestAnimationFrameStub,
  cancelAnimationFrame: cancelAnimationFrameStub,
  setTimeout(fn) { return requestAnimationFrameStub(fn); },
  clearTimeout: cancelAnimationFrameStub,
  performance: { now() { return 1000; } },
  console,
  Set,
  Map,
  WeakMap,
  WeakSet,
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
  Symbol,
  Reflect,
  parseFloat,
  Number: Number
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.HTMLElement = function HTMLElement() {};

const vfPath = path.join(__dirname, '..', 'extension', 'content', 'visual-feedback.js');
const vfSource = fs.readFileSync(vfPath, 'utf8');
vm.runInContext(vfSource, vm.createContext(sandbox), { filename: 'visual-feedback.js' });

const { ActionGlowOverlay } = sandbox.module.exports;

console.log('--- Phase 16 Plan 02: trigger pulse overlay ---');

check('showPulse adds trigger-pulse to the single ActionGlowOverlay box', () => {
  const glow = new ActionGlowOverlay();
  const target = makeElement('button');
  documentBody.appendChild(target);
  glow.showPulse(target);
  assert(glow.boxOverlay, 'boxOverlay exists');
  assert.equal(glow._pulseMode, true);
  assert.equal(glow.boxOverlay.classList.contains('trigger-pulse'), true);
});

check('clearPulse removes trigger-pulse and destroys the overlay', () => {
  const glow = new ActionGlowOverlay();
  const target = makeElement('button');
  documentBody.appendChild(target);
  glow.showPulse(target);
  const box = glow.boxOverlay;
  glow.clearPulse();
  assert.equal(box.classList.contains('trigger-pulse'), false);
  assert.equal(glow._pulseMode, false);
  assert.equal(glow.boxOverlay, null);
  assert.equal(glow.host, null);
});

check('_updatePosition reapplies trigger-pulse while pulse mode is active', () => {
  const glow = new ActionGlowOverlay();
  const target = makeElement('button');
  documentBody.appendChild(target);
  glow.showPulse(target);
  glow.boxOverlay.classList.remove('trigger-pulse');
  glow._rectDirty = true;
  glow._updatePosition();
  assert.equal(glow.boxOverlay.classList.contains('trigger-pulse'), true);
});

check('source keyframe animates opacity/transform only', () => {
  const blockMatch = vfSource.match(/@keyframes fsb-trigger-pulse \{([\s\S]*?)\n      \}/);
  assert(blockMatch, 'fsb-trigger-pulse keyframes present');
  const block = blockMatch[1];
  assert(block.includes('opacity'), 'opacity animation present');
  assert(block.includes('transform'), 'transform animation present');
  assert(!/box-shadow|top:|left:|width:/.test(block), 'no paint/layout properties in keyframes');
  assert(vfSource.includes('.box-overlay.trigger-pulse'), 'trigger-pulse rule present');
  assert(/\.box-overlay\.trigger-pulse[\s\S]*animation: fsb-trigger-pulse 2\.4s/.test(vfSource), '2.4s pulse animation present');
});

check('source reduced-motion block disables trigger-pulse animation', () => {
  assert(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.box-overlay\.trigger-pulse[\s\S]*animation: none/.test(vfSource));
});

console.log('\n--- trigger pulse summary ---');
console.log('  passed:', passed);
console.log('  failed:', failed);
process.exit(failed > 0 ? 1 : 0);
