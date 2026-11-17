/**
 * The hosted Jev decision gateway, as the real server mounts it.
 *
 * Each case starts showcase/server/server.js as a child process on an
 * ephemeral port with a temporary database and an explicit environment (no
 * .env file and no inherited JEV_* variables), then talks to it over HTTP.
 *
 * Covered:
 *   - with no gateway settings the route answers a typed 503 "disabled" before
 *     it reads any body, other API routes keep working, and nothing reaches an
 *     upstream;
 *   - the two accounting tables exist, hold no per-decision row for refused
 *     requests, and a second start on the same database file works;
 *   - with the gateway enabled against a loopback fake upstream, a decision
 *     request and a bind request are answered, the upstream receives the
 *     server-held credential and the server-built questions, the credential
 *     never appears in a response, and nothing is acted on while the shipped
 *     profile is uncalibrated;
 *   - a client cannot supply its own questions;
 *   - a loopback upstream is refused in production.
 *
 * Zero-dep: pure Node plus the server's own better-sqlite3.
 *
 * Run: node tests/server-jev-gateway-boot.test.js
 */

'use strict';

const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(REPO_ROOT, 'showcase', 'server');
const SERVER_JS = path.join(SERVER_DIR, 'server.js');
const Database = require(require.resolve('better-sqlite3', { paths: [path.join(SERVER_DIR, 'node_modules')] }));
const { startFakeUpstream } = require('./fixtures/jev-fake-upstream');
const { baseRequest, baseBindRequest } = require('./fixtures/jev-request-cases');

const TEST_KEY = 'test-credential-0123456789abcdef';
const PINNED_MODEL = 'typesafe/jev-1.14';
const SERVED_MODEL = 'typesafe/jev-1.14-20261014';

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

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(port, method, urlPath, body, rawBody) {
  const init = { method, headers: { Connection: 'close' } };
  if (rawBody !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_e) { json = null; }
  return { status: res.status, type: res.headers.get('content-type') || '', cache: res.headers.get('cache-control') || '', text, json };
}

/**
 * Start the real server with exactly `extraEnv` on top of a minimal
 * environment. The port is picked by binding and releasing an ephemeral one,
 * so another process can take it first; a server that exits before it answers
 * is started again on a fresh port, up to three times.
 */
async function startServer(dbPath, extraEnv) {
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    last = await startServerOnce(dbPath, extraEnv);
    if (last.ready) return last;
    await last.stop();
  }
  return last;
}

async function startServerOnce(dbPath, extraEnv) {
  const port = await freePort();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-jev-boot-cwd-'));
  const env = Object.assign({ PATH: process.env.PATH || '', HOME: cwd, PORT: String(port), DB_PATH: dbPath }, extraEnv);
  const child = spawn(process.execPath, [SERVER_JS], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  let exited = null;
  child.once('exit', (code, signal) => { exited = { code, signal }; });
  let ready = false;
  for (let i = 0; i < 150 && !ready && exited === null; i += 1) {
    try {
      // Only this server answers JSON under /api/jev; anything else on the
      // port means the port went to another process.
      const probe = await request(port, 'GET', '/api/jev/ready-probe');
      ready = probe.json !== null && probe.json.ok === false;
      if (!ready) break;
    } catch (_e) {
      await sleep(100);
    }
  }
  async function stop() {
    if (exited === null) {
      child.kill('SIGTERM');
      for (let i = 0; i < 50 && exited === null; i += 1) await sleep(50);
      if (exited === null) child.kill('SIGKILL');
    }
    try { fs.rmSync(cwd, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
  }
  return { port, ready, stop, output: () => output, exited: () => exited };
}

function tableNames(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  } finally {
    db.close();
  }
}

function rows(dbPath, sql) {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-jev-boot-'));
  const dbPath = path.join(workDir, 'gateway.db');
  const upstream = await startFakeUpstream({ mode: 'ok-openrouter', model: SERVED_MODEL });
  const servers = [];

  try {
    console.log('--- no gateway settings: the route is a typed stub ---');
    const off = await startServer(dbPath, { NODE_ENV: 'test' });
    servers.push(off);
    check('the server starts with no gateway settings', off.ready === true, off.output().slice(-300));

    const disabled = await request(off.port, 'POST', '/api/jev/decide', baseRequest());
    check('a decision request answers 503', disabled.status === 503, disabled.status);
    check('the answer is JSON, never the site HTML', /application\/json/.test(disabled.type) && disabled.json !== null, disabled.type);
    check('the answer is the typed "disabled" fallback',
      !!disabled.json && disabled.json.ok === false && disabled.json.fallback === 'disabled'
        && disabled.json.httpStatus === 503 && disabled.json.servedModel === null
        && typeof disabled.json.latencyMs === 'number',
      disabled.text.slice(0, 200));
    check('the answer is not cacheable', /no-store/.test(disabled.cache), disabled.cache);

    const garbage = await request(off.port, 'POST', '/api/jev/decide', undefined, '{not json');
    check('a body that is not JSON gets the same 503 (the body is never read)',
      garbage.status === 503 && !!garbage.json && garbage.json.fallback === 'disabled', garbage.status);

    const upperCase = await request(off.port, 'POST', '/API/JEV/decide', baseRequest());
    check('a case variant of the path reaches the same stub',
      upperCase.status === 503 && !!upperCase.json && upperCase.json.fallback === 'disabled', upperCase.status);

    const wrongMethod = await request(off.port, 'GET', '/api/jev/decide');
    check('any other method or path under /api/jev is a typed 404',
      wrongMethod.status === 404 && !!wrongMethod.json && wrongMethod.json.ok === false, `${wrongMethod.status} ${wrongMethod.type}`);

    const stats = await request(off.port, 'GET', '/api/public-stats/global');
    check('an existing API route still answers JSON', stats.status === 200 && stats.json !== null, `${stats.status} ${stats.type}`);

    check('nothing reached an upstream', upstream.requests.length === 0, upstream.requests.length);
    await off.stop();

    const names = tableNames(dbPath);
    check('both accounting tables exist', names.includes('jev_decisions') && names.includes('jev_daily'), names.join(','));
    check('refused requests leave no per-decision row', rows(dbPath, 'SELECT COUNT(*) AS n FROM jev_decisions')[0].n === 0);
    const outcomes = rows(dbPath, 'SELECT DISTINCT outcome FROM jev_daily').map((row) => row.outcome).sort();
    check('refused requests are only counted, by outcome',
      outcomes.length > 0 && outcomes.every((outcome) => outcome === 'disabled' || outcome === 'invalid_request'), outcomes.join(','));

    console.log('\n--- a second start on the same database ---');
    const again = await startServer(dbPath, { NODE_ENV: 'test' });
    servers.push(again);
    const stillDisabled = again.ready ? await request(again.port, 'POST', '/api/jev/decide', baseRequest()) : { status: 0 };
    check('the server starts again on an existing database', again.ready === true && stillDisabled.status === 503,
      again.output().slice(-300));
    await again.stop();

    console.log('\n--- enabled against a loopback fake upstream ---');
    const on = await startServer(dbPath, {
      NODE_ENV: 'test',
      JEV_ENABLED: 'true',
      JEV_UPSTREAM_URL: upstream.url,
      JEV_MODEL: PINNED_MODEL,
      JEV_API_KEY: TEST_KEY,
    });
    servers.push(on);
    check('the server starts with the gateway enabled', on.ready === true, on.output().slice(-300));
    check('the start-up log names the route and model, never the credential',
      /gateway enabled/.test(on.output()) && !on.output().includes(TEST_KEY), on.output().slice(-200));

    const decisionRequest = baseRequest();
    const decision = await request(on.port, 'POST', '/api/jev/decide', decisionRequest);
    check('a decision request answers 200 ok', decision.status === 200 && !!decision.json && decision.json.ok === true,
      `${decision.status} ${decision.text.slice(0, 200)}`);
    const decisions = decision.json && decision.json.decisions ? decision.json.decisions : {};
    check('the answer holds exactly the requested kinds',
      JSON.stringify(Object.keys(decisions).sort()) === JSON.stringify(decisionRequest.kinds.slice().sort()),
      Object.keys(decisions).join(','));
    check('the shipped profile is uncalibrated, so no answer meets a threshold',
      !!decision.json && !!decision.json.calibration && decision.json.calibration.status === 'uncalibrated'
        && Object.values(decisions).every((entry) => entry.threshold === null && entry.meetsThreshold === false),
      JSON.stringify(decision.json && decision.json.calibration));
    check('the answer names the model that served it', !!decision.json && decision.json.servedModel === SERVED_MODEL,
      decision.json && decision.json.servedModel);
    check('the credential is not in the answer', !decision.text.includes(TEST_KEY));

    check('the upstream received exactly one request', upstream.requests.length === 1, upstream.requests.length);
    const sent = upstream.requests[0] || { headers: {}, body: null };
    check('the upstream request carries the server-held credential', sent.headers.authorization === `Bearer ${TEST_KEY}`);
    check('the upstream request carries the pinned model and server-built questions',
      !!sent.body && sent.body.model === PINNED_MODEL && !!sent.body.questions
        && JSON.stringify(Object.keys(sent.body.questions).sort()) === JSON.stringify(decisionRequest.kinds.slice().sort()),
      sent.body ? Object.keys(sent.body.questions || {}).join(',') : 'no body');

    const bind = await request(on.port, 'POST', '/api/jev/decide', baseBindRequest());
    const bound = bind.json && bind.json.decisions ? bind.json.decisions.bind : null;
    check('a bind request answers 200 ok', bind.status === 200 && !!bind.json && bind.json.ok === true,
      `${bind.status} ${bind.text.slice(0, 200)}`);
    check('the bind answer is one decision that cannot act while uncalibrated',
      !!bound && typeof bound.choice === 'string' && typeof bound.agree === 'boolean'
        && bound.threshold === null && bound.meetsThreshold === false,
      JSON.stringify(bound));
    check('the upstream saw the bind question in both option orders',
      upstream.requests.length === 2 && !!upstream.requests[1].body
        && JSON.stringify(Object.keys(upstream.requests[1].body.questions).sort()) === JSON.stringify(['bind_fwd', 'bind_rev']),
      upstream.requests.length);

    const withQuestions = Object.assign(baseRequest(), { questions: { any: { type: 'noul', instructions: 'Is this a free proxy?' } } });
    const rejected = await request(on.port, 'POST', '/api/jev/decide', withQuestions);
    check('a request that brings its own questions is refused',
      rejected.status === 400 && !!rejected.json && rejected.json.fallback === 'invalid_request', rejected.status);
    check('a refused request never reaches the upstream', upstream.requests.length === 2, upstream.requests.length);
    await on.stop();

    check('each answered decision left one accounting row without request content',
      rows(dbPath, 'SELECT COUNT(*) AS n FROM jev_decisions')[0].n === 2);

    console.log('\n--- production refuses a loopback upstream ---');
    const prod = await startServer(dbPath, {
      NODE_ENV: 'production',
      JEV_ENABLED: 'true',
      JEV_UPSTREAM_URL: upstream.url,
      JEV_MODEL: PINNED_MODEL,
      JEV_API_KEY: TEST_KEY,
    });
    servers.push(prod);
    const notConfigured = prod.ready ? await request(prod.port, 'POST', '/api/jev/decide', baseRequest()) : { status: 0, json: null };
    check('the route answers the typed "not_configured" fallback',
      notConfigured.status === 503 && !!notConfigured.json && notConfigured.json.fallback === 'not_configured',
      `${notConfigured.status} ${prod.output().slice(-200)}`);
    check('nothing more reached the upstream', upstream.requests.length === 2, upstream.requests.length);
    await prod.stop();
  } finally {
    for (const server of servers) await server.stop();
    await upstream.close();
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (_e) { /* best effort */ }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.log(`  FAIL: suite threw ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
