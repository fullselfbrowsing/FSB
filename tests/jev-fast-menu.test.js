'use strict';

// Phase 68 fast-mode element menu (plan 68-02).
//
// Covers the content-side half of the fast-mode menu:
//   - the separate fast-mode registry in dom-state.js (FSB.jevRefMap) and the
//     vault-fill marks (FSB.vaultFilledElements / FSB.noteVaultFilled);
//   - the guarded vault-fill mark calls in actions.js;
//   - (plan 68-03) the strict resolver FSB.resolveJevHandle and the content
//     verb table FSB.jevContentVerbOps, the getJevMenu message case and the jev
//     branch of executeAction in messaging.js, and the real executeTool
//     dispatch path from extension/ai/tool-executor.js into that branch.
//
// Plain Node script: check() counters, a results line and an exit code.
// Node 20 compatible; binds no port.

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const kit = require('./fixtures/jev-content-dom-kit.js');

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

function section(title) {
  console.log(`\n--- ${title} ---`);
}

// Async cases are queued and run in order after every synchronous case.
const asyncChecks = [];
function checkAsync(label, fn) {
  asyncChecks.push({ label, fn, title: null });
}
function sectionAsync(title) {
  asyncChecks.push({ label: null, fn: null, title });
}

const repoRoot = path.resolve(__dirname, '..');
const DOM_STATE_PATH = path.join(repoRoot, 'extension', 'content', 'dom-state.js');
const ACTIONS_PATH = path.join(repoRoot, 'extension', 'content', 'actions.js');
const domStateSource = fs.readFileSync(DOM_STATE_PATH, 'utf8');
const actionsSource = fs.readFileSync(ACTIONS_PATH, 'utf8');

const REGISTRY_BEGIN = '  // ---- Phase 68 fast-mode registry (begin) ----';
const REGISTRY_END = '  // ---- Phase 68 fast-mode registry (end) ----';

function sliceBetween(text, startMarker, endMarker, { includeEnd = false } = {}) {
  const start = text.indexOf(startMarker);
  assert.ok(start >= 0, `start marker present: ${startMarker.trim()}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `end marker present after start: ${endMarker.trim()}`);
  return text.slice(start, includeEnd ? end + endMarker.length : end);
}

function loadRegistrySlice(cryptoImpl) {
  const slice = sliceBetween(domStateSource, REGISTRY_BEGIN, REGISTRY_END, { includeEnd: true });
  const context = { WeakRef, WeakSet, Map, crypto: cryptoImpl };
  return vm.runInNewContext(
    `${slice}\n({ JevRefRegistry, jevRefMap, vaultFilledElements, noteVaultFilled })`,
    context,
    { filename: 'dom-state.js#fast-mode-registry' }
  );
}

function loadRefMapAndRegistry(cryptoImpl) {
  const slice = sliceBetween(domStateSource, '  class RefMap {', REGISTRY_END, { includeEnd: true });
  const context = { WeakRef, WeakSet, Map, crypto: cryptoImpl };
  return vm.runInNewContext(
    `${slice}\n({ RefMap, refMap, JevRefRegistry, jevRefMap })`,
    context,
    { filename: 'dom-state.js#refmap-and-registry' }
  );
}

// ---------------------------------------------------------------------------
section('fast-mode registry (dom-state.js)');

check('the registry block sits directly after the RefMap singleton', () => {
  const singleton = domStateSource.indexOf('  const refMap = new RefMap();');
  const begin = domStateSource.indexOf(REGISTRY_BEGIN);
  assert.ok(singleton > 0 && begin > singleton, 'registry block follows const refMap');
  const between = domStateSource.slice(singleton + '  const refMap = new RefMap();'.length, begin);
  assert.equal(between.trim(), '', 'nothing between the singleton and the registry block');
});

check('a fresh registry has generation <8 hex>-0 and reset() advances the counter', () => {
  const { JevRefRegistry } = loadRegistrySlice(kit.cryptoStub([0xab, 0x01, 0x9f, 0x30]));
  const registry = new JevRefRegistry();
  assert.match(registry.generation, /^[0-9a-f]{8}-0$/);
  const nonce = registry.generation.split('-')[0];
  registry.reset();
  assert.equal(registry.generation, `${nonce}-1`);
  registry.reset();
  assert.equal(registry.generation, `${nonce}-2`);
});

check('the nonce is computed once per registry instance from crypto.getRandomValues', () => {
  const stub = kit.cryptoStub([0x10, 0x20, 0x30, 0x40]);
  const { JevRefRegistry } = loadRegistrySlice(stub);
  const registry = new JevRefRegistry();
  const before = stub.calls;
  const first = registry.generation;
  registry.reset();
  registry.reset();
  const after = registry.generation;
  assert.equal(first.split('-')[0], after.split('-')[0]);
  assert.ok(stub.calls - before <= 1, 'getRandomValues is called at most once per instance');
  assert.ok(stub.calls >= 1, 'getRandomValues was used');
});

check('two registries (two documents) get different nonces', () => {
  const stub = kit.cryptoStub([0x01, 0x02, 0x03, 0x04]);
  const { JevRefRegistry } = loadRegistrySlice(stub);
  const a = new JevRefRegistry();
  const b = new JevRefRegistry();
  const nonceA = a.generation.split('-')[0];
  const nonceB = b.generation.split('-')[0];
  assert.match(nonceA, /^[0-9a-f]{8}$/);
  assert.match(nonceB, /^[0-9a-f]{8}$/);
  assert.notEqual(nonceA, nonceB);
});

check('register mints j1, j2, ... and restarts at j1 after reset()', () => {
  const { JevRefRegistry } = loadRegistrySlice(kit.cryptoStub());
  const registry = new JevRefRegistry();
  const a = kit.makeElement({ tag: 'button', text: 'A' });
  const b = kit.makeElement({ tag: 'button', text: 'B' });
  assert.equal(registry.register(a, 'button', 'A'), 'j1');
  assert.equal(registry.register(b, 'button', 'B'), 'j2');
  assert.equal(registry.size, 2);
  registry.reset();
  assert.equal(registry.size, 0);
  assert.equal(registry.register(b, 'button', 'B'), 'j1');
});

check('get returns the entry with role and name; e-refs and unknown handles are null', () => {
  const { JevRefRegistry } = loadRegistrySlice(kit.cryptoStub());
  const registry = new JevRefRegistry();
  const el = kit.makeElement({ tag: 'button', text: 'Next' });
  registry.register(el, 'button', 'Next');
  const entry = registry.get('j1');
  assert.ok(entry, 'entry for j1');
  assert.equal(entry.role, 'button');
  assert.equal(entry.name, 'Next');
  assert.equal(entry.element.deref(), el);
  assert.equal(registry.get('e1'), null);
  assert.equal(registry.get('j2'), null);
  assert.equal(registry.get(undefined), null);
});

check('findHandle returns the handle whose WeakRef derefs to the element, else null', () => {
  const { JevRefRegistry } = loadRegistrySlice(kit.cryptoStub());
  const registry = new JevRefRegistry();
  const a = kit.makeElement({ tag: 'a', attrs: { href: '/a' }, text: 'A' });
  const b = kit.makeElement({ tag: 'a', attrs: { href: '/b' }, text: 'B' });
  const stranger = kit.makeElement({ tag: 'a', attrs: { href: '/c' }, text: 'C' });
  registry.register(a, 'link', 'A');
  registry.register(b, 'link', 'B');
  assert.equal(registry.findHandle(b), 'j2');
  assert.equal(registry.findHandle(a), 'j1');
  assert.equal(registry.findHandle(stranger), null);
  assert.equal(registry.findHandle(null), null);
});

check('the fast-mode registry never resets or renumbers FSB.refMap (D-14)', () => {
  const { refMap, jevRefMap } = loadRefMapAndRegistry(kit.cryptoStub());
  const e = [1, 2, 3].map((n) => kit.makeElement({ tag: 'button', text: `B${n}` }));
  refMap.reset();
  e.forEach((el, i) => refMap.register(el, `#b${i + 1}`, 'button', `B${i + 1}`));
  const generationBefore = refMap.generationId;
  jevRefMap.reset();
  const others = [4, 5, 6, 7].map((n) => kit.makeElement({ tag: 'button', text: `B${n}` }));
  others.forEach((el, i) => jevRefMap.register(el, 'button', `B${i + 4}`));
  assert.equal(jevRefMap.size, 4);
  const resolved = refMap.resolve('e2');
  assert.ok(resolved && resolved.element === e[1], 'e2 still points at the same element');
  assert.equal(refMap.generationId, generationBefore, 'refMap generation unchanged');
  assert.equal(refMap.size, 3);
});

check('noteVaultFilled marks objects in the WeakSet and ignores non-objects', () => {
  const { vaultFilledElements, noteVaultFilled } = loadRegistrySlice(kit.cryptoStub());
  const field = kit.makeElement({ tag: 'input', attrs: { type: 'password' } });
  assert.equal(vaultFilledElements.has(field), false);
  noteVaultFilled(field);
  assert.equal(vaultFilledElements.has(field), true);
  for (const bad of [null, undefined, 'j1', 42, true]) {
    assert.doesNotThrow(() => noteVaultFilled(bad));
  }
});

check('dom-state.js exports the registry, the singleton and the vault marks next to FSB.refMap', () => {
  const exportsStart = domStateSource.indexOf('  FSB.refMap = refMap;');
  assert.ok(exportsStart > 0);
  const tail = domStateSource.slice(exportsStart);
  for (const line of [
    'FSB.JevRefRegistry = JevRefRegistry;',
    'FSB.jevRefMap = jevRefMap;',
    'FSB.vaultFilledElements = vaultFilledElements;',
    'FSB.noteVaultFilled = noteVaultFilled;',
  ]) {
    assert.ok(tail.includes(line), `export present: ${line}`);
  }
  assert.equal((domStateSource.match(/class JevRefRegistry/g) || []).length, 1);
});

check('the ElementCache slice markers other suites use are intact', () => {
  const start = domStateSource.indexOf('  class ElementCache {');
  const end = domStateSource.indexOf('  const elementCache =', start);
  assert.ok(start >= 0 && end > start);
});

// ---------------------------------------------------------------------------
section('vault-fill marks (actions.js)');

const GUARDED_MARK = /if \(typeof FSB\.noteVaultFilled === 'function'\) FSB\.noteVaultFilled\((\w+)\);/g;

function guardedCalls(body) {
  return Array.from(body.matchAll(GUARDED_MARK)).map((m) => m[1]);
}

check('fillCredentialFields marks the username and password fields it fills', () => {
  const body = sliceBetween(actionsSource, '  tools.fillCredentialFields = async (params) => {', '  tools.fillPaymentFields = async (params) => {');
  assert.deepEqual(guardedCalls(body), ['usernameField', 'passwordField']);
  const usernameFill = body.indexOf("filled.push('username');");
  const passwordFill = body.indexOf("filled.push('password');");
  const marks = Array.from(body.matchAll(GUARDED_MARK)).map((m) => m.index);
  assert.ok(marks[0] > usernameFill && marks[0] < passwordFill, 'username mark follows the username fill');
  assert.ok(marks[1] > passwordFill, 'password mark follows the password fill');
});

check('fillPaymentFields marks each element fillField fills on both success paths', () => {
  const body = sliceBetween(actionsSource, '  tools.fillPaymentFields = async (params) => {', '  FSB.clickAtCoordinates = clickAtCoordinates;');
  const fillField = sliceBetween(body, '    function fillField(element, value) {', '    // Fill card number');
  assert.deepEqual(guardedCalls(fillField), ['element', 'element']);
  assert.equal(guardedCalls(body).length, 2, 'no other mark in the payment handler');
  const returns = Array.from(fillField.matchAll(/return true;/g)).map((m) => m.index);
  const marks = Array.from(fillField.matchAll(GUARDED_MARK)).map((m) => m.index);
  assert.equal(returns.length, 2);
  assert.ok(marks[0] < returns[0] && marks[1] < returns[1] && marks[1] > returns[0], 'each mark sits right before a success return');
});

check('actions.js holds exactly these four guarded marks and no unguarded call', () => {
  assert.equal(guardedCalls(actionsSource).length, 4);
  assert.equal((actionsSource.match(/FSB\.noteVaultFilled\(/g) || []).length, 4);
});

// ---------------------------------------------------------------------------
// Shared vm context for dom-analysis.js: the dom-state registry slice, the real
// accessibility.js (getImplicitRole) and the whole dom-analysis.js, with the
// stub kit's window and document. Helpers the menu resolves at call time are
// assigned on FSB after loading so each case can stub them.

const ACCESSIBILITY_PATH = path.join(repoRoot, 'extension', 'content', 'accessibility.js');
const DOM_ANALYSIS_PATH = path.join(repoRoot, 'extension', 'content', 'dom-analysis.js');
const accessibilitySource = fs.readFileSync(ACCESSIBILITY_PATH, 'utf8');
const domAnalysisSource = fs.readFileSync(DOM_ANALYSIS_PATH, 'utf8');

const MENU_BEGIN = '  // ==== Phase 68 fast-mode element menu (begin) ====';
const MENU_END = '  // ==== Phase 68 fast-mode element menu (end) ====';

const noop = () => {};
const quietLogger = { log: noop, info: noop, warn: noop, error: noop, debug: noop, logDOMOperation: noop };

function stripUnicodeControlStub(str) {
  if (!str) return str;
  return String(str).replace(/[​-‏‪-‮⁠-⁩﻿­]/g, '');
}

function getClassNameStub(element) {
  if (!element) return '';
  const cn = element.className;
  if (typeof cn === 'string') return cn;
  if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
  return '';
}

function createContentContext(options = {}) {
  const win = options.window || kit.makeWindow({});
  const FSB = {
    _modules: {},
    logger: quietLogger,
    stripUnicodeControl: stripUnicodeControlStub,
    getClassName: getClassNameStub,
    isFsbElement: () => false,
  };
  win.FSB = FSB;
  win.__FSB_SKIP_INIT__ = false;
  const sandbox = {
    window: win,
    document: options.document || kit.makeDocument(kit.makeElement({ tag: 'body' })),
    console,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    WeakRef,
    WeakSet,
    // A content script has the URL parser; the same-origin link rule needs it.
    URL,
    crypto: kit.cryptoStub(options.seed || [0x5a, 0x11, 0xc3, 0x07]),
  };
  vm.createContext(sandbox);
  const registrySlice = sliceBetween(domStateSource, '  class RefMap {', REGISTRY_END, { includeEnd: true });
  const registry = vm.runInContext(
    `${registrySlice}\n({ RefMap, refMap, JevRefRegistry, jevRefMap, vaultFilledElements, noteVaultFilled })`,
    sandbox,
    { filename: 'dom-state.js#refmap-and-registry' }
  );
  FSB.RefMap = registry.RefMap;
  FSB.refMap = registry.refMap;
  FSB.JevRefRegistry = registry.JevRefRegistry;
  FSB.jevRefMap = registry.jevRefMap;
  FSB.vaultFilledElements = registry.vaultFilledElements;
  FSB.noteVaultFilled = registry.noteVaultFilled;
  vm.runInContext(accessibilitySource, sandbox, { filename: 'accessibility.js' });
  vm.runInContext(domAnalysisSource, sandbox, { filename: 'dom-analysis.js' });
  FSB.generateSelectors = () => [];
  FSB.querySelectorWithShadow = () => null;
  return {
    FSB,
    window: win,
    sandbox,
    setDocument(doc) { sandbox.document = doc; },
  };
}

const ctx = createContentContext();
const F = ctx.FSB;
const el = kit.makeElement;

// Build a document around the given nodes so getElementById works.
function page(children, options = {}) {
  const body = el({ tag: 'body', children });
  const doc = kit.makeDocument(body, options);
  ctx.setDocument(doc);
  return doc;
}

function menuBlock() {
  return sliceBetween(domAnalysisSource, MENU_BEGIN, MENU_END, { includeEnd: true });
}

function functionText(source, name) {
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `function ${name} present`);
  const end = source.indexOf('\n  }\n', start);
  assert.ok(end > start, `function ${name} closes`);
  return source.slice(start, end + 4);
}

// ---------------------------------------------------------------------------
section('menu block layout and exports (dom-analysis.js)');

check('the menu block is one contiguous marked block before the exports section', () => {
  assert.equal(domAnalysisSource.split(MENU_BEGIN).length - 1, 1);
  assert.equal(domAnalysisSource.split(MENU_END).length - 1, 1);
  const begin = domAnalysisSource.indexOf(MENU_BEGIN);
  const end = domAnalysisSource.indexOf(MENU_END);
  const exportsAt = domAnalysisSource.indexOf('  // EXPORT TO NAMESPACE');
  const lastFunction = domAnalysisSource.indexOf('  function getCanvasPixelFallback(');
  assert.ok(lastFunction > 0 && begin > lastFunction && end > begin && exportsAt > end);
});

check('FSB.jevMenuConstants is frozen with the documented values', () => {
  const c = F.jevMenuConstants;
  assert.ok(c && Object.isFrozen(c));
  assert.deepEqual(JSON.parse(JSON.stringify(c)), {
    MENU_CAP: 48,
    MENU_CAP_MIN: 32,
    MENU_CAP_MAX: 64,
    MENU_POOL: 256,
    TEXT_EXCERPT_CHARS: 2000,
    LABEL_CHARS: 80,
    ROLE_CHARS: 32,
    MORE_BELOW_PX: 200,
  });
  assert.ok(c.MENU_POOL > c.MENU_CAP_MAX);
});

check('labels, safe text, risk and ops are exported next to getFilteredElements', () => {
  for (const name of ['jevSafeText', 'jevMenuLabel', 'classifyJevRisk', 'jevElementOps']) {
    assert.equal(typeof F[name], 'function', `FSB.${name}`);
  }
  const exportsAt = domAnalysisSource.indexOf('  FSB.getFilteredElements = getFilteredElements;');
  const tail = domAnalysisSource.slice(exportsAt);
  for (const line of [
    'FSB.jevMenuConstants = jevMenuConstants;',
    'FSB.jevSafeText = jevSafeText;',
    'FSB.jevMenuLabel = jevMenuLabel;',
    'FSB.classifyJevRisk = classifyJevRisk;',
    'FSB.jevElementOps = jevElementOps;',
  ]) {
    assert.ok(tail.includes(line), `export present: ${line}`);
  }
});

check('the block never reads the value property, never names computeAccessibleName and never renders refs', () => {
  const block = menuBlock();
  const valueLines = block.split('\n').filter((line) => /\.value\b/.test(line) && !line.includes("getAttribute('value')"));
  assert.deepEqual(valueLines, []);
  assert.equal(block.includes('computeAccessibleName'), false);
  assert.equal(block.includes('formatInlineRef'), false);
  assert.equal(block.includes('FSB.refMap.reset'), false);
  assert.equal(/\bJEV_[A-Z_]+\b/.test(block), false);
  assert.equal(/FsbJev/.test(block), false);
  assert.equal(functionText(domAnalysisSource, 'jevSafeText').includes('textContent'), false);
  assert.equal(functionText(domAnalysisSource, 'jevMenuLabel').includes('textContent'), false);
});

// ---------------------------------------------------------------------------
section('jevSafeText and jevMenuLabel: value-free labels (F4, F18, D-13)');

check('jevSafeText skips controls, options, editable regions and text-entry roles below the root', () => {
  const root = el({
    tag: 'div',
    children: [
      'Keep ',
      el({ tag: 'textarea', text: 'SECRET-A' }),
      el({ tag: 'select', children: [el({ tag: 'option', text: 'SECRET-B' })] }),
      el({ tag: 'div', attrs: { contenteditable: 'true' }, text: 'SECRET-C' }),
      el({ tag: 'div', attrs: { contenteditable: '' }, text: 'SECRET-D' }),
      el({ tag: 'span', attrs: { contenteditable: 'false' }, text: 'this ' }),
      el({ tag: 'div', attrs: { role: 'textbox' }, text: 'SECRET-E' }),
      el({ tag: 'div', attrs: { role: 'combobox' }, text: 'SECRET-F' }),
      el({ tag: 'div', attrs: { 'aria-hidden': 'true' }, text: 'SECRET-G' }),
      el({ tag: 'script', text: 'SECRET-H' }),
      el({ tag: 'datalist', children: [el({ tag: 'option', text: 'SECRET-I' })] }),
      el({ tag: 'b', text: 'text' }),
    ],
  });
  assert.equal(F.jevSafeText(root, 80), 'Keep this text');
});

check('jevSafeText walks the root itself, collapses whitespace and cuts at code points', () => {
  const option = el({ tag: 'option', text: '  Opt\n  A  ' });
  assert.equal(F.jevSafeText(option, 80), 'Opt A');
  const long = el({ tag: 'span', text: '\u{1F600}'.repeat(10) + 'abc' });
  assert.equal(F.jevSafeText(long, 4), '\u{1F600}'.repeat(4));
});

check('F18: input type=submit value="Delete" is labelled "Delete"; input type=image alt="Search" is "Search"', () => {
  page([]);
  assert.equal(F.jevMenuLabel(el({ tag: 'input', attrs: { type: 'submit', value: 'Delete' } })), 'Delete');
  assert.equal(F.jevMenuLabel(el({ tag: 'input', attrs: { type: 'button', value: 'Next' } })), 'Next');
  assert.equal(F.jevMenuLabel(el({ tag: 'input', attrs: { type: 'reset', value: 'Clear form' } })), 'Clear form');
  assert.equal(F.jevMenuLabel(el({ tag: 'input', attrs: { type: 'image', alt: 'Search' } })), 'Search');
});

// The five F4 label cases, each with a secret marker that must reach no label.
function labelCases() {
  const bioArea = el({ tag: 'textarea', text: 'SECRET-DRAFT-2' });
  const bioLabel = el({ tag: 'label', children: ['Bio ', bioArea] });
  bioArea.labels = [bioLabel];

  const countrySelect = el({
    tag: 'select',
    children: [el({ tag: 'option', text: 'SECRET-OPT-A' }), el({ tag: 'option', text: 'SECRET-OPT-B' })],
  });
  const countryLabel = el({ tag: 'label', children: ['Country ', countrySelect] });
  countrySelect.labels = [countryLabel];

  const innerField = el({ tag: 'input', attrs: { id: 'x', value: 'SECRET-VAL' }, value: 'SECRET-VAL' });
  const nameLabel = el({ tag: 'label', attrs: { for: 'n' }, children: ['Name ', innerField] });
  const nameField = el({ tag: 'input', attrs: { id: 'n' } });
  nameField.labels = [nameLabel];
  innerField.labels = [nameLabel];

  const notesHolder = el({ tag: 'div', attrs: { id: 'd' }, children: ['Notes ', el({ tag: 'textarea', text: 'SECRET-DRAFT-3' })] });
  const notesField = el({ tag: 'input', attrs: { 'aria-labelledby': 'd' } });

  const editor = el({ tag: 'div', attrs: { contenteditable: 'true' }, text: 'SECRET-DRAFT-4' });
  const commentLabel = el({ tag: 'label', children: ['Comment ', editor] });

  const roleOption = el({ tag: 'div', attrs: { role: 'option' }, text: 'Option Two' });

  const doc = page([bioLabel, countryLabel, nameLabel, nameField, notesHolder, notesField, commentLabel, roleOption], {
    selectorMap: { 'label[for="n"]': [nameLabel] },
  });
  return { doc, bioArea, countrySelect, nameField, innerField, notesField, editor, roleOption };
}

const SECRET_MARKERS = ['SECRET-DRAFT-2', 'SECRET-OPT-A', 'SECRET-OPT-B', 'SECRET-VAL', 'SECRET-DRAFT-3', 'SECRET-DRAFT-4'];

check('F4 label cases: Bio, Country, Name, Notes and Comment carry no field content', () => {
  const c = labelCases();
  assert.equal(F.jevMenuLabel(c.bioArea), 'Bio');
  assert.equal(F.jevMenuLabel(c.countrySelect), 'Country');
  assert.equal(F.jevMenuLabel(c.nameField), 'Name');
  assert.equal(F.jevMenuLabel(c.innerField), 'Name');
  assert.equal(F.jevMenuLabel(c.notesField), 'Notes');
  assert.equal(F.jevMenuLabel(c.editor), 'Comment');
  for (const node of [c.bioArea, c.countrySelect, c.nameField, c.innerField, c.notesField, c.editor]) {
    const label = F.jevMenuLabel(node);
    for (const secret of SECRET_MARKERS) assert.equal(label.includes(secret), false, `${secret} leaked into "${label}"`);
  }
});

check('an option entry keeps its own text (role=option and a native option)', () => {
  const c = labelCases();
  assert.equal(F.jevMenuLabel(c.roleOption), 'Option Two');
  assert.equal(F.jevMenuLabel(el({ tag: 'option', text: 'Native option' })), 'Native option');
});

check('label sources follow the ARIA order: labelledby, aria-label, label, contents, alt, placeholder, title', () => {
  const heading = el({ tag: 'span', attrs: { id: 'h1' }, text: 'Heading name' });
  page([heading]);
  assert.equal(F.jevMenuLabel(el({ tag: 'button', attrs: { 'aria-labelledby': 'h1', 'aria-label': 'Aria' }, text: 'Text' })), 'Heading name');
  assert.equal(F.jevMenuLabel(el({ tag: 'button', attrs: { 'aria-label': 'Aria name' }, text: 'Text' })), 'Aria name');
  assert.equal(F.jevMenuLabel(el({ tag: 'button', attrs: { title: 'Title' }, text: '  Show   details ' })), 'Show details');
  assert.equal(F.jevMenuLabel(el({ tag: 'a', attrs: { href: '/next' }, text: 'Next page' })), 'Next page');
  assert.equal(F.jevMenuLabel(el({ tag: 'img', attrs: { alt: 'Logo' } })), 'Logo');
  assert.equal(F.jevMenuLabel(el({ tag: 'input', attrs: { placeholder: 'Find a city' } })), 'Find a city');
  assert.equal(F.jevMenuLabel(el({ tag: 'div', attrs: { title: 'Panel' }, text: 'not a contents role' })), 'Panel');
  assert.equal(F.jevMenuLabel(el({ tag: 'div', text: 'no name at all' })), '');
});

check('labels are capped at LABEL_CHARS code points', () => {
  const label = F.jevMenuLabel(el({ tag: 'button', text: 'x'.repeat(200) }));
  assert.equal(Array.from(label).length, 80);
});

check('differential: the real computeAccessibleName leaks the wrapped textarea, jevMenuLabel does not', () => {
  const c = labelCases();
  const win = { FSB: { _modules: {}, logger: quietLogger, stripUnicodeControl: stripUnicodeControlStub }, __FSB_SKIP_INIT__: false };
  const sandbox = { window: win, document: c.doc, console };
  vm.runInNewContext(accessibilitySource, sandbox, { filename: 'accessibility.js#differential' });
  const leaked = win.FSB.computeAccessibleName(c.bioArea).name;
  assert.ok(leaked.includes('SECRET-DRAFT-2'), `computeAccessibleName returned "${leaked}"`);
  const leakedSelect = win.FSB.computeAccessibleName(c.countrySelect).name;
  assert.ok(leakedSelect.includes('SECRET-OPT-A'), `computeAccessibleName returned "${leakedSelect}"`);
  assert.equal(F.jevMenuLabel(c.bioArea), 'Bio');
  assert.equal(F.jevMenuLabel(c.countrySelect), 'Country');
});

check('labels, ops and risk never read the value property', () => {
  kit.resetValueReads();
  const c = labelCases();
  const fields = [
    c.bioArea, c.countrySelect, c.nameField, c.innerField, c.notesField, c.editor,
    el({ tag: 'input', attrs: { type: 'submit', value: 'Delete' }, value: 'Delete' }),
    el({ tag: 'input', attrs: { type: 'search', 'aria-label': 'Search' }, value: 'typed query' }),
    el({ tag: 'input', attrs: { type: 'checkbox' }, value: 'on' }),
  ];
  const form = el({ tag: 'form', children: [el({ tag: 'input', attrs: { type: 'search' }, value: 'q' }), el({ tag: 'input', attrs: { type: 'password' }, value: 'pw' }), el({ tag: 'button', text: 'Go' })] });
  page([form]);
  for (const node of fields.concat(form.elements)) {
    F.jevMenuLabel(node);
    F.jevElementOps(node, {});
    F.classifyJevRisk(node, {});
  }
  assert.deepEqual(kit.valueReads, []);
});

// ---------------------------------------------------------------------------
section('jevElementOps: code-derived operations (F2, D-15, AUTO-03, T-68-01)');

// Arrays from the vm realm have a different Array prototype: copy them out
// before strict deep-equality checks.
function ops(node) {
  return Array.from(F.jevElementOps(node, {}));
}

check('buttons, links, tabs, menu items, options and a closed summary get click and hover', () => {
  page([]);
  assert.deepEqual(ops(el({ tag: 'button', text: 'Go' })), ['click', 'hover']);
  assert.deepEqual(ops(el({ tag: 'div', attrs: { role: 'button' }, text: 'Go' })), ['click', 'hover']);
  assert.deepEqual(ops(el({ tag: 'a', attrs: { href: '/x' }, text: 'X' })), ['click', 'hover']);
  for (const role of ['link', 'tab', 'menuitem', 'option']) {
    assert.deepEqual(ops(el({ tag: 'div', attrs: { role }, text: role })), ['click', 'hover'], role);
  }
  const summary = el({ tag: 'summary', text: 'More' });
  el({ tag: 'details', children: [summary] });
  assert.deepEqual(ops(summary), ['click', 'hover']);
});

check('the summary of an open details gets no ops', () => {
  const summary = el({ tag: 'summary', text: 'More' });
  el({ tag: 'details', attrs: { open: '' }, children: [summary] });
  assert.deepEqual(ops(summary), []);
});

check('native checkbox/radio: unchecked gets check_box only; checked or indeterminate gets none', () => {
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'checkbox' } })), ['check_box']);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'radio' } })), ['check_box']);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'checkbox' }, checked: true })), []);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'radio' }, checked: true })), []);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'checkbox' }, indeterminate: true })), []);
});

check('"on" ARIA state (checked/pressed true or mixed, expanded/selected true) gets no ops', () => {
  const cases = [
    { role: 'checkbox', 'aria-checked': 'true' },
    { role: 'checkbox', 'aria-checked': 'mixed' },
    { role: 'switch', 'aria-checked': 'true' },
    { role: 'button', 'aria-pressed': 'true' },
    { role: 'button', 'aria-pressed': 'mixed' },
    { role: 'button', 'aria-expanded': 'true' },
    { role: 'tab', 'aria-selected': 'true' },
    { role: 'option', 'aria-selected': 'true' },
  ];
  for (const attrs of cases) {
    assert.deepEqual(ops(el({ tag: 'div', attrs, text: 'X' })), [], JSON.stringify(attrs));
  }
  assert.deepEqual(ops(el({ tag: 'button', attrs: { 'aria-expanded': 'true' }, text: 'Menu' })), []);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'checkbox', 'aria-checked': 'mixed' } })), []);
});

check('ARIA toggle roles get no ops in any state; a native box with a switch role gets none either (CR-01)', () => {
  for (const role of ['checkbox', 'switch', 'radio', 'menuitemcheckbox', 'menuitemradio']) {
    for (const state of ['false', null]) {
      const attrs = state === null ? { role } : { role, 'aria-checked': state };
      assert.deepEqual(ops(el({ tag: 'div', attrs, text: 'A' })), [], JSON.stringify(attrs));
    }
  }
  for (const role of ['switch', 'menuitemcheckbox', 'menuitemradio']) {
    assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'checkbox', role } })), [], role);
  }
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'checkbox', role: 'checkbox' } })), ['check_box']);
});

check('text entry, textarea, contenteditable and select are listed with click only', () => {
  for (const type of ['text', 'email', 'tel', 'url', 'number', 'password', 'date']) {
    assert.deepEqual(ops(el({ tag: 'input', attrs: { type } })), ['click'], type);
  }
  assert.deepEqual(ops(el({ tag: 'input' })), ['click']);
  assert.deepEqual(ops(el({ tag: 'textarea' })), ['click']);
  assert.deepEqual(ops(el({ tag: 'select' })), ['click']);
  assert.deepEqual(ops(el({ tag: 'div', attrs: { contenteditable: 'true' } })), ['click']);
  assert.deepEqual(ops(el({ tag: 'div', attrs: { role: 'textbox' } })), ['click']);
  assert.deepEqual(ops(el({ tag: 'div', attrs: { role: 'combobox' } })), ['click']);
});

check('no element ever gets type_text or select_option', () => {
  const nodes = [
    el({ tag: 'input' }), el({ tag: 'textarea' }), el({ tag: 'select' }), el({ tag: 'button', text: 'Go' }),
    el({ tag: 'input', attrs: { type: 'search' } }), el({ tag: 'div', attrs: { contenteditable: 'true' } }),
    el({ tag: 'div', attrs: { role: 'listbox' } }), el({ tag: 'input', attrs: { type: 'checkbox' } }),
    el({ tag: 'input', attrs: { type: 'file' } }), el({ tag: 'input', attrs: { type: 'hidden' } }),
  ];
  for (const node of nodes) {
    const list = ops(node);
    assert.equal(list.includes('type_text'), false);
    assert.equal(list.includes('select_option'), false);
    for (const op of list) assert.ok(['click', 'check_box', 'press_enter', 'hover'].includes(op), op);
  }
});

// ---------------------------------------------------------------------------
section('press_enter: search fields whose form can submit nothing else (D-19)');

check('input type=search and input role=searchbox outside any form get press_enter with risk null', () => {
  page([]);
  const search = el({ tag: 'input', attrs: { type: 'search', 'aria-label': 'Search' } });
  const searchbox = el({ tag: 'input', attrs: { type: 'text', role: 'searchbox', 'aria-label': 'Search' } });
  page([search, searchbox]);
  assert.deepEqual(ops(search), ['press_enter']);
  assert.equal(F.classifyJevRisk(search, {}), null);
  assert.deepEqual(ops(searchbox), ['press_enter']);
  assert.equal(F.classifyJevRisk(searchbox, {}), null);
});

check('a contenteditable div role=searchbox stays on the text-entry row', () => {
  assert.deepEqual(ops(el({ tag: 'div', attrs: { role: 'searchbox', contenteditable: 'true' } })), ['click']);
});

check('a plain site-search form (search field, hidden input, Search button) keeps press_enter', () => {
  const field = el({ tag: 'input', attrs: { type: 'search', name: 'q', 'aria-label': 'Search' } });
  const form = el({
    tag: 'form',
    attrs: { action: '/search', role: 'search' },
    children: [field, el({ tag: 'input', attrs: { type: 'hidden', name: 'src' } }), el({ tag: 'button', text: 'Search' })],
  });
  page([form]);
  assert.deepEqual(ops(field), ['press_enter']);
  assert.equal(F.classifyJevRisk(field, {}), null);
});

check('a contact form with name="subject_query" and a Send button gives no press_enter', () => {
  const field = el({ tag: 'input', attrs: { type: 'text', name: 'subject_query', 'aria-label': 'Subject' } });
  const form = el({ tag: 'form', children: [field, el({ tag: 'button', text: 'Send' })] });
  page([form]);
  assert.equal(F.inferElementPurpose(field).intent, 'search-query', 'inferElementPurpose says search');
  assert.deepEqual(ops(field), ['click']);
});

check('a search field whose form submits "Subscribe" is click-only with risk enter_submits_form', () => {
  const field = el({ tag: 'input', attrs: { type: 'search', 'aria-label': 'Search' } });
  const form = el({ tag: 'form', children: [field, el({ tag: 'button', attrs: { type: 'submit' }, text: 'Subscribe' })] });
  page([form]);
  assert.deepEqual(ops(field), ['click']);
  assert.equal(F.classifyJevRisk(field, {}), 'enter_submits_form');
});

check('a search field in a form with a select, a checkbox or a second text input is click-only', () => {
  const extras = [
    el({ tag: 'select', children: [el({ tag: 'option', text: 'All' })] }),
    el({ tag: 'input', attrs: { type: 'checkbox' } }),
    el({ tag: 'input', attrs: { type: 'text', name: 'city' } }),
    el({ tag: 'textarea' }),
  ];
  for (const extra of extras) {
    const field = el({ tag: 'input', attrs: { type: 'search', 'aria-label': 'Search' } });
    const form = el({ tag: 'form', children: [field, extra, el({ tag: 'button', text: 'Search' })] });
    page([form]);
    assert.deepEqual(ops(field), ['click'], extra.tagName);
    assert.equal(F.classifyJevRisk(field, {}), 'enter_submits_form', extra.tagName);
  }
});

check('a search field in a form holding a password, cc-* or one-time-code field never gets press_enter', () => {
  const extras = [
    el({ tag: 'input', attrs: { type: 'password' } }),
    el({ tag: 'input', attrs: { type: 'text', autocomplete: 'cc-number' } }),
    el({ tag: 'input', attrs: { type: 'text', autocomplete: 'one-time-code' } }),
  ];
  for (const extra of extras) {
    const field = el({ tag: 'input', attrs: { type: 'search', 'aria-label': 'Search' } });
    const form = el({ tag: 'form', children: [field, extra] });
    page([form]);
    assert.equal(ops(field).includes('press_enter'), false, extra.getAttribute('type'));
    assert.notEqual(F.classifyJevRisk(field, {}), null, extra.getAttribute('autocomplete') || extra.getAttribute('type'));
  }
});

check('an input whose aria-label says "search" but whose type is text never gets press_enter', () => {
  page([]);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'text', 'aria-label': 'Search products' } })), ['click']);
  assert.deepEqual(ops(el({ tag: 'input', attrs: { type: 'text', name: 'q', id: 'search' } })), ['click']);
});

// ---------------------------------------------------------------------------
section('classifyJevRisk: union-based exclusion (F3, D-19, T-68-02)');

function risk(node, context) {
  return F.classifyJevRisk(node, context || {});
}

check('classifyJevRisk(el, {}) computes its own label and purpose', () => {
  page([]);
  assert.equal(risk(el({ tag: 'button', text: 'Save' })), 'commit_word');
  assert.equal(risk(el({ tag: 'button', attrs: { class: 'btn' }, text: 'Show details' })), null);
});

check('purpose.danger and intent submit/login/signup exclude', () => {
  const benign = el({ tag: 'button', text: 'Show details' });
  page([benign]);
  assert.equal(risk(benign, { purpose: { danger: true } }), 'purpose_danger');
  for (const intent of ['submit', 'login', 'signup']) {
    assert.equal(risk(benign, { purpose: { intent } }), 'purpose_intent', intent);
  }
  assert.equal(risk(benign, { purpose: { intent: 'next-step' } }), null);
});

check('commit words exclude by text: Save, Publish, Apply, Update, Delete, Remove, Send, Pay, Buy, Checkout, Place order, Sign in, Log out, Subscribe', () => {
  page([]);
  for (const word of ['Save', 'Publish', 'Apply', 'Update', 'Delete', 'Remove', 'Send', 'Pay', 'Buy', 'Checkout', 'Place order', 'Sign in', 'Log out', 'Subscribe']) {
    assert.notEqual(risk(el({ tag: 'button', attrs: { type: 'button' }, text: word })), null, word);
  }
});

check('commit words exclude through every name source: title, aria-label, value attribute, aria-describedby', () => {
  const describe = el({ tag: 'p', attrs: { id: 'warn' }, text: 'This will delete the file.' });
  page([describe]);
  assert.equal(risk(el({ tag: 'button', attrs: { type: 'button', title: 'Delete' }, text: 'X' })), 'commit_word');
  assert.equal(risk(el({ tag: 'div', attrs: { role: 'button', 'aria-label': 'Publish' }, text: 'Go' })), 'commit_word');
  assert.equal(risk(el({ tag: 'input', attrs: { type: 'submit', value: 'Delete' } })), 'commit_word');
  assert.equal(risk(el({ tag: 'button', attrs: { type: 'button', 'aria-describedby': 'warn' }, text: 'Go' })), 'commit_word');
});

check('union, not first match: a Delete button whose aria-label is "Continue" is still excluded', () => {
  page([]);
  const hostile = el({ tag: 'button', attrs: { type: 'button', 'aria-label': 'Continue' }, text: 'Delete' });
  assert.equal(F.jevMenuLabel(hostile), 'Continue');
  assert.notEqual(risk(hostile), null);
});

check('form-submitting controls exclude: a typeless button, input type=submit and input type=image in a form', () => {
  const typeless = el({ tag: 'button', text: 'Next' });
  const submit = el({ tag: 'input', attrs: { type: 'submit', value: 'Go' } });
  const image = el({ tag: 'input', attrs: { type: 'image', alt: 'Go' } });
  const plain = el({ tag: 'button', attrs: { type: 'button' }, text: 'Show details' });
  const form = el({ tag: 'form', children: [typeless, submit, image, plain] });
  page([form]);
  assert.equal(risk(typeless), 'form_submit');
  assert.equal(risk(submit), 'form_submit');
  assert.equal(risk(image), 'form_submit');
  assert.equal(risk(plain), null);
});

check('dialogs: any control in an alertdialog; affirmatives in a dialog, an aria-modal container or an open dialog', () => {
  const inAlert = el({ tag: 'button', attrs: { type: 'button' }, text: 'Show details' });
  el({ tag: 'div', attrs: { role: 'alertdialog' }, children: [el({ tag: 'div', children: [inAlert] })] });
  assert.equal(risk(inAlert), 'alertdialog');
  for (const word of ['OK', 'Yes', 'Continue', 'Proceed']) {
    const inDialog = el({ tag: 'button', attrs: { type: 'button' }, text: word });
    el({ tag: 'div', attrs: { role: 'dialog' }, children: [inDialog] });
    assert.equal(risk(inDialog), 'dialog_affirmative', word);
  }
  const confirm = el({ tag: 'button', attrs: { type: 'button' }, text: 'Confirm' });
  el({ tag: 'div', attrs: { role: 'dialog' }, children: [confirm] });
  assert.notEqual(risk(confirm), null);
  const modal = el({ tag: 'button', attrs: { type: 'button' }, text: 'Continue' });
  el({ tag: 'div', attrs: { 'aria-modal': 'true' }, children: [modal] });
  assert.equal(risk(modal), 'dialog_affirmative');
  const native = el({ tag: 'button', attrs: { type: 'button' }, text: 'Yes' });
  el({ tag: 'dialog', attrs: { open: '' }, children: [native] });
  assert.equal(risk(native), 'dialog_affirmative');
  const outside = el({ tag: 'button', attrs: { type: 'button' }, text: 'Continue' });
  el({ tag: 'div', children: [outside] });
  // The dialog rule does not fire outside a dialog; a plain "Continue" button
  // is still not a structurally safe kind (CR-01).
  assert.equal(risk(outside), 'unclassified', 'Continue outside any dialog is not excluded by the dialog rule');
});

check('downloads, javascript: links, logout links and file inputs exclude', () => {
  page([]);
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/q3.pdf', download: '' }, text: 'Q3 numbers' })), 'download');
  assert.equal(risk(el({ tag: 'a', attrs: { href: 'javascript:void(0)' }, text: 'Open' })), 'javascript_href');
  assert.equal(risk(el({ tag: 'a', attrs: { href: ' JavaScript:go()' }, text: 'Open' })), 'javascript_href');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/account/logout' }, text: 'Account' })), 'logout');
  assert.notEqual(risk(el({ tag: 'a', attrs: { href: '/x' }, text: 'Sign out' })), null);
  assert.equal(risk(el({ tag: 'input', attrs: { type: 'file', 'aria-label': 'Attachment' } })), 'file_input');
});

check('consent checkboxes exclude (agree, accept, terms, subscribe, consent)', () => {
  page([]);
  for (const text of ['I agree to the rules', 'Accept cookies', 'Terms and conditions', 'Subscribe to news', 'I consent']) {
    const box = el({ tag: 'input', attrs: { type: 'checkbox' } });
    const label = el({ tag: 'label', children: [box, ` ${text}`] });
    box.labels = [label];
    assert.notEqual(risk(box), null, text);
  }
  const terms = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Terms and conditions' } });
  assert.equal(risk(terms), 'consent_checkbox');
});

check('any control in a form holding a password, cc-*, one-time-code or new/current-password field excludes', () => {
  const sensitive = [
    { type: 'password' },
    { type: 'text', autocomplete: 'cc-number' },
    { type: 'text', autocomplete: 'one-time-code' },
    { type: 'text', autocomplete: 'new-password' },
    { type: 'text', autocomplete: 'username current-password' },
  ];
  for (const attrs of sensitive) {
    const show = el({ tag: 'button', attrs: { type: 'button' }, text: 'Show details' });
    const form = el({ tag: 'form', children: [el({ tag: 'input', attrs }), show] });
    page([form]);
    assert.equal(risk(show), 'credential_or_payment_form', JSON.stringify(attrs));
  }
});

check('a vault-filled element is excluded', () => {
  const button = el({ tag: 'button', attrs: { type: 'button' }, text: 'Show details' });
  page([button]);
  assert.equal(risk(button), null);
  F.noteVaultFilled(button);
  assert.equal(risk(button), 'vault_filled');
});

check('benign controls outside forms are not excluded: Next, Show details, Tab 2, an unchecked Alpha checkbox', () => {
  const alpha = el({ tag: 'input', attrs: { type: 'checkbox' } });
  const alphaLabel = el({ tag: 'label', children: [alpha, ' Alpha'] });
  alpha.labels = [alphaLabel];
  const nodes = [
    el({ tag: 'button', attrs: { type: 'button' }, text: 'Next' }),
    el({ tag: 'button', text: 'Show details' }),
    el({ tag: 'div', attrs: { role: 'tab' }, text: 'Tab 2' }),
    alpha,
  ];
  page(nodes.slice(0, 3).concat([alphaLabel]));
  for (const node of nodes) assert.equal(risk(node), null, F.jevMenuLabel(node));
});

check('67-10 risk-true targets (confirm-modals Continue and Delete permanently, wizard Submit, settings Save) are excluded', () => {
  const cont = el({ tag: 'button', attrs: { type: 'button', class: 'btn primary', id: 'confirm-1-continue' }, text: 'Continue' });
  const confirm1 = el({
    tag: 'div',
    attrs: { id: 'confirm-1', class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-1-title', 'aria-describedby': 'confirm-1-text' },
    children: [
      el({ tag: 'h2', attrs: { id: 'confirm-1-title' }, children: ['Delete ', el({ tag: 'span', attrs: { class: 'record-name' }, text: 'Q3 draft forecast' }), '?'] }),
      el({ tag: 'p', attrs: { id: 'confirm-1-text' }, text: 'REC-3 will be removed from Documents.' }),
      el({ tag: 'div', attrs: { class: 'actions' }, children: [cont, el({ tag: 'button', attrs: { type: 'button', class: 'btn', id: 'confirm-1-cancel' }, text: 'Cancel' })] }),
    ],
  });
  const del = el({ tag: 'button', attrs: { type: 'button', class: 'btn danger', id: 'confirm-2-delete' }, text: 'Delete permanently' });
  const confirm2 = el({
    tag: 'div',
    attrs: { id: 'confirm-2', class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-2-title', 'aria-describedby': 'confirm-2-text' },
    children: [
      el({ tag: 'h2', attrs: { id: 'confirm-2-title' }, text: 'This cannot be undone.' }),
      el({ tag: 'div', attrs: { class: 'actions' }, children: [del, el({ tag: 'button', attrs: { type: 'button', class: 'btn', id: 'confirm-2-cancel' }, text: 'Cancel' })] }),
    ],
  });
  const backdrop = el({ tag: 'div', attrs: { id: 'backdrop', class: 'backdrop' }, children: [confirm1, confirm2] });

  const submit = el({ tag: 'button', attrs: { id: 'submit', class: 'btn primary', type: 'submit' }, text: 'Submit' });
  const step3 = el({
    tag: 'form',
    attrs: { id: 'step-3', class: 'panel', 'aria-labelledby': 'step-3-heading', novalidate: '' },
    children: [
      el({ tag: 'h2', attrs: { id: 'step-3-heading' }, text: 'Review' }),
      el({ tag: 'div', attrs: { class: 'actions' }, children: [el({ tag: 'button', attrs: { id: 'step-3-back', class: 'btn', type: 'button' }, text: 'Back' }), submit] }),
    ],
  });

  const save = el({ tag: 'button', attrs: { id: 'save', class: 'btn primary', type: 'submit' }, text: 'Save' });
  const digest = el({
    tag: 'form',
    attrs: { id: 'digest-form', class: 'panel', 'aria-labelledby': 'digest-heading', novalidate: '' },
    children: [
      el({ tag: 'select', attrs: { id: 'digest-timezone', name: 'digestTimezone' }, children: [el({ tag: 'option', text: 'UTC (UTC+00:00)' })] }),
      el({ tag: 'div', attrs: { id: 'weekly-digest', class: 'switch-row', role: 'switch', tabindex: '0', 'aria-checked': 'false', 'aria-label': 'Weekly digest' }, text: 'Weekly digest' }),
      save,
    ],
  });
  page([backdrop, step3, digest]);
  for (const [name, node] of [['Continue', cont], ['Delete permanently', del], ['Submit', submit], ['Save', save]]) {
    assert.notEqual(risk(node), null, name);
  }
});

// CR-01 (68-REVIEW): eligibility is opt-in by structure, so a control whose
// label no English word rule recognises is still never fast-acted.
const CR01_BUTTON_PROBES = [
  'Follow', 'Unfollow', 'Following', 'Like', 'Retweet', 'Connect', 'Place bid', 'Bid', 'Leave group', 'Mute',
  'Start free trial', 'Mark as spam',
  'Jetzt kaufen', 'Löschen', 'Comprar ahora', 'Eliminar', '購入する', '削除', '送信',
  '提交订单', '删除', 'Supprimer',
];

check('CR-01: plain buttons the word lists cannot read (English and other languages) are excluded', () => {
  page([]);
  for (const label of CR01_BUTTON_PROBES) {
    const node = el({ tag: 'button', attrs: { type: 'button' }, text: label });
    assert.notEqual(risk(node), null, label);
    assert.notEqual(risk(el({ tag: 'div', attrs: { role: 'button' }, text: label })), null, `role=button ${label}`);
  }
  assert.equal(risk(el({ tag: 'button', attrs: { type: 'button' }, text: 'Jetzt kaufen' })), 'unclassified');
});

check('CR-01: a non-English consent box, a box in a non-English section or page, and an account setting box are excluded', () => {
  page([]);
  const consent = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': '利用規約に同意する' } });
  assert.deepEqual(ops(consent), ['check_box']);
  assert.equal(risk(consent), 'unclassified');
  const german = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Ich stimme zu' } });
  el({ tag: 'div', attrs: { lang: 'de' }, children: [german] });
  assert.equal(risk(german), 'unclassified', 'lang=de on an ancestor');
  const english = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Alpha' } });
  el({ tag: 'div', attrs: { lang: 'en-GB' }, children: [english] });
  assert.equal(risk(english), null, 'lang=en-GB keeps the English lists in force');
  const doc = page([]);
  doc.documentElement.getAttribute = (name) => (name === 'lang' ? 'ja' : null);
  assert.equal(risk(el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Alpha' } })), 'unclassified', 'page lang=ja');
  page([]);
  for (const label of ['Make my profile public', 'Show my activity to others (sharing)', 'Email me about offers', 'Allow tracking cookies']) {
    assert.notEqual(risk(el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': label } })), null, label);
  }
});

check('CR-01: links are eligible only as same-origin navigation', () => {
  ctx.window.location.href = 'https://example.test/list?x=1';
  const anchor = el({ tag: 'h2', attrs: { id: 'reviews' }, text: 'Reviews' });
  page([anchor]);
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/docs' }, text: '設定' })), null, 'relative same-origin link, any language');
  assert.equal(risk(el({ tag: 'a', attrs: { href: 'https://example.test/p/2' }, text: 'Item 2' })), null, 'absolute same-origin link');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '#reviews' }, text: 'Reviews' })), null, 'in-page anchor to an element that exists');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '#' }, text: 'Open' })), 'unclassified', 'bare # (script-handled)');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '#missing' }, text: 'Open' })), 'unclassified', 'fragment naming nothing');
  assert.equal(risk(el({ tag: 'a', attrs: { href: 'https://other.test/x' }, text: 'Partner' })), 'unclassified', 'cross-origin');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/posts/1', 'data-method': 'delete' }, text: 'Item 1' })), 'unclassified', 'Rails data-method');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/posts/1', 'data-turbo-method': 'post' }, text: 'Item 1' })), 'unclassified', 'Turbo method');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/posts/1', 'data-confirm': 'Sure?' }, text: 'Item 1' })), 'unclassified', 'confirm prompt');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/posts/1', onclick: 'x()' }, text: 'Item 1' })), 'unclassified', 'inline handler');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/posts/1', role: 'button' }, text: 'Item 1' })), 'unclassified', 'link with a button role');
  assert.equal(risk(el({ tag: 'a', attrs: { href: 'mailto:a@example.test' }, text: 'Mail' })), 'unclassified', 'non-http scheme');
  assert.equal(risk(el({ tag: 'a', attrs: { href: '/follow/42' }, text: 'Follow' })), 'commit_word', 'English word rule still applies to links');
  assert.equal(risk(el({ tag: 'div', attrs: { role: 'link' }, text: 'Docs' })), 'unclassified', 'role=link without an href');
  const saved = ctx.sandbox.URL;
  try {
    ctx.sandbox.URL = undefined;
    assert.equal(risk(el({ tag: 'a', attrs: { href: '/docs' }, text: 'Docs' })), 'unclassified', 'no URL parser: fail closed');
  } finally {
    ctx.sandbox.URL = saved;
  }
});

check('CR-01: tabs, closed summaries, collapsed disclosures and paging names stay eligible', () => {
  page([]);
  assert.equal(risk(el({ tag: 'div', attrs: { role: 'tab' }, text: '設定' })), null, 'role=tab in any language');
  const summary = el({ tag: 'summary', text: 'Versand' });
  el({ tag: 'details', children: [summary] });
  assert.equal(risk(summary), null, 'summary of a closed details');
  assert.equal(risk(el({ tag: 'button', attrs: { type: 'button', 'aria-expanded': 'false' }, text: 'Menü' })), null, 'aria-expanded=false');
  for (const label of ['Next', 'Previous', 'Load more', 'Show more', 'See all', 'Show details', 'Next ›', '‹ Previous', 'Page 3', '»']) {
    assert.equal(risk(el({ tag: 'button', attrs: { type: 'button' }, text: label })), null, label);
  }
  for (const label of ['Next: pay now', 'More options for deletion', 'Continue', 'Open', 'Go', '3']) {
    assert.notEqual(risk(el({ tag: 'button', attrs: { type: 'button' }, text: label })), null, label);
  }
  const hostile = el({ tag: 'button', attrs: { type: 'button', 'aria-label': 'Next' }, text: 'Jetzt kaufen' });
  assert.equal(risk(hostile), 'unclassified', 'every name source must be on the paging list, not only the label');
});

// ---------------------------------------------------------------------------
section('buildJevMenu: menu assembly (AUTO-02, D-13, D-14)');

const C = F.jevMenuConstants;
const crypto = require('crypto');

// getFilteredElements stand-in: records its options and honours maxElements
// the way the real function does (score-sliced, default 50). The list it
// returns is in "score" order, deliberately not document order.
let poolOptionsSeen = [];
function stubPool(scoreOrdered) {
  poolOptionsSeen = [];
  F.getFilteredElements = (options) => {
    poolOptionsSeen.push(options);
    const max = options && options.maxElements !== undefined ? options.maxElements : 50;
    return scoreOrdered.slice(0, max);
  };
}

function inView(top) {
  return { left: 20, top, width: 120, height: 24 };
}

function buttons(count, labelFor, rectFor) {
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(el({ tag: 'button', attrs: { type: 'button', id: `b${i + 1}` }, text: labelFor(i), rect: rectFor ? rectFor(i) : inView(10 + (i % 30) * 25) }));
  }
  return list;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function build(options) {
  return plain(F.buildJevMenu(options || {}));
}

F.isFsbElement = (node) => !!(node && typeof node.hasAttribute === 'function' && node.hasAttribute('data-fsb-id'));

check('buildJevMenu and jevVisibleText are exported next to the other menu helpers', () => {
  assert.equal(typeof F.buildJevMenu, 'function');
  assert.equal(typeof F.jevVisibleText, 'function');
  const exportsAt = domAnalysisSource.indexOf('  FSB.getFilteredElements = getFilteredElements;');
  const tail = domAnalysisSource.slice(exportsAt);
  assert.ok(tail.includes('FSB.jevVisibleText = jevVisibleText;'));
  assert.ok(tail.includes('FSB.buildJevMenu = buildJevMenu;'));
});

check('the pool comes from getFilteredElements with exactly maxElements MENU_POOL and the snapshot options', () => {
  const list = buttons(5, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list.slice().reverse());
  const menu = build();
  assert.equal(menu.success, true);
  assert.equal(poolOptionsSeen.length, 1);
  assert.deepEqual(plain(poolOptionsSeen[0]), {
    maxElements: C.MENU_POOL,
    viewportComplete: true,
    prioritizeViewport: true,
    taskType: 'general',
    guideSelectors: null,
  });
  assert.equal(poolOptionsSeen[0].guideSelectors, null);
  assert.ok(C.MENU_POOL > C.MENU_CAP_MAX);
});

check('the block passes the pool size by name and never resets FSB.refMap', () => {
  const block = menuBlock();
  assert.match(block, /maxElements: *[A-Za-z_.]*MENU_POOL/);
  assert.equal(block.includes('FSB.refMap.reset'), false);
  assert.match(block, /FSB\.jevRefMap\.reset\(\)/);
});

check('cap 64 over 70 eligible candidates: 64 entries, truncated true', () => {
  const list = buttons(70, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list.slice().reverse());
  const menu = build({ cap: 64 });
  assert.equal(menu.entries.length, 64);
  assert.equal(menu.count, 64);
  assert.equal(menu.truncated, true);
});

check('no cap over 70 candidates: MENU_CAP (48) entries, truncated true', () => {
  const list = buttons(70, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list.slice().reverse());
  const menu = build();
  assert.equal(menu.entries.length, 48);
  assert.equal(menu.truncated, true);
});

check('cap 48 over 40 candidates: 40 entries, truncated false', () => {
  const list = buttons(40, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list.slice().reverse());
  const menu = build({ cap: 48 });
  assert.equal(menu.entries.length, 40);
  assert.equal(menu.truncated, false);
});

check('cap 48 over 49 candidates whose 49th in order has no label: 48 entries, truncated false', () => {
  const list = buttons(49, (i) => (i === 48 ? '' : `Item ${i + 1}`));
  page(list);
  stubPool(list.slice().reverse());
  const menu = build({ cap: 48 });
  assert.equal(menu.entries.length, 48);
  assert.equal(menu.truncated, false);
});

check('a pool of exactly MENU_POOL candidates is reported truncated', () => {
  const list = buttons(C.MENU_POOL, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list.slice());
  const menu = build({ cap: 64 });
  assert.equal(menu.entries.length, 64);
  assert.equal(menu.truncated, true);
  const few = buttons(C.MENU_POOL, (i) => (i < 10 ? `Item ${i + 1}` : ''));
  page(few);
  stubPool(few.slice());
  const fewMenu = build({ cap: 48 });
  assert.equal(fewMenu.entries.length, 10);
  assert.equal(fewMenu.truncated, true, 'the pool itself may have been cut');
});

check('cap values outside 32..64 clamp into range', () => {
  const list = buttons(70, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list.slice());
  assert.equal(build({ cap: 10 }).entries.length, 32);
  assert.equal(build({ cap: 1000 }).entries.length, 64);
  assert.equal(build({ cap: 40.7 }).entries.length, 40);
  assert.equal(build({ cap: 'many' }).entries.length, 48);
  assert.equal(build({ cap: NaN }).entries.length, 48);
});

check('main frame only: a framed document returns not_main_frame', () => {
  const list = buttons(2, (i) => `Item ${i + 1}`);
  page(list);
  stubPool(list);
  const realTop = ctx.window.top;
  ctx.window.top = { other: true };
  try {
    assert.deepEqual(build(), { success: false, reason: 'not_main_frame' });
  } finally {
    ctx.window.top = realTop;
  }
  assert.equal(build().success, true);
});

check('entries are in-viewport first, then the rest, each group in document order', () => {
  const offA = el({ tag: 'button', attrs: { type: 'button' }, text: 'Off A', rect: { left: 20, top: 2000, width: 100, height: 20 } });
  const inB = el({ tag: 'button', attrs: { type: 'button' }, text: 'In B', rect: inView(100) });
  const offC = el({ tag: 'button', attrs: { type: 'button' }, text: 'Off C', rect: { left: 20, top: -300, width: 100, height: 20 } });
  const inD = el({ tag: 'button', attrs: { type: 'button' }, text: 'In D', rect: inView(50) });
  page([offA, inB, offC, inD]);
  stubPool([offA, offC, inB, inD]);
  const menu = build();
  assert.deepEqual(menu.entries.map((e) => e.label), ['In B', 'In D', 'Off A', 'Off C']);
  assert.deepEqual(menu.entries.map((e) => e.inViewport), [true, true, false, false]);
  assert.deepEqual(menu.entries.map((e) => e.handle), ['j1', 'j2', 'j3', 'j4']);
});

check('entry shape and fastEligible: ops, risk null, in viewport, not text entry, not vault-filled', () => {
  const go = el({ tag: 'button', attrs: { type: 'button' }, text: 'Show details', rect: inView(10) });
  const far = el({ tag: 'button', attrs: { type: 'button' }, text: 'Far away', rect: { left: 20, top: 5000, width: 100, height: 20 } });
  const field = el({ tag: 'input', attrs: { type: 'email', 'aria-label': 'Email', autocomplete: 'email' }, rect: inView(40) });
  const save = el({ tag: 'button', attrs: { type: 'button' }, text: 'Save', rect: inView(70) });
  const vaulted = el({ tag: 'button', attrs: { type: 'button' }, text: 'Open', rect: inView(100) });
  const ticked = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Alpha' }, checked: true, rect: inView(130) });
  const unticked = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Bravo' }, rect: inView(160) });
  const search = el({ tag: 'input', attrs: { type: 'search', 'aria-label': 'Search' }, rect: inView(190) });
  const select = el({ tag: 'select', attrs: { 'aria-label': 'Country' }, children: [el({ tag: 'option', text: 'SECRET-OPT-Z' })], rect: inView(220) });
  page([go, far, field, save, vaulted, ticked, unticked, search, select]);
  F.noteVaultFilled(vaulted);
  stubPool([go, far, field, save, vaulted, ticked, unticked, search, select]);
  const menu = build();
  const byLabel = Object.fromEntries(menu.entries.map((e) => [e.label, e]));
  const keys = ['handle', 'role', 'label', 'ops', 'inputType', 'autocomplete', 'purpose', 'hidden', 'risk', 'fastEligible', 'vaultFilled', 'state', 'inViewport'];
  for (const entry of menu.entries) assert.deepEqual(Object.keys(entry).sort(), keys.slice().sort());
  assert.deepEqual(byLabel['Show details'], {
    handle: 'j1', role: 'button', label: 'Show details', ops: ['click', 'hover'], inputType: null, autocomplete: null,
    purpose: { sensitive: false, danger: false, intent: 'interact' }, hidden: false, risk: null, fastEligible: true,
    vaultFilled: false, state: { checked: null, expanded: null, selected: null, pressed: null }, inViewport: true,
  });
  assert.equal(byLabel['Far away'].fastEligible, false, 'off-viewport');
  assert.equal(byLabel.Email.fastEligible, false, 'text entry');
  assert.deepEqual(byLabel.Email.ops, ['click']);
  assert.equal(byLabel.Email.inputType, 'email');
  assert.equal(byLabel.Email.autocomplete, 'email');
  assert.equal(byLabel.Save.fastEligible, false, 'risk');
  assert.equal(byLabel.Save.risk, 'commit_word');
  assert.equal(byLabel.Open.vaultFilled, true);
  assert.equal(byLabel.Open.fastEligible, false, 'vault-filled');
  assert.deepEqual(byLabel.Alpha.ops, []);
  assert.equal(byLabel.Alpha.state.checked, true);
  assert.equal(byLabel.Alpha.fastEligible, false, 'checked box');
  assert.deepEqual(byLabel.Bravo.ops, ['check_box']);
  assert.equal(byLabel.Bravo.fastEligible, true);
  assert.deepEqual(byLabel.Search.ops, ['press_enter']);
  assert.equal(byLabel.Search.fastEligible, true);
  assert.deepEqual(byLabel.Country.ops, ['click']);
  assert.equal(byLabel.Country.fastEligible, false, 'select');
  for (const entry of menu.entries) {
    assert.equal(entry.ops.includes('type_text'), false);
    assert.equal(entry.ops.includes('select_option'), false);
  }
});

check('CR-01: probe buttons in a built menu are listed but never fast-eligible', () => {
  const nodes = CR01_BUTTON_PROBES.map((label, i) => el({ tag: 'button', attrs: { type: 'button' }, text: label, rect: inView(10 + (i % 30) * 25) }));
  page(nodes);
  stubPool(nodes.slice());
  const menu = build();
  assert.equal(menu.entries.length, CR01_BUTTON_PROBES.length);
  for (const entry of menu.entries) {
    assert.deepEqual(entry.ops, ['click', 'hover'], entry.label);
    assert.notEqual(entry.risk, null, entry.label);
    assert.equal(entry.fastEligible, false, entry.label);
  }
});

check('CR-01: a role=switch "Make my profile public" and a native box with role=switch are never fast-eligible', () => {
  const ariaSwitch = el({ tag: 'div', attrs: { role: 'switch', 'aria-checked': 'false', 'aria-label': 'Make my profile public' }, text: 'Public', rect: inView(10) });
  const nativeSwitch = el({ tag: 'input', attrs: { type: 'checkbox', role: 'switch', 'aria-label': 'Dark theme' }, rect: inView(40) });
  page([ariaSwitch, nativeSwitch]);
  stubPool([ariaSwitch, nativeSwitch]);
  const menu = build();
  assert.equal(menu.entries.length, 2);
  for (const entry of menu.entries) {
    assert.deepEqual(entry.ops, [], entry.label);
    assert.equal(entry.fastEligible, false, entry.label);
  }
  assert.equal(risk(ariaSwitch), 'unclassified');
  assert.equal(risk(nativeSwitch), 'unclassified');
});

check('FSB overlay nodes, canvas pseudo-elements and unlabelled candidates are skipped', () => {
  const real = el({ tag: 'button', attrs: { type: 'button' }, text: 'Real', rect: inView(10) });
  const overlay = el({ tag: 'button', attrs: { type: 'button', 'data-fsb-id': 'x' }, text: 'Overlay', rect: inView(40) });
  const canvas = el({ tag: 'div', attrs: { role: 'button' }, dataset: { fsbRole: 'document-body', fsbLabel: 'Doc' }, text: 'Doc body', rect: inView(70) });
  const blank = el({ tag: 'button', attrs: { type: 'button' }, text: '   ', rect: inView(100) });
  page([real, overlay, canvas, blank]);
  stubPool([real, overlay, canvas, blank]);
  const menu = build();
  assert.deepEqual(menu.entries.map((e) => e.label), ['Real']);
});

check('kept entries are registered in FSB.jevRefMap in output order; FSB.refMap is untouched', () => {
  const list = buttons(4, (i) => `Item ${i + 1}`);
  page(list);
  F.refMap.reset();
  list.slice(0, 3).forEach((node, i) => F.refMap.register(node, `#b${i + 1}`, 'button', `Item ${i + 1}`));
  const generationBefore = F.refMap.generationId;
  stubPool(list.slice().reverse());
  const before = F.jevRefMap.generation.split('-');
  const menu = build();
  const after = F.jevRefMap.generation.split('-');
  assert.equal(after[0], before[0], 'same per-document nonce');
  assert.equal(Number(after[1]), Number(before[1]) + 1, 'one reset per menu');
  assert.equal(menu.generation, F.jevRefMap.generation);
  menu.entries.forEach((entry, i) => {
    assert.equal(entry.handle, `j${i + 1}`);
    const registered = F.jevRefMap.get(entry.handle);
    assert.equal(registered.element.deref(), list[i]);
    assert.equal(registered.role, entry.role);
    assert.equal(registered.name, entry.label);
  });
  assert.equal(F.refMap.generationId, generationBefore);
  assert.equal(F.refMap.size, 3);
  assert.equal(F.refMap.resolve('e2').element, list[1]);
});

check('url, title and moreBelow come from the page; moreBelow needs more than MORE_BELOW_PX below', () => {
  const list = buttons(2, (i) => `Item ${i + 1}`);
  ctx.window.location.href = 'https://example.test/list?x=1';
  page(list, { title: 'List page', scrollHeight: 3000 });
  ctx.window.scrollY = 0;
  stubPool(list);
  let menu = build();
  assert.equal(menu.url, 'https://example.test/list?x=1');
  assert.equal(menu.title, 'List page');
  assert.equal(menu.moreBelow, true);
  page(list, { title: 'List page', scrollHeight: 1000 });
  menu = build();
  assert.equal(menu.moreBelow, false, '1000 - 800 is not more than 200');
  page(list, { title: 'List page', scrollHeight: 3000 });
  ctx.window.scrollY = 2100;
  menu = build();
  assert.equal(menu.moreBelow, false, 'scrolled to the bottom');
  ctx.window.scrollY = 0;
});

check('signature: stable for an unchanged page; changes with a checkbox flip, the title or a new entry', () => {
  const box = el({ tag: 'input', attrs: { type: 'checkbox', 'aria-label': 'Alpha' }, rect: inView(10) });
  const next = el({ tag: 'button', attrs: { type: 'button' }, text: 'Next', rect: inView(40) });
  const extra = el({ tag: 'button', attrs: { type: 'button' }, text: 'More', rect: inView(70) });
  page([box, next, extra], { title: 'Form' });
  stubPool([box, next]);
  const first = build();
  const second = build();
  assert.match(first.signature, /^[0-9a-f]{8}$/);
  assert.equal(second.signature, first.signature);
  box.checked = true;
  const flipped = build();
  assert.notEqual(flipped.signature, first.signature, 'checked state flip');
  box.checked = false;
  assert.equal(build().signature, first.signature);
  page([box, next, extra], { title: 'Form (2)' });
  assert.notEqual(build().signature, first.signature, 'title change');
  page([box, next, extra], { title: 'Form' });
  stubPool([box, next, extra]);
  assert.notEqual(build().signature, first.signature, 'added entry');
});

check('recentHandles: selector, ref (through FSB.refMap.resolve) and a unique role+name resolve; anything else is null', () => {
  const list = buttons(4, (i) => ['Alpha', 'Bravo', 'Dup', 'Dup'][i]);
  const outside = el({ tag: 'button', attrs: { type: 'button', id: 'gone' }, text: 'Not offered', rect: inView(400) });
  page(list.concat([outside]));
  F.refMap.reset();
  F.refMap.register(list[3], '#b4', 'button', 'Dup');
  F.refMap.register(list[1], '#b2', 'button', 'Bravo');
  const refGeneration = F.refMap.generationId;
  F.querySelectorWithShadow = (selector) => ({ '#b1': list[0], '#gone': outside }[selector] || null);
  stubPool(list);
  const menu = build({
    recent: [
      { selector: '#b1' },
      { ref: 'e2' },
      { role: 'button', name: 'Alpha' },
      { role: 'button', name: 'Dup' },
      { selector: '#gone' },
      { selector: '#missing' },
      { ref: 'e9' },
      {},
      'junk',
      null,
      { selector: '#b1' },
    ],
  });
  assert.deepEqual(menu.recentHandles, ['j1', 'j2', 'j1', null, null, null, null, null, null, null]);
  assert.equal(F.refMap.generationId, refGeneration, 'refMap not reset');
  assert.equal(F.refMap.size, 2);
  F.querySelectorWithShadow = () => null;
  assert.deepEqual(build().recentHandles, []);
});

check('no value: a whole menu never reads the value property and carries no field content', () => {
  const c = labelCases();
  const draft = el({ tag: 'div', attrs: { contenteditable: 'true', 'aria-label': 'Message' }, text: 'SECRET-DRAFT-1', rect: inView(10) });
  const typed = el({ tag: 'input', attrs: { type: 'text', 'aria-label': 'City' }, value: 'SECRET-TYPED', rect: inView(40) });
  const submit = el({ tag: 'input', attrs: { type: 'submit', value: 'Delete' }, value: 'Delete', rect: inView(70) });
  const heading = el({ tag: 'h1', text: 'Welcome' });
  for (const node of [c.bioArea, c.countrySelect, c.nameField, c.innerField, c.notesField, c.editor, c.roleOption]) node.setRect(inView(100));
  const body = el({
    tag: 'body',
    children: [heading, draft, typed, submit].concat(c.doc.body.childNodes.slice()),
  });
  const doc = kit.makeDocument(body, { selectorMap: { 'label[for="n"]': [] } });
  ctx.setDocument(doc);
  stubPool([draft, typed, submit, c.bioArea, c.countrySelect, c.nameField, c.innerField, c.notesField, c.editor, c.roleOption]);
  kit.resetValueReads();
  const menu = F.buildJevMenu({ recent: [{ role: 'textbox', name: 'City' }] });
  assert.deepEqual(kit.valueReads, []);
  const serialized = JSON.stringify(menu);
  for (const secret of SECRET_MARKERS.concat(['SECRET-DRAFT-1', 'SECRET-TYPED'])) {
    assert.equal(serialized.includes(secret), false, `${secret} leaked`);
  }
  assert.ok(menu.visibleText.includes('Welcome'));
  const labels = menu.entries.map((e) => e.label);
  assert.ok(labels.includes('Message') && labels.includes('Bio') && labels.includes('Delete'));
});

check('jevVisibleText skips fields, editable regions, hidden nodes, scripts, svg and FSB overlay nodes', () => {
  const textarea = el({ tag: 'textarea', text: 'SECRET-DRAFT-2' });
  const body = el({
    tag: 'body',
    children: [
      el({ tag: 'h1', text: 'Welcome' }),
      el({ tag: 'p', children: ['Hello ', el({ tag: 'b', text: 'world' }), '.'] }),
      el({ tag: 'div', text: 'Alpha' }),
      el({ tag: 'div', text: 'Bravo' }),
      el({ tag: 'div', attrs: { contenteditable: 'true' }, text: 'SECRET-DRAFT-1' }),
      el({ tag: 'label', children: ['Bio ', textarea] }),
      el({ tag: 'select', children: [el({ tag: 'option', text: 'SECRET-OPT-A' })] }),
      el({ tag: 'input', attrs: { value: 'SECRET-VAL' } }),
      el({ tag: 'div', attrs: { role: 'textbox' }, text: 'SECRET-ROLE-TEXTBOX' }),
      el({ tag: 'div', attrs: { role: 'combobox' }, text: 'SECRET-ROLE-COMBOBOX' }),
      el({ tag: 'div', attrs: { role: 'searchbox' }, text: 'SECRET-ROLE-SEARCHBOX' }),
      el({ tag: 'div', attrs: { 'aria-hidden': 'true' }, text: 'SECRET-ARIA-HIDDEN' }),
      el({ tag: 'div', attrs: { hidden: '' }, text: 'SECRET-HIDDEN-ATTR' }),
      el({ tag: 'div', style: { display: 'none' }, text: 'SECRET-DISPLAY-NONE' }),
      el({ tag: 'div', style: { visibility: 'hidden' }, text: 'SECRET-VISIBILITY' }),
      el({ tag: 'script', text: 'SECRET-SCRIPT' }),
      el({ tag: 'style', text: 'SECRET-STYLE' }),
      el({ tag: 'noscript', text: 'SECRET-NOSCRIPT' }),
      el({ tag: 'template', text: 'SECRET-TEMPLATE' }),
      el({ tag: 'svg', children: [el({ tag: 'title', text: 'SECRET-SVG' })] }),
      el({ tag: 'div', attrs: { 'data-fsb-id': 'overlay' }, text: 'SECRET-OVERLAY' }),
      el({ tag: 'p', text: 'Goodbye' }),
    ],
  });
  ctx.setDocument(kit.makeDocument(body));
  kit.resetValueReads();
  const text = F.jevVisibleText(2000);
  assert.deepEqual(kit.valueReads, []);
  assert.equal(text, 'Welcome Hello world. Alpha Bravo Bio Goodbye');
  assert.equal(/SECRET/.test(text), false);
  assert.equal(Array.from(F.jevVisibleText(7)).length, 7);
});

check('jevVisibleText returns nothing for an editable body', () => {
  ctx.setDocument(kit.makeDocument(el({ tag: 'body', attrs: { contenteditable: 'true' }, children: ['SECRET-BODY-DRAFT'] })));
  assert.equal(F.jevVisibleText(2000), '');
});

// Slice method of 68-SYNC-RECHECK.md item h: from `function <name>(` through
// the brace that closes its body, the body brace being the first `{` after the
// parameter list's matching `)`. Hashes copied from item h at P68_START.
function sliceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let i = source.indexOf('(', start);
  for (let depth = 0; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) break;
  }
  let j = source.indexOf('{', i);
  for (let depth = 0; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) break;
  }
  return source.slice(start, j + 1);
}

check('byte identity: buildMarkdownSnapshot and formatInlineRef match their P68_START hashes; getMarkdownSnapshot stays absent', () => {
  const pinned = {
    buildMarkdownSnapshot: '820fa063ca1215a99e1bf1617f3b6959ef468d14466d4bcc16d551cd6205dc61',
    formatInlineRef: '4c7dae4c52a820cb3092c6b65e58a35cda7345b9d992ca5afd3973478565f8e1',
  };
  for (const [name, hash] of Object.entries(pinned)) {
    const text = sliceFunction(domAnalysisSource, name);
    assert.ok(text, `${name} present`);
    assert.equal(crypto.createHash('sha256').update(text, 'utf8').digest('hex'), hash, name);
  }
  assert.equal(sliceFunction(domAnalysisSource, 'getMarkdownSnapshot'), null);
});

// ---------------------------------------------------------------------------
section('resolveJevHandle: strict fast-mode target resolution (plan 68-03; D-14, D-19, F15-F17)');

// Resolver environment. Selectors come from the id and the aria-label, with an
// XPath candidate first so the "never an XPath" rule is exercised; the document
// matches simple selectors against the live stub tree; the hit test returns
// hitTarget (null = nothing on top) and composedContains follows parent links.
let hitTarget = null;
F.deepElementFromPoint = () => hitTarget;
F.composedContains = (outer, inner) => {
  for (let node = inner; node; node = node.parentElement) {
    if (node === outer) return true;
  }
  return false;
};
function generateSelectorsStub(node) {
  const out = [{ selector: '//body/*[1]' }];
  const id = node.getAttribute('id');
  if (id) out.push('#' + id);
  const aria = node.getAttribute('aria-label');
  if (aria) out.push({ selector: `[aria-label="${aria}"]` });
  return out;
}
F.generateSelectors = generateSelectorsStub;

function resolverPage(children, selectorMap) {
  const body = el({ tag: 'body', children });
  const doc = kit.makeDocument(body, { matchSelectors: true, selectorMap: selectorMap || {} });
  ctx.setDocument(doc);
  return doc;
}

function menuOver(nodes) {
  stubPool(nodes.slice());
  const menu = F.buildJevMenu({});
  assert.equal(menu.success, true, 'menu built');
  return menu;
}

function entryOf(menu, label) {
  const entry = Array.from(menu.entries).find((item) => item.label === label);
  assert.ok(entry, `menu entry ${label}`);
  return entry;
}

function jevParams(menu, label, extra) {
  const entry = entryOf(menu, label);
  return Object.assign({
    jevHandle: entry.handle,
    jevGeneration: menu.generation,
    expectedRole: entry.role,
    expectedName: entry.label,
  }, extra || {});
}

function resolve(params, verb) {
  const verdict = F.resolveJevHandle(params, verb);
  assert.ok(verdict && typeof verdict === 'object', 'verdict object');
  if (verdict.ok === true) return { ok: true, selector: verdict.selector, element: verdict.element };
  assert.deepEqual(Object.keys(verdict).sort(), ['ok', 'reason']);
  return { ok: false, reason: verdict.reason };
}

function refused(params, verb) {
  const verdict = resolve(params, verb);
  assert.equal(verdict.ok, false, 'refused');
  return verdict.reason;
}

// One page with one fast-eligible element per content verb plus a few extras.
function freshFixture() {
  hitTarget = null;
  const next = el({ tag: 'button', attrs: { type: 'button', id: 'next' }, text: 'Next', rect: inView(10) });
  const alpha = el({ tag: 'input', attrs: { type: 'checkbox', id: 'alpha', 'aria-label': 'Alpha' }, rect: inView(40) });
  const search = el({ tag: 'input', attrs: { type: 'search', id: 'q', 'aria-label': 'Search' }, rect: inView(70) });
  const docs = el({ tag: 'a', attrs: { href: '/docs', id: 'docs' }, text: 'Docs', rect: inView(100) });
  const summary = el({ tag: 'summary', attrs: { id: 'more' }, text: 'More', rect: inView(130) });
  const details = el({ tag: 'details', children: [summary] });
  const nick = el({ tag: 'input', attrs: { type: 'text', id: 'nick', 'aria-label': 'Nickname' }, rect: inView(160) });
  const doc = resolverPage([next, alpha, search, docs, details, nick]);
  const menu = menuOver([next, alpha, search, docs, summary, nick]);
  return { doc, menu, next, alpha, search, docs, summary, details, nick };
}

// Move a stub node under a new parent (the kit keeps parent links by hand).
function moveUnder(node, parent) {
  const old = node.parentElement;
  if (old) {
    const index = old.childNodes.indexOf(node);
    if (index >= 0) old.childNodes.splice(index, 1);
  }
  parent.appendChild(node);
}

check('FSB.resolveJevHandle and FSB.jevContentVerbOps are exported next to the menu helpers', () => {
  assert.equal(typeof F.resolveJevHandle, 'function');
  const exportsAt = domAnalysisSource.indexOf('  FSB.getFilteredElements = getFilteredElements;');
  const tail = domAnalysisSource.slice(exportsAt);
  assert.ok(tail.includes('FSB.jevContentVerbOps = jevContentVerbOps;'));
  assert.ok(tail.includes('FSB.resolveJevHandle = resolveJevHandle;'));
});

check('the verb table is defined once inside the menu block and maps content verbs to ops', () => {
  const block = menuBlock();
  assert.equal(block.split("toggleCheckbox: 'check_box'").length - 1, 1);
  assert.ok(block.includes("pressEnter: 'press_enter'"));
  assert.ok(block.includes('function resolveJevHandle('));
  assert.equal(block.includes('resolveRef('), false, 'no ref resolution (it falls back to CSS)');
});

check('verb table parity: frozen, exactly four content verbs, each the _contentVerb of its registry tool', () => {
  const table = F.jevContentVerbOps;
  assert.ok(table && Object.isFrozen(table), 'frozen');
  assert.deepEqual(Object.keys(table).sort(), ['click', 'hover', 'pressEnter', 'toggleCheckbox']);
  const defs = require('../extension/ai/tool-definitions.js');
  const { CONTRACT } = require('../extension/ai/jev-state.js');
  for (const op of ['click', 'check_box', 'press_enter', 'hover']) {
    const tool = defs.getToolByName(op);
    assert.ok(tool, `registry tool ${op}`);
    assert.equal(tool._route, 'content', `${op} route`);
    assert.equal(typeof tool._contentVerb, 'string', `${op} content verb`);
    assert.equal(table[tool._contentVerb], op, `${tool._contentVerb} -> ${op}`);
    assert.ok(CONTRACT.OPERATIONS.includes(op), `${op} is a contract operation`);
  }
  assert.deepEqual(Object.values(table).sort(), ['check_box', 'click', 'hover', 'press_enter']);
});

check('success, one case per content verb: click, toggleCheckbox, pressEnter, hover', () => {
  const f = freshFixture();
  const cases = [
    ['click', 'Next', f.next, '#next'],
    ['toggleCheckbox', 'Alpha', f.alpha, '#alpha'],
    ['pressEnter', 'Search', f.search, '#q'],
    ['hover', 'Docs', f.docs, '#docs'],
  ];
  for (const [verb, label, node, selector] of cases) {
    const verdict = resolve(jevParams(f.menu, label), verb);
    assert.equal(verdict.ok, true, `${verb} on ${label}`);
    assert.equal(verdict.selector, selector, `${verb} selector`);
    assert.equal(verdict.element, node, `${verb} element`);
  }
  assert.equal(entryOf(f.menu, 'Alpha').role, 'checkbox');
  assert.equal(entryOf(f.menu, 'Search').role, 'searchbox');
});

check('conflicting_target: jevHandle together with selector or ref', () => {
  const f = freshFixture();
  assert.equal(refused(jevParams(f.menu, 'Next', { selector: '#next' }), 'click'), 'conflicting_target');
  assert.equal(refused(jevParams(f.menu, 'Next', { ref: 'e1' }), 'click'), 'conflicting_target');
  assert.equal(refused(jevParams(f.menu, 'Next', { selector: null }), 'click'), 'conflicting_target');
});

check('bad_handle: anything but j1..j999', () => {
  const f = freshFixture();
  for (const handle of ['e1', 'j0', 'j01', 'j1000', 'J1', 'j1 ', '', null, 7, 'j-1']) {
    assert.equal(refused(jevParams(f.menu, 'Next', { jevHandle: handle }), 'click'), 'bad_handle', String(handle));
  }
});

check('generation_mismatch: a generation from a previous reset, or none at all', () => {
  const f = freshFixture();
  const stale = jevParams(f.menu, 'Next');
  const again = menuOver([f.next, f.alpha, f.search, f.docs, f.summary, f.nick]);
  assert.notEqual(again.generation, f.menu.generation);
  assert.equal(entryOf(again, 'Next').handle, stale.jevHandle, 'same handle number in the new menu');
  assert.equal(refused(stale, 'click'), 'generation_mismatch');
  assert.equal(refused(jevParams(again, 'Next', { jevGeneration: undefined }), 'click'), 'generation_mismatch');
  assert.equal(resolve(jevParams(again, 'Next'), 'click').ok, true, 'the current generation still resolves');
});

check('generation_mismatch: a recycled handle number on a new registry instance (new document, F16)', () => {
  const f = freshFixture();
  const stale = jevParams(f.menu, 'Next');
  const saved = F.jevRefMap;
  try {
    F.jevRefMap = new F.JevRefRegistry();
    const fresh = menuOver([f.next, f.alpha, f.search, f.docs, f.summary, f.nick]);
    assert.equal(entryOf(fresh, 'Next').handle, stale.jevHandle);
    assert.notEqual(fresh.generation.split('-')[0], stale.jevGeneration.split('-')[0], 'new nonce');
    assert.equal(refused(stale, 'click'), 'generation_mismatch');
  } finally {
    F.jevRefMap = saved;
  }
});

check('unknown_handle: a well-formed handle the current menu never issued', () => {
  const f = freshFixture();
  assert.equal(refused(jevParams(f.menu, 'Next', { jevHandle: 'j99' }), 'click'), 'unknown_handle');
});

check('detached: a node removed from the DOM, or a WeakRef that no longer derefs', () => {
  const f = freshFixture();
  f.next.isConnected = false;
  assert.equal(refused(jevParams(f.menu, 'Next'), 'click'), 'detached');
  F.jevRefMap.map.set('j50', { element: { deref: () => undefined }, role: 'button', name: 'Gone' });
  assert.equal(refused({ jevHandle: 'j50', jevGeneration: f.menu.generation, expectedRole: 'button', expectedName: 'Gone' }, 'click'), 'detached');
});

check('role_changed: the element changed role since the menu, or the call expects another role', () => {
  const f = freshFixture();
  assert.equal(refused(jevParams(f.menu, 'Next', { expectedRole: 'link' }), 'click'), 'role_changed');
  assert.equal(refused(jevParams(f.menu, 'Next', { expectedRole: undefined }), 'click'), 'role_changed');
  const params = jevParams(f.menu, 'Next');
  f.next.setAttribute('role', 'tab');
  assert.equal(refused(params, 'click'), 'role_changed');
});

check('name_changed: a re-rendered element whose label changed, or a call expecting another name', () => {
  const f = freshFixture();
  assert.equal(refused(jevParams(f.menu, 'Next', { expectedName: 'Back' }), 'click'), 'name_changed');
  const box = jevParams(f.menu, 'Alpha');
  f.alpha.setAttribute('aria-label', 'Bravo');
  assert.equal(refused(box, 'toggleCheckbox'), 'name_changed');
  const button = jevParams(f.menu, 'Next');
  f.next.childNodes.length = 0;
  f.next.appendChild(kit.makeText('Back'));
  assert.equal(refused(button, 'click'), 'name_changed');
});

check('risk_excluded: a button moved into an alertdialog since the menu', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Next');
  const dialog = el({ tag: 'div', attrs: { role: 'alertdialog' } });
  f.doc.body.appendChild(dialog);
  moveUnder(f.next, dialog);
  assert.equal(F.classifyJevRisk(f.next, {}), 'alertdialog');
  assert.equal(refused(params, 'click'), 'risk_excluded');
});

check('risk_excluded: a control that is not a structurally safe kind is refused at execution (CR-01)', () => {
  hitTarget = null;
  const follow = el({ tag: 'button', attrs: { type: 'button', id: 'follow' }, text: 'フォロー', rect: inView(10) });
  resolverPage([follow]);
  const menu = menuOver([follow]);
  assert.equal(entryOf(menu, 'フォロー').fastEligible, false);
  assert.equal(refused(jevParams(menu, 'フォロー'), 'click'), 'risk_excluded');
  assert.equal(refused(jevParams(menu, 'フォロー'), 'hover'), 'risk_excluded');
  const f = freshFixture();
  const params = jevParams(f.menu, 'Next');
  f.next.childNodes.length = 0;
  f.next.appendChild(kit.makeText('Next'));
  f.next.setAttribute('title', 'Jetzt kaufen');
  assert.equal(refused(params, 'click'), 'risk_excluded', 'a name source changed since the menu');
});

check('risk_excluded: an element marked vault-filled since the menu', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Nickname');
  assert.equal(resolve(params, 'click').ok, true, 'resolves before the mark');
  F.noteVaultFilled(f.nick);
  assert.equal(refused(params, 'click'), 'risk_excluded');
});

check('op_not_available: a checkbox checked since the menu (toggleCheckbox never switches it off)', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Alpha');
  f.alpha.checked = true;
  assert.equal(refused(params, 'toggleCheckbox'), 'op_not_available');
});

check('op_not_available: the summary of a details opened since the menu', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'More');
  assert.equal(resolve(params, 'click').ok, true, 'closed summary resolves');
  f.details.setAttribute('open', '');
  assert.equal(refused(params, 'click'), 'op_not_available');
});

check('op_not_available: a search field moved into a form with a second text input (pressEnter)', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Search');
  const other = el({ tag: 'input', attrs: { type: 'text', name: 'other' } });
  const form = el({ tag: 'form', children: [other] });
  f.doc.body.appendChild(form);
  moveUnder(f.search, form);
  assert.equal(f.search.form, form);
  assert.equal(refused(params, 'pressEnter'), 'op_not_available');
});

check('op_not_available: verbs outside the table (type, selectOption, keyPress, __proto__, none)', () => {
  const f = freshFixture();
  for (const verb of ['type', 'selectOption', 'keyPress', 'scroll', '__proto__', 'constructor', 'toString', undefined, null, 5]) {
    assert.equal(refused(jevParams(f.menu, 'Next'), verb), 'op_not_available', String(verb));
  }
});

check('op_not_available: Jev op names are not content verbs, even on elements offering those ops', () => {
  const f = freshFixture();
  assert.deepEqual(ops(f.alpha), ['check_box']);
  assert.deepEqual(ops(f.search), ['press_enter']);
  assert.equal(refused(jevParams(f.menu, 'Alpha'), 'check_box'), 'op_not_available');
  assert.equal(refused(jevParams(f.menu, 'Search'), 'press_enter'), 'op_not_available');
  assert.equal(refused(jevParams(f.menu, 'Alpha'), 'click'), 'op_not_available', 'click is not an op of a native checkbox');
});

check('hidden: display:none, visibility:hidden or opacity:0 since the menu', () => {
  for (const style of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }]) {
    const f = freshFixture();
    const params = jevParams(f.menu, 'Next');
    Object.assign(f.next.style, style);
    assert.equal(refused(params, 'click'), 'hidden', JSON.stringify(style));
  }
});

check('disabled: disabled or aria-disabled since the menu', () => {
  let f = freshFixture();
  let params = jevParams(f.menu, 'Next');
  f.next.disabled = true;
  assert.equal(refused(params, 'click'), 'disabled');
  f = freshFixture();
  params = jevParams(f.menu, 'Next');
  f.next.setAttribute('aria-disabled', 'true');
  assert.equal(refused(params, 'click'), 'disabled');
});

check('occluded: another element on top at the centre (FSB overlays do not count)', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Next');
  hitTarget = el({ tag: 'div', attrs: { id: 'cookie-wall' } });
  assert.equal(refused(params, 'click'), 'occluded');
  hitTarget = el({ tag: 'div', attrs: { 'data-fsb-id': 'overlay' } });
  assert.equal(resolve(params, 'click').ok, true, 'an FSB overlay on top is ignored');
  hitTarget = null;
});

check('not_actionable: other actionability failures (pointer-events:none, zero size)', () => {
  let f = freshFixture();
  let params = jevParams(f.menu, 'Next');
  f.next.style.pointerEvents = 'none';
  assert.equal(refused(params, 'click'), 'not_actionable');
  f = freshFixture();
  params = jevParams(f.menu, 'Next');
  f.next.setRect({ width: 0, height: 0 });
  assert.equal(refused(params, 'click'), 'not_actionable');
});

check('out_of_viewport: a centre below the viewport (occlusion is not checked there, F15)', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Next');
  hitTarget = el({ tag: 'div', attrs: { id: 'cover' } });
  f.next.setRect({ top: 5000 });
  assert.equal(refused(params, 'click'), 'out_of_viewport');
  hitTarget = null;
});

check('selector_not_unique: two elements match every generated selector, or only an XPath is offered', () => {
  hitTarget = null;
  const one = el({ tag: 'button', attrs: { type: 'button', 'aria-label': 'Load more' }, rect: inView(10) });
  const two = el({ tag: 'button', attrs: { type: 'button', 'aria-label': 'Load more' }, rect: inView(40) });
  resolverPage([one, two]);
  const menu = menuOver([one, two]);
  const first = Array.from(menu.entries)[0];
  const params = { jevHandle: first.handle, jevGeneration: menu.generation, expectedRole: 'button', expectedName: 'Load more' };
  assert.equal(refused(params, 'click'), 'selector_not_unique');
  // The XPath candidate would match exactly this element if it were tried.
  const lone = el({ tag: 'button', attrs: { type: 'button' }, text: 'Show more', rect: inView(10) });
  const loneDoc = resolverPage([lone], { '//body/*[1]': [lone] });
  assert.deepEqual(loneDoc.querySelectorAll('//body/*[1]'), [lone]);
  const loneMenu = menuOver([lone]);
  assert.equal(refused(jevParams(loneMenu, 'Show more'), 'click'), 'selector_not_unique', 'XPath candidates are skipped');
});

check('a unique selector that matches a different element is never used', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Next');
  const saved = F.generateSelectors;
  try {
    F.generateSelectors = () => ['#docs', '#next'];
    const verdict = resolve(params, 'click');
    assert.equal(verdict.ok, true);
    assert.equal(verdict.selector, '#next');
    F.generateSelectors = () => { throw new Error('boom'); };
    assert.equal(refused(params, 'click'), 'selector_not_unique');
  } finally {
    F.generateSelectors = saved;
  }
});

check('the resolver reads no value and refuses when the registry is unavailable', () => {
  const f = freshFixture();
  kit.resetValueReads();
  assert.equal(resolve(jevParams(f.menu, 'Nickname'), 'click').ok, true);
  assert.equal(resolve(jevParams(f.menu, 'Search'), 'pressEnter').ok, true);
  assert.deepEqual(kit.valueReads, []);
  const saved = F.jevRefMap;
  try {
    F.jevRefMap = undefined;
    assert.equal(refused(jevParams(f.menu, 'Next'), 'click'), 'unavailable');
  } finally {
    F.jevRefMap = saved;
  }
});

// ---------------------------------------------------------------------------
section('messaging.js: getJevMenu and the jev branch of executeAction (plan 68-03; D-14, F17)');

const MESSAGING_PATH = path.join(repoRoot, 'extension', 'content', 'messaging.js');
const messagingSource = fs.readFileSync(MESSAGING_PATH, 'utf8');
const EXECUTE_CASE = "case 'executeAction':";

// The executeAction case text from its label to the `if (FSB.tools[tool]) {`
// line: logging, overlays, the jev branch, COMPACT REF RESOLUTION and the
// REF-LESS fallback. It runs inside a function with stubbed inputs; 'continued'
// means the code fell through to the tool handler.
function executeActionPrelude() {
  const start = messagingSource.indexOf(EXECUTE_CASE);
  assert.ok(start > 0, 'executeAction case present');
  const body = start + EXECUTE_CASE.length;
  const stop = messagingSource.indexOf('if (FSB.tools[tool]) {', body);
  assert.ok(stop > body, 'tool handler guard present');
  return messagingSource.slice(body, stop);
}

let preludeRunner = null;
function runPrelude(request, harness) {
  if (!preludeRunner) {
    preludeRunner = vm.runInContext(
      `(function (request, FSB, sendResponse, document, logger) {${executeActionPrelude()}\nreturn 'continued';\n})`,
      ctx.sandbox,
      { filename: 'messaging.js#executeAction-prelude' }
    );
  }
  return preludeRunner(request, harness.fsb, harness.sendResponse, harness.doc, harness.logger);
}

// FSB for the slice: inherits the vm-loaded namespace (so FSB.resolveJevHandle
// is the real resolver) with spies for the cache, tools and overlays.
function messagingHarness(options = {}) {
  const calls = { responses: [], cacheSets: [], warnings: [] };
  const cache = {
    set(selector, element) { calls.cacheSets.push({ selector, element }); },
    get() { return null; },
  };
  F.elementCache = cache;
  const fsb = Object.create(F);
  fsb.sessionId = 'test-session';
  fsb.tools = { click() {}, toggleCheckbox() {}, pressEnter() {}, hover() {}, type() {}, keyPress() {} };
  fsb.viewportGlow = { show() {}, setState() {} };
  fsb.progressOverlay = { create() {}, update() {}, show() {} };
  Object.assign(fsb, options.fsb || {});
  const doc = options.document || ctx.sandbox.document;
  if (options.focused !== undefined) doc.activeElement = options.focused;
  return {
    fsb,
    doc,
    calls,
    sendResponse: (response) => calls.responses.push(response),
    logger: {
      logActionExecution() {},
      debug() {},
      info() {},
      error() {},
      warn(message) { calls.warnings.push(message); },
    },
  };
}

check('the jev branch is the first target-resolution branch and the menu case exists once', () => {
  const jevAt = messagingSource.indexOf('params.jevHandle !== undefined');
  const compactAt = messagingSource.indexOf('// COMPACT REF RESOLUTION');
  const refLessAt = messagingSource.indexOf('// REF-LESS ACTION FALLBACK');
  assert.ok(jevAt > 0 && compactAt > jevAt && refLessAt > compactAt, 'jev branch before COMPACT REF and REF-LESS');
  assert.equal(messagingSource.split("case 'getJevMenu'").length - 1, 1);
  const branch = messagingSource.slice(jevAt, compactAt);
  assert.equal(branch.includes('resolveRef'), false);
  assert.match(branch, /refStale: true[\s\S]*?\n\s*return;/);
});

check('non-jev: a stale e-ref still answers with the existing refStale text and dispatches nothing', () => {
  const h = messagingHarness({
    fsb: {
      resolveRef: () => null,
      refMap: { getInfo: () => ({ role: 'button', name: 'Next', selector: '#next' }) },
    },
  });
  const params = { ref: 'e5' };
  const outcome = runPrelude({ action: 'executeAction', tool: 'click', params }, h);
  assert.equal(outcome, undefined, 'returned before the handler');
  assert.deepEqual(plain(h.calls.responses), [{
    success: false,
    error: 'Element ref "e5" (button "Next") is stale. The page has changed. Use elements from the current snapshot.',
    tool: 'click',
    refStale: true,
  }]);
  assert.equal(params.selector, undefined);
  const unknown = messagingHarness({ fsb: { resolveRef: () => null, refMap: { getInfo: () => null } } });
  runPrelude({ action: 'executeAction', tool: 'click', params: { ref: 'e9' } }, unknown);
  assert.deepEqual(plain(unknown.calls.responses), [{
    success: false,
    error: 'Unknown ref "e9". Use refs from the latest page snapshot.',
    tool: 'click',
    refStale: true,
  }]);
});

check('non-jev: an e-ref that resolves sets its selector and caches the element, as before', () => {
  const target = el({ tag: 'button', attrs: { id: 'next' }, text: 'Next' });
  const h = messagingHarness({
    fsb: {
      resolveRef: () => target,
      refMap: { getInfo: () => ({ role: 'button', name: 'Next', selector: '#next' }) },
    },
  });
  const params = { ref: 'e2' };
  const outcome = runPrelude({ action: 'executeAction', tool: 'click', params }, h);
  assert.equal(outcome, 'continued');
  assert.equal(params.selector, '#next');
  assert.equal(h.calls.cacheSets.length, 1);
  assert.equal(h.calls.cacheSets[0].selector, '#next');
  assert.equal(h.calls.cacheSets[0].element, target);
  assert.equal(h.calls.responses.length, 0);
});

check('non-jev: a selector-less pressEnter still targets the focused field, as before', () => {
  const field = el({ tag: 'input', attrs: { type: 'text', id: 'focused' } });
  resolverPage([field]);
  const h = messagingHarness({ focused: field, fsb: { generateSelectors: () => ['//input', '#focused'] } });
  const params = {};
  const outcome = runPrelude({ action: 'executeAction', tool: 'pressEnter', params }, h);
  assert.equal(outcome, 'continued');
  assert.equal(params.selector, '#focused');
  assert.equal(h.calls.cacheSets.length, 1);
  assert.equal(h.calls.cacheSets[0].element, field);
  assert.equal(h.calls.responses.length, 0);
});

check('jev: a failing pressEnter with a focused field answers refStale once and never targets the focused field', () => {
  const f = freshFixture();
  const stale = jevParams(f.menu, 'Search');
  menuOver([f.next, f.alpha, f.search, f.docs, f.summary, f.nick]);
  const h = messagingHarness({ focused: f.nick, fsb: { generateSelectors: () => ['#nick'] } });
  const outcome = runPrelude({ action: 'executeAction', tool: 'pressEnter', params: stale }, h);
  assert.equal(outcome, undefined, 'returned before the REF-LESS fallback');
  assert.deepEqual(plain(h.calls.responses), [{
    success: false,
    error: 'Fast-mode target is no longer current (generation_mismatch).',
    tool: 'pressEnter',
    refStale: true,
    reason: 'generation_mismatch',
  }]);
  assert.equal(stale.selector, undefined, 'no selector from the focused field');
  assert.equal(h.calls.cacheSets.length, 0);
  // Control: the same call without the jev params would have pressed Enter on the focused field.
  const control = messagingHarness({ focused: f.nick, fsb: { generateSelectors: () => ['#nick'] } });
  const plainParams = {};
  assert.equal(runPrelude({ action: 'executeAction', tool: 'pressEnter', params: plainParams }, control), 'continued');
  assert.equal(plainParams.selector, '#nick');
});

check('jev: a detached target and a missing resolver both refuse before any fallback', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Search');
  f.search.isConnected = false;
  const h = messagingHarness({ focused: f.nick, fsb: { generateSelectors: () => ['#nick'] } });
  assert.equal(runPrelude({ action: 'executeAction', tool: 'pressEnter', params }, h), undefined);
  assert.equal(h.calls.responses.length, 1);
  assert.equal(h.calls.responses[0].reason, 'detached');
  assert.equal(params.selector, undefined);
  const g = freshFixture();
  const missing = messagingHarness({ focused: g.nick, fsb: { resolveJevHandle: undefined, generateSelectors: () => ['#nick'] } });
  const params2 = jevParams(g.menu, 'Next');
  assert.equal(runPrelude({ action: 'executeAction', tool: 'click', params: params2 }, missing), undefined);
  assert.deepEqual(plain(missing.calls.responses), [{
    success: false,
    error: 'Fast-mode target is no longer current (unavailable).',
    tool: 'click',
    refStale: true,
    reason: 'unavailable',
  }]);
});

check('jev: a succeeding click sets params.selector, caches the element once and sends nothing', () => {
  const f = freshFixture();
  const params = jevParams(f.menu, 'Next');
  const h = messagingHarness({ focused: null });
  assert.equal(runPrelude({ action: 'executeAction', tool: 'click', params }, h), 'continued');
  assert.equal(params.selector, '#next');
  assert.equal(h.calls.cacheSets.length, 1);
  assert.equal(h.calls.cacheSets[0].selector, '#next');
  assert.equal(h.calls.cacheSets[0].element, f.next);
  assert.equal(h.calls.responses.length, 0);
});

check('jev: a succeeding toggleCheckbox and pressEnter target the resolved element, not the focused one', () => {
  for (const [verb, label, key, selector] of [['toggleCheckbox', 'Alpha', 'alpha', '#alpha'], ['pressEnter', 'Search', 'search', '#q']]) {
    const f = freshFixture();
    const params = jevParams(f.menu, label, verb === 'toggleCheckbox' ? { checked: true } : {});
    const h = messagingHarness({ focused: f.nick, fsb: { generateSelectors: () => ['#nick'] } });
    assert.equal(runPrelude({ action: 'executeAction', tool: verb, params }, h), 'continued', verb);
    assert.equal(params.selector, selector, `${verb} selector`);
    assert.equal(h.calls.cacheSets.length, 1, `${verb} cache set once`);
    assert.equal(h.calls.cacheSets[0].element, f[key], `${verb} element`);
    assert.equal(h.calls.responses.length, 0, `${verb} sends nothing`);
  }
});

// The getJevMenu case text, from its label through the brace that closes it.
function getJevMenuCase() {
  const start = messagingSource.indexOf("case 'getJevMenu': {");
  assert.ok(start > 0, 'getJevMenu case present');
  let i = messagingSource.indexOf('{', start);
  for (let depth = 0; i < messagingSource.length; i++) {
    if (messagingSource[i] === '{') depth++;
    else if (messagingSource[i] === '}' && --depth === 0) break;
  }
  return messagingSource.slice(start, i + 1);
}

let menuCaseRunner = null;
function runMenuCase(request, fsb) {
  if (!menuCaseRunner) {
    menuCaseRunner = vm.runInContext(
      `(function (request, FSB, sendResponse) { switch (request.action) { ${getJevMenuCase()} } })`,
      ctx.sandbox,
      { filename: 'messaging.js#getJevMenu' }
    );
  }
  const responses = [];
  menuCaseRunner(request, fsb, (response) => responses.push(response));
  return responses;
}

check('getJevMenu: returns the buildJevMenu result and passes only cap and recent', () => {
  const seen = [];
  const result = { success: true, generation: 'abcd1234-3', entries: [] };
  const fsb = { buildJevMenu: (options) => { seen.push(options); return result; } };
  const responses = runMenuCase({ action: 'getJevMenu', options: { cap: 40, recent: [{ role: 'button', name: 'Next' }] } }, fsb);
  assert.equal(responses.length, 1);
  assert.equal(responses[0], result);
  assert.deepEqual(plain(seen), [{ cap: 40, recent: [{ role: 'button', name: 'Next' }] }]);
  assert.equal(fsb._jevCaptureArm, null, 'no capture requested: disarmed');
  const bare = runMenuCase({ action: 'getJevMenu' }, fsb);
  assert.equal(bare[0], result);
  assert.deepEqual(plain(seen[1]), {});
});

check('getJevMenu: capture:true arms one observation with the generation; capture absent clears it', () => {
  const fsb = { buildJevMenu: () => ({ success: true, generation: 'abcd1234-3', entries: [] }) };
  runMenuCase({ action: 'getJevMenu', options: { capture: true } }, fsb);
  assert.deepEqual(plain(fsb._jevCaptureArm), { generation: 'abcd1234-3' });
  runMenuCase({ action: 'getJevMenu', options: {} }, fsb);
  assert.equal(fsb._jevCaptureArm, null);
  runMenuCase({ action: 'getJevMenu', options: { capture: 'yes' } }, fsb);
  assert.equal(fsb._jevCaptureArm, null, 'only the boolean true arms');
  fsb.buildJevMenu = () => ({ success: false, reason: 'not_main_frame' });
  fsb._jevCaptureArm = { generation: 'old' };
  const failed = runMenuCase({ action: 'getJevMenu', options: { capture: true } }, fsb);
  assert.deepEqual(plain(failed), [{ success: false, reason: 'not_main_frame' }]);
  assert.equal(fsb._jevCaptureArm, null, 'a failed menu never arms');
});

check('getJevMenu: an error inside buildJevMenu answers menu_error and disarms', () => {
  const fsb = { buildJevMenu: () => { throw new Error('boom'); }, _jevCaptureArm: { generation: 'x' } };
  const responses = runMenuCase({ action: 'getJevMenu', options: { capture: true } }, fsb);
  assert.deepEqual(plain(responses), [{ success: false, reason: 'menu_error' }]);
  assert.equal(fsb._jevCaptureArm, null);
  const missing = runMenuCase({ action: 'getJevMenu', options: {} }, {});
  assert.deepEqual(plain(missing), [{ success: false, reason: 'menu_error' }]);
});

check('getJevMenu: the real builder resets only the fast-mode registry and arms with its generation', () => {
  freshFixture();
  const responses = runMenuCase({ action: 'getJevMenu', options: { capture: true } }, F);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, true);
  assert.equal(F._jevCaptureArm.generation, responses[0].generation);
  assert.equal(F.jevRefMap.generation, responses[0].generation);
  F._jevCaptureArm = null;
});

check('WR-05: only a fast-mode call adds jevSelector (the resolved selector) to the executeAction success response', () => {
  assert.equal(messagingSource.split('jevSelector').length - 1, 1, 'jevSelector is named once');
  const caseAt = messagingSource.indexOf(EXECUTE_CASE);
  const handlerAt = messagingSource.indexOf('if (FSB.tools[tool]) {', caseAt);
  const unknownAt = messagingSource.indexOf("sendResponse({ success: false, error: `Unknown tool: ${tool}` });", handlerAt);
  const block = messagingSource.slice(handlerAt, unknownAt);
  assert.ok(handlerAt > caseAt && unknownAt > handlerAt, 'the tool-handler block of executeAction');
  assert.match(block, /sendResponse\(\{\n\s*\.\.\.result,\n\s*tool: tool,\n\s*executionTime: Date\.now\(\) - startTime,\n(?:\s*\/\/[^\n]*\n)*\s*\.\.\.\(params && params\.jevHandle !== undefined && typeof params\.selector === 'string'\n\s*\? \{ jevSelector: params\.selector \}\n\s*: \{\}\)\n\s*\}\);/,
    'the success response spreads jevSelector only when the call carried jevHandle');
  // The spread adds nothing for any other call, so their responses are unchanged.
  const spread = (params) => ({ ...(params && params.jevHandle !== undefined && typeof params.selector === 'string' ? { jevSelector: params.selector } : {}) });
  assert.deepEqual(spread({ selector: '#next' }), {});
  assert.deepEqual(spread({ ref: 'e2', selector: '#next' }), {});
  assert.deepEqual(spread(undefined), {});
  assert.deepEqual(spread({ jevHandle: 'j1', selector: '#next' }), { jevSelector: '#next' });
});

check('getJevMenu is routed by the synchronous message switch, next to executeAction', () => {
  const syncAt = messagingSource.indexOf('function handleBackgroundMessage(');
  const caseAt = messagingSource.indexOf("case 'getJevMenu': {");
  assert.ok(syncAt > 0 && caseAt > syncAt, 'in handleBackgroundMessage');
  const router = messagingSource.slice(syncAt, messagingSource.indexOf('switch (request.action)', syncAt));
  assert.equal(router.includes('getJevMenu'), false, 'the async router line is unchanged');
});

// ---------------------------------------------------------------------------
section("capture observation: one armed report of the next action's target (plan 68-03; D-22, T-68-11)");

const VIS01_MARKER = '// VIS-01/VIS-03: Show highlight on target element';
const OBSERVATION_KEYS = ['action', 'generation', 'handle', 'resolved', 'tool'];

// executeAction from its label through the capture guard, closed right after
// it: 'handler' means the tool handler would run next. events records runtime
// messages and the handler in order.
function executeActionThroughGuard() {
  const start = messagingSource.indexOf(EXECUTE_CASE);
  assert.ok(start > 0, 'executeAction case present');
  const body = start + EXECUTE_CASE.length;
  const stop = messagingSource.indexOf(VIS01_MARKER, body);
  assert.ok(stop > body, 'VIS-01 block present');
  return messagingSource.slice(body, stop);
}

let guardRunner = null;
function runThroughGuard(request, harness, events) {
  if (!guardRunner) {
    guardRunner = vm.runInContext(
      `(function (request, FSB, sendResponse, document, logger, events) {${executeActionThroughGuard()}\nevents.push('handler');\nreturn 'handler';\n}\nreturn 'no-handler';\n})`,
      ctx.sandbox,
      { filename: 'messaging.js#executeAction-capture-guard' }
    );
  }
  return runGuardWith(guardRunner, request, harness, events);
}

function runGuardWith(runner, request, harness, events) {
  return runner(request, harness.fsb, harness.sendResponse, harness.doc, harness.logger, events);
}

// chrome.runtime.sendMessage in the content context; behaviour(message) may
// return a value or throw.
function runtimeSpy(events, behaviour) {
  const sent = [];
  ctx.sandbox.chrome = {
    runtime: {
      sendMessage(message) {
        sent.push(message);
        events.push('message');
        return behaviour ? behaviour(message) : undefined;
      },
    },
  };
  return sent;
}

let resolveRefCalls = 0;
function captureFixture() {
  const f = freshFixture();
  const stranger = el({ tag: 'button', attrs: { type: 'button', id: 'stranger' }, text: 'Stranger', rect: inView(300) });
  f.doc.body.appendChild(stranger);
  f.stranger = stranger;
  F.querySelectorWithShadow = (selector) => {
    const list = ctx.sandbox.document.querySelectorAll(selector);
    return list.length ? list[0] : null;
  };
  resolveRefCalls = 0;
  F.resolveRef = () => {
    resolveRefCalls++;
    return null;
  };
  // Arm through the real getJevMenu case, as plan 68-08's capture path will.
  const responses = runMenuCase({ action: 'getJevMenu', options: { capture: true } }, F);
  assert.equal(responses.length, 1);
  f.menu = responses[0];
  assert.deepEqual(plain(F._jevCaptureArm), { generation: f.menu.generation });
  return f;
}

function observation(sent) {
  assert.equal(sent.length, 1, 'exactly one observation');
  const message = plain(sent[0]);
  assert.deepEqual(Object.keys(sent[0]).sort(), OBSERVATION_KEYS);
  return message;
}

check('noteJevCaptureObservation is exported and the messaging guard sits first inside the handler block', () => {
  assert.equal(typeof F.noteJevCaptureObservation, 'function');
  const exportsAt = domAnalysisSource.indexOf('  FSB.getFilteredElements = getFilteredElements;');
  assert.ok(domAnalysisSource.slice(exportsAt).includes('FSB.noteJevCaptureObservation = noteJevCaptureObservation;'));
  const block = menuBlock();
  assert.ok(block.includes('function noteJevCaptureObservation('));
  assert.ok(block.includes("action: 'jevCaptureObservation'"));
  assert.equal(block.includes('resolveRef('), false);
  assert.match(
    messagingSource,
    /if \(FSB\.tools\[tool\]\) \{\n\s*if \(FSB\._jevCaptureArm\) \{\n\s*try \{\n\s*FSB\.noteJevCaptureObservation\(tool, params\);\n\s*\} catch \(_[A-Za-z]*\) \{[^}]*\}\n\s*\}\n\s*\/\/ VIS-01\/VIS-03/
  );
  assert.ok(messagingSource.split('FSB._jevCaptureArm').length - 1 >= 2);
});

check('unarmed: the observer is never called and nothing is sent', () => {
  freshFixture();
  for (const arm of [null, undefined, false, 0]) {
    F._jevCaptureArm = arm;
    const events = [];
    const sent = runtimeSpy(events);
    let observed = 0;
    const h = messagingHarness({ fsb: { noteJevCaptureObservation() { observed++; } } });
    assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#next' } }, h, events), 'handler');
    assert.equal(observed, 0, String(arm));
    assert.equal(sent.length, 0);
    assert.deepEqual(events, ['handler']);
  }
  F._jevCaptureArm = null;
  const events = [];
  const sent = runtimeSpy(events);
  assert.equal(F.noteJevCaptureObservation('click', { selector: '#next' }), false);
  assert.equal(sent.length, 0);
});

check('armed: a click on an offered element reports its handle once, before the handler, then disarms', () => {
  const f = captureFixture();
  const events = [];
  const sent = runtimeSpy(events);
  const h = messagingHarness();
  assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#next' } }, h, events), 'handler');
  assert.deepEqual(observation(sent), {
    action: 'jevCaptureObservation',
    generation: f.menu.generation,
    handle: entryOf(f.menu, 'Next').handle,
    resolved: true,
    tool: 'click',
  });
  assert.deepEqual(events, ['message', 'handler']);
  assert.equal(F._jevCaptureArm, null, 'disarmed');
  const again = [];
  const sentAgain = runtimeSpy(again);
  assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#docs' } }, messagingHarness(), again), 'handler');
  assert.equal(sentAgain.length, 0, 'one shot');
  assert.equal(resolveRefCalls, 0);
});

check('armed: the element cache is used when it returns an element; tool is the content verb as received', () => {
  const f = captureFixture();
  const events = [];
  const sent = runtimeSpy(events);
  const h = messagingHarness();
  F.elementCache.get = (selector) => (selector === '#alpha' ? f.alpha : null);
  F.querySelectorWithShadow = () => { throw new Error('not reached when the cache answers'); };
  runThroughGuard({ action: 'executeAction', tool: 'toggleCheckbox', params: { selector: '#alpha', checked: true } }, h, events);
  const message = observation(sent);
  assert.equal(message.handle, entryOf(f.menu, 'Alpha').handle);
  assert.equal(message.resolved, true);
  assert.equal(message.tool, 'toggleCheckbox');
});

check('armed: a ref the COMPACT REF branch resolved is observed through the selector it set', () => {
  const f = captureFixture();
  const events = [];
  const sent = runtimeSpy(events);
  const h = messagingHarness({
    fsb: {
      resolveRef: () => f.docs,
      refMap: { getInfo: () => ({ role: 'link', name: 'Docs', selector: '#docs' }) },
    },
  });
  const params = { ref: 'e4' };
  runThroughGuard({ action: 'executeAction', tool: 'hover', params }, h, events);
  assert.equal(params.selector, '#docs');
  assert.equal(observation(sent).handle, entryOf(f.menu, 'Docs').handle);
});

check('armed: an element outside the menu reports handle null with resolved true', () => {
  captureFixture();
  const events = [];
  const sent = runtimeSpy(events);
  runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#stranger' } }, messagingHarness(), events);
  const message = observation(sent);
  assert.equal(message.handle, null);
  assert.equal(message.resolved, true);
});

check('armed: a text-based click (no selector) and a selector that resolves nothing report resolved false', () => {
  captureFixture();
  let events = [];
  let sent = runtimeSpy(events);
  runThroughGuard({ action: 'executeAction', tool: 'click', params: { text: 'Next' } }, messagingHarness(), events);
  let message = observation(sent);
  assert.equal(message.handle, null);
  assert.equal(message.resolved, false);
  captureFixture();
  events = [];
  sent = runtimeSpy(events);
  runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#missing' } }, messagingHarness(), events);
  message = observation(sent);
  assert.equal(message.handle, null);
  assert.equal(message.resolved, false);
  assert.equal(resolveRefCalls, 0, 'never resolves refs (no CSS fallback)');
});

check('armed: a registry reset after arming (generation changed) reports handle null', () => {
  const f = captureFixture();
  const armed = f.menu.generation;
  menuOver([f.next, f.alpha, f.search, f.docs, f.summary, f.nick]);
  assert.notEqual(F.jevRefMap.generation, armed);
  const events = [];
  const sent = runtimeSpy(events);
  runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#next' } }, messagingHarness(), events);
  const message = observation(sent);
  assert.equal(message.generation, armed, 'the armed generation is reported');
  assert.equal(message.handle, null);
  assert.equal(message.resolved, true);
});

check('the observation carries no label, selector, text or value (exact key set)', () => {
  captureFixture();
  const events = [];
  const sent = runtimeSpy(events);
  kit.resetValueReads();
  runThroughGuard({
    action: 'executeAction',
    tool: 'type',
    params: { selector: '#nick', text: 'SECRET-TYPED-TEXT', value: 'SECRET-VALUE' },
  }, messagingHarness(), events);
  const message = observation(sent);
  const json = JSON.stringify(message);
  for (const marker of ['SECRET-TYPED-TEXT', 'SECRET-VALUE', '#nick', 'Nickname', 'nick']) {
    assert.equal(json.includes(marker), false, marker);
  }
  assert.deepEqual(kit.valueReads, []);
  assert.equal(message.tool, 'type');
  assert.equal(message.resolved, true);
});

check('a throwing sendMessage, resolver or observer never blocks or alters the action', () => {
  captureFixture();
  let events = [];
  runtimeSpy(events, () => { throw new Error('Extension context invalidated.'); });
  let params = { selector: '#next' };
  assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params }, messagingHarness(), events), 'handler');
  assert.deepEqual(plain(params), { selector: '#next' });
  assert.equal(F._jevCaptureArm, null, 'disarmed even when sending fails');
  captureFixture();
  events = [];
  const sent = runtimeSpy(events);
  F.querySelectorWithShadow = () => { throw new Error('bad selector'); };
  params = { selector: '#next' };
  assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params }, messagingHarness(), events), 'handler');
  const message = observation(sent);
  assert.equal(message.resolved, false);
  assert.equal(message.handle, null);
  captureFixture();
  events = [];
  const h = messagingHarness({ fsb: { noteJevCaptureObservation() { throw new Error('observer failed'); } } });
  params = { selector: '#next' };
  assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params }, h, events), 'handler');
  assert.deepEqual(plain(params), { selector: '#next' });
  F._jevCaptureArm = null;
});

sectionAsync('capture observation: asynchronous sendMessage failures (plan 68-03)');

checkAsync('a rejected sendMessage promise is swallowed (no unhandled rejection)', async () => {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    captureFixture();
    const events = [];
    const sent = runtimeSpy(events, () => Promise.reject(new Error('Could not establish connection')));
    assert.equal(runThroughGuard({ action: 'executeAction', tool: 'click', params: { selector: '#next' } }, messagingHarness(), events), 'handler');
    assert.equal(sent.length, 1);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(rejections.length, 0);
  } finally {
    process.removeListener('unhandledRejection', onRejection);
    F._jevCaptureArm = null;
  }
});

// ---------------------------------------------------------------------------
sectionAsync('dispatch path: executeTool -> executeAction content verb -> jev branch (plan 68-03, AUTO-02)');

const dispatched = [];
function loadToolExecutor() {
  global.chrome = {
    tabs: {
      sendMessage: async (tabId, message) => {
        dispatched.push({ tabId, message });
        return { success: true };
      },
      get: async () => ({ url: 'https://example.test/page' }),
    },
  };
  return require('../extension/ai/tool-executor.js');
}

async function dispatchAndResolve(op, verb, label, args) {
  const { executeTool } = loadToolExecutor();
  const f = freshFixture();
  const entry = entryOf(f.menu, label);
  dispatched.length = 0;
  const callArgs = Object.assign({
    jevHandle: entry.handle,
    jevGeneration: f.menu.generation,
    expectedRole: entry.role,
    expectedName: entry.label,
    visual_reason: 'Fast mode: simple step',
  }, args);
  const result = await executeTool(op, callArgs, 1);
  assert.equal(result.success, true, `${op} dispatched`);
  assert.equal(dispatched.length, 1, `${op} sends one message`);
  const { tabId, message } = dispatched[0];
  assert.equal(tabId, 1);
  assert.equal(message.action, 'executeAction');
  assert.equal(message.tool, verb, `${op} -> ${verb}`);
  // The content script receives a structured clone of the params.
  const params = JSON.parse(JSON.stringify(message.params));
  const h = messagingHarness({ focused: f.nick, fsb: { generateSelectors: () => ['#nick'] } });
  const outcome = runPrelude({ action: 'executeAction', tool: message.tool, params }, h);
  return { f, params, h, outcome, message };
}

checkAsync("executeTool('check_box') sends toggleCheckbox and the jev branch resolves it", async () => {
  const run = await dispatchAndResolve('check_box', 'toggleCheckbox', 'Alpha', { expectedRole: 'checkbox', expectedName: 'Alpha', checked: true });
  assert.equal(run.message.params.checked, true);
  assert.equal(run.outcome, 'continued');
  assert.equal(run.params.selector, '#alpha');
  assert.equal(run.h.calls.cacheSets.length, 1);
  assert.equal(run.h.calls.cacheSets[0].element, run.f.alpha);
  assert.equal(run.h.calls.responses.length, 0);
});

checkAsync("executeTool('press_enter') sends pressEnter and the jev branch resolves it", async () => {
  const run = await dispatchAndResolve('press_enter', 'pressEnter', 'Search', { expectedRole: 'searchbox', expectedName: 'Search' });
  assert.equal(run.outcome, 'continued');
  assert.equal(run.params.selector, '#q');
  assert.equal(run.h.calls.cacheSets.length, 1);
  assert.equal(run.h.calls.cacheSets[0].element, run.f.search);
  assert.equal(run.h.calls.responses.length, 0);
});

checkAsync("executeTool('click') and executeTool('hover') send their own verbs and resolve", async () => {
  const click = await dispatchAndResolve('click', 'click', 'Next', {});
  assert.equal(click.outcome, 'continued');
  assert.equal(click.params.selector, '#next');
  const hover = await dispatchAndResolve('hover', 'hover', 'Docs', {});
  assert.equal(hover.outcome, 'continued');
  assert.equal(hover.params.selector, '#docs');
});

// ---------------------------------------------------------------------------
(async () => {
  for (const item of asyncChecks) {
    if (item.title) {
      section(item.title);
      continue;
    }
    try {
      await item.fn();
      passed++;
      console.log('  PASS:', item.label);
    } catch (err) {
      failed++;
      console.error('  FAIL:', item.label);
      console.error('    ', err && err.message ? err.message : err);
    }
  }
  console.log(`\njev fast menu: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
})();
