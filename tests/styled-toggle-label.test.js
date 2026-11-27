'use strict';

// Styled checkboxes and radio buttons.
//
// Many sites hide the native <input> (opacity 0, no size, display none) and
// draw the control with its <label>. A person clicks the label. This suite
// loads the real content modules (utils.js, dom-state.js, selectors.js,
// accessibility.js, dom-analysis.js, actions.js) and the executeAction
// target-resolution prelude from messaging.js into one vm context over a stub
// DOM whose labels activate their control, and checks that:
//   - such an input is listed once, as itself, while its label is visible
//     (element list, page view, page snapshot, name binding), whether the
//     label wraps it or names it with for=;
//   - check_box and click on it go to the label, and succeed only when the
//     input's checked state changed as intended;
//   - an input with no visible label is still refused, and nothing else about
//     the visibility rule changed;
//   - a visible checkbox is listed and acted on as before.
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
// Stub DOM (as in tests/mcp-page-view.test.js, plus styles that hide, hit
// testing, and labels that activate their control).

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
    } else if ((m = rest.match(/^:disabled/))) {
      if (node.disabled !== true) return false;
    } else {
      throw new SyntaxError(`unsupported selector: ${compound}`);
    }
    rest = rest.slice(m[0].length);
  }
  return true;
}

// A compound, or compounds joined by the descendant combinator.
function matchesComplex(node, complex) {
  const parts = splitTopLevel(complex, ' ');
  if (!matchesCompound(node, parts[parts.length - 1])) return false;
  let ancestor = node.parentElement;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (ancestor && !matchesCompound(ancestor, parts[i])) ancestor = ancestor.parentElement;
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function matchesList(node, selector) {
  if (!node || node.nodeType !== 1) return false;
  return splitTopLevel(selector, ',').some((complex) => matchesComplex(node, complex));
}

function makeText(value) {
  return { nodeType: 3, parentNode: null, parentElement: null, childNodes: [], textContent: String(value), nodeValue: String(value) };
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

function isToggle(node) {
  return node.tagName === 'INPUT' && (node.type === 'checkbox' || node.type === 'radio');
}

// Whether the element or an ancestor carries the style value.
function styled(node, property, value) {
  for (let current = node; current && current.nodeType === 1; current = current.parentElement) {
    if (current.style[property] === value) return true;
  }
  return false;
}

function makeElement(tagName, attrs = {}, children = []) {
  const attributes = new Map();
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) attributes.set(key.toLowerCase(), value === true ? '' : String(value));
  }
  let checked = attributes.has('checked');
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
    events: [],          // event types dispatched on this element by the code under test
    scrolls: [],         // scrollIntoView calls
    scriptWrites: 0,     // times a script assigned .checked directly
    swallowsClicks: false,
    getAttribute(name) {
      const key = String(name).toLowerCase();
      return attributes.has(key) ? attributes.get(key) : null;
    },
    hasAttribute(name) { return attributes.has(String(name).toLowerCase()); },
    setAttribute(name, next) { attributes.set(String(name).toLowerCase(), String(next)); },
    removeAttribute(name) { attributes.delete(String(name).toLowerCase()); },
    // No box at all under display:none, as in a browser.
    getBoundingClientRect() {
      const r = styled(el, 'display', 'none') ? { left: 0, top: 0, width: 0, height: 0 } : el.rect;
      return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
    },
    // Chrome's checkVisibility: display on the element and its ancestors, and
    // on request opacity and visibility.
    checkVisibility(options = {}) {
      if (styled(el, 'display', 'none')) return false;
      if ((options.opacityProperty || options.checkOpacity) && styled(el, 'opacity', '0')) return false;
      if ((options.visibilityProperty || options.checkVisibilityCSS) && el.style.visibility === 'hidden') return false;
      return true;
    },
    appendChild(child) {
      if (child.parentNode) child.parentNode.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
      child.parentNode = el;
      child.parentElement = el;
      el.childNodes.push(child);
      return child;
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
    scrollIntoView(options) {
      el.scrolls.push(options);
      // Bring the element to the middle of the 800px viewport.
      el.rect = { ...el.rect, top: 400 - el.rect.height / 2 };
      if (typeof el.onScrollIntoView === 'function') el.onScrollIntoView();
    },
    // A click activates: a checkbox flips, a radio becomes checked, and a
    // label passes the click on to its control. swallowsClicks stands for a
    // page whose own handler cancels the click.
    dispatchEvent(event) {
      el.events.push(event.type);
      if (event.type === 'click' && !el.swallowsClicks) el.activate();
      return true;
    },
    activate() {
      if (el.tagName === 'LABEL') {
        const control = el.control;
        if (control) control.activate();
      } else if (isToggle(el) && !el.disabled) {
        checked = el.type === 'radio' ? true : !checked;
      }
    },
    get control() {
      if (el.tagName !== 'LABEL') return undefined;
      const forId = el.getAttribute('for');
      if (forId !== null) return el.ownerDocument ? el.ownerDocument.getElementById(forId) : null;
      return el.querySelector('input');
    },
    // input.labels exists only when the document says so, so both the native
    // list and the wrapping / for= lookup are exercised.
    get labels() {
      const doc = el.ownerDocument;
      if (!doc || !doc.nativeLabels || el.tagName !== 'INPUT') return undefined;
      return descendants(doc.body).filter((node) => node.tagName === 'LABEL' && node.control === el);
    },
    get isConnected() { return !!el.ownerDocument && el.getRootNode() === el.ownerDocument; },
    get id() { return el.getAttribute('id') || ''; },
    get name() { return el.getAttribute('name') || ''; },
    get className() { return el.getAttribute('class') || ''; },
    get classList() { return { contains: (name) => el.className.split(/\s+/).includes(name) }; },
    get placeholder() { return el.getAttribute('placeholder') || ''; },
    get href() { return el.getAttribute('href') || ''; },
    get type() {
      if (el.tagName === 'INPUT') return (el.getAttribute('type') || 'text').toLowerCase();
      if (el.tagName === 'BUTTON') return (el.getAttribute('type') || 'submit').toLowerCase();
      return el.getAttribute('type') || '';
    },
    get value() { return attributes.get('value') || ''; },
    get disabled() { return el.hasAttribute('disabled'); },
    get required() { return el.hasAttribute('required'); },
    get checked() { return isToggle(el) ? checked : undefined; },
    set checked(next) {
      el.scriptWrites++;
      checked = !!next;
    },
    get form() { return el.parentElement ? el.parentElement.closest('form') : null; },
    get isContentEditable() { return el.getAttribute('contenteditable') === 'true'; },
    get children() { return el.childNodes.filter((node) => node.nodeType === 1); },
    get firstElementChild() { return el.children[0] || null; },
    get nextElementSibling() {
      if (!el.parentNode) return null;
      const siblings = el.parentNode.childNodes.filter((node) => node.nodeType === 1);
      return siblings[siblings.indexOf(el) + 1] || null;
    },
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

function makeDocument(options) {
  const doc = {
    nodeType: 9,
    activeElement: null,
    title: 'Preferences',
    visibilityState: 'visible',
    nativeLabels: options.nativeLabels === true,
    forms: [],
    documentElement: { scrollHeight: 800, scrollTop: 0, clientHeight: 800 },
    querySelectorAll(selector) { return descendants(doc.body).filter((node) => matchesList(node, selector)); },
    querySelector(selector) { return descendants(doc.body).find((node) => matchesList(node, selector)) || null; },
    getElementById(id) { return descendants(doc.body).find((node) => node.id === id) || null; },
    // The last painted element with a box at the point. Opacity does not stop
    // a hit; display:none and visibility:hidden do.
    elementFromPoint(x, y) {
      let hit = doc.body;
      for (const node of descendants(doc.body)) {
        const r = node.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || node.style.visibility === 'hidden') continue;
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = node;
      }
      return hit;
    },
  };
  const body = makeElement('body');
  body.rect = { left: 0, top: 0, width: 1280, height: 800 };
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
  actions: read('extension/content/actions.js'),
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
  const doc = makeDocument(options);
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
    screenX: 0,
    screenY: 0,
    location: { href: 'https://forms.example/preferences', hostname: 'forms.example', pathname: '/preferences' },
    scrollBy: noop,
    fetch: async () => ({}),
  };
  win.top = win;
  class MouseEvent {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  class Event {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  class XMLHttpRequest {
    open() {}
    send() {}
  }
  const sandbox = {
    window: win,
    document: doc,
    console,
    URL,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    WeakRef,
    WeakSet,
    MouseEvent,
    Event,
    MutationObserver,
    XMLHttpRequest,
    CSS: { escape: (value) => String(value) },
    crypto: { randomUUID: () => 'test-action-id', getRandomValues: (bytes) => bytes },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    getComputedStyle: (el) => ({
      display: el.style.display || 'block',
      visibility: el.style.visibility || 'visible',
      opacity: el.style.opacity || '1',
      position: 'static',
      pointerEvents: 'auto',
      cursor: 'auto',
    }),
  };
  win.getComputedStyle = sandbox.getComputedStyle;
  vm.createContext(sandbox);
  for (const [name, source] of [
    ['utils.js', SOURCES.utils],
    ['dom-state.js', SOURCES.domState],
    ['selectors.js', SOURCES.selectors],
    ['accessibility.js', SOURCES.accessibility],
    ['dom-analysis.js', SOURCES.domAnalysis],
    ['actions.js', SOURCES.actions],
  ]) {
    vm.runInContext(source, sandbox, { filename: name });
  }
  FSB.generateSelectors = (el) => [{ selector: el.id ? `#${el.id}` : el.tagName.toLowerCase() }];
  FSB.viewportGlow = { show: noop, setState: noop, destroy: noop };
  // Defined in messaging.js, which is not loaded whole.
  FSB.isCanvasBasedEditor = () => false;
  FSB.progressOverlay = { create: noop, update: noop, show: noop };

  const prelude = vm.runInContext(
    `(function (request, FSB, sendResponse, document, logger) {${executeActionPrelude()}\nreturn 'continued';\n})`,
    sandbox,
    { filename: 'messaging.js#executeAction-prelude' }
  );
  // The way an MCP call or an autopilot step reaches a content tool: target
  // resolution (name, ref) first, then the real tool.
  async function execute(tool, params) {
    const responses = [];
    const request = { action: 'executeAction', tool, params, source: 'mcp-manual' };
    const outcome = prelude(request, FSB, (response) => responses.push(response), doc, logger);
    if (outcome !== 'continued') return { refused: responses[0], result: null, target: null };
    const target = params.selector ? FSB.querySelectorWithShadow(params.selector) : null;
    return { refused: null, result: await FSB.tools[tool](params), target };
  }

  const el = (tag, attrs, children) => adopt(doc, makeElement(tag, attrs, children));
  const append = (...nodes) => { for (const node of nodes) doc.body.appendChild(adopt(doc, node)); };
  return { FSB, doc, el, append, execute };
}

// A checkbox (a radio with attrs.type) hidden the given way. It keeps a 16px
// box of its own unless the hiding leaves none.
function hiddenToggle(ctx, id, how, attrs = {}) {
  const input = ctx.el('input', { id, type: 'checkbox', ...attrs });
  input.rect = { left: 10, top: 10, width: 16, height: 16 };
  if (how === 'opacity') input.style.opacity = '0';
  if (how === 'display') input.style.display = 'none';
  if (how === 'no-size') input.rect = { left: 10, top: 10, width: 0, height: 0 };
  return input;
}

function at(node, top, left = 40) {
  node.rect = { left, top, width: node.rect.width, height: node.rect.height };
  return node;
}

function refFor(view, role, name) {
  const match = view.match(new RegExp(`^(e\\d+) ${role} "${name}"`, 'm'));
  assert.ok(match, `view lists ${role} "${name}":\n${view}`);
  return match[1];
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

// Elements are compared by id: a failed assertion then prints two short
// strings instead of walking the stub document.
function idOf(node) {
  return node ? node.id : null;
}

function ids(nodes) {
  return Array.from(nodes, idOf);
}

const NOT_VISIBLE = 'Element not ready: Element not visible (checkVisibility returned false)';

// ---------------------------------------------------------------------------
// Which label stands in

test('only a hidden native checkbox or radio with a visible label has a stand-in label', () => {
  for (const nativeLabels of [false, true]) {
    const ctx = loadContentScripts({ nativeLabels });
    const find = (node) => idOf(ctx.FSB.visibleLabelOfHiddenToggle(node));

    const wrapped = hiddenToggle(ctx, 'wrapped', 'opacity');
    const wrappingLabel = ctx.el('label', { id: 'wrapped-label' }, [wrapped, 'Email updates']);
    const named = hiddenToggle(ctx, 'named', 'display', { type: 'radio' });
    const namingLabel = ctx.el('label', { id: 'named-label', for: 'named' }, ['Text messages']);
    const sizeless = hiddenToggle(ctx, 'sizeless', 'no-size');
    const sizelessLabel = ctx.el('label', { id: 'sizeless-label', for: 'sizeless' }, ['Phone calls']);
    const shown = ctx.el('input', { id: 'shown', type: 'checkbox' });
    const shownLabel = ctx.el('label', { for: 'shown' }, ['Paper mail']);
    const orphan = hiddenToggle(ctx, 'orphan', 'opacity');
    const hiddenBoth = hiddenToggle(ctx, 'hidden-both', 'opacity');
    const hiddenLabel = ctx.el('label', { for: 'hidden-both' }, ['Never shown']);
    hiddenLabel.style.display = 'none';
    const textField = ctx.el('input', { id: 'text-field', type: 'text' });
    textField.style.opacity = '0';
    const textLabel = ctx.el('label', { for: 'text-field' }, ['Nickname']);
    const fakeBox = ctx.el('div', { id: 'fake-box', role: 'checkbox' }, []);
    fakeBox.style.opacity = '0';
    const fakeLabel = ctx.el('label', { for: 'fake-box' }, ['Scripted box']);
    ctx.append(wrappingLabel, named, namingLabel, sizeless, sizelessLabel, shown, shownLabel, orphan,
      hiddenBoth, hiddenLabel, textField, textLabel, fakeBox, fakeLabel);

    const mode = nativeLabels ? 'input.labels' : 'wrapping label / label[for]';
    assert.equal(find(wrapped), 'wrapped-label', `${mode}: opacity 0 inside its label`);
    assert.equal(find(named), 'named-label', `${mode}: display none, named by for=`);
    assert.equal(find(sizeless), 'sizeless-label', `${mode}: no size`);
    assert.equal(find(shown), null, `${mode}: a visible checkbox needs no stand-in`);
    assert.equal(find(orphan), null, `${mode}: no label`);
    assert.equal(find(hiddenBoth), null, `${mode}: its label is hidden too`);
    assert.equal(find(textField), null, `${mode}: a hidden text field is not a toggle`);
    assert.equal(find(fakeBox), null, `${mode}: a scripted role=checkbox is not a native input`);
    assert.equal(find(wrappingLabel), null, `${mode}: a label is not a toggle`);
    assert.equal(find(null), null);
  }
});

// ---------------------------------------------------------------------------
// Listing

function preferencesPage(ctx) {
  const email = hiddenToggle(ctx, 'email', 'opacity');
  const emailLabel = at(ctx.el('label', { id: 'email-label' }, [email, 'Email updates']), 100);
  at(email, 104);
  const sms = at(hiddenToggle(ctx, 'sms', 'display', { checked: true }), 140);
  const smsLabel = at(ctx.el('label', { id: 'sms-label', for: 'sms' }, ['Text messages']), 140);
  const weekly = at(hiddenToggle(ctx, 'weekly', 'no-size', { type: 'radio', name: 'frequency' }), 180);
  const weeklyLabel = at(ctx.el('label', { id: 'weekly-label', for: 'weekly' }, ['Weekly']), 180);
  const post = at(ctx.el('input', { id: 'post', type: 'checkbox' }), 220, 10);
  post.rect = { ...post.rect, width: 16, height: 16 };
  const postLabel = at(ctx.el('label', { id: 'post-label', for: 'post' }, ['Paper mail']), 220);
  const orphan = at(hiddenToggle(ctx, 'orphan', 'opacity'), 260);
  const ghost = at(hiddenToggle(ctx, 'ghost', 'opacity'), 300);
  const ghostLabel = at(ctx.el('label', { id: 'ghost-label', for: 'ghost' }, ['Never shown']), 300);
  ghostLabel.style.display = 'none';
  const save = at(ctx.el('button', { id: 'save', type: 'button' }, ['Save']), 340);
  ctx.append(ctx.el('main', {}, [emailLabel, sms, smsLabel, weekly, weeklyLabel, post, postLabel, orphan, ghost, ghostLabel, save]));
  return { email, emailLabel, sms, smsLabel, weekly, weeklyLabel, post, postLabel, orphan, ghost, ghostLabel, save };
}

test('a hidden checkbox or radio is listed once, as itself, while its label is visible', () => {
  for (const nativeLabels of [false, true]) {
    const ctx = loadContentScripts({ nativeLabels });
    const page = preferencesPage(ctx);
    const listed = ctx.FSB.getFilteredElements({ maxElements: Infinity });

    for (const input of [page.email, page.sms, page.weekly]) assert.ok(listed.includes(input), `${input.id} is listed`);
    for (const label of [page.emailLabel, page.smsLabel, page.weeklyLabel]) {
      assert.equal(listed.includes(label), false, `${label.id} is left out for its input`);
    }
    assert.equal(listed.includes(page.orphan), false, 'a hidden input with no label is not listed');
    assert.equal(listed.includes(page.ghost), false, 'a hidden input whose label is hidden is not listed');
    assert.equal(listed.includes(page.ghostLabel), false);
    // A visible checkbox and its for= label are listed exactly as before.
    assert.ok(listed.includes(page.post) && listed.includes(page.postLabel));
    assert.ok(listed.includes(page.save));
    assert.equal(new Set(listed).size, listed.length, 'no element twice');
  }
});

test('a hidden text field or an aria-hidden input is not listed through its label', () => {
  const ctx = loadContentScripts();
  const nickname = ctx.el('input', { id: 'nickname', type: 'text' });
  nickname.style.opacity = '0';
  const nicknameLabel = ctx.el('label', { id: 'nickname-label', for: 'nickname' }, ['Nickname']);
  const mirrored = hiddenToggle(ctx, 'mirrored', 'opacity', { 'aria-hidden': 'true' });
  const mirroredLabel = ctx.el('label', { id: 'mirrored-label', for: 'mirrored' }, ['Mirrored']);
  ctx.append(nickname, nicknameLabel, mirrored, mirroredLabel);
  assert.deepEqual(ids(ctx.FSB.getFilteredElements({ maxElements: Infinity })), ['nickname-label', 'mirrored-label']);
});

test('the page view names each styled control once, with its role, label name and state', () => {
  const ctx = loadContentScripts();
  preferencesPage(ctx);
  const { view, shown, more } = ctx.FSB.buildPageView();
  const lines = view.split('\n').slice(1);

  assert.match(lines[0], /^e\d+ checkbox "Email updates"$/, view);
  assert.match(lines[1], /^e\d+ checkbox "Text messages" \[checked\]$/, view);
  assert.match(lines[2], /^e\d+ radio "Weekly"$/, view);
  assert.match(lines[3], /^e\d+ checkbox "Paper mail"$/, view);
  assert.match(lines[4], /^e\d+ label$/, 'a visible checkbox keeps its for= label line, as before');
  assert.match(lines[5], /^e\d+ button "Save"$/, view);
  assert.equal(lines.length, 6, view);
  for (const name of ['Email updates', 'Text messages', 'Weekly']) assert.equal(count(view, `"${name}"`), 1, `${name} once`);
  assert.equal(view.includes('Never shown'), false);
  assert.equal(shown, 6);
  assert.equal(more, 0, 'the labels left out are not counted as further elements');
});

test('the page snapshot gives each styled control one ref, whatever hides the input', () => {
  const ctx = loadContentScripts();
  preferencesPage(ctx);
  const { snapshot } = ctx.FSB.buildMarkdownSnapshot({});

  assert.match(snapshot, /`e\d+: checkbox "Email updates"`/);
  assert.match(snapshot, /`e\d+: checkbox "Text messages" \[checked\]`/, 'a display:none input is still written');
  assert.match(snapshot, /`e\d+: radio "Weekly"`/);
  for (const name of ['Email updates', 'Text messages', 'Weekly']) {
    assert.equal(count(snapshot, `"${name}"`), 1, `${name} has one ref:\n${snapshot}`);
  }
  assert.equal(count(snapshot, ': label`'), 1, 'only the visible checkbox keeps a label ref, as before');
  assert.equal(snapshot.includes('Never shown'), false);
});

test('a styled control far down the page is scored and placed by its label box', () => {
  const ctx = loadContentScripts();
  // display:none leaves the input a zero box at the origin; its label is below the fold.
  const far = hiddenToggle(ctx, 'far', 'display');
  const farLabel = at(ctx.el('label', { for: 'far' }, ['Far away']), 2400);
  const near = hiddenToggle(ctx, 'near', 'display');
  const nearLabel = at(ctx.el('label', { for: 'near' }, ['Close by']), 100);
  ctx.append(far, farLabel, near, nearLabel);
  const score = (node) => ctx.FSB.calculateElementScore(node, 'general', true);
  assert.equal(score(near) - score(far), 10, 'only the control whose label is in the viewport gets the viewport bonus');
  // The structured DOM keeps viewport elements only, by the same box.
  assert.deepEqual(ids(ctx.FSB.getStructuredDOM({}).elements), ['near']);
});

// ---------------------------------------------------------------------------
// Acting

test('check_box on a hidden input inside its label clicks the label and reports the new state', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);
  const ref = refFor(ctx.FSB.buildPageView().view, 'checkbox', 'Email updates');

  const { refused, result } = await ctx.execute('toggleCheckbox', { selector: ref });
  assert.equal(refused, null);
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.checked, true);
  assert.equal(result.viaLabel, true, 'the result says the label was used');
  assert.equal(result.hadEffect, true);
  assert.equal(result.verification.verified, true);
  assert.equal(result.verification.changes.checkedChanged, true);
  assert.equal(page.email.checked, true);
  assert.deepEqual(page.emailLabel.events, ['mousedown', 'mouseup', 'click'], 'one click, on the label');
  assert.deepEqual(page.email.events, [], 'nothing is dispatched on the hidden input');
  assert.equal(page.email.scriptWrites, 0, 'checked is never assigned by script');
});

test('check_box on a hidden input named by label[for] clicks that label, and toggles as before', async () => {
  for (const nativeLabels of [false, true]) {
    const ctx = loadContentScripts({ nativeLabels });
    const page = preferencesPage(ctx);
    const ref = refFor(ctx.FSB.buildPageView().view, 'checkbox', 'Text messages');

    // It starts checked: check_box with no wanted state toggles, so it unticks.
    const off = (await ctx.execute('toggleCheckbox', { selector: ref })).result;
    assert.equal(off.success, true, JSON.stringify(off));
    assert.equal(off.checked, false);
    assert.equal(off.viaLabel, true);
    assert.equal(page.sms.checked, false);
    assert.deepEqual(page.smsLabel.events, ['mousedown', 'mouseup', 'click']);

    const on = (await ctx.execute('toggleCheckbox', { selector: ref })).result;
    assert.equal(on.success, true);
    assert.equal(on.checked, true);
    assert.equal(page.smsLabel.events.filter((type) => type === 'click').length, 2);

    // A wanted state it already has: nothing is clicked.
    const already = (await ctx.execute('toggleCheckbox', { selector: ref, checked: true })).result;
    assert.equal(already.success, true);
    assert.equal(already.alreadyInState, true);
    assert.equal(page.smsLabel.events.filter((type) => type === 'click').length, 2);

    const wantedOff = (await ctx.execute('toggleCheckbox', { selector: ref, checked: false })).result;
    assert.equal(wantedOff.success, true);
    assert.equal(wantedOff.checked, false);
    assert.equal(wantedOff.viaLabel, true);
    assert.equal(page.sms.scriptWrites, 0);
    assert.deepEqual(page.sms.events, []);
  }
});

test('click on a hidden radio clicks its label and succeeds only when it became checked', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);
  const ref = refFor(ctx.FSB.buildPageView().view, 'radio', 'Weekly');

  const first = (await ctx.execute('click', { selector: ref })).result;
  assert.equal(first.success, true, JSON.stringify(first));
  assert.equal(first.hadEffect, true);
  assert.equal(first.checked, true);
  assert.equal(first.viaLabel, true);
  assert.equal(first.verification.changes.checkedChanged, true);
  assert.equal(page.weekly.checked, true);
  assert.deepEqual(page.weeklyLabel.events, ['mousedown', 'mouseup', 'click']);
  assert.deepEqual(page.weekly.events, []);

  // A radio that is already selected does not change: that is not reported as a success.
  const again = (await ctx.execute('click', { selector: ref })).result;
  assert.equal(again.success, false);
  assert.equal(again.hadEffect, false);
  assert.equal(again.outcome, 'unknown');
  assert.equal(again.mayHaveExecuted, true);
  assert.equal(again.viaLabel, true);
  assert.match(again.error, /^Clicked its label, but the radio is still checked\./);
  assert.equal(page.weekly.checked, true);
});

test('click on a hidden checkbox flips it through its label', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);
  const result = (await ctx.execute('click', { selector: '#email' })).result;
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.checked, true);
  assert.equal(result.viaLabel, true);
  assert.deepEqual(page.emailLabel.events, ['mousedown', 'mouseup', 'click']);
  assert.deepEqual(page.email.events, []);
});

test('a state that does not change is reported as a failure', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);
  // The page cancels clicks on these labels, so the inputs never change.
  page.emailLabel.swallowsClicks = true;
  page.weeklyLabel.swallowsClicks = true;

  const toggled = (await ctx.execute('toggleCheckbox', { selector: '#email' })).result;
  assert.equal(toggled.success, false, JSON.stringify(toggled));
  assert.equal(toggled.error, 'Clicked its label, but the checkbox is still unchecked. Inspect the page before retrying.');
  assert.equal(toggled.outcome, 'unknown', 'the label click went out, so the outcome is unknown');
  assert.equal(toggled.mayHaveExecuted, true);
  assert.equal(page.email.checked, false);
  assert.equal(page.emailLabel.events.filter((type) => type === 'click').length, 1, 'the label was clicked once, not retried');
  assert.equal(page.email.scriptWrites, 0, 'the state is not forced by script');

  // More selectors for the same control: the label is still clicked once,
  // since a second click could toggle a control whose state lives elsewhere.
  page.emailLabel.events.length = 0;
  const cascade = (await ctx.execute('toggleCheckbox', { selector: '#email', selectors: ['#email', '#email'] })).result;
  assert.equal(cascade.success, false);
  assert.equal(cascade.outcome, 'unknown');
  assert.equal(page.emailLabel.events.filter((type) => type === 'click').length, 1, 'no further selector is tried after the label click');

  const wanted = (await ctx.execute('toggleCheckbox', { selector: '#email', checked: true })).result;
  assert.equal(wanted.success, false);
  assert.equal(page.email.checked, false);

  const clicked = (await ctx.execute('click', { selector: '#weekly' })).result;
  assert.equal(clicked.success, false);
  assert.equal(clicked.hadEffect, false);
  assert.equal(clicked.outcome, 'unknown');
  assert.equal(clicked.mayHaveExecuted, true);
  assert.match(clicked.error, /^Clicked its label, but the radio is still unchecked\./);
  assert.equal(page.weekly.checked, false);
});

test('a change away from the wanted state is reported as a failure', async () => {
  const ctx = loadContentScripts();
  const racy = hiddenToggle(ctx, 'racy', 'display');
  const racyLabel = at(ctx.el('label', { for: 'racy' }, ['Remember me']), 2400);
  ctx.append(racy, racyLabel);
  // The page ticks the box itself while its label is being scrolled into
  // view, so the click that follows unticks it.
  racyLabel.onScrollIntoView = () => racy.activate();

  const toggled = (await ctx.execute('toggleCheckbox', { selector: '#racy', checked: true })).result;
  assert.equal(toggled.success, false, JSON.stringify(toggled));
  assert.equal(toggled.error, 'Clicked its label, but the checkbox is now unchecked. Inspect the page before retrying.');
  assert.equal(toggled.mayHaveExecuted, true);
  assert.equal(racy.checked, false);
  assert.equal(racyLabel.events.filter((type) => type === 'click').length, 1);
});

test('a hidden input with no visible label is still refused, and nothing is dispatched', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);

  for (const id of ['orphan', 'ghost']) {
    const toggled = (await ctx.execute('toggleCheckbox', { selector: `#${id}` })).result;
    assert.equal(toggled.success, false, id);
    assert.equal(toggled.error, NOT_VISIBLE, id);
    assert.equal(toggled.viaLabel, undefined);

    const clicked = (await ctx.execute('click', { selector: `#${id}` })).result;
    assert.equal(clicked.success, false, id);
    assert.equal(clicked.error, NOT_VISIBLE, id);
    assert.equal(clicked.viaLabel, undefined);

    assert.equal(page[id].checked, false);
    assert.deepEqual(page[id].events, []);
    assert.equal(page[id].scriptWrites, 0);
  }
  assert.deepEqual(page.ghostLabel.events, []);
});

test('the visibility rule is unchanged for everything that is not a native checkbox or radio', async () => {
  const ctx = loadContentScripts();
  const button = ctx.el('button', { id: 'faded', type: 'button' }, ['Faded']);
  button.style.opacity = '0';
  const buttonLabel = ctx.el('label', { id: 'faded-label', for: 'faded' }, ['Faded action']);
  const fakeBox = ctx.el('div', { id: 'fake-box', role: 'checkbox', 'aria-checked': 'false', tabindex: '0' }, []);
  fakeBox.style.opacity = '0';
  const fakeLabel = ctx.el('label', { id: 'fake-label', for: 'fake-box' }, ['Scripted box']);
  ctx.append(button, buttonLabel, fakeBox, fakeLabel);

  for (const id of ['faded', 'fake-box']) {
    const clicked = (await ctx.execute('click', { selector: `#${id}` })).result;
    assert.equal(clicked.success, false, id);
    assert.equal(clicked.error, NOT_VISIBLE, id);
  }
  assert.deepEqual(buttonLabel.events, []);
  assert.deepEqual(fakeLabel.events, []);
  assert.deepEqual(button.events, []);
  assert.deepEqual(fakeBox.events, []);
  assert.deepEqual(ids(ctx.FSB.getFilteredElements({ maxElements: Infinity })), ['faded-label', 'fake-label'],
    'neither hidden control is listed through its label');
});

test('a disabled styled control is refused before its label is clicked', async () => {
  const ctx = loadContentScripts();
  const locked = hiddenToggle(ctx, 'locked', 'opacity', { disabled: true });
  const lockedLabel = at(ctx.el('label', { for: 'locked' }, ['Locked']), 100);
  ctx.append(locked, lockedLabel);

  const toggled = (await ctx.execute('toggleCheckbox', { selector: '#locked' })).result;
  assert.equal(toggled.success, false);
  assert.match(toggled.error, /^Element not ready: Element is disabled/);
  const clicked = (await ctx.execute('click', { selector: '#locked' })).result;
  assert.equal(clicked.success, false);
  assert.match(clicked.error, /^Element not ready: Element is disabled/);
  assert.deepEqual(lockedLabel.events, []);
  assert.equal(locked.checked, false);
});

test('a visible checkbox is listed and ticked as before, without its label', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);
  const ref = refFor(ctx.FSB.buildPageView().view, 'checkbox', 'Paper mail');

  const toggled = (await ctx.execute('toggleCheckbox', { selector: ref })).result;
  assert.equal(toggled.success, true, JSON.stringify(toggled));
  assert.equal(toggled.checked, true);
  assert.equal(toggled.viaLabel, undefined, 'no label was used');
  assert.equal(page.post.scriptWrites, 1, 'the state is set on the input, as before');
  assert.deepEqual(page.post.events, ['change']);
  assert.deepEqual(page.postLabel.events, []);

  const clicked = (await ctx.execute('click', { selector: ref })).result;
  assert.equal(clicked.success, true, JSON.stringify(clicked));
  assert.equal(clicked.viaLabel, undefined);
  assert.equal(page.post.checked, false, 'the click on the input itself unticked it');
  assert.deepEqual(page.post.events, ['change', 'mousedown', 'mouseup', 'click']);
  assert.deepEqual(page.postLabel.events, []);
});

test('a canvas editor page keeps its own click path', async () => {
  const ctx = loadContentScripts();
  const page = preferencesPage(ctx);
  // Canvas editors run no readiness checks, so the click goes to the input as before.
  ctx.FSB.isCanvasBasedEditor = () => true;

  const clicked = (await ctx.execute('click', { selector: '#email' })).result;
  assert.equal(clicked.success, true, JSON.stringify(clicked));
  assert.equal(clicked.viaLabel, undefined);
  assert.deepEqual(page.email.events, ['mousedown', 'mouseup', 'click']);
  assert.deepEqual(page.emailLabel.events, []);
});

test('a label below the fold is the box that is scrolled into view', async () => {
  const ctx = loadContentScripts();
  const far = hiddenToggle(ctx, 'far', 'display');
  const farLabel = at(ctx.el('label', { for: 'far' }, ['Far away']), 2400);
  ctx.append(far, farLabel);

  const toggled = (await ctx.execute('toggleCheckbox', { selector: '#far' })).result;
  assert.equal(toggled.success, true, JSON.stringify(toggled));
  assert.equal(toggled.viaLabel, true);
  assert.equal(farLabel.scrolls.length, 1, 'the label is brought into view before the click');
  assert.equal(far.scrolls.length, 0, 'the input has no box to scroll to');

  // scroll_to_element on the same control uses the label box too.
  at(farLabel, 2400);
  const scrolled = await ctx.FSB.tools.scrollToElement({ selector: '#far' });
  assert.equal(scrolled.success, true);
  assert.equal(scrolled.elementInViewport, true);
  assert.equal(farLabel.scrolls.length, 2);
  assert.equal(far.scrolls.length, 0);
});

// ---------------------------------------------------------------------------
// Name binding and the fast-mode menu

// Both read a control's labels from input.labels, as every browser provides it.

test('a name target binds the styled control itself, for check_box and for click', async () => {
  const ctx = loadContentScripts({ nativeLabels: true });
  const page = preferencesPage(ctx);

  const toggled = await ctx.execute('toggleCheckbox', { selector: 'text=Email updates' });
  assert.equal(toggled.refused, null, JSON.stringify(toggled.refused));
  assert.equal(toggled.result.success, true);
  assert.equal(toggled.result.viaLabel, true);
  assert.equal(idOf(toggled.target), 'email', 'the name bound the input, not its label');
  assert.equal(page.email.checked, true);

  // The for= label and its hidden input carry the same name: one control, not two candidates.
  const clicked = await ctx.execute('click', { selector: 'text=Weekly' });
  assert.equal(clicked.refused, null, JSON.stringify(clicked.refused));
  assert.equal(clicked.result.success, true, JSON.stringify(clicked.result));
  assert.equal(clicked.result.viaLabel, true);
  assert.equal(idOf(clicked.target), 'weekly', 'the name bound the input, not its label');
  assert.equal(page.weekly.checked, true);
  assert.deepEqual(page.weeklyLabel.events, ['mousedown', 'mouseup', 'click']);

  // A hidden control with no visible label is still not a candidate.
  const ghost = await ctx.execute('click', { selector: 'text=Never shown' });
  assert.equal(ghost.refused.errorCode, 'BIND_NOT_FOUND');
  assert.deepEqual(page.ghostLabel.events, []);
});

test('the fast-mode menu never offers a styled control as a fast step', () => {
  const ctx = loadContentScripts({ nativeLabels: true });
  const page = preferencesPage(ctx);
  const menu = ctx.FSB.buildJevMenu({});
  assert.equal(menu.success, true, JSON.stringify(menu));
  const entry = (label) => menu.entries.find((item) => item.label === label && item.role !== 'label');

  for (const label of ['Email updates', 'Weekly']) {
    assert.equal(entry(label).hidden, true, label);
    assert.equal(entry(label).fastEligible, false, label);
  }
  assert.equal(entry('Paper mail').hidden, false);
  assert.equal(entry('Paper mail').fastEligible, true, 'a visible checkbox is offered as before');
  assert.equal(page.email.checked, false);
});

// ---------------------------------------------------------------------------
// Wiring

test('the suite runs once in the npm test chain and the refinements command list', () => {
  const pkg = JSON.parse(read('package.json'));
  const command = 'node tests/styled-toggle-label.test.js';
  const chain = pkg.scripts.test.split(' && ');
  assert.equal(chain.filter((cmd) => cmd === command).length, 1);
  const contract = read('tests/delegation-phase-contract.test.js');
  assert.equal(count(contract, `'${command}',`), 1);
});
