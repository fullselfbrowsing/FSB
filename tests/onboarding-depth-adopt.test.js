'use strict';

// The onboarding depth engine places elements that a render adds to a plane before the next
// paint. Without that, a row added to a plane far behind the camera (the Done summary growing
// when a path is chosen) shows for a few frames at full opacity until the delayed relayout.
// Runs the real engine against a small fake DOM.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DEPTH_PATH = path.join(__dirname, '..', 'extension', 'ui', 'onboarding-depth.js');
const SOURCE = fs.readFileSync(DEPTH_PATH, 'utf8');

// ---- a fake DOM with just what the engine reads ----

function parseSelector(selector) {
  const match = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(selector.trim());
  assert(match, 'fake DOM understands selector ' + selector);
  const classes = (match[2].match(/\.[\w-]+/g) || []).map((name) => name.slice(1));
  const attrs = (match[3].match(/\[[^\]]+\]/g) || []).map((part) => {
    const attr = /^\[([\w-]+)(?:(~?=)"([^"]*)")?\]$/.exec(part);
    assert(attr, 'fake DOM understands attribute selector ' + part);
    return { name: attr[1], op: attr[2] || null, value: attr[3] };
  });
  return { tag: match[1].toUpperCase(), classes, attrs };
}

function makeStyle() {
  return { setProperty(name, value) { this[name] = value; } };
}

class FakeElement {
  constructor(doc, tag, attrs) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.attrs = Object.assign({}, attrs || {});
    this.children = [];
    this.parentElement = null;
    this.style = makeStyle();
    this.clientWidth = 800;
    this.clientHeight = 600;
    this.offsetHeight = 300;
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  get firstElementChild() { return this.children[0] || null; }
  get isConnected() {
    let node = this;
    while (node.parentElement) node = node.parentElement;
    return node === this.ownerDocument.body;
  }
  matches(selector) {
    const parsed = parseSelector(selector);
    if (parsed.tag && parsed.tag !== this.tagName) return false;
    const classes = (this.getAttribute('class') || '').split(/\s+/);
    if (!parsed.classes.every((name) => classes.includes(name))) return false;
    return parsed.attrs.every((attr) => {
      if (!this.hasAttribute(attr.name)) return false;
      if (attr.op === '=') return this.getAttribute(attr.name) === attr.value;
      if (attr.op === '~=') return this.getAttribute(attr.name).split(/\s+/).includes(attr.value);
      return true;
    });
  }
  querySelectorAll(selector) {
    const found = [];
    const walk = (el) => el.children.forEach((child) => { if (child.matches(selector)) found.push(child); walk(child); });
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    for (let el = this; el; el = el.parentElement) if (el.matches(selector)) return el;
    return null;
  }
  contains(other) {
    for (let el = other; el; el = el.parentElement) if (el === this) return true;
    return false;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 40 }; }
  addEventListener() {}
  removeEventListener() {}
  focus() {}
}

function createRoom() {
  const timers = [];
  const observers = [];
  function FakeMutationObserver(callback) {
    this.callback = callback;
    this.disconnected = false;
    observers.push(this);
  }
  FakeMutationObserver.prototype.observe = function () {};
  FakeMutationObserver.prototype.disconnect = function () { this.disconnected = true; };

  const win = {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({
      transitionProperty: 'none',
      transitionDuration: '0s',
      transitionTimingFunction: 'ease',
      transitionDelay: '0s',
      paddingTop: '0px',
      paddingBottom: '0px'
    }),
    setTimeout(fn, delay) { const timer = { fn, delay, cleared: false }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    MutationObserver: FakeMutationObserver,
    addEventListener() {},
    removeEventListener() {}
  };
  const doc = {
    defaultView: win,
    readyState: 'complete',
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  doc.body = new FakeElement(doc, 'body');
  const el = (tag, attrs) => new FakeElement(doc, tag, attrs);

  const root = doc.body.appendChild(el('div', { class: 'ob3' }));
  const stage = root.appendChild(el('div', { 'data-depth-stage': '' }));
  const steps = ['path', 'provider', 'apikey', 'pin', 'done'];
  const cols = {};
  steps.forEach((step) => {
    const layer = stage.appendChild(el('section', { class: 'ob3-layer', 'data-step': step }));
    const fit = layer.appendChild(el('div', { class: 'ob3-fit' }));
    cols[step] = fit.appendChild(el('div', { class: 'ob3-col' }));
    cols[step].appendChild(el('h2', { 'data-di': '0.1' }));
  });
  const groups = cols.done.appendChild(el('div', { class: 'ob3-end-groups' }));
  const firstRow = groups.appendChild(el('div', { class: 'ob3-end-group', 'data-di': '0.3' }));

  const context = { window: win };
  vm.runInNewContext(SOURCE, context, { filename: DEPTH_PATH });
  const engine = context.FSBOnboardingDepth.create(root, { canStep: () => true, step() {}, nudge() {} });
  assert(engine, 'the depth engine starts on the fake room');

  // A render's mutations arrive as one observer callback, before the browser paints.
  const deliverMutations = () => observers.forEach((observer) => { if (!observer.disconnected) observer.callback([]); });
  return { engine, el, cols, groups, firstRow, timers, observers, deliverMutations };
}

// ---- tests ----

{
  const room = createRoom();
  room.engine.set({ path: 0, provider: 1, apikey: 2, pin: 3, done: 4 }, 1, true);
  assert.strictEqual(room.firstRow.style.visibility, 'hidden', 'a summary row four planes back starts hidden');
  assert.strictEqual(room.firstRow.style.opacity, '0.000', 'a summary row four planes back has no opacity');

  // Choosing a path adds summary rows to the far Done plane.
  const newRow = room.groups.appendChild(room.el('div', { class: 'ob3-end-group', 'data-di': '0.37' }));
  const newHeading = room.cols.path.appendChild(room.el('p', { 'data-di': '0.2' }));
  room.deliverMutations();
  assert.strictEqual(newRow.style.visibility, 'hidden', 'a row added to a far plane is hidden before the next paint');
  assert.strictEqual(newRow.style.opacity, '0.000', 'a row added to a far plane gets the plane opacity at once');
  assert(!newHeading.style.opacity && newHeading.style.visibility !== 'hidden',
    'an element added to the plane in focus rests in place, fully shown');

  const relayout = room.timers.filter((timer) => timer.delay === 50 && !timer.cleared);
  assert.strictEqual(relayout.length, 1, 'the delayed relayout still runs to re-measure the room');
  relayout[0].fn();
  assert.strictEqual(newRow.style.visibility, 'hidden', 'the relayout keeps the far row hidden');

  room.engine.destroy();
  assert(room.observers.every((observer) => observer.disconnected), 'destroy() disconnects the mutation observer');
  console.log('  PASS: rows added to a far plane are placed before the next paint');
}

{
  // A callback that was already queued when the page went away must not touch the DOM.
  const room = createRoom();
  room.engine.set({ path: 0, provider: 1, apikey: 2, pin: 3, done: 4 }, 1, true);
  const [observer] = room.observers;
  room.engine.destroy();
  const lateRow = room.groups.appendChild(room.el('div', { class: 'ob3-end-group', 'data-di': '0.44' }));
  observer.callback([]);
  assert.strictEqual(lateRow.style.opacity, undefined, 'a destroyed engine leaves new nodes alone');
  console.log('  PASS: a destroyed engine ignores late mutations');
}

console.log('PASS onboarding-depth-adopt.test.js');
