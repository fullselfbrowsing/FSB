'use strict';

// Stub element/document kit for the vm-loaded content-script slices that the
// Phase 68 fast-mode menu suite exercises (tests/jev-fast-menu.test.js).
//
// It is deliberately small and dependency-free (Node 20 safe). Every element's
// `value` property is a getter that records the read in `valueReads`, so a test
// can prove that code under test never touched a field's value.

const valueReads = [];
let creationOrder = 0;

function resetValueReads() {
  valueReads.length = 0;
}

function makeText(value) {
  const text = String(value);
  return {
    nodeType: 3,
    nodeName: '#text',
    parentElement: null,
    parentNode: null,
    childNodes: [],
    nodeValue: text,
    data: text,
    _order: ++creationOrder,
    get textContent() { return text; },
  };
}

function lowerAttrs(attrs) {
  const out = {};
  for (const key of Object.keys(attrs || {})) {
    const value = attrs[key];
    if (value === undefined || value === null || value === false) continue;
    out[String(key).toLowerCase()] = value === true ? '' : String(value);
  }
  return out;
}

function makeElement(spec = {}) {
  const tag = String(spec.tag || 'div').toUpperCase();
  const attrs = lowerAttrs(spec.attrs);
  if (spec.type !== undefined && spec.type !== null) attrs.type = String(spec.type);
  const style = Object.assign({ display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' }, spec.style || {});
  const rect = Object.assign({ left: 10, top: 10, width: 100, height: 20 }, spec.rect || {});
  let storedValue = spec.value === undefined ? '' : String(spec.value);
  let connected = spec.isConnected === undefined ? true : !!spec.isConnected;

  const el = {
    nodeType: 1,
    tagName: tag,
    nodeName: tag,
    childNodes: [],
    parentElement: null,
    parentNode: null,
    dataset: Object.assign({}, spec.dataset || {}),
    style,
    checked: !!spec.checked,
    indeterminate: !!spec.indeterminate,
    disabled: !!spec.disabled,
    labels: Array.isArray(spec.labels) ? spec.labels.slice() : undefined,
    _order: ++creationOrder,
    _formOverride: spec.form === undefined ? undefined : spec.form,

    getAttribute(name) {
      const key = String(name).toLowerCase();
      return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, String(name).toLowerCase());
    },
    setAttribute(name, value) {
      attrs[String(name).toLowerCase()] = String(value);
    },
    removeAttribute(name) {
      delete attrs[String(name).toLowerCase()];
    },
    getBoundingClientRect() {
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        x: rect.left,
        y: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      };
    },
    setRect(next) {
      Object.assign(rect, next || {});
    },
    compareDocumentPosition(other) {
      if (!other || other === el) return 0;
      // 4 = DOCUMENT_POSITION_FOLLOWING, 2 = DOCUMENT_POSITION_PRECEDING
      return other._order > el._order ? 4 : 2;
    },
    appendChild(child) {
      attach(el, child);
      return child;
    },
    // closest() supports a bare tag name, '#id', '[attr]' and '[attr="v"]'.
    closest(selector) {
      for (let node = el; node; node = node.parentElement) {
        if (matchesSimple(node, selector)) return node;
      }
      return null;
    },
    focus() {},
    dispatchEvent() { return true; },

    get isConnected() { return connected; },
    set isConnected(next) { connected = !!next; },
    get id() { return attrs.id || ''; },
    get name() { return attrs.name || ''; },
    get className() { return attrs.class || ''; },
    get placeholder() { return attrs.placeholder || ''; },
    get href() { return attrs.href || ''; },
    get alt() { return attrs.alt || ''; },
    get title() { return attrs.title || ''; },
    get hidden() { return Object.prototype.hasOwnProperty.call(attrs, 'hidden'); },
    get multiple() { return Object.prototype.hasOwnProperty.call(attrs, 'multiple'); },
    get type() {
      if (tag === 'INPUT') return (attrs.type || 'text').toLowerCase();
      if (tag === 'BUTTON') return (attrs.type || 'submit').toLowerCase();
      if (tag === 'SELECT') return el.multiple ? 'select-multiple' : 'select-one';
      if (tag === 'TEXTAREA') return 'textarea';
      return attrs.type || '';
    },
    get children() { return el.childNodes.filter((n) => n.nodeType === 1); },
    get firstElementChild() { return el.children[0] || null; },
    get textContent() {
      let out = '';
      for (const child of el.childNodes) out += child.textContent;
      return out;
    },
    get isContentEditable() {
      for (let node = el; node; node = node.parentElement) {
        const v = node.getAttribute('contenteditable');
        if (v !== null) return v !== 'false';
      }
      return false;
    },
    get form() {
      if (el._formOverride !== undefined) return el._formOverride;
      if (!FORM_ASSOCIATED.includes(tag)) return undefined;
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (node.tagName === 'FORM') return node;
      }
      return null;
    },
    get elements() {
      if (tag !== 'FORM') return undefined;
      const out = [];
      for (const child of el.childNodes) {
        walk(child, (node) => {
          if (node.nodeType === 1 && FORM_ASSOCIATED.includes(node.tagName) && node.form === el) out.push(node);
        });
      }
      return out;
    },
    get value() {
      valueReads.push({ tag, id: attrs.id || null, name: attrs.name || null });
      return storedValue;
    },
    set value(next) {
      storedValue = String(next);
    },
  };

  if (spec.text !== undefined && spec.text !== null) attach(el, makeText(spec.text));
  for (const child of spec.children || []) {
    attach(el, typeof child === 'string' ? makeText(child) : child);
  }
  return el;
}

const FORM_ASSOCIATED = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'FIELDSET', 'OUTPUT', 'OBJECT'];

function matchesSimple(node, selector) {
  if (!node || node.nodeType !== 1 || typeof selector !== 'string') return false;
  const sel = selector.trim();
  if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
  const attr = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    if (!node.hasAttribute(attr[1])) return false;
    return attr[2] === undefined || node.getAttribute(attr[1]) === attr[2];
  }
  return node.tagName === sel.toUpperCase();
}

function attach(parent, child) {
  child.parentElement = parent;
  child.parentNode = parent;
  parent.childNodes.push(child);
}

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
}

function makeDocument(body, options = {}) {
  const root = body || makeElement({ tag: 'body' });
  let order = 0;
  walk(root, (node) => { node._order = ++order; });
  const selectorMap = options.selectorMap || {};
  // matchSelectors: selectors absent from the map are matched against the
  // live tree with the simple matcher (bare tag, '#id', '[attr]', '[attr="v"]'),
  // so a node moved or added after the document was built is still found.
  const matchSelectors = options.matchSelectors === true;
  const scrollHeight = options.scrollHeight === undefined ? 800 : options.scrollHeight;
  root.scrollHeight = scrollHeight;
  const lookup = (selector) => {
    if (Object.prototype.hasOwnProperty.call(selectorMap, selector)) return selectorMap[selector].slice();
    if (!matchSelectors) return [];
    const found = [];
    walk(root, (node) => {
      if (node.nodeType === 1 && matchesSimple(node, selector)) found.push(node);
    });
    return found;
  };
  const doc = {
    nodeType: 9,
    body: root,
    activeElement: null,
    title: options.title === undefined ? 'Stub page' : options.title,
    documentElement: { scrollHeight, clientHeight: options.clientHeight === undefined ? 800 : options.clientHeight },
    getElementById(id) {
      let found = null;
      walk(root, (node) => {
        if (!found && node.nodeType === 1 && node.getAttribute('id') === id) found = node;
      });
      return found;
    },
    querySelectorAll(selector) {
      return lookup(selector);
    },
    querySelector(selector) {
      const list = lookup(selector);
      return list.length ? list[0] : null;
    },
    renumber() {
      let next = 0;
      walk(root, (node) => { node._order = ++next; });
    },
  };
  return doc;
}

function makeWindow(options = {}) {
  const href = options.href || 'https://example.test/page';
  let hostname = '';
  try { hostname = new URL(href).hostname; } catch (_e) { hostname = ''; }
  const win = {
    innerWidth: options.innerWidth === undefined ? 1280 : options.innerWidth,
    innerHeight: options.innerHeight === undefined ? 800 : options.innerHeight,
    scrollX: 0,
    scrollY: options.scrollY === undefined ? 0 : options.scrollY,
    location: { href, hostname },
    getComputedStyle(el) {
      const s = (el && el.style) || {};
      return {
        display: s.display || 'block',
        visibility: s.visibility || 'visible',
        opacity: s.opacity === undefined ? '1' : String(s.opacity),
        pointerEvents: s.pointerEvents || 'auto',
      };
    },
  };
  win.top = options.top === undefined ? win : options.top;
  return win;
}

// A crypto stand-in whose bytes come from a seed and advance on every call,
// so two registries built from the same stub still get different nonces.
function cryptoStub(seedBytes) {
  const seed = Array.isArray(seedBytes) && seedBytes.length ? seedBytes.slice() : [0x12, 0x34, 0x56, 0x78];
  let cursor = 0;
  let calls = 0;
  return {
    get calls() { return calls; },
    getRandomValues(array) {
      calls++;
      for (let i = 0; i < array.length; i++) {
        array[i] = (seed[cursor % seed.length] + Math.floor(cursor / seed.length) * 37) & 0xff;
        cursor++;
      }
      return array;
    },
  };
}

module.exports = {
  makeElement,
  makeText,
  makeDocument,
  makeWindow,
  cryptoStub,
  valueReads,
  resetValueReads,
};
