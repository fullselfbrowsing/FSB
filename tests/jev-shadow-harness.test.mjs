// Phase 67 Jev shadow harness (JEV-05, JEV-02; D-26, D-27, D-28; T-67-01,
// T-67-04, T-67-09, T-67-12).
//
// The harness sends every labelled record through FSB's own gateway with the
// real FsbJevClient, never to an upstream. Offline it runs end to end against
// the in-process router (showcase/server/src/routes/jev.js) mounted on
// 127.0.0.1:0 in front of the loopback fake upstream, which answers from the
// committed recorded answers (scripts/bench/shadow/answers/fake-upstream.json).
// This file proves:
//   - recorded answers expand into raw upstream answers the server accepts;
//   - the offline run writes body-free rows and a report keyed by the served
//     model and the local instrument, and the seed set selects nothing;
//   - the run is refused on an instrument mismatch or mixed served models;
//   - one request in flight, no retries, and no credential from the harness;
//   - a fit selection becomes a profile the server validates, loads, selects
//     and applies with meetsThreshold flipping exactly at the threshold;
//   - the V2 smoke command sends one fixed benign request and prints one
//     body-free JSON line;
//   - neither script names an upstream, a credential or an auth header.
//
// Never calls Jev, binds only port 0 on 127.0.0.1 and never mutates process.env.
// Outputs go to fresh temp directories only.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadRecords, SHADOW_RECORDS_ROOT } from '../scripts/bench/shadow/lib/records.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'showcase', 'server');
const SERVER_NM = path.join(SERVER, 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(SERVER, 'src', 'db', 'schema'));
const { createGlobalJsonParser } = require(path.join(SERVER, 'src', 'middleware', 'global-json-parser'));
const { loadJevConfig } = require(path.join(SERVER, 'src', 'jev', 'config'));
const { INSTRUMENT_VERSION, INSTRUMENT_HASH, buildUpstreamBody } = require(path.join(SERVER, 'src', 'jev', 'instrument'));
const { validateAnswers } = require(path.join(SERVER, 'src', 'jev', 'upstream'));
const { canonicalJson, sha256Hex } = require(path.join(SERVER, 'src', 'jev', 'canonical-json'));
const {
  validateProfile,
  applyCalibration,
  loadProfiles,
  selectProfile,
} = require(path.join(SERVER, 'src', 'jev', 'calibration'));
const serverValidator = require(path.join(SERVER, 'src', 'jev', 'validator'));
const createJevRouter = require(path.join(SERVER, 'src', 'routes', 'jev'));
const { startFakeUpstream, OPENROUTER_MODEL } = require('./fixtures/jev-fake-upstream.js');
const FsbJevState = require(path.join(ROOT, 'extension', 'ai', 'jev-state.js'));

const KINDS = ['operation', 'target', 'completion', 'stuck', 'risk'];
const CHOICE_KINDS = ['operation', 'target'];
const PIN = 'typesafe/jev-1.13';
const SERVED = 'typesafe/jev-1.13-20260917';
const CREDENTIAL = 'sk-test-SHADOW-0123456789abcdef';
const RUN_SHADOW = 'scripts/bench/shadow/run-shadow.mjs';
const RECORDED_ANSWERS = 'scripts/bench/shadow/lib/recorded-answers.mjs';
const SMOKE = 'scripts/bench/shadow/gateway-smoke.mjs';
const SMOKE_KEYS = ['ok', 'fallback', 'servedModel', 'instrumentVersion', 'calibrationStatus', 'usageSource', 'costSource',
  'latencyMs'];
const PROFILE_KEYS = ['schemaVersion', 'profileId', 'status', 'note', 'model', 'snapshot', 'instrumentVersion',
  'instrumentHash', 'thresholds'];
const ANSWERS_FILE = path.join(ROOT, 'scripts', 'bench', 'shadow', 'answers', 'fake-upstream.json');
const ROW_KEYS = ['recordId', 'taskId', 'kind', 'label', 'decision', 'fallback'];
const REPORT_KEYS = ['runId', 'servedModel', 'instrumentVersion', 'instrumentHash', 'counts', 'scores', 'selection',
  'candidateProfile'];
const RISK_POSITIVE = ['shadow-confirm-modals-02', 'shadow-confirm-modals-03', 'shadow-settings-change-02',
  'shadow-wizard-submit-02'];

const RECORDS = loadRecords();
const silentLog = { log() {}, info() {}, warn() {}, error() {}, debug() {} };

// Modules under test load lazily, so a missing module fails only its own tests.
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

function tempDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fsb-jev-shadow-${tag}-`));
}

function captureLog() {
  const out = [];
  const err = [];
  return {
    out,
    err,
    log: { log: (line) => out.push(String(line)), error: (line) => err.push(String(line)) },
  };
}

/** Wrap a fetch so every harness request is seen: its headers and how many are in flight. */
function spyFetch(inner) {
  const spy = { calls: [], inFlight: 0, maxInFlight: 0 };
  spy.fetchImpl = async (url, init) => {
    spy.calls.push({ url: String(url), headers: { ...((init && init.headers) || {}) }, body: init && init.body });
    spy.inFlight += 1;
    if (spy.inFlight > spy.maxInFlight) spy.maxInFlight = spy.inFlight;
    try {
      return await inner(url, init);
    } finally {
      spy.inFlight -= 1;
    }
  };
  return spy;
}

/** A valid D-15 ok body for `request`, as a gateway would send it. */
function stubOkBody(request, { servedModel = SERVED, instrumentVersion = INSTRUMENT_VERSION } = {}) {
  const decisions = {};
  for (const kind of request.kinds) {
    decisions[kind] = CHOICE_KINDS.includes(kind)
      ? { choice: 'none_of_the_above', confidence: 1, probabilities: { none_of_the_above: 1 }, threshold: null, meetsThreshold: false }
      : { p: 0.5, threshold: null, meetsThreshold: false };
  }
  return {
    ok: true,
    decisionId: 'stub-decision',
    instrumentVersion,
    servedModel,
    calibration: { status: 'uncalibrated', profileId: 'uncalibrated-v1' },
    decisions,
    usage: { inputTokens: null, source: 'unavailable' },
    cost: { usd: null, source: 'unavailable' },
    latencyMs: 1,
  };
}

/** A fetch that never touches the network and answers every POST with bodyFor(request, callIndex). */
function stubFetch(bodyFor) {
  let index = 0;
  return async (_url, init) => {
    const request = JSON.parse(init.body);
    const body = bodyFor(request, index);
    index += 1;
    return { status: 200, text: async () => JSON.stringify(body) };
  };
}

// ---------------------------------------------------------------------------
// The in-process gateway (production middleware order, as in
// tests/jev-gateway-router.test.js)
// ---------------------------------------------------------------------------

const openServers = [];
const openUpstreams = [];
const openDbs = [];

async function startGateway(routerOptions) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(createGlobalJsonParser());
  app.use('/api/jev', createJevRouter(routerOptions));
  app.use((_err, _req, res, _next) => {
    res.status(500).json({ error: 'generic handler' });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const handle = {
    url: `http://127.0.0.1:${server.address().port}/api/jev/decide`,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }),
  };
  openServers.push(handle);
  return handle;
}

function makeDb() {
  const db = new Database(':memory:');
  initializeDatabase(db);
  openDbs.push(db);
  return db;
}

function enabledConfig(upstreamUrl) {
  return loadJevConfig({
    JEV_ENABLED: 'true',
    JEV_UPSTREAM_URL: upstreamUrl,
    JEV_MODEL: PIN,
    JEV_API_KEY: CREDENTIAL,
    JEV_MAX_CONCURRENCY: '4',
    JEV_UPSTREAM_TIMEOUT_MS: '2000',
    JEV_DAILY_USD_CAP: '5',
  }, { log: silentLog });
}

let recordedUpstream = null;
let recordedGateway = null;
let disabledGateway = null;

before(async () => {
  const answers = await load(RECORDED_ANSWERS);
  const recorded = answers.loadRecordedAnswers(ANSWERS_FILE);
  const lookup = answers.buildAnswerLookup(RECORDS, recorded, { model: PIN });
  recordedUpstream = await startFakeUpstream({
    mode: 'answersFn',
    model: recorded.servedModel,
    answersFn: (body) => answers.answersForBody(lookup, body) || {},
  });
  recordedGateway = await startGateway({
    db: makeDb(),
    config: enabledConfig(recordedUpstream.url),
    fetchImpl: (...args) => globalThis.fetch(...args),
    log: silentLog,
  });
  disabledGateway = await startGateway({
    db: makeDb(),
    config: loadJevConfig({}, { log: silentLog }),
    fetchImpl: () => { throw new Error('a disabled gateway must never call upstream'); },
    log: silentLog,
  });
});

after(async () => {
  for (const server of openServers) await server.close();
  if (recordedUpstream) await recordedUpstream.close();
  for (const upstream of openUpstreams) await upstream.close();
  for (const db of openDbs) {
    try { db.close(); } catch { /* already closed */ }
  }
});

// ---------------------------------------------------------------------------
// Recorded answers
// ---------------------------------------------------------------------------

const choiceQuestion = (keys) => ({
  type: 'choice',
  instructions: { question: 'q', rules: [] },
  criteria: Object.fromEntries(keys.map((key) => [key, `${key} criterion`])),
});
const noulQuestion = { type: 'noul', instructions: { question: 'q', rules: [] } };

test('expandAnswer gives the pick top, splits the rest evenly and derives the confidence', async () => {
  const { expandAnswer } = await load(RECORDED_ANSWERS);
  const answer = expandAnswer(choiceQuestion(['click', 'scroll', 'none_of_the_above']), { pick: 'click', top: 0.7 });
  assert.deepEqual(Object.keys(answer), ['type', 'choice', 'confidence', 'probabilities']);
  assert.equal(answer.type, 'choice');
  assert.equal(answer.choice, 'click');
  assert.deepEqual(Object.keys(answer.probabilities), ['click', 'scroll', 'none_of_the_above']);
  assert.equal(answer.probabilities.click, 0.7);
  assert.ok(Math.abs(answer.probabilities.scroll - 0.15) < 1e-12);
  assert.ok(Math.abs(answer.probabilities.none_of_the_above - 0.15) < 1e-12);
  assert.ok(Math.abs(answer.confidence - 0.55) < 1e-12, `confidence ${answer.confidence}`);

  const two = expandAnswer(choiceQuestion(['click', 'none_of_the_above']), { pick: 'none_of_the_above', top: 0.9 });
  assert.equal(two.choice, 'none_of_the_above');
  assert.ok(Math.abs(two.confidence - 0.8) < 1e-12);

  // top exactly 1/n is a tie for the maximum: allowed, confidence 0.
  const tie = expandAnswer(choiceQuestion(['a', 'b', 'c', 'd']), { pick: 'c', top: 0.25 });
  assert.equal(tie.confidence, 0);
  // top 1 gives confidence 1 and zero elsewhere.
  const sure = expandAnswer(choiceQuestion(['a', 'b']), { pick: 'b', top: 1 });
  assert.equal(sure.confidence, 1);
  assert.equal(sure.probabilities.a, 0);

  assert.deepEqual(expandAnswer(noulQuestion, { p: 0.2 }), { type: 'noul', noul: 0.2 });
  assert.deepEqual(expandAnswer(noulQuestion, { p: 0 }), { type: 'noul', noul: 0 });
});

test('expandAnswer throws on a pick that is not offered, a top below 1/n or a mismatched shape', async () => {
  const { expandAnswer } = await load(RECORDED_ANSWERS);
  const q = choiceQuestion(['click', 'scroll', 'none_of_the_above']);
  assert.throws(() => expandAnswer(q, { pick: 'hover', top: 0.9 }), /not offered/);
  assert.throws(() => expandAnswer(q, { pick: 'click', top: 0.3 }), /1\/n/);
  assert.throws(() => expandAnswer(q, { pick: 'click', top: 1.2 }));
  assert.throws(() => expandAnswer(q, { pick: 'click', top: Number.NaN }));
  assert.throws(() => expandAnswer(q, { p: 0.4 }));
  assert.throws(() => expandAnswer(noulQuestion, { pick: 'click', top: 0.9 }));
  assert.throws(() => expandAnswer(noulQuestion, { p: 1.5 }));
  assert.throws(() => expandAnswer(noulQuestion, { p: -0.1 }));
  assert.throws(() => expandAnswer(null, { p: 0.4 }));
  assert.throws(() => expandAnswer({ type: 'other' }, { p: 0.4 }));
  assert.throws(() => expandAnswer(choiceQuestion([]), { pick: 'click', top: 1 }));
});

test('stateKey is the SHA-256 of the canonical JSON of the state', async () => {
  const { stateKey } = await load(RECORDED_ANSWERS);
  const state = { goal: 'g', page: { origin: 'https://example.test', path: '/' }, elements: [] };
  assert.equal(stateKey(state), sha256Hex(canonicalJson(state)));
  assert.equal(stateKey({ elements: [], page: { path: '/', origin: 'https://example.test' }, goal: 'g' }), stateKey(state));
  assert.notEqual(stateKey({ ...state, goal: 'h' }), stateKey(state));
  assert.match(stateKey(state), /^[0-9a-f]{64}$/);
});

test('the committed recorded answers cover exactly the seed records and their kinds', async () => {
  const { loadRecordedAnswers } = await load(RECORDED_ANSWERS);
  const recorded = loadRecordedAnswers(ANSWERS_FILE);
  assert.ok(Object.isFrozen(recorded) && Object.isFrozen(recorded.answers));
  assert.deepEqual(Object.keys(recorded), ['schemaVersion', 'note', 'servedModel', 'answers']);
  assert.equal(recorded.schemaVersion, 1);
  assert.equal(recorded.servedModel, SERVED);
  assert.ok(recorded.note.length > 0);
  assert.equal(RECORDS.length, 25);
  assert.deepEqual(Object.keys(recorded.answers).sort(), RECORDS.map((r) => r.id).sort());
  for (const record of RECORDS) {
    assert.deepEqual(Object.keys(recorded.answers[record.id]).sort(), [...record.request.kinds].sort(), record.id);
  }

  // Plausible, not perfect: mostly right, a few wrong picks, the risk positives flagged high.
  let choices = 0;
  let wrong = 0;
  for (const record of RECORDS) {
    const entry = recorded.answers[record.id];
    for (const kind of CHOICE_KINDS) {
      if (!entry[kind]) continue;
      choices += 1;
      if (entry[kind].pick !== record.labels[kind]) wrong += 1;
    }
    if (entry.risk) {
      if (RISK_POSITIVE.includes(record.id)) assert.ok(entry.risk.p >= 0.7, `${record.id} risk p ${entry.risk.p}`);
      else assert.ok(entry.risk.p < 0.5, `${record.id} risk p ${entry.risk.p}`);
    }
  }
  assert.ok(wrong >= 2, `wrong picks ${wrong}`);
  assert.ok(wrong <= Math.floor(choices / 5), `wrong picks ${wrong} of ${choices}`);
});

test('loadRecordedAnswers rejects malformed files with one aggregated error', async () => {
  const { loadRecordedAnswers } = await load(RECORDED_ANSWERS);
  const dir = tempDir('answers');
  const good = { schemaVersion: 1, note: 'n', servedModel: SERVED, answers: { 'shadow-x-01': { risk: { p: 0.5 } } } };
  const write = (name, value) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
    return file;
  };
  assert.equal(loadRecordedAnswers(write('good.json', good)).answers['shadow-x-01'].risk.p, 0.5);
  const bad = {
    'not-json.json': '{',
    'extra-key.json': { ...good, extra: 1 },
    'version.json': { ...good, schemaVersion: 2 },
    'no-model.json': { ...good, servedModel: '' },
    'bad-id.json': { ...good, answers: { '../x': { risk: { p: 0.5 } } } },
    'unknown-kind.json': { ...good, answers: { 'shadow-x-01': { bogus: { p: 0.5 } } } },
    'empty-entry.json': { ...good, answers: { 'shadow-x-01': {} } },
    'choice-shape.json': { ...good, answers: { 'shadow-x-01': { operation: { pick: 'click' } } } },
    'choice-extra.json': { ...good, answers: { 'shadow-x-01': { operation: { pick: 'click', top: 0.9, p: 1 } } } },
    'noul-range.json': { ...good, answers: { 'shadow-x-01': { stuck: { p: 2 } } } },
    'proto.json': '{"schemaVersion":1,"note":"n","servedModel":"m","answers":{"__proto__":{"risk":{"p":0.5}}}}',
  };
  for (const [name, value] of Object.entries(bad)) {
    assert.throws(() => loadRecordedAnswers(write(name, value)), /recorded answers/, name);
  }
});

test('every recorded answer expands into raw upstream answers the server validateAnswers accepts', async () => {
  const { loadRecordedAnswers, expandAnswer } = await load(RECORDED_ANSWERS);
  const recorded = loadRecordedAnswers(ANSWERS_FILE);
  for (const record of RECORDS) {
    const built = buildUpstreamBody(record.request, { model: PIN });
    assert.equal(built.ok, true, record.id);
    const answers = {};
    for (const kind of Object.keys(built.body.questions)) {
      answers[kind] = expandAnswer(built.body.questions[kind], recorded.answers[record.id][kind]);
    }
    const verdict = validateAnswers(built.body.questions, { model: SERVED, answers });
    assert.equal(verdict.ok, true, record.id);
    assert.deepEqual(Object.keys(verdict.answers).sort(), [...record.request.kinds].sort(), record.id);
  }
});

test('buildAnswerLookup keys each record by its upstream state and fails loud on gaps', async () => {
  const { loadRecordedAnswers, buildAnswerLookup, stateKey, answersForBody } = await load(RECORDED_ANSWERS);
  const recorded = loadRecordedAnswers(ANSWERS_FILE);
  const lookup = buildAnswerLookup(RECORDS, recorded, { model: PIN });
  assert.ok(lookup instanceof Map);
  assert.equal(lookup.size, RECORDS.length);
  for (const record of RECORDS) {
    const { body } = buildUpstreamBody(record.request, { model: PIN });
    assert.equal(lookup.get(stateKey(body.state)), recorded.answers[record.id], record.id);
    const raw = answersForBody(lookup, body);
    assert.equal(validateAnswers(body.questions, { model: SERVED, answers: raw }).ok, true, record.id);
  }
  assert.equal(answersForBody(lookup, { state: { goal: 'unknown' }, questions: {} }), null);
  assert.equal(answersForBody(lookup, null), null);

  const missing = { ...recorded, answers: { ...recorded.answers } };
  delete missing.answers[RECORDS[0].id];
  assert.throws(() => buildAnswerLookup(RECORDS, missing, { model: PIN }), /no recorded answer/);

  const extraKind = { ...recorded, answers: { ...recorded.answers, [RECORDS[0].id]: { ...recorded.answers[RECORDS[0].id], risk: { p: 0.1 } } } };
  assert.throws(() => buildAnswerLookup(RECORDS, extraKind, { model: PIN }), /kinds/);

  const badPick = { ...recorded, answers: { ...recorded.answers, 'shadow-confirm-modals-02': { operation: { pick: 'hover', top: 0.9 }, target: { pick: 'e0', top: 0.9 }, risk: { p: 0.9 } } } };
  assert.throws(() => buildAnswerLookup(RECORDS, badPick, { model: PIN }), /not offered/);

  assert.throws(() => buildAnswerLookup([RECORDS[0], RECORDS[0]], recorded, { model: PIN }), /same upstream state/);
});

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

test('parseArgs takes both flag forms, resolves defaults and requires a gateway URL', async () => {
  const { parseArgs } = await load(RUN_SHADOW);
  const now = () => Date.UTC(2026, 9, 17, 6, 30, 5, 123);
  const a = parseArgs(['--gateway', 'https://full-selfbrowsing.com/api/jev/decide'], { now });
  assert.equal(a.ok, true, JSON.stringify(a.errors));
  assert.equal(a.options.gateway, 'https://full-selfbrowsing.com/api/jev/decide');
  assert.equal(a.options.records, SHADOW_RECORDS_ROOT);
  assert.equal(a.options.targets, path.join(ROOT, 'scripts', 'bench', 'shadow', 'targets.json'));
  assert.equal(a.options.out, path.join(ROOT, 'scripts', 'bench', '.local', 'shadow'));
  assert.equal(a.options.runId, 'shadow-2026-10-17T06-30-05-123Z');
  assert.equal(a.options.limit, null);
  assert.equal(a.options.pin, null);

  const b = parseArgs([
    '--gateway=http://127.0.0.1:4321/api/jev/decide', '--records=/tmp/r', '--targets', '/tmp/t.json',
    '--out', '/tmp/o', '--run-id=run-1', '--limit', '5', '--pin=typesafe/jev-1.13',
  ]);
  assert.equal(b.ok, true, JSON.stringify(b.errors));
  assert.deepEqual(b.options, {
    gateway: 'http://127.0.0.1:4321/api/jev/decide',
    records: path.resolve('/tmp/r'),
    targets: path.resolve('/tmp/t.json'),
    out: path.resolve('/tmp/o'),
    runId: 'run-1',
    limit: 5,
    pin: 'typesafe/jev-1.13',
  });
  for (const url of ['http://localhost:9/api/jev/decide', 'http://[::1]:9/api/jev/decide',
    'https://staging.example.test/x/api/jev/decide']) {
    assert.equal(parseArgs(['--gateway', url]).ok, true, url);
  }
});

test('parseArgs rejects a missing, non-gateway or unsafe URL, repeated and unknown flags and bad values', async () => {
  const { parseArgs } = await load(RUN_SHADOW);
  const gw = ['--gateway', 'https://full-selfbrowsing.com/api/jev/decide'];
  const cases = {
    'missing gateway': [],
    'upstream path': ['--gateway', 'https://example.test/v1/systemone'],
    'plain http off loopback': ['--gateway', 'http://example.test/api/jev/decide'],
    'other scheme': ['--gateway', 'ftp://127.0.0.1/api/jev/decide'],
    'credentials in URL': ['--gateway', 'https://user:pw@example.test/api/jev/decide'],
    'query string': ['--gateway', 'https://example.test/api/jev/decide?x=1'],
    'fragment': ['--gateway', 'https://example.test/api/jev/decide#x'],
    'path suffix': ['--gateway', 'https://example.test/api/jev/decide/extra'],
    'not a URL': ['--gateway', 'decide'],
    'repeated flag': [...gw, ...gw],
    'unknown flag': [...gw, '--fast'],
    'stray argument': [...gw, 'extra'],
    'missing value': [...gw, '--limit'],
    'zero limit': [...gw, '--limit', '0'],
    'negative limit': [...gw, '--limit=-1'],
    'fractional limit': [...gw, '--limit', '1.5'],
    'traversal run id': [...gw, '--run-id', '../escape'],
    'slash run id': [...gw, '--run-id', 'a/b'],
    'empty run id': [...gw, '--run-id='],
    'spaced pin': [...gw, '--pin', 'typesafe jev'],
    'empty out': [...gw, '--out='],
  };
  for (const [name, argv] of Object.entries(cases)) {
    const parsed = parseArgs(argv);
    assert.equal(parsed.ok, false, name);
    assert.ok(Array.isArray(parsed.errors) && parsed.errors.length > 0, name);
  }

  const noisy = `--x\u0000\u001b[31m${'y'.repeat(100)}\u007f`;
  const parsed = parseArgs([...gw, noisy]);
  const message = parsed.errors.find((e) => e.startsWith('unknown flag'));
  assert.ok(message, JSON.stringify(parsed.errors));
  const shown = message.slice('unknown flag '.length);
  assert.equal(shown.length, 60);
  assert.ok(!/[\u0000-\u001f\u007f]/.test(message));
  // The rejected gateway value itself is never echoed.
  const secretUrl = parseArgs(['--gateway', 'https://user:hunter2@example.test/api/jev/decide']);
  assert.ok(!secretUrl.errors.join(' ').includes('hunter2'));
});

// ---------------------------------------------------------------------------
// The offline end-to-end run
// ---------------------------------------------------------------------------

test('offline: the seed set runs through the real gateway and client and selects nothing', async () => {
  const { main } = await load(RUN_SHADOW);
  const out = tempDir('run');
  const spy = spyFetch((...args) => globalThis.fetch(...args));
  const cap = captureLog();
  const upstreamBefore = recordedUpstream.requests.length;
  const code = await main(
    ['--gateway', recordedGateway.url, '--out', out, '--run-id', 'test-run', '--pin', PIN],
    { fetchImpl: spy.fetchImpl, log: cap.log },
  );
  assert.equal(code, 0, cap.err.join('\n'));
  assert.deepEqual(fs.readdirSync(out).sort(), ['test-run.jsonl', 'test-run.report.json']);

  // One row per (record, requested kind), each a decision from the recorded answers.
  const rowsText = fs.readFileSync(path.join(out, 'test-run.jsonl'), 'utf8');
  const rows = rowsText.trim().split('\n').map((line) => JSON.parse(line));
  const expectedRows = RECORDS.reduce((n, r) => n + r.request.kinds.length, 0);
  assert.equal(expectedRows, 87);
  assert.equal(rows.length, expectedRows);
  const { loadRecordedAnswers } = await load(RECORDED_ANSWERS);
  const recorded = loadRecordedAnswers(ANSWERS_FILE);
  let i = 0;
  for (const record of RECORDS) {
    for (const kind of record.request.kinds) {
      const row = rows[i];
      i += 1;
      assert.deepEqual(Object.keys(row), ROW_KEYS);
      assert.equal(row.recordId, record.id);
      assert.equal(row.taskId, record.task.id);
      assert.equal(row.kind, kind);
      assert.deepEqual(row.label, record.labels[kind]);
      assert.equal(row.fallback, null);
      const entry = recorded.answers[record.id][kind];
      if (CHOICE_KINDS.includes(kind)) {
        assert.deepEqual(Object.keys(row.decision), ['choice', 'confidence', 'optionCount']);
        assert.equal(row.decision.choice, entry.pick);
        const offered = kind === 'operation' ? record.request.offeredOps.length + 1 : record.request.elements.length + 1;
        assert.equal(row.decision.optionCount, offered);
        const expected = Math.min(1, Math.max(0, (offered * entry.top - 1) / (offered - 1)));
        assert.ok(Math.abs(row.decision.confidence - expected) < 1e-9, `${record.id} ${kind}`);
      } else {
        assert.deepEqual(row.decision, { p: entry.p });
      }
    }
  }

  // The report is keyed by the gateway's served model and the local instrument.
  const report = JSON.parse(fs.readFileSync(path.join(out, 'test-run.report.json'), 'utf8'));
  assert.deepEqual(Object.keys(report), REPORT_KEYS);
  assert.equal(report.runId, 'test-run');
  assert.equal(report.servedModel, SERVED);
  assert.equal(report.instrumentVersion, INSTRUMENT_VERSION);
  assert.equal(report.instrumentHash, INSTRUMENT_HASH);
  assert.deepEqual(report.counts, { records: 25, ok: 25, fallbacks: {} });
  assert.deepEqual(Object.keys(report.scores.kinds), KINDS);
  const kindCounts = { operation: 22, target: 22, completion: 24, stuck: 10, risk: 9 };
  for (const kind of KINDS) assert.equal(report.scores.kinds[kind].n, kindCounts[kind], kind);

  // Pitfall 6: the seed set is far below minN, so every kind is not_a_fit and no profile is made.
  assert.deepEqual(Object.keys(report.selection), KINDS);
  for (const kind of KINDS) {
    assert.equal(report.selection[kind].status, 'not_a_fit', kind);
    assert.equal(report.selection[kind].effectiveThreshold, null, kind);
    assert.equal(report.selection[kind].reason, 'insufficient_samples', kind);
  }
  assert.equal(report.candidateProfile, null);
  for (const kind of KINDS) {
    assert.ok(cap.out.includes(`kind=${kind} status=not_a_fit n=${kindCounts[kind]}`), `${kind}: ${cap.out.join(' | ')}`);
  }

  // Body-free: no goal, title, page text, element label, origin or URL in either file.
  const reportText = fs.readFileSync(path.join(out, 'test-run.report.json'), 'utf8');
  for (const text of [rowsText, reportText]) {
    assert.ok(!text.includes('://'), 'no URL');
    assert.ok(!text.includes('127.0.0.1'), 'no gateway or fixture host');
    for (const record of RECORDS) {
      const { goal, page, elements } = record.request;
      for (const needle of [goal, page.title, page.text, page.origin, page.path, ...elements.map((e) => e.label)]) {
        if (needle.length === 0) continue;
        assert.ok(!text.includes(needle), `${record.id} leaks ${JSON.stringify(needle).slice(0, 40)}`);
      }
    }
  }

  // One request per record, one at a time, no retries; the credential is the gateway's alone.
  assert.equal(spy.calls.length, RECORDS.length);
  assert.equal(spy.maxInFlight, 1);
  for (const call of spy.calls) {
    assert.equal(call.url, recordedGateway.url);
    assert.ok(!Object.keys(call.headers).some((name) => name.toLowerCase() === 'authorization'));
    assert.ok(!Object.keys(call.headers).some((name) => name.toLowerCase() === 'x-fsb-hash-key'));
    assert.ok(!String(call.body).includes(CREDENTIAL));
  }
  const upstreamRequests = recordedUpstream.requests.slice(upstreamBefore);
  assert.equal(upstreamRequests.length, RECORDS.length);
  for (const request of upstreamRequests) {
    assert.equal(request.headers.authorization, `Bearer ${CREDENTIAL}`);
    assert.equal(request.body.model, PIN);
  }
});

test('offline: --limit takes the first N records and the run id cannot be reused', async () => {
  const { main } = await load(RUN_SHADOW);
  const out = tempDir('limit');
  const cap = captureLog();
  const argv = ['--gateway', recordedGateway.url, '--out', out, '--run-id', 'limited', '--limit', '3'];
  assert.equal(await main(argv, { log: cap.log }), 0, cap.err.join('\n'));
  const report = JSON.parse(fs.readFileSync(path.join(out, 'limited.report.json'), 'utf8'));
  assert.equal(report.counts.records, 3);
  assert.equal(report.candidateProfile, null);
  const rows = fs.readFileSync(path.join(out, 'limited.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([...new Set(rows.map((r) => r.recordId))], RECORDS.slice(0, 3).map((r) => r.id));

  const before2 = fs.readFileSync(path.join(out, 'limited.report.json'), 'utf8');
  const spy = spyFetch(() => { throw new Error('must not be called'); });
  const again = captureLog();
  assert.equal(await main(argv, { fetchImpl: spy.fetchImpl, log: again.log }), 2);
  assert.equal(spy.calls.length, 0);
  assert.equal(fs.readFileSync(path.join(out, 'limited.report.json'), 'utf8'), before2);
});

test('offline: a disabled gateway gives fallback rows only and a non-zero exit', async () => {
  const { main } = await load(RUN_SHADOW);
  const out = tempDir('disabled');
  const cap = captureLog();
  const code = await main(['--gateway', disabledGateway.url, '--out', out, '--run-id', 'off'], { log: cap.log });
  assert.equal(code, 1);
  const report = JSON.parse(fs.readFileSync(path.join(out, 'off.report.json'), 'utf8'));
  assert.equal(report.servedModel, null);
  assert.deepEqual(report.counts, { records: 25, ok: 0, fallbacks: { disabled: 25 } });
  for (const kind of KINDS) assert.equal(report.selection[kind].status, 'not_a_fit');
  const rows = fs.readFileSync(path.join(out, 'off.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 87);
  assert.ok(rows.every((r) => r.decision === null && r.fallback === 'disabled'));
});

test('refused: an instrument version the local instrument does not know', async () => {
  const { main } = await load(RUN_SHADOW);
  const out = tempDir('version');
  const spy = spyFetch(stubFetch((request) => stubOkBody(request, { instrumentVersion: 'fsb-jev-instrument-999' })));
  const cap = captureLog();
  const code = await main(['--gateway', 'http://127.0.0.1:9/api/jev/decide', '--out', out, '--run-id', 'v'],
    { fetchImpl: spy.fetchImpl, log: cap.log });
  assert.equal(code, 3);
  assert.equal(spy.calls.length, 1, 'stops at the first mismatch');
  assert.deepEqual(fs.readdirSync(out), []);
  assert.ok(cap.err.some((line) => line.includes('instrument')), cap.err.join('\n'));
});

test('refused: mixed served models', async () => {
  const { main } = await load(RUN_SHADOW);
  const out = tempDir('mixed');
  const models = [SERVED, 'typesafe/jev-1.13-20261001'];
  const spy = spyFetch(stubFetch((request, index) => stubOkBody(request, { servedModel: models[index % 2] })));
  const cap = captureLog();
  const code = await main(['--gateway', 'http://127.0.0.1:9/api/jev/decide', '--out', out, '--run-id', 'm'],
    { fetchImpl: spy.fetchImpl, log: cap.log });
  assert.equal(code, 3);
  assert.equal(spy.calls.length, 2, 'stops at the first second model');
  assert.deepEqual(fs.readdirSync(out), []);
  assert.ok(cap.err.some((line) => line.includes('served model')), cap.err.join('\n'));
});

test('usage errors exit 2 before any request', async () => {
  const { main } = await load(RUN_SHADOW);
  for (const argv of [[], ['--gateway', 'https://example.test/v1/systemone'], ['--gateway']]) {
    const spy = spyFetch(() => { throw new Error('must not be called'); });
    const cap = captureLog();
    assert.equal(await main(argv, { fetchImpl: spy.fetchImpl, log: cap.log }), 2, JSON.stringify(argv));
    assert.equal(spy.calls.length, 0);
    assert.ok(cap.err.some((line) => line.startsWith('usage:')), cap.err.join('\n'));
  }
});

// ---------------------------------------------------------------------------
// The candidate profile round trip (D-27, D-28)
// ---------------------------------------------------------------------------

const Z = 2.5758293035489004;
const NOT_FIT = Object.freeze({ status: 'not_a_fit', effectiveThreshold: null, z: Z, reason: 'no_cut_qualifies' });

function syntheticSelection() {
  return {
    operation: { status: 'fit', cut: 0.8, effectiveThreshold: 0.85, n: 400, hits: 398, lower: 0.97, z: Z },
    target: { ...NOT_FIT },
    completion: { status: 'fit', cut: 0.85, effectiveThreshold: 0.9, n: 300, hits: 299, lower: 0.96, z: Z },
    stuck: { ...NOT_FIT },
    risk: { ...NOT_FIT, reason: 'insufficient_samples' },
  };
}

function answersWith(confidence, p) {
  return {
    operation: { type: 'choice', choice: 'click', confidence, probabilities: { click: 0.9, none_of_the_above: 0.1 } },
    target: { type: 'choice', choice: 'e0', confidence: 0.99, probabilities: { e0: 0.99, none_of_the_above: 0.01 } },
    completion: { type: 'noul', noul: p },
    stuck: { type: 'noul', noul: 0.99 },
    risk: { type: 'noul', noul: 0.99 },
  };
}

test('profile: a fit selection becomes a profile the server validates and applies exactly at the threshold', async () => {
  const mod = await load(RUN_SHADOW);
  assert.equal(typeof mod.buildCandidateProfile, 'function', 'run-shadow.mjs exports buildCandidateProfile');
  const input = { selection: syntheticSelection(), pin: PIN, servedModel: SERVED, instrumentVersion: INSTRUMENT_VERSION,
    instrumentHash: INSTRUMENT_HASH };
  const profile = mod.buildCandidateProfile(input);
  assert.deepEqual(validateProfile(profile), { ok: true, errors: [] });
  assert.deepEqual(Object.keys(profile), PROFILE_KEYS);
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.status, 'calibrated');
  assert.equal(profile.model, PIN);
  assert.equal(profile.snapshot, SERVED);
  assert.equal(profile.instrumentVersion, INSTRUMENT_VERSION);
  assert.equal(profile.instrumentHash, INSTRUMENT_HASH);
  assert.deepEqual(profile.thresholds, { operation: 0.85, target: null, completion: 0.1, stuck: null, risk: null });
  // The client accepts a calibration profileId of at most 64 characters.
  assert.match(profile.profileId, /^calibrated-[0-9a-f]{16}$/);
  assert.deepEqual(mod.buildCandidateProfile(input), profile, 'deterministic');

  const apply = (answers) => applyCalibration({ profile, configuredModel: PIN, servedModel: SERVED, answers, kinds: KINDS });
  const at = apply(answersWith(0.85, 0.1));
  assert.deepEqual(at.calibration, { status: 'calibrated', profileId: profile.profileId });
  assert.equal(at.decisions.operation.threshold, 0.85);
  assert.equal(at.decisions.operation.meetsThreshold, true);
  assert.equal(at.decisions.completion.threshold, 0.1);
  assert.equal(at.decisions.completion.meetsThreshold, true);
  for (const kind of ['target', 'stuck', 'risk']) {
    assert.equal(at.decisions[kind].threshold, null, kind);
    assert.equal(at.decisions[kind].meetsThreshold, false, kind);
  }
  const past = apply(answersWith(0.8499, 0.1001));
  assert.equal(past.decisions.operation.meetsThreshold, false);
  assert.equal(past.decisions.completion.meetsThreshold, false);

  // V3 commits the output unchanged: written as a file, the server loads and selects it.
  const dir = tempDir('profile');
  fs.writeFileSync(path.join(dir, 'candidate.json'), `${JSON.stringify(profile, null, 2)}\n`);
  const loaded = loadProfiles(dir);
  assert.equal(loaded.length, 2);
  assert.deepEqual(selectProfile(loaded, { model: PIN, instrumentHash: INSTRUMENT_HASH }), profile);
});

test('profile: none without a fit kind, outside the pin family or without a pin', async () => {
  const mod = await load(RUN_SHADOW);
  assert.equal(typeof mod.buildCandidateProfile, 'function');
  const base = { selection: syntheticSelection(), pin: PIN, servedModel: SERVED, instrumentVersion: INSTRUMENT_VERSION,
    instrumentHash: INSTRUMENT_HASH };
  const allNotFit = Object.fromEntries(KINDS.map((kind) => [kind, { ...NOT_FIT }]));
  assert.equal(mod.buildCandidateProfile({ ...base, selection: allNotFit }), null);
  assert.equal(mod.buildCandidateProfile({ ...base, servedModel: 'typesafe/jev-1.14-20260917' }), null);
  assert.equal(mod.buildCandidateProfile({ ...base, servedModel: 'typesafe/jev-1.13-2026' }), null);
  assert.equal(mod.buildCandidateProfile({ ...base, servedModel: null }), null);
  assert.equal(mod.buildCandidateProfile({ ...base, pin: null }), null);
  // The direct route pins and serves the same exact model.
  const direct = mod.buildCandidateProfile({ ...base, pin: 'jev-1.13.0', servedModel: 'jev-1.13.0' });
  assert.equal(validateProfile(direct).ok, true);
  assert.equal(direct.snapshot, 'jev-1.13.0');
});

// ---------------------------------------------------------------------------
// The V2 smoke command (JEV-02, M-67-04)
// ---------------------------------------------------------------------------

test('smoke: SMOKE_REQUEST is a fixed benign request both validators accept', async () => {
  const { SMOKE_REQUEST } = await load(SMOKE);
  assert.ok(Object.isFrozen(SMOKE_REQUEST) && Object.isFrozen(SMOKE_REQUEST.elements));
  assert.equal(SMOKE_REQUEST.v, 1);
  assert.deepEqual([...SMOKE_REQUEST.kinds], ['operation', 'target', 'completion']);
  assert.equal(SMOKE_REQUEST.page.origin, 'https://example.test');
  assert.equal(SMOKE_REQUEST.page.path, '/smoke');
  assert.deepEqual(SMOKE_REQUEST.elements.map((e) => [e.id, e.role, e.label]), [['e0', 'button', 'Continue'], ['e1', 'link', 'Help']]);
  assert.ok(!Object.prototype.hasOwnProperty.call(SMOKE_REQUEST, 'proposedAction'));
  assert.equal(FsbJevState.validateRequest(SMOKE_REQUEST).ok, true);
  assert.equal(serverValidator.validateRequest(JSON.parse(JSON.stringify(SMOKE_REQUEST))).ok, true);
});

function smokeNeedles(request) {
  return [request.goal, request.page.origin, request.page.title, request.page.text, request.page.path,
    ...request.elements.map((e) => e.label)];
}

test('smoke: an enabled gateway gives one body-free JSON line and exit 0', async () => {
  const smoke = await load(SMOKE);
  const upstream = await startFakeUpstream({ mode: 'ok-openrouter' });
  openUpstreams.push(upstream);
  const gw = await startGateway({
    db: makeDb(),
    config: enabledConfig(upstream.url),
    fetchImpl: (...args) => globalThis.fetch(...args),
    log: silentLog,
  });
  const spy = spyFetch((...args) => globalThis.fetch(...args));
  const cap = captureLog();
  const code = await smoke.main(['--gateway', gw.url], { fetchImpl: spy.fetchImpl, log: cap.log });
  assert.equal(code, 0, cap.err.join('\n'));
  assert.equal(cap.out.length, 1, cap.out.join('\n'));
  const line = JSON.parse(cap.out[0]);
  assert.deepEqual(Object.keys(line), SMOKE_KEYS);
  assert.equal(line.ok, true);
  assert.equal(line.fallback, null);
  assert.equal(line.servedModel, OPENROUTER_MODEL);
  assert.equal(line.instrumentVersion, INSTRUMENT_VERSION);
  assert.equal(line.calibrationStatus, 'uncalibrated');
  assert.equal(line.usageSource, 'provider');
  assert.equal(line.costSource, 'provider');
  assert.ok(Number.isFinite(line.latencyMs) && line.latencyMs >= 0);
  assert.equal(spy.calls.length, 1);
  assert.equal(upstream.requests.length, 1);
  assert.equal(upstream.requests[0].headers.authorization, `Bearer ${CREDENTIAL}`);
  assert.ok(!Object.keys(spy.calls[0].headers).some((name) => name.toLowerCase() === 'authorization'));
  for (const needle of smokeNeedles(smoke.SMOKE_REQUEST)) assert.ok(!cap.out[0].includes(needle), needle);
  assert.ok(!cap.out[0].includes('://'));
});

test('smoke: a disabled gateway prints ok false with the typed fallback and exits 0', async () => {
  const smoke = await load(SMOKE);
  const cap = captureLog();
  const code = await smoke.main([`--gateway=${disabledGateway.url}`], { log: cap.log });
  assert.equal(code, 0, cap.err.join('\n'));
  assert.equal(cap.out.length, 1);
  const line = JSON.parse(cap.out[0]);
  assert.deepEqual(Object.keys(line), SMOKE_KEYS);
  assert.deepEqual({ ...line, latencyMs: 0 }, {
    ok: false,
    fallback: 'disabled',
    servedModel: null,
    instrumentVersion: null,
    calibrationStatus: null,
    usageSource: null,
    costSource: null,
    latencyMs: 0,
  });
  assert.ok(Number.isFinite(line.latencyMs) && line.latencyMs >= 0);
  for (const needle of smokeNeedles(smoke.SMOKE_REQUEST)) assert.ok(!cap.out[0].includes(needle), needle);
});

test('smoke: usage errors exit 2 with a usage line and no request', async () => {
  const smoke = await load(SMOKE);
  const gw = ['--gateway', 'https://full-selfbrowsing.com/api/jev/decide'];
  for (const argv of [[], ['--gateway', 'https://example.test/v1/systemone'], [...gw, ...gw], [...gw, '--limit', '3'],
    ['--gateway', 'http://example.test/api/jev/decide']]) {
    const spy = spyFetch(() => { throw new Error('must not be called'); });
    const cap = captureLog();
    assert.equal(await smoke.main(argv, { fetchImpl: spy.fetchImpl, log: cap.log }), 2, JSON.stringify(argv));
    assert.equal(spy.calls.length, 0);
    assert.equal(cap.out.length, 0);
    assert.ok(cap.err.some((line) => line.startsWith('usage:')), cap.err.join('\n'));
  }
});

test('cli: both scripts run as commands and exit 2 with a usage line when --gateway is missing', () => {
  for (const rel of [SMOKE, RUN_SHADOW]) {
    const result = spawnSync(process.execPath, [path.join(ROOT, rel)], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 2, `${rel}: ${result.stderr}`);
    assert.match(result.stderr, /^usage: node scripts\/bench\/shadow\//m, rel);
    assert.equal(result.stdout, '', rel);
  }
});

// ---------------------------------------------------------------------------
// Static: gateway only, outputs gitignored (T-67-01)
// ---------------------------------------------------------------------------

test('static: the harness and smoke scripts name no upstream, credential, auth header or env read', () => {
  for (const rel of [RUN_SHADOW, RECORDED_ANSWERS, SMOKE]) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(text, /systemone|typesafe\.ai|openrouter\.ai|JEV_API_KEY|authorization/i, rel);
    assert.doesNotMatch(text, /process\.env/, rel);
    assert.doesNotMatch(text, /Object\.groupBy|Promise\.withResolvers|\.toSorted\(|\.toReversed\(|\.findLast\(/, rel);
  }
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').map((line) => line.trim());
  assert.ok(ignore.includes('scripts/bench/.local/'), 'shadow outputs stay gitignored');
});
