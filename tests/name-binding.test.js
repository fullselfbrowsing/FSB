'use strict';

// Name binding: a selector "text=<visible name>" (and click's text parameter)
// as an element address.
//
// Loads the real content modules (utils.js, dom-state.js, selectors.js,
// accessibility.js, dom-analysis.js) and the executeAction target-resolution
// prelude from messaging.js into one vm context over a small stub DOM (the
// harness of tests/snapshot-ref-addressing.test.js, with text-node values,
// open shadow roots and URL added), then checks that:
//   - an exact unique name binds and the tool runs on that element's ref;
//   - words and the surrounding item bind ("Add to cart blue mug");
//   - an ambiguous name lists candidate refs that work, and runs nothing;
//   - a missing name runs nothing and lists the closest names;
//   - a control that can commit binds only by an exact name unique in the
//     whole document (hidden copies and open shadow roots counted);
//   - the role filter, the password / vault exclusions and ordinals hold;
//   - click's text parameter no longer picks the last match;
//   - the refusal text keeps its candidates through mapFSBError.
//
// Node 20 compatible; binds no port.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// ---------------------------------------------------------------------------
// Stub DOM. Selectors support comma lists of compounds built from tag, #id,
// .class, [attr], [attr="v"], [attr*="v"] and :not(<compound>); anything else
// throws, so an unexpected query fails loudly (callers that probe optional
// syntax catch it).

const VOID_TAGS = new Set(['input', 'img', 'br', 'hr']);

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function matchesCompound(node, compound) {
  let rest = compound.trim();
  if (!rest) throw new SyntaxError('empty selector');
  const tag = rest.match(/^[a-zA-Z][a-zA-Z0-9-]*/);
  if (tag) {
    if (node.tagName !== tag[0].toUpperCase()) return false;
    rest = rest.slice(tag[0].length);
  } else if (rest[0] === '*') {
    rest = rest.slice(1);
  }
  while (rest) {
    let m;
    if ((m = rest.match(/^#([\w-]+)/))) {
      if (node.getAttribute('id') !== m[1]) return false;
    } else if ((m = rest.match(/^\.([\w-]+)/))) {
      if (!(node.getAttribute('class') || '').split(/\s+/).includes(m[1])) return false;
    } else if ((m = rest.match(/^\[([\w-]+)(?:(\*?=)"([^"]*)")?\]/))) {
      const value = node.getAttribute(m[1]);
      if (value === null) return false;
      if (m[2] === '=' && value !== m[3]) return false;
      if (m[2] === '*=' && !value.includes(m[3])) return false;
    } else if ((m = rest.match(/^:not\((.+?)\)(?=$|[#.[:])/))) {
      if (matchesCompound(node, m[1])) return false;
    } else {
      throw new SyntaxError(`unsupported selector: ${compound}`);
    }
    rest = rest.slice(m[0].length);
  }
  return true;
}

function matchesList(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  return splitTopLevel(selector, ',').some((compound) => {
    if (/\s/.test(compound.replace(/"[^"]*"/g, ''))) throw new SyntaxError(`no combinators: ${compound}`);
    return matchesCompound(node, compound);
  });
}

function makeText(value) {
  return {
    nodeType: 3,
    parentNode: null,
    parentElement: null,
    childNodes: [],
    nodeValue: String(value),
    textContent: String(value),
  };
}

function descendants(root) {
  const out = [];
  (function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        out.push(child);
        walk(child);
      }
    }
  })(root);
  return out;
}

function makeElement(tagName, attrs = {}, children = []) {
  const attributes = new Map();
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) attributes.set(key.toLowerCase(), value === true ? '' : String(value));
  }
  let value = attributes.get('value') || '';
  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    nodeName: tagName.toUpperCase(),
    childNodes: [],
    parentNode: null,
    parentElement: null,
    shadowRoot: null,
    dataset: {},
    style: {},
    rect: { left: 10, top: 10, width: 120, height: 24 },
    clicks: 0,
    getAttribute(name) {
      const key = String(name).toLowerCase();
      return attributes.has(key) ? attributes.get(key) : null;
    },
    hasAttribute(name) { return attributes.has(String(name).toLowerCase()); },
    setAttribute(name, next) { attributes.set(String(name).toLowerCase(), String(next)); },
    removeAttribute(name) { attributes.delete(String(name).toLowerCase()); },
    getBoundingClientRect() {
      const r = el.rect;
      return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
    },
    appendChild(child) {
      if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
      child.parentNode = el;
      child.parentElement = el;
      el.childNodes.push(child);
      return child;
    },
    remove() {
      if (!el.parentNode) return;
      el.parentNode.childNodes.splice(el.parentNode.childNodes.indexOf(el), 1);
      el.parentNode = null;
      el.parentElement = null;
    },
    contains(other) {
      for (let node = other; node; node = node.parentNode) if (node === el) return true;
      return false;
    },
    matches(selector) { return matchesList(el, selector); },
    closest(selector) {
      for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
        if (matchesList(node, selector)) return node;
      }
      return null;
    },
    querySelectorAll(selector) { return descendants(el).filter((node) => matchesList(node, selector)); },
    querySelector(selector) { return el.querySelectorAll(selector)[0] || null; },
    getRootNode() {
      let node = el;
      while (node.parentNode) node = node.parentNode;
      return node;
    },
    focus() { if (el.ownerDocument) el.ownerDocument.activeElement = el; },
    click() { el.clicks++; },
    get isConnected() {
      const root = el.getRootNode();
      return !!el.ownerDocument && (root === el.ownerDocument || (root.host ? root.host.isConnected : false));
    },
    get id() { return el.getAttribute('id') || ''; },
    get name() { return el.getAttribute('name') || ''; },
    get className() { return el.getAttribute('class') || ''; },
    get placeholder() { return el.getAttribute('placeholder') || ''; },
    get href() { return el.getAttribute('href') || ''; },
    get type() {
      if (el.tagName === 'INPUT') return (el.getAttribute('type') || 'text').toLowerCase();
      if (el.tagName === 'BUTTON') return (el.getAttribute('type') || 'submit').toLowerCase();
      return el.getAttribute('type') || '';
    },
    get value() { return value; },
    set value(next) { value = String(next); },
    get disabled() { return el.hasAttribute('disabled'); },
    get required() { return el.hasAttribute('required'); },
    get checked() { return el.hasAttribute('checked'); },
    get form() { return el.parentElement ? el.parentElement.closest('form') : null; },
    get isContentEditable() { return el.getAttribute('contenteditable') === 'true'; },
    get children() { return el.childNodes.filter((node) => node.nodeType === 1); },
    get firstElementChild() { return el.children[0] || null; },
    get previousElementSibling() {
      if (!el.parentNode) return null;
      const siblings = el.parentNode.childNodes.filter((node) => node.nodeType === 1);
      return siblings[siblings.indexOf(el) - 1] || null;
    },
    get textContent() { return el.childNodes.map((node) => node.textContent).join(''); },
    get innerText() { return el.textContent; },
  };
  for (const child of children) el.appendChild(typeof child === 'string' ? makeText(child) : child);
  if (VOID_TAGS.has(tagName.toLowerCase())) el.childNodes.length = 0;
  return el;
}

// An open shadow root: its children have no parentElement, like the real one.
function attachShadow(host, children) {
  const root = {
    nodeType: 11,
    host,
    mode: 'open',
    childNodes: [],
    parentNode: null,
    get children() { return root.childNodes.filter((node) => node.nodeType === 1); },
  };
  for (const child of children) {
    child.parentNode = root;
    child.parentElement = null;
    root.childNodes.push(child);
  }
  host.shadowRoot = root;
  return root;
}

function makeDocument() {
  const doc = {
    nodeType: 9,
    activeElement: null,
    title: 'Name binding fixture',
    documentElement: { scrollHeight: 800, scrollTop: 0, clientHeight: 800 },
    queries: [],
    querySelectorAll(selector) {
      doc.queries.push(selector);
      return descendants(doc.body).filter((node) => matchesList(node, selector));
    },
    querySelector(selector) {
      doc.queries.push(selector);
      return descendants(doc.body).find((node) => matchesList(node, selector)) || null;
    },
    getElementById(id) { return descendants(doc.body).find((node) => node.id === id) || null; },
  };
  const body = makeElement('body');
  body.parentNode = doc;
  doc.body = body;
  doc.childNodes = [body];
  return doc;
}

function adopt(doc, node) {
  node.ownerDocument = doc;
  for (const child of node.childNodes) if (child.nodeType === 1) adopt(doc, child);
  if (node.shadowRoot) for (const child of node.shadowRoot.childNodes) if (child.nodeType === 1) adopt(doc, child);
  return node;
}

// ---------------------------------------------------------------------------
// One content-script context per test.

const noop = () => {};
const SOURCES = {
  utils: read('extension/content/utils.js'),
  domState: read('extension/content/dom-state.js'),
  selectors: read('extension/content/selectors.js'),
  accessibility: read('extension/content/accessibility.js'),
  domAnalysis: read('extension/content/dom-analysis.js'),
  messaging: read('extension/content/messaging.js'),
  actions: read('extension/content/actions.js'),
};

const EXECUTE_CASE = "case 'executeAction':";
function executeActionPrelude() {
  const start = SOURCES.messaging.indexOf(EXECUTE_CASE);
  assert.ok(start > 0, 'executeAction case present');
  const body = start + EXECUTE_CASE.length;
  const stop = SOURCES.messaging.indexOf('if (FSB.tools[tool]) {', body);
  assert.ok(stop > body, 'tool handler guard present');
  return SOURCES.messaging.slice(body, stop);
}

function loadContentScripts() {
  const doc = makeDocument();
  const warnings = [];
  const logger = {
    log: noop, info: noop, error: noop, debug: noop,
    warn: (message, data) => warnings.push({ message, data }),
    logDOMOperation: noop, logTiming: noop, logComm: noop, logActionExecution: noop,
  };
  const FSB = { _modules: {}, logger, sessionId: 'test-session' };
  const win = {
    __FSB_SKIP_INIT__: false,
    FSB,
    innerWidth: 1280,
    innerHeight: 800,
    scrollX: 0,
    scrollY: 0,
    location: { href: 'https://shop.example.test/catalog', hostname: 'shop.example.test', pathname: '/catalog' },
  };
  win.top = win;
  const sandbox = {
    window: win,
    document: doc,
    console,
    URL,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    WeakRef,
    getComputedStyle: (el) => ({ display: el.style.display || 'block', visibility: el.style.visibility || 'visible', opacity: el.style.opacity || '1' }),
  };
  win.getComputedStyle = sandbox.getComputedStyle;
  vm.createContext(sandbox);
  for (const [name, source] of [
    ['utils.js', SOURCES.utils],
    ['dom-state.js', SOURCES.domState],
    ['selectors.js', SOURCES.selectors],
    ['accessibility.js', SOURCES.accessibility],
    ['dom-analysis.js', SOURCES.domAnalysis],
  ]) {
    vm.runInContext(source, sandbox, { filename: name });
  }
  FSB.generateSelectors = (el) => [{ selector: el.id ? `#${el.id}` : el.tagName.toLowerCase() }];
  FSB.viewportGlow = { show: noop, setState: noop };
  FSB.progressOverlay = { create: noop, update: noop, show: noop };

  const prelude = vm.runInContext(
    `(function (request, FSB, sendResponse, document, logger) {${executeActionPrelude()}\nreturn { continued: true, nameBinding };\n})`,
    sandbox,
    { filename: 'messaging.js#executeAction-prelude' }
  );

  const toolCalls = [];
  const lookup = (tool, params) => {
    toolCalls.push({ tool, selector: params.selector, text: params.text });
    return FSB.querySelectorWithShadow(params.selector);
  };
  FSB.tools = {
    click(params) {
      const target = lookup('click', params);
      if (!target) return { success: false, error: 'Element not found' };
      target.click();
      return { success: true, target };
    },
    type(params) {
      const target = lookup('type', params);
      if (!target) return { success: false, error: 'Element not found' };
      target.value = params.text;
      return { success: true, target };
    },
    toggleCheckbox(params) {
      const target = lookup('toggleCheckbox', params);
      return target ? { success: true, target } : { success: false, error: 'Element not found' };
    },
    getText(params) {
      const target = lookup('getText', params);
      return target ? { success: true, target, text: target.textContent } : { success: false, error: 'Element not found' };
    },
  };

  function execute(tool, params) {
    const responses = [];
    const request = { action: 'executeAction', tool, params, source: 'mcp-manual' };
    const outcome = prelude(request, FSB, (response) => responses.push(response), doc, logger);
    if (!outcome || outcome.continued !== true) return { refused: responses, params, result: null, bound: null };
    assert.equal(responses.length, 0, 'nothing answered before the tool');
    return { refused: null, params, result: FSB.tools[tool](params), bound: outcome.nameBinding };
  }

  const el = (tag, attrs, children) => makeElement(tag, attrs, children);
  const mount = (...nodes) => {
    for (const node of nodes) doc.body.appendChild(adopt(doc, node));
    return nodes;
  };
  return { FSB, doc, el, mount, execute, toolCalls, warnings };
}

// Three product cards, each a list item with a heading, a price, a title link
// and an "Add to cart" link (same-origin navigation links are not commit-class).
function buildCatalog(ctx) {
  const cards = {};
  const items = [];
  for (const [key, title] of [['blue', 'Blue mug'], ['red', 'Red mug'], ['green', 'Green mug']]) {
    const titleLink = ctx.el('a', { id: `${key}-title`, href: `/p/${key}` }, [title]);
    const add = ctx.el('a', { id: `${key}-add`, href: `/cart?add=${key}` }, ['Add to cart']);
    const item = ctx.el('li', { class: 'product-card' }, [
      ctx.el('h3', {}, [titleLink]),
      ctx.el('span', { class: 'price' }, ['$12']),
      add,
    ]);
    cards[key] = { titleLink, add, item };
    items.push(item);
  }
  const list = ctx.el('ul', { id: 'results' }, items);
  ctx.mount(list);
  return cards;
}

function refsIn(error) {
  return [...error.matchAll(/^(e\d+) /gm)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------

test('an exact unique name binds and the tool runs on that element\'s ref', () => {
  const ctx = loadContentScripts();
  const pricing = ctx.el('a', { id: 'pricing', href: '/pricing' }, ['Pricing']);
  const docs = ctx.el('a', { id: 'docs', href: '/docs' }, ['Docs']);
  ctx.mount(ctx.el('nav', {}, [pricing, docs]));

  const outcome = ctx.execute('click', { selector: 'text=pricing' });
  assert.equal(outcome.refused, null);
  assert.match(outcome.params.selector, /^e\d+$/, 'the tool receives a ref');
  assert.equal(outcome.params.ref, outcome.params.selector);
  assert.equal(outcome.result.target, pricing);
  assert.equal(pricing.clicks, 1);
  assert.equal(docs.clicks, 0);
  assert.deepEqual({ ...outcome.bound }, { ref: outcome.params.selector, role: 'link', name: 'Pricing', by: 'exact' });
  assert.equal(ctx.FSB.resolveRef(outcome.bound.ref), pricing, 'the bound ref is registered');
  // The tool's result carries bound to the caller. The action call may sit in
  // a try/finally that tells the status pill the action has ended.
  assert.match(SOURCES.messaging,
    /result = await executeContentAction\(tool, params\);\n(?:\s*\} finally \{\n[^\n]*\n\s*\}\n)?[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(nameBinding && result && typeof result === 'object'\) result = \{ \.\.\.result, bound: nameBinding \};/);

  // The prefix is case-insensitive and normalisation drops a trailing count.
  const cart = ctx.el('a', { id: 'cart', href: '/cart' }, ['Cart (2)']);
  ctx.mount(cart);
  const again = ctx.execute('click', { selector: '  TEXT= cart ' });
  assert.equal(again.result.target, cart);
  assert.equal(again.bound.by, 'exact');
});

test('words and the surrounding item bind: "Add to cart blue mug"', () => {
  const ctx = loadContentScripts();
  const cards = buildCatalog(ctx);
  const outcome = ctx.execute('click', { selector: 'text=Add to cart blue mug' });
  assert.equal(outcome.refused, null, outcome.refused && outcome.refused[0].error);
  assert.equal(outcome.result.target, cards.blue.add);
  assert.equal(outcome.bound.by, 'context');
  assert.equal(outcome.bound.name, 'Add to cart');
  assert.equal(cards.blue.titleLink.clicks + cards.red.add.clicks + cards.green.add.clicks, 0);

  // Every target word in the name or a label binds by match.
  const field = ctx.el('input', { id: 'email', type: 'email', 'aria-label': 'Email address' });
  ctx.mount(ctx.el('form', { id: 'signup' }, [field]));
  const typed = ctx.execute('type', { selector: 'text=email', text: 'a@b.test' });
  assert.equal(typed.refused, null, typed.refused && typed.refused[0].error);
  assert.equal(typed.result.target, field);
  assert.equal(field.value, 'a@b.test');
  assert.equal(typed.bound.by, 'match');
  assert.equal(typed.bound.role, 'textbox');
});

test('an ambiguous name lists candidate refs that work, and runs nothing', () => {
  const ctx = loadContentScripts();
  const cards = buildCatalog(ctx);
  const outcome = ctx.execute('click', { selector: 'text=Add to cart' });
  assert.equal(outcome.result, null, 'the tool never ran');
  assert.deepEqual(ctx.toolCalls, []);
  const [response] = outcome.refused;
  assert.equal(response.success, false);
  assert.equal(response.errorCode, 'BIND_AMBIGUOUS');
  assert.equal(response.mayHaveExecuted, false);
  assert.equal(response.outcome, 'failed');
  assert.equal(response.candidateCount, 3);
  assert.match(response.error, /^text="Add to cart" matches 3 elements, so nothing was executed\. Candidates:\n/);
  assert.match(response.error, /^e\d+ link "Add to cart" \[Blue mug\]$/m);
  assert.match(response.error, /^e\d+ link "Add to cart" \[Red mug\]$/m);
  assert.match(response.error, /^e\d+ link "Add to cart" \[Green mug\]$/m);
  assert.match(response.error, /Retry with one of these refs as the selector\.$/);

  // Candidates are written in document order and each ref works at once.
  const refs = refsIn(response.error);
  assert.deepEqual(refs.map((ref) => ctx.FSB.resolveRef(ref)), [cards.blue.add, cards.red.add, cards.green.add]);
  const retry = ctx.execute('click', { selector: refs[1] });
  assert.equal(retry.result.target, cards.red.add);
  assert.equal(cards.red.add.clicks, 1);
  assert.equal(cards.blue.add.clicks + cards.green.add.clicks, 0);
});

test('a missing name runs nothing and lists the closest names', () => {
  const ctx = loadContentScripts();
  buildCatalog(ctx);
  const none = ctx.execute('click', { selector: 'text=Checkout' });
  assert.equal(none.result, null);
  assert.equal(none.refused[0].errorCode, 'BIND_NOT_FOUND');
  assert.equal(none.refused[0].mayHaveExecuted, false);
  assert.match(none.refused[0].error, /^No visible, enabled interactive element is named text="Checkout", so nothing was executed\. Take a get_page_snapshot/);

  const near = ctx.execute('click', { selector: 'text=cart summary' });
  assert.equal(near.result, null);
  assert.equal(near.refused[0].errorCode, 'BIND_NOT_FOUND');
  assert.match(near.refused[0].error, /Closest names:\n/);
  assert.equal(refsIn(near.refused[0].error).length, 3);
  assert.deepEqual(ctx.toolCalls, []);

  // A quoted target binds by exact name only.
  const quoted = ctx.execute('click', { selector: 'text="Add"' });
  assert.equal(quoted.refused[0].errorCode, 'BIND_NOT_FOUND');
});

test('a control that can commit binds by name only when exact and unique in the whole document', () => {
  const ctx = loadContentScripts();
  const place = ctx.el('button', { id: 'place', type: 'submit' }, ['Place order']);
  ctx.mount(ctx.el('form', { id: 'checkout' }, [place]));
  assert.notEqual(ctx.FSB.classifyJevRisk(place, {}), null, 'fixture: the button can commit');

  // Words only: needs confirmation, nothing runs, and the listed ref works.
  const byWords = ctx.execute('click', { selector: 'text=place' });
  assert.equal(byWords.result, null);
  assert.deepEqual(ctx.toolCalls, []);
  assert.equal(place.clicks, 0);
  const [refusal] = byWords.refused;
  assert.equal(refusal.errorCode, 'BIND_NEEDS_CONFIRMATION');
  assert.equal(refusal.mayHaveExecuted, false);
  assert.match(refusal.error, /^text="place" matched (e\d+) button "Place order", a control that can commit \([a-z_]+\), but it matched by its words rather than exactly, so nothing was executed\. If it is the right element, retry with e\d+ as the selector\.$/);
  const [ref] = refsIn(refusal.error.replace(/^.*?matched /, ''));
  assert.equal(ctx.FSB.resolveRef(ref), place);

  // Exact and unique: binds.
  const exact = ctx.execute('click', { selector: 'text=Place order' });
  assert.equal(exact.refused, null, exact.refused && exact.refused[0].error);
  assert.equal(exact.result.target, place);
  assert.equal(exact.bound.by, 'exact');
  assert.equal(place.clicks, 1);
});

test('a hidden copy or one in an open shadow root makes a commit-class name non-unique', () => {
  const ctx = loadContentScripts();
  const visible = ctx.el('button', { id: 'del', type: 'button' }, ['Delete']);
  const hidden = ctx.el('button', { id: 'del-mobile', type: 'button' }, ['Delete']);
  hidden.style.display = 'none';
  ctx.mount(visible, hidden);
  const outcome = ctx.execute('click', { selector: 'text=Delete' });
  assert.equal(outcome.result, null);
  assert.equal(outcome.refused[0].errorCode, 'BIND_NEEDS_CONFIRMATION');
  assert.match(outcome.refused[0].error, /but 2 elements in the page carry that exact name, hidden ones included/);
  assert.equal(visible.clicks + hidden.clicks, 0);

  const ctx2 = loadContentScripts();
  const lone = ctx2.el('button', { id: 'del', type: 'button' }, ['Delete']);
  const host = ctx2.el('my-panel', { id: 'panel' });
  const shadowCopy = ctx2.el('button', { type: 'button' }, ['Delete']);
  shadowCopy.style.display = 'none';
  attachShadow(host, [shadowCopy]);
  ctx2.mount(lone, host);
  const shadowed = ctx2.execute('click', { selector: 'text=Delete' });
  assert.equal(shadowed.refused[0].errorCode, 'BIND_NEEDS_CONFIRMATION');
  assert.equal(lone.clicks, 0);

  // Without the shadow copy the same exact name binds.
  host.shadowRoot = null;
  const alone = ctx2.execute('click', { selector: 'text=Delete' });
  assert.equal(alone.result.target, lone);
});

test('on a page too large to search whole, a commit-class name needs confirmation', () => {
  const ctx = loadContentScripts();
  const place = ctx.el('button', { id: 'place', type: 'button' }, ['Place order']);
  const filler = [];
  for (let i = 0; i < 20001; i++) filler.push(ctx.el('div'));
  ctx.mount(place, ctx.el('div', { id: 'filler' }, filler));
  const outcome = ctx.execute('click', { selector: 'text=Place order' });
  assert.equal(outcome.result, null);
  assert.equal(outcome.refused[0].errorCode, 'BIND_NEEDS_CONFIRMATION');
  assert.match(outcome.refused[0].error, /the page is too large to prove that name unique/);
  assert.equal(place.clicks, 0);
});

test('type_text binds only text fields; check_box only toggles', () => {
  const ctx = loadContentScripts();
  const searchButton = ctx.el('button', { id: 'go', type: 'button' }, ['Search']);
  const searchField = ctx.el('input', { id: 'q', type: 'search', placeholder: 'Search products' });
  ctx.mount(searchButton, searchField);
  const typed = ctx.execute('type', { selector: 'text=Search', text: 'mug' });
  assert.equal(typed.result.target, searchField, 'the button named exactly "Search" is not a field');
  assert.equal(typed.bound.role, 'searchbox');

  const ctx2 = loadContentScripts();
  ctx2.mount(ctx2.el('button', { id: 'sub', type: 'button' }, ['Subscribe']));
  const noField = ctx2.execute('type', { selector: 'text=Subscribe', text: 'x' });
  assert.equal(noField.refused[0].errorCode, 'BIND_NOT_FOUND');
  assert.match(noField.refused[0].error, /^No visible, enabled text field is named/);
  assert.deepEqual(ctx2.toolCalls, []);

  const ctx3 = loadContentScripts();
  const box = ctx3.el('input', { id: 'remember', type: 'checkbox' });
  ctx3.mount(ctx3.el('label', { id: 'remember-label' }, [box, 'Remember me']), ctx3.el('a', { href: '/remember' }, ['Remember me']));
  const toggled = ctx3.execute('toggleCheckbox', { selector: 'text=Remember me' });
  assert.equal(toggled.result.target, box, 'the link of the same name is not a toggle');
  assert.equal(toggled.bound.role, 'checkbox');
});

test('password and vault-filled fields are never bound by name, but still work by selector', () => {
  const ctx = loadContentScripts();
  const pw = ctx.el('input', { id: 'pw', type: 'password', 'aria-label': 'Password' });
  const user = ctx.el('input', { id: 'user', type: 'text', 'aria-label': 'Username' });
  const hint = ctx.el('input', { id: 'hint', type: 'text', 'aria-label': 'Password hint' });
  ctx.mount(ctx.el('form', { id: 'login' }, [user, pw]), hint);
  const byName = ctx.execute('type', { selector: 'text=Password', text: 'secret' });
  assert.equal(byName.result, null);
  assert.equal(byName.refused[0].errorCode, 'BIND_NOT_FOUND');
  assert.match(byName.refused[0].error, /names a password, payment or vault-filled field, which is never bound by name/);
  assert.equal(hint.value, '', 'a field matching only by words is not bound in its place');
  assert.equal(refsIn(byName.refused[0].error).some((ref) => ctx.FSB.resolveRef(ref) === pw), false,
    'the password field is never listed');
  assert.equal(/^e\d+ textbox "Password"/m.test(byName.refused[0].error), false);
  assert.equal(pw.value, '');

  ctx.FSB.noteVaultFilled(user);
  const vault = ctx.execute('type', { selector: 'text=Username', text: 'x' });
  assert.equal(vault.refused[0].errorCode, 'BIND_NOT_FOUND');
  assert.equal(user.value, '');

  const bySelector = ctx.execute('type', { selector: '#pw', text: 'secret' });
  assert.equal(bySelector.refused, null);
  assert.equal(bySelector.result.target, pw);
  assert.equal(bySelector.bound, null);
});

test('click text no longer picks the last match: ambiguity lists candidates', () => {
  const ctx = loadContentScripts();
  const first = ctx.el('button', { id: 'save-1', type: 'button' }, ['Save']);
  const second = ctx.el('button', { id: 'save-2', type: 'button' }, ['Save']);
  ctx.mount(ctx.el('section', { 'aria-label': 'Profile' }, [first]), ctx.el('section', { 'aria-label': 'Billing' }, [second]));
  const outcome = ctx.execute('click', { text: 'Save' });
  assert.equal(outcome.result, null);
  assert.equal(first.clicks + second.clicks, 0, 'nothing clicked, not even the last match');
  assert.equal(outcome.refused[0].errorCode, 'BIND_AMBIGUOUS');
  assert.match(outcome.refused[0].error, /^e\d+ button "Save" \[Profile\]$/m);
  assert.match(outcome.refused[0].error, /^e\d+ button "Save" \[Billing\]$/m);

  // A unique text target still clicks, through the ref, with text removed.
  const ctx2 = loadContentScripts();
  const pricing = ctx2.el('a', { id: 'pricing', href: '/pricing' }, ['Pricing']);
  ctx2.mount(pricing);
  const unique = ctx2.execute('click', { text: 'pricing' });
  assert.equal(unique.result.target, pricing);
  assert.equal(unique.params.text, undefined);
  assert.match(unique.params.selector, /^e\d+$/);

  // The click tool's own text branch binds through the same binder.
  const clickBody = SOURCES.actions.slice(SOURCES.actions.indexOf('  click: async (params) => {'));
  const textBranch = clickBody.slice(0, clickBody.indexOf('// Support selector cascade'));
  assert.match(textBranch, /FSB\.bindTargetByName\(params\.text, 'click'\)/);
  assert.equal(/createTreeWalker|candidates\.length - 1/.test(textBranch), false);
});

test('an ordinal picks by position only within one repeated list', () => {
  const ctx = loadContentScripts();
  const cards = buildCatalog(ctx);
  const second = ctx.execute('click', { selector: 'text=2nd Add to cart' });
  assert.equal(second.refused, null, second.refused && second.refused[0].error);
  assert.equal(second.result.target, cards.red.add);
  assert.equal(second.bound.by, 'ordinal');
  const last = ctx.execute('click', { selector: 'text=last add to cart' });
  assert.equal(last.result.target, cards.green.add);

  // A matching link outside the list makes the position ambiguous.
  ctx.mount(ctx.el('header', {}, [ctx.el('a', { id: 'header-add', href: '/cart?add=any' }, ['Add to cart'])]));
  const mixed = ctx.execute('click', { selector: 'text=third Add to cart' });
  assert.equal(mixed.result, null);
  assert.equal(mixed.refused[0].errorCode, 'BIND_AMBIGUOUS');
  assert.match(mixed.refused[0].error, /are not one repeated list/);
});

test('reads bind any named element, including headings', () => {
  const ctx = loadContentScripts();
  const heading = ctx.el('h2', { id: 'total-h' }, ['Order total']);
  ctx.mount(ctx.el('div', {}, [heading, ctx.el('p', {}, ['$24.00'])]));
  const read = ctx.execute('getText', { selector: 'text=order total' });
  assert.equal(read.result.target, heading);
  assert.equal(read.bound.role, 'heading');
});

test('the refusal text keeps its candidates through mapFSBError', async () => {
  const errorsUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'errors.js')).href;
  const { mapFSBError } = await import(errorsUrl);
  const ctx = loadContentScripts();
  buildCatalog(ctx);
  const [ambiguous] = ctx.execute('click', { selector: 'text=Add to cart' }).refused;
  const mapped = mapFSBError(ambiguous);
  assert.equal(mapped.isError, true);
  const text = mapped.content[0].text;
  assert.match(text, /^Detected: Target name matched more than one element\n/);
  for (const ref of refsIn(ambiguous.error)) assert.ok(text.includes(`${ref} link "Add to cart"`), `${ref} survives`);
  assert.match(text, /\nNext action: Nothing was executed\. Retry with one of the listed refs/);
  assert.equal(text.includes('Page navigation'), false);
  assert.equal(text.includes('Raw error:'), false, 'the error is shown once');

  const [missing] = ctx.execute('click', { selector: 'text=Checkout' }).refused;
  assert.match(mapFSBError(missing).content[0].text, /^Detected: Target name matched no element\n/);

  const ctx2 = loadContentScripts();
  ctx2.mount(ctx2.el('form', {}, [ctx2.el('button', { type: 'submit' }, ['Place order'])]));
  const [confirm] = ctx2.execute('click', { selector: 'text=place' }).refused;
  const confirmText = mapFSBError(confirm).content[0].text;
  assert.match(confirmText, /^Detected: Target name matched a control that can commit\n/);
  assert.match(confirmText, /retry with e\d+ as the selector/);
});

test('the journal keeps the binding outcome of an action', () => {
  const recorder = require(path.join(repoRoot, 'extension', 'utils', 'mcp-session-recorder.js'));
  const bound = { ref: 'e1001', role: 'link', name: 'Pricing', by: 'exact' };
  const kept = recorder.projectJournalResult({ success: true, bound, clicked: 'e1001', elementInfo: { tag: 'A' } },
    { selector: 'text=Pricing' }, 'journal-action-v1');
  assert.deepEqual(kept.bound, bound);
  assert.equal(kept.elementInfo, undefined);
  const refused = recorder.projectJournalResult({ success: false, errorCode: 'BIND_AMBIGUOUS', error: 'x', candidateCount: 3 },
    { selector: 'text=Add to cart' }, 'journal-action-v1');
  assert.equal(refused.errorCode, 'BIND_AMBIGUOUS');
  assert.equal(refused.candidateCount, 3);
});

test('the suite runs once in the npm test chain and the refinements command list', () => {
  const pkg = JSON.parse(read('package.json'));
  const command = 'node tests/name-binding.test.js';
  assert.equal(pkg.scripts.test.split(' && ').filter((cmd) => cmd === command).length, 1);
  assert.equal(read('tests/delegation-phase-contract.test.js').split(`'${command}',`).length - 1, 1);
});
