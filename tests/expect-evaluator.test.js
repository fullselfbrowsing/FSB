'use strict';

/**
 * Phase 69 Plan 03 -- same-call `expect` evaluator (MCP-02, SC2).
 *
 * Exercises the expect contract in extension/utils/action-verification.js in
 * plain Node: the frozen constants (D-12, D-13, D-19, D-20), spec
 * normalization, timeout clamping, status aggregation, observed-string caps,
 * the sensitive-field predicate, the uncertain-result builder, the
 * self-contained page probe (driven against stub window/document objects) and
 * the bounded evaluation loop (driven with injected deps and a fake clock).
 *
 * Browser globals are stubbed before the require, in the change-report-builder
 * style, although the module touches no DOM global at load time.
 *
 * Run: node tests/expect-evaluator.test.js
 */

const assert = require('node:assert/strict');

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

const MODULE_PATH = require.resolve('../extension/utils/action-verification.js');
delete require.cache[MODULE_PATH];
const av = require(MODULE_PATH);

const STUB_WINDOW = global.window;
const STUB_DOCUMENT = global.document;

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
// Task 1 -- constants and pure helpers
// =============================================================================

console.log('\n--- expect contract constants ---');

const D12_ORDER = [
  'execute_js', 'click', 'right_click', 'double_click', 'click_at', 'double_click_at', 'click_and_hold',
  'type_text', 'insert_text', 'press_enter', 'press_key', 'clear_input',
  'select_option', 'check_box', 'set_attribute',
  'drag_drop', 'drag', 'drag_variable_speed', 'drop_file', 'upload_file',
  'select_text_range', 'scroll_to_top', 'scroll_to_bottom', 'scroll_to_element',
  'navigate', 'go_back', 'go_forward', 'refresh', 'back'
];

check('EXPECT_TOOL_NAMES has the 29 D-12 tools in the exact order', () => {
  assert.equal(av.EXPECT_TOOL_NAMES.length, 29);
  assert.deepEqual(Array.from(av.EXPECT_TOOL_NAMES), D12_ORDER);
});

check('EXPECT_NAV_TOOL_NAMES lists the five navigation tools', () => {
  assert.deepEqual(Array.from(av.EXPECT_NAV_TOOL_NAMES), ['navigate', 'go_back', 'go_forward', 'refresh', 'back']);
  for (const name of av.EXPECT_NAV_TOOL_NAMES) assert.ok(av.EXPECT_TOOL_NAMES.includes(name), name);
});

check('spec, predicate, state, result and check key lists match the shared contract', () => {
  assert.deepEqual(Array.from(av.EXPECT_SPEC_KEYS),
    ['url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'state', 'value', 'dialog_open', 'timeout_ms']);
  assert.deepEqual(Array.from(av.EXPECT_PREDICATE_KEYS),
    ['url_includes', 'title_includes', 'text_visible', 'text_gone', 'selector', 'dialog_open']);
  assert.deepEqual(Array.from(av.EXPECT_STATES), ['visible', 'gone', 'checked', 'unchecked']);
  assert.deepEqual(Array.from(av.EXPECT_RESULT_KEYS), ['status', 'checks', 'waited_ms', 'timeout_ms', 'reason']);
  assert.deepEqual(Array.from(av.EXPECT_CHECK_KEYS), ['kind', 'expected', 'observed', 'status']);
  assert.deepEqual(Array.from(av.EXPECT_CHECK_KINDS),
    ['url_includes', 'title_includes', 'text_visible', 'text_gone', 'state', 'value', 'dialog_open']);
  assert.deepEqual(Array.from(av.EXPECT_STATUSES), ['verified', 'unmet', 'uncertain']);
  assert.deepEqual(Array.from(av.EXPECT_CHECK_STATUSES), ['met', 'unmet', 'uncertain']);
});

check('timing and size constants hold the D-20 values', () => {
  assert.equal(av.EXPECT_DEFAULT_TIMEOUT_MS, 2000);
  assert.equal(av.EXPECT_MAX_TIMEOUT_MS, 5000);
  assert.equal(av.EXPECT_POLL_INTERVAL_MS, 200);
  assert.equal(av.EXPECT_OBSERVED_MAX, 120);
  assert.equal(av.EXPECT_STRING_MAX, 2000);
  assert.equal(av.EXPECT_TEXT_SCAN_MAX_CHARS, 200000);
  assert.equal(av.EXPECT_SHADOW_HOST_BUDGET, 2000);
  assert.equal(av.EXPECT_REDACTED, '[redacted]');
  assert.equal(typeof av.EXPECT_SENSITIVE_NAME_SOURCE, 'string');
  assert.doesNotThrow(() => new RegExp(av.EXPECT_SENSITIVE_NAME_SOURCE, 'i'));
});

check('EXPECT_UNCERTAIN_REASONS lists every reason, including extension_unsupported', () => {
  assert.deepEqual(Array.from(av.EXPECT_UNCERTAIN_REASONS), [
    'extension_unsupported', 'invalid_expect', 'evaluator_unavailable', 'evaluator_failed', 'no_tab',
    'tab_closed', 'restricted_page', 'no_commit', 'still_loading', 'page_unresponsive', 'probe_failed',
    'probe_timeout', 'stale_document', 'ref_unavailable', 'invalid_selector', 'text_budget_exhausted',
    'no_toggle_signal', 'value_unreadable'
  ]);
  assert.ok(av.EXPECT_UNCERTAIN_REASONS.includes('extension_unsupported'));
});

check('every array constant is frozen', () => {
  for (const name of [
    'EXPECT_TOOL_NAMES', 'EXPECT_NAV_TOOL_NAMES', 'EXPECT_SPEC_KEYS', 'EXPECT_PREDICATE_KEYS', 'EXPECT_STATES',
    'EXPECT_RESULT_KEYS', 'EXPECT_CHECK_KEYS', 'EXPECT_CHECK_KINDS', 'EXPECT_STATUSES', 'EXPECT_CHECK_STATUSES',
    'EXPECT_UNCERTAIN_REASONS'
  ]) {
    assert.ok(Array.isArray(av[name]), `${name} is an array`);
    assert.ok(Object.isFrozen(av[name]), `${name} is frozen`);
  }
});

console.log('\n--- clampExpectTimeoutMs ---');

check('clampExpectTimeoutMs follows the D-20 table', () => {
  const rows = [
    [undefined, 2000], [null, 2000], ['abc', 2000], [NaN, 2000], [Infinity, 2000],
    [-5, 0], [0, 0], [1234.9, 1234], ['3000', 3000], [99999, 5000], [5000, 5000]
  ];
  for (const [input, want] of rows) {
    assert.equal(av.clampExpectTimeoutMs(input), want, `clamp(${String(input)})`);
  }
});

console.log('\n--- normalizeExpectSpec ---');

function invalid(raw, label) {
  const r = av.normalizeExpectSpec(raw);
  assert.equal(r.ok, false, `${label} should be invalid`);
  assert.equal(r.reason, 'invalid_expect', `${label} reason`);
  assert.equal(typeof r.detail, 'string', `${label} detail`);
}

check('rejects empty, predicate-less, orphan state/value, bad enum, unknown key and empty strings', () => {
  invalid({}, '{}');
  invalid({ timeout_ms: 100 }, 'timeout only');
  invalid({ state: 'checked' }, 'state without selector');
  invalid({ value: 'x' }, 'value without selector');
  invalid({ selector: '#a', state: 'bogus' }, 'bad state');
  invalid({ bogus: 1 }, 'unknown key');
  invalid({ text_visible: 'a', bogus: 1 }, 'unknown key beside a predicate');
  invalid({ text_visible: '' }, 'empty text_visible');
  invalid({ url_includes: '' }, 'empty url_includes');
  invalid({ selector: '' }, 'empty selector');
  invalid({ text_visible: 5 }, 'non-string text_visible');
  invalid({ dialog_open: 'yes' }, 'non-boolean dialog_open');
  invalid({ text_visible: 'a', timeout_ms: 'abc' }, 'non-numeric timeout_ms');
  invalid({ text_visible: 'a', timeout_ms: 1.5 }, 'fractional timeout_ms');
  invalid({ text_visible: 'a', timeout_ms: '' }, 'empty-string timeout_ms');
});

check('rejects a 2,001-character string and non-object specs', () => {
  invalid({ text_visible: 'x'.repeat(2001) }, '2001-char text_visible');
  invalid({ selector: '#a', value: 'x'.repeat(2001) }, '2001-char value');
  invalid([], 'array');
  invalid(null, 'null');
  invalid('str', 'string');
  invalid(undefined, 'undefined');
  invalid(Object.create({ text_visible: 'x' }), 'non-plain object');
  const ok = av.normalizeExpectSpec({ text_visible: 'x'.repeat(2000) });
  assert.equal(ok.ok, true, 'a 2000-char string is still accepted');
});

check('whitespace-only predicates are rejected; a blank value is still a check (WR-03)', () => {
  invalid({ text_visible: '   ' }, 'blank text_visible');
  invalid({ title_includes: ' \t\n ' }, 'blank title_includes');
  invalid({ text_gone: '  ' }, 'blank text_gone');
  invalid({ url_includes: ' ' }, 'blank url_includes');
  invalid({ selector: '  ' }, 'blank selector');
  invalid({ selector: '  ', value: 'x' }, 'blank selector with value');
  const v = av.normalizeExpectSpec({ selector: '#q', value: '   ' });
  assert.equal(v.ok, true, 'value may be blank');
  assert.deepEqual(v.spec.checks, [{ kind: 'value', expected: '   ', selector: '#q' }]);
  assert.equal(av.normalizeExpectSpec({ text_visible: ' Order saved ' }).ok, true, 'padding around text is fine');
});

check("value: '' is a valid check (D-13); empty strings stay invalid elsewhere", () => {
  const r = av.normalizeExpectSpec({ selector: '#q', value: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.spec.checks, [{ kind: 'value', expected: '', selector: '#q' }]);
  invalid({ selector: '', value: 'x' }, 'empty selector with value');
  invalid({ selector: '#q', value: '', text_visible: '' }, 'empty text_visible beside value ""');
});

check('a bare selector means state visible; value alone yields only a value check', () => {
  const a = av.normalizeExpectSpec({ selector: '#a' });
  assert.equal(a.ok, true);
  assert.deepEqual(a.spec.checks, [{ kind: 'state', expected: 'visible', selector: '#a' }]);
  const b = av.normalizeExpectSpec({ selector: '#a', value: 'x' });
  assert.deepEqual(b.spec.checks, [{ kind: 'value', expected: 'x', selector: '#a' }]);
  const c = av.normalizeExpectSpec({ selector: '#a', state: 'checked', value: 'x' });
  assert.deepEqual(c.spec.checks.map((k) => k.kind), ['state', 'value']);
  assert.equal(c.spec.checks[0].expected, 'checked');
});

check('every predicate yields kinds in the fixed order; timeoutMs is clamped', () => {
  const r = av.normalizeExpectSpec({
    dialog_open: false, value: 'v', state: 'gone', selector: '#s', text_gone: 'Loading',
    text_visible: 'Saved', title_includes: 'Inbox', url_includes: '/done', timeout_ms: 99999
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.spec.checks.map((k) => k.kind),
    ['url_includes', 'title_includes', 'text_visible', 'text_gone', 'state', 'value', 'dialog_open']);
  assert.equal(r.spec.timeoutMs, 5000);
  assert.equal(r.spec.checks[6].expected, false);
  assert.equal(av.normalizeExpectSpec({ text_visible: 'a' }).spec.timeoutMs, 2000);
  assert.equal(av.normalizeExpectSpec({ text_visible: 'a', timeout_ms: '300' }).spec.timeoutMs, 300);
  assert.equal(av.normalizeExpectSpec({ text_visible: 'a', timeout_ms: -50 }).spec.timeoutMs, 0);
});

check('timeout_ms null is omitted (default 2000); booleans, blank strings and arrays are rejected (WR-02)', () => {
  const n = av.normalizeExpectSpec({ text_visible: 'a', timeout_ms: null });
  assert.equal(n.ok, true, 'null is accepted as omitted');
  assert.equal(n.spec.timeoutMs, 2000);
  invalid({ text_visible: 'a', timeout_ms: true }, 'timeout_ms true');
  invalid({ text_visible: 'a', timeout_ms: false }, 'timeout_ms false');
  invalid({ text_visible: 'a', timeout_ms: '   ' }, 'whitespace timeout_ms');
  invalid({ text_visible: 'a', timeout_ms: [500] }, 'array timeout_ms');
});

check('a value check on a sensitive-looking selector carries sensitiveHint', () => {
  const pw = av.normalizeExpectSpec({ selector: 'input[type="password"]', value: 'x' });
  assert.equal(pw.spec.checks[0].sensitiveHint, true);
  const otp = av.normalizeExpectSpec({ selector: '#otp-code', value: '1' });
  assert.equal(otp.spec.checks[0].sensitiveHint, true);
  const plain = av.normalizeExpectSpec({ selector: '#footprint', value: '1' });
  assert.equal('sensitiveHint' in plain.spec.checks[0], false);
});

console.log('\n--- aggregateExpectStatus / capObserved ---');

check('aggregateExpectStatus: verified, unmet, uncertain', () => {
  const s = (...xs) => xs.map((status) => ({ status }));
  assert.equal(av.aggregateExpectStatus(s('met', 'met')), 'verified');
  assert.equal(av.aggregateExpectStatus(s('met', 'unmet', 'uncertain')), 'unmet');
  assert.equal(av.aggregateExpectStatus(s('met', 'uncertain')), 'uncertain');
  assert.equal(av.aggregateExpectStatus([]), 'uncertain');
  assert.equal(av.aggregateExpectStatus(null), 'uncertain');
});

check('capObserved caps strings at 120 characters', () => {
  const long = 'a'.repeat(121);
  const capped = av.capObserved(long);
  assert.equal(capped.length, 120);
  assert.ok(capped.endsWith('...'));
  assert.equal(capped.slice(0, 117), 'a'.repeat(117));
  assert.equal(av.capObserved('a'.repeat(120)), 'a'.repeat(120));
  assert.equal(av.capObserved('short'), 'short');
  assert.equal(av.capObserved(true), true);
  assert.equal(av.capObserved(null), null);
});

console.log('\n--- isRedactedField ---');

const f = (o) => av.isRedactedField(Object.assign({ tag: 'input', type: 'text' }, o));

check('password, hidden, credential autocomplete and sensitive names are redacted', () => {
  assert.equal(f({ type: 'password' }), true, 'password');
  assert.equal(f({ type: 'hidden' }), true, 'hidden');
  assert.equal(f({ autocomplete: 'cc-number' }), true, 'cc-number');
  assert.equal(f({ autocomplete: 'current-password' }), true, 'current-password');
  assert.equal(f({ autocomplete: 'new-password' }), true, 'new-password');
  assert.equal(f({ autocomplete: 'one-time-code' }), true, 'one-time-code');
  assert.equal(f({ autocomplete: 'shipping cc-csc' }), true, 'shipping cc-csc');
  assert.equal(f({ name: 'cvv' }), true, 'cvv');
  assert.equal(f({ id: 'otp-code' }), true, 'otp-code');
  assert.equal(f({ id: 'otpCode' }), true, 'otpCode');
  assert.equal(f({ id: 'OTPCode' }), true, 'OTPCode');
  assert.equal(f({ name: 'userPwd' }), true, 'userPwd');
  assert.equal(f({ name: 'card_number' }), true, 'card_number');
  assert.equal(f({ id: 'totp' }), true, 'totp');
  assert.equal(f({ id: 'TOTPCode' }), true, 'TOTPCode');
  assert.equal(f({ name: 'passwd' }), true, 'passwd');
  assert.equal(f({ name: 'Passwd' }), true, 'Passwd');
  assert.equal(f({ name: 'newPassword' }), true, 'newPassword');
  assert.equal(f({ name: 'security_code' }), true, 'security_code');
});

check('ordinary fields stay non-sensitive (boundary-aware short terms)', () => {
  assert.equal(f({ name: 'email' }), false, 'email');
  assert.equal(f({ id: 'footprint' }), false, 'footprint');
  assert.equal(f({ id: 'hotpot' }), false, 'hotpot');
  assert.equal(f({ name: 'notpad' }), false, 'notpad');
  assert.equal(f({ name: 'passport' }), false, 'passport');
  assert.equal(f({ name: 'account_number' }), false, 'account_number');
  assert.equal(f({ autocomplete: 'off' }), false, 'autocomplete off');
  assert.equal(av.isRedactedField({ tag: 'textarea', type: 'textarea', name: 'notes' }), false, 'textarea notes');
  assert.equal(av.isRedactedField({ tag: 'div' }), false, 'contenteditable div');
  assert.equal(av.isRedactedField(null), false, 'null');
});

check('run-together lowercase ids are a documented miss of the name rule only', () => {
  assert.equal(f({ id: 'otpcode' }), false, 'otpcode (name rule only)');
  assert.equal(f({ id: 'otpcode', autocomplete: 'one-time-code' }), true, 'autocomplete still applies');
});

console.log('\n--- buildUncertainExpectResult ---');

check('buildUncertainExpectResult has exactly the result and check keys, observed null', () => {
  const spec = av.normalizeExpectSpec({
    url_includes: '/a', title_includes: 'T', text_visible: 'x', text_gone: 'y',
    selector: '#s', value: 'v', dialog_open: true, timeout_ms: 700
  }).spec;
  const r = av.buildUncertainExpectResult(spec, 'extension_unsupported');
  assert.deepEqual(Object.keys(r), ['status', 'checks', 'waited_ms', 'timeout_ms', 'reason']);
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'extension_unsupported');
  assert.equal(r.waited_ms, 0);
  assert.equal(r.timeout_ms, 700);
  assert.equal(r.checks.length, 6);
  for (const c of r.checks) {
    assert.deepEqual(Object.keys(c), ['kind', 'expected', 'observed', 'status']);
    assert.equal(c.observed, null);
    assert.equal(c.status, 'uncertain');
  }
  const value = r.checks.find((c) => c.kind === 'value');
  assert.equal(value.expected, av.EXPECT_REDACTED, 'an unobserved value check never echoes the expected value');
});

check('buildUncertainExpectResult(null, reason) uses the default timeout and no checks', () => {
  const r = av.buildUncertainExpectResult(null, 'invalid_expect');
  assert.deepEqual(r, { status: 'uncertain', checks: [], waited_ms: 0, timeout_ms: 2000, reason: 'invalid_expect' });
});

console.log('\n--- existing change-report exports ---');

check('the module still exports the change-report builder unchanged', () => {
  assert.equal(typeof av.buildChangeReport, 'function');
  assert.equal(typeof av.applyChangeReportSizeCap, 'function');
  const r = av.buildChangeReport({ url: 'u', inputValues: { email: '' } }, { url: 'u', inputValues: { email: 'a@b.c' } }, [], {});
  assert.deepEqual(r.inputs_changed, { email: { before: '', after: 'a@b.c' } });
});

// =============================================================================
// Task 2 -- the self-contained page probe
// =============================================================================

console.log('\n--- _fsbExpectProbeInPage (stub DOM) ---');

const vm = require('node:vm');

// Element-like stub. getAttribute answers attrs first, then id/name/type.
function stubEl(o) {
  const opts = o || {};
  const attrs = Object.assign({}, opts.attrs || {});
  const e = {
    tagName: opts.tag || 'DIV',
    id: opts.id || '',
    name: opts.name || '',
    textContent: opts.text != null ? opts.text : '',
    innerText: opts.innerText != null ? opts.innerText : (opts.text != null ? opts.text : ''),
    isConnected: opts.isConnected !== false,
    parentElement: opts.parent || null,
    shadowRoot: opts.shadowRoot || null,
    _rects: opts.rects != null ? opts.rects : [{ width: 10, height: 10 }],
    _visibility: opts.visibility || 'visible',
    getAttribute(n) {
      if (Object.prototype.hasOwnProperty.call(attrs, n)) return attrs[n];
      if (n === 'id' && this.id) return this.id;
      if (n === 'name' && this.name) return this.name;
      if (n === 'type' && typeof this.type === 'string') return this.type;
      return null;
    },
    hasAttribute(n) { return this.getAttribute(n) !== null; },
    getClientRects() { return this._rects; }
  };
  if (opts.type !== undefined) e.type = opts.type;
  if (opts.value !== undefined) e.value = opts.value;
  if (opts.checked !== undefined) e.checked = opts.checked;
  if (opts.open !== undefined) e.open = opts.open;
  if (opts.control !== undefined) e.control = opts.control;
  if (opts.isContentEditable !== undefined) e.isContentEditable = opts.isContentEditable;
  return e;
}

// Builds stub window/document globals for one probe run.
function stubPage(o) {
  const opts = o || {};
  const bySelector = opts.elements || {};
  const all = opts.all || Object.values(bySelector);
  const dialogs = opts.dialogs || [];
  const doc = {
    title: opts.title || 'Stub',
    body: { innerText: opts.bodyText != null ? opts.bodyText : '' },
    documentElement: { tagName: 'HTML' },
    querySelector(sel) {
      if (opts.throwOn && opts.throwOn.includes(sel)) throw new SyntaxError(`'${sel}' is not a valid selector`);
      return Object.prototype.hasOwnProperty.call(bySelector, sel) ? bySelector[sel] : null;
    },
    querySelectorAll(sel) {
      if (sel === '*') return all;
      if (/dialog/.test(sel)) return dialogs;
      return [];
    }
  };
  if (opts.bodyThrows) {
    Object.defineProperty(doc, 'body', { get() { throw new Error('body exploded'); } });
  }
  const win = {
    location: { href: opts.url || 'https://example.com/' },
    getComputedStyle: (el) => ({ visibility: (el && el._visibility) || 'visible' })
  };
  if (opts.FSB) win.FSB = opts.FSB;
  return { win, doc };
}

function probeSpec(checks, extra) {
  return Object.assign({
    checks,
    textScanMax: av.EXPECT_TEXT_SCAN_MAX_CHARS,
    shadowHostBudget: av.EXPECT_SHADOW_HOST_BUDGET,
    observedMax: av.EXPECT_OBSERVED_MAX,
    redacted: av.EXPECT_REDACTED,
    sensitiveNameSource: av.EXPECT_SENSITIVE_NAME_SOURCE
  }, extra || {});
}

function runProbe(pageOpts, checks, extra) {
  const { win, doc } = stubPage(pageOpts);
  const priorWindow = global.window;
  const priorDocument = global.document;
  global.window = win;
  global.document = doc;
  try {
    return av._fsbExpectProbeInPage(probeSpec(checks, extra));
  } finally {
    global.window = priorWindow;
    global.document = priorDocument;
  }
}

function obsOf(result, i) {
  assert.equal(result.ok, true, `probe ok (${result && result.error})`);
  return result.observations[i || 0];
}

check('probe source is self-contained: no timers, observers, rAF or extension APIs', () => {
  const src = String(av._fsbExpectProbeInPage);
  assert.ok(!/setTimeout|MutationObserver|requestAnimationFrame|chrome\./.test(src));
});

check('probe runs in a fresh vm context with only window/document (no closures over SW scope)', () => {
  const { win, doc } = stubPage({ bodyText: 'Order Saved' });
  const spec = probeSpec([{ kind: 'text_visible', expected: 'order saved' }]);
  const result = vm.runInNewContext(`(${String(av._fsbExpectProbeInPage)})(${JSON.stringify(spec)})`,
    { window: win, document: doc });
  assert.equal(result.ok, true);
  assert.equal(result.observations[0].holds, true);
});

check('text_visible matches lowercased, whitespace-collapsed body text', () => {
  const r = runProbe({ bodyText: 'Your   order\n\nwas  SAVED.' }, [
    { kind: 'text_visible', expected: 'order was saved' },
    { kind: 'text_visible', expected: 'Nope' }
  ]);
  assert.deepEqual(obsOf(r, 0), { kind: 'text_visible', observable: true, holds: true, observed: 'present', redact: false });
  assert.equal(obsOf(r, 1).holds, false);
  assert.equal(obsOf(r, 1).observed, 'absent');
  assert.equal(r.textTruncated, false);
});

check('the probe reports document.readyState, or null when the document has none', () => {
  const { win, doc } = stubPage({ bodyText: '' });
  doc.readyState = 'loading';
  const priorWindow = global.window;
  const priorDocument = global.document;
  global.window = win; global.document = doc;
  let r;
  try { r = av._fsbExpectProbeInPage(probeSpec([{ kind: 'text_gone', expected: 'Error' }])); }
  finally { global.window = priorWindow; global.document = priorDocument; }
  assert.equal(r.ok, true);
  assert.equal(r.readyState, 'loading');
  assert.equal(runProbe({ bodyText: 'x' }, [{ kind: 'text_visible', expected: 'x' }]).readyState, null);
});

check('text checks include open shadow-root text', () => {
  const shadowRoot = {
    childNodes: [{ nodeType: 1, tagName: 'SPAN', innerText: 'Shadow  Greeting', textContent: 'Shadow  Greeting' }],
    querySelectorAll: () => []
  };
  const host = stubEl({ tag: 'MY-WIDGET', shadowRoot });
  const r = runProbe({ bodyText: 'Light text', all: [host] }, [
    { kind: 'text_visible', expected: 'shadow greeting' },
    { kind: 'text_gone', expected: 'shadow greeting' }
  ]);
  assert.equal(obsOf(r, 0).holds, true);
  assert.equal(obsOf(r, 1).holds, false);
});

check('text_gone holds when absent; a truncated scan without a match is text_budget_exhausted', () => {
  const full = runProbe({ bodyText: 'Done' }, [{ kind: 'text_gone', expected: 'Loading' }]);
  assert.equal(obsOf(full).observable, true);
  assert.equal(obsOf(full).holds, true);
  const truncated = runProbe({ bodyText: 'a'.repeat(50) + ' Loading' }, [
    { kind: 'text_gone', expected: 'Loading' },
    { kind: 'text_visible', expected: 'aaaa' }
  ], { textScanMax: 20 });
  assert.equal(truncated.textTruncated, true);
  assert.equal(obsOf(truncated, 0).observable, false);
  assert.equal(obsOf(truncated, 0).reason, 'text_budget_exhausted');
  assert.equal(obsOf(truncated, 0).observed, null);
  assert.equal(obsOf(truncated, 1).holds, true, 'a match inside the scanned part still counts');
});

check('the shadow-host budget bounds the scan and marks it truncated', () => {
  const mk = (t) => stubEl({ tag: 'X-H', shadowRoot: { childNodes: [{ nodeType: 3, textContent: t }], querySelectorAll: () => [] } });
  const r = runProbe({ bodyText: 'body', all: [mk('one'), mk('two'), mk('three')] }, [
    { kind: 'text_gone', expected: 'three' }
  ], { shadowHostBudget: 2 });
  assert.equal(r.textTruncated, true);
  assert.equal(obsOf(r).observable, false);
  assert.equal(obsOf(r).reason, 'text_budget_exhausted');
});

check('an FSB ref uses window.FSB.resolveRef; without FSB it is ref_unavailable', () => {
  const target = stubEl({ tag: 'BUTTON' });
  const seen = [];
  const withFsb = runProbe({ FSB: { resolveRef: (ref) => { seen.push(ref); return target; } } }, [
    { kind: 'state', expected: 'visible', selector: 'e12' }
  ]);
  assert.deepEqual(seen, ['e12']);
  assert.equal(obsOf(withFsb).holds, true);
  const without = runProbe({}, [{ kind: 'state', expected: 'visible', selector: 'e12' }]);
  assert.equal(obsOf(without).observable, false);
  assert.equal(obsOf(without).reason, 'ref_unavailable');
  assert.equal(obsOf(without).observed, null);
});

check('CSS selectors use FSB.querySelectorWithShadow when present, else document.querySelector', () => {
  const viaFsb = stubEl({ tag: 'DIV' });
  const seen = [];
  const r1 = runProbe({ FSB: { querySelectorWithShadow: (s) => { seen.push(s); return viaFsb; } } }, [
    { kind: 'state', expected: 'visible', selector: '#deep' }
  ]);
  assert.deepEqual(seen, ['#deep']);
  assert.equal(obsOf(r1).holds, true);
  const viaDoc = stubEl({ tag: 'DIV' });
  const r2 = runProbe({ elements: { '#plain': viaDoc } }, [{ kind: 'state', expected: 'visible', selector: '#plain' }]);
  assert.equal(obsOf(r2).holds, true);
});

check('a throwing selector is invalid_selector', () => {
  const r = runProbe({ throwOn: ['div[[['] }, [{ kind: 'state', expected: 'visible', selector: 'div[[[' }]);
  assert.equal(obsOf(r).observable, false);
  assert.equal(obsOf(r).reason, 'invalid_selector');
  const r2 = runProbe({ throwOn: ['div[[['], FSB: { querySelectorWithShadow: () => null } },
    [{ kind: 'state', expected: 'gone', selector: 'div[[[' }]);
  assert.equal(obsOf(r2).reason, 'invalid_selector', 'FSB swallowing the error does not turn it into absent');
});

check('state visible / gone report visible, hidden or absent', () => {
  const shown = stubEl({});
  const invisible = stubEl({ visibility: 'hidden' });
  const noRects = stubEl({ rects: [] });
  const detached = stubEl({ isConnected: false });
  const page = { elements: { '#shown': shown, '#invisible': invisible, '#norects': noRects, '#detached': detached } };
  const r = runProbe(page, [
    { kind: 'state', expected: 'visible', selector: '#shown' },
    { kind: 'state', expected: 'visible', selector: '#invisible' },
    { kind: 'state', expected: 'gone', selector: '#norects' },
    { kind: 'state', expected: 'gone', selector: '#detached' },
    { kind: 'state', expected: 'gone', selector: '#missing' },
    { kind: 'state', expected: 'visible', selector: '#missing' },
    { kind: 'state', expected: 'gone', selector: '#shown' }
  ]);
  const got = r.observations.map((o) => [o.observable, o.holds, o.observed]);
  assert.deepEqual(got, [
    [true, true, 'visible'],
    [true, false, 'hidden'],
    [true, true, 'hidden'],
    [true, true, 'hidden'],
    [true, true, 'absent'],
    [true, false, 'absent'],
    [true, false, 'visible']
  ]);
});

check('checked / unchecked read the D-13 toggle signals of the element', () => {
  const page = {
    elements: {
      '#cb-on': stubEl({ tag: 'INPUT', type: 'checkbox', checked: true }),
      '#cb-off': stubEl({ tag: 'INPUT', type: 'checkbox', checked: false }),
      '#aria-checked': stubEl({ attrs: { 'aria-checked': 'true' } }),
      '#pressed': stubEl({ tag: 'BUTTON', attrs: { 'aria-pressed': 'true' } }),
      '#unpressed': stubEl({ tag: 'BUTTON', attrs: { 'aria-pressed': 'false' } }),
      '#selected': stubEl({ attrs: { 'aria-selected': 'true' } }),
      '#ds-open': stubEl({ attrs: { 'data-state': 'open' } }),
      '#ds-on': stubEl({ attrs: { 'data-state': 'on' } }),
      '#ds-closed': stubEl({ attrs: { 'data-state': 'closed' } }),
      '#details': stubEl({ tag: 'DETAILS', open: true }),
      '#expanded-only': stubEl({ attrs: { 'aria-expanded': 'true' } }),
      '#text': stubEl({ tag: 'INPUT', type: 'text', checked: false, value: 'x' })
    }
  };
  const rows = [
    ['#cb-on', 'checked', true, true, 'checked'],
    ['#cb-off', 'unchecked', true, true, 'unchecked'],
    ['#cb-off', 'checked', true, false, 'unchecked'],
    ['#aria-checked', 'checked', true, true, 'checked'],
    ['#pressed', 'checked', true, true, 'checked'],
    ['#unpressed', 'unchecked', true, true, 'unchecked'],
    ['#selected', 'checked', true, true, 'checked'],
    ['#ds-open', 'checked', true, true, 'checked'],
    ['#ds-on', 'checked', true, true, 'checked'],
    ['#ds-closed', 'unchecked', true, true, 'unchecked'],
    ['#details', 'checked', true, true, 'checked'],
    ['#missing', 'checked', true, false, 'absent'],
    ['#missing', 'unchecked', true, false, 'absent']
  ];
  const r = runProbe(page, rows.map(([selector, expected]) => ({ kind: 'state', expected, selector })));
  rows.forEach(([sel, exp, observable, holds, observed], i) => {
    const o = r.observations[i];
    assert.deepEqual([o.observable, o.holds, o.observed], [observable, holds, observed], `${sel} ${exp}`);
  });
  const none = runProbe(page, [
    { kind: 'state', expected: 'checked', selector: '#expanded-only' },
    { kind: 'state', expected: 'unchecked', selector: '#text' }
  ]);
  for (const o of none.observations) {
    assert.equal(o.observable, false, 'aria-expanded and a text input carry no toggle signal');
    assert.equal(o.reason, 'no_toggle_signal');
  }
});

check('checked follows the associated control: label -> control, summary -> details', () => {
  const control = stubEl({ tag: 'INPUT', type: 'checkbox', checked: true });
  const label = stubEl({ tag: 'LABEL', control });
  const details = stubEl({ tag: 'DETAILS', open: false });
  const summary = stubEl({ tag: 'SUMMARY', parent: details });
  const r = runProbe({ elements: { '#label': label, '#summary': summary } }, [
    { kind: 'state', expected: 'checked', selector: '#label' },
    { kind: 'state', expected: 'unchecked', selector: '#summary' }
  ]);
  assert.equal(r.observations[0].holds, true);
  assert.equal(r.observations[1].holds, true);
  assert.equal(r.observations[1].observed, 'unchecked');
});

check('value compares in the page and never returns the raw value', () => {
  const page = {
    elements: {
      '#email': stubEl({ tag: 'INPUT', type: 'text', id: 'email', value: 'a@b.c' }),
      '#empty': stubEl({ tag: 'INPUT', type: 'text', id: 'q', value: '' }),
      '#ce': stubEl({ tag: 'DIV', text: 'Rich text', isContentEditable: true }),
      '#novalue': stubEl({ tag: 'DIV' })
    }
  };
  const r = runProbe(page, [
    { kind: 'value', expected: 'a@b.c', selector: '#email' },
    { kind: 'value', expected: 'wrong', selector: '#email' },
    { kind: 'value', expected: '', selector: '#empty' },
    { kind: 'value', expected: 'Rich text', selector: '#ce' },
    { kind: 'value', expected: 'x', selector: '#novalue' }
  ]);
  assert.deepEqual(r.observations[0], { kind: 'value', observable: true, holds: true, observed: 'a@b.c', redact: false });
  assert.deepEqual(r.observations[1], { kind: 'value', observable: true, holds: false, observed: '[redacted]', redact: false });
  assert.deepEqual(r.observations[2], { kind: 'value', observable: true, holds: true, observed: '', redact: false });
  assert.equal(r.observations[3].holds, true, 'contenteditable reads textContent');
  assert.equal(r.observations[4].observable, false);
  assert.equal(r.observations[4].reason, 'value_unreadable');
  assert.equal(r.observations[4].observed, null);
  const unmetOnly = runProbe(page, [{ kind: 'value', expected: 'wrong', selector: '#email' }]);
  assert.ok(!JSON.stringify(unmetOnly).includes('a@b.c'), 'the raw value never leaves the page');
});

check('sensitive fields set redact and observed is the marker even when equal', () => {
  const page = {
    elements: {
      '#pw': stubEl({ tag: 'INPUT', type: 'password', id: 'pw', value: 'hunter2' }),
      '#tok': stubEl({ tag: 'INPUT', type: 'hidden', id: 'tok', value: 'csrf-1' }),
      '#footprint': stubEl({ tag: 'INPUT', type: 'text', id: 'footprint', value: 'size 9' }),
      '#otpCode': stubEl({ tag: 'INPUT', type: 'text', id: 'otpCode', value: '123456' })
    }
  };
  const r = runProbe(page, [
    { kind: 'value', expected: 'hunter2', selector: '#pw' },
    { kind: 'value', expected: 'nope', selector: '#tok' },
    { kind: 'value', expected: 'size 9', selector: '#footprint' },
    { kind: 'value', expected: '123456', selector: '#otpCode' }
  ]);
  assert.deepEqual(r.observations[0], { kind: 'value', observable: true, holds: true, observed: '[redacted]', redact: true });
  assert.deepEqual(r.observations[1], { kind: 'value', observable: true, holds: false, observed: '[redacted]', redact: true });
  assert.equal(r.observations[2].redact, false, 'footprint is not sensitive');
  assert.equal(r.observations[2].observed, 'size 9');
  assert.equal(r.observations[3].redact, true, 'otpCode is sensitive');
  assert.equal(r.observations[3].observed, '[redacted]');
  const s = JSON.stringify(r);
  for (const secret of ['hunter2', 'csrf-1', '123456']) assert.ok(!s.includes(secret), secret);
});

check('dialog_open: dialog[open], visible role=dialog/alertdialog or aria-modal', () => {
  const openDialog = stubEl({ tag: 'DIALOG', open: true, attrs: { open: '' } });
  const visibleRole = stubEl({ attrs: { role: 'alertdialog' } });
  const hiddenRole = stubEl({ attrs: { role: 'dialog' }, rects: [] });
  const modal = stubEl({ attrs: { 'aria-modal': 'true' } });
  const closedDialog = stubEl({ tag: 'DIALOG', open: false });
  const exp = [{ kind: 'dialog_open', expected: true }, { kind: 'dialog_open', expected: false }];
  for (const dialogs of [[openDialog], [visibleRole], [modal]]) {
    const r = runProbe({ dialogs }, exp);
    assert.equal(r.observations[0].holds, true);
    assert.equal(r.observations[0].observed, true);
    assert.equal(r.observations[1].holds, false);
  }
  const none = runProbe({ dialogs: [hiddenRole, closedDialog] }, exp);
  assert.equal(none.observations[0].holds, false);
  assert.equal(none.observations[1].holds, true);
  assert.equal(none.observations[1].observed, false);
});

check('any thrown error returns { ok: false, error }', () => {
  const r = runProbe({ bodyThrows: true }, [{ kind: 'text_visible', expected: 'x' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /body exploded/);
});

// =============================================================================
// Task 2 -- the bounded evaluation loop (fake clock)
// =============================================================================

console.log('\n--- evaluateExpectation (fake clock) ---');

const TAB = { url: 'https://e.test/app', title: 'App', status: 'complete' };

function makeDeps(o) {
  const opts = o || {};
  let t = 5000;
  const calls = { tabs: 0, probe: 0, probeArgs: [], probeFuncs: [] };
  const deps = {
    tabsGet: async () => {
      calls.tabs++;
      return typeof opts.tab === 'function' ? opts.tab(calls.tabs, t) : (opts.tab === undefined ? TAB : opts.tab);
    },
    executeProbe: async (tabId, func, args) => {
      calls.probe++;
      calls.probeFuncs.push(func);
      calls.probeArgs.push(args);
      return opts.probe(calls.probe, args[0], t);
    },
    now: () => t,
    sleep: async (ms) => { t += ms; }
  };
  return { deps, calls };
}

function probeOk(observations, documentId) {
  return { ok: true, documentId: documentId || 'doc-1', result: { ok: true, textTruncated: false, observations } };
}

const met = (kind, extra) => Object.assign({ kind, observable: true, holds: true, observed: null, redact: false }, extra || {});
const miss = (kind, extra) => Object.assign({ kind, observable: true, holds: false, observed: null, redact: false }, extra || {});

function spec(raw) {
  const n = av.normalizeExpectSpec(raw);
  assert.equal(n.ok, true, `spec ${JSON.stringify(raw)} ok: ${n.detail}`);
  return n.spec;
}

function assertShape(result) {
  const keys = Object.keys(result);
  const want = result.status === 'uncertain'
    ? ['status', 'checks', 'waited_ms', 'timeout_ms', 'reason']
    : ['status', 'checks', 'waited_ms', 'timeout_ms'];
  assert.deepEqual(keys, want, 'result keys');
  for (const c of result.checks) assert.deepEqual(Object.keys(c), ['kind', 'expected', 'observed', 'status'], 'check keys');
  assert.ok(Number.isInteger(result.waited_ms), 'waited_ms integer');
  assert.ok(Number.isInteger(result.timeout_ms), 'timeout_ms integer');
}

checkAsync('all checks met on the first probe -> verified, waited_ms 0, one probe', async () => {
  const { deps, calls } = makeDeps({
    probe: () => probeOk([met('text_visible', { observed: 'present' }), met('state', { observed: 'visible' })])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'Saved', selector: '#a' }), deps });
  assertShape(r);
  assert.equal(r.status, 'verified');
  assert.equal(r.waited_ms, 0);
  assert.equal(r.timeout_ms, 2000);
  assert.equal(calls.probe, 1);
  assert.deepEqual(r.checks, [
    { kind: 'text_visible', expected: 'Saved', observed: 'present', status: 'met' },
    { kind: 'state', expected: 'visible', observed: 'visible', status: 'met' }
  ]);
});

checkAsync('executeProbe receives the real probe and a serialisable probeSpec of DOM checks only', async () => {
  const { deps, calls } = makeDeps({ probe: () => probeOk([met('text_visible')]) });
  await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: '/app', text_visible: 'x' }), deps });
  assert.equal(calls.probeFuncs[0], av._fsbExpectProbeInPage);
  const ps = calls.probeArgs[0][0];
  assert.deepEqual(JSON.parse(JSON.stringify(ps)), ps);
  assert.deepEqual(ps.checks, [{ kind: 'text_visible', expected: 'x' }]);
  assert.equal(ps.redacted, '[redacted]');
  assert.equal(ps.sensitiveNameSource, av.EXPECT_SENSITIVE_NAME_SOURCE);
  assert.equal(ps.textScanMax, av.EXPECT_TEXT_SCAN_MAX_CHARS);
  assert.equal(ps.shadowHostBudget, av.EXPECT_SHADOW_HOST_BUDGET);
});

checkAsync('text appearing on the 4th probe -> verified with waited_ms 600', async () => {
  const { deps, calls } = makeDeps({
    probe: (n) => probeOk([n >= 4 ? met('text_visible') : miss('text_visible')])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'Saved' }), deps });
  assert.equal(r.status, 'verified');
  assert.equal(r.waited_ms, 600);
  assert.equal(calls.probe, 4);
});

checkAsync('never met by the 2000 ms deadline -> unmet, bounded probe count', async () => {
  const { deps, calls } = makeDeps({ probe: () => probeOk([miss('text_visible')]) });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'Saved' }), deps });
  assertShape(r);
  assert.equal(r.status, 'unmet');
  assert.ok(r.waited_ms >= 2000, `waited ${r.waited_ms}`);
  assert.ok(calls.probe <= Math.ceil(2000 / 200) + 1, `probes ${calls.probe}`);
  assert.deepEqual(r.checks, [{ kind: 'text_visible', expected: 'Saved', observed: 'absent', status: 'unmet' }]);
});

checkAsync('negative predicates need two consecutive holding probes before an early exit', async () => {
  const { deps, calls } = makeDeps({ probe: () => probeOk([met('text_gone')]) });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Loading' }), deps });
  assert.equal(r.status, 'verified');
  assert.equal(calls.probe, 2);
  assert.equal(r.waited_ms, 200);
  assert.equal(r.checks[0].observed, 'absent');

  const flaky = makeDeps({ probe: (n) => probeOk([n === 2 ? miss('text_gone') : met('text_gone')]) });
  const r2 = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Loading' }), deps: flaky.deps });
  assert.equal(r2.status, 'verified');
  assert.equal(flaky.calls.probe, 4, 'the streak restarts after a non-holding probe');

  for (const raw of [{ selector: '#s', state: 'gone' }, { selector: '#s', state: 'unchecked' }, { dialog_open: false }]) {
    const kind = raw.dialog_open === false ? 'dialog_open' : 'state';
    const d = makeDeps({ probe: () => probeOk([met(kind)]) });
    const rr = await av.evaluateExpectation({ tabId: 7, spec: spec(raw), deps: d.deps });
    assert.equal(rr.status, 'verified');
    assert.equal(d.calls.probe, 2, `two probes for ${JSON.stringify(raw)}`);
  }

  const zero = makeDeps({ probe: () => probeOk([met('text_gone')]) });
  const r3 = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Loading', timeout_ms: 0 }), deps: zero.deps });
  assert.equal(r3.status, 'verified', 'timeout_ms 0 accepts one holding probe');
  assert.equal(zero.calls.probe, 1);
  assert.equal(r3.waited_ms, 0);
  assert.equal(r3.timeout_ms, 0);
});

checkAsync('a probe timeout makes DOM checks probe_timeout and no further DOM probe is issued', async () => {
  const { deps, calls } = makeDeps({
    tab: (n) => Object.assign({}, TAB, { url: n >= 3 ? 'https://e.test/done' : 'https://e.test/start' }),
    probe: () => ({ ok: false, reason: 'timeout' })
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: '/done', text_visible: 'x' }), deps });
  assertShape(r);
  assert.equal(calls.probe, 1, 'one probe only');
  assert.ok(calls.tabs >= 3, 'url keeps being evaluated');
  assert.equal(r.checks[0].status, 'met');
  assert.equal(r.checks[1].status, 'uncertain');
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'probe_timeout');
});

checkAsync('cross-origin DOM checks are uncertain probe_failed while url_includes stays observable', async () => {
  const { deps } = makeDeps({
    tab: { url: 'https://other.test/landing', title: 'Other', status: 'complete' },
    probe: () => ({ ok: false, reason: 'Cannot access contents of url "https://other.test/". Extension manifest must request permission to access this host.' })
  });
  const r = await av.evaluateExpectation({
    tabId: 7, spec: spec({ url_includes: 'other.test', text_visible: 'Welcome', selector: '#a', timeout_ms: 400 }), deps
  });
  assertShape(r);
  assert.deepEqual(r.checks.map((c) => c.status), ['met', 'uncertain', 'uncertain']);
  assert.equal(r.checks[0].observed, 'https://other.test/landing');
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'probe_failed');
});

checkAsync('a closed tab makes every check uncertain tab_closed', async () => {
  const { deps, calls } = makeDeps({ tab: null, probe: () => probeOk([met('text_visible')]) });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: '/a', text_visible: 'x' }), deps });
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'tab_closed');
  assert.ok(r.checks.every((c) => c.status === 'uncertain' && c.observed === null));
  assert.equal(calls.probe, 0);
});

checkAsync('restricted pages skip the probe: DOM checks uncertain restricted_page', async () => {
  const restricted = [
    'chrome://settings/', 'chrome-extension://abc/page.html', 'edge://flags', 'devtools://devtools/bundled/x.html',
    'view-source:https://e.test/', 'about:version', 'https://chromewebstore.google.com/detail/x'
  ];
  for (const url of restricted) {
    const { deps, calls } = makeDeps({ tab: { url, title: 'R', status: 'complete' }, probe: () => probeOk([met('text_visible')]) });
    const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x', timeout_ms: 0 }), deps });
    assert.equal(calls.probe, 0, `no probe on ${url}`);
    assert.equal(r.status, 'uncertain');
    assert.equal(r.reason, 'restricted_page', url);
  }
  const blank = makeDeps({ tab: { url: 'about:blank', title: '', status: 'complete' }, probe: () => probeOk([met('text_visible')]) });
  const rb = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x', timeout_ms: 0 }), deps: blank.deps });
  assert.equal(blank.calls.probe, 1, 'about:blank is probed');
  assert.equal(rb.status, 'verified');
});

checkAsync('commit.required with no commit by the deadline -> every check uncertain no_commit', async () => {
  const { deps, calls } = makeDeps({ probe: () => probeOk([met('text_visible')]) });
  const commit = { required: true, isCommitted: () => false, documentId: () => null };
  const r = await av.evaluateExpectation({
    tabId: 7, spec: spec({ url_includes: '/app', text_visible: 'x', timeout_ms: 400 }), deps, commit
  });
  assert.equal(calls.probe, 0);
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'no_commit');
  assert.ok(r.checks.every((c) => c.status === 'uncertain'));
  assert.ok(r.waited_ms >= 400);
});

checkAsync('probes from a document other than the committed one are ignored (stale_document)', async () => {
  let committed = false;
  const { deps, calls } = makeDeps({
    probe: (n) => {
      if (n >= 2) committed = true;
      return probeOk([met('text_visible')], n >= 3 ? 'doc-new' : 'doc-old');
    }
  });
  const commit = { required: true, isCommitted: () => true, documentId: () => 'doc-new' };
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x' }), deps, commit });
  assert.equal(r.status, 'verified');
  assert.equal(calls.probe, 3);
  assert.ok(committed);

  const stale = makeDeps({ probe: () => probeOk([met('text_visible')], 'doc-old') });
  const r2 = await av.evaluateExpectation({
    tabId: 7, spec: spec({ text_visible: 'x', timeout_ms: 400 }), deps: stale.deps, commit
  });
  assert.equal(r2.status, 'uncertain');
  assert.equal(r2.reason, 'stale_document');

  const late = makeDeps({ probe: () => probeOk([met('text_visible')], 'doc-new') });
  let polls = 0;
  const lateCommit = { required: true, isCommitted: () => (++polls >= 3), documentId: () => 'doc-new' };
  const r3 = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x' }), deps: late.deps, commit: lateCommit });
  assert.equal(r3.status, 'verified');
  assert.equal(late.calls.probe, 1, 'no probe before the commit');
  assert.equal(r3.waited_ms, 400);
});

checkAsync('a still-loading tab with a pendingUrl turns would-be unmet checks into still_loading', async () => {
  const { deps } = makeDeps({
    tab: { url: 'https://e.test/a', title: 'A', status: 'loading', pendingUrl: 'https://e.test/b' },
    probe: () => probeOk([miss('text_visible')])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'B page', timeout_ms: 400 }), deps });
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'still_loading');
  assert.equal(r.checks[0].status, 'uncertain');
});

// CR-01 (69-REVIEW): an empty, still-parsing document satisfies every negative
// predicate; such probes must not settle a negative check as met.
function probeRs(observations, readyState) {
  return { ok: true, documentId: 'doc-1', result: { ok: true, textTruncated: false, observations, readyState } };
}

checkAsync('negative checks do not settle on a loading document whose body is still empty', async () => {
  // The review repro: tab loading, body '' for two probes, then 'Error banner'.
  const loadingTab = { url: 'https://e.test/b', title: '', status: 'loading' };
  for (const raw of [{ text_gone: 'Error' }, { selector: '#err', state: 'gone' }]) {
    const kind = raw.text_gone ? 'text_gone' : 'state';
    const d = makeDeps({
      tab: (n) => (n <= 2 ? loadingTab : Object.assign({}, loadingTab, { status: 'complete' })),
      probe: (n) => probeOk([n <= 2 ? met(kind, { observed: 'absent' }) : miss(kind, { observed: kind === 'state' ? 'visible' : 'present' })])
    });
    const r = await av.evaluateExpectation({ tabId: 7, spec: spec(raw), deps: d.deps });
    assertShape(r);
    assert.notEqual(r.status, 'verified', `${JSON.stringify(raw)} must not verify on an empty loading document`);
    assert.equal(r.status, 'unmet', JSON.stringify(raw));
    assert.ok(d.calls.probe >= 3, 'the loop kept probing past the loading probes');
  }
});

checkAsync('readyState loading gates negative checks; two settled probes after it verify', async () => {
  const { deps, calls } = makeDeps({
    tab: { url: 'https://e.test/b', title: 'B', status: 'loading' },
    probe: (n) => probeRs([met('text_gone')], n <= 2 ? 'loading' : 'interactive')
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Error' }), deps });
  assert.equal(r.status, 'verified');
  assert.equal(calls.probe, 4, 'two loading probes, then two settled ones');
  assert.equal(r.waited_ms, 600);
});

checkAsync('a negative check that holds only while loading ends uncertain still_loading', async () => {
  const always = makeDeps({
    tab: { url: 'https://e.test/b', title: 'B', status: 'loading' },
    probe: () => probeRs([met('text_gone'), met('dialog_open')], 'loading')
  });
  const r = await av.evaluateExpectation({
    tabId: 7, spec: spec({ text_gone: 'Error', dialog_open: false, timeout_ms: 400 }), deps: always.deps
  });
  assertShape(r);
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'still_loading');
  assert.deepEqual(r.checks.map((c) => c.status), ['uncertain', 'uncertain']);
  assert.ok(r.checks.every((c) => c.observed === null));

  const zero = makeDeps({ tab: { url: 'https://e.test/b', title: 'B', status: 'loading' }, probe: () => probeOk([met('text_gone')]) });
  const rz = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Error', timeout_ms: 0 }), deps: zero.deps });
  assert.equal(rz.status, 'uncertain', 'timeout_ms 0: one loading probe cannot verify a negative check');
  assert.equal(rz.reason, 'still_loading');
});

checkAsync('a pending navigation makes the outgoing document unsettled even when it is complete', async () => {
  const { deps } = makeDeps({
    tab: { url: 'https://e.test/a', title: 'A', status: 'loading', pendingUrl: 'https://e.test/b' },
    probe: () => probeRs([met('text_gone')], 'complete')
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Error', timeout_ms: 400 }), deps });
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'still_loading');
});

checkAsync('a parsed document on a tab still fetching subresources settles negative checks normally', async () => {
  const { deps, calls } = makeDeps({
    tab: { url: 'https://e.test/b', title: 'B', status: 'loading' },
    probe: () => probeRs([met('text_gone')], 'interactive')
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_gone: 'Error' }), deps });
  assert.equal(r.status, 'verified');
  assert.equal(calls.probe, 2);
  // Positive checks are not gated: one holding probe still verifies.
  const pos = makeDeps({ tab: { url: 'https://e.test/b', title: 'B', status: 'loading' }, probe: () => probeRs([met('text_visible')], 'loading') });
  const rp = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'Saved' }), deps: pos.deps });
  assert.equal(rp.status, 'verified');
  assert.equal(pos.calls.probe, 1);
});

checkAsync('pageUnresponsive skips the probe; tab-level checks are still judged', async () => {
  const { deps, calls } = makeDeps({ probe: () => probeOk([met('text_visible')]) });
  const r = await av.evaluateExpectation({
    tabId: 7, spec: spec({ url_includes: '/app', text_visible: 'x' }), deps, pageUnresponsive: true
  });
  assert.equal(calls.probe, 0);
  assert.equal(r.checks[0].status, 'met');
  assert.equal(r.checks[1].status, 'uncertain');
  assert.equal(r.reason, 'page_unresponsive');
});

checkAsync('url_includes is a case-sensitive substring; title_includes is normalized', async () => {
  const { deps } = makeDeps({
    tab: { url: 'https://e.test/Inbox?x=1', title: '  My   INBOX  ', status: 'complete' },
    probe: () => probeOk([])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: '/inbox', title_includes: 'my inbox', timeout_ms: 0 }), deps });
  assert.equal(r.checks[0].status, 'unmet');
  assert.equal(r.checks[1].status, 'met');
  assert.equal(r.status, 'unmet');
  const ok = makeDeps({ tab: { url: 'https://e.test/Inbox', title: 'x', status: 'complete' }, probe: () => probeOk([]) });
  const r2 = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: '/Inbox' }), deps: ok.deps });
  assert.equal(r2.status, 'verified');
});

checkAsync('url_includes matches the full URL but echoes it without userinfo, query or fragment (CR-02)', async () => {
  const { deps } = makeDeps({
    tab: { url: 'https://alice:pw@app.test/cb?code=SECRETCODE123&state=s#access_token=FRAG', title: 't', status: 'complete' },
    probe: () => probeOk([])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: 'code=', timeout_ms: 0 }), deps });
  assert.equal(r.status, 'verified', 'matching still sees the query');
  assert.equal(r.checks[0].observed, 'https://app.test/cb');
  for (const secret of ['SECRETCODE123', 'FRAG', 'alice', 'pw@']) {
    assert.ok(!JSON.stringify(r).includes(secret), `${secret} is not echoed`);
  }
  const bad = makeDeps({ tab: { url: 'not a url', title: 't', status: 'complete' }, probe: () => probeOk([]) });
  const rb = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: 'url', timeout_ms: 0 }), deps: bad.deps });
  assert.equal(rb.checks[0].status, 'met');
  assert.equal(rb.checks[0].observed, null, 'an unparseable URL is not echoed');
});

checkAsync('a redacted value check reports both expected and observed as [redacted]', async () => {
  const { deps } = makeDeps({ probe: () => probeOk([met('value', { observed: '[redacted]', redact: true })]) });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ selector: '#pw', value: 'hunter2' }), deps });
  assert.equal(r.status, 'verified');
  assert.deepEqual(r.checks[0], { kind: 'value', expected: '[redacted]', observed: '[redacted]', status: 'met' });
  assert.ok(!JSON.stringify(r).includes('hunter2'));
});

checkAsync('D-19 value rule holds against a regressed probe that leaks a raw page value', async () => {
  const { deps } = makeDeps({
    probe: () => probeOk([{ kind: 'value', observable: true, holds: false, observed: 'secret-token-123', redact: false }])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ selector: '#token', value: 'x', timeout_ms: 0 }), deps });
  assert.equal(r.status, 'unmet');
  assert.deepEqual(r.checks[0], { kind: 'value', expected: 'x', observed: '[redacted]', status: 'unmet' });
  assert.ok(!JSON.stringify(r).includes('secret-token-123'));

  const metLeak = makeDeps({
    probe: () => probeOk([{ kind: 'value', observable: true, holds: true, observed: 'page-read-value', redact: false }])
  });
  const r2 = await av.evaluateExpectation({ tabId: 7, spec: spec({ selector: '#q', value: 'typed' }), deps: metLeak.deps });
  assert.equal(r2.checks[0].observed, 'typed', 'met observed is the caller expected, not a page read');
  assert.ok(!JSON.stringify(r2).includes('page-read-value'));
});

checkAsync('met value on a plain field echoes expected; unobservable is null; value "" verifies', async () => {
  const a = makeDeps({ probe: () => probeOk([met('value', { observed: 'a@b.c' })]) });
  const ra = await av.evaluateExpectation({ tabId: 7, spec: spec({ selector: '#email', value: 'a@b.c' }), deps: a.deps });
  assert.deepEqual(ra.checks[0], { kind: 'value', expected: 'a@b.c', observed: 'a@b.c', status: 'met' });

  const b = makeDeps({
    probe: () => probeOk([{ kind: 'value', observable: false, holds: false, observed: null, redact: null, reason: 'invalid_selector' }])
  });
  const rb = await av.evaluateExpectation({ tabId: 7, spec: spec({ selector: '#q', value: 'v', timeout_ms: 0 }), deps: b.deps });
  assert.equal(rb.checks[0].observed, null);
  assert.equal(rb.checks[0].status, 'uncertain');
  assert.equal(rb.checks[0].expected, '[redacted]', 'nothing proved the field is not a secret');
  assert.equal(rb.reason, 'invalid_selector');

  const c = makeDeps({ probe: () => probeOk([met('value', { observed: '' })]) });
  const rc = await av.evaluateExpectation({ tabId: 7, spec: spec({ selector: '#q', value: '' }), deps: c.deps });
  assert.equal(rc.status, 'verified');
  assert.deepEqual(rc.checks[0], { kind: 'value', expected: '', observed: '', status: 'met' });
});

checkAsync('the probe and loop together: a real stub DOM end to end', async () => {
  const page = {
    bodyText: 'Saved',
    elements: { '#email': stubEl({ tag: 'INPUT', type: 'text', id: 'email', value: 'a@b.c' }) }
  };
  const { win, doc } = stubPage(page);
  const priorWindow = global.window;
  const priorDocument = global.document;
  let t = 0;
  const deps = {
    tabsGet: async () => TAB,
    executeProbe: async (tabId, func, args) => {
      global.window = win; global.document = doc;
      try { return { ok: true, documentId: 'd', result: func(...args) }; }
      finally { global.window = priorWindow; global.document = priorDocument; }
    },
    now: () => t,
    sleep: async (ms) => { t += ms; }
  };
  const r = await av.evaluateExpectation({
    tabId: 7, spec: spec({ text_visible: 'saved', selector: '#email', value: 'wrong', timeout_ms: 0 }), deps
  });
  assert.equal(r.status, 'unmet');
  assert.deepEqual(r.checks[1], { kind: 'value', expected: 'wrong', observed: '[redacted]', status: 'unmet' });
  assert.ok(!JSON.stringify(r).includes('a@b.c'));
});

checkAsync('observed strings are capped at 120 characters', async () => {
  const longUrl = 'https://e.test/' + 'p'.repeat(300);
  const { deps } = makeDeps({ tab: { url: longUrl, title: 't', status: 'complete' }, probe: () => probeOk([]) });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: 'ppp', timeout_ms: 0 }), deps });
  assert.equal(r.checks[0].observed.length, 120);
  assert.ok(r.checks[0].observed.endsWith('...'));
});

checkAsync('exceptions inside deps become uncertain evaluator_failed; the loop never throws', async () => {
  const { deps } = makeDeps({ probe: () => { throw new Error('boom'); } });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x' }), deps });
  assertShape(r);
  assert.equal(r.status, 'uncertain');
  assert.equal(r.reason, 'evaluator_failed');
  const tabsThrow = makeDeps({ probe: () => probeOk([]) });
  tabsThrow.deps.tabsGet = async () => { throw new Error('tabs gone'); };
  const r2 = await av.evaluateExpectation({ tabId: 7, spec: spec({ url_includes: 'x' }), deps: tabsThrow.deps });
  assert.equal(r2.reason, 'evaluator_failed');
});

checkAsync('missing deps, a missing tab id and a raw invalid spec are uncertain, never thrown', async () => {
  const r1 = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x' }), deps: {} });
  assert.equal(r1.reason, 'evaluator_unavailable');
  const { deps } = makeDeps({ probe: () => probeOk([met('text_visible')]) });
  const r2 = await av.evaluateExpectation({ tabId: null, spec: spec({ text_visible: 'x' }), deps });
  assert.equal(r2.reason, 'no_tab');
  const r3 = await av.evaluateExpectation({ tabId: 7, spec: { bogus: 1 }, deps });
  assert.equal(r3.reason, 'invalid_expect');
  const r4 = await av.evaluateExpectation({ tabId: 7, spec: { text_visible: 'x', timeout_ms: 0 }, deps });
  assert.equal(r4.status, 'verified', 'a raw valid spec is normalized first');
  const r5 = await av.evaluateExpectation();
  assert.equal(r5.status, 'uncertain');
  for (const r of [r1, r2, r3, r5]) assertShape(r);
});

checkAsync('an unmet check outranks uncertain ones; reason is only present when uncertain', async () => {
  const { deps } = makeDeps({
    probe: () => probeOk([miss('text_visible'), { kind: 'state', observable: false, holds: false, observed: null, redact: false, reason: 'ref_unavailable' }])
  });
  const r = await av.evaluateExpectation({ tabId: 7, spec: spec({ text_visible: 'x', selector: 'e3', timeout_ms: 0 }), deps });
  assertShape(r);
  assert.equal(r.status, 'unmet');
  assert.equal('reason' in r, false);
  assert.deepEqual(r.checks.map((c) => c.status), ['unmet', 'uncertain']);
});

// =============================================================================
// Runner
// =============================================================================

(async () => {
  for (const run of pending) await run();
  global.window = STUB_WINDOW;
  global.document = STUB_DOCUMENT;
  console.log(`\n[expect-evaluator] ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
