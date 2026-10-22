/**
 * Phase 52 Plan 02 shell contract.
 *
 * The normal path loads the production classic-script/CommonJS export and
 * proves one owner, six primitives, four attention policies, collision-safe
 * placement, pointer pass-through, inert text sinks, and eleven-category
 * teardown. --self-test exercises only this file's DOM oracle and ledger.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  CATEGORIES,
  SkopeoResourceLedger,
  runSelfTest: runLedgerSelfTest,
  zeroSnapshot
} = require('./helpers/skopeo-resource-ledger.js');

const HOSTILE_TEXT = '<img src=x onerror="globalThis.__skopeoPwned=true">';
const ROOT_SELECTOR = '[data-skopeo-shell-root="true"]';
const PHASE53_COPY = Object.freeze({
  'configured-corpus': Object.freeze({
    visible: 'Skopeo · Corpus context',
    announcement: 'Skopeo verified the corpus context.'
  }),
  'vendor-folder': Object.freeze({
    visible: 'Skopeo · Vendor folder',
    announcement: 'Skopeo verified the vendor folder context.'
  }),
  'agreement-reading': Object.freeze({
    visible: 'Skopeo · Agreement view',
    announcement: 'Skopeo verified the agreement reading context.'
  }),
  'focused-ask': Object.freeze({
    visible: 'Skopeo · Focused ask',
    announcement: 'Skopeo verified the focused ask context.'
  }),
  uncertain: Object.freeze({
    visible: 'Skopeo can’t verify this context.',
    announcement: 'Skopeo can’t verify this context. The page was left unchanged.'
  }),
  unsupported: Object.freeze({
    visible: 'Skopeo doesn’t support this context.',
    announcement: 'Skopeo doesn’t support this context. The page was left unchanged.'
  }),
  withdrawn: Object.freeze({
    visible: 'Skopeo can’t verify this target.',
    announcement: 'Skopeo removed the annotation because it could not verify the target.'
  }),
  'no-target': Object.freeze({
    visible: 'No verified target requested',
    announcement: 'Skopeo is staying ambient because no verified target was requested.'
  })
});
const PHASE53_HOSTILE_ID = 'file-A<svg/onload=globalThis.__phase53Pwned=true>';
const PHASE53_FORBIDDEN_SELECTORS = Object.freeze([
  '[data-skopeo-primitive="chip"]',
  '[data-skopeo-primitive="halo"]',
  '[data-skopeo-primitive="ghost"]',
  '[data-skopeo-primitive="gate"]',
  '.skopeo-focused-card'
]);

class MockEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, listener, options) {
    if (typeof listener !== 'function') return;
    const list = this._listeners.get(type) || [];
    list.push({ listener, options });
    this._listeners.set(type, list);
  }

  removeEventListener(type, listener, options) {
    const list = this._listeners.get(type) || [];
    const capture = normalizeCapture(options);
    const index = list.findIndex(entry => entry.listener === listener && normalizeCapture(entry.options) === capture);
    if (index >= 0) list.splice(index, 1);
    this._listeners.set(type, list);
  }

  dispatchEvent(event) {
    if (!event || !event.type) throw new TypeError('event.type is required');
    if (!event.target) event.target = this;
    event.currentTarget = this;
    if (!event.composedPath) event.composedPath = () => [event.target, this];
    for (const entry of (this._listeners.get(event.type) || []).slice()) {
      entry.listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  listenerCount(type) {
    if (type) return (this._listeners.get(type) || []).length;
    let total = 0;
    for (const list of this._listeners.values()) total += list.length;
    return total;
  }
}

function normalizeCapture(options) {
  return options === true || !!(options && options.capture);
}

class MockClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  _syncFromClassName(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
  }

  _syncAttribute() {
    const value = Array.from(this.values).join(' ');
    this.element._className = value;
    if (value) this.element._attributes.set('class', value);
    else this.element._attributes.delete('class');
  }

  add(...names) {
    for (const name of names) this.values.add(String(name));
    this._syncAttribute();
  }

  remove(...names) {
    for (const name of names) this.values.delete(String(name));
    this._syncAttribute();
  }

  contains(name) {
    return this.values.has(String(name));
  }

  toggle(name, force) {
    const key = String(name);
    const next = force === undefined ? !this.values.has(key) : !!force;
    if (next) this.values.add(key);
    else this.values.delete(key);
    this._syncAttribute();
    return next;
  }

  [Symbol.iterator]() {
    return this.values[Symbol.iterator]();
  }
}

function createStyle() {
  const style = {
    cssText: '',
    setProperty(name, value) { this[toCamel(name)] = String(value); },
    removeProperty(name) {
      const key = toCamel(name);
      const previous = this[key] || '';
      delete this[key];
      return previous;
    },
    getPropertyValue(name) { return this[toCamel(name)] || ''; }
  };
  return style;
}

function toCamel(value) {
  return String(value).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

class MockElement extends MockEventTarget {
  constructor(tagName, ownerDocument, options = {}) {
    super();
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.localName = String(tagName).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.style = createStyle();
    this._attributes = new Map();
    this._className = '';
    this.classList = new MockClassList(this);
    this._text = '';
    this._rect = options.rect || { left: 0, top: 0, width: 0, height: 0 };
    this.disabled = false;
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.name = '';
    this.type = '';
    this.tabIndex = -1;
    this.shadowRoot = null;
    this._popoverOpen = false;
    this._focusCalls = [];
    this._animations = [];
    this.dataset = new Proxy({}, {
      set: (target, key, value) => {
        target[key] = String(value);
        this.setAttribute('data-' + String(key).replace(/[A-Z]/g, c => '-' + c.toLowerCase()), value);
        return true;
      },
      get: (target, key) => target[key]
    });

    if (ownerDocument && ownerDocument.options.popoverSupported) {
      this.showPopover = () => {
        ownerDocument.operations.push('showPopover');
        if (ownerDocument.options.showPopoverThrows) throw new Error('mock showPopover failure');
        if (!this.isConnected) throw new Error('popover host must be connected');
        this._popoverOpen = true;
      };
      this.hidePopover = () => {
        ownerDocument.operations.push('hidePopover');
        this._popoverOpen = false;
        if (ownerDocument.options.hidePopoverThrows) throw new Error('mock hidePopover failure');
      };
    }
  }

  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this._className; }
  set className(value) {
    this._className = String(value || '');
    this.classList._syncFromClassName(this._className);
    this.classList._syncAttribute();
  }
  get attributes() {
    return Array.from(this._attributes, ([name, value]) => ({ name, value }));
  }
  get textContent() {
    if (this.childNodes.length) return this.childNodes.map(child => child.textContent || '').join('');
    return this._text;
  }
  set textContent(value) {
    this.childNodes.forEach(child => {
      if (this.ownerDocument) this.ownerDocument._clearFocusWithin(child);
      child.parentNode = null;
    });
    this.childNodes = [];
    this._text = value == null ? '' : String(value);
  }
  set innerHTML(_value) {
    throw new Error('innerHTML is forbidden in the Skopeo contract harness');
  }
  get innerHTML() { return ''; }

  appendChild(child) {
    if (!child) throw new TypeError('child is required');
    if (child.parentNode) child.parentNode.removeChild(child);
    this._text = '';
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  prepend(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this._text = '';
    this.childNodes.unshift(child);
    child.parentNode = this;
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error('child not found');
    if (this.ownerDocument) this.ownerDocument._clearFocusWithin(child);
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  replaceChildren(...children) {
    for (const child of this.childNodes) {
      if (this.ownerDocument) this.ownerDocument._clearFocusWithin(child);
      child.parentNode = null;
    }
    this.childNodes = [];
    this._text = '';
    for (const child of children) this.appendChild(child);
  }

  remove() {
    if (this.getAttribute('data-skopeo-shell-root') === 'true') {
      this.ownerDocument.operations.push('removeHost');
    }
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  setAttribute(name, value) {
    const key = String(name);
    const text = String(value);
    this._attributes.set(key, text);
    if (key === 'class') {
      this._className = text;
      this.classList._syncFromClassName(text);
    } else if (key === 'tabindex') {
      this.tabIndex = Number(text);
    } else if (key === 'disabled') {
      this.disabled = true;
    } else if (key === 'hidden') {
      this.hidden = true;
    } else if (key === 'value') {
      this.value = text;
    } else if (key === 'checked') {
      this.checked = true;
    } else if (key === 'name') {
      this.name = text;
    } else if (key === 'type') {
      this.type = text;
    }
  }

  getAttribute(name) {
    return this._attributes.has(String(name)) ? this._attributes.get(String(name)) : null;
  }
  hasAttribute(name) { return this._attributes.has(String(name)); }
  removeAttribute(name) {
    const key = String(name);
    this._attributes.delete(key);
    if (key === 'disabled') this.disabled = false;
    if (key === 'hidden') this.hidden = false;
    if (key === 'checked') this.checked = false;
  }
  toggleAttribute(name, force) {
    const enabled = force === undefined ? !this.hasAttribute(name) : !!force;
    if (enabled) this.setAttribute(name, '');
    else this.removeAttribute(name);
    return enabled;
  }

  attachShadow(options) {
    if (this.shadowRoot) throw new Error('shadow root already attached');
    const root = new MockShadowRoot(this, options && options.mode || 'open');
    if (root.mode === 'open') this.shadowRoot = root;
    this._shadowInternal = root;
    return root;
  }

  getRootNode() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    if (this.ownerDocument && node === this.ownerDocument.documentElement) return this.ownerDocument;
    return node;
  }

  get isConnected() {
    let node = this;
    while (node) {
      if (node === this.ownerDocument.documentElement) return true;
      if (node instanceof MockShadowRoot) node = node.host;
      else node = node.parentNode;
    }
    return false;
  }

  contains(node) {
    if (node === this) return true;
    for (const child of this.childNodes) if (child.contains && child.contains(node)) return true;
    if (this._shadowInternal && this._shadowInternal.contains(node)) return true;
    return false;
  }

  matches(selector) { return matchesSelector(this, selector); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { return querySelectorAllFrom(this, selector, false); }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.nodeType === 1 && matchesSelector(current, selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  getBoundingClientRect() {
    let rect = this._rect || {};
    if (!Number(rect.width) && !Number(rect.height) &&
        (this.classList.contains('skopeo-focused-card') || this.classList.contains('skopeo-gate'))) {
      const viewport = this.ownerDocument && this.ownerDocument.defaultView;
      const viewportWidth = viewport ? Number(viewport.innerWidth) : 1024;
      const narrow = viewportWidth < 480;
      const desiredWidth = this.classList.contains('skopeo-gate') ? 360 : 320;
      const width = narrow ? Math.max(0, viewportWidth - 32) : Math.min(desiredWidth, viewportWidth - 32);
      rect = {
        left: narrow ? 16 : (viewportWidth - width) / 2,
        top: 64,
        width,
        height: this.classList.contains('skopeo-gate') ? 208 : 168
      };
    }
    const left = Number(rect.left || 0);
    const top = Number(rect.top || 0);
    const width = Number(rect.width || 0);
    const height = Number(rect.height || 0);
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  setRect(rect) { this._rect = Object.assign({}, rect); }

  focus(options) {
    this._focusCalls.push(options || null);
    const root = this.getRootNode();
    this.ownerDocument._clearActiveFocus();
    if (root instanceof MockShadowRoot) {
      root.activeElement = this;
      this.ownerDocument._activeShadowRoot = root;
      this.ownerDocument.activeElement = root.host;
    } else {
      this.ownerDocument.activeElement = this;
    }
    this.dispatchEvent(createEvent('focus', { target: this }));
  }
  blur() {
    const root = this.getRootNode();
    if (root instanceof MockShadowRoot && root.activeElement === this) {
      root.activeElement = null;
      if (this.ownerDocument._activeShadowRoot === root) this.ownerDocument._activeShadowRoot = null;
      if (this.ownerDocument.activeElement === root.host) this.ownerDocument.activeElement = null;
    } else if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }
  click() { this.dispatchEvent(createEvent('click', { target: this })); }

  animate(keyframes, options) {
    const animation = {
      keyframes,
      options,
      cancelled: false,
      cancel() { this.cancelled = true; }
    };
    this._animations.push(animation);
    return animation;
  }
}

class MockShadowRoot extends MockElement {
  constructor(host, mode) {
    super('#shadow-root', host.ownerDocument);
    this.nodeType = 11;
    this.host = host;
    this.mode = mode;
    this.activeElement = null;
  }

  get isConnected() { return this.host.isConnected; }
}

class MockDocument extends MockEventTarget {
  constructor(options = {}) {
    super();
    this.options = Object.assign({ popoverSupported: true }, options);
    this.operations = [];
    this.activeElement = null;
    this._activeShadowRoot = null;
    this.documentElement = new MockElement('html', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.body);
    this.defaultView = null;
    this.readyState = 'complete';
  }

  createElement(tagName) { return new MockElement(tagName, this); }
  createTextNode(value) { return { nodeType: 3, parentNode: null, textContent: String(value) }; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const all = [];
    if (matchesSelector(this.documentElement, selector)) all.push(this.documentElement);
    return all.concat(querySelectorAllFrom(this.documentElement, selector, false));
  }
  getElementById(id) { return this.querySelector('#' + String(id)); }

  _clearActiveFocus() {
    if (this._activeShadowRoot) this._activeShadowRoot.activeElement = null;
    this._activeShadowRoot = null;
    this.activeElement = null;
  }

  _clearFocusWithin(node) {
    if (!node) return;
    const shadowActive = this._activeShadowRoot && this._activeShadowRoot.activeElement;
    if (shadowActive && (node === shadowActive || (typeof node.contains === 'function' && node.contains(shadowActive)))) {
      this._clearActiveFocus();
      return;
    }
    if (this.activeElement && (node === this.activeElement || (typeof node.contains === 'function' && node.contains(this.activeElement)))) {
      this._clearActiveFocus();
    }
  }
}

function querySelectorAllFrom(root, selector, includeShadow) {
  const selectors = splitSelectors(selector);
  const result = [];
  const visit = node => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 1 && selectors.some(part => matchesSelector(child, part))) result.push(child);
      if (child.childNodes) visit(child);
      if (includeShadow && child._shadowInternal) visit(child._shadowInternal);
    }
  };
  visit(root);
  return result;
}

function splitSelectors(selector) {
  return String(selector).split(',').map(part => part.trim()).filter(Boolean);
}

function splitDescendantSelector(selector) {
  const parts = [];
  let part = '';
  let quote = '';
  let bracketDepth = 0;
  let parenDepth = 0;
  for (const character of String(selector)) {
    if (quote) {
      part += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      part += character;
      continue;
    }
    if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (/\s/.test(character) && bracketDepth === 0 && parenDepth === 0) {
      if (part) parts.push(part);
      part = '';
      continue;
    }
    part += character;
  }
  if (part) parts.push(part);
  return parts;
}

function matchesSelector(element, selector) {
  let value = String(selector).trim();
  if (!value) return false;
  const descendantParts = splitDescendantSelector(value);
  if (descendantParts.length > 1) {
    const parts = descendantParts;
    const target = parts.pop();
    if (!matchesSelector(element, target)) return false;
    let ancestor = element.parentElement;
    while (ancestor) {
      if (matchesSelector(ancestor, parts.join(' '))) return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  }
  if (value === '*') return true;
  if (value.endsWith(':popover-open')) {
    return element._popoverOpen && matchesSelector(element, value.slice(0, -':popover-open'.length) || '*');
  }
  const notMatch = value.match(/:not\(([^)]+)\)$/);
  if (notMatch) {
    value = value.slice(0, notMatch.index);
    if (matchesSelector(element, notMatch[1])) return false;
  }

  const idMatch = value.match(/#([A-Za-z0-9_-]+)/);
  if (idMatch && element.id !== idMatch[1]) return false;
  const classes = Array.from(value.matchAll(/\.([A-Za-z0-9_-]+)/g), match => match[1]);
  if (classes.some(name => !element.classList.contains(name))) return false;
  const tagMatch = value.match(/^([A-Za-z][A-Za-z0-9-]*)/);
  if (tagMatch && element.localName !== tagMatch[1].toLowerCase()) return false;
  const attrs = Array.from(value.matchAll(/\[([^\]=~^$*|\s]+)(?:\s*([~^$*|]?=)\s*["']?([^\]"']*)["']?)?\]/g));
  for (const match of attrs) {
    const [, name, operator, expected] = match;
    if (!element.hasAttribute(name)) return false;
    if (!operator) continue;
    const actual = element.getAttribute(name) || '';
    if (operator === '=' && actual !== expected) return false;
    if (operator === '*=' && !actual.includes(expected)) return false;
    if (operator === '^=' && !actual.startsWith(expected)) return false;
    if (operator === '$=' && !actual.endsWith(expected)) return false;
  }
  return !!(tagMatch || idMatch || classes.length || attrs.length || value === '*');
}

class MockClock {
  constructor() {
    this.now = 1000;
    this.nextId = 1;
    this.tasks = new Map();
  }

  setTimeout(callback, delay = 0) { return this._add('timeout', callback, delay); }
  clearTimeout(id) { this.tasks.delete(id); }
  setInterval(callback, delay = 0) { return this._add('interval', callback, Math.max(1, delay)); }
  clearInterval(id) { this.tasks.delete(id); }
  requestAnimationFrame(callback) { return this._add('raf', () => callback(this.now), 16); }
  cancelAnimationFrame(id) { this.tasks.delete(id); }
  _add(type, callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { id, type, callback, due: this.now + Math.max(0, Number(delay) || 0), delay: Math.max(1, Number(delay) || 0) });
    return id;
  }
  advance(milliseconds) {
    const target = this.now + Number(milliseconds);
    let guard = 0;
    while (guard++ < 1000) {
      const due = Array.from(this.tasks.values())
        .filter(task => task.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!due) break;
      this.now = due.due;
      if (due.type === 'interval') due.due += due.delay;
      else this.tasks.delete(due.id);
      due.callback();
    }
    if (guard >= 1000) throw new Error('mock timer runaway');
    this.now = target;
  }
}

class MockWindow extends MockEventTarget {
  constructor(document, options = {}) {
    super();
    this.document = document;
    this.innerWidth = options.width || 1024;
    this.innerHeight = options.height || 768;
    document.documentElement.clientWidth = options.clientWidth || this.innerWidth;
    document.documentElement.clientHeight = options.clientHeight || this.innerHeight;
    this.scrollX = 0;
    this.scrollY = 0;
    this.clock = new MockClock();
    this.performance = { now: () => this.clock.now };
    this.setTimeout = this.clock.setTimeout.bind(this.clock);
    this.clearTimeout = this.clock.clearTimeout.bind(this.clock);
    this.setInterval = this.clock.setInterval.bind(this.clock);
    this.clearInterval = this.clock.clearInterval.bind(this.clock);
    this.requestAnimationFrame = this.clock.requestAnimationFrame.bind(this.clock);
    this.cancelAnimationFrame = this.clock.cancelAnimationFrame.bind(this.clock);
    this.visualViewport = new MockEventTarget();
    this.matchMedia = query => ({
      media: query,
      matches: query.includes('reduced-motion') ? !!options.reducedMotion : false,
      addEventListener() {},
      removeEventListener() {}
    });
    this.getComputedStyle = element => ({
      display: element.hidden ? 'none' : (element.style.display || 'block'),
      visibility: element.style.visibility || 'visible',
      opacity: element.style.opacity || '1',
      pointerEvents: element.style.pointerEvents || 'auto',
      position: element.style.position || 'static'
    });
    const windowRef = this;
    this.ResizeObserver = class {
      constructor(callback) { this.callback = callback; this.connected = false; }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; }
      trigger() { if (this.connected) this.callback([], this); }
    };
    this.Animation = function Animation() {};
    this.scrollTo = (x, y) => { windowRef.scrollX = x; windowRef.scrollY = y; };
  }
}

function createEvent(type, init = {}) {
  return Object.assign({
    type,
    key: '',
    shiftKey: false,
    repeat: false,
    isComposing: false,
    isTrusted: true,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; }
  }, init);
}

function snapshotHostState(document, window) {
  const snapshotElement = element => ({
    attributes: Object.fromEntries(Array.from(element._attributes.entries()).sort()),
    className: element.className,
    style: Object.keys(element.style).filter(key => typeof element.style[key] !== 'function').sort()
      .reduce((result, key) => { result[key] = element.style[key]; return result; }, {}),
    inert: !!element.inert,
    ariaHidden: element.getAttribute('aria-hidden')
  });
  return {
    html: snapshotElement(document.documentElement),
    body: snapshotElement(document.body),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    activeElement: document.activeElement
  };
}

function createHarness(api, options = {}) {
  const document = new MockDocument(options);
  const window = new MockWindow(document, options);
  document.defaultView = window;
  const fixtureToken = Object.freeze({ fixture: Symbol('skopeo-fixture') });
  const ledger = new SkopeoResourceLedger('shell-harness');
  const calls = { close: [], kill: [], escape: [], adaptive: [] };
  const shell = api.createShell({
    document,
    window,
    generation: options.generation || 1,
    onRequestClose: payload => calls.close.push(payload),
    onRequestKill: payload => calls.kill.push(payload),
    onEscapeConsumed: payload => calls.escape.push(payload),
    onAdaptiveAction: payload => {
      calls.adaptive.push(payload);
      return typeof options.onAdaptiveAction === 'function'
        ? options.onAdaptiveAction(payload)
        : true;
    },
    onContractWithdraw: typeof options.onContractWithdraw === 'function'
      ? options.onContractWithdraw
      : undefined,
    fixtureToken,
    allowControlledFixture: true,
    resourceLedger: ledger
  });
  return {
    api,
    document,
    window,
    shell,
    ledger,
    fixtureToken,
    calls,
    addHostControl(rect, attributes = {}) {
      const control = document.createElement(attributes.tagName || 'button');
      control.setRect(rect);
      for (const [name, value] of Object.entries(attributes)) {
        if (name !== 'tagName') control.setAttribute(name, value);
      }
      document.body.appendChild(control);
      return control;
    },
    advance(milliseconds) { window.clock.advance(milliseconds); },
    dispatchKey(key, init = {}) {
      const deepActive = this.shadow() && this.shadow().activeElement;
      const event = createEvent('keydown', Object.assign({ key, target: deepActive || document.activeElement || document.body }, init));
      window.dispatchEvent(event);
      return event;
    },
    host() { return document.querySelector(ROOT_SELECTOR); },
    shadow() { return shell.getControlledTestRoot(fixtureToken); }
  };
}

function assertZeroSnapshot(snapshot, label) {
  assert.deepStrictEqual(Object.assign({}, snapshot), Object.assign({}, zeroSnapshot()), label);
}

function assertImportantHostRule(cssText) {
  const source = String(cssText || '');
  const match = source.match(/:host\s*\{([^}]*)\}/);
  assert.ok(match, 'production Shadow stylesheet contains a :host rule');
  const rule = match[1];
  const declarations = [
    ['all', 'initial'],
    ['display', 'block'],
    ['position', 'fixed'],
    ['inset', '0'],
    ['z-index', '2147483647'],
    ['pointer-events', 'none'],
    ['margin', '0'],
    ['padding', '0'],
    ['border', '0'],
    ['background', 'transparent']
  ];
  for (const [property, value] of declarations) {
    const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      rule,
      new RegExp('(?:^|;)\\s*' + escapedProperty + '\\s*:\\s*' + escapedValue + '\\s*!important\\s*(?:;|$)'),
      `:host keeps ${property}:${value} at the same !important priority as the reset`
    );
  }
  return rule;
}

function runHarnessSelfTest() {
  runLedgerSelfTest();
  const document = new MockDocument({ popoverSupported: true });
  const window = new MockWindow(document);
  document.defaultView = window;
  const node = document.createElement('span');
  node.className = 'oracle';
  node.textContent = HOSTILE_TEXT;
  document.body.appendChild(node);
  assert.strictEqual(node.textContent, HOSTILE_TEXT, 'hostile string remains literal text');
  assert.strictEqual(document.querySelector('img'), null, 'textContent does not create an image node');
  assert.strictEqual(globalThis.__skopeoPwned, undefined, 'hostile handler never executes');
  const host = document.createElement('div');
  host.setAttribute('popover', 'manual');
  document.documentElement.appendChild(host);
  host.showPopover();
  assert.strictEqual(host.matches(':popover-open'), true, 'mock exposes open top-layer state');
  host.hidePopover();
  assert.strictEqual(host.matches(':popover-open'), false, 'mock exposes closed top-layer state');
  console.log('skopeo-shell-contract self-test: PASS');
}

function loadProductionApi() {
  const modulePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
  assert.ok(fs.existsSync(modulePath), 'production shell module must exist in normal mode');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function testExports(api) {
  assert.deepStrictEqual(Array.from(api.PRIMITIVES), ['anchor', 'chip', 'halo', 'rail', 'ghost', 'gate'], 'registry has exactly six primitives and no seventh');
  assert.deepStrictEqual(Object.assign({}, api.ATTENTION), {
    AMBIENT: 'ambient', ANCHORED: 'anchored', FOCUSED: 'focused', INTERSTITIAL: 'interstitial'
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(api.ATTENTION_POLICY)), {
    ambient: ['rail'],
    anchored: ['anchor', 'chip', 'rail', 'halo'],
    focused: ['anchor', 'chip', 'ghost'],
    interstitial: ['gate']
  });
  assert.ok(Object.isFrozen(api.PRIMITIVES), 'primitive registry is immutable');
  assert.ok(Object.isFrozen(api.ATTENTION_POLICY), 'attention policy is immutable');
  assert.strictEqual(typeof api.createShell, 'function');
  assert.strictEqual(typeof api.SkopeoShell, 'function');
}

function testPrepareCommitAndTopLayer(api) {
  const harness = createHarness(api);
  assertZeroSnapshot(harness.shell.getResourceSnapshot(), 'new shell owns no resources');
  assert.strictEqual(harness.host(), null, 'no host exists before prepareAmbient');
  const prepared = harness.shell.prepareAmbient();
  assert.ok(prepared && typeof prepared === 'object', 'prepareAmbient returns an opaque placement');
  assert.strictEqual(Object.keys(prepared).length, 0, 'prepared placement exposes no geometry fields');
  assert.ok(Object.isFrozen(prepared), 'prepared placement is immutable');
  assert.strictEqual(
    harness.shell.getPreparedPlacementMode(prepared),
    'full',
    'shell exposes only the mode for its current opaque placement'
  );
  assert.strictEqual(
    harness.shell.getPreparedPlacementMode({}),
    null,
    'foreign placement cannot reveal a prepared mode'
  );
  assert.strictEqual(harness.host(), null, 'prepareAmbient inserts no host');
  assert.strictEqual(harness.shell.getResourceSnapshot().roots, 0, 'prepare keeps roots at zero');
  assert.strictEqual(harness.shell.getResourceSnapshot().popoverTopLayer, 0, 'prepare keeps top-layer count at zero');
  assert.strictEqual(harness.window.listenerCount(), 0, 'prepare registers no window listeners');
  assert.strictEqual(harness.shell.mountAmbient({}), false, 'foreign plain placement fails closed');

  const other = createHarness(api, { generation: 2 });
  const foreign = other.shell.prepareAmbient();
  assert.strictEqual(harness.shell.mountAmbient(foreign), false, 'placement from another shell fails closed');
  other.shell.destroy('foreign-test');

  assert.strictEqual(harness.shell.mountAmbient(prepared), true, 'matching prepared placement commits');
  assert.strictEqual(
    harness.shell.getPreparedPlacementMode(prepared),
    null,
    'consumed placement no longer reveals a mode'
  );
  assert.strictEqual(harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, 'commit inserts exactly one owner');
  assert.strictEqual(harness.host().shadowRoot, null, 'owner keeps its ShadowRoot closed to the host page');
  assert.ok(harness.shadow(), 'matching opaque fixture token exposes the root only to the test harness');
  assert.strictEqual(harness.host()._popoverOpen, true, 'successful showPopover opens the host');
  assert.strictEqual(harness.shell.getResourceSnapshot().roots, 1, 'root acquisition is observable');
  assert.strictEqual(harness.shell.getResourceSnapshot().popoverTopLayer, 1, 'top layer transitions 0 -> 1');
  assert.strictEqual(harness.shell.mountAmbient(prepared), false, 'prepared placement is one-use');
  assert.strictEqual(harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, 'reused mount does not duplicate owner');

  harness.document.operations.length = 0;
  const destroyed = harness.shell.destroy('contract-test');
  assertZeroSnapshot(destroyed, 'destroy returns immutable eleven-category zero snapshot');
  assert.ok(Object.isFrozen(destroyed), 'destroy snapshot is immutable');
  assert.deepStrictEqual(harness.document.operations.slice(0, 2), ['hidePopover', 'removeHost'], 'hidePopover runs before host removal');
  assert.strictEqual(harness.host(), null, 'destroy removes sole host');
  assertZeroSnapshot(harness.shell.destroy('second-destroy'), 'second destroy is a zero no-op');
}

function testStalePlacementAndFallback(api) {
  const staleHarness = createHarness(api);
  const first = staleHarness.shell.prepareAmbient();
  const second = staleHarness.shell.prepareAmbient();
  assert.strictEqual(staleHarness.shell.mountAmbient(first), false, 'superseded prepared placement is stale');
  assert.strictEqual(staleHarness.host(), null, 'stale placement creates no host');
  assert.strictEqual(staleHarness.shell.mountAmbient(second), true, 'latest placement remains consumable');
  staleHarness.shell.destroy('stale-test');

  const fallback = createHarness(api, { popoverSupported: false });
  const placement = fallback.shell.prepareAmbient();
  assert.ok(placement, 'fallback environment still prepares safely');
  assert.strictEqual(fallback.shell.mountAmbient(placement), true, 'fallback mounts with z-index path');
  assert.strictEqual(fallback.shell.getResourceSnapshot().popoverTopLayer, 0, 'fallback never acquires top-layer category');
  assert.strictEqual(fallback.host().hasAttribute('popover'), false, 'fallback host has no popover claim');
  fallback.shell.destroy('fallback-test');

  const failedPopover = createHarness(api, { showPopoverThrows: true });
  const failedPlacement = failedPopover.shell.prepareAmbient();
  assert.strictEqual(failedPopover.shell.mountAmbient(failedPlacement), true, 'showPopover failure uses safe fixed fallback');
  assert.strictEqual(failedPopover.shell.getResourceSnapshot().popoverTopLayer, 0, 'failed showPopover never acquires top-layer handle');
  failedPopover.shell.destroy('show-failed');
}

function placementRectForLens(harness, lens) {
  const width = Number.parseFloat(lens.style.width);
  const height = 40;
  const corner = lens.getAttribute('data-placement-corner');
  const left = corner.endsWith('right')
    ? harness.window.innerWidth - 16 - width
    : 16;
  const top = corner.startsWith('bottom')
    ? harness.window.innerHeight - 16 - height
    : 16;
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function rectsIntersect(left, right, clearance = 0) {
  return left.left < right.right + clearance &&
    left.right > right.left - clearance &&
    left.top < right.bottom + clearance &&
    left.bottom > right.top - clearance;
}

function testPrepareCommitGeometryRevalidation(api) {
  const moved = createHarness(api);
  const prepared = moved.shell.prepareAmbient();
  assert.ok(prepared, 'top-right geometry prepares while the page is unobstructed');
  const preparedRect = {
    left: moved.window.innerWidth - 16 - 240,
    top: 16,
    width: 240,
    height: 40,
    right: moved.window.innerWidth - 16,
    bottom: 56
  };
  const movedControl = moved.addHostControl(preparedRect, { id: 'post-prepare-control' });
  movedControl.focus({ preventScroll: true });
  const movedChildrenBefore = Array.from(moved.document.documentElement.childNodes);
  const movedFocusBefore = moved.document.activeElement;
  const movedResourcesBefore = exactResourceSnapshot(moved.shell);

  const movedMounted = moved.shell.mountAmbient(prepared);
  const movedRoots = moved.document.querySelectorAll(ROOT_SELECTOR);
  if (movedMounted) {
    assert.strictEqual(movedRoots.length, 1, 'fresh safe placement commits exactly one root');
    const lens = moved.shadow().querySelector('.skopeo-lens');
    const committedRect = placementRectForLens(moved, lens);
    assert.strictEqual(
      rectsIntersect(committedRect, movedControl.getBoundingClientRect(), 8),
      false,
      'committed Ambient placement does not reuse the now-obstructed prepared rectangle'
    );
    assert.notStrictEqual(
      lens.getAttribute('data-placement-corner'),
      'top-right',
      'fresh geometry reselects away from the obstructed prepared corner'
    );
    assert.deepStrictEqual(
      Array.from(moved.document.documentElement.childNodes).slice(0, movedChildrenBefore.length),
      movedChildrenBefore,
      'successful commit preserves every preexisting document-element child identity'
    );
  } else {
    assert.strictEqual(movedRoots.length, 0, 'fresh unsafe placement may fail with no root');
    assert.deepStrictEqual(
      Array.from(moved.document.documentElement.childNodes),
      movedChildrenBefore,
      'failed fresh placement preserves document-element child identities'
    );
    assert.deepStrictEqual(exactResourceSnapshot(moved.shell), movedResourcesBefore, 'failed fresh placement preserves exact resources');
  }
  assert.strictEqual(moved.document.activeElement, movedFocusBefore, 'commit-time revalidation does not write focus');
  assertZeroSnapshot(moved.shell.destroy('prepare-commit-moved'), 'moved-control fixture destroys to exact zero');

  const blocked = createHarness(api);
  const blockedPrepared = blocked.shell.prepareAmbient();
  assert.ok(blockedPrepared, 'all-candidate blocker is inserted only after successful prepare');
  const blocker = blocked.addHostControl({
    left: 0,
    top: 0,
    width: blocked.window.innerWidth,
    height: blocked.window.innerHeight
  }, { id: 'post-prepare-all-candidates-blocked' });
  blocker.focus({ preventScroll: true });
  const blockedChildrenBefore = Array.from(blocked.document.documentElement.childNodes);
  const blockedFocusBefore = blocked.document.activeElement;
  const blockedResourcesBefore = exactResourceSnapshot(blocked.shell);
  const originalChoosePlacement = blocked.shell._choosePlacement.bind(blocked.shell);
  let freshGeometryPasses = 0;
  blocked.shell._choosePlacement = function () {
    freshGeometryPasses += 1;
    return originalChoosePlacement();
  };

  assert.strictEqual(blocked.shell.mountAmbient({}), false, 'foreign token is rejected before fresh geometry');
  assert.strictEqual(freshGeometryPasses, 0, 'foreign token cannot trigger a fresh geometry pass');
  assert.strictEqual(blocked.shell.mountAmbient(blockedPrepared), false, 'blocking every candidate after prepare fails commit');
  assert.strictEqual(freshGeometryPasses, 1, 'admitted prepared token triggers exactly one commit-time geometry pass');
  assert.strictEqual(blocked.shell.mountAmbient(blockedPrepared), false, 'failed commit still consumes the prepared token once');
  assert.strictEqual(freshGeometryPasses, 1, 'consumed token cannot trigger another geometry pass');
  assert.strictEqual(blocked.document.querySelectorAll(ROOT_SELECTOR).length, 0, 'blocked commit appends no Skopeo root');
  assert.deepStrictEqual(Array.from(blocked.document.documentElement.childNodes), blockedChildrenBefore, 'blocked commit preserves document-element child identities');
  assert.strictEqual(blocked.document.activeElement, blockedFocusBefore, 'blocked commit performs no focus write');
  assert.strictEqual(blocked.window.listenerCount(), 0, 'blocked commit registers no listener');
  assert.deepStrictEqual(exactResourceSnapshot(blocked.shell), blockedResourcesBefore, 'blocked commit leaves every resource category unchanged');
  assertZeroSnapshot(blocked.shell.getResourceSnapshot(), 'blocked commit reports exact eleven-key zero');

  const stale = createHarness(api);
  const staleFirst = stale.shell.prepareAmbient();
  const staleSecond = stale.shell.prepareAmbient();
  const staleOriginalChoose = stale.shell._choosePlacement.bind(stale.shell);
  let staleGeometryPasses = 0;
  stale.shell._choosePlacement = function () {
    staleGeometryPasses += 1;
    return staleOriginalChoose();
  };
  assert.strictEqual(stale.shell.mountAmbient(staleFirst), false, 'superseded token remains stale');
  assert.strictEqual(staleGeometryPasses, 0, 'stale token cannot trigger commit-time geometry');
  assert.strictEqual(stale.shell.mountAmbient(staleSecond), true, 'latest exact token remains admissible');
  assert.strictEqual(staleGeometryPasses, 1, 'latest exact token triggers one fresh geometry pass');
  assertZeroSnapshot(stale.shell.destroy('prepare-commit-stale'), 'stale-token fixture destroys to exact zero');
}

function testPlacementAndCollision(api) {
  const preferred = createHarness(api);
  preferred.shell.mountAmbient(preferred.shell.prepareAmbient());
  let lens = preferred.shadow().querySelector('.skopeo-lens');
  assert.strictEqual(lens.getAttribute('data-placement-corner'), 'top-right', 'candidate order begins at top-right');
  assert.strictEqual(lens.getAttribute('data-placement-mode'), 'full', '240x40 lens is preferred');
  assert.strictEqual(lens.style.width, '240px');
  assert.strictEqual(lens.style.top, '16px');
  assert.strictEqual(lens.style.right, '16px');
  preferred.shell.destroy('placement-preferred');

  const nextCorner = createHarness(api);
  nextCorner.addHostControl({ left: 770, top: 0, width: 254, height: 80 });
  nextCorner.shell.mountAmbient(nextCorner.shell.prepareAmbient());
  lens = nextCorner.shadow().querySelector('.skopeo-lens');
  assert.strictEqual(lens.getAttribute('data-placement-corner'), 'top-left', 'host control plus 8px clearance advances to top-left');
  assert.strictEqual(lens.style.left, '16px');
  nextCorner.shell.destroy('placement-corner');

  const compact = createHarness(api);
  compact.addHostControl({ left: 780, top: 8, width: 130, height: 64 });
  compact.addHostControl({ left: 110, top: 8, width: 150, height: 64 });
  compact.addHostControl({ left: 780, top: 696, width: 130, height: 64 });
  compact.addHostControl({ left: 110, top: 696, width: 150, height: 64 });
  compact.shell.mountAmbient(compact.shell.prepareAmbient());
  lens = compact.shadow().querySelector('.skopeo-lens');
  assert.strictEqual(lens.getAttribute('data-placement-mode'), 'compact', '88x40 fallback follows failed full candidates');
  assert.strictEqual(lens.style.width, '88px');
  compact.shell.destroy('placement-compact');

  const unsafe = createHarness(api);
  unsafe.addHostControl({ left: 0, top: 0, width: 1024, height: 768 });
  assert.strictEqual(unsafe.shell.prepareAmbient(), null, 'unsafe layout fails closed when neither lens fits');
  assert.strictEqual(unsafe.host(), null, 'unsafe layout inserts no root');
  assertZeroSnapshot(unsafe.shell.getResourceSnapshot(), 'unsafe preparation owns no resources');
}

function testAmbientFixtureAndTextSafety(api) {
  const ordinary = createHarness(api);
  ordinary.shell.mountAmbient(ordinary.shell.prepareAmbient());
  assert.strictEqual(ordinary.host().shadowRoot, null, 'the host page cannot discover the closed ShadowRoot');
  assert.strictEqual(ordinary.shell.getControlledTestRoot({}), null,
    'a non-matching accessor token cannot expose the closed ShadowRoot');
  const shadow = ordinary.shadow();
  assert.ok(shadow.querySelector('.skopeo-lens'), 'ordinary mount shows ambient lens');
  assert.strictEqual(shadow.querySelector('.skopeo-lens-label').textContent, 'Skopeo · Ambient');
  assert.strictEqual(shadow.querySelectorAll('[data-skopeo-primitive]').length, 1, 'ordinary Ambient renders one primitive node');
  assert.strictEqual(shadow.querySelector('[data-skopeo-primitive="rail"]') !== null, true, 'ordinary Ambient renders rail');
  for (const name of ['anchor', 'chip', 'halo', 'ghost', 'gate']) {
    assert.strictEqual(shadow.querySelector(`[data-skopeo-primitive="${name}"]`), null, `ordinary Ambient omits ${name}`);
  }
  assert.strictEqual(ordinary.shell.render('anchored', {}), false, 'ordinary caller cannot advance beyond Ambient');
  assert.strictEqual(ordinary.shell.enableControlledFixture({}), false, 'wrong fixture token is rejected');
  ordinary.shell.render('ambient', { announcement: HOSTILE_TEXT });
  const live = shadow.querySelector('[aria-live="polite"]');
  ordinary.advance(500);
  assert.strictEqual(live.textContent, HOSTILE_TEXT, 'hostile display string remains literal in live region');
  assert.strictEqual(shadow.querySelector('img'), null, 'hostile display string creates no executable node');
  assert.strictEqual(globalThis.__skopeoPwned, undefined, 'hostile event attribute never executes');
  ordinary.shell.destroy('ordinary');

  const fixture = createHarness(api);
  fixture.shell.mountAmbient(fixture.shell.prepareAmbient());
  assert.strictEqual(fixture.shell.enableControlledFixture(fixture.fixtureToken), true, 'matching opaque fixture token enables shell-owned samples');
  assert.strictEqual(fixture.shell.render('anchored', {}), true);
  let fixtureShadow = fixture.shadow();
  assert.strictEqual(fixture.host().getAttribute('data-attention'), 'anchored');
  assert.deepStrictEqual(
    fixtureShadow.querySelectorAll('[data-skopeo-primitive]').map(node => node.getAttribute('data-skopeo-primitive')),
    ['anchor', 'chip', 'rail', 'halo'],
    'Anchored uses only its four-name allowlist'
  );
  assert.strictEqual(fixtureShadow.querySelectorAll('[data-skopeo-primitive="halo"]').length, 1, 'halo scarcity is one maximum');
  assert.strictEqual(fixtureShadow.querySelector('.skopeo-entity-label').textContent, 'Example entity · 1 note');
  assert.strictEqual(fixtureShadow.querySelector('.skopeo-anomaly-label').textContent, 'Anomaly demo · unusual change');

  assert.strictEqual(fixture.shell.render('focused', {}), true);
  fixtureShadow = fixture.shadow();
  assert.deepStrictEqual(
    fixtureShadow.querySelectorAll('[data-skopeo-primitive]').map(node => node.getAttribute('data-skopeo-primitive')),
    ['anchor', 'chip', 'ghost'],
    'Focused uses anchor, chip, and temporary ghost only'
  );
  assert.strictEqual(fixtureShadow.querySelector('[data-skopeo-primitive="halo"]'), null, 'halo leaves DOM outside Anchored');
  assert.strictEqual(fixtureShadow.querySelector('[data-skopeo-primitive="rail"]'), null, 'rail leaves DOM outside Focused policy');

  assert.strictEqual(fixture.shell.render('interstitial', {}), true);
  fixtureShadow = fixture.shadow();
  assert.deepStrictEqual(
    fixtureShadow.querySelectorAll('[data-skopeo-primitive]').map(node => node.getAttribute('data-skopeo-primitive')),
    ['gate'],
    'Interstitial renders exactly one gate primitive'
  );
  assert.strictEqual(fixtureShadow.querySelectorAll('[data-skopeo-primitive="gate"]').length, 1, 'only one gate can exist');
  fixture.shell.destroy('fixture');
}

function testPointerAndHostIntegrity(api) {
  const harness = createHarness(api);
  const hostFocus = harness.addHostControl({ left: 300, top: 300, width: 120, height: 40 }, { id: 'host-focus' });
  hostFocus.focus({ preventScroll: true });
  harness.document.documentElement.className = 'host-html';
  harness.document.body.className = 'host-body';
  harness.document.body.style.overflow = 'auto';
  harness.document.body.setAttribute('data-host', 'stable');
  const before = snapshotHostState(harness.document, harness.window);
  harness.shell.mountAmbient(harness.shell.prepareAmbient());

  const host = harness.host();
  const shadow = harness.shadow();
  assertImportantHostRule(shadow.querySelector('style').textContent);
  assert.strictEqual(host.style.position, 'fixed', 'owner uses fixed viewport geometry');
  assert.strictEqual(host.style.inset, '0', 'owner uses inset:0');
  assert.strictEqual(host.style.pointerEvents, 'none', 'owner is pointer-transparent');
  assert.strictEqual(shadow.querySelector('.skopeo-envelope').style.pointerEvents, 'none', 'empty envelope is pointer-transparent');
  assert.strictEqual(shadow.querySelector('[data-skopeo-primitive="rail"]').style.pointerEvents, 'none', 'rail is pointer-transparent');
  assert.strictEqual(shadow.querySelector('[aria-label="Turn off Skopeo"]').style.pointerEvents, 'auto', 'visible close control opts into pointer input');
  assert.strictEqual(harness.document.activeElement, hostFocus, 'Ambient does not steal host focus');

  harness.shell.destroy('host-integrity');
  const after = snapshotHostState(harness.document, harness.window);
  assert.deepStrictEqual(after, before, 'body/html class, style, attributes, accessibility, selection-equivalent focus, and scroll are unchanged');
}

function testHostCascadeNegativeControl(api) {
  const harness = createHarness(api);
  harness.shell.mountAmbient(harness.shell.prepareAmbient());
  const cssText = harness.shadow().querySelector('style').textContent;
  const weakened = cssText
    .replace(/position:\s*fixed\s*!important\s*;?/, '')
    .replace(/pointer-events:\s*none\s*!important\s*;?/, '');
  const sourceFixture = weakened + "\nhost.style.position = 'fixed'; host.style.pointerEvents = 'none';";
  assert.throws(
    () => assertImportantHostRule(sourceFixture),
    /position:fixed|pointer-events:none/,
    'source contract rejects missing cascade-critical declarations even when inline defenses remain'
  );
  harness.shell.destroy('host-cascade-negative-control');
}

function testHideFailureStillReleases(api) {
  const harness = createHarness(api, { hidePopoverThrows: true });
  harness.shell.mountAmbient(harness.shell.prepareAmbient());
  assert.strictEqual(harness.shell.getResourceSnapshot().popoverTopLayer, 1);
  const snapshot = harness.shell.destroy('hide-throws');
  assertZeroSnapshot(snapshot, 'hidePopover exception still releases all eleven categories');
  assert.strictEqual(harness.host(), null, 'hidePopover exception still removes host');
  assert.deepStrictEqual(harness.document.operations.slice(0, 2), ['showPopover', 'hidePopover'], 'hide attempt remains observable before removal fallback');
  assert.ok(harness.document.operations.indexOf('removeHost') > harness.document.operations.indexOf('hidePopover'), 'host removal follows hide attempt');
}

function exactResourceSnapshot(shell) {
  return Object.fromEntries(CATEGORIES.map(category => [category, shell.getResourceSnapshot()[category]]));
}

function surfaceState(harness) {
  const shadow = harness.shadow();
  return {
    attention: harness.host().getAttribute('data-attention'),
    nodes: Array.from(harness.shell._surface.childNodes || []),
    deepFocus: shadow.activeElement,
    primitives: shadow.querySelectorAll('[data-skopeo-primitive]')
      .map(node => node.getAttribute('data-skopeo-primitive')),
    liveText: shadow.querySelector('[aria-live="polite"]').textContent,
    resources: exactResourceSnapshot(harness.shell)
  };
}

function assertRollback(before, after, label) {
  assert.strictEqual(after.attention, before.attention, label + ' preserves attention');
  assert.deepStrictEqual(after.nodes, before.nodes, label + ' preserves exact surface node identities');
  assert.strictEqual(after.deepFocus, before.deepFocus, label + ' preserves exact deep focus');
  assert.deepStrictEqual(after.primitives, before.primitives, label + ' preserves the primitive allowlist');
  assert.deepStrictEqual(after.resources, before.resources, label + ' restores all eleven resource counts');
  assert.strictEqual(after.liveText, 'Skopeo can’t open this view without covering the current page control.', label + ' announces the exact unsafe view copy');
}

function mountFixtureWithOrigin(api, options = {}) {
  const harness = createHarness(api, options);
  const origin = harness.addHostControl(
    { left: 16, top: Math.max(320, (options.height || 768) - 72), width: 120, height: 40 },
    { id: 'required-host-control' }
  );
  origin.focus({ preventScroll: true });
  const prepared = harness.shell.prepareAmbient();
  assert.ok(prepared, 'fixture has a collision-safe Ambient placement');
  assert.strictEqual(harness.shell.mountAmbient(prepared), true);
  assert.strictEqual(harness.shell.enableControlledFixture(harness.fixtureToken), true);
  return { harness, origin };
}

function testAtomicRicherCollisionRollback(api, options = {}) {
  const label = options.width && options.width < 480 ? 'narrow' : 'normal';
  const { harness, origin } = mountFixtureWithOrigin(api, options);
  assert.strictEqual(harness.shell.render('anchored', {}), true);
  const anchor = harness.shadow().querySelector('[data-skopeo-primitive="anchor"]');
  anchor.focus({ preventScroll: true });

  assert.strictEqual(harness.shell.render('focused', {}), true, label + ' safe Focused candidate commits');
  const focusedRect = harness.shadow().querySelector('.skopeo-focused-card').getBoundingClientRect();
  assert.strictEqual(harness.shell.back(), true);
  origin.setRect({
    left: focusedRect.left + Math.max(8, focusedRect.width / 3),
    top: focusedRect.top + 24,
    width: 48,
    height: 40
  });
  const beforeFocused = surfaceState(harness);
  assert.strictEqual(harness.shell.render('focused', {}), false, label + ' colliding Focused candidate fails closed');
  assertRollback(beforeFocused, surfaceState(harness), label + ' Focused rollback');

  origin.setRect({ left: 16, top: Math.max(320, (options.height || 768) - 72), width: 120, height: 40 });
  assert.strictEqual(harness.shell.render('focused', {}), true, label + ' Focused recommits after the obstruction moves');
  const trigger = harness.shadow().querySelector('[aria-label="Open consequence preview"]');
  trigger.focus({ preventScroll: true });
  assert.strictEqual(harness.shell.render('interstitial', {}), true, label + ' safe Gate candidate commits');
  const gateRect = harness.shadow().querySelector('.skopeo-gate').getBoundingClientRect();
  assert.strictEqual(harness.shell.back(), true);
  origin.setRect({
    left: gateRect.left + Math.max(8, gateRect.width / 3),
    top: gateRect.top + 24,
    width: 48,
    height: 40
  });
  const beforeGate = surfaceState(harness);
  assert.strictEqual(harness.shell.render('interstitial', {}), false, label + ' colliding Gate candidate fails closed');
  assertRollback(beforeGate, surfaceState(harness), label + ' Gate rollback');
  assertZeroSnapshot(harness.shell.destroy('collision-' + label), label + ' collision fixture destroys to exact zero');
  assertZeroSnapshot(harness.shell.destroy('collision-' + label + '-repeat'), label + ' repeated destroy remains exact zero');
}

function testAttentionResourcePlateaus(api) {
  const { harness } = mountFixtureWithOrigin(api);
  const plateaus = new Map();
  const initialAmbient = exactResourceSnapshot(harness.shell);

  function record(level) {
    const snapshot = exactResourceSnapshot(harness.shell);
    assert.deepStrictEqual(Object.keys(snapshot), CATEGORIES, level + ' snapshot exposes exactly eleven categories');
    assert.strictEqual(snapshot.animations, 0, level + ' has no untracked or ledger-owned animation');
    assert.strictEqual(
      snapshot.animationFrames,
      level === 'focused' || level === 'interstitial' ? 1 : 0,
      level + ' owns exactly the expected rich-geometry animation frame'
    );
    if (plateaus.has(level)) assert.deepStrictEqual(snapshot, plateaus.get(level), level + ' returns to its first stable resource plateau');
    else plateaus.set(level, snapshot);
  }

  record('ambient');
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    assert.strictEqual(harness.shell.render('anchored', {}), true);
    record('anchored');
    const anchor = harness.shadow().querySelector('[data-skopeo-primitive="anchor"]');
    anchor.focus({ preventScroll: true });
    assert.strictEqual(harness.shell.render('focused', {}), true);
    record('focused');
    const trigger = harness.shadow().querySelector('[aria-label="Open consequence preview"]');
    trigger.focus({ preventScroll: true });
    assert.strictEqual(harness.shell.render('interstitial', {}), true);
    record('interstitial');
    assert.strictEqual(harness.shell.back(), true);
    record('focused');
    assert.strictEqual(harness.shell.back(), true);
    record('anchored');
    assert.strictEqual(harness.shell.back(), true);
    record('ambient');
    assert.deepStrictEqual(exactResourceSnapshot(harness.shell), initialAmbient, 'Ambient after cycle ' + cycle + ' equals initial Ambient');
  }

  assert.ok(plateaus.get('focused').listeners < 13, 'Focused listeners stay below the historical 13-listener leak');
  assert.ok(plateaus.get('interstitial').pointerSurfaces < 13, 'Gate pointer surfaces stay below the historical 13-surface leak');
  assertZeroSnapshot(harness.shell.destroy('plateau'), 'plateau fixture destroys to exact zero');
  assertZeroSnapshot(harness.shell.destroy('plateau-repeat'), 'plateau repeated destroy remains exact zero');
}

function dispatchResize(harness) {
  harness.window.dispatchEvent(createEvent('resize', { target: harness.window }));
}

function dispatchDocumentScroll(harness) {
  harness.document.dispatchEvent(createEvent('scroll', { target: harness.document }));
}

function dispatchVisualViewport(harness, type) {
  harness.window.visualViewport.dispatchEvent(createEvent(type, { target: harness.window.visualViewport }));
}

function assertSafeRichResizePreserved(harness, before, label) {
  assert.strictEqual(harness.shell._attention, before.attention, label + ' preserves attention');
  assert.strictEqual(harness.shell._activeSurfaceScope, before.activeScope, label + ' preserves active scope identity');
  assert.strictEqual(harness.shell._anchoredScope, before.anchoredScope, label + ' preserves Anchored scope identity');
  assert.strictEqual(harness.shell._focusedScope, before.focusedScope, label + ' preserves Focused scope identity');
  assert.deepStrictEqual(Array.from(harness.shell._surface.childNodes), before.nodes, label + ' preserves node identities');
  assert.strictEqual(harness.shadow().activeElement, before.deepFocus, label + ' preserves deep focus');
  assert.strictEqual(harness.shell._requiredHostControl(), before.requiredControl, label + ' preserves the required host-control identity');
  assert.strictEqual(harness.shadow().querySelector('[aria-live="polite"]').textContent, before.liveText, label + ' preserves live-region copy');
  assert.strictEqual(harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, label + ' preserves one root');
  assert.deepStrictEqual(exactResourceSnapshot(harness.shell), before.resources, label + ' preserves all eleven resource values');
}

function captureRichState(harness) {
  return {
    attention: harness.shell._attention,
    activeScope: harness.shell._activeSurfaceScope,
    anchoredScope: harness.shell._anchoredScope,
    focusedScope: harness.shell._focusedScope,
    nodes: Array.from(harness.shell._surface.childNodes),
    deepFocus: harness.shadow().activeElement,
    requiredControl: harness.shell._requiredHostControl(),
    liveText: harness.shadow().querySelector('[aria-live="polite"]').textContent,
    resources: exactResourceSnapshot(harness.shell)
  };
}

function setupAnchoredFixture(api, options = {}) {
  const pair = mountFixtureWithOrigin(api, options);
  const harness = pair.harness;
  assert.strictEqual(harness.shell.render('anchored', {}), true);
  const anchor = harness.shadow().querySelector('[data-skopeo-primitive="anchor"]');
  anchor.focus({ preventScroll: true });
  return {
    harness,
    origin: pair.origin,
    anchor,
    anchoredScope: harness.shell._activeSurfaceScope,
    anchoredNodes: Array.from(harness.shell._surface.childNodes),
    anchoredResources: exactResourceSnapshot(harness.shell)
  };
}

function testRichGeometryRevalidation(api) {
  const focused = setupAnchoredFixture(api);
  assert.strictEqual(focused.harness.shell.render('focused', {}), true, 'Focused fixture opens safely');
  const focusedSafe = captureRichState(focused.harness);
  assert.strictEqual(focusedSafe.requiredControl, focused.origin, 'Focused certificate uses the current required host control');
  assert.strictEqual(focusedSafe.resources.animationFrames, 1, 'Focused owns exactly one rich-geometry frame');
  dispatchDocumentScroll(focused.harness);
  dispatchVisualViewport(focused.harness, 'scroll');
  dispatchVisualViewport(focused.harness, 'resize');
  focused.harness.advance(16);
  assertSafeRichResizePreserved(focused.harness, focusedSafe, 'safe Focused signals and owned frame');

  const focusedCardRect = focused.harness.shadow().querySelector('.skopeo-focused-card').getBoundingClientRect();
  focused.origin.setRect({
    left: focusedCardRect.left + focusedCardRect.width / 3,
    top: focusedCardRect.top + 24,
    width: 48,
    height: 40
  });
  focused.harness.advance(16);
  assert.strictEqual(focused.harness.shell._attention, 'anchored', 'unsafe Focused never remains Focused after the owned frame');
  assert.strictEqual(focused.harness.shell._activeSurfaceScope, focused.anchoredScope, 'unsafe Focused restores the exact suspended Anchored scope');
  assert.deepStrictEqual(Array.from(focused.harness.shell._surface.childNodes), focused.anchoredNodes, 'unsafe Focused restores exact Anchored node identities');
  assert.strictEqual(focused.harness.shadow().activeElement, focused.anchor, 'unsafe Focused follows existing back focus restoration');
  assert.deepStrictEqual(exactResourceSnapshot(focused.harness.shell), focused.anchoredResources, 'unsafe Focused returns to the Anchored resource plateau');
  assert.strictEqual(focused.harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, 'unsafe Focused keeps one root');
  assert.deepStrictEqual(focused.harness.calls.kill, [], 'safe Anchored rollback does not request terminal cleanup');
  assertZeroSnapshot(focused.harness.shell.destroy('focused-resize-invalidation'), 'Focused resize fixture destroys to exact zero');

  const gate = setupAnchoredFixture(api);
  assert.strictEqual(gate.harness.shell.render('focused', {}), true);
  const focusedScope = gate.harness.shell._activeSurfaceScope;
  const focusedNodes = Array.from(gate.harness.shell._surface.childNodes);
  const focusedResources = exactResourceSnapshot(gate.harness.shell);
  const focusedRect = gate.harness.shadow().querySelector('.skopeo-focused-card').getBoundingClientRect();
  const trigger = gate.harness.shadow().querySelector('[aria-label="Open consequence preview"]');
  trigger.focus({ preventScroll: true });
  assert.strictEqual(gate.harness.shell.render('interstitial', {}), true, 'Gate fixture opens safely');
  const gateSafe = captureRichState(gate.harness);
  assert.strictEqual(gateSafe.requiredControl, gate.origin, 'Gate certificate uses the current required host control');
  assert.strictEqual(gateSafe.resources.animationFrames, 1, 'Gate owns exactly one rich-geometry frame');
  gate.harness.advance(16);
  assertSafeRichResizePreserved(gate.harness, gateSafe, 'safe Gate owned frame');

  const gateRect = gate.harness.shadow().querySelector('.skopeo-gate').getBoundingClientRect();
  gate.origin.setRect({
    left: gateRect.left + 1,
    top: gateRect.top + 32,
    width: Math.max(1, focusedRect.left - gateRect.left - 12),
    height: 32
  });
  gate.harness.advance(16);
  assert.strictEqual(gate.harness.shell._attention, 'focused', 'unsafe Gate restores the nearest measured-safe Focused scope');
  assert.strictEqual(gate.harness.shell._activeSurfaceScope, focusedScope, 'unsafe Gate restores exact Focused scope identity');
  assert.deepStrictEqual(Array.from(gate.harness.shell._surface.childNodes), focusedNodes, 'unsafe Gate restores exact Focused nodes');
  assert.strictEqual(gate.harness.shadow().activeElement, trigger, 'Gate rollback restores the existing trigger focus target');
  assert.deepStrictEqual(exactResourceSnapshot(gate.harness.shell), focusedResources, 'Gate rollback returns to the Focused resource plateau');
  assert.strictEqual(gate.harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, 'Gate rollback keeps one root');
  assert.deepStrictEqual(gate.harness.calls.kill, [], 'safe Focused rollback does not request terminal cleanup');

  gate.origin.setRect({ left: 16, top: 696, width: 120, height: 40 });
  assert.strictEqual(gate.harness.shell.render('interstitial', {}), true, 'Gate reopens after the obstruction moves away');
  const bothUnsafeRect = gate.harness.shadow().querySelector('.skopeo-gate').getBoundingClientRect();
  gate.origin.setRect({
    left: bothUnsafeRect.left + bothUnsafeRect.width / 3,
    top: bothUnsafeRect.top + 24,
    width: 48,
    height: 40
  });
  gate.harness.advance(16);
  assert.strictEqual(gate.harness.shell._attention, 'anchored', 'Gate invalidation continues through an unsafe restored Focused scope');
  assert.strictEqual(gate.harness.shell._activeSurfaceScope, gate.anchoredScope, 'two-level unwind restores exact Anchored scope identity');
  assert.deepStrictEqual(Array.from(gate.harness.shell._surface.childNodes), gate.anchoredNodes, 'two-level unwind restores exact Anchored nodes');
  assert.strictEqual(gate.harness.shadow().activeElement, gate.anchor, 'two-level unwind restores the Anchored trigger focus target');
  assert.deepStrictEqual(exactResourceSnapshot(gate.harness.shell), gate.anchoredResources, 'two-level unwind returns to the Anchored resource plateau');
  assert.deepStrictEqual(gate.harness.calls.kill, [], 'bounded safe two-level unwind does not request cleanup');
  assertZeroSnapshot(gate.harness.shell.destroy('gate-resize-invalidation'), 'Gate resize fixture destroys to exact zero');

  const terminal = setupAnchoredFixture(api);
  assert.strictEqual(terminal.harness.shell.render('focused', {}), true);
  const terminalScope = terminal.harness.shell._activeSurfaceScope;
  const terminalResources = exactResourceSnapshot(terminal.harness.shell);
  terminal.origin.setRect({
    left: 0,
    top: 0,
    width: terminal.harness.window.innerWidth,
    height: terminal.harness.window.innerHeight
  });
  dispatchResize(terminal.harness);
  assert.strictEqual(terminal.harness.calls.kill.length, 1, 'no Ambient placement requests exactly one terminal cleanup');
  dispatchDocumentScroll(terminal.harness);
  dispatchVisualViewport(terminal.harness, 'scroll');
  dispatchVisualViewport(terminal.harness, 'resize');
  dispatchResize(terminal.harness);
  terminal.harness.advance(16);
  assert.strictEqual(terminal.harness.calls.kill.length, 1, 'unsafe-layout cleanup is one-shot for the shell generation');
  assert.deepStrictEqual(terminal.harness.calls.kill[0], {
    generation: terminal.harness.shell.generation,
    reason: 'unsafe-layout',
    state: 'focused'
  }, 'terminal cleanup carries generation, unsafe-layout reason, and current attention');
  assert.strictEqual(terminal.harness.shell._activeSurfaceScope, terminalScope, 'terminal request does not rebuild the current scope');
  const terminalAfter = exactResourceSnapshot(terminal.harness.shell);
  assert.deepStrictEqual(
    Object.assign({}, terminalAfter, { animationFrames: terminalResources.animationFrames }),
    terminalResources,
    'terminal request changes no resource except releasing its rich-geometry frame'
  );
  assert.strictEqual(terminalAfter.animationFrames, 0, 'terminal request releases the rich-geometry frame');
  assertZeroSnapshot(terminal.harness.shell.destroy('rich-resize-terminal'), 'terminal resize fixture destroys to exact zero');

  const rail = setupAnchoredFixture(api);
  const railBefore = exactResourceSnapshot(rail.harness.shell);
  rail.harness.addHostControl({ left: 768, top: 16, width: 240, height: 40 }, { id: 'resize-placement-blocker' });
  dispatchResize(rail.harness);
  const railNode = rail.harness.shadow().querySelector('[data-skopeo-primitive="rail"]');
  assert.strictEqual(railNode.style.left, '16px', 'Anchored resize applies the fresh left rail placement without a lens');
  assert.strictEqual(railNode.style.right, '', 'Anchored resize clears the stale right rail placement');
  assert.deepStrictEqual(exactResourceSnapshot(rail.harness.shell), railBefore, 'Anchored placement update grows no resource category');
  assertZeroSnapshot(rail.harness.shell.destroy('anchored-rail-resize'), 'Anchored rail fixture destroys to exact zero');
}

function testGeometryInvalidationListenerContract(api) {
  const signalCases = [
    ['document capture scroll', dispatchDocumentScroll],
    ['visualViewport scroll', harness => dispatchVisualViewport(harness, 'scroll')],
    ['visualViewport resize', harness => dispatchVisualViewport(harness, 'resize')]
  ];

  for (const [label, dispatch] of signalCases) {
    const fixture = setupAnchoredFixture(api);
    const resizeEntries = fixture.harness.window._listeners.get('resize') || [];
    const documentScrollEntries = fixture.harness.document._listeners.get('scroll') || [];
    const viewportScrollEntries = fixture.harness.window.visualViewport._listeners.get('scroll') || [];
    const viewportResizeEntries = fixture.harness.window.visualViewport._listeners.get('resize') || [];
    assert.strictEqual(resizeEntries.length, 1, label + ' owns one window resize listener');
    assert.strictEqual(documentScrollEntries.length, 1, label + ' owns one document scroll listener');
    assert.strictEqual(viewportScrollEntries.length, 1, label + ' owns one visualViewport scroll listener');
    assert.strictEqual(viewportResizeEntries.length, 1, label + ' owns one visualViewport resize listener');
    assert.strictEqual(normalizeCapture(documentScrollEntries[0].options), true, label + ' registers document scroll in capture');
    const callback = resizeEntries[0].listener;
    assert.strictEqual(documentScrollEntries[0].listener, callback, label + ' shares the stable session invalidation callback');
    assert.strictEqual(viewportScrollEntries[0].listener, callback, label + ' shares the stable viewport scroll callback');
    assert.strictEqual(viewportResizeEntries[0].listener, callback, label + ' shares the stable viewport resize callback');

    assert.strictEqual(fixture.harness.shell.render('focused', {}), true, label + ' fixture enters Focused');
    const card = fixture.harness.shadow().querySelector('.skopeo-focused-card').getBoundingClientRect();
    fixture.origin.setRect({ left: card.left + card.width / 3, top: card.top + 24, width: 48, height: 40 });
    dispatch(fixture.harness);
    assert.strictEqual(fixture.harness.shell._attention, 'anchored', label + ' synchronously invalidates unsafe rich geometry');
    assertZeroSnapshot(fixture.harness.shell.destroy('geometry-signal-' + label), label + ' destroys to exact zero');
    assert.strictEqual(fixture.harness.window.listenerCount('resize'), 0, label + ' removes the exact window listener');
    assert.strictEqual(fixture.harness.document.listenerCount('scroll'), 0, label + ' removes the exact document listener');
    assert.strictEqual(fixture.harness.window.visualViewport.listenerCount(), 0, label + ' removes both exact viewport listeners');
  }
}

function addRightPlacementBlocker(harness, id) {
  const placement = harness.shell._currentPlacement;
  assert.ok(placement && placement.corner === 'top-right', id + ' begins with the right-side placement');
  return harness.addHostControl({
    left: placement.rect.left,
    top: placement.rect.top,
    width: placement.rect.width,
    height: placement.rect.height
  }, { id });
}

function assertCurrentLeftPlacement(harness, blocker, label) {
  const placement = harness.shell._currentPlacement;
  assert.ok(placement && placement.corner === 'top-left', label + ' records the current left-side placement');
  assert.strictEqual(
    rectsIntersect(placement.rect, blocker.getBoundingClientRect(), 8),
    false,
    label + ' keeps the current placement certificate clear of the blocker by 8px'
  );
}

function assertRestoredAnchoredPlacement(fixture, blocker, label) {
  const harness = fixture.harness;
  const rail = harness.shadow().querySelector('[data-skopeo-primitive="rail"]');
  assert.strictEqual(harness.shell._attention, 'anchored', label + ' restores Anchored');
  assert.strictEqual(harness.shell._activeSurfaceScope, fixture.anchoredScope, label + ' restores exact Anchored scope identity');
  assert.deepStrictEqual(Array.from(harness.shell._surface.childNodes), fixture.anchoredNodes, label + ' restores exact Anchored nodes');
  assert.strictEqual(harness.shadow().activeElement, fixture.anchor, label + ' restores the declared Anchored focus target');
  assert.strictEqual(rail.style.left, '16px', label + ' applies the current left rail placement before exposure');
  assert.strictEqual(rail.style.right, '', label + ' clears the suspended stale right rail placement');
  assertCurrentLeftPlacement(harness, blocker, label);
  assert.strictEqual(harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, label + ' retains one root');
  assert.strictEqual(exactResourceSnapshot(harness.shell).animationFrames, 0, label + ' releases the rich-geometry frame');
  assert.deepStrictEqual(exactResourceSnapshot(harness.shell), fixture.anchoredResources, label + ' returns to the Anchored resource plateau');
}

function testSuspendedPlacementRestoration(api) {
  const focused = setupAnchoredFixture(api);
  assert.strictEqual(
    focused.harness.shadow().querySelector('[data-skopeo-primitive="rail"]').style.right,
    '16px',
    'Focused placement fixture suspends a right-side Anchored rail'
  );
  assert.strictEqual(focused.harness.shell.render('focused', {}), true, 'Focused placement fixture opens');
  const focusedState = captureRichState(focused.harness);
  const focusedBlocker = addRightPlacementBlocker(focused.harness, 'focused-placement-blocker');
  dispatchResize(focused.harness);
  assertSafeRichResizePreserved(focused.harness, focusedState, 'safe Focused placement refresh');
  assertCurrentLeftPlacement(focused.harness, focusedBlocker, 'safe Focused placement refresh');
  assert.strictEqual(focused.harness.shell.back(), true, 'Focused requires one ordinary Back to restore Anchored');
  assertRestoredAnchoredPlacement(focused, focusedBlocker, 'Focused Back');
  assert.strictEqual(
    focused.harness.shadow().querySelector('[aria-live="polite"]').textContent,
    focusedState.liveText,
    'Focused Back preserves the existing live-region copy'
  );
  assertZeroSnapshot(focused.harness.shell.destroy('focused-placement-restoration'), 'Focused placement fixture destroys to exact zero');

  const gate = setupAnchoredFixture(api);
  assert.strictEqual(gate.harness.shell.render('focused', {}), true, 'Gate placement fixture enters Focused');
  const focusedScope = gate.harness.shell._activeSurfaceScope;
  const focusedNodes = Array.from(gate.harness.shell._surface.childNodes);
  const focusedResources = exactResourceSnapshot(gate.harness.shell);
  const trigger = gate.harness.shadow().querySelector('[aria-label="Open consequence preview"]');
  trigger.focus({ preventScroll: true });
  assert.strictEqual(gate.harness.shell.render('interstitial', {}), true, 'Gate placement fixture opens');
  const gateState = captureRichState(gate.harness);
  const gateBlocker = addRightPlacementBlocker(gate.harness, 'gate-placement-blocker');
  dispatchResize(gate.harness);
  assertSafeRichResizePreserved(gate.harness, gateState, 'safe Gate placement refresh');
  assertCurrentLeftPlacement(gate.harness, gateBlocker, 'safe Gate placement refresh');

  assert.strictEqual(gate.harness.shell.back(), true, 'Gate requires one ordinary Back to restore Focused');
  assert.strictEqual(gate.harness.shell._attention, 'focused', 'Gate Back restores Focused');
  assert.strictEqual(gate.harness.shell._activeSurfaceScope, focusedScope, 'Gate Back restores exact Focused scope identity');
  assert.deepStrictEqual(Array.from(gate.harness.shell._surface.childNodes), focusedNodes, 'Gate Back restores exact Focused nodes');
  assert.strictEqual(gate.harness.shadow().activeElement, trigger, 'Gate Back restores the declared Focused trigger');
  assert.deepStrictEqual(exactResourceSnapshot(gate.harness.shell), focusedResources, 'Gate Back returns to the Focused resource plateau');
  assert.strictEqual(gate.harness.document.querySelectorAll(ROOT_SELECTOR).length, 1, 'Gate Back retains one root');
  assertCurrentLeftPlacement(gate.harness, gateBlocker, 'Gate Back');

  assert.strictEqual(gate.harness.shell.back(), true, 'restored Focused requires one ordinary Back to restore Anchored');
  assertRestoredAnchoredPlacement(gate, gateBlocker, 'Gate then Focused Back');
  assert.strictEqual(
    gate.harness.shadow().querySelector('[aria-live="polite"]').textContent,
    gateState.liveText,
    'Gate then Focused Back preserves the existing live-region copy'
  );
  assertZeroSnapshot(gate.harness.shell.destroy('gate-placement-restoration'), 'Gate placement fixture destroys to exact zero');
}

function phase53Mount(api, options = {}) {
  const harness = createHarness(api, options);
  const prepared = harness.shell.prepareAmbient();
  assert.ok(prepared, 'Phase 53 fixture prepares the inherited Ambient shell');
  assert.strictEqual(harness.shell.mountAmbient(prepared), true, 'Phase 53 fixture mounts the inherited Ambient shell');
  return harness;
}

function phase53Mark(shadow) {
  return shadow.querySelector('.skopeo-semantic-anchor');
}

function assertNoAnchorDependentNodes(shadow, label) {
  assert.strictEqual(phase53Mark(shadow), null, label + ' removes the semantic mark');
  for (const selector of PHASE53_FORBIDDEN_SELECTORS) {
    assert.strictEqual(shadow.querySelector(selector), null, label + ' omits ' + selector);
  }
}

function assertNoHostileProjection(shadow, hostileValues, label) {
  const values = hostileValues.map(String);
  const visit = node => {
    if (!node) return;
    if (node.localName !== 'style') {
      for (const value of values) {
        assert.strictEqual(String(node.textContent || '').includes(value), false, label + ' keeps hostile data out of text nodes');
      }
    }
    for (const attribute of node.attributes || []) {
      for (const value of values) {
        assert.strictEqual(String(attribute.value).includes(value), false, label + ' keeps hostile data out of DOM/ARIA attributes');
      }
    }
    for (const child of node.childNodes || []) visit(child);
  };
  visit(shadow);
}

function markRect(mark) {
  const left = Number.parseFloat(mark.style.left);
  const top = Number.parseFloat(mark.style.top);
  const width = Number.parseFloat(mark.style.width);
  const height = Number.parseFloat(mark.style.height);
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function assertProjectionTransitionPreservesHost(harness, operation, label) {
  const before = snapshotHostState(harness.document, harness.window);
  const result = operation();
  assert.deepStrictEqual(
    snapshotHostState(harness.document, harness.window),
    before,
    label + ' preserves host attributes, style, accessibility, focus, and scroll'
  );
  return result;
}

function testPhase53MethodSurface(api) {
  const harness = phase53Mount(api);
  for (const method of ['projectContext', 'commitSemanticAnchor', 'withdrawSemanticAnchor', 'getProjectionSnapshot']) {
    assert.strictEqual(typeof harness.shell[method], 'function', 'Phase 53 shell exposes ' + method);
  }
  harness.shell.destroy('phase53-method-surface');
}

function testPhase53ClosedContextProjection(api) {
  const harness = phase53Mount(api);
  const shadow = harness.shadow();
  const label = shadow.querySelector('.skopeo-lens-label');
  const live = shadow.querySelector('[aria-live="polite"]');
  const hostile = Object.freeze({
    name: 'Vendor <img src=x onerror=alert(1)>',
    label: 'Agreement aria-label takeover',
    selector: '#row[data-id="secret"]',
    html: '<script>globalThis.__phase53Pwned=true</script>',
    id: PHASE53_HOSTILE_ID
  });
  let epoch = 1;

  for (const contextKind of ['configured-corpus', 'vendor-folder', 'agreement-reading', 'focused-ask']) {
    const copy = PHASE53_COPY[contextKind];
    assert.strictEqual(assertProjectionTransitionPreservesHost(
      harness,
      () => harness.shell.projectContext({ status: 'recognized', contextKind, contextEpoch: epoch }),
      contextKind + ' projection'
    ), true);
    assert.strictEqual(label.textContent, copy.visible, contextKind + ' uses exact closed visible copy');
    harness.advance(500);
    assert.strictEqual(live.textContent, copy.announcement, contextKind + ' uses exact closed polite copy');
    assertNoAnchorDependentNodes(shadow, contextKind + ' without a requested target');
    epoch += 1;
  }

  const failQuietRows = [
    [{ status: 'uncertain', contextEpoch: epoch++, reason: 'context-evidence-conflict' }, PHASE53_COPY.uncertain],
    [{ status: 'unsupported', contextEpoch: epoch++, reason: 'origin-unsupported' }, PHASE53_COPY.unsupported],
    [{ status: 'no-target', contextEpoch: epoch++ }, PHASE53_COPY['no-target']]
  ];
  for (const [model, copy] of failQuietRows) {
    assert.strictEqual(assertProjectionTransitionPreservesHost(
      harness,
      () => harness.shell.projectContext(model),
      model.status + ' projection'
    ), true);
    assert.strictEqual(label.textContent, copy.visible, model.status + ' uses exact closed visible copy');
    harness.advance(500);
    assert.strictEqual(live.textContent, copy.announcement, model.status + ' uses exact closed polite copy');
    assertNoAnchorDependentNodes(shadow, model.status + ' fail quiet');
  }

  const beforeHostile = harness.shell.getProjectionSnapshot();
  assert.strictEqual(
    harness.shell.projectContext(Object.assign({
      status: 'recognized',
      contextKind: 'vendor-folder',
      contextEpoch: epoch
    }, hostile)),
    false,
    'caller-provided names, labels, selectors, HTML, and IDs fail the exact-own-key schema'
  );
  assert.deepStrictEqual(harness.shell.getProjectionSnapshot(), beforeHostile, 'rejected hostile context has no snapshot side effect');
  assertNoHostileProjection(shadow, Object.values(hostile), 'hostile context');
  assert.strictEqual(globalThis.__phase53Pwned, undefined, 'hostile context never executes');

  const snapshot = harness.shell.getProjectionSnapshot();
  assert.ok(Object.isFrozen(snapshot), 'projection snapshot is frozen');
  assert.strictEqual(snapshot.contextEpoch, epoch - 1, 'rejected context cannot advance projection authority');
  assert.strictEqual(harness.shell.projectContext({ status: 'uncertain', contextEpoch: 1, reason: 'context-evidence-conflict' }), false, 'older context epoch is stale');
  assert.strictEqual(label.textContent, PHASE53_COPY['no-target'].visible, 'stale context leaves visible projection unchanged');
  assertZeroSnapshot(harness.shell.destroy('phase53-context'), 'closed context fixture destroys to exact eleven-key zero');
}

function expectedPhase53Candidate(target, name) {
  const candidates = {
    'top-right': { left: target.right + 8, top: target.top - 16 },
    'top-left': { left: target.left - 16, top: target.top - 16 },
    'bottom-right': { left: target.right + 8, top: target.bottom + 8 },
    'bottom-left': { left: target.left - 16, top: target.bottom + 8 }
  };
  return Object.assign({ width: 8, height: 8 }, candidates[name]);
}

function blockCandidate(harness, rect, id) {
  return harness.addHostControl({ left: rect.left, top: rect.top, width: 8, height: 8 }, { id });
}

function testPhase53SemanticMarkGeometry(api) {
  const target = Object.freeze({ left: 160, top: 160, width: 80, height: 40, right: 240, bottom: 200 });
  const order = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];

  for (let index = 0; index < order.length; index += 1) {
    const harness = phase53Mount(api);
    const shadow = harness.shadow();
    assert.strictEqual(harness.shell.projectContext({
      status: 'recognized', contextKind: 'agreement-reading', contextEpoch: 1
    }), true);
    for (let blockedIndex = 0; blockedIndex < index; blockedIndex += 1) {
      blockCandidate(harness, expectedPhase53Candidate(target, order[blockedIndex]), 'candidate-blocker-' + blockedIndex);
    }
    const before = snapshotHostState(harness.document, harness.window);
    assert.strictEqual(harness.shell.commitSemanticAnchor({
      generation: harness.shell.generation,
      contextEpoch: 1,
      semanticIdentity: { kind: 'docs-document', id: 'document-1' },
      bindingEpoch: 1,
      targetRect: target
    }), true, order[index] + ' candidate commits');
    assert.deepStrictEqual(snapshotHostState(harness.document, harness.window), before, order[index] + ' commit preserves host state');
    const mark = phase53Mark(shadow);
    assert.ok(mark, order[index] + ' creates one semantic mark');
    assert.strictEqual(shadow.querySelectorAll('.skopeo-semantic-anchor').length, 1, 'one mark maximum');
    assert.strictEqual(mark.getAttribute('data-skopeo-primitive'), 'anchor');
    assert.strictEqual(mark.getAttribute('aria-hidden'), 'true');
    assert.strictEqual(mark.getAttribute('tabindex'), null);
    assert.strictEqual(mark.getAttribute('role'), null);
    assert.strictEqual(mark.style.pointerEvents, 'none');
    assert.deepStrictEqual(markRect(mark), Object.assign(expectedPhase53Candidate(target, order[index]), {
      right: expectedPhase53Candidate(target, order[index]).left + 8,
      bottom: expectedPhase53Candidate(target, order[index]).top + 8
    }), order[index] + ' uses exact 8px mark geometry and clearance');
    assert.strictEqual(mark.getAttribute('data-placement-corner'), order[index], 'candidate order is observable without identity data');
    assertNoHostileProjection(shadow, ['document-1'], 'semantic identity privacy');
    assert.strictEqual(harness.shadow().querySelector('.skopeo-ambient').getAttribute('aria-label'), 'Skopeo anchored HUD');
    assertZeroSnapshot(harness.shell.destroy('phase53-candidate-' + order[index]), order[index] + ' fixture destroys to zero');
  }

  const unsafe = phase53Mount(api);
  unsafe.shell.projectContext({ status: 'recognized', contextKind: 'agreement-reading', contextEpoch: 1 });
  for (const name of order) blockCandidate(unsafe, expectedPhase53Candidate(target, name), 'unsafe-' + name);
  const live = unsafe.shadow().querySelector('[aria-live="polite"]');
  const beforeUnsafe = snapshotHostState(unsafe.document, unsafe.window);
  assert.strictEqual(unsafe.shell.commitSemanticAnchor({
    generation: unsafe.shell.generation,
    contextEpoch: 1,
    semanticIdentity: { kind: 'docs-document', id: 'document-unsafe' },
    bindingEpoch: 1,
    targetRect: target
  }), false, 'four unsafe candidates render no mark');
  assert.deepStrictEqual(snapshotHostState(unsafe.document, unsafe.window), beforeUnsafe, 'unsafe mark attempt preserves host state');
  assertNoAnchorDependentNodes(unsafe.shadow(), 'unsafe candidate set');
  assert.strictEqual(unsafe.shadow().querySelector('.skopeo-lens-label').textContent, PHASE53_COPY.withdrawn.visible);
  unsafe.advance(500);
  assert.strictEqual(live.textContent, PHASE53_COPY.withdrawn.announcement);
  assertZeroSnapshot(unsafe.shell.destroy('phase53-unsafe-candidates'), 'unsafe candidate fixture destroys to zero');

  const inset = phase53Mount(api, { width: 420, height: 700 });
  inset.shell.projectContext({ status: 'recognized', contextKind: 'vendor-folder', contextEpoch: 1 });
  assert.strictEqual(inset.shell.commitSemanticAnchor({
    generation: inset.shell.generation,
    contextEpoch: 1,
    semanticIdentity: 'narrow-target',
    bindingEpoch: 1,
    targetRect: { left: 16, top: 100, width: 388, height: 40 }
  }), false, '420px/200%-equivalent geometry rejects marks outside the 16px inset');
  assertNoAnchorDependentNodes(inset.shadow(), 'narrow unsafe inset');
  assertZeroSnapshot(inset.shell.destroy('phase53-narrow'), 'narrow fixture destroys to zero');

  const scrollbar = phase53Mount(api, { width: 1024, height: 768, clientWidth: 1000 });
  scrollbar.shell.projectContext({ status: 'recognized', contextKind: 'vendor-folder', contextEpoch: 1 });
  assert.strictEqual(scrollbar.shell.commitSemanticAnchor({
    generation: scrollbar.shell.generation,
    contextEpoch: 1,
    semanticIdentity: 'scrollbar-target',
    bindingEpoch: 1,
    targetRect: { left: 16, top: 200, width: 976, height: 24 }
  }), false, 'scrollbar-zone conflicts render no mark');
  assertNoAnchorDependentNodes(scrollbar.shadow(), 'scrollbar conflict');
  assertZeroSnapshot(scrollbar.shell.destroy('phase53-scrollbar'), 'scrollbar fixture destroys to zero');

  const invalidated = phase53Mount(api);
  invalidated.shell.projectContext({ status: 'recognized', contextKind: 'agreement-reading', contextEpoch: 1 });
  assert.strictEqual(invalidated.shell.commitSemanticAnchor({
    generation: invalidated.shell.generation,
    contextEpoch: 1,
    semanticIdentity: { kind: 'docs-document', id: 'invalidated-target' },
    bindingEpoch: 1,
    targetRect: target
  }), true);
  const invalidatedMark = phase53Mark(invalidated.shadow());
  assert.strictEqual(invalidated.shell.commitSemanticAnchor({
    generation: invalidated.shell.generation,
    contextEpoch: 1,
    semanticIdentity: { kind: 'docs-document', id: 'invalidated-target' },
    bindingEpoch: 2,
    targetRect: { left: 160, top: 160, width: 0, height: 40 }
  }), false, 'nonfinite or zero geometry fails closed');
  assert.strictEqual(invalidatedMark.isConnected, false, 'invalid current geometry removes stale mark synchronously');
  assertNoAnchorDependentNodes(invalidated.shadow(), 'invalid current geometry');
  assertZeroSnapshot(invalidated.shell.destroy('phase53-invalid-geometry'), 'invalid geometry fixture destroys to zero');
}

function testPhase53AnchorAuthorityWithdrawalAndPlateau(api) {
  const harness = phase53Mount(api);
  const shadow = harness.shadow();
  const target = { left: 200, top: 200, width: 80, height: 40 };
  const hostileIdentity = PHASE53_HOSTILE_ID;
  assert.strictEqual(harness.shell.projectContext({
    status: 'recognized', contextKind: 'configured-corpus', contextEpoch: 4
  }), true);
  harness.advance(500);
  const ambientResources = exactResourceSnapshot(harness.shell);
  assert.deepStrictEqual(Object.keys(ambientResources), CATEGORIES, 'Phase 53 plateau retains exactly eleven resource keys');

  assert.strictEqual(assertProjectionTransitionPreservesHost(harness, () => harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: hostileIdentity },
    bindingEpoch: 7,
    targetRect: target
  }), 'fresh hostile-identity anchor'), true);
  const firstMark = phase53Mark(shadow);
  assert.ok(firstMark, 'fresh authority creates a mark');
  assert.deepStrictEqual(exactResourceSnapshot(harness.shell), ambientResources, 'anchor scope holds the Ambient eleven-key plateau');
  assert.strictEqual(harness.shell.getProjectionSnapshot().semanticIdentity.id, hostileIdentity, 'identity stays only in the frozen shell snapshot');
  assertNoHostileProjection(shadow, [hostileIdentity], 'hostile semantic identity');

  const liveBeforeMove = shadow.querySelector('[aria-live="polite"]').textContent;
  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: hostileIdentity },
    bindingEpoch: 7,
    targetRect: { left: 300, top: 260, width: 80, height: 40 }
  }), true, 'same identity/binding geometry update is current');
  assert.strictEqual(phase53Mark(shadow), firstMark, 'same-identity reposition mutates the existing node');
  assert.strictEqual(firstMark.style.transition.includes('left'), false, 'same-identity movement has no left interpolation');
  assert.strictEqual(firstMark.style.transition.includes('top'), false, 'same-identity movement has no top interpolation');
  assert.strictEqual(firstMark.style.transition.includes('transform'), false, 'same-identity movement has no transform interpolation');
  harness.advance(500);
  assert.strictEqual(shadow.querySelector('[aria-live="polite"]').textContent, liveBeforeMove, 'geometry churn produces no live announcement');

  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation + 1,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: 'wrong-generation' },
    bindingEpoch: 8,
    targetRect: target
  }), false, 'wrong generation is rejected');
  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 3,
    semanticIdentity: { kind: 'drive-file', id: 'stale-context' },
    bindingEpoch: 8,
    targetRect: target
  }), false, 'stale context epoch is rejected');
  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: 'stale-binding' },
    bindingEpoch: 6,
    targetRect: target
  }), false, 'regressed binding epoch is rejected');
  assert.strictEqual(phase53Mark(shadow), firstMark, 'stale authority cannot replace the live mark');

  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: 'replacement-identity' },
    bindingEpoch: 8,
    targetRect: target
  }), true, 'newer binding replaces the current semantic identity');
  const replacement = phase53Mark(shadow);
  assert.notStrictEqual(replacement, firstMark, 'second identity uses a fresh node');
  assert.strictEqual(firstMark.isConnected, false, 'replaced mark is removed synchronously');
  assert.strictEqual(shadow.querySelectorAll('.skopeo-semantic-anchor').length, 1, 'second mark replacement never overlaps two marks');

  const beforeWithdraw = snapshotHostState(harness.document, harness.window);
  assert.strictEqual(harness.shell.withdrawSemanticAnchor({
    contextEpoch: 4,
    bindingEpoch: 9,
    reason: 'geometry-unsafe'
  }), true, 'current withdrawal is applied');
  assert.deepStrictEqual(snapshotHostState(harness.document, harness.window), beforeWithdraw, 'withdrawal preserves host state');
  assert.strictEqual(replacement.isConnected, false, 'withdrawal removes the mark before live cadence drains');
  assertNoAnchorDependentNodes(shadow, 'synchronous withdrawal');
  assert.strictEqual(shadow.querySelector('.skopeo-lens-label').textContent, PHASE53_COPY.withdrawn.visible);
  assert.strictEqual(shadow.querySelector('[aria-live="polite"]').textContent, liveBeforeMove, 'withdrawal DOM removal precedes polite announcement delivery');
  harness.advance(500);
  assert.strictEqual(shadow.querySelector('[aria-live="polite"]').textContent, PHASE53_COPY.withdrawn.announcement);
  assert.strictEqual(shadow.querySelector('.skopeo-ambient').getAttribute('aria-label'), 'Skopeo ambient HUD');
  assert.deepStrictEqual(exactResourceSnapshot(harness.shell), ambientResources, 'withdrawal returns to the exact Ambient resource plateau');
  assert.strictEqual(harness.shell.withdrawSemanticAnchor({
    contextEpoch: 4,
    bindingEpoch: 8,
    reason: 'geometry-unsafe'
  }), false, 'older withdrawal authority cannot change the projection');

  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: 'resurrection-attempt' },
    bindingEpoch: 9,
    targetRect: target
  }), false, 'withdrawal invalidates equal binding authority before removing the node');
  assertNoAnchorDependentNodes(shadow, 'equal-epoch resurrection attempt');

  assert.strictEqual(harness.shell.commitSemanticAnchor({
    generation: harness.shell.generation,
    contextEpoch: 4,
    semanticIdentity: { kind: 'drive-file', id: 'fresh-rebind' },
    bindingEpoch: 10,
    targetRect: target
  }), true, 'newer registry binding can rebind inside the same recognized context');
  assert.strictEqual(shadow.querySelector('.skopeo-lens-label').textContent, PHASE53_COPY['configured-corpus'].visible, 'successful rebind restores closed recognized copy');
  assert.strictEqual(shadow.querySelectorAll('.skopeo-semantic-anchor').length, 1, 'fresh rebind still exposes one mark maximum');

  assert.strictEqual(harness.shell.projectContext({
    status: 'uncertain', contextEpoch: 5, reason: 'context-evidence-conflict'
  }), true, 'context uncertainty advances authority');
  assertNoAnchorDependentNodes(shadow, 'context uncertainty');
  const beforeDestroy = snapshotHostState(harness.document, harness.window);
  assertZeroSnapshot(harness.shell.destroy('phase53-authority'), 'Phase 53 destroy returns all eleven categories to exact zero');
  assert.deepStrictEqual(snapshotHostState(harness.document, harness.window), beforeDestroy, 'Phase 53 destroy preserves host state');
  assertZeroSnapshot(harness.shell.destroy('phase53-authority-repeat'), 'repeated Phase 53 destroy remains exact zero');
  assert.strictEqual(harness.shell.projectContext({
    status: 'recognized', contextKind: 'configured-corpus', contextEpoch: 6
  }), false, 'destroyed shell cannot resurrect projection state');
}

function testPhase53SourceContract() {
  const sourcePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  for (const copy of Object.values(PHASE53_COPY).flatMap(row => [row.visible, row.announcement])) {
    assert.ok(source.includes(copy), 'production contains exact Phase 53 copy: ' + copy);
  }
  assert.ok(/\.skopeo-semantic-anchor\s*\{[^}]*width:\s*8px;[^}]*height:\s*8px;/s.test(source), 'semantic mark is exactly 8x8 in production CSS');
  const markRule = source.match(/\.skopeo-semantic-anchor\s*\{([^}]*)\}/s);
  assert.ok(markRule, 'semantic mark has a dedicated production CSS rule');
  assert.match(markRule[1], /pointer-events:\s*none;/, 'semantic mark is pointer-transparent in production CSS');
  assert.match(markRule[1], /transition:\s*opacity 120ms ease-out;/, 'fresh semantic mark entry is opacity-only for 120ms');
  assert.strictEqual(/transition:[^;]*(?:top|left|right|bottom|transform)/.test(markRule[1]), false, 'semantic mark CSS has no positional transition');
  assert.ok(/forced-colors:[^)]+\)[\s\S]*\.skopeo-semantic-anchor[\s\S]*Highlight/.test(source), 'forced colors retains the mark with Highlight');
  assert.ok(/prefers-reduced-motion:[^)]+\)[\s\S]*transition-duration:\s*0ms/.test(source), 'reduced motion sets fresh mark entry to 0ms');
}

function testSourceSafety() {
  const sourcePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.ok(/globalThis\.FSBSkopeoShell\s*=\s*api/.test(source), 'classic-script global export exists');
  assert.ok(/module\.exports\s*=\s*api/.test(source), 'CommonJS export exists');
  assert.strictEqual(/\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(source), false, 'production renderer has no HTML string sink');
  assert.strictEqual(/\beval\s*\(|new\s+Function\s*\(/.test(source), false, 'production renderer uses no dynamic code execution');
  assert.strictEqual(/https?:\/\//.test(source), false, 'shell introduces no external asset or dependency URL');
}

function testArgumentCollectorSourceContract() {
  const sourcePath = path.resolve(__dirname, '..', 'extension', 'content', 'skopeo-shell.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  assert.match(source, /submit-arguments/, 'one shell emits the closed submit-arguments event');
  assert.match(source, /cancel-arguments/, 'Escape and cancel emit the closed cancel-arguments event');
  assert.match(source, /collectionEpoch/, 'collector events remain bound to their collection epoch');
  assert.match(source, /data-skopeo-argument-form/, 'collector lives inside the existing Focused shell');
  assert.match(source, /autocomplete/, 'collector applies explicit safe autocomplete behavior');
  assert.match(source, /submitted|consumed|disable/i,
    'double submit is consumed before an asynchronous action can begin');
  assert.strictEqual(/\.placeholder\s*=|setAttribute\(\s*['"]placeholder/.test(source), false,
    'schema default/example text never becomes a placeholder');
}

function runProductionContract(api) {
  testExports(api);
  testPhase53MethodSurface(api);
  testPrepareCommitAndTopLayer(api);
  testStalePlacementAndFallback(api);
  testPrepareCommitGeometryRevalidation(api);
  testPlacementAndCollision(api);
  testAmbientFixtureAndTextSafety(api);
  testPointerAndHostIntegrity(api);
  testHostCascadeNegativeControl(api);
  testHideFailureStillReleases(api);
  testAtomicRicherCollisionRollback(api);
  testAtomicRicherCollisionRollback(api, { width: 420, height: 700 });
  testAttentionResourcePlateaus(api);
  testRichGeometryRevalidation(api);
  testGeometryInvalidationListenerContract(api);
  testSuspendedPlacementRestoration(api);
  testPhase53ClosedContextProjection(api);
  testPhase53SemanticMarkGeometry(api);
  testPhase53AnchorAuthorityWithdrawalAndPlateau(api);
  testPhase53SourceContract();
  testSourceSafety();
  testArgumentCollectorSourceContract();
  console.log('skopeo-shell-contract: PASS');
}

module.exports = {
  HOSTILE_TEXT,
  PHASE53_COPY,
  MockDocument,
  MockElement,
  MockWindow,
  createEvent,
  createHarness,
  assertImportantHostRule,
  snapshotHostState,
  runHarnessSelfTest,
  runProductionContract
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    runHarnessSelfTest();
  } else {
    runProductionContract(loadProductionApi());
  }
}
