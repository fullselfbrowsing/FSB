/**
 * Phase 67 (JEV-01, JEV-02, JEV-03, JEV-04, JEV-07) -- the /api/jev router.
 *
 * Integration suite for createJevRouter (showcase/server/src/routes/jev.js),
 * mounted on a real express app on 127.0.0.1:0 in production order (trust
 * proxy, the global JSON parser, the /api/jev mount, the generic error
 * handler) in front of the loopback fake upstream
 * (tests/fixtures/jev-fake-upstream.js). It proves:
 *   - the open route: no hash key, a malformed key or an unknown key all get
 *     a typed decision; no per-key limit; only hash_key_present is stored;
 *   - the pipeline order and its typed refusals (disabled, not_configured,
 *     the 48 KB parser, the exact-key validator, the byte budget, the daily
 *     spend ceiling, the no-queue semaphore) and the 502/504 upstream map;
 *   - the ledger policy: one row and one log line per upstream attempt and
 *     none for any refusal (Pitfall 13), with the spend accrual persisted on
 *     every attempt so a same-day restart reseeds the ceiling (Pitfall 9);
 *   - crash resistance: a synchronously throwing fetchImpl, a throwing or
 *     closed db, a throwing randomUUID, a throwing profiles list after the
 *     upstream attempt, and a res.json that throws before or after sending;
 *     no unhandled rejection and the generic error handler is never reached;
 *   - producer/validator parity: every response body passes the extension's
 *     own FsbJevState.validateGatewayResponse.
 *
 * Binds only port 0 on 127.0.0.1 and never mutates process.env.
 *
 * Run: node tests/jev-gateway-router.test.js
 */

'use strict';

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'showcase', 'server');
const SERVER_NM = path.join(SERVER, 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(SERVER, 'src', 'db', 'schema'));
const { createGlobalJsonParser } = require(path.join(SERVER, 'src', 'middleware', 'global-json-parser'));
const { loadJevConfig } = require(path.join(SERVER, 'src', 'jev', 'config'));
const { CONTRACT } = require(path.join(SERVER, 'src', 'jev', 'contract'));
const { INSTRUMENT_VERSION, INSTRUMENT_HASH } = require(path.join(SERVER, 'src', 'jev', 'instrument'));
const { todaySpendUsd, dayUtcKey } = require(path.join(SERVER, 'src', 'jev', 'ledger'));
const {
  startFakeUpstream,
  OPENROUTER_ID,
  OPENROUTER_PROVIDER,
  OPENROUTER_MODEL,
  DIRECT_MODEL,
} = require('./fixtures/jev-fake-upstream');
const { baseRequest, INVALID_CASES } = require('./fixtures/jev-request-cases');
const FsbJevState = require(path.join(ROOT, 'extension', 'ai', 'jev-state.js'));

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    passed += 1;
    console.log(`  PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL: ${label}${detail === undefined ? '' : ` -- ${detail}`}`);
  }
}

let createJevRouter = null;
try {
  createJevRouter = require(path.join(SERVER, 'src', 'routes', 'jev'));
} catch (_e) {
  createJevRouter = null;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const CREDENTIAL = 'sk-test-SECRET-0123456789abcdef';
const WELL_FORMED_KEY = 'ab'.repeat(32);
const FIXED_DAY_MS = Date.UTC(2026, 9, 17, 12, 0, 0);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const T0 = Date.now();
const DAY = dayUtcKey(FIXED_DAY_MS);
const NEXT_DAY = dayUtcKey(FIXED_DAY_MS + ONE_DAY_MS);
const DECISION_PREFIX = '[jev] decision ';
const CLIENT_TIMEOUT_MS = 5000;
const SUITE_WATCHDOG_MS = 60000;

let unhandledRejections = 0;
process.on('unhandledRejection', () => { unhandledRejections += 1; });
let genericHandlerHit = false;

const silentLog = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

/** A clock on FIXED_DAY_MS that still advances in real time; offset is mutable. */
function makeClock() {
  const state = { offset: 0 };
  state.now = () => FIXED_DAY_MS + state.offset + (Date.now() - T0);
  return state;
}

function makeDb() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  return db;
}

function makeLog() {
  const lines = [];
  const push = (method) => (...args) => { lines.push({ method, text: args.map((a) => String(a)).join(' ') }); };
  return { lines, log: { log: push('log'), info: push('info'), warn: push('warn'), error: push('error'), debug: push('debug') } };
}

function decisionLines(lines) {
  return lines
    .filter((line) => line.text.startsWith(DECISION_PREFIX))
    .map((line) => {
      try { return JSON.parse(line.text.slice(DECISION_PREFIX.length)); } catch (_e) { return null; }
    });
}

function makeConfig(upstreamUrl, overrides) {
  return loadJevConfig(Object.assign({
    JEV_ENABLED: 'true',
    JEV_UPSTREAM_URL: upstreamUrl,
    JEV_MODEL: 'jev-1.13.0',
    JEV_API_KEY: CREDENTIAL,
    JEV_MAX_CONCURRENCY: '4',
    JEV_UPSTREAM_TIMEOUT_MS: '1000',
    JEV_DAILY_USD_CAP: '1',
  }, overrides || {}), { log: silentLog });
}

/** Wrap the real fetch in a call counter (every upstream attempt calls fetchImpl once). */
function countingFetch(impl) {
  const counter = { calls: 0 };
  const inner = impl || ((...args) => globalThis.fetch(...args));
  counter.fetchImpl = (...args) => {
    counter.calls += 1;
    return inner(...args);
  };
  return counter;
}

/** Test-only seam for the outer catch's branch (c): res.json throws on its first call only. */
function testFaultMiddleware(req, res, next) {
  const mode = req.get('X-Test-Fault');
  if (mode === 'after-send' || mode === 'before-send') {
    const original = res.json;
    let calls = 0;
    res.json = function faultyJson(body) {
      calls += 1;
      if (calls === 1) {
        if (mode === 'after-send') original.call(this, body);
        throw new Error('test fault in res.json');
      }
      return original.call(this, body);
    };
  }
  next();
}

const openServers = [];

/**
 * Production order (server.js): trust proxy, the global 1 MB JSON parser (which
 * must skip /api/jev), the /api/jev mount, then the generic error handler.
 */
async function startGateway(routerOptions, { faultMiddleware = false } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(createGlobalJsonParser());
  if (faultMiddleware) app.use(testFaultMiddleware);
  app.use('/api/jev', createJevRouter(routerOptions));
  // Must never fire: the Jev router terminates every error itself.
  app.use((_err, _req, res, _next) => {
    genericHandlerHit = true;
    res.status(500).json({ error: 'generic handler' });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const handle = {
    port: server.address().port,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }),
  };
  openServers.push(handle);
  return handle;
}

// Every response body seen, with the request it answers (parity check at the end).
const seen = [];

function send(port, opts) {
  const options = opts || {};
  const method = options.method || 'POST';
  const reqPath = options.path || '/api/jev/decide';
  let payload = null;
  if (options.raw !== undefined) payload = Buffer.from(options.raw);
  else if (Object.prototype.hasOwnProperty.call(options, 'body')) payload = Buffer.from(JSON.stringify(options.body));
  const headers = Object.assign({}, options.headers || {});
  if (payload !== null) {
    headers['Content-Type'] = options.contentType || 'application/json';
    headers['Content-Length'] = payload.length;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: reqPath, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try { body = JSON.parse(text); } catch (_e) { body = null; }
        const result = { status: res.statusCode, headers: res.headers, text, body };
        seen.push({ body, request: Object.prototype.hasOwnProperty.call(options, 'body') ? options.body : null, text });
        resolve(result);
      });
      res.on('error', reject);
    });
    // A response that never comes fails its checks instead of hanging the suite.
    req.setTimeout(CLIENT_TIMEOUT_MS, () => {
      req.destroy();
      const result = { status: 0, headers: {}, text: '', body: null };
      seen.push({ body: null, request: null, text: '' });
      resolve(result);
    });
    req.on('error', (error) => {
      if (req.destroyed && error && error.code === 'ECONNRESET') return;
      reject(error);
    });
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function decide(port, request, headers) {
  return send(port, { body: request, headers });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 3000);
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(5);
  }
  return predicate();
}

function ledgerCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM jev_decisions').get().n;
}

function ledgerRows(db) {
  return db.prepare('SELECT * FROM jev_decisions ORDER BY id').all();
}

function dailyRow(db, day, outcome) {
  return db.prepare('SELECT * FROM jev_daily WHERE day_utc = ? AND outcome = ?').get(day, outcome) || null;
}

function dailyRequests(db, day, outcome) {
  const row = dailyRow(db, day, outcome);
  return row ? row.requests : 0;
}

function dailyTotal(db) {
  return db.prepare('SELECT COALESCE(SUM(requests), 0) AS n FROM jev_daily').get().n;
}

function near(a, b) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12;
}

function keysEqual(object, keys) {
  return object !== null && typeof object === 'object'
    && JSON.stringify(Object.keys(object).sort()) === JSON.stringify(keys.slice().sort());
}

/** A typed response: status, Cache-Control no-store, and the exact D-15 shape. */
function checkTyped(label, res, status, fallback) {
  check(`${label}: HTTP ${status}`, res.status === status, `got ${res.status} ${res.text.slice(0, 200)}`);
  check(`${label}: Cache-Control no-store`, res.headers['cache-control'] === 'no-store', String(res.headers['cache-control']));
  if (fallback === 'ok') {
    check(`${label}: exact ok shape`, res.body !== null && res.body.ok === true && keysEqual(res.body, CONTRACT.KEYS.okResponse),
      res.text.slice(0, 200));
  } else {
    check(`${label}: typed '${fallback}' with httpStatus ${status}`,
      res.body !== null && res.body.ok === false && res.body.fallback === fallback && res.body.httpStatus === status
        && keysEqual(res.body, CONTRACT.KEYS.fallbackResponse),
      res.text.slice(0, 200));
  }
}

function withoutProposedAction(request, kinds) {
  const next = request;
  next.kinds = kinds;
  delete next.proposedAction;
  return next;
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

async function configGateSection() {
  console.log('\n--- operator switch and config gate (D-05, D-06) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const disabled = await startGateway({
    db, config: loadJevConfig({ JEV_ENABLED: 'false' }, { log: silentLog }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log,
  });
  const notConfigured = await startGateway({
    db,
    config: loadJevConfig({ JEV_ENABLED: 'true', JEV_UPSTREAM_URL: 'https://evil.example/v1/systemone', JEV_MODEL: 'jev-latest', JEV_API_KEY: CREDENTIAL },
      { log: silentLog }),
    fetchImpl: counter.fetchImpl,
    now: clock.now,
    log: sink.log,
  });

  checkTyped('disabled', await decide(disabled.port, baseRequest()), 503, 'disabled');
  checkTyped('disabled with an invalid-JSON body (the gate runs before the parser)',
    await send(disabled.port, { raw: '{"broken": ' }), 503, 'disabled');
  checkTyped('not_configured', await decide(notConfigured.port, baseRequest()), 503, 'not_configured');
  checkTyped('not_configured with an invalid-JSON body',
    await send(notConfigured.port, { raw: '{"broken": ' }), 503, 'not_configured');
  check('the fake upstream received nothing', fake.requests.length === 0 && counter.calls === 0, `${fake.requests.length}/${counter.calls}`);
  check('no ledger row and no log line', ledgerCount(db) === 0 && sink.lines.length === 0, `${ledgerCount(db)} rows, ${sink.lines.length} lines`);
  check('the aggregate counted 2 disabled and 2 not_configured',
    dailyRequests(db, DAY, 'disabled') === 2 && dailyRequests(db, DAY, 'not_configured') === 2);

  await disabled.close();
  await notConfigured.close();
  await fake.close();
  db.close();
}

async function openRouteSection() {
  console.log('\n--- open route: no auth, no per-key limit, hash_key_present only (D-07, D-08, JEV-01) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const config = makeConfig(fake.url);
  const gw = await startGateway({ db, config, fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });

  const expectPresent = new Map();
  const request = baseRequest();
  const noKey = await decide(gw.port, request);
  checkTyped('no X-FSB-Hash-Key', noKey, 200, 'ok');
  if (noKey.body && noKey.body.ok) {
    expectPresent.set(noKey.body.decisionId, 0);
    const b = noKey.body;
    check('decisions hold exactly the requested kinds', keysEqual(b.decisions, request.kinds), JSON.stringify(Object.keys(b.decisions)));
    check("calibration is {status:'uncalibrated', profileId:'uncalibrated-v1'}",
      b.calibration && b.calibration.status === 'uncalibrated' && b.calibration.profileId === 'uncalibrated-v1', JSON.stringify(b.calibration));
    check('every threshold is null and every meetsThreshold false',
      Object.values(b.decisions).every((d) => d.threshold === null && d.meetsThreshold === false));
    check('instrumentVersion is the server instrument', b.instrumentVersion === INSTRUMENT_VERSION);
    check('servedModel is the upstream model, verbatim', b.servedModel === DIRECT_MODEL, b.servedModel);
    check('usage and cost carry their sources (direct route: provider tokens, estimated cost)',
      b.usage.inputTokens === 392 && b.usage.source === 'provider' && b.cost.source === 'estimate'
        && near(b.cost.usd, 392 * config.inputUsdPerMtok / 1e6), JSON.stringify([b.usage, b.cost]));
    check('latencyMs is a non-negative number', typeof b.latencyMs === 'number' && b.latencyMs >= 0);
    check('the response never holds the credential or the goal',
      !noKey.text.includes(CREDENTIAL) && !noKey.text.includes(request.goal));
  }

  const malformed = await decide(gw.port, baseRequest(), { 'X-FSB-Hash-Key': 'not-a-hash-key' });
  checkTyped('a malformed hash key (never 401)', malformed, 200, 'ok');
  if (malformed.body && malformed.body.ok) expectPresent.set(malformed.body.decisionId, 0);
  const unknown = await decide(gw.port, baseRequest(), { 'X-FSB-Hash-Key': 'cd'.repeat(32) });
  checkTyped('a well-formed but unknown hash key (never 401)', unknown, 200, 'ok');
  if (unknown.body && unknown.body.ok) expectPresent.set(unknown.body.decisionId, 1);

  let sequentialOk = 0;
  for (let i = 0; i < 20; i += 1) {
    const res = await decide(gw.port, baseRequest(), { 'X-FSB-Hash-Key': WELL_FORMED_KEY });
    if (res.status === 200 && res.body && res.body.ok === true) {
      sequentialOk += 1;
      expectPresent.set(res.body.decisionId, 1);
    }
  }
  check('20 sequential requests with one key all succeed (no per-key limit)', sequentialOk === 20, `${sequentialOk}/20`);

  const rows = ledgerRows(db);
  check('hash_key_present is 1 only for a well-formed key',
    rows.length === expectPresent.size && rows.every((row) => expectPresent.get(row.decision_id) === row.hash_key_present),
    JSON.stringify(rows.map((row) => [row.decision_id, row.hash_key_present])));
  check('every ok row is body-free and complete',
    rows.every((row) => row.outcome === 'ok' && row.served_model === DIRECT_MODEL && row.instrument_version === INSTRUMENT_VERSION
      && row.calibration_status === 'uncalibrated' && row.kinds === request.kinds.slice().sort().join(',')
      && row.element_count === request.elements.length && row.request_bytes > 0 && row.input_tokens === 392
      && row.usage_source === 'provider' && row.cost_source === 'estimate' && row.upstream_status === 200
      && row.day_utc === DAY));

  // Worst case built by the extension's own builder (JEV-07-f).
  const CJK = '漢';
  const elements = [];
  for (let i = 0; i < 254; i += 1) {
    elements.push({ id: `ref-${i}`, role: CJK.repeat(32), label: CJK.repeat(80), ops: CONTRACT.OPERATIONS.slice() });
  }
  const recentActions = [];
  for (let i = 0; i < 10; i += 1) recentActions.push({ op: 'click', targetId: `ref-${i}`, changed: i % 2 === 0 });
  const built = FsbJevState.buildRequest({
    kinds: CONTRACT.KINDS.slice(),
    goal: CJK.repeat(1000),
    url: `https://shop.test/${CJK.repeat(40)}`,
    title: CJK.repeat(200),
    visibleText: CJK.repeat(6000),
    elements,
    recentActions,
    offeredOps: CONTRACT.OPERATIONS.slice(),
    proposedAction: { op: 'click', targetId: 'ref-253' },
  });
  check('the worst-case request builds', built.ok === true, JSON.stringify(built.reason));
  if (built.ok) {
    const worst = await decide(gw.port, built.request);
    checkTyped('the worst-case request (every field at its cap, 3-byte characters, risk with proposedAction)', worst, 200, 'ok');
  }

  const decisionsLogged = decisionLines(sink.lines);
  const finalRows = ledgerRows(db);
  check('one log line per ledger row, each with its decisionId',
    decisionsLogged.length === finalRows.length
      && finalRows.every((row) => decisionsLogged.some((line) => line && line.decisionId === row.decision_id)),
    `${decisionsLogged.length} lines, ${finalRows.length} rows`);
  check('ledger rows equal fetchImpl invocations', finalRows.length === counter.calls, `${finalRows.length} vs ${counter.calls}`);
  check('no log line holds the credential or the goal',
    sink.lines.every((line) => !line.text.includes(CREDENTIAL) && !line.text.includes(request.goal)));

  await gw.close();
  await fake.close();
  db.close();
}

async function validationSection() {
  console.log('\n--- request validation, parser cap and the 404 catch-all (D-11, D-12, D-16) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const gw = await startGateway({ db, config: makeConfig(fake.url), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });

  let matched = 0;
  const mismatches = [];
  for (const testCase of INVALID_CASES) {
    const res = await decide(gw.port, testCase.request);
    const ok = res.status === 400 && res.body && res.body.ok === false && res.body.fallback === testCase.reason
      && res.body.httpStatus === 400 && res.headers['cache-control'] === 'no-store';
    if (ok) matched += 1;
    else mismatches.push(`${testCase.name}: ${res.status} ${res.text.slice(0, 120)}`);
  }
  check(`every INVALID_CASES entry (${INVALID_CASES.length}) gets 400 with its listed reason`, matched === INVALID_CASES.length,
    mismatches.slice(0, 5).join(' | '));

  const oversize = baseRequest();
  oversize.page.text = 'x'.repeat(50 * 1024);
  const big = await decide(gw.port, oversize);
  // Under the global parser's 1 MB limit: a 413 here proves the global parser
  // skipped /api/jev and the router's own 48 KB parser answered.
  checkTyped('a body over 48 KB (from the Jev router, not the global parser)', big, 413, 'payload_too_large');
  checkTyped('malformed JSON (from the Jev router, not the global parser)',
    await send(gw.port, { raw: '{"v": 1, "kinds": [' }), 400, 'invalid_request');
  check('the generic error handler was not hit by the parser errors', genericHandlerHit === false);

  // Express matches the mount case-insensitively, so case variants reach the
  // Jev router; the global parser must skip them too (WR-01).
  const caseOversize = baseRequest();
  caseOversize.page.text = 'x'.repeat(50 * 1024);
  for (const variant of ['/API/JEV/decide', '/Api/Jev/decide', '/api/JEV/DECIDE']) {
    checkTyped(`malformed JSON at ${variant} (from the Jev router, not the global parser)`,
      await send(gw.port, { path: variant, raw: '{"goal": SECRET-sk-' }), 400, 'invalid_request');
    checkTyped(`a body over 48 KB at ${variant} (the route-local cap still applies)`,
      await send(gw.port, { path: variant, body: caseOversize }), 413, 'payload_too_large');
  }
  check('the generic error handler was not hit by the case-variant parser errors', genericHandlerHit === false);
  checkTyped('a non-JSON content type', await send(gw.port, { raw: JSON.stringify(baseRequest()), contentType: 'text/plain' }),
    400, 'invalid_request');
  checkTyped('GET /api/jev/decide', await send(gw.port, { method: 'GET' }), 404, 'invalid_request');
  checkTyped('POST /api/jev/other', await send(gw.port, { path: '/api/jev/other', body: baseRequest() }), 404, 'invalid_request');

  check('no upstream call, no ledger row and no log line for any refusal',
    counter.calls === 0 && fake.requests.length === 0 && ledgerCount(db) === 0 && sink.lines.length === 0,
    `${counter.calls} calls, ${ledgerCount(db)} rows, ${sink.lines.length} lines`);

  await gw.close();
  await fake.close();
  db.close();
}

async function budgetSection() {
  console.log('\n--- instrument byte budget (D-12) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const gw = await startGateway({
    db, config: makeConfig(fake.url), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log, upstreamByteBudget: 400,
  });
  checkTyped('upstreamByteBudget 400', await decide(gw.port, baseRequest()), 413, 'payload_too_large');
  check('no upstream call and no ledger row', counter.calls === 0 && fake.requests.length === 0 && ledgerCount(db) === 0);
  check('the (day, payload_too_large) aggregate counted it', dailyRequests(db, DAY, 'payload_too_large') === 1);
  await gw.close();
  await fake.close();
  db.close();
}

async function concurrencySection() {
  console.log('\n--- no-queue semaphore (D-13) ---');
  const fake = await startFakeUpstream({ mode: 'hang' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const timeoutMs = 800;
  const gw = await startGateway({
    db,
    config: makeConfig(fake.url, { JEV_MAX_CONCURRENCY: '2', JEV_UPSTREAM_TIMEOUT_MS: String(timeoutMs) }),
    fetchImpl: counter.fetchImpl,
    now: clock.now,
    log: sink.log,
  });

  const first = [decide(gw.port, baseRequest()), decide(gw.port, baseRequest())];
  check('two requests are in flight', await waitFor(() => fake.requests.length === 2), String(fake.requests.length));
  const started = Date.now();
  const third = await decide(gw.port, baseRequest());
  const elapsed = Date.now() - started;
  checkTyped('the third request while both slots are held', third, 503, 'busy');
  check('busy answers immediately (well under the upstream timeout)', elapsed < timeoutMs / 2, `${elapsed} ms`);
  const [r1, r2] = await Promise.all(first);
  checkTyped('first held request times out', r1, 504, 'timeout');
  checkTyped('second held request times out', r2, 504, 'timeout');

  const second = [decide(gw.port, baseRequest()), decide(gw.port, baseRequest())];
  check('two new requests are in flight again (each acquire released)', await waitFor(() => fake.requests.length === 4),
    String(fake.requests.length));
  checkTyped('a third request is busy again (no over-release)', await decide(gw.port, baseRequest()), 503, 'busy');
  const [r4, r5] = await Promise.all(second);
  check('both new requests time out with 504', r4.status === 504 && r5.status === 504, `${r4.status}/${r5.status}`);

  check('ledger rows equal fetchImpl invocations (4 timeouts)', ledgerCount(db) === counter.calls && counter.calls === 4,
    `${ledgerCount(db)} rows, ${counter.calls} calls`);
  check('the (day, busy) aggregate counted 2', dailyRequests(db, DAY, 'busy') === 2);
  check('one log line per timeout row', decisionLines(sink.lines).length === 4);

  await gw.close();
  await fake.close();
  db.close();
}

async function spendSection() {
  console.log('\n--- daily spend ceiling (D-06, Pitfall 9) ---');
  const fake = await startFakeUpstream({ mode: 'ok-openrouter', usage: { input_tokens: 392, output_tokens: 65, cost: 0.00002 } });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const config = makeConfig(fake.url, { JEV_MODEL: 'typesafe/jev-1.13', JEV_DAILY_USD_CAP: '0.00001' });
  const gw = await startGateway({ db, config, fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });

  checkTyped('first request under the ceiling', await decide(gw.port, baseRequest()), 200, 'ok');
  checkTyped('second request after usage.cost 0.00002 against a 0.00001 cap', await decide(gw.port, baseRequest()), 503, 'spend_cap_reached');
  check('the refused request made no upstream call', fake.requests.length === 1 && counter.calls === 1,
    `${fake.requests.length}/${counter.calls}`);
  check('jev_daily cap_accrued_usd holds the provider cost', near(dailyRow(db, DAY, 'ok').cap_accrued_usd, 0.00002),
    JSON.stringify(dailyRow(db, DAY, 'ok')));
  clock.offset += ONE_DAY_MS;
  checkTyped('the next UTC day starts a fresh ceiling', await decide(gw.port, baseRequest()), 200, 'ok');
  checkTyped('and the new day caps again', await decide(gw.port, baseRequest()), 503, 'spend_cap_reached');
  check('the next-day row landed on the next day', dailyRequests(db, NEXT_DAY, 'ok') === 1 && dailyRequests(db, NEXT_DAY, 'spend_cap_reached') === 1);
  check('ledger rows equal fetchImpl invocations', ledgerCount(db) === counter.calls && counter.calls === 2);
  await gw.close();
  await fake.close();
  db.close();

  // A timeout accrues the byte-based upper bound.
  const hang = await startFakeUpstream({ mode: 'hang' });
  const db2 = makeDb();
  const counter2 = countingFetch();
  const clock2 = makeClock();
  const config2 = makeConfig(hang.url, { JEV_DAILY_USD_CAP: '0.00001', JEV_UPSTREAM_TIMEOUT_MS: '200' });
  const gw2 = await startGateway({ db: db2, config: config2, fetchImpl: counter2.fetchImpl, now: clock2.now, log: makeLog().log });
  checkTyped('a timed-out attempt', await decide(gw2.port, baseRequest()), 504, 'timeout');
  checkTyped('the timeout still accrued spend', await decide(gw2.port, baseRequest()), 503, 'spend_cap_reached');
  const timeoutRow = ledgerRows(db2)[0];
  const timeoutDaily = dailyRow(db2, DAY, 'timeout');
  check('the timeout row has no cost (null, unavailable)', timeoutRow && timeoutRow.cost_usd === null && timeoutRow.cost_source === 'unavailable');
  check('its accrual is request_bytes x price / 1e6 (> 0)',
    timeoutRow && timeoutDaily && timeoutDaily.cap_accrued_usd > 0
      && near(timeoutDaily.cap_accrued_usd, timeoutRow.request_bytes * config2.inputUsdPerMtok / 1e6),
    JSON.stringify(timeoutDaily));
  check('ledger rows equal fetchImpl invocations', ledgerCount(db2) === counter2.calls && counter2.calls === 1);
  await gw2.close();
  await hang.close();
  db2.close();

  // usage.cost 0 also accrues the upper bound.
  const zero = await startFakeUpstream({ mode: 'ok-openrouter', usage: { input_tokens: 392, output_tokens: 65, cost: 0 } });
  const db3 = makeDb();
  const counter3 = countingFetch();
  const clock3 = makeClock();
  const config3 = makeConfig(zero.url, { JEV_MODEL: 'typesafe/jev-1.13', JEV_DAILY_USD_CAP: '0.00001' });
  const gw3 = await startGateway({ db: db3, config: config3, fetchImpl: counter3.fetchImpl, now: clock3.now, log: makeLog().log });
  const zeroRes = await decide(gw3.port, baseRequest());
  checkTyped('an upstream reporting usage.cost 0', zeroRes, 200, 'ok');
  check('the response reports the provider cost 0 as is', zeroRes.body && zeroRes.body.cost && zeroRes.body.cost.usd === 0
    && zeroRes.body.cost.source === 'provider');
  checkTyped('a zero-cost attempt still accrued spend', await decide(gw3.port, baseRequest()), 503, 'spend_cap_reached');
  const zeroRow = ledgerRows(db3)[0];
  const zeroDaily = dailyRow(db3, DAY, 'ok');
  check('its accrual is the byte upper bound, not 0',
    zeroRow && zeroDaily && zeroDaily.cap_accrued_usd > 0
      && near(zeroDaily.cap_accrued_usd, zeroRow.request_bytes * config3.inputUsdPerMtok / 1e6),
    JSON.stringify(zeroDaily));
  await gw3.close();
  await zero.close();
  db3.close();
}

async function spendSeedRetrySection() {
  console.log('\n--- a failed spend seed is retried, never cached as 0 (WR-06, D-06, Pitfall 9) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const real = makeDb();
  // A previous process already accrued past today's cap before a restart.
  real.prepare('INSERT INTO jev_daily (day_utc, outcome, requests, cap_accrued_usd) VALUES (?, ?, 1, ?)').run(DAY, 'ok', 0.001);
  // The ledger is briefly unreadable (a locked db, a migration) right after the restart.
  let failing = true;
  const fault = () => { throw new Error('database is locked'); };
  const flaky = {
    prepare(sql) { if (failing) fault(); return real.prepare(sql); },
    transaction(fn) { if (failing) fault(); return real.transaction(fn); },
    exec(sql) { if (failing) fault(); return real.exec(sql); },
  };
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  // One request's own accrual (392 tokens at the estimate price) stays well
  // under this cap, so only the retried seed can reach it.
  const config = makeConfig(fake.url, { JEV_DAILY_USD_CAP: '0.0001' });
  const gw = await startGateway({ db: flaky, config, fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });

  checkTyped('a request while the seed is unreadable is still served (a ledger failure never fails a decision)',
    await decide(gw.port, baseRequest()), 200, 'ok');
  check('precondition: that request alone accrued less than the cap',
    392 * config.inputUsdPerMtok / 1e6 < config.dailyUsdCap);
  check('the failed seed logged its fixed line', sink.lines.some((line) => line.text === '[jev] spend seed failed'),
    JSON.stringify(sink.lines.map((line) => line.text)));
  failing = false;
  checkTyped('once the ledger is readable the seed is retried and the earlier accrual caps the day',
    await decide(gw.port, baseRequest()), 503, 'spend_cap_reached');
  checkTyped('and the day stays capped', await decide(gw.port, baseRequest()), 503, 'spend_cap_reached');
  check('only the first request reached the upstream', counter.calls === 1 && fake.requests.length === 1,
    `${counter.calls} calls, ${fake.requests.length} upstream requests`);
  check('no log line holds the fault text', sink.lines.every((line) => !line.text.includes('database is locked')));

  await gw.close();
  await fake.close();
  real.close();
}

const UPSTREAM_CASES = [
  { name: 'HTTP 400', set: { mode: 'status', status: 400, errorBody: { error: { message: 'max_tokens_exceeded' } } }, reason: 'upstream_rejected', upstreamStatus: 400 },
  { name: 'HTTP 400 unknown model', set: { mode: 'status', status: 400, errorBody: { error: { message: 'The model jev-0.0.1 does not exist' } } }, reason: 'unavailable_model', upstreamStatus: 400 },
  { name: 'HTTP 404 retired model', set: { mode: 'status', status: 404, errorBody: { error: { message: 'model retired' } } }, reason: 'unavailable_model', upstreamStatus: 404 },
  { name: 'HTTP 401', set: { mode: 'status', status: 401 }, reason: 'auth_error', upstreamStatus: 401 },
  { name: 'HTTP 402', set: { mode: 'status', status: 402 }, reason: 'upstream_billing', upstreamStatus: 402 },
  { name: 'HTTP 403', set: { mode: 'status', status: 403 }, reason: 'auth_error', upstreamStatus: 403 },
  { name: 'HTTP 408', set: { mode: 'status', status: 408 }, reason: 'timeout', upstreamStatus: 408 },
  { name: 'HTTP 413', set: { mode: 'status', status: 413 }, reason: 'upstream_rejected', upstreamStatus: 413 },
  { name: 'HTTP 415', set: { mode: 'status', status: 415 }, reason: 'upstream_rejected', upstreamStatus: 415 },
  { name: 'HTTP 422', set: { mode: 'status', status: 422 }, reason: 'upstream_rejected', upstreamStatus: 422 },
  { name: 'HTTP 429', set: { mode: 'status', status: 429 }, reason: 'rate_limited', upstreamStatus: 429 },
  { name: 'HTTP 500', set: { mode: 'status', status: 500 }, reason: 'upstream_error', upstreamStatus: 500 },
  { name: 'HTTP 502', set: { mode: 'status', status: 502 }, reason: 'upstream_error', upstreamStatus: 502 },
  { name: 'HTTP 503', set: { mode: 'status', status: 503 }, reason: 'upstream_error', upstreamStatus: 503 },
  { name: 'HTTP 529', set: { mode: 'status', status: 529 }, reason: 'upstream_overloaded', upstreamStatus: 529 },
  { name: 'OpenRouter 200 with error code 502', set: { mode: 'error-200', errorCode: 502 }, reason: 'upstream_error', upstreamStatus: 200 },
  { name: 'OpenRouter 200 with error code 429', set: { mode: 'error-200', errorCode: 429 }, reason: 'rate_limited', upstreamStatus: 200 },
  { name: 'OpenRouter 200 with error code 402', set: { mode: 'error-200', errorCode: 402 }, reason: 'upstream_billing', upstreamStatus: 200 },
  { name: 'a non-JSON 200 body', set: { mode: 'garbage' }, reason: 'invalid_response', upstreamStatus: 200 },
  { name: 'answers missing every key', set: { mode: 'answersFn', answersFn: () => ({}) }, reason: 'invalid_response', upstreamStatus: 200 },
  { name: 'a hanging upstream', set: { mode: 'hang' }, reason: 'timeout', upstreamStatus: null },
];

const RESET = {
  mode: undefined, status: undefined, errorBody: undefined, errorCode: undefined, errorMessage: undefined,
  answersFn: undefined, model: undefined, usage: undefined, delayMs: undefined, top: undefined, noul: undefined, extra: undefined,
};

async function upstreamFallbackSection() {
  console.log('\n--- upstream fallbacks: 502 upstream-derived, 504 timeout (D-14, D-16) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const gw = await startGateway({
    db, config: makeConfig(fake.url, { JEV_UPSTREAM_TIMEOUT_MS: '300' }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log,
  });

  for (const testCase of UPSTREAM_CASES) {
    fake.setMode(Object.assign({}, RESET, testCase.set));
    const before = ledgerCount(db);
    const res = await decide(gw.port, baseRequest());
    const expected = CONTRACT.HTTP_STATUS_BY_REASON[testCase.reason];
    checkTyped(testCase.name, res, expected, testCase.reason);
    const rows = ledgerRows(db);
    const row = rows[rows.length - 1];
    check(`${testCase.name}: one '${testCase.reason}' row with upstream_status ${testCase.upstreamStatus}`,
      rows.length === before + 1 && row.outcome === testCase.reason && row.upstream_status === testCase.upstreamStatus,
      JSON.stringify(row));
  }

  fake.setMode(Object.assign({}, RESET, { mode: 'ok-openrouter' }));
  const openrouter = await decide(gw.port, baseRequest());
  checkTyped('an OpenRouter-style ok answer', openrouter, 200, 'ok');
  check("the response never contains OpenRouter's id or provider",
    !openrouter.text.includes(OPENROUTER_ID) && !openrouter.text.includes(OPENROUTER_PROVIDER));
  check('servedModel is the dated OpenRouter model', openrouter.body && openrouter.body.servedModel === OPENROUTER_MODEL);
  check('no response in this section contains the id, the provider or the credential',
    seen.every((entry) => !entry.text.includes(OPENROUTER_ID) && !entry.text.includes(OPENROUTER_PROVIDER) && !entry.text.includes(CREDENTIAL)));

  const logged = decisionLines(sink.lines);
  const rows = ledgerRows(db);
  check('ledger rows equal fetchImpl invocations', rows.length === counter.calls && counter.calls === UPSTREAM_CASES.length + 1,
    `${rows.length} rows, ${counter.calls} calls`);
  check('one log line per row, matched by decisionId and outcome',
    logged.length === rows.length && rows.every((row, i) => logged[i] && logged[i].decisionId === row.decision_id
      && logged[i].outcome === row.outcome));

  await gw.close();
  await fake.close();
  db.close();
}

async function servedModelEchoSection() {
  console.log('\n--- an upstream echoing the credential as its model: never in a body, a log line or a row (CR-01, D-22) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const gw = await startGateway({ db, config: makeConfig(fake.url), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });

  fake.setMode(Object.assign({}, RESET, { mode: 'ok-direct', model: CREDENTIAL }));
  const okEcho = await decide(gw.port, baseRequest());
  checkTyped('a valid answer whose model is the credential', okEcho, 502, 'invalid_response');
  check('its servedModel is null', okEcho.body !== null && okEcho.body.servedModel === null, okEcho.text.slice(0, 200));

  fake.setMode(Object.assign({}, RESET, {
    mode: 'error-200', errorBody: { model: CREDENTIAL, error: { code: 502, message: 'Provider returned error' } },
  }));
  const envelopeEcho = await decide(gw.port, baseRequest());
  checkTyped('an HTTP 200 error envelope whose model is the credential', envelopeEcho, 502, 'upstream_error');
  check('its servedModel is null', envelopeEcho.body !== null && envelopeEcho.body.servedModel === null);

  const rows = ledgerRows(db);
  check('one ledger row per attempt, each with a null served_model',
    rows.length === 2 && counter.calls === 2 && rows.every((row) => row.served_model === null), JSON.stringify(rows));
  check('no response body holds the credential', [okEcho, envelopeEcho].every((res) => !res.text.includes(CREDENTIAL)));
  check('no log line holds the credential', sink.lines.every((line) => !line.text.includes(CREDENTIAL)),
    JSON.stringify(sink.lines.map((line) => line.text)));
  check('no ledger or aggregate value holds the credential',
    !JSON.stringify(rows).includes(CREDENTIAL)
      && !JSON.stringify(db.prepare('SELECT * FROM jev_daily').all()).includes(CREDENTIAL));

  await gw.close();
  await fake.close();
  db.close();
}

async function calibratedSection() {
  console.log('\n--- calibrated and snapshot_changed profiles (D-25, D-28) ---');
  const fake = await startFakeUpstream({ mode: 'ok-openrouter' });
  const db = makeDb();
  const counter = countingFetch();
  const clock = makeClock();
  const config = makeConfig(fake.url, { JEV_MODEL: 'typesafe/jev-1.13' });
  const profile = {
    schemaVersion: 1,
    profileId: 'test-calibrated-v1',
    status: 'calibrated',
    note: 'synthetic test profile',
    model: 'typesafe/jev-1.13',
    snapshot: OPENROUTER_MODEL,
    instrumentVersion: INSTRUMENT_VERSION,
    instrumentHash: INSTRUMENT_HASH,
    thresholds: { operation: 0.5, target: 0.99, completion: 0.6, stuck: 0.4, risk: 0.7 },
  };
  const gw = await startGateway({ db, config, fetchImpl: counter.fetchImpl, now: clock.now, log: makeLog().log, profiles: [profile] });

  const res = await decide(gw.port, baseRequest());
  checkTyped('a calibrated profile for the configured pin and INSTRUMENT_HASH', res, 200, 'ok');
  if (res.body && res.body.ok) {
    const d = res.body.decisions;
    check("calibration is {status:'calibrated', profileId:'test-calibrated-v1'}",
      res.body.calibration.status === 'calibrated' && res.body.calibration.profileId === 'test-calibrated-v1');
    check('thresholds come from the profile', Object.keys(profile.thresholds).every((kind) => d[kind].threshold === profile.thresholds[kind]));
    const expected = {
      operation: d.operation.confidence >= 0.5,
      target: d.target.confidence >= 0.99,
      completion: d.completion.p <= 0.6,
      stuck: d.stuck.p >= 0.4,
      risk: d.risk.p >= 0.7,
    };
    check('meetsThreshold follows each threshold and its direction',
      Object.keys(expected).every((kind) => d[kind].meetsThreshold === expected[kind]), JSON.stringify(d));
    check('both outcomes occur (at least one met, one not met)',
      Object.values(expected).some(Boolean) && Object.values(expected).some((v) => !v));
  }
  check('the ledger row records calibrated', ledgerRows(db)[0] && ledgerRows(db)[0].calibration_status === 'calibrated');

  fake.setMode({ model: 'typesafe/jev-1.13-20261001' });
  const changed = await decide(gw.port, baseRequest());
  checkTyped('a served snapshot that differs from the profile', changed, 200, 'ok');
  check('calibration is snapshot_changed with every threshold null',
    changed.body && changed.body.calibration.status === 'snapshot_changed'
      && Object.values(changed.body.decisions).every((d) => d.threshold === null && d.meetsThreshold === false));
  check('ledger rows equal fetchImpl invocations', ledgerCount(db) === counter.calls && counter.calls === 2);

  await gw.close();
  await fake.close();
  db.close();
}

async function crashSection() {
  console.log('\n--- crash resistance (Pattern 2, Pitfalls 1-3) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const clock = makeClock();

  // fetchImpl throws synchronously: callUpstream calls it once, inside its own try/catch.
  const db = makeDb();
  const sink = makeLog();
  const throwing = countingFetch(() => { throw new Error(`sync fetch fault ${CREDENTIAL}`); });
  const gw = await startGateway({ db, config: makeConfig(fake.url), fetchImpl: throwing.fetchImpl, now: clock.now, log: sink.log });
  checkTyped('fetchImpl throwing synchronously', await decide(gw.port, baseRequest()), 502, 'upstream_error');
  checkTyped('and again (the server keeps serving)', await decide(gw.port, baseRequest()), 502, 'upstream_error');
  const rows = ledgerRows(db);
  check("one 'upstream_error' row per request, equal to fetchImpl invocations",
    rows.length === 2 && throwing.calls === 2 && rows.every((row) => row.outcome === 'upstream_error' && row.upstream_status === null),
    `${rows.length} rows, ${throwing.calls} calls`);
  check('one log line per row', decisionLines(sink.lines).length === 2);
  check('the fake upstream received nothing', fake.requests.length === 0);
  check('nothing logged holds the thrown message', sink.lines.every((line) => !line.text.includes('sync fetch fault')));
  await gw.close();
  db.close();

  // A db whose prepare throws, and a closed db: the decision still succeeds.
  const brokenDb = {
    prepare() { throw new Error('broken db prepare'); },
    transaction() { throw new Error('broken db transaction'); },
    exec() { throw new Error('broken db exec'); },
  };
  const brokenSink = makeLog();
  const brokenCounter = countingFetch();
  const brokenGw = await startGateway({ db: brokenDb, config: makeConfig(fake.url), fetchImpl: brokenCounter.fetchImpl, now: clock.now, log: brokenSink.log });
  checkTyped('a db whose prepare throws', await decide(brokenGw.port, baseRequest()), 200, 'ok');
  checkTyped('the next request is served', await decide(brokenGw.port, baseRequest()), 200, 'ok');
  checkTyped('a refusal on the broken db is still typed', await decide(brokenGw.port, { v: 2 }), 400, 'invalid_request');
  check('the failures are fixed-string log lines',
    brokenSink.lines.some((line) => line.text === '[jev] ledger write failed')
      && brokenSink.lines.every((line) => !line.text.includes('broken db')),
    JSON.stringify(brokenSink.lines.map((line) => line.text)));
  check('a decision line is still logged for each attempt', decisionLines(brokenSink.lines).length === 2);
  await brokenGw.close();

  const closedDb = makeDb();
  closedDb.close();
  const closedGw = await startGateway({ db: closedDb, config: makeConfig(fake.url), fetchImpl: countingFetch().fetchImpl, now: clock.now, log: makeLog().log });
  checkTyped('a closed db', await decide(closedGw.port, baseRequest()), 200, 'ok');
  checkTyped('the next request on the closed db is served', await decide(closedGw.port, baseRequest()), 200, 'ok');
  await closedGw.close();

  // randomUUID throws right after the slot is acquired: nothing was spent.
  const uuidDb = makeDb();
  const uuidSink = makeLog();
  const uuidCounter = countingFetch();
  let uuidCalls = 0;
  const randomUUID = () => {
    uuidCalls += 1;
    if (uuidCalls === 1) throw new Error('uuid fault');
    return crypto.randomUUID();
  };
  const fakeBefore = fake.requests.length;
  const uuidGw = await startGateway({
    db: uuidDb, config: makeConfig(fake.url, { JEV_MAX_CONCURRENCY: '1' }), fetchImpl: uuidCounter.fetchImpl, now: clock.now, log: uuidSink.log, randomUUID,
  });
  checkTyped('randomUUID throwing right after acquisition', await decide(uuidGw.port, baseRequest()), 500, 'server_error');
  check('the fake upstream received nothing and fetchImpl was not called',
    fake.requests.length === fakeBefore && uuidCounter.calls === 0);
  check('jev_decisions gained no row', ledgerCount(uuidDb) === 0);
  check("only the (day, 'server_error') counter rose", dailyRequests(uuidDb, DAY, 'server_error') === 1 && dailyTotal(uuidDb) === 1);
  check('no log line for a pre-upstream fault', uuidSink.lines.length === 0, JSON.stringify(uuidSink.lines));
  checkTyped('the next request is served (the single slot was released)', await decide(uuidGw.port, baseRequest()), 200, 'ok');
  check('ledger rows equal fetchImpl invocations', ledgerCount(uuidDb) === uuidCounter.calls && uuidCounter.calls === 1);
  await uuidGw.close();
  uuidDb.close();
  await fake.close();
}

async function postUpstreamFaultSection() {
  console.log('\n--- post-upstream fault: one server_error row carrying the accrual (Pitfall 9) ---');
  const fake = await startFakeUpstream({ mode: 'ok-openrouter', usage: { input_tokens: 392, output_tokens: 65, cost: 0.00002 } });
  const db = makeDb();
  const sink = makeLog();
  const counter = countingFetch();
  const clock = makeClock();
  const config = makeConfig(fake.url, { JEV_MODEL: 'typesafe/jev-1.13', JEV_DAILY_USD_CAP: '0.00001' });
  const profiles = new Proxy([], { get() { throw new Error('profiles fault'); } });
  const gw = await startGateway({ db, config, fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log, profiles });

  checkTyped('selectProfile throwing after callUpstream', await decide(gw.port, baseRequest()), 500, 'server_error');
  check('the fake upstream received exactly one request', fake.requests.length === 1 && counter.calls === 1);
  const rows = ledgerRows(db);
  const row = rows[0];
  check("exactly one row: outcome 'server_error', the served model and cost_usd 0.00002",
    rows.length === 1 && row.outcome === 'server_error' && row.served_model === OPENROUTER_MODEL && near(row.cost_usd, 0.00002)
      && row.cost_source === 'provider' && row.calibration_status === null && row.instrument_version === INSTRUMENT_VERSION
      && row.upstream_status === 200 && row.input_tokens === 392,
    JSON.stringify(rows));
  const logged = decisionLines(sink.lines);
  check('exactly one log line, whose decisionId is the row\'s decision_id',
    sink.lines.length === 1 && logged.length === 1 && logged[0] && row && logged[0].decisionId === row.decision_id
      && logged[0].outcome === 'server_error',
    JSON.stringify(sink.lines));
  check('todaySpendUsd holds the attempt\'s accrual', near(todaySpendUsd(db, DAY), 0.00002), String(todaySpendUsd(db, DAY)));
  checkTyped('the in-memory ceiling saw the accrual too', await decide(gw.port, baseRequest()), 503, 'spend_cap_reached');
  await gw.close();

  // Restart on the same UTC day: a fresh router reseeds from the ledger.
  const restarted = await startGateway({ db, config, fetchImpl: counter.fetchImpl, now: clock.now, log: makeLog().log });
  checkTyped('a restarted router on the same day answers its first request', await decide(restarted.port, baseRequest()), 503, 'spend_cap_reached');
  check('and makes no upstream call', fake.requests.length === 1 && counter.calls === 1);
  check('ledger rows equal fetchImpl invocations', ledgerCount(db) === counter.calls);
  await restarted.close();
  await fake.close();
  db.close();
}

async function branchCSection() {
  console.log('\n--- a fault after the attempt was recorded (outer catch, branch c) ---');
  const fake = await startFakeUpstream({ mode: 'ok-direct' });
  const clock = makeClock();
  for (const mode of ['after-send', 'before-send']) {
    const db = makeDb();
    const sink = makeLog();
    const counter = countingFetch();
    const gw = await startGateway({
      db, config: makeConfig(fake.url, { JEV_MAX_CONCURRENCY: '1' }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log,
    }, { faultMiddleware: true });
    const before = unhandledRejections;
    const res = await decide(gw.port, baseRequest(), { 'X-Test-Fault': mode });
    if (mode === 'after-send') {
      checkTyped(`${mode}: the client receives one complete ok body`, res, 200, 'ok');
    } else {
      checkTyped(`${mode}: the client receives a typed server_error`, res, 500, 'server_error');
    }
    const rows = ledgerRows(db);
    check(`${mode}: exactly one 'ok' row`, rows.length === 1 && rows[0].outcome === 'ok', JSON.stringify(rows.map((r) => r.outcome)));
    check(`${mode}: the (day, server_error) counter did not change`, dailyRequests(db, DAY, 'server_error') === 0);
    check(`${mode}: exactly one log line`, sink.lines.length === 1 && decisionLines(sink.lines).length === 1, JSON.stringify(sink.lines));
    await sleep(20);
    check(`${mode}: no unhandled rejection`, unhandledRejections === before);
    check(`${mode}: the generic handler was never hit`, genericHandlerHit === false);
    checkTyped(`${mode}: the next request is served (slot released once)`, await decide(gw.port, baseRequest()), 200, 'ok');
    check(`${mode}: ledger rows equal fetchImpl invocations`, ledgerCount(db) === counter.calls && counter.calls === 2);
    await gw.close();
    db.close();
  }
  await fake.close();
}

async function writeBoundSection() {
  console.log('\n--- write bound: refusals add no ledger row and no log line (Pitfall 13) ---');
  const db = makeDb();
  const sink = makeLog();
  const clock = makeClock();
  const okFake = await startFakeUpstream({ mode: 'ok-openrouter', usage: { input_tokens: 392, output_tokens: 65, cost: 0.00002 } });
  const hangFake = await startFakeUpstream({ mode: 'hang' });
  const counter = countingFetch();

  async function batch(label, outcome, count, run) {
    const rowsBefore = ledgerCount(db);
    const linesBefore = sink.lines.length;
    const outcomeBefore = dailyRequests(db, DAY, outcome);
    const totalBefore = dailyTotal(db);
    let typed = 0;
    for (let i = 0; i < count; i += 1) {
      const res = await run(i);
      if (res.body && res.body.ok === false && res.body.fallback === outcome) typed += 1;
    }
    check(`${label}: ${count} typed '${outcome}' refusals`, typed === count, `${typed}/${count}`);
    check(`${label}: no ledger row and no log line`, ledgerCount(db) === rowsBefore && sink.lines.length === linesBefore,
      `${ledgerCount(db) - rowsBefore} rows, ${sink.lines.length - linesBefore} lines`);
    check(`${label}: only the (day, ${outcome}) counter rose, by ${count}`,
      dailyRequests(db, DAY, outcome) === outcomeBefore + count && dailyTotal(db) === totalBefore + count);
  }

  const main = await startGateway({ db, config: makeConfig(okFake.url, { JEV_MODEL: 'typesafe/jev-1.13' }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });
  await batch('invalid_request x12', 'invalid_request', 12, (i) => {
    const request = baseRequest();
    request[`extra${i}`] = true;
    return decide(main.port, request);
  });
  await batch('sensitive_goal x12', 'sensitive_goal', 12, (i) => {
    const request = baseRequest();
    request.goal = `Use key sk-abcdefghij01234567${String(i).padStart(2, '0')} to save`;
    return decide(main.port, request);
  });

  const tight = await startGateway({ db, config: makeConfig(okFake.url), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log, upstreamByteBudget: 400 });
  await batch('budget payload_too_large x12', 'payload_too_large', 12, () => decide(tight.port, baseRequest()));

  const capped = await startGateway({
    db, config: makeConfig(okFake.url, { JEV_MODEL: 'typesafe/jev-1.13', JEV_DAILY_USD_CAP: '0.00001' }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log,
  });
  checkTyped('priming request that reaches the ceiling', await decide(capped.port, baseRequest()), 200, 'ok');
  await batch('spend_cap_reached x12', 'spend_cap_reached', 12, () => decide(capped.port, baseRequest()));

  const narrow = await startGateway({
    db, config: makeConfig(hangFake.url, { JEV_MAX_CONCURRENCY: '2', JEV_UPSTREAM_TIMEOUT_MS: '1500' }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log,
  });
  const holders = [decide(narrow.port, baseRequest()), decide(narrow.port, baseRequest())];
  check('two hanging requests hold both slots', await waitFor(() => hangFake.requests.length === 2), String(hangFake.requests.length));
  await batch('busy x12', 'busy', 12, () => decide(narrow.port, baseRequest()));
  const held = await Promise.all(holders);
  check('the two holders time out afterwards', held.every((res) => res.status === 504));

  const disabled = await startGateway({ db, config: loadJevConfig({}, { log: silentLog }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log });
  await batch('disabled', 'disabled', 1, () => decide(disabled.port, baseRequest()));
  const notConfigured = await startGateway({
    db, config: loadJevConfig({ JEV_ENABLED: '1' }, { log: silentLog }), fetchImpl: counter.fetchImpl, now: clock.now, log: sink.log,
  });
  await batch('not_configured', 'not_configured', 1, () => decide(notConfigured.port, baseRequest()));
  await batch('malformed JSON', 'invalid_request', 1, () => send(main.port, { raw: '{"v":' }));
  await batch('oversize body', 'payload_too_large', 1, () => {
    const request = baseRequest();
    request.page.text = 'y'.repeat(60 * 1024);
    return decide(main.port, request);
  });
  await batch('404 GET', 'invalid_request', 1, () => send(main.port, { method: 'GET' }));
  await batch('404 POST /api/jev/other', 'invalid_request', 1, () => send(main.port, { path: '/api/jev/other', body: baseRequest() }));

  const duplicates = db.prepare('SELECT day_utc, outcome, COUNT(*) AS n FROM jev_daily GROUP BY day_utc, outcome HAVING n > 1').all();
  check('jev_daily never holds more than one row per (day, outcome)', duplicates.length === 0, JSON.stringify(duplicates));
  check('ledger rows equal fetchImpl invocations (1 ok + 2 timeouts)', ledgerCount(db) === counter.calls && counter.calls === 3,
    `${ledgerCount(db)} rows, ${counter.calls} calls`);

  for (const gw of [main, tight, capped, narrow, disabled, notConfigured]) await gw.close();
  await okFake.close();
  await hangFake.close();
  db.close();
}

function paritySection() {
  console.log('\n--- producer/validator parity: every body passes FsbJevState.validateGatewayResponse ---');
  const failures = [];
  for (const entry of seen) {
    const verdict = entry.body === null ? { ok: false } : FsbJevState.validateGatewayResponse(entry.body, entry.request);
    if (!verdict.ok) failures.push(entry.text.slice(0, 160));
  }
  check(`all ${seen.length} response bodies pass the extension validator`, seen.length > 0 && failures.length === 0,
    failures.slice(0, 3).join(' | '));
}

async function main() {
  console.log('--- jev-gateway-router (JEV-01, JEV-02, JEV-03, JEV-04, JEV-07) ---');
  check('showcase/server/src/routes/jev.js exports createJevRouter',
    typeof createJevRouter === 'function' && createJevRouter.createJevRouter === createJevRouter);
  if (typeof createJevRouter !== 'function') return;

  await configGateSection();
  await openRouteSection();
  await validationSection();
  await budgetSection();
  await concurrencySection();
  await spendSection();
  await spendSeedRetrySection();
  await upstreamFallbackSection();
  await servedModelEchoSection();
  await calibratedSection();
  await crashSection();
  await postUpstreamFaultSection();
  await branchCSection();
  await writeBoundSection();
  paritySection();

  await sleep(20);
  console.log('\n--- process health ---');
  check('no unhandled rejection in the whole suite', unhandledRejections === 0, String(unhandledRejections));
  check('the trailing generic error handler was never hit', genericHandlerHit === false);
}

const suiteStarted = Date.now();
setTimeout(() => {
  console.log(`  FAIL: suite watchdog fired after ${SUITE_WATCHDOG_MS} ms`);
  console.log(`\n=== jev-gateway-router results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
}, SUITE_WATCHDOG_MS).unref();
main()
  .catch((error) => {
    failed += 1;
    console.log(`  FAIL: suite crashed -- ${error && error.name}: ${error && error.message}`);
  })
  .then(async () => {
    for (const handle of openServers) {
      try { await handle.close(); } catch (_e) { /* already closed */ }
    }
    console.log(`\n=== jev-gateway-router results: ${passed} passed, ${failed} failed (${Date.now() - suiteStarted} ms) ===`);
    process.exit(failed > 0 ? 1 : 0);
  });
