'use strict';

// Compact page views on MCP action results.
//
// Part 1 loads the real content modules (utils.js, dom-state.js,
// selectors.js, accessibility.js, dom-analysis.js) and the executeAction
// target-resolution prelude from messaging.js into one vm context over a stub
// DOM, and checks FSB.buildPageView: its shape and 2,000-character cap on a
// large page, dialog and main content first, no sensitive values, states, and
// refs that resolve in a following click.
//
// Part 2 drives runActionWithPageView (extension/ws/mcp-tool-dispatcher.js)
// against a fake chrome: navigate gets a view once DOMContentLoaded fires and
// view_pending when the 2,500 ms budget runs out; a history tool waits for its
// commit; an action gets a view only when its change_report shows a URL change
// or an opened dialog; restricted pages and failures get neither field.
//
// Part 3 loads the real bridge client in a vm and routes mcp:execute-action
// through _handleMessage: the recorder still receives the full result and the
// wire frame carries the view.
//
// Node 20 compatible; binds no port.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

// ---------------------------------------------------------------------------
// Stub DOM (as in tests/snapshot-ref-addressing.test.js, plus document order).

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
  return { nodeType: 3, parentNode: null, parentElement: null, childNodes: [], textContent: String(value) };
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
    // 4 = following, 2 = preceding, 1 = disconnected.
    compareDocumentPosition(other) {
      const doc = el.ownerDocument;
      if (!doc) return 1;
      const order = [doc.body, ...descendants(doc.body)];
      const a = order.indexOf(el);
      const b = order.indexOf(other);
      if (a < 0 || b < 0) return 1;
      return b > a ? 4 : 2;
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
    get isConnected() { return !!el.ownerDocument && el.getRootNode() === el.ownerDocument; },
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

function makeDocument(title) {
  const doc = {
    nodeType: 9,
    activeElement: null,
    title,
    documentElement: { scrollHeight: 800, scrollTop: 0, clientHeight: 800 },
    querySelectorAll(selector) { return descendants(doc.body).filter((node) => matchesList(node, selector)); },
    querySelector(selector) { return descendants(doc.body).find((node) => matchesList(node, selector)) || null; },
    getElementById(id) { return descendants(doc.body).find((node) => node.id === id) || null; },
  };
  const body = makeElement('body');
  body.parentNode = doc;
  body.ownerDocument = doc;
  doc.body = body;
  doc.childNodes = [body];
  return doc;
}

function adopt(doc, node) {
  node.ownerDocument = doc;
  for (const child of node.childNodes) if (child.nodeType === 1) adopt(doc, child);
  return node;
}

const noop = () => {};
const SOURCES = {
  utils: read('extension/content/utils.js'),
  domState: read('extension/content/dom-state.js'),
  selectors: read('extension/content/selectors.js'),
  accessibility: read('extension/content/accessibility.js'),
  domAnalysis: read('extension/content/dom-analysis.js'),
  messaging: read('extension/content/messaging.js'),
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

function loadContentScripts(options = {}) {
  const doc = makeDocument(options.title || 'Orders - Shop');
  const logger = {
    log: noop, info: noop, warn: noop, error: noop, debug: noop,
    logDOMOperation: noop, logTiming: noop, logComm: noop, logActionExecution: noop,
  };
  const FSB = { _modules: {}, logger, sessionId: 'test-session' };
  const href = options.href || 'https://shop.example/orders/42?session=abc123&token=xyz#refund';
  const win = {
    __FSB_SKIP_INIT__: false,
    FSB,
    innerWidth: 1280,
    innerHeight: 800,
    scrollX: 0,
    scrollY: 0,
    location: { href, hostname: 'shop.example', pathname: '/orders/42' },
  };
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
    `(function (request, FSB, sendResponse, document, logger) {${executeActionPrelude()}\nreturn 'continued';\n})`,
    sandbox,
    { filename: 'messaging.js#executeAction-prelude' }
  );
  FSB.tools = {
    click(params) {
      const target = FSB.querySelectorWithShadow(params.selector);
      if (!target) return { success: false, error: 'Element not found' };
      target.click();
      return { success: true, target };
    },
  };
  function execute(tool, params) {
    const responses = [];
    const request = { action: 'executeAction', tool, params, source: 'mcp-manual' };
    const outcome = prelude(request, FSB, (response) => responses.push(response), doc, logger);
    if (outcome !== 'continued') return { refused: responses, result: null };
    return { refused: null, result: FSB.tools[tool](params) };
  }

  const el = (tag, attrs, children) => adopt(doc, makeElement(tag, attrs, children));
  const append = (node) => { doc.body.appendChild(adopt(doc, node)); return node; };
  return { FSB, doc, el, append, execute };
}

const ELEMENT_LINE = /^e\d+ [a-z]+(?: "[^"\n]*")?(?: = "[^"\n]*")?(?: \[(?:checked|expanded|disabled)\])*$/;

function refFor(view, name) {
  const match = view.match(new RegExp(`^(e\\d+) [a-z]+ "${name}"`, 'm'));
  assert.ok(match, `view names "${name}":\n${view}`);
  return match[1];
}

// ---------------------------------------------------------------------------
// Part 1: the content-side view

test('a view is a title line, element lines and a closing count, capped at 2,000 characters', () => {
  const ctx = loadContentScripts();
  const main = ctx.el('main', {}, [ctx.el('h1', {}, ['All products'])]);
  for (let i = 0; i < 300; i++) {
    main.appendChild(adopt(ctx.doc, makeElement('button', { id: `p${i}`, type: 'button' },
      [`Add product number ${i} with a fairly long descriptive name`])));
  }
  ctx.append(main);
  const built = ctx.FSB.buildPageView();
  const lines = built.view.split('\n');

  assert.ok(built.view.length <= 2000, `view is ${built.view.length} characters`);
  assert.equal(lines[0], 'Orders - Shop | https://shop.example/orders/42', 'title and origin + path, no query or fragment');
  assert.equal(built.view.includes('session=abc123'), false);
  assert.equal(built.view.includes('#refund'), false);
  const body = lines.slice(1, -1);
  assert.ok(body.length > 0 && body.length <= 30, `${body.length} lines between title and count`);
  assert.equal(body[0], '# All products', 'the heading comes before the first element under it');
  for (const line of body.slice(1)) assert.match(line, ELEMENT_LINE);
  assert.equal(built.shown, body.length - 1);
  assert.equal(lines[lines.length - 1], `+${300 - built.shown} more interactive elements; get_page_snapshot gives the full list.`);
  assert.equal(built.more, 300 - built.shown);
});

test('an open dialog comes first, then main content, then header and navigation', () => {
  const ctx = loadContentScripts();
  ctx.append(ctx.el('header', {}, [
    ctx.el('nav', {}, [ctx.el('a', { id: 'home', href: '/home' }, ['Home']), ctx.el('a', { id: 'help', href: '/help' }, ['Help'])]),
  ]));
  ctx.append(ctx.el('main', {}, [
    ctx.el('h1', {}, ['Order 42']),
    ctx.el('button', { id: 'refund', type: 'button' }, ['Refund']),
  ]));
  ctx.append(ctx.el('div', { role: 'dialog', 'aria-modal': 'true' }, [
    ctx.el('h2', {}, ['Confirm refund']),
    ctx.el('button', { id: 'confirm', type: 'button' }, ['Confirm']),
    ctx.el('button', { id: 'cancel', type: 'button' }, ['Cancel']),
  ]));
  const { view, more } = ctx.FSB.buildPageView();
  const lines = view.split('\n').slice(1);
  assert.equal(lines[0], '# Confirm refund', view);
  assert.match(lines[1], /^e\d+ button "Confirm"$/);
  assert.match(lines[2], /^e\d+ button "Cancel"$/);
  assert.equal(lines[3], '# Order 42');
  assert.match(lines[4], /^e\d+ button "Refund"$/);
  assert.match(lines[5], /^e\d+ link "Home"$/);
  assert.match(lines[6], /^e\d+ link "Help"$/);
  assert.equal(lines.length, 7, 'nothing more, and no closing count when everything is listed');
  assert.equal(more, 0);
});

test('a view never shows password, hidden, file, payment, one-time-code or vault-filled values', () => {
  const ctx = loadContentScripts();
  const vaultEmail = ctx.el('input', { id: 'vault-email', type: 'email', 'aria-label': 'Account email', value: 'me@private.example' });
  ctx.append(ctx.el('main', {}, [
    ctx.el('input', { id: 'pw', type: 'password', 'aria-label': 'Password', value: 'hunter2-secret' }),
    ctx.el('input', { id: 'csrf', type: 'hidden', 'aria-label': 'Token', value: 'csrf-token-123' }),
    ctx.el('input', { id: 'resume', type: 'file', 'aria-label': 'Resume', value: 'C:\\fakepath\\resume.pdf' }),
    ctx.el('input', { id: 'cc', type: 'text', autocomplete: 'cc-number', 'aria-label': 'Card', value: '4242424242424242' }),
    ctx.el('input', { id: 'cardNumber', type: 'text', 'aria-label': 'Card again', value: '4111111111111111' }),
    ctx.el('input', { id: 'otp', type: 'text', 'aria-label': 'Code', value: '918273' }),
    vaultEmail,
    ctx.el('input', { id: 'city', type: 'text', 'aria-label': 'City', value: 'Paris' }),
  ]));
  ctx.FSB.noteVaultFilled(vaultEmail);
  const { view } = ctx.FSB.buildPageView();
  for (const secret of ['hunter2-secret', 'csrf-token-123', 'resume.pdf', '4242424242424242', '4111111111111111', '918273', 'me@private.example']) {
    assert.equal(view.includes(secret), false, `"${secret}" stays out of the view:\n${view}`);
  }
  assert.match(view, /^e\d+ textbox "City" = "Paris"$/m, 'a plain field shows its value');
  assert.match(view, /^e\d+ textbox "Password"$/m, 'the password field is listed, without its value');
});

test('checked, expanded and disabled states are shown', () => {
  const ctx = loadContentScripts();
  ctx.append(ctx.el('main', {}, [
    ctx.el('input', { id: 'terms', type: 'checkbox', checked: true, 'aria-label': 'Accept terms' }),
    ctx.el('button', { id: 'menu', type: 'button', 'aria-expanded': 'true' }, ['Filters']),
    ctx.el('button', { id: 'pay', type: 'button', disabled: true }, ['Pay now']),
  ]));
  const { view } = ctx.FSB.buildPageView();
  assert.match(view, /^e\d+ checkbox "Accept terms" \[checked\]$/m, view);
  assert.match(view, /^e\d+ button "Filters" \[expanded\]$/m);
  assert.match(view, /^e\d+ button "Pay now" \[disabled\]$/m);
});

test('a label around its input is listed as the input, and elements keep document order', () => {
  const ctx = loadContentScripts();
  const email = ctx.el('input', { id: 'email', type: 'email', 'aria-label': 'Email address' });
  ctx.append(ctx.el('main', {}, [
    ctx.el('label', { id: 'email-label' }, ['Email ', email]),
    ctx.el('button', { id: 'next', type: 'button' }, ['Next']),
  ]));
  const { view, more } = ctx.FSB.buildPageView();
  const lines = view.split('\n').slice(1);
  assert.equal(lines.length, 2, view);
  assert.match(lines[0], /^e\d+ textbox "Email address"$/);
  assert.match(lines[1], /^e\d+ button "Next"$/);
  assert.equal(more, 0, 'the label is not counted as a further element');
  assert.equal(ctx.FSB.resolveRef(lines[0].split(' ')[0]), email);
});

test('refs in a view resolve in the next click and stay the same in a later snapshot', () => {
  const ctx = loadContentScripts();
  const refund = ctx.el('button', { id: 'refund', type: 'button' }, ['Refund']);
  ctx.append(ctx.el('main', {}, [refund, ctx.el('button', { id: 'keep', type: 'button' }, ['Keep'])]));
  const { view } = ctx.FSB.buildPageView();
  const ref = refFor(view, 'Refund');

  const clicked = ctx.execute('click', { selector: ref });
  assert.equal(clicked.refused, null);
  assert.equal(clicked.result.target, refund);
  assert.equal(refund.clicks, 1);

  const snapshot = ctx.FSB.buildMarkdownSnapshot({ charBudget: 20000 }).snapshot;
  assert.ok(snapshot.includes(`\`${ref}: button "Refund"`), snapshot);
  assert.equal(refFor(ctx.FSB.buildPageView().view, 'Refund'), ref, 'a second view keeps the ref');
});

// ---------------------------------------------------------------------------
// Part 2: when the service worker attaches a view

function makeBrowser() {
  const listeners = { committed: [], fragment: [], history: [], dcl: [] };
  const event = (key) => ({
    addListener(fn) { listeners[key].push(fn); },
    removeListener(fn) { const i = listeners[key].indexOf(fn); if (i >= 0) listeners[key].splice(i, 1); },
  });
  const page = {
    url: 'https://shop.example/orders/42',
    pendingUrl: '',
    readyState: 'complete',
    fsbLoaded: false,
    documentId: 'doc-1',
    blocked: false,
    view: 'Orders - Shop | https://shop.example/orders/42\ne4001 button "Refund"',
  };
  const calls = { probes: [], builds: [], injections: [], marks: [] };
  const chrome = {
    webNavigation: {
      onCommitted: event('committed'),
      onReferenceFragmentUpdated: event('fragment'),
      onHistoryStateUpdated: event('history'),
      onDOMContentLoaded: event('dcl'),
    },
    tabs: {
      async get(id) {
        return { id, url: page.url, pendingUrl: page.pendingUrl || undefined, status: page.readyState === 'complete' ? 'complete' : 'loading' };
      },
    },
    scripting: {
      async executeScript({ target, func }) {
        if (page.blocked) throw new Error('Cannot access contents of the page.');
        if (func.name === '_fsbPageViewProbeInPage') {
          calls.probes.push({ at: Date.now(), target });
          return [{ frameId: 0, documentId: page.documentId, result: { readyState: page.readyState, fsbLoaded: page.fsbLoaded } }];
        }
        if (func.name === '_fsbBuildPageViewInPage') {
          calls.builds.push({ at: Date.now(), target });
          return [{ frameId: 0, documentId: page.documentId, result: { view: page.view } }];
        }
        return [{ frameId: 0, result: null }];
      },
    },
  };
  const fire = {
    commit(details) { for (const fn of listeners.committed.slice()) fn({ frameId: 0, ...details }); },
    dcl(details) { for (const fn of listeners.dcl.slice()) fn({ frameId: 0, ...details }); },
  };
  return { chrome, page, calls, fire, listeners };
}

let browser = makeBrowser();
global.chrome = browser.chrome;
global.ensureContentScriptInjected = async (tabId, retries, options) => {
  browser.calls.injections.push({ tabId, options });
  return true;
};
global.markContentScriptKnownEmpty = (details) => { browser.calls.marks.push(details); };
const dispatcher = require('../extension/ws/mcp-tool-dispatcher.js');

function freshBrowser() {
  browser = makeBrowser();
  global.chrome = browser.chrome;
  return browser;
}

function listenerCount(b) {
  return Object.values(b.listeners).reduce((sum, list) => sum + list.length, 0);
}

test('navigate gets a view once the new document fires DOMContentLoaded, without waiting for the load', async () => {
  const b = freshBrowser();
  b.page.readyState = 'loading';
  setTimeout(() => {
    b.page.readyState = 'interactive';
    b.fire.dcl({ tabId: 7 });
  }, 300);
  const started = Date.now();
  const response = await dispatcher.runActionWithPageView({
    toolName: 'navigate',
    tabId: null,
    params: { url: 'https://shop.example/orders/42' },
    execute: async () => {
      b.fire.commit({ tabId: 7, url: 'https://shop.example/orders/42' });
      return { success: true, tool: 'navigate', tabId: 7, url: 'https://shop.example/orders/42', title: '' };
    },
  });
  const elapsed = Date.now() - started;
  assert.equal(response.view, b.page.view);
  assert.equal(response.view_pending, undefined);
  assert.equal(response.success, true);
  assert.equal(response.url, 'https://shop.example/orders/42', 'existing fields stay');
  assert.ok(elapsed >= 290 && elapsed < 1500, `resolved ${elapsed} ms after the call, soon after DOMContentLoaded`);
  assert.equal(b.calls.builds.length, 1);
  assert.ok(b.calls.builds[0].at >= started + 290, 'the view was built after DOMContentLoaded');
  assert.deepEqual(b.calls.builds[0].target, { tabId: 7 }, 'built in the tab\'s main frame');
  assert.deepEqual(b.calls.injections.map((call) => call.options), [{ domReady: true }], 'injection skips the full-load wait');
  assert.deepEqual(b.calls.marks.map((mark) => mark.documentId), ['doc-1'], 'a document without FSB is injected without reconnection waits');
  assert.equal(listenerCount(b), 0, 'every listener is removed');
});

test('navigate returns view_pending when the document is not ready within 2,500 ms', async () => {
  const b = freshBrowser();
  b.page.readyState = 'loading';
  const started = Date.now();
  const response = await dispatcher.runActionWithPageView({
    toolName: 'navigate',
    tabId: 7,
    params: { url: 'https://slow.example/' },
    execute: async () => {
      b.fire.commit({ tabId: 7, url: 'https://slow.example/' });
      return { success: true, tool: 'navigate', tabId: 7, url: 'https://slow.example/' };
    },
  });
  const elapsed = Date.now() - started;
  assert.equal(dispatcher.PAGE_VIEW_WAIT_MS, 2500);
  assert.equal(response.view_pending, true);
  assert.equal(response.view, undefined);
  assert.ok(elapsed >= 2450 && elapsed < 3300, `gave up after ${elapsed} ms`);
  assert.equal(b.calls.builds.length, 0);
  assert.equal(listenerCount(b), 0);
});

test('go_back waits for its commit before reading the page', async () => {
  const b = freshBrowser();
  setTimeout(() => b.fire.commit({ tabId: 7, url: 'https://shop.example/orders' }), 200);
  const started = Date.now();
  const response = await dispatcher.runActionWithPageView({
    toolName: 'go_back',
    tabId: null,
    params: {},
    execute: async () => ({ success: true, tool: 'go_back', tabId: 7 }),
  });
  assert.equal(response.view, b.page.view);
  assert.ok(b.calls.probes.length > 0 && b.calls.probes[0].at >= started + 190, 'no probe ran before the commit');
});

test('an action gets a view only when its change_report shows a URL change or an opened dialog', async () => {
  const report = (overrides) => ({
    url: { before: 'https://shop.example/a', after: 'https://shop.example/a', changed: false },
    title_changed: false, dialogs_opened: [], nodes_added: [], nodes_removed: [], attrs_changed: [],
    inputs_changed: {}, focus_shift: null, mutation_count: 3, settle_ms: 120, truncated: false,
    ...overrides,
  });
  const run = async (toolName, response) => {
    const b = freshBrowser();
    const result = await dispatcher.runActionWithPageView({
      toolName,
      tabId: null,
      params: { selector: '#go' },
      resolveTabId: async () => 7,
      execute: async () => response,
    });
    return { result, b };
  };

  const moved = await run('click', { success: true, change_report: report({ url: { before: 'https://shop.example/a', after: 'https://shop.example/b', changed: true } }) });
  assert.equal(moved.result.view, moved.b.page.view, 'URL change: view');

  const dialog = await run('click', { success: true, change_report: report({ dialogs_opened: [{ selector: 'div.modal', role: 'dialog' }] }) });
  assert.equal(dialog.result.view, dialog.b.page.view, 'opened dialog: view');

  const verb = await run('pressEnter', { success: true, change_report: report({ url: { before: 'https://shop.example/a', after: 'https://shop.example/b?q=1', changed: true } }) });
  assert.equal(verb.result.view, verb.b.page.view, 'wire verbs resolve to their tool');

  for (const [label, toolName, response] of [
    ['in-page change', 'click', { success: true, change_report: report() }],
    ['no change_report', 'type', { success: true, typed: 'shoes' }],
    ['failed action', 'click', { success: false, error: 'Element not found', change_report: report({ url: { before: 'a', after: 'b', changed: true } }) }],
    ['close_tab', 'close_tab', { success: true, change_report: report({ url: { before: 'https://shop.example/a', after: null, changed: true } }) }],
  ]) {
    const { result, b } = await run(toolName, response);
    assert.equal(result.view, undefined, `${label}: no view`);
    assert.equal(result.view_pending, undefined, `${label}: no view_pending`);
    assert.equal(b.calls.probes.length + b.calls.builds.length, 0, `${label}: the page is not touched`);
  }
});

test('navigation tools always get a view on success; restricted and unscriptable pages get neither field', async () => {
  for (const toolName of ['refresh', 'switch_tab', 'siteSearch']) {
    const b = freshBrowser();
    const result = await dispatcher.runActionWithPageView({
      toolName,
      tabId: 7,
      params: {},
      execute: async () => {
        if (toolName === 'refresh') b.fire.commit({ tabId: 7, url: b.page.url });
        return { success: true, tabId: 7, method: 'site-search' };
      },
    });
    assert.equal(result.view, b.page.view, `${toolName}: view`);
  }

  const restricted = freshBrowser();
  restricted.page.url = 'chrome://settings/';
  const settings = await dispatcher.runActionWithPageView({
    toolName: 'navigate',
    tabId: 7,
    params: { url: 'chrome://settings/' },
    execute: async () => ({ success: true, tool: 'navigate', tabId: 7, url: 'chrome://settings/' }),
  });
  assert.equal(settings.view, undefined);
  assert.equal(settings.view_pending, undefined);

  const blank = await dispatcher.runActionWithPageView({
    toolName: 'open_tab',
    tabId: null,
    params: {},
    execute: async () => ({ success: true, tool: 'open_tab', tabId: 9, url: 'about:blank' }),
  });
  assert.equal(blank.view, undefined);
  assert.equal(blank.view_pending, undefined);

  const blocked = freshBrowser();
  blocked.page.blocked = true;
  const errorPage = await dispatcher.runActionWithPageView({
    toolName: 'switch_tab',
    tabId: 7,
    params: {},
    execute: async () => ({ success: true, tool: 'switch_tab', tabId: 7 }),
  });
  assert.equal(errorPage.view, undefined);
  assert.equal(errorPage.view_pending, undefined);
});

test('open_tab waits past the initial about:blank commit for its destination', async () => {
  const b = freshBrowser();
  b.page.url = 'about:blank';
  setTimeout(() => {
    b.page.url = 'https://shop.example/orders/42';
    b.fire.commit({ tabId: 9, url: 'https://shop.example/orders/42' });
  }, 200);
  const result = await dispatcher.runActionWithPageView({
    toolName: 'open_tab',
    tabId: null,
    params: { url: 'https://shop.example/orders/42' },
    execute: async () => {
      b.fire.commit({ tabId: 9, url: 'about:blank' });
      b.fire.commit({ tabId: 3, url: 'https://elsewhere.example/' });
      return { success: true, tool: 'open_tab', tabId: 9, url: 'about:blank' };
    },
  });
  assert.equal(result.view, b.page.view);
});

// ---------------------------------------------------------------------------
// Part 3: the bridge records the full result and sends the view

function loadBridge() {
  const definitions = require('../extension/ai/tool-definitions.js');
  const av = require('../extension/utils/action-verification.js');
  const storageArea = () => ({ async get() { return {}; }, async set() {}, async remove() {} });
  class FakeWebSocket {
    constructor() { this.readyState = FakeWebSocket.OPEN; this.sent = []; }
    send(data) { this.sent.push(data); }
    close() {}
  }
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CLOSED = 3;
  const context = {
    chrome: {
      runtime: { id: 'page-view-test', onMessage: { addListener() {}, removeListener() {} }, sendMessage() {} },
      storage: { session: storageArea(), local: storageArea() },
      alarms: { async create() {}, async clear() { return true; }, async getAll() { return []; } },
    },
    WebSocket: FakeWebSocket,
    console, Math, Date, URL, EventTarget, CustomEvent,
    setTimeout: () => ({}),
    clearTimeout() {},
    setInterval: () => ({}),
    clearInterval() {},
    getToolByNameOrVerb: definitions.getToolByNameOrVerb,
    isEmptyChangeReport: av.isEmptyChangeReport,
    runActionWithPageView: dispatcher.runActionWithPageView,
  };
  context.globalThis = context;
  vm.runInNewContext(`${read('extension/ws/mcp-bridge-client.js')}\nthis.__bridge = mcpBridgeClient;`, context, { filename: 'ws/mcp-bridge-client.js' });
  const client = context.__bridge;
  client.setInboundAuthorityReady(true);
  client.setDelegationAuthorityReady(true);
  return { context, client };
}

test('the recorder receives the full result and the wire frame carries the view', async () => {
  const b = freshBrowser();
  const { context, client } = loadBridge();
  const recorded = [];
  context.fsbMcpSessionRecorder = {
    recordAction(entry) { recorded.push({ entry, viewAtRecord: Object.prototype.hasOwnProperty.call(entry.response, 'view') }); },
  };
  context.resolveAgentTabOrError = async () => ({ success: true, tabId: 7 });
  const changeReport = {
    url: { before: 'https://shop.example/cart', after: 'https://shop.example/orders/42', changed: true },
    title_changed: true, dialogs_opened: [], nodes_added: [], nodes_removed: [], attrs_changed: [],
    inputs_changed: {}, focus_shift: null, mutation_count: 0, settle_ms: 300, truncated: false,
  };
  const actionResult = { success: true, clicked: '#checkout', pageStable: true, change_report: changeReport };
  context.wrapWithChangeReport = async ({ execute }) => { await execute(); return actionResult; };
  client._sendToContentScript = async () => ({ success: true });
  client._resolveMcpSessionRecordTarget = async () => ({ targetOriginResolved: true, targetUrl: b.page.url, targetOrigin: 'https://shop.example' });
  client._recordVisualSessionTickIfPresent = async () => {};
  client._clearVisualSessionIfFinal = async () => {};
  const sent = [];
  client._send = (frame) => sent.push(frame);

  await client._handleMessage(JSON.stringify({
    id: 'call-1',
    type: 'mcp:execute-action',
    payload: { tool: 'click', params: { selector: '#checkout' }, agentId: 'agent-1' },
  }));

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].entry.response, actionResult, 'the recorder holds the result object itself');
  assert.equal(recorded[0].viewAtRecord, false, 'it was recorded before the view was added');
  assert.equal(recorded[0].entry.response.pageStable, true, 'with every field the wire leaves out');
  assert.equal(recorded[0].entry.response.change_report, changeReport);
  const frame = sent.find((f) => f && f.type === 'mcp:result');
  assert.ok(frame, 'an mcp:result frame was sent');
  assert.equal(frame.payload.view, b.page.view);
  assert.equal(frame.payload.success, true);
  assert.equal(frame.payload.clicked, '#checkout');
  assert.equal(Object.prototype.hasOwnProperty.call(frame.payload, 'pageStable'), false);
  assert.deepEqual(frame.payload.change_report, changeReport);
});

test('a replay calling _handleExecuteAction directly never waits for a view', async () => {
  freshBrowser();
  const { context, client } = loadBridge();
  context.resolveAgentTabOrError = async () => ({ success: true, tabId: 7 });
  const actionResult = { success: true, change_report: { url: { before: 'a', after: 'b', changed: true }, dialogs_opened: [] } };
  context.wrapWithChangeReport = async ({ execute }) => { await execute(); return actionResult; };
  client._sendToContentScript = async () => ({ success: true });
  client._resolveMcpSessionRecordTarget = async () => ({ targetOriginResolved: false });
  client._recordVisualSessionTickIfPresent = async () => {};
  client._clearVisualSessionIfFinal = async () => {};
  const result = await client._handleExecuteAction({ tool: 'click', params: { selector: '#x' }, agentId: 'agent-1' });
  assert.equal(result.view, undefined);
});

test('the suite runs once in the npm test chain and the refinements command list', () => {
  const pkg = JSON.parse(read('package.json'));
  const command = 'node tests/mcp-page-view.test.js';
  assert.equal(pkg.scripts.test.split(' && ').filter((cmd) => cmd === command).length, 1);
  assert.equal(read('tests/delegation-phase-contract.test.js').split(`'${command}',`).length - 1, 1);
});
