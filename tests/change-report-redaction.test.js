'use strict';

/**
 * Phase 69 Plan 03 Task 3 -- change_report secret redaction (D-25).
 *
 * MCP-04 security exception (CONTEXT D-25): change_report.inputs_changed
 * values of sensitive fields, and both sides of attrs_changed entries for
 * 'value' attribute records on sensitive inputs, are replaced by '[redacted]'.
 * This is the only intended change to an existing response shape in Phase 69;
 * every other byte of change_report is unchanged.
 *
 * Covered here:
 *   - predicate parity between isRedactedField (utils/action-verification.js)
 *     and the inline predicate of the two page-side harvest functions
 *     (ws/mcp-tool-dispatcher.js), run in a vm the way
 *     tests/hung-page-recovery.test.js slices them;
 *   - in-page capture: sensitive values never leave the page, emptiness does;
 *   - change detection without values (redactedInputsChanged), including a
 *     show-password toggle that flips type="password" to "text";
 *   - the stop serialiser masking 'value' attribute records (React-synced
 *     password value attributes, hidden-input token rotation);
 *   - buildChangeReport masking again (defence in depth) and staying
 *     byte-identical when no redaction data is present;
 *   - one marker shared with the expect evaluator (EXPECT_REDACTED);
 *   - end to end through wrapWithChangeReport with the real page functions;
 *   - the recorded MCP-04 exception: the redacted and today's reports differ
 *     only in the sensitive entries.
 *
 * Run: node tests/change-report-redaction.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// --- Browser global stubs (same shape as tests/change-report-builder.test.js) ---
global.window = global.window || { location: { href: 'https://example.com/' } };
global.document = global.document || {
  title: 'Example',
  body: { innerText: '' },
  activeElement: null,
  documentElement: { tagName: 'HTML' },
  querySelectorAll: () => [],
  querySelector: () => null,
};
global.MutationObserver = global.MutationObserver || function StubObserver() {
  this.observe = () => {};
  this.disconnect = () => {};
};

const AV_PATH = require.resolve('../extension/utils/action-verification.js');
delete require.cache[AV_PATH];
const av = require(AV_PATH);
const { buildChangeReport, isRedactedField, EXPECT_REDACTED, EXPECT_SENSITIVE_NAME_SOURCE } = av;

const DISPATCHER_PATH = path.join(__dirname, '../extension/ws/mcp-tool-dispatcher.js');
const dispatcherSrc = fs.readFileSync(DISPATCHER_PATH, 'utf8');

let passed = 0;
let failed = 0;
const pending = [];

function check(label, fn) {
  try { fn(); passed++; console.log('  PASS:', label); }
  catch (e) { failed++; console.error('  FAIL:', label, '\n    ', e && e.message); }
}

function checkAsync(label, fn) {
  pending.push(async () => {
    try { await fn(); passed++; console.log('  PASS:', label); }
    catch (e) { failed++; console.error('  FAIL:', label, '\n    ', e && e.message); }
  });
}

// =============================================================================
// Harness: the two page-side harvest functions, sliced like hung-page-recovery
// =============================================================================

function sliceFunctions() {
  const startAt = dispatcherSrc.indexOf('function _fsbHarvestStartInPage(');
  const startEnd = dispatcherSrc.indexOf('\n// Page-context harvest stop', startAt);
  const stopAt = dispatcherSrc.indexOf('function _fsbHarvestStopInPage(');
  const stopEnd = dispatcherSrc.indexOf('\n// Wait for DOM-stable', stopAt);
  assert.ok(startAt >= 0 && startEnd > startAt && stopAt > startEnd && stopEnd > stopAt, 'harvest slices found');
  return { start: dispatcherSrc.slice(startAt, startEnd), stop: dispatcherSrc.slice(stopAt, stopEnd) };
}
const SLICES = sliceFunctions();

// Input-like stub. getAttribute answers explicit attrs first, then id/name/type/class.
function field(o) {
  const opts = o || {};
  const attrs = Object.assign({}, opts.attrs || {});
  if (opts.autocomplete !== undefined) attrs.autocomplete = opts.autocomplete;
  const el = {
    tagName: opts.tag || 'INPUT',
    id: opts.id || '',
    name: opts.name || '',
    className: opts.className || '',
    textContent: opts.text || '',
    parentElement: null,
    getAttribute(n) {
      if (Object.prototype.hasOwnProperty.call(attrs, n)) return attrs[n];
      if (n === 'id') return this.id || null;
      if (n === 'name') return this.name || null;
      if (n === 'type') return typeof this.type === 'string' ? this.type : null;
      if (n === 'class') return this.className || null;
      return null;
    },
    setAttribute(n, v) { attrs[n] = String(v); }
  };
  if (opts.type !== undefined) el.type = opts.type;
  if (opts.value !== undefined) el.value = opts.value;
  return el;
}

function makePage(inputs) {
  const observers = [];
  const timers = [];
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.connected = false; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const root = { tagName: 'HTML', className: '', textContent: '', parentElement: null, getAttribute: () => null };
  const window = { location: { href: 'https://example.com/form' } };
  const document = {
    documentElement: root,
    body: { tagName: 'BODY' },
    title: 'Form',
    activeElement: null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === 'input, textarea, [contenteditable="true"]' ? inputs.slice() : [])
  };
  const context = {
    window,
    document,
    MutationObserver: FakeMutationObserver,
    Date, String,
    setTimeout(callback, delay) { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout(timer) { if (timer) timer.cleared = true; }
  };
  const page = vm.runInNewContext(
    `${SLICES.start}\n${SLICES.stop}\n({ start: _fsbHarvestStartInPage, stop: _fsbHarvestStopInPage })`,
    context
  );
  return { page, window, document, observers, timers, root };
}

const FAR = () => Date.now() + 60000;

// Page results come from the vm realm; compare them as plain JSON data.
const plain = (value) => JSON.parse(JSON.stringify(value));

// =============================================================================
// 1. Predicate parity (isRedactedField vs the in-page harvest predicate)
// =============================================================================

console.log('\n--- predicate parity ---');

const PARITY_ROWS = [
  // sensitive
  { label: 'type password', desc: { tag: 'input', type: 'password', id: 'p1' }, want: true },
  { label: 'type hidden', desc: { tag: 'input', type: 'hidden', id: 'h1' }, want: true },
  { label: 'autocomplete current-password', desc: { tag: 'input', type: 'text', id: 'a1', autocomplete: 'current-password' }, want: true },
  { label: 'autocomplete new-password', desc: { tag: 'input', type: 'text', id: 'a2', autocomplete: 'new-password' }, want: true },
  { label: 'autocomplete one-time-code', desc: { tag: 'input', type: 'text', id: 'a3', autocomplete: 'one-time-code' }, want: true },
  { label: 'autocomplete cc-number', desc: { tag: 'input', type: 'text', id: 'a4', autocomplete: 'cc-number' }, want: true },
  { label: "autocomplete 'shipping cc-csc'", desc: { tag: 'input', type: 'text', id: 'a5', autocomplete: 'shipping cc-csc' }, want: true },
  { label: "name 'cvv'", desc: { tag: 'input', type: 'text', name: 'cvv' }, want: true },
  { label: "id 'otp-code'", desc: { tag: 'input', type: 'text', id: 'otp-code' }, want: true },
  { label: "id 'otpCode'", desc: { tag: 'input', type: 'text', id: 'otpCode' }, want: true },
  { label: "name 'userPwd'", desc: { tag: 'input', type: 'text', name: 'userPwd' }, want: true },
  { label: "id 'totp'", desc: { tag: 'input', type: 'text', id: 'totp' }, want: true },
  { label: "id 'TOTPCode'", desc: { tag: 'input', type: 'text', id: 'TOTPCode' }, want: true },
  { label: "name 'passwd'", desc: { tag: 'input', type: 'text', name: 'passwd' }, want: true },
  { label: "name 'Passwd'", desc: { tag: 'input', type: 'text', name: 'Passwd' }, want: true },
  // not sensitive (these keep today's inputs_changed bytes)
  { label: "text input named 'email'", desc: { tag: 'input', type: 'text', name: 'email' }, want: false },
  { label: "id 'footprint'", desc: { tag: 'input', type: 'text', id: 'footprint' }, want: false },
  { label: "id 'hotpot'", desc: { tag: 'input', type: 'text', id: 'hotpot' }, want: false },
  { label: "id 'notpad'", desc: { tag: 'input', type: 'text', id: 'notpad' }, want: false },
  { label: "textarea named 'notes'", desc: { tag: 'textarea', type: 'textarea', name: 'notes' }, want: false },
  { label: 'contenteditable div', desc: { tag: 'div' }, contentEditable: true, want: false }
];

function inPageVerdict(row) {
  const d = row.desc;
  const el = field({
    tag: d.tag.toUpperCase(),
    type: d.type,
    id: d.id,
    name: d.name,
    autocomplete: d.autocomplete,
    value: row.contentEditable ? undefined : 'v',
    text: row.contentEditable ? 'abc' : '',
    attrs: row.contentEditable ? { contenteditable: 'true' } : {}
  });
  const { page } = makePage([el]);
  const r = page.start(null, 'parity', FAR());
  assert.equal(r.ok, true);
  const key = d.id || d.name || 'input_0';
  assert.ok(Array.isArray(r.beforeState.redactedInputKeys), 'redactedInputKeys is always an array');
  return r.beforeState.redactedInputKeys.includes(key);
}

check('isRedactedField and the in-page harvest predicate agree on every row', () => {
  const disagreements = [];
  for (const row of PARITY_ROWS) {
    const sw = isRedactedField(row.desc);
    const pageSide = inPageVerdict(row);
    if (sw !== row.want || pageSide !== row.want) {
      disagreements.push(`${row.label}: want ${row.want}, isRedactedField ${sw}, page ${pageSide}`);
    }
  }
  assert.deepEqual(disagreements, []);
});

check('one marker and one name pattern: the in-page literals equal the evaluator constants', () => {
  for (const [name, src] of Object.entries(SLICES)) {
    const marker = src.match(/const REDACTED = '([^']*)';/);
    assert.ok(marker, `${name}: REDACTED literal present`);
    assert.equal(marker[1], EXPECT_REDACTED, `${name}: marker`);
    const pattern = src.match(/new RegExp\('([^']*)', 'i'\)/);
    assert.ok(pattern, `${name}: sensitive-name RegExp literal present`);
    assert.equal(pattern[1], EXPECT_SENSITIVE_NAME_SOURCE, `${name}: name source`);
  }
});

// =============================================================================
// 2. In-page capture and change detection
// =============================================================================

console.log('\n--- in-page capture ---');

function fourInputs() {
  return {
    pw: field({ type: 'password', id: 'pw', value: 'hunter2' }),
    h: field({ type: 'hidden', id: 'h', value: 'tok-1' }),
    otp: field({ type: 'text', id: 'otp', autocomplete: 'one-time-code', value: '' }),
    email: field({ type: 'text', id: 'email', value: 'a@b.c' })
  };
}

check('start redacts sensitive inputs in the page and lists their keys', () => {
  const f = fourInputs();
  const { page } = makePage([f.pw, f.h, f.otp, f.email]);
  const r = page.start(null, 't1', FAR());
  assert.equal(r.ok, true);
  assert.deepEqual(plain(r.beforeState.inputValues), { pw: '[redacted]', h: '[redacted]', otp: '', email: 'a@b.c' });
  assert.deepEqual([...r.beforeState.redactedInputKeys].sort(), ['h', 'otp', 'pw']);
  const s = JSON.stringify(r);
  assert.ok(!s.includes('hunter2') && !s.includes('tok-1'), 'no raw secret in the start result');
});

check('stop reports changed secrets by key only; raw values stay on the deleted handle', () => {
  const f = fourInputs();
  const { page, window } = makePage([f.pw, f.h, f.otp, f.email]);
  page.start(null, 't2', FAR());
  const handle = window.__fsbChangeReportHandles.t2;
  assert.ok(handle, 'handle stored');
  f.pw.value = 'hunter3';
  f.otp.value = '654321';
  const stop = page.stop('t2');
  assert.equal(stop.ok, true);
  assert.equal(stop.afterState.inputValues.pw, '[redacted]');
  assert.equal(stop.afterState.inputValues.otp, '[redacted]');
  assert.equal(stop.afterState.inputValues.h, '[redacted]');
  assert.equal(stop.afterState.inputValues.email, 'a@b.c');
  assert.deepEqual([...stop.afterState.redactedInputsChanged].sort(), ['otp', 'pw']);
  const s = JSON.stringify(stop);
  for (const secret of ['hunter2', 'hunter3', '654321', 'tok-1']) assert.ok(!s.includes(secret), secret);
  assert.equal(window.__fsbChangeReportHandles.t2, undefined, 'handle (and its raw values) deleted at stop');
});

check('an unmatched stop still redacts and reports no changed keys', () => {
  const f = fourInputs();
  const { page } = makePage([f.pw, f.email]);
  const stop = page.stop('never-started');
  assert.equal(stop.afterState.inputValues.pw, '[redacted]');
  assert.deepEqual(Array.from(stop.afterState.redactedInputsChanged), []);
  assert.ok(!JSON.stringify(stop).includes('hunter2'));
});

check('buildChangeReport over the page states masks sensitive entries and keeps the email delta raw', () => {
  const f = fourInputs();
  const { page } = makePage([f.pw, f.h, f.otp, f.email]);
  const start = page.start(null, 't3', FAR());
  f.pw.value = 'hunter3';
  f.otp.value = '654321';
  f.email.value = 'x@y.z';
  const stop = page.stop('t3');
  const report = buildChangeReport(start.beforeState, stop.afterState, stop.mutations, {});
  assert.deepEqual(report.inputs_changed.pw, { before: '[redacted]', after: '[redacted]' });
  assert.deepEqual(report.inputs_changed.otp, { before: '', after: '[redacted]' });
  assert.equal('h' in report.inputs_changed, false, 'an unchanged secret has no entry');
  assert.deepEqual(report.inputs_changed.email, { before: 'a@b.c', after: 'x@y.z' });
  const s = JSON.stringify(report);
  for (const secret of ['hunter2', 'hunter3', '654321', 'tok-1']) assert.ok(!s.includes(secret), secret);
});

check('defence in depth: listed keys are masked even when a regressed page sent raw values', () => {
  const report = buildChangeReport(
    { url: 'u', inputValues: { pw: 'hunter2', email: 'a@b.c' }, redactedInputKeys: ['pw'] },
    { url: 'u', inputValues: { pw: 'hunter3', email: 'x@y.z' }, redactedInputKeys: ['pw'], redactedInputsChanged: ['pw'] },
    [], {}
  );
  assert.deepEqual(report.inputs_changed.pw, { before: '[redacted]', after: '[redacted]' });
  assert.deepEqual(report.inputs_changed.email, { before: 'a@b.c', after: 'x@y.z' });
  assert.ok(!/hunter/.test(JSON.stringify(report)));
  const gone = buildChangeReport(
    { url: 'u', inputValues: { pw: 'hunter2' }, redactedInputKeys: ['pw'] },
    { url: 'u', inputValues: {}, redactedInputKeys: [] },
    [], {}
  );
  assert.deepEqual(gone.inputs_changed.pw, { before: '[redacted]', after: '' }, 'a removed secret field');
});

// =============================================================================
// 3. Value-attribute records (attrs_changed)
// =============================================================================

console.log('\n--- value-attribute records ---');

function valueRecord(target, oldValue) {
  return { type: 'attributes', attributeName: 'value', oldValue, target, addedNodes: [], removedNodes: [] };
}

check('the stop serialiser masks value records of sensitive inputs and flags them', () => {
  const pw = field({ type: 'password', id: 'pw', value: 'hunter2' });
  const csrf = field({ type: 'hidden', id: 'csrf', value: 'tok-1', attrs: { value: 'tok-1' } });
  const email = field({ type: 'text', id: 'email', value: 'a@b.c' });
  const { page, observers } = makePage([pw, csrf, email]);
  page.start(null, 'v1', FAR());
  // React-style password sync, hidden token rotation, an email edit, and edges.
  pw.value = 'hunter3';
  csrf.value = 'tok-2';
  csrf.setAttribute('value', 'tok-2');
  email.value = 'x@y.z';
  observers[0].callback([
    valueRecord(pw, 'hunter2'),
    valueRecord(csrf, 'tok-1'),
    valueRecord(pw, ''),
    valueRecord(pw, null),
    valueRecord(email, 'a@b.c'),
    { type: 'attributes', attributeName: 'class', oldValue: 'was-plain', target: pw, addedNodes: [], removedNodes: [] }
  ]);
  const stop = page.stop('v1');
  const m = stop.mutations;
  assert.equal(m.length, 6);
  assert.equal(m[0].oldValue, '[redacted]');
  assert.equal(m[0].valueRedacted, true);
  assert.equal(m[1].oldValue, '[redacted]');
  assert.equal(m[1].valueRedacted, true);
  assert.equal(m[2].oldValue, '', 'an empty old value is not a secret');
  assert.equal(m[2].valueRedacted, true);
  assert.equal(m[3].oldValue, null, 'an absent old value stays null');
  assert.equal(m[3].valueRedacted, true);
  assert.deepEqual(Object.keys(m[4]), ['type', 'attributeName', 'oldValue', 'target', 'addedNodes', 'removedNodes'],
    'a non-sensitive value record keeps exactly today\'s six keys');
  assert.equal(m[4].oldValue, 'a@b.c');
  assert.deepEqual(Object.keys(m[5]), ['type', 'attributeName', 'oldValue', 'target', 'addedNodes', 'removedNodes'],
    'a non-value attribute on a sensitive input is not flagged');
  assert.equal(m[5].oldValue, 'was-plain');
  const s = JSON.stringify(stop);
  for (const secret of ['hunter2', 'hunter3', 'tok-1', 'tok-2']) assert.ok(!s.includes(secret), secret);

  const before = { url: 'https://example.com/form', inputValues: {}, redactedInputKeys: [] };
  const report = buildChangeReport(before, stop.afterState, stop.mutations, {});
  const pwEntries = report.attrs_changed.filter((e) => e.selector === '#pw' && e.attr === 'value');
  assert.deepEqual(pwEntries, [
    { selector: '#pw', attr: 'value', before: '[redacted]', after: null },
    { selector: '#pw', attr: 'value', before: '', after: null },
    { selector: '#pw', attr: 'value', before: null, after: null }
  ]);
  assert.deepEqual(report.attrs_changed.find((e) => e.selector === '#csrf'),
    { selector: '#csrf', attr: 'value', before: '[redacted]', after: null });
  assert.deepEqual(report.attrs_changed.find((e) => e.selector === '#email'),
    { selector: '#email', attr: 'value', before: 'a@b.c', after: null }, 'byte-identical to today');
  assert.deepEqual(report.attrs_changed.find((e) => e.attr === 'class'),
    { selector: '#pw', attr: 'class', before: 'was-plain', after: '' });
  const rs = JSON.stringify(report);
  assert.ok(!rs.includes('valueRedacted'), 'the internal flag never reaches change_report');
  for (const secret of ['hunter2', 'hunter3', 'tok-1', 'tok-2']) assert.ok(!rs.includes(secret), secret);
});

check('a show-password toggle (password -> text) never yields a raw value in either channel', () => {
  const pw = field({ type: 'password', id: 'pw', value: 'hunter2', attrs: { value: 'hunter2' } });
  const email = field({ type: 'text', id: 'email', value: 'a@b.c' });
  const { page, observers } = makePage([pw, email]);
  const start = page.start(null, 'flip', FAR());
  // The page flips the field to text and React syncs the value attribute.
  pw.type = 'text';
  pw.value = 'hunter3';
  pw.setAttribute('value', 'hunter3');
  observers[0].callback([
    { type: 'attributes', attributeName: 'type', oldValue: 'password', target: pw, addedNodes: [], removedNodes: [] },
    valueRecord(pw, 'hunter2')
  ]);
  const stop = page.stop('flip');
  assert.equal(stop.afterState.inputValues.pw, '[redacted]', 'sensitive at start stays sensitive');
  assert.ok(stop.afterState.redactedInputKeys.includes('pw'));
  assert.ok(stop.afterState.redactedInputsChanged.includes('pw'));
  const valueRec = stop.mutations.find((r) => r.attributeName === 'value');
  assert.equal(valueRec.oldValue, '[redacted]');
  assert.equal(valueRec.valueRedacted, true);
  const report = buildChangeReport(start.beforeState, stop.afterState, stop.mutations, {});
  assert.deepEqual(report.inputs_changed.pw, { before: '[redacted]', after: '[redacted]' });
  assert.deepEqual(report.attrs_changed.find((e) => e.attr === 'value'),
    { selector: '#pw', attr: 'value', before: '[redacted]', after: null });
  const all = JSON.stringify([start, stop, report]);
  assert.ok(!all.includes('hunter2') && !all.includes('hunter3'));
});

check('builder masks flagged and listed-id value records on both sides; others keep raw values', () => {
  const live = (id, v) => ({ tagName: 'INPUT', getAttribute: (n) => (n === 'id' ? id : (n === 'value' ? v : null)) });
  const flagged = buildChangeReport({ url: 'u' }, { url: 'u' }, [
    { type: 'attributes', attributeName: 'value', oldValue: 'hunter2', valueRedacted: true, target: live('pw', 'hunter3') },
    { type: 'attributes', attributeName: 'value', oldValue: 'a@b.c', target: live('email', 'x@y.z') }
  ], {});
  assert.deepEqual(flagged.attrs_changed, [
    { selector: '#pw', attr: 'value', before: '[redacted]', after: '[redacted]' },
    { selector: '#email', attr: 'value', before: 'a@b.c', after: 'x@y.z' }
  ]);
  const listed = buildChangeReport({ url: 'u', redactedInputKeys: ['pin'] }, { url: 'u', redactedInputKeys: [] }, [
    { type: 'attributes', attributeName: 'value', oldValue: '1234', target: live('pin', '5678') },
    { type: 'attributes', attributeName: 'value', oldValue: '', target: live('pin', '') },
    { type: 'attributes', attributeName: 'value', oldValue: 'q', target: live('search', 'qq') }
  ], {});
  assert.deepEqual(listed.attrs_changed, [
    { selector: '#pin', attr: 'value', before: '[redacted]', after: '[redacted]' },
    { selector: '#pin', attr: 'value', before: '', after: '' },
    { selector: '#search', attr: 'value', before: 'q', after: 'qq' }
  ]);
  const serialisedTarget = { tagName: 'INPUT', _id: 'pin', getAttribute: (n) => (n === 'id' ? 'pin' : null) };
  const viaSerialised = buildChangeReport({ url: 'u' }, { url: 'u', redactedInputKeys: ['pin'] }, [
    { type: 'attributes', attributeName: 'value', oldValue: '9999', target: serialisedTarget }
  ], {});
  assert.deepEqual(viaSerialised.attrs_changed[0], { selector: '#pin', attr: 'value', before: '[redacted]', after: null });
  for (const r of [flagged, listed, viaSerialised]) {
    const s = JSON.stringify(r);
    assert.ok(!/hunter|1234|5678|9999|valueRedacted/.test(s), s);
  }
});

// =============================================================================
// 4. Byte stability where no redaction data is present
// =============================================================================

console.log('\n--- byte stability ---');

check('states without redaction lists produce exactly today\'s output', () => {
  const el = (id, cls) => ({ tagName: 'INPUT', className: cls || '', getAttribute: (n) => (n === 'id' ? id : (n === 'class' ? cls || null : null)) });
  const r = buildChangeReport(
    { url: 'u', title: 't', inputValues: { email: '', pw: 'hunter2' }, activeElementSelector: null },
    { url: 'u', title: 't', inputValues: { email: 'user@example.com', pw: 'hunter3' }, activeElementSelector: 'input#email' },
    [
      { type: 'attributes', attributeName: 'value', oldValue: 'old', target: el('pw') },
      { type: 'attributes', attributeName: 'aria-invalid', oldValue: 'false', target: el('email') }
    ],
    { settleMs: 40 }
  );
  assert.deepEqual(r, {
    url: { before: 'u', after: 'u', changed: false },
    title_changed: false,
    dialogs_opened: [],
    nodes_added: [],
    nodes_removed: [],
    attrs_changed: [
      { selector: '#pw', attr: 'value', before: 'old', after: null },
      { selector: '#email', attr: 'aria-invalid', before: 'false', after: null }
    ],
    inputs_changed: {
      email: { before: '', after: 'user@example.com' },
      pw: { before: 'hunter2', after: 'hunter3' }
    },
    focus_shift: { from: null, to: 'input#email' },
    mutation_count: 2,
    settle_ms: 40,
    truncated: false
  });
});

check('non-array redaction fields are ignored (today\'s path)', () => {
  const r = buildChangeReport(
    { url: 'u', inputValues: { pw: 'a' }, redactedInputKeys: 'pw' },
    { url: 'u', inputValues: { pw: 'b' }, redactedInputKeys: { pw: true }, redactedInputsChanged: 'pw' },
    [], {}
  );
  assert.deepEqual(r.inputs_changed, { pw: { before: 'a', after: 'b' } });
});

check('cross-origin reports are unchanged (inputs_changed stays {})', () => {
  const r = buildChangeReport(
    { url: 'https://a.test/', inputValues: { pw: '[redacted]' }, redactedInputKeys: ['pw'] },
    { url: 'https://b.test/' },
    [], { crossOrigin: true }
  );
  assert.deepEqual(r.inputs_changed, {});
  assert.equal(r.cross_origin, true);
});

// =============================================================================
// 5. MCP-04 exception record
// =============================================================================

console.log('\n--- MCP-04 exception record ---');

check('MCP-04 security exception (CONTEXT D-25)', () => {
  const live = (id, v) => ({ tagName: 'INPUT', getAttribute: (n) => (n === 'id' ? id : (n === 'value' ? v : null)) });
  const inputs = () => ({
    before: { url: 'u', title: 't', inputValues: { pw: 'hunter2', email: 'a@b.c' }, redactedInputKeys: ['pw'] },
    after: { url: 'u', title: 't', inputValues: { pw: 'hunter3', email: 'x@y.z' }, redactedInputKeys: ['pw'], redactedInputsChanged: ['pw'] },
    mutations: [
      { type: 'attributes', attributeName: 'value', oldValue: 'hunter2', valueRedacted: true, target: live('pw', 'hunter3') },
      { type: 'attributes', attributeName: 'value', oldValue: 'a@b.c', target: live('email', 'x@y.z') }
    ]
  });
  const a = inputs();
  const redacted = buildChangeReport(a.before, a.after, a.mutations, { settleMs: 10 });

  // Today's code path: the same inputs without the redaction data.
  const b = inputs();
  delete b.before.redactedInputKeys;
  delete b.after.redactedInputKeys;
  delete b.after.redactedInputsChanged;
  delete b.mutations[0].valueRedacted;
  const today = buildChangeReport(b.before, b.after, b.mutations, { settleMs: 10 });

  assert.deepEqual(today.inputs_changed.pw, { before: 'hunter2', after: 'hunter3' });
  assert.deepEqual(redacted.inputs_changed.pw, { before: '[redacted]', after: '[redacted]' });
  assert.deepEqual(today.attrs_changed[0], { selector: '#pw', attr: 'value', before: 'hunter2', after: 'hunter3' });
  assert.deepEqual(redacted.attrs_changed[0], { selector: '#pw', attr: 'value', before: '[redacted]', after: '[redacted]' });

  // Patch exactly the sensitive values of today's report: the rest must match byte for byte.
  const patched = JSON.parse(JSON.stringify(today));
  patched.inputs_changed.pw = { before: '[redacted]', after: '[redacted]' };
  patched.attrs_changed[0].before = '[redacted]';
  patched.attrs_changed[0].after = '[redacted]';
  assert.equal(JSON.stringify(redacted), JSON.stringify(patched));
  assert.deepEqual(redacted.inputs_changed.email, today.inputs_changed.email);
  assert.deepEqual(redacted.attrs_changed[1], today.attrs_changed[1]);
});

// =============================================================================
// 6. End to end through wrapWithChangeReport
// =============================================================================

checkAsync('end to end: wrapWithChangeReport returns the marker for #pw and the raw email delta', async () => {
  const pw = field({ type: 'password', id: 'pw', value: 'hunter2', attrs: { value: 'hunter2' } });
  const email = field({ type: 'text', id: 'email', value: 'a@b.c' });
  const { page, observers } = makePage([pw, email]);
  const calls = [];
  const priorChrome = global.chrome;
  global.chrome = {
    tabs: { get: async (id) => ({ id, url: 'https://example.com/form' }) },
    scripting: {
      executeScript: async (options) => {
        calls.push(options.func.name);
        if (options.func.name === '_fsbHarvestStartInPage') return [{ result: page.start(...options.args) }];
        if (options.func.name === '_fsbHarvestStopInPage') return [{ result: page.stop(...options.args) }];
        return [{ result: true }];
      }
    },
    storage: { local: { get: (key, cb) => cb({}) }, onChanged: { addListener: () => {} } }
  };
  try {
    const dispatcherPath = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
    delete require.cache[dispatcherPath];
    delete require.cache[AV_PATH];
    delete require.cache[require.resolve('../extension/ai/tool-definitions.js')];
    const dispatcher = require(dispatcherPath);
    dispatcher._setChangeReportsEnabledForTest(true);
    const response = await dispatcher.wrapWithChangeReport({
      toolName: 'type',
      tabId: 9,
      params: { selector: '#pw' },
      execute: async () => {
        pw.value = 'hunter3';
        pw.setAttribute('value', 'hunter3');
        email.value = 'x@y.z';
        observers[0].callback([valueRecord(pw, 'hunter2')]);
        return { success: true, tool: 'type' };
      }
    });
    assert.deepEqual(calls, ['_fsbHarvestStartInPage', '_fsbWaitStableInPage', '_fsbHarvestStopInPage']);
    assert.equal(response.success, true);
    const cr = response.change_report;
    assert.ok(cr, 'change_report attached');
    assert.deepEqual(cr.inputs_changed, {
      pw: { before: '[redacted]', after: '[redacted]' },
      email: { before: 'a@b.c', after: 'x@y.z' }
    });
    assert.deepEqual(cr.attrs_changed, [{ selector: '#pw', attr: 'value', before: '[redacted]', after: null }]);
    const s = JSON.stringify(response);
    assert.ok(!s.includes('hunter2') && !s.includes('hunter3'), 'no raw secret in the response');
    assert.ok(!s.includes('valueRedacted'));
  } finally {
    global.chrome = priorChrome;
  }
});

// =============================================================================
// Runner
// =============================================================================

(async () => {
  for (const run of pending) await run();
  console.log(`\n[change-report-redaction] ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
