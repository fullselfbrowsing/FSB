'use strict';

// Snapshot refs ("e12") as element addresses.
//
// Loads the real content modules (utils.js, dom-state.js, selectors.js,
// accessibility.js, dom-analysis.js) and the executeAction target-resolution
// prelude from messaging.js into one vm context over a small stub DOM, then
// checks that:
//   - an eN selector resolves through the ref map for click and type;
//   - an element keeps its ref across snapshots and refs are never reused;
//   - a ref whose element is gone, or that was never issued, is refused before
//     the tool runs and never falls back to the selector stored with it;
//   - an <input> wrapped in its <label> appears in the page snapshot;
//   - elements stamped with data-fsb-id by get_dom_snapshot stay visible to
//     later page snapshots and read_page.
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
// Stub DOM: enough of Element/Document for the snapshot walker, the filtered
// element pipeline and the selector helpers. Selectors support comma lists of
// compounds built from tag, #id, .class, [attr], [attr="v"], [attr*="v"] and
// :not(<compound>). Anything else throws, so an unexpected query fails loudly.

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

function makeDocument() {
  const doc = {
    nodeType: 9,
    activeElement: null,
    title: 'Ref fixture',
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

// Every element built for the page knows its document, so isConnected is real.
function adopt(doc, node) {
  node.ownerDocument = doc;
  for (const child of node.childNodes) if (child.nodeType === 1) adopt(doc, child);
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
  const logger = {
    log: noop, info: noop, warn: noop, error: noop, debug: noop,
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
    location: { href: 'https://example.test/form', hostname: 'example.test', pathname: '/form' },
  };
  const sandbox = {
    window: win,
    document: doc,
    console,
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
  // Selector generation is not under test; give each element an id selector.
  FSB.generateSelectors = (el) => [{ selector: el.id ? `#${el.id}` : el.tagName.toLowerCase() }];
  FSB.viewportGlow = { show: noop, setState: noop };
  FSB.progressOverlay = { create: noop, update: noop, show: noop };

  const prelude = vm.runInContext(
    `(function (request, FSB, sendResponse, document, logger) {${executeActionPrelude()}\nreturn 'continued';\n})`,
    sandbox,
    { filename: 'messaging.js#executeAction-prelude' }
  );

  // Tools that look their target up the way the real content tools do.
  const toolCalls = [];
  FSB.tools = {
    click(params) {
      toolCalls.push({ tool: 'click', selector: params.selector });
      const target = FSB.querySelectorWithShadow(params.selector);
      if (!target) return { success: false, error: 'Element not found' };
      target.click();
      return { success: true, target };
    },
    type(params) {
      toolCalls.push({ tool: 'type', selector: params.selector });
      const target = FSB.querySelectorWithShadow(params.selector);
      if (!target) return { success: false, error: 'Element not found' };
      target.focus();
      target.value = params.text;
      return { success: true, target };
    },
  };

  function execute(tool, params) {
    const responses = [];
    const request = { action: 'executeAction', tool, params, source: 'mcp-manual' };
    const outcome = prelude(request, FSB, (response) => responses.push(response), doc, logger);
    if (outcome !== 'continued') return { refused: responses, params, result: null };
    assert.equal(responses.length, 0, 'nothing answered before the tool');
    return { refused: null, params, result: FSB.tools[tool](params) };
  }

  const el = (tag, attrs, children) => adopt(doc, makeElement(tag, attrs, children));
  return { FSB, doc, el, execute, toolCalls };
}

function snapshot(ctx) {
  return ctx.FSB.buildMarkdownSnapshot({ charBudget: 20000 }).snapshot;
}

// The ref the snapshot printed for an element with this accessible name.
function refFor(text, name) {
  const match = text.match(new RegExp('`(e\\d+): [a-z]+ "' + name + '"'));
  assert.ok(match, `snapshot names "${name}":\n${text}`);
  return match[1];
}

// The search field stands alone; the email field sits inside its label.
function buildForm(ctx) {
  const search = ctx.el('input', { id: 'q', type: 'search', 'aria-label': 'Search' });
  const save = ctx.el('button', { id: 'save', type: 'button' }, ['Save']);
  const email = ctx.el('input', { id: 'email', type: 'email', 'aria-label': 'Email address' });
  const label = ctx.el('label', { id: 'email-label' }, ['Email ', email]);
  const cancel = ctx.el('button', { id: 'cancel', type: 'button' }, ['Cancel']);
  const form = ctx.el('form', { id: 'f' }, [search, label, save, cancel]);
  ctx.doc.body.appendChild(adopt(ctx.doc, form));
  return { search, save, email, label, cancel, form };
}

// ---------------------------------------------------------------------------

test('an eN selector resolves through the ref map for click and type_text', () => {
  const ctx = loadContentScripts();
  const page = buildForm(ctx);
  const text = snapshot(ctx);
  const saveRef = refFor(text, 'Save');
  const searchRef = refFor(text, 'Search');

  ctx.doc.queries.length = 0;
  const clicked = ctx.execute('click', { selector: saveRef });
  assert.equal(clicked.refused, null);
  assert.equal(clicked.params.selector, saveRef, 'the tool receives the ref, not a stored CSS selector');
  assert.equal(clicked.result.success, true);
  assert.equal(clicked.result.target, page.save);
  assert.equal(page.save.clicks, 1);

  const typed = ctx.execute('type', { selector: ` ${searchRef} `, text: 'shoes' });
  assert.equal(typed.refused, null);
  assert.equal(typed.result.target, page.search);
  assert.equal(page.search.value, 'shoes');
  assert.deepEqual(ctx.doc.queries, [], 'no CSS query ran for either ref');
});

test('an element keeps its ref across snapshots, and refs are never reused', () => {
  const ctx = loadContentScripts();
  const page = buildForm(ctx);
  const first = snapshot(ctx);
  const saveRef = refFor(first, 'Save');
  const cancelRef = refFor(first, 'Cancel');
  const searchRef = refFor(first, 'Search');
  const firstNumbers = [...first.matchAll(/`e(\d+):/g)].map((m) => Number(m[1]));

  page.save.remove();
  const help = ctx.el('button', { id: 'help', type: 'button' }, ['Help']);
  page.form.appendChild(help);
  const second = snapshot(ctx);

  assert.equal(refFor(second, 'Cancel'), cancelRef, 'same element, same ref');
  assert.equal(refFor(second, 'Search'), searchRef);
  const helpNumber = Number(refFor(second, 'Help').slice(1));
  assert.ok(helpNumber > Math.max(...firstNumbers), 'a new element gets a number never issued before');
  assert.equal(second.includes(`\`${saveRef}:`), false, 'the removed element\'s ref is not reissued');

  assert.equal(ctx.FSB.resolveRef(cancelRef), page.cancel);
  assert.equal(ctx.FSB.resolveRef(saveRef), null);
  // A ref from the first snapshot still means its original element.
  const clicked = ctx.execute('click', { selector: cancelRef });
  assert.equal(clicked.result.target, page.cancel);
});

test('a detached element\'s ref is refused before the tool runs, with no CSS fallback', () => {
  const ctx = loadContentScripts();
  const page = buildForm(ctx);
  const saveRef = refFor(snapshot(ctx), 'Save');
  // The stored selector for the ref is #save. Replace the element with a new
  // one that #save now matches: a CSS fallback would click the wrong button.
  page.save.remove();
  const impostor = ctx.el('button', { id: 'save', type: 'button' }, ['Delete account']);
  page.form.appendChild(impostor);

  ctx.doc.queries.length = 0;
  const outcome = ctx.execute('click', { selector: saveRef });
  assert.equal(outcome.result, null, 'the tool never ran');
  assert.deepEqual(ctx.toolCalls, []);
  assert.equal(impostor.clicks, 0);
  assert.equal(outcome.refused.length, 1);
  const [response] = outcome.refused;
  assert.equal(response.success, false);
  assert.equal(response.refStale, true);
  assert.equal(response.mayHaveExecuted, false);
  assert.equal(response.outcome, 'failed');
  assert.match(response.error, new RegExp(`^Element ref "${saveRef}" \\(button "Save"\\) is stale`));
  assert.match(response.error, /The action was not executed\./);
  assert.match(response.error, /fresh get_page_snapshot/);

  assert.equal(ctx.FSB.resolveRef(saveRef), null);
  assert.equal(ctx.FSB.querySelectorWithShadow(saveRef), null);
  assert.deepEqual(ctx.doc.queries, [], 'the stored selector was never queried');

  // Still refused after a later snapshot drops the entry.
  snapshot(ctx);
  ctx.doc.queries.length = 0;
  const later = ctx.execute('click', { selector: saveRef });
  assert.equal(later.result, null);
  assert.match(later.refused[0].error, new RegExp(`^Element ref "${saveRef}" is stale: .*not executed`));
  assert.equal(impostor.clicks, 0);
  assert.deepEqual(ctx.doc.queries.filter((q) => q === '#save'), []);
});

test('a ref this document never issued is refused as unknown', () => {
  const ctx = loadContentScripts();
  buildForm(ctx);
  snapshot(ctx);
  for (const ref of ['e999', 'e0', 'e01']) {
    const outcome = ctx.execute('type', { selector: ref, text: 'x' });
    assert.equal(outcome.result, null, ref);
    assert.match(outcome.refused[0].error, new RegExp(`^Unknown ref "${ref}": this page never issued it`));
    assert.equal(outcome.refused[0].mayHaveExecuted, false);
  }
  assert.deepEqual(ctx.toolCalls, []);
});

test('a ref from another document is unknown here, and refs never start at e1', () => {
  // Two content-script loads stand for two documents (a navigation or a
  // re-injection). Each numbers its refs from its own random base.
  const pageA = loadContentScripts();
  buildForm(pageA);
  const refsA = [...snapshot(pageA).matchAll(/`(e\d+):/g)].map((m) => m[1]);
  const pageB = loadContentScripts();
  buildForm(pageB);
  const refsB = [...snapshot(pageB).matchAll(/`(e\d+):/g)].map((m) => m[1]);
  assert.ok(refsA.length > 0 && refsB.length > 0);
  for (const ref of [...refsA, ...refsB]) assert.ok(Number(ref.slice(1)) > 1000, `${ref} is above the smallest base`);
  const overlap = refsA.filter((ref) => refsB.includes(ref));
  // Bases are multiples of 1000 drawn from 900 values, so two loads share
  // numbers only when they draw the same base.
  if (overlap.length === 0) {
    const outcome = pageB.execute('click', { selector: refsA[0] });
    assert.equal(outcome.result, null);
    assert.match(outcome.refused[0].error, /^Unknown ref /);
    assert.deepEqual(pageB.toolCalls, []);
  }
});

test('a document that uses up its block of refs opens a fresh random block, not the next range', () => {
  // Page A numbers in block 457; page B starts in block 456. Counting on past
  // e456999 would reach e457001, a number page A may already have handed out.
  const ctx = loadContentScripts();
  const realmMath = ctx.FSB.RefMap.constructor('return Math')();
  const random = realmMath.random;
  const draws = [456, 456, 100].map((block) => (block - 0.5) / 900);
  realmMath.random = () => (draws.length > 0 ? draws.shift() : random());
  let refMap;
  try {
    refMap = new ctx.FSB.RefMap();
    const refs = [];
    for (let i = 0; i < 1000; i++) {
      refs.push(refMap.register(ctx.el('button', { id: `row-${i}` }, [`Row ${i}`]), `#row-${i}`, 'button', `Row ${i}`));
    }
    assert.equal(refs[0], 'e456001');
    assert.equal(refs[998], 'e456999');
    // The used block is drawn again and skipped; the next unused draw is taken.
    assert.equal(refs[999], 'e100001');
    assert.equal(new Set(refs).size, 1000, 'every element has its own ref');
  } finally {
    realmMath.random = random;
  }
  for (const ref of ['e456001', 'e456999', 'e100001']) assert.equal(refMap.issued(ref), true, ref);
  for (const ref of ['e456000', 'e457000', 'e457001', 'e457010', 'e100000', 'e100002']) {
    assert.equal(refMap.issued(ref), false, `${ref} was never issued here`);
    assert.equal(refMap.resolve(ref), null, `${ref} resolves to nothing`);
  }
});

test('an input wrapped in its label appears in the page snapshot', () => {
  const ctx = loadContentScripts();
  const page = buildForm(ctx);
  const text = snapshot(ctx);
  const labelLine = text.split('\n').find((line) => line.includes('label'));
  assert.ok(labelLine, text);
  const emailRef = refFor(text, 'Email address');
  assert.equal(ctx.FSB.resolveRef(emailRef), page.email);
  assert.ok(text.indexOf(emailRef) > text.indexOf('label'), 'the field follows its label');
});

test('elements stamped by get_dom_snapshot stay visible to later page snapshots and read_page', () => {
  const ctx = loadContentScripts();
  const page = buildForm(ctx);
  // get_dom_snapshot stamps every element it reports with data-fsb-id.
  assert.match(SOURCES.domAnalysis, /node\.setAttribute\('data-fsb-id', semanticId\)/);
  for (const [node, id] of [[page.save, 'button_save'], [page.email, 'input_email'], [page.cancel, 'button_cancel'], [page.label, 'label_email']]) {
    node.setAttribute('data-fsb-id', id);
  }
  // FSB's own overlay is still skipped.
  const overlay = ctx.el('div', { id: 'fsb-progress-host' }, ['FSB overlay text']);
  ctx.doc.body.appendChild(overlay);

  assert.equal(ctx.FSB.isFsbElement(page.save), false);
  assert.equal(ctx.FSB.isFsbElement(overlay), true);

  const text = snapshot(ctx);
  refFor(text, 'Save');
  refFor(text, 'Cancel');
  refFor(text, 'Email address');
  assert.equal(text.includes('FSB overlay text'), false);

  const pageText = ctx.FSB.extractPageText(ctx.doc.body, { viewportOnly: false });
  assert.match(pageText, /Save/);
  assert.match(pageText, /Cancel/);
  assert.equal(pageText.includes('FSB overlay text'), false);
});

test('the suite runs once in the npm test chain and the refinements command list', () => {
  const pkg = JSON.parse(read('package.json'));
  const command = 'node tests/snapshot-ref-addressing.test.js';
  assert.equal(pkg.scripts.test.split(' && ').filter((cmd) => cmd === command).length, 1);
  assert.equal(read('tests/delegation-phase-contract.test.js').split(`'${command}',`).length - 1, 1);
});
