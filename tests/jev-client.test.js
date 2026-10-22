/**
 * Phase 67 / JEV-01, JEV-02, JEV-06, JEV-07 -- FsbJevClient, the extension's
 * never-rejecting Jev decision client (extension/ai/jev-client.js).
 *
 * Every test injects fetchImpl through createJevClient, so no test makes a
 * live network call. The few cases that exercise the lazy globalThis.fetch
 * lookup swap in a fake and restore the original afterwards.
 *
 * Run: node tests/jev-client.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const CLIENT_PATH = path.join(ROOT, 'extension', 'ai', 'jev-client.js');
const S = require('../extension/ai/jev-state.js');

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label}${detail === undefined ? '' : ` -- ${detail}`}`); }
}
function deepEqual(a, b) {
  try { assert.deepStrictEqual(a, b); return true; } catch (_e) { return false; }
}
function show(value) {
  let text;
  try { text = JSON.stringify(value); } catch (_e) { text = String(value); }
  return text && text.length > 400 ? `${text.slice(0, 400)}...` : text;
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const ENDPOINT = 'https://full-selfbrowsing.com/api/jev/decide';
const TEST_ENDPOINT = 'http://127.0.0.1:9/api/jev/decide';
const HASH_KEY = '0123456789abcdef'.repeat(4);
const CARD_GOAL = 'Pay with 4111 1111 1111 1111 today';
const KEY_GOAL = 'Use the key sk-ant-abcdefghijklmnop1234 to sign in';

let C = null;

// ---------------------------------------------------------------------------
// Fixtures (built with FsbJevState-valid fields)
// ---------------------------------------------------------------------------

function validRequest() {
  return {
    v: 1,
    kinds: ['operation', 'target', 'risk'],
    goal: 'Save the checklist',
    page: { origin: 'https://example.test', path: '/checklist', title: 'Checklist', text: 'Alpha' },
    elements: [
      { id: 'e0', role: 'checkbox', label: 'Alpha', ops: ['check_box', 'click'] },
      { id: 'e1', role: 'button', label: 'Save', ops: ['click'] },
    ],
    recentActions: [],
    offeredOps: ['click', 'check_box', 'scroll'],
    proposedAction: { op: 'click', targetId: 'e1' },
  };
}

function allKindsRequest() {
  const request = validRequest();
  request.kinds = S.CONTRACT.KINDS.slice();
  return request;
}

function okBody() {
  return {
    ok: true,
    decisionId: 'jd_0123456789abcdef',
    instrumentVersion: 'fsb-jev-1',
    servedModel: 'typesafe/jev-1.13',
    calibration: { status: 'uncalibrated', profileId: 'uncalibrated' },
    decisions: {
      operation: {
        choice: 'click', confidence: 0.8,
        probabilities: { click: 0.8, check_box: 0.05, scroll: 0.05, none_of_the_above: 0.1 },
        threshold: null, meetsThreshold: false,
      },
      target: {
        choice: 'e1', confidence: 0.7,
        probabilities: { e0: 0.2, e1: 0.7, none_of_the_above: 0.1 },
        threshold: null, meetsThreshold: false,
      },
      risk: { p: 0.1, threshold: null, meetsThreshold: false },
    },
    usage: { inputTokens: 1234, source: 'provider' },
    cost: { usd: 0.00031, source: 'provider' },
    latencyMs: 412,
  };
}

function calibratedBody() {
  const body = okBody();
  body.calibration = { status: 'calibrated', profileId: 'p-2026-10' };
  body.decisions.operation.threshold = 0.6;
  body.decisions.operation.meetsThreshold = true;
  body.decisions.target.threshold = 0.9;
  body.decisions.risk.threshold = 0.5;
  return body;
}

function allKindsBody() {
  const body = okBody();
  body.decisions.completion = { p: 0.4, threshold: null, meetsThreshold: false };
  body.decisions.stuck = { p: 0, threshold: null, meetsThreshold: false };
  return body;
}

function fallbackBody(reason, status, servedModel) {
  return { ok: false, fallback: reason, servedModel: servedModel === undefined ? null : servedModel, httpStatus: status, latencyMs: 2 };
}

/** A schema-valid request whose JSON is over the 49,152-byte inbound cap. */
function oversizeRequest() {
  const label = '注'.repeat(S.CONTRACT.CAPS.labelChars);
  const elements = [];
  for (let i = 0; i < S.CONTRACT.CAPS.elements; i += 1) {
    elements.push({ id: `e${i}`, role: 'button', label, ops: ['click'] });
  }
  return {
    v: 1,
    kinds: ['operation', 'target'],
    goal: 'Pick the right button',
    page: { origin: 'https://example.test', path: '/', title: 'Buttons', text: '注'.repeat(S.CONTRACT.CAPS.textChars) },
    elements,
    recentActions: [],
    offeredOps: ['click'],
  };
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function response(status, text) {
  return { status, text: async () => text };
}
function jsonResponse(status, body) {
  return response(status, JSON.stringify(body));
}

/** A fake fetch that records every call and answers through handler(url, init, n). */
function makeFetch(handler) {
  const calls = [];
  const fetchImpl = function fakeFetch(url, init) {
    calls.push({ url, init, argc: arguments.length });
    return handler(url, init, calls.length);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function manualClock(start) {
  const clock = { t: start === undefined ? 1700000000000 : start };
  clock.now = () => clock.t;
  return clock;
}

/** One decide() on a fresh client; the fake advances the clock by `latency` ms. */
async function runOnce(answer, options) {
  const opts = options || {};
  const clock = manualClock();
  const latency = opts.latency === undefined ? 37 : opts.latency;
  const fetchImpl = makeFetch(async () => {
    clock.t += latency;
    return typeof answer === 'function' ? answer() : answer;
  });
  const client = C.createJevClient(Object.assign({ fetchImpl, endpoint: TEST_ENDPOINT, now: clock.now }, opts.client || {}));
  const request = Object.prototype.hasOwnProperty.call(opts, 'request') ? opts.request : validRequest();
  const result = await client.decide(request, opts.call);
  return { result, fetchImpl, clock, client };
}

function fallbackOf(reason, httpStatus, latencyMs, servedModel) {
  return { ok: false, fallback: reason, servedModel: servedModel === undefined ? null : servedModel, httpStatus, latencyMs };
}

function isExactFallback(result) {
  return result !== null && typeof result === 'object'
    && deepEqual(Object.keys(result), S.CONTRACT.KEYS.fallbackResponse)
    && result.ok === false
    && S.CONTRACT.FALLBACK_REASONS.includes(result.fallback)
    && (result.servedModel === null || (typeof result.servedModel === 'string' && result.servedModel.length > 0))
    && (result.httpStatus === null || (Number.isInteger(result.httpStatus) && result.httpStatus >= 100 && result.httpStatus <= 599))
    && typeof result.latencyMs === 'number' && Number.isFinite(result.latencyMs) && result.latencyMs >= 0;
}

/** The result is one of the two exact D-15 shapes (an ok result re-validates against its request). */
function isExactResult(result, request) {
  if (result !== null && typeof result === 'object' && result.ok === true) {
    if (!deepEqual(Object.keys(result), S.CONTRACT.KEYS.okResponse)) return false;
    const recheck = S.validateGatewayResponse(clone(result), request);
    return recheck.ok === true;
  }
  return isExactFallback(result);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function loadSection() {
  console.log('\n--- module load and API (D-15, D-17) ---');
  try {
    C = require(CLIENT_PATH);
  } catch (error) {
    check('extension/ai/jev-client.js loads under Node', false, error && error.message);
    return false;
  }
  check('module.exports has exactly the documented API',
    deepEqual(Object.keys(C).sort(), ['COOLDOWN_MS', 'DEFAULT_TIMEOUT_MS', 'ENDPOINT', 'MAX_SPEND_COOLDOWN_MS', 'createJevClient', 'decide']),
    show(Object.keys(C)));
  check('ENDPOINT is the fixed FSB gateway URL', C.ENDPOINT === ENDPOINT, C.ENDPOINT);
  check('DEFAULT_TIMEOUT_MS is 2500', C.DEFAULT_TIMEOUT_MS === 2500);
  check('COOLDOWN_MS is 60000', C.COOLDOWN_MS === 60000);
  check('MAX_SPEND_COOLDOWN_MS is 3600000', C.MAX_SPEND_COOLDOWN_MS === 3600000);
  check('createJevClient and decide are functions', typeof C.createJevClient === 'function' && typeof C.decide === 'function');
  check('globalThis.FsbJevClient is the same api object', globalThis.FsbJevClient === C);
  const client = C.createJevClient({ fetchImpl: () => { throw new Error('must not be called'); } });
  check('createJevClient() returns a decide function', client && typeof client.decide === 'function');
  return true;
}

function staticSection() {
  console.log('\n--- static source rules (D-01, D-09, D-17) ---');
  const source = fs.readFileSync(CLIENT_PATH, 'utf8');
  check('the endpoint literal appears exactly once', source.split(ENDPOINT).length - 1 === 1);
  check('no other https:// URL appears', (source.match(/https:\/\//g) || []).length === 1);
  const forbidden = /systemone|api\.typesafe\.ai|chrome\.storage|serverUrl|keepalive|AbortSignal\.any|importScripts|JEV_/;
  check('no forbidden token (upstream, storage, Sync serverUrl, keepalive, AbortSignal.any, importScripts, JEV_)',
    !forbidden.test(source), (source.match(forbidden) || [])[0]);
  check("credentials: 'omit' is in the source", /credentials: ?'omit'/.test(source));
  check('no top-level const, let or class', !/^(const|let|class) /m.test(source));
  check('no console use (the client never logs)', !/console\./.test(source));
  check('wrapped in the initFsbJevClient IIFE',
    /\(function initFsbJevClient\(root\) \{/.test(source)
    && source.includes("})(typeof globalThis !== 'undefined' ? globalThis : self);"));
}

async function okSection() {
  console.log('\n--- ok bodies (D-15) ---');
  const { result, fetchImpl } = await runOnce(jsonResponse(200, okBody()));
  const expected = Object.assign(okBody(), { latencyMs: 37 });
  check('a valid ok body returns the ok shape with the client-measured latency', deepEqual(result, expected), show(result));
  check('ok result keys are exactly KEYS.okResponse in order', deepEqual(Object.keys(result), S.CONTRACT.KEYS.okResponse));
  check('the ok result re-validates against its request', isExactResult(result, validRequest()));
  check('one fetch call was made', fetchImpl.calls.length === 1);

  const calibrated = await runOnce(jsonResponse(200, calibratedBody()), { latency: 5 });
  check('a calibrated body passes through', deepEqual(calibrated.result, Object.assign(calibratedBody(), { latencyMs: 5 })),
    show(calibrated.result));

  const allKinds = await runOnce(jsonResponse(200, allKindsBody()), { request: allKindsRequest(), latency: 0 });
  check('all five kinds pass through when all five were requested',
    deepEqual(allKinds.result, Object.assign(allKindsBody(), { latencyMs: 0 })), show(allKinds.result));

  const unavailable = Object.assign(okBody(), {
    usage: { inputTokens: null, source: 'unavailable' }, cost: { usd: null, source: 'unavailable' },
  });
  const nulls = await runOnce(jsonResponse(200, unavailable), { latency: 1 });
  check('null usage and cost marked unavailable pass through (never 0)',
    deepEqual(nulls.result, Object.assign(clone(unavailable), { latencyMs: 1 })), show(nulls.result));

  const request = validRequest();
  const before = clone(request);
  await runOnce(jsonResponse(200, okBody()), { request });
  check('decide does not mutate the request', deepEqual(request, before));
}

async function fallbackBodySection() {
  console.log('\n--- typed fallback bodies, body first (D-15, D-16) ---');
  const disabled = await runOnce(jsonResponse(503, fallbackBody('disabled', 503)), { latency: 11 });
  check('503 {fallback:disabled} maps to disabled with the received status',
    deepEqual(disabled.result, fallbackOf('disabled', 503, 11)), show(disabled.result));
  check('fallback result keys are exactly KEYS.fallbackResponse in order',
    deepEqual(Object.keys(disabled.result), S.CONTRACT.KEYS.fallbackResponse));

  for (const reason of S.CONTRACT.GATEWAY_FALLBACK_REASONS) {
    const status = S.CONTRACT.HTTP_STATUS_BY_REASON[reason];
    const { result } = await runOnce(jsonResponse(status, fallbackBody(reason, status)), { latency: 3 });
    check(`gateway body ${reason} at ${status} maps to ${reason}`, deepEqual(result, fallbackOf(reason, status, 3)), show(result));
  }

  const served = await runOnce(jsonResponse(502, fallbackBody('auth_error', 502, 'typesafe/jev-1.13-20261001')), { latency: 4 });
  check('a fallback body keeps its servedModel',
    deepEqual(served.result, fallbackOf('auth_error', 502, 4, 'typesafe/jev-1.13-20261001')), show(served.result));

  const bodyFirst = await runOnce(jsonResponse(429, fallbackBody('upstream_error', 502)), { latency: 2 });
  check('the body wins over the status (429 + upstream_error body -> upstream_error)',
    deepEqual(bodyFirst.result, fallbackOf('upstream_error', 429, 2)), show(bodyFirst.result));
  const busyAt200 = await runOnce(jsonResponse(200, fallbackBody('busy', 503)), { latency: 2 });
  check('a typed busy body at 200 maps to busy with httpStatus 200',
    deepEqual(busyAt200.result, fallbackOf('busy', 200, 2)), show(busyAt200.result));
}

async function malformedBodySection() {
  console.log('\n--- unknown, approval-like or inconsistent bodies fall to the status table (D-15, D-29) ---');
  const cases = [
    ['an extra authorize key', 200, () => Object.assign(okBody(), { authorize: true }), 'invalid_response'],
    ['an extra skipConfirmation key', 200, () => Object.assign(okBody(), { skipConfirmation: true }), 'invalid_response'],
    ['an extra approved key', 200, () => Object.assign(okBody(), { approved: true }), 'invalid_response'],
    ['an approved key inside a decision', 200, () => { const b = okBody(); b.decisions.risk.approved = true; return b; }, 'invalid_response'],
    ['a decisions key set larger than request.kinds', 200,
      () => { const b = okBody(); b.decisions.stuck = { p: 0.5, threshold: null, meetsThreshold: false }; return b; }, 'invalid_response'],
    ['a decisions key set smaller than request.kinds', 200, () => { const b = okBody(); delete b.decisions.risk; return b; }, 'invalid_response'],
    ['meetsThreshold true while uncalibrated', 200,
      () => { const b = okBody(); b.decisions.operation.threshold = 0.5; b.decisions.operation.meetsThreshold = true; return b; }, 'invalid_response'],
    ['a probability key the request never offered', 200,
      () => { const b = okBody(); b.decisions.target.probabilities.e9 = 0; return b; }, 'invalid_response'],
    ['ok true with a fallback shape', 200, () => ({ ok: true, fallback: 'busy', servedModel: null, httpStatus: 200, latencyMs: 1 }), 'invalid_response'],
    ['a client-only network_error fallback at 502', 502, () => fallbackBody('network_error', 502), 'server_error'],
    ['a client-only network_error fallback at 200', 200, () => fallbackBody('network_error', 200), 'invalid_response'],
    ['a client-only aborted fallback at 503', 503, () => fallbackBody('aborted', 503), 'server_error'],
    ['an unknown fallback reason at 429', 429, () => fallbackBody('approved', 429), 'rate_limited'],
    ['a fallback body with an extra approved key at 503', 503, () => Object.assign(fallbackBody('busy', 503), { approved: true }), 'server_error'],
    ['a fallback body with an extra skipConfirmation key at 413', 413,
      () => Object.assign(fallbackBody('payload_too_large', 413), { skipConfirmation: true }), 'payload_too_large'],
    ['an ok body with an extra key at 400', 400, () => Object.assign(okBody(), { override: 1 }), 'invalid_request'],
  ];
  for (const [label, status, makeBody, reason] of cases) {
    const { result } = await runOnce(jsonResponse(status, makeBody()), { latency: 6 });
    check(`${label} -> ${reason}`, deepEqual(result, fallbackOf(reason, status, 6)), show(result));
  }
}

async function statusTableSection() {
  console.log('\n--- status-only table, body missing or not JSON (D-16) ---');
  const rows = [
    [502, '<html>bad gateway</html>', 'server_error'],
    [504, '', 'timeout'],
    [413, '', 'payload_too_large'],
    [413, '<html>too large</html>', 'payload_too_large'],
    [429, 'slow down', 'rate_limited'],
    [400, '', 'invalid_request'],
    [404, '<html>not found</html>', 'invalid_request'],
    [451, '{}', 'invalid_request'],
    [200, 'garbage', 'invalid_response'],
    [200, '', 'invalid_response'],
    [204, '', 'invalid_response'],
    [299, 'null', 'invalid_response'],
    [200, '[]', 'invalid_response'],
    [200, '42', 'invalid_response'],
    [200, '"ok"', 'invalid_response'],
    [500, '', 'server_error'],
    [503, '<html>', 'server_error'],
    [599, '[]', 'server_error'],
    [101, '', 'invalid_response'],
    [301, '', 'invalid_response'],
    [399, '{"ok":true}', 'invalid_response'],
  ];
  for (const [status, text, reason] of rows) {
    const { result } = await runOnce(response(status, text), { latency: 8 });
    check(`${status} ${JSON.stringify(text.slice(0, 24))} -> ${reason}`, deepEqual(result, fallbackOf(reason, status, 8)), show(result));
  }
  const padded = JSON.stringify(okBody()) + ' '.repeat(70000);
  const big = await runOnce(response(200, padded), { latency: 1 });
  check('an oversized body (over 64 KiB of text) is not parsed and maps by status',
    deepEqual(big.result, fallbackOf('invalid_response', 200, 1)), show(big.result));
}

async function transportSection() {
  console.log('\n--- transport (D-09, JEV-01, JEV-02) ---');
  const request = validRequest();
  const { result, fetchImpl } = await runOnce(jsonResponse(200, okBody()), { request });
  check('the decision succeeded', result.ok === true, show(result));
  const call = fetchImpl.calls[0] || {};
  const init = call.init || {};
  check('fetch got exactly two arguments', call.argc === 2);
  check('the URL is the injected endpoint', call.url === TEST_ENDPOINT, call.url);
  check('the URL has no query string or fragment', typeof call.url === 'string' && !/[?#]/.test(call.url));
  check('init keys are exactly body, cache, credentials, headers, method, redirect, signal',
    deepEqual(Object.keys(init).sort(), ['body', 'cache', 'credentials', 'headers', 'method', 'redirect', 'signal']), show(Object.keys(init)));
  check("method is 'POST'", init.method === 'POST');
  check("credentials is 'omit'", init.credentials === 'omit');
  check("cache is 'no-store'", init.cache === 'no-store');
  check("redirect is 'error'", init.redirect === 'error');
  check('headers are exactly Content-Type: application/json', deepEqual(init.headers, { 'Content-Type': 'application/json' }), show(init.headers));
  check('the body is JSON.stringify(request)', init.body === JSON.stringify(request));
  check('a signal is passed and is not aborted at send time',
    init.signal instanceof AbortSignal && init.signal.aborted === false);

  // The default endpoint is the fixed constant.
  const plain = makeFetch(async () => jsonResponse(200, okBody()));
  await C.createJevClient({ fetchImpl: plain }).decide(validRequest());
  check('without an endpoint option the client posts to ENDPOINT', plain.calls.length === 1 && plain.calls[0].url === ENDPOINT,
    show(plain.calls.map((c) => c.url)));
  const blank = makeFetch(async () => jsonResponse(200, okBody()));
  await C.createJevClient({ fetchImpl: blank, endpoint: '' }).decide(validRequest());
  check('an empty endpoint option falls back to ENDPOINT', blank.calls.length === 1 && blank.calls[0].url === ENDPOINT);

  // Optional attribution header (D-07, T-67-10).
  const hashCases = [
    ['a 64-char lowercase hex key', () => HASH_KEY, HASH_KEY],
    ['a promise of a valid key', () => Promise.resolve(HASH_KEY), HASH_KEY],
    ['an uppercase hex key', () => HASH_KEY.toUpperCase(), null],
    ['a 63-char key', () => HASH_KEY.slice(1), null],
    ['a 65-char key', () => `${HASH_KEY}0`, null],
    ['a non-hex key', () => 'g'.repeat(64), null],
    ['a number', () => 42, null],
    ['null', () => null, null],
    ['a throwing getter', () => { throw new Error('storage unavailable'); }, null],
    ['a rejecting promise', () => Promise.reject(new Error('storage unavailable')), null],
  ];
  for (const [label, getHashKey, expected] of hashCases) {
    const run = await runOnce(jsonResponse(200, okBody()), { client: { getHashKey } });
    const headers = run.fetchImpl.calls[0] && run.fetchImpl.calls[0].init.headers;
    const want = expected === null
      ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json', 'X-FSB-Hash-Key': expected };
    check(`hash key from ${label}: ${expected === null ? 'header omitted' : 'header sent'} and the decision still runs`,
      deepEqual(headers, want) && run.result.ok === true, show({ headers, result: run.result.ok }));
  }
  const notFn = await runOnce(jsonResponse(200, okBody()), { client: { getHashKey: HASH_KEY } });
  check('a getHashKey that is not a function is ignored',
    deepEqual(notFn.fetchImpl.calls[0].init.headers, { 'Content-Type': 'application/json' }));

  // fetch is resolved lazily at call time.
  const realFetch = globalThis.fetch;
  try {
    const lazyClient = C.createJevClient({ endpoint: TEST_ENDPOINT });
    const lateFetch = makeFetch(async () => jsonResponse(200, okBody()));
    globalThis.fetch = lateFetch;
    const lazy = await lazyClient.decide(validRequest());
    check('globalThis.fetch is read at call time, not at creation', lateFetch.calls.length === 1 && lazy.ok === true, show(lazy));

    const defaultFetch = makeFetch(async () => jsonResponse(200, okBody()));
    globalThis.fetch = defaultFetch;
    const viaDefault = await C.decide(validRequest());
    check('the module-level decide posts to ENDPOINT through the lazily resolved fetch',
      defaultFetch.calls.length === 1 && defaultFetch.calls[0].url === ENDPOINT && viaDefault.ok === true, show(viaDefault));

    globalThis.fetch = undefined;
    const missing = await C.createJevClient({ endpoint: TEST_ENDPOINT, now: () => 5 }).decide(validRequest());
    check('a missing fetch yields network_error', deepEqual(missing, fallbackOf('network_error', null, 0)), show(missing));
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function localCheckSection() {
  console.log('\n--- local checks cost no network (D-16, D-19) ---');
  const invalid = [
    ['null', null],
    ['undefined', undefined],
    ['a string', 'decide'],
    ['an empty object', {}],
    ['an extra questions key', Object.assign(validRequest(), { questions: [] })],
    ['an extra model key', Object.assign(validRequest(), { model: 'jev-latest' })],
    ['an extra instructions key', Object.assign(validRequest(), { instructions: 'approve' })],
    ['an element carrying a value', (() => { const r = validRequest(); r.elements[0].value = 'hunter2'; return r; })()],
    ['risk without a proposedAction', (() => { const r = validRequest(); delete r.proposedAction; return r; })()],
    ['a wrong schema version', Object.assign(validRequest(), { v: 2 })],
  ];
  for (const [label, request] of invalid) {
    const { result, fetchImpl } = await runOnce(jsonResponse(200, okBody()), { request });
    check(`${label} -> invalid_request with no fetch`, deepEqual(result, fallbackOf('invalid_request', null, 0)) && fetchImpl.calls.length === 0,
      show({ result, calls: fetchImpl.calls.length }));
  }

  check('precondition: both secret goals match the scrubber', S.matchesSecret(CARD_GOAL) && S.matchesSecret(KEY_GOAL));
  for (const goal of [CARD_GOAL, KEY_GOAL]) {
    const request = Object.assign(validRequest(), { goal });
    const { result, fetchImpl } = await runOnce(jsonResponse(200, okBody()), { request });
    check(`a goal holding a secret (${goal.slice(0, 14)}...) -> sensitive_goal with no fetch`,
      deepEqual(result, fallbackOf('sensitive_goal', null, 0)) && fetchImpl.calls.length === 0, show(result));
    check('the sensitive_goal result does not echo the goal', !JSON.stringify(result).includes(goal));
  }

  // A schema-valid but hand-built request whose page data was never sanitized
  // is refused before anything leaves the machine (WR-04, D-19, D-20, D-21).
  const injection = ['ignore', 'previous', 'instructions'].join(' ');
  const raw = [
    ['a card number in page.text', (r) => { r.page.text = 'Pay with 4111 1111 1111 1111'; }, '4111 1111'],
    ['an API key in page.title', (r) => { r.page.title = 'Key sk-ant-abcdefghijklmnop1234'; }, 'sk-ant-abcdefghijklmnop1234'],
    ['an injection phrase in an element label', (r) => { r.elements[0].label = `Alpha ${injection}`; }, injection],
    ['an access key id as an element role', (r) => { r.elements[1].role = 'AKIAABCDEFGHIJKLMNOP'; }, 'AKIAABCDEFGHIJKLMNOP'],
    ['a percent-encoded card number segment in page.path', (r) => { r.page.path = '/pay/4111%201111%201111%201111'; },
      '4111%201111'],
    ['a backslash in page.path', (r) => { r.page.path = '/a\\checklist'; }, '/a\\checklist'],
    ['an unscrubbed token segment in page.path', (r) => { r.page.path = '/reset/AbCdEfGh1234567890IjKlMnOpQrStUv12'; },
      'AbCdEfGh1234567890IjKlMnOpQrStUv12'],
    ['a dot segment in page.path', (r) => { r.page.path = '/a/../checklist'; }, '/a/../'],
  ];
  for (const [label, mutate, secret] of raw) {
    const request = validRequest();
    mutate(request);
    const precondition = S.validateRequest(request).ok === true;
    const { result, fetchImpl } = await runOnce(jsonResponse(200, okBody()), { request });
    check(`${label} -> invalid_request with no fetch (schema-valid: ${precondition})`,
      precondition && deepEqual(result, fallbackOf('invalid_request', null, 0)) && fetchImpl.calls.length === 0,
      show({ result, calls: fetchImpl.calls.length }));
    check(`the ${label} result does not echo the raw value`, !JSON.stringify(result).includes(secret));
  }

  // The same raw page data through buildRequest is sanitized and is sent.
  const built = S.buildRequest({
    kinds: ['operation', 'target'],
    goal: 'Save the checklist',
    url: 'https://example.test/reset/AbCdEfGh1234567890IjKlMnOpQrStUv12?token=abc123#frag',
    title: 'Key sk-ant-abcdefghijklmnop1234',
    visibleText: `Pay with 4111 1111 1111 1111 and ${injection}`,
    elements: [
      { id: 'a', role: 'button', label: `Alpha ${injection}`, ops: ['click'] },
      { id: 'b', role: 'AKIAABCDEFGHIJKLMNOP', label: 'Save', ops: ['click'] },
    ],
    offeredOps: ['click'],
  });
  check('precondition: buildRequest succeeds on the same raw page data', built.ok === true, show(built));
  if (built.ok) {
    const sent = await runOnce(jsonResponse(503, fallbackBody('busy', 503)), { request: built.request });
    check('a buildRequest request passes the sanitized-form check and reaches the network',
      sent.fetchImpl.calls.length === 1 && sent.result.fallback === 'busy', show(sent.result));
    const wire = sent.fetchImpl.calls.length === 1 ? String(sent.fetchImpl.calls[0].init.body) : '';
    check('no raw value reaches the wire body',
      ['4111 1111', 'sk-ant-abcdefghijklmnop1234', injection, 'AKIAABCDEFGHIJKLMNOP', 'token=abc123',
        'AbCdEfGh1234567890IjKlMnOpQrStUv12'].every((secret) => !wire.includes(secret)), wire.slice(0, 300));
  }

  const controller = new AbortController();
  controller.abort();
  const pre = await runOnce(jsonResponse(200, okBody()), { call: { signal: controller.signal } });
  check('a signal aborted before the call -> aborted with no fetch',
    deepEqual(pre.result, fallbackOf('aborted', null, 0)) && pre.fetchImpl.calls.length === 0, show(pre.result));

  const big = oversizeRequest();
  check('precondition: the oversize request is schema-valid and over the inbound cap',
    S.validateRequest(big).ok === true && Buffer.byteLength(JSON.stringify(big), 'utf8') > S.CONTRACT.BUDGETS.bodyLimitBytes);
  const tooBig = await runOnce(jsonResponse(200, okBody()), { request: big });
  check('a request over the inbound byte cap -> payload_too_large with no fetch',
    deepEqual(tooBig.result, fallbackOf('payload_too_large', null, 0)) && tooBig.fetchImpl.calls.length === 0, show(tooBig.result));

  // FsbJevState missing (a bare vm context with no require): invalid_request, no network.
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(CLIENT_PATH, 'utf8'), context, { filename: CLIENT_PATH });
  check('loading in a bare vm context adds exactly one global', deepEqual(Object.keys(context), ['FsbJevClient']), show(Object.keys(context)));
  let bareCalls = 0;
  const bare = context.FsbJevClient.createJevClient({ fetchImpl: () => { bareCalls += 1; return null; } });
  const bareResult = clone(await bare.decide(validRequest()));
  check('without FsbJevState decide returns invalid_request and never fetches',
    bareResult.ok === false && bareResult.fallback === 'invalid_request' && bareResult.httpStatus === null && bareCalls === 0, show(bareResult));
}

async function networkErrorSection() {
  console.log('\n--- transport failures (D-16) ---');
  const noResponse = [
    ['fetchImpl throwing synchronously', () => { throw new Error('boom-secret-AAA'); }],
    ['fetchImpl rejecting with a TypeError', () => Promise.reject(new TypeError('boom-secret-BBB'))],
    ['fetchImpl rejecting with undefined', () => Promise.reject(undefined)],
    ['fetchImpl returning null', () => null],
    ['fetchImpl returning undefined', () => undefined],
    ['fetchImpl returning a number', () => 7],
    ['a response without status', () => ({ text: async () => JSON.stringify(okBody()) })],
    ['a response with a string status', () => ({ status: '200', text: async () => JSON.stringify(okBody()) })],
    ['a response with a fractional status', () => ({ status: 200.5, text: async () => '' })],
    ['a response with status 0', () => ({ status: 0, text: async () => '' })],
    ['a response with status 600', () => ({ status: 600, text: async () => '' })],
    ['a response whose status getter throws', () => ({ get status() { throw new Error('boom-secret-CCC'); } })],
  ];
  for (const [label, impl] of noResponse) {
    const clock = manualClock();
    const fetchImpl = makeFetch(() => { clock.t += 9; return impl(); });
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, now: clock.now });
    const result = await client.decide(validRequest());
    check(`${label} -> network_error`, deepEqual(result, fallbackOf('network_error', null, 9)), show(result));
    check(`${label}: no error text in the result`, !/boom-secret/.test(JSON.stringify(result)));
  }

  const bodyFailures = [
    ['res.text() rejecting at 200', 200, () => Promise.reject(new Error('boom-secret-DDD')), 'invalid_response'],
    ['res.text() throwing at 200', 200, () => { throw new Error('boom-secret-EEE'); }, 'invalid_response'],
    ['res.text() rejecting at 502', 502, () => Promise.reject(new Error('boom-secret-FFF')), 'server_error'],
    ['res.text() resolving to an object at 200', 200, () => Promise.resolve(okBody()), 'invalid_response'],
    ['res.text() resolving to undefined at 429', 429, () => Promise.resolve(undefined), 'rate_limited'],
  ];
  for (const [label, status, text, reason] of bodyFailures) {
    const { result } = await runOnce({ status, text }, { latency: 4 });
    check(`${label} -> ${reason} with the received status`, deepEqual(result, fallbackOf(reason, status, 4)), show(result));
  }
  const noText = await runOnce({ status: 413 }, { latency: 4 });
  check('a response without a text() method maps by status', deepEqual(noText.result, fallbackOf('payload_too_large', 413, 4)), show(noText.result));

  // The body and headers of a failing gateway answer never reach the result.
  const echo = await runOnce(response(502, `Authorization: Bearer abcdefghijklmnop ${validRequest().goal}`), { latency: 1 });
  check('an echoing 502 body leaks nothing into the result',
    deepEqual(echo.result, fallbackOf('server_error', 502, 1)) && !JSON.stringify(echo.result).includes('Save the checklist'), show(echo.result));
}

async function noLoggingSection() {
  console.log('\n--- the client never logs (D-22) ---');
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const saved = {};
  let calls = 0;
  for (const m of methods) { saved[m] = console[m]; console[m] = () => { calls += 1; }; }
  try {
    await runOnce(jsonResponse(200, okBody()));
    await runOnce(() => { throw new Error('x'); });
    await runOnce(response(502, '<html>'));
    await runOnce(jsonResponse(200, Object.assign(okBody(), { approved: true })));
    await runOnce(jsonResponse(200, okBody()), { request: Object.assign(validRequest(), { goal: CARD_GOAL }) });
    await runOnce(jsonResponse(200, okBody()), { request: null });
    await runOnce({ status: 200, text: () => Promise.reject(new Error('read failed')) });
  } finally {
    for (const m of methods) console[m] = saved[m];
  }
  check('no console method was called across ok, error and fallback paths', calls === 0, String(calls));
}

// ---------------------------------------------------------------------------
// Task 2: deadline and caller abort, listener and timer hygiene, cool-down,
// no persistence, never-rejects fuzzing
// ---------------------------------------------------------------------------

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** A fetch that never resolves but rejects once its signal aborts. */
function hangingFetch() {
  return makeFetch((url, init) => new Promise((resolve, reject) => {
    if (init && init.signal) init.signal.addEventListener('abort', () => reject(abortError()), { once: true });
  }));
}

/** setTimeout/clearTimeout spies; the deadline only fires when a test calls fire(). */
function spyTimers() {
  const armed = [];
  const cleared = [];
  let next = 1;
  return {
    armed,
    cleared,
    setTimeoutImpl(fn, ms) {
      const handle = { id: next };
      next += 1;
      armed.push({ fn, ms, handle });
      return handle;
    },
    clearTimeoutImpl(handle) { cleared.push(handle); },
  };
}

/** A real AbortSignal whose add/removeEventListener calls are recorded. */
function spySignal() {
  const controller = new AbortController();
  const signal = controller.signal;
  const adds = [];
  const removes = [];
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = (type, fn, opts) => { adds.push({ type, fn, opts }); return add(type, fn, opts); };
  signal.removeEventListener = (type, fn, opts) => { removes.push({ type, fn }); return remove(type, fn, opts); };
  return { controller, signal, adds, removes };
}

function settle(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deadlineSection() {
  console.log('\n--- deadline and caller abort (D-15, D-16) ---');
  const f1 = hangingFetch();
  let t0 = Date.now();
  const r1 = await C.createJevClient({ fetchImpl: f1, endpoint: TEST_ENDPOINT }).decide(validRequest(), { timeoutMs: 50 });
  let took = Date.now() - t0;
  check('a hanging fetch with timeoutMs 50 -> timeout', r1.ok === false && r1.fallback === 'timeout' && r1.httpStatus === null
    && r1.servedModel === null && isExactFallback(r1), show(r1));
  check('the timeout arrives in under 500 ms', took >= 40 && took < 500, `${took} ms`);
  check('timeout latencyMs is the measured wait', r1.latencyMs >= 40 && r1.latencyMs < 500, String(r1.latencyMs));
  check('the deadline aborted the signal handed to fetch', f1.calls[0] && f1.calls[0].init.signal.aborted === true);

  const f2 = hangingFetch();
  const caller = new AbortController();
  const abortTimer = setTimeout(() => caller.abort(), 20);
  t0 = Date.now();
  const r2 = await C.createJevClient({ fetchImpl: f2, endpoint: TEST_ENDPOINT }).decide(validRequest(), { signal: caller.signal });
  took = Date.now() - t0;
  clearTimeout(abortTimer);
  check('a caller abort after 20 ms -> aborted', r2.ok === false && r2.fallback === 'aborted' && r2.httpStatus === null && isExactFallback(r2),
    show(r2));
  check('the caller abort resolves in under 500 ms', took < 500, `${took} ms`);
  check("fetch gets the client's own signal, not the caller's", f2.calls[0] && f2.calls[0].init.signal !== caller.signal);
  check("the caller abort aborted the client's signal", f2.calls[0] && f2.calls[0].init.signal.aborted === true);

  const deaf = makeFetch(() => new Promise(() => {}));
  const r3 = await C.createJevClient({ fetchImpl: deaf, endpoint: TEST_ENDPOINT }).decide(validRequest(), { timeoutMs: 30 });
  check('a fetch that ignores its signal is still bounded by the deadline -> timeout', r3.fallback === 'timeout', show(r3));
  const deafCaller = new AbortController();
  const deafTimer = setTimeout(() => deafCaller.abort(), 10);
  const r4 = await C.createJevClient({ fetchImpl: makeFetch(() => new Promise(() => {})), endpoint: TEST_ENDPOINT })
    .decide(validRequest(), { signal: deafCaller.signal });
  clearTimeout(deafTimer);
  check('a fetch that ignores its signal still yields aborted on a caller abort', r4.fallback === 'aborted', show(r4));

  const slowBody = makeFetch(async () => ({ status: 200, text: () => new Promise(() => {}) }));
  const r5 = await C.createJevClient({ fetchImpl: slowBody, endpoint: TEST_ENDPOINT }).decide(validRequest(), { timeoutMs: 30 });
  check('a body read that never ends -> timeout with the received status',
    r5.fallback === 'timeout' && r5.httpStatus === 200 && isExactFallback(r5), show(r5));

  const slowKey = makeFetch(async () => jsonResponse(200, okBody()));
  const r6 = await C.createJevClient({ fetchImpl: slowKey, endpoint: TEST_ENDPOINT, getHashKey: () => new Promise(() => {}) })
    .decide(validRequest(), { timeoutMs: 30 });
  check('a hash-key read that never ends is bounded too -> timeout with no fetch', r6.fallback === 'timeout' && slowKey.calls.length === 0,
    show(r6));

  // Deadline clamp, through an injected setTimeoutImpl.
  const clampCases = [
    [undefined, C.DEFAULT_TIMEOUT_MS], [99999, C.DEFAULT_TIMEOUT_MS], [2501, C.DEFAULT_TIMEOUT_MS], [2500, 2500], [2499, 2499],
    [50, 50], [1, 1], [0, C.DEFAULT_TIMEOUT_MS], [-5, C.DEFAULT_TIMEOUT_MS], [NaN, C.DEFAULT_TIMEOUT_MS],
    [Infinity, C.DEFAULT_TIMEOUT_MS], ['100', C.DEFAULT_TIMEOUT_MS], [null, C.DEFAULT_TIMEOUT_MS],
  ];
  for (const [timeoutMs, expected] of clampCases) {
    const timers = spyTimers();
    const fetchImpl = makeFetch(async () => jsonResponse(200, okBody()));
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const result = await client.decide(validRequest(), { timeoutMs });
    check(`timeoutMs ${String(timeoutMs)} arms one deadline of ${expected} ms and clears it once`,
      result.ok === true && timers.armed.length === 1 && timers.armed[0].ms === expected
      && timers.cleared.length === 1 && timers.cleared[0] === timers.armed[0].handle,
      show({ armed: timers.armed.map((a) => a.ms), cleared: timers.cleared.length }));
  }

  // The first cause wins.
  {
    const timers = spyTimers();
    const fetchImpl = hangingFetch();
    const callerCtl = new AbortController();
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const pending = client.decide(validRequest(), { signal: callerCtl.signal });
    check('the deadline is armed before decide() first yields', timers.armed.length === 1);
    timers.armed[0].fn();
    callerCtl.abort();
    const result = await pending;
    check('deadline first, then a caller abort -> timeout', result.fallback === 'timeout', show(result));
  }
  {
    const timers = spyTimers();
    const fetchImpl = hangingFetch();
    const callerCtl = new AbortController();
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const pending = client.decide(validRequest(), { signal: callerCtl.signal });
    callerCtl.abort();
    if (timers.armed[0]) timers.armed[0].fn();
    const result = await pending;
    check('a caller abort first, then the deadline -> aborted', result.fallback === 'aborted', show(result));
  }
  {
    // A late abort after the answer arrived changes nothing.
    const timers = spyTimers();
    const fetchImpl = makeFetch(async () => jsonResponse(200, okBody()));
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const result = await client.decide(validRequest(), {});
    if (timers.armed[0]) timers.armed[0].fn();
    check('a deadline firing after the answer leaves the ok result intact', result.ok === true, show(result));
  }
}

async function listenerSection() {
  console.log('\n--- listener and timer hygiene (D-15) ---');
  const outcomes = [
    ['ok', () => makeFetch(async () => jsonResponse(200, okBody())), null],
    ['a gateway fallback body', () => makeFetch(async () => jsonResponse(503, fallbackBody('busy', 503))), null],
    ['a status-only fallback', () => makeFetch(async () => response(502, '<html>')), null],
    ['network_error', () => makeFetch(() => { throw new TypeError('offline'); }), null],
    ['timeout', () => hangingFetch(), 'deadline'],
    ['aborted', () => hangingFetch(), 'caller'],
  ];
  let armedTotal = 0;
  let clearedTotal = 0;
  for (const [label, makeImpl, trigger] of outcomes) {
    const timers = spyTimers();
    const spy = spySignal();
    const fetchImpl = makeImpl();
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const pending = client.decide(validRequest(), { signal: spy.signal });
    if (trigger === 'deadline' && timers.armed[0]) timers.armed[0].fn();
    if (trigger === 'caller') spy.controller.abort();
    const result = await pending;
    armedTotal += timers.armed.length;
    clearedTotal += timers.cleared.length;
    check(`${label}: one abort listener added with once:true and the same one removed`,
      spy.adds.length === 1 && spy.removes.length === 1 && spy.adds[0].type === 'abort'
      && spy.adds[0].opts && spy.adds[0].opts.once === true && spy.removes[0].type === 'abort' && spy.removes[0].fn === spy.adds[0].fn,
      show({ adds: spy.adds.length, removes: spy.removes.length, result }));
    check(`${label}: one deadline armed and cleared once`,
      timers.armed.length === 1 && timers.cleared.length === 1 && timers.cleared[0] === timers.armed[0].handle);
    if (!trigger) {
      spy.controller.abort();
      check(`${label}: a caller abort after the call no longer reaches the client`,
        fetchImpl.calls[0] && fetchImpl.calls[0].init.signal.aborted === false);
    }
  }
  check('clearTimeoutImpl ran once per armed timer across all outcomes', armedTotal === outcomes.length && clearedTotal === armedTotal);

  // Local exits arm nothing and attach nothing.
  const localExits = [
    ['an invalid request', null, () => ({})],
    ['a secret goal', Object.assign(validRequest(), { goal: CARD_GOAL }), () => ({})],
    ['a pre-aborted signal', validRequest(), (spy) => { spy.controller.abort(); return {}; }],
  ];
  for (const [label, request, prepare] of localExits) {
    const timers = spyTimers();
    const spy = spySignal();
    prepare(spy);
    const fetchImpl = makeFetch(async () => jsonResponse(200, okBody()));
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const result = await client.decide(request, { signal: spy.signal });
    check(`${label}: no timer, no listener, no fetch`,
      timers.armed.length === 0 && timers.cleared.length === 0 && spy.adds.length === 0 && fetchImpl.calls.length === 0 && isExactFallback(result),
      show({ armed: timers.armed.length, adds: spy.adds.length, result }));
  }

  // A signal-like object that is not an EventTarget is ignored, not trusted.
  const odd = makeFetch(async () => jsonResponse(200, okBody()));
  const oddResult = await C.createJevClient({ fetchImpl: odd, endpoint: TEST_ENDPOINT }).decide(validRequest(), { signal: { aborted: false } });
  check('a signal without addEventListener is ignored and the call still runs', oddResult.ok === true, show(oddResult));
}

async function cooldownSection() {
  console.log('\n--- in-memory cool-down (D-16, Pitfall 11) ---');
  const COOLING = ['disabled', 'not_configured', 'auth_error', 'upstream_billing', 'unavailable_model'];
  check('precondition: NON_TRANSIENT_REASONS is the five plus spend_cap_reached',
    deepEqual(S.CONTRACT.NON_TRANSIENT_REASONS.slice().sort(), COOLING.concat('spend_cap_reached').sort()));
  const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);

  function cooled(reason) {
    return fallbackOf(reason, null, 0);
  }
  function gatewayClient(reason, start, servedModel) {
    const clock = manualClock(start);
    const status = S.CONTRACT.HTTP_STATUS_BY_REASON[reason];
    const fetchImpl = makeFetch(async () => jsonResponse(status, fallbackBody(reason, status, servedModel)));
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, now: clock.now });
    return { clock, status, fetchImpl, client };
  }

  for (const reason of COOLING) {
    const g = gatewayClient(reason, T0);
    const first = await g.client.decide(validRequest());
    check(`${reason}: the first call reaches the gateway`, deepEqual(first, fallbackOf(reason, g.status, 0)) && g.fetchImpl.calls.length === 1,
      show(first));
    g.clock.t = T0 + 1;
    const second = await g.client.decide(validRequest());
    check(`${reason}: the next call within COOLDOWN_MS returns the same fallback with httpStatus null and no fetch`,
      deepEqual(second, cooled(reason)) && g.fetchImpl.calls.length === 1, show(second));
    g.clock.t = T0 + C.COOLDOWN_MS - 1;
    const edge = await g.client.decide(validRequest());
    check(`${reason}: still cooling at COOLDOWN_MS - 1`, deepEqual(edge, cooled(reason)) && g.fetchImpl.calls.length === 1);
    g.clock.t = T0 + C.COOLDOWN_MS;
    const after = await g.client.decide(validRequest());
    check(`${reason}: at COOLDOWN_MS the client fetches again`,
      deepEqual(after, fallbackOf(reason, g.status, 0)) && g.fetchImpl.calls.length === 2, show(after));
  }

  // auth_error keeps the short 60 s cool-down (Pitfall 11: a 403 may be moderation, not a bad key).
  const auth = gatewayClient('auth_error', T0, 'typesafe/jev-1.13');
  await auth.client.decide(validRequest());
  auth.clock.t = T0 + 1000;
  const authCooled = await auth.client.decide(validRequest());
  check('a cooled result carries no servedModel and no status', deepEqual(authCooled, cooled('auth_error')), show(authCooled));

  // A cooled answer does not extend the cool-down.
  const ext = gatewayClient('disabled', T0);
  await ext.client.decide(validRequest());
  ext.clock.t = T0 + 30000;
  await ext.client.decide(validRequest());
  ext.clock.t = T0 + C.COOLDOWN_MS;
  await ext.client.decide(validRequest());
  check('a cooled answer does not extend the cool-down', ext.fetchImpl.calls.length === 2);

  // spend_cap_reached: until the next UTC midnight, at most MAX_SPEND_COOLDOWN_MS.
  const spendCases = [
    ['23:30 UTC cools until midnight (30 min)', Date.UTC(2026, 9, 17, 23, 30, 0), Date.UTC(2026, 9, 18, 0, 0, 0)],
    ['23:00 UTC cools until midnight (exactly 1 h)', Date.UTC(2026, 9, 17, 23, 0, 0), Date.UTC(2026, 9, 18, 0, 0, 0)],
    ['23:59:59.500 UTC cools for 500 ms', Date.UTC(2026, 9, 17, 23, 59, 59, 500), Date.UTC(2026, 9, 18, 0, 0, 0)],
    ['10:00 UTC is capped at 1 h', Date.UTC(2026, 9, 17, 10, 0, 0), Date.UTC(2026, 9, 17, 11, 0, 0)],
    ['00:00 UTC exactly is capped at 1 h', Date.UTC(2026, 9, 17, 0, 0, 0), Date.UTC(2026, 9, 17, 1, 0, 0)],
  ];
  for (const [label, start, until] of spendCases) {
    const g = gatewayClient('spend_cap_reached', start);
    await g.client.decide(validRequest());
    g.clock.t = until - 1;
    const before = await g.client.decide(validRequest());
    g.clock.t = until;
    await g.client.decide(validRequest());
    check(`spend_cap_reached at ${label}`, deepEqual(before, cooled('spend_cap_reached')) && g.fetchImpl.calls.length === 2,
      show({ before, calls: g.fetchImpl.calls.length }));
  }
  check('the spend cool-down never exceeds MAX_SPEND_COOLDOWN_MS', C.MAX_SPEND_COOLDOWN_MS === 60 * 60 * 1000);

  // Transient reasons never cool down.
  const transientBodies = S.CONTRACT.GATEWAY_FALLBACK_REASONS.filter((r) => !S.CONTRACT.NON_TRANSIENT_REASONS.includes(r));
  for (const reason of transientBodies) {
    const g = gatewayClient(reason, T0);
    await g.client.decide(validRequest());
    g.clock.t = T0 + 1;
    const again = await g.client.decide(validRequest());
    check(`transient ${reason} starts no cool-down`, g.fetchImpl.calls.length === 2 && again.httpStatus === g.status, show(again));
  }
  const clientTransients = [
    ['network_error', () => makeFetch(() => { throw new TypeError('offline'); })],
    ['status-only server_error', () => makeFetch(async () => response(502, '<html>'))],
    ['status-only timeout', () => makeFetch(async () => response(504, ''))],
    ['status-only rate_limited', () => makeFetch(async () => response(429, ''))],
    ['status-only invalid_response', () => makeFetch(async () => response(200, 'garbage'))],
  ];
  for (const [label, makeImpl] of clientTransients) {
    const fetchImpl = makeImpl();
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, now: () => T0 });
    await client.decide(validRequest());
    await client.decide(validRequest());
    check(`client-side ${label} starts no cool-down`, fetchImpl.calls.length === 2);
  }
  {
    const timers = spyTimers();
    const fetchImpl = hangingFetch();
    const client = C.createJevClient({ fetchImpl, endpoint: TEST_ENDPOINT, now: () => T0, setTimeoutImpl: timers.setTimeoutImpl, clearTimeoutImpl: timers.clearTimeoutImpl });
    const pending = client.decide(validRequest());
    timers.armed[0].fn();
    const first = await pending;
    const ctl = new AbortController();
    const second = client.decide(validRequest(), { signal: ctl.signal });
    ctl.abort();
    const secondResult = await second;
    const third = client.decide(validRequest());
    timers.armed[timers.armed.length - 1].fn();
    await third;
    check('a client deadline (timeout) and a caller abort start no cool-down',
      first.fallback === 'timeout' && secondResult.fallback === 'aborted' && fetchImpl.calls.length === 3, show({ first, secondResult }));
  }

  // resetCooldown().
  const reset = gatewayClient('disabled', T0);
  check('createJevClient() exposes resetCooldown', typeof reset.client.resetCooldown === 'function');
  check('resetCooldown with nothing cooling is harmless', (() => { try { reset.client.resetCooldown(); return true; } catch (_e) { return false; } })());
  await reset.client.decide(validRequest());
  reset.clock.t = T0 + 1;
  reset.client.resetCooldown();
  const afterReset = await reset.client.decide(validRequest());
  check('resetCooldown clears an active cool-down', reset.fetchImpl.calls.length === 2 && afterReset.httpStatus === 503, show(afterReset));

  // Local checks still answer during a cool-down; the cool-down survives them.
  const local = gatewayClient('disabled', T0);
  await local.client.decide(validRequest());
  local.clock.t = T0 + 1;
  const pre = new AbortController();
  pre.abort();
  const duringInvalid = await local.client.decide({});
  const duringSecret = await local.client.decide(Object.assign(validRequest(), { goal: CARD_GOAL }));
  const duringAborted = await local.client.decide(validRequest(), { signal: pre.signal });
  const stillCooled = await local.client.decide(validRequest());
  check('during a cool-down an invalid request is still invalid_request', duringInvalid.fallback === 'invalid_request');
  check('during a cool-down a secret goal is still sensitive_goal', duringSecret.fallback === 'sensitive_goal');
  check('during a cool-down a pre-aborted signal is still aborted', duringAborted.fallback === 'aborted');
  check('the cool-down survives those local answers', deepEqual(stillCooled, cooled('disabled')) && local.fetchImpl.calls.length === 1);

  // Per instance, and a clock that goes backwards ends it.
  const a = gatewayClient('disabled', T0);
  const b = gatewayClient('disabled', T0);
  await a.client.decide(validRequest());
  a.clock.t = T0 + 1;
  b.clock.t = T0 + 1;
  await a.client.decide(validRequest());
  await b.client.decide(validRequest());
  check('a cool-down belongs to its own client instance', a.fetchImpl.calls.length === 1 && b.fetchImpl.calls.length === 1);
  a.clock.t = T0 - 1;
  await a.client.decide(validRequest());
  check('a clock that moved backwards ends the cool-down', a.fetchImpl.calls.length === 2);
}

async function persistenceSection() {
  console.log('\n--- memory only: no storage, no browser API (D-01, D-16) ---');
  const source = fs.readFileSync(CLIENT_PATH, 'utf8');
  check('the source names no localStorage, chrome., indexedDB, sessionStorage, caches. or document.cookie',
    !/localStorage|chrome\.|indexedDB|sessionStorage|caches\.|document\.cookie/.test(source));

  // Run a cool-down cycle inside a vm context whose storage globals record every read.
  const touched = [];
  const trap = (name) => new Proxy({}, { get(_t, key) { touched.push(`${name}.${String(key)}`); return undefined; } });
  // URL is a standard worker global (not a storage or browser API); decide()
  // uses it through FsbJevState.toOriginPath to check the request's origin + path.
  const sandbox = {
    TextEncoder,
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
  };
  for (const name of ['chrome', 'browser', 'localStorage', 'sessionStorage', 'indexedDB', 'caches']) {
    const proxy = trap(name);
    Object.defineProperty(sandbox, name, { configurable: true, enumerable: false, get() { touched.push(name); return proxy; } });
  }
  const context = vm.createContext(sandbox);
  vm.runInContext('void chrome;', context);
  check('precondition: the storage trap records a read of chrome', touched.length === 1 && touched[0] === 'chrome', show(touched));
  touched.length = 0;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'extension', 'ai', 'jev-state.js'), 'utf8'), context);
  vm.runInContext(source, context, { filename: CLIENT_PATH });
  const clock = manualClock(Date.UTC(2026, 9, 17, 12, 0, 0));
  let calls = 0;
  const client = context.FsbJevClient.createJevClient({
    endpoint: TEST_ENDPOINT,
    now: clock.now,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? jsonResponse(503, fallbackBody('disabled', 503)) : jsonResponse(200, okBody());
    },
  });
  const r1 = clone(await client.decide(validRequest()));
  clock.t += 1;
  const r2 = clone(await client.decide(validRequest()));
  client.resetCooldown();
  const r3 = clone(await client.decide(validRequest()));
  check('in the vm context the cool-down cycle works (disabled, cooled, then ok after reset)',
    r1.fallback === 'disabled' && r2.fallback === 'disabled' && r2.httpStatus === null && r3.ok === true && calls === 2, show({ r1, r2, r3 }));
  check('no storage or browser global was read during load or any call', touched.length === 0, show(touched));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function fuzzSection() {
  console.log('\n--- never rejects: 500 seeded cases (D-15, D-16) ---');
  const SEED = 0x6708;
  const CASES = 500;
  const rng = mulberry32(SEED);
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  const EXTRA_KEYS = ['authorize', 'skipConfirmation', 'approved', 'override', 'humanApproved', 'x', 'value', 'grant'];
  const STATUSES = [200, 200, 200, 201, 204, 301, 400, 401, 404, 413, 429, 500, 502, 503, 504, 599, 0, 600, 99, '200', null, undefined, 200.5, NaN];

  function randomJson(depth) {
    const roll = rng();
    if (depth > 2 || roll < 0.3) return pick([null, 0, 1, -1, 0.5, 1e300, true, false, '', 'x', 'none_of_the_above']);
    if (roll < 0.6) return Array.from({ length: int(0, 3) }, () => randomJson(depth + 1));
    const node = {};
    for (let i = 0; i < int(0, 4); i += 1) node[pick(EXTRA_KEYS.concat(S.CONTRACT.KEYS.okResponse))] = randomJson(depth + 1);
    return node;
  }

  function mutateOk(body) {
    const roll = int(0, 8);
    if (roll === 0) body[pick(EXTRA_KEYS)] = randomJson(1);
    else if (roll === 1) body.decisions.operation.confidence = pick([2, -0.1, NaN, '0.5', null]);
    else if (roll === 2) body.latencyMs = pick([-1, null, 'fast']);
    else if (roll === 3) body.ok = pick(['true', 1, null]);
    else if (roll === 4) body.calibration = pick([null, { status: 'calibrated' }, { status: 'approved', profileId: 'p' }]);
    else if (roll === 5) body.decisions[pick(['completion', 'stuck'])] = { p: 0.5, threshold: null, meetsThreshold: false };
    else if (roll === 6) body.decisions.risk.meetsThreshold = true;
    else if (roll === 7) body.usage = { inputTokens: 0, source: 'unavailable' };
    else body.decisions.target.probabilities[pick(['e7', 'approved', 'e-1'])] = 0.1;
    return body;
  }

  function randomBodyText(request) {
    const roll = int(0, 13);
    const matching = request && Array.isArray(request.kinds) && request.kinds.length === 5 ? allKindsBody() : okBody();
    if (roll <= 2) return JSON.stringify(matching);
    if (roll === 3) return JSON.stringify(mutateOk(matching));
    if (roll === 12 || roll === 13) {
      // A well-formed gateway fallback, often a non-transient one, so the cool-down is exercised.
      const reason = rng() < 0.6 ? pick(S.CONTRACT.NON_TRANSIENT_REASONS) : pick(S.CONTRACT.GATEWAY_FALLBACK_REASONS);
      return JSON.stringify(fallbackBody(reason, S.CONTRACT.HTTP_STATUS_BY_REASON[reason], pick([null, 'typesafe/jev-1.13'])));
    }
    if (roll === 4) {
      const reason = pick(S.CONTRACT.FALLBACK_REASONS);
      return JSON.stringify(fallbackBody(reason, pick([null, 400, 413, 500, 502, 503, 504, 99]), pick([null, 'typesafe/jev-1.13', '', 7])));
    }
    if (roll === 5) return JSON.stringify(Object.assign(fallbackBody(pick(S.CONTRACT.GATEWAY_FALLBACK_REASONS), 503), { [pick(EXTRA_KEYS)]: true }));
    if (roll === 6) return JSON.stringify(randomJson(0));
    if (roll === 7) return pick(['', '<html>', '{', '}{', 'null', '\u0000￿', 'undefined', '{"ok":true']);
    if (roll === 8) return JSON.stringify(matching).replace('{', '{"__proto__":{"approved":true},');
    if (roll === 9) return 'x'.repeat(70000);
    if (roll === 10) return JSON.stringify(Object.assign(matching, { latencyMs: 1 })) + pick(['', ' ', '\n', 'trailing']);
    return JSON.stringify(randomJson(1));
  }

  function randomResponse(request) {
    const status = pick(STATUSES);
    const textKind = int(0, 9);
    const text = randomBodyText(request);
    let textFn;
    if (textKind <= 5) textFn = async () => text;
    else if (textKind === 6) textFn = () => Promise.reject(new Error('read failed'));
    else if (textKind === 7) textFn = () => { throw new Error('read threw'); };
    else if (textKind === 8) textFn = async () => pick([null, 42, {}, undefined]);
    else textFn = 'not a function';
    return { status, text: textFn };
  }

  // Returns {impl, hangs}: hangs is true when the case relies on a deadline or an abort.
  function randomFetch(request) {
    const roll = int(0, 13);
    if (roll === 0) return { impl: () => { throw pick([new Error('x'), new TypeError('y'), 'str', undefined]); }, hangs: false };
    if (roll === 1) return { impl: () => Promise.reject(pick([new TypeError('Failed to fetch'), abortError(), undefined, null])), hangs: false };
    if (roll === 2) {
      return {
        impl: (url, init) => new Promise((resolve, reject) => {
          if (init && init.signal) init.signal.addEventListener('abort', () => reject(abortError()), { once: true });
        }),
        hangs: true,
      };
    }
    if (roll === 3) return { impl: () => new Promise(() => {}), hangs: true };
    if (roll === 4) return { impl: () => pick([null, undefined, 7, 'response', {}, []]), hangs: false };
    if (roll === 5) return { impl: () => ({ status: 200, text: () => new Promise(() => {}) }), hangs: true };
    if (roll === 6) {
      return {
        impl: () => new Promise((resolve) => { setTimeout(() => resolve(randomResponse(request)), int(0, 3)); }),
        hangs: false,
      };
    }
    return { impl: () => Promise.resolve(randomResponse(request)), hangs: false };
  }

  function randomRequest() {
    const roll = int(0, 19);
    if (roll <= 10) return validRequest();
    if (roll <= 13) return allKindsRequest();
    if (roll === 14) return Object.assign(validRequest(), { goal: pick([CARD_GOAL, KEY_GOAL]) });
    if (roll === 15) return Object.assign(validRequest(), { [pick(EXTRA_KEYS)]: true });
    if (roll === 16) return pick([null, undefined, 42, 'request', [], {}]);
    if (roll === 17) { const r = validRequest(); r.kinds = pick([[], ['approve'], 'operation', null]); return r; }
    if (roll === 18) { const r = validRequest(); r.elements[0].value = 'secret'; return r; }
    return randomJson(0);
  }

  const timers = [];
  function randomCallOpts(hangs) {
    const roll = int(0, 9);
    let opts;
    if (roll === 0) opts = undefined;
    else if (roll === 1) opts = pick([null, 42, 'opts']);
    else if (roll === 2) opts = {};
    else if (roll === 3) opts = { timeoutMs: pick([5, 10, 15, 20, -1, 0, NaN, 'x', Infinity, 99999, undefined]) };
    else if (roll === 4) { const c = new AbortController(); c.abort(); opts = { signal: c.signal }; }
    else if (roll === 5 || roll === 6) {
      const c = new AbortController();
      timers.push(setTimeout(() => c.abort(), int(0, 15)));
      opts = { signal: c.signal, timeoutMs: pick([undefined, 8, 20]) };
    }
    else if (roll === 7) opts = { signal: pick([{ aborted: false }, { aborted: true }, { addEventListener: 'x' }, 'signal', null]) };
    else opts = { timeoutMs: int(1, 25) };
    if (hangs) {
      // Keep hanging cases short: a small deadline unless a caller abort is already scheduled.
      const scheduled = opts && typeof opts === 'object' && opts.signal instanceof AbortSignal;
      const small = opts && typeof opts === 'object' && typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 && opts.timeoutMs <= 25;
      if (!scheduled && !small) opts = Object.assign({}, opts && typeof opts === 'object' ? opts : {}, { timeoutMs: int(3, 15) });
      else if (scheduled && !small) opts.timeoutMs = 25;
    }
    return opts;
  }

  const unhandled = [];
  const onUnhandled = (reason) => { unhandled.push(reason); };
  process.on('unhandledRejection', onUnhandled);

  const sharedClock = manualClock(Date.UTC(2026, 9, 17, 22, 0, 0));
  let sharedImpl = () => null;
  const shared = C.createJevClient({ fetchImpl: (url, init) => sharedImpl(url, init), endpoint: TEST_ENDPOINT, now: sharedClock.now });

  const tally = {};
  let rejected = 0;
  let threw = 0;
  let badShape = 0;
  let localLeak = 0;
  let cooledHits = 0;
  let firstProblem = null;
  const started = Date.now();

  /** A gateway that answers with a well-formed typed fallback, usually a non-transient one. */
  function gatewayFallbackFetch() {
    const reason = rng() < 0.7 ? pick(S.CONTRACT.NON_TRANSIENT_REASONS) : pick(S.CONTRACT.GATEWAY_FALLBACK_REASONS);
    const status = S.CONTRACT.HTTP_STATUS_BY_REASON[reason];
    return { impl: () => Promise.resolve(jsonResponse(status, fallbackBody(reason, status))), hangs: false };
  }

  for (let i = 0; i < CASES; i += 1) {
    const request = randomRequest();
    const useShared = rng() < 0.4;
    const { impl, hangs } = useShared && rng() < 0.5 ? gatewayFallbackFetch() : randomFetch(request);
    let fetchCalls = 0;
    const counted = (url, init) => { fetchCalls += 1; return impl(url, init); };
    const callOpts = randomCallOpts(hangs);
    let client;
    if (useShared) {
      // Steps around COOLDOWN_MS, so the shared client both cools and recovers;
      // an occasional reset keeps an hour-long spend cool-down from pinning it.
      sharedClock.t += int(0, 30000);
      if (rng() < 0.1) shared.resetCooldown();
      sharedImpl = counted;
      client = shared;
    } else {
      const hashRoll = int(0, 5);
      const getHashKey = hashRoll === 0 ? () => HASH_KEY
        : hashRoll === 1 ? () => { throw new Error('no key'); }
          : hashRoll === 2 ? () => Promise.resolve(pick([HASH_KEY, 'bad', null]))
            : null;
      const nowRoll = int(0, 7);
      const now = nowRoll === 0 ? () => NaN : nowRoll === 1 ? () => { throw new Error('clock'); } : nowRoll === 2 ? () => 'later' : undefined;
      client = C.createJevClient({ fetchImpl: counted, endpoint: TEST_ENDPOINT, now, getHashKey });
    }

    let result;
    try {
      const promise = client.decide(request, callOpts);
      const settled = await promise.then((value) => ({ value }), (error) => ({ error }));
      if ('error' in settled) {
        rejected += 1;
        if (!firstProblem) firstProblem = { i, problem: 'rejected', error: String(settled.error) };
        continue;
      }
      result = settled.value;
    } catch (error) {
      threw += 1;
      if (!firstProblem) firstProblem = { i, problem: 'threw', error: String(error) };
      continue;
    }

    if (!isExactResult(result, request)) {
      badShape += 1;
      if (!firstProblem) firstProblem = { i, problem: 'shape', result: show(result) };
    }
    const requestOk = (() => { try { return S.validateRequest(request).ok === true; } catch (_e) { return false; } })();
    if (!requestOk && (fetchCalls !== 0 || !(result && ['invalid_request', 'sensitive_goal'].includes(result.fallback)))) {
      localLeak += 1;
      if (!firstProblem) firstProblem = { i, problem: 'invalid request reached the network', result: show(result), fetchCalls };
    }
    if (result && result.ok === false && result.httpStatus === null && fetchCalls === 0
      && S.CONTRACT.NON_TRANSIENT_REASONS.includes(result.fallback)) cooledHits += 1;
    const key = result && result.ok === true ? 'ok' : result && result.fallback;
    tally[key] = (tally[key] || 0) + 1;
  }
  for (const timer of timers) clearTimeout(timer);
  await settle(30);
  process.off('unhandledRejection', onUnhandled);

  const elapsed = Date.now() - started;
  console.log(`  fuzz: ${CASES} cases in ${elapsed} ms, seed 0x${SEED.toString(16)}; outcomes ${JSON.stringify(tally)}; cooled ${cooledHits}`);
  check('no case rejected', rejected === 0, show(firstProblem));
  check('no case threw synchronously', threw === 0, show(firstProblem));
  check('every result is an exact D-15 shape with a D-16 reason', badShape === 0, show(firstProblem));
  check('an invalid request never reached the network', localLeak === 0, show(firstProblem));
  check('no unhandled rejection escaped', unhandled.length === 0, show(unhandled.map(String)));
  const mustSee = ['ok', 'invalid_request', 'sensitive_goal', 'aborted', 'timeout', 'network_error', 'invalid_response',
    'server_error', 'rate_limited', 'payload_too_large'];
  const missing = mustSee.filter((reason) => !tally[reason]);
  check('the fuzz reached every main outcome (not vacuous)', missing.length === 0, `missing ${missing.join(', ')}`);
  check('the fuzz exercised gateway fallback bodies and cool-down hits',
    Object.keys(tally).some((k) => S.CONTRACT.NON_TRANSIENT_REASONS.includes(k)) && cooledHits > 0, String(cooledHits));
}

async function timerHygieneSection() {
  console.log('\n--- no timer outlives a call (D-17) ---');
  await settle(5);
  const pending = typeof process.getActiveResourcesInfo === 'function'
    ? process.getActiveResourcesInfo().filter((resource) => resource === 'Timeout').length
    : 0;
  check('no Timeout handle is still active after every call has settled', pending === 0, String(pending));
}

let completed = false;
// A decide() that never settles drains the event loop and ends the process
// early; fail loudly instead of exiting 0 halfway through.
process.exitCode = 1;
process.on('exit', () => {
  if (!completed) console.log('\n  FAIL: the suite did not finish (a decide() call never settled)');
});

async function main() {
  console.log('--- jev-client (JEV-01, JEV-02, JEV-06, JEV-07) ---');
  const loaded = loadSection();
  if (loaded) {
    const sections = [staticSection, okSection, fallbackBodySection, malformedBodySection, statusTableSection,
      transportSection, localCheckSection, networkErrorSection, noLoggingSection,
      deadlineSection, listenerSection, cooldownSection, persistenceSection, fuzzSection, timerHygieneSection];
    for (const section of sections) {
      try { await section(); } catch (error) {
        failed += 1;
        console.log(`  FAIL: ${section.name} threw -- ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}`);
      }
    }
  }
  console.log(`\n=== jev-client results: ${passed} passed, ${failed} failed ===`);
  // No process.exit(): the process must exit on its own, so a dangling timer
  // shows up as a hang instead of being cut short.
  completed = true;
  process.exitCode = failed > 0 ? 1 : 0;
}

main();
