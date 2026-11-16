/**
 * Phase 67 (JEV-02, JEV-03, D-22, SC3) -- Jev gateway log hygiene.
 *
 * Proves that no credential, request body, page content, label or URL can
 * reach a gateway response, a log line or a ledger cell on any success or
 * error path:
 *   1. An echoing fake upstream (error bodies and a 200 error envelope that
 *      repeat the Authorization header and the raw request body) answers
 *      requests whose goal, title, text, labels, origin and path each carry a
 *      unique marker. console.log/info/warn/error/debug are captured, the
 *      router gets a capturing log, and every jev_decisions and jev_daily cell
 *      is scanned.
 *   2. A marker planted in a schema-invalid kinds array (short and 2,000
 *      characters long) reaches nothing and adds no ledger row.
 *   3. Malformed and oversize bodies holding a secret give typed 400/413 with
 *      no secret and no JSON parse message anywhere, and the generic error
 *      handler is never reached.
 *   4. Static (comments stripped): no file in showcase/server/src/jev/ and no
 *      src/routes/jev.js reads error text or stack traces, touches the client
 *      address or auth, or requires a TypeSafe or OpenRouter SDK.
 *   5. Spawned `node server.js` with Jev disabled answers 503 'disabled'; with
 *      an invalid Jev env it still boots, answers 503 'not_configured' and
 *      prints exactly one variable-name-only config line, never the key.
 *
 * Binds only ephemeral loopback ports and never mutates process.env.
 *
 * Run: node tests/jev-gateway-log-hygiene.test.js
 */

'use strict';

// A promise that never settles must not pass as a clean exit.
process.exitCode = 1;

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'showcase', 'server');
const SERVER_NM = path.join(SERVER, 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(SERVER, 'src', 'db', 'schema'));
const { createGlobalJsonParser } = require(path.join(SERVER, 'src', 'middleware', 'global-json-parser'));
const { loadJevConfig } = require(path.join(SERVER, 'src', 'jev', 'config'));
const { startFakeUpstream } = require('./fixtures/jev-fake-upstream');
const { baseRequest } = require('./fixtures/jev-request-cases');

// The suite's own output goes through the original console.log, bound before
// any capture starts.
const print = console.log.bind(console);

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) {
    passed += 1;
    print(`  PASS: ${label}`);
  } else {
    failed += 1;
    print(`  FAIL: ${label}${detail === undefined ? '' : ` -- ${detail}`}`);
  }
}

let createJevRouter = null;
try {
  createJevRouter = require(path.join(SERVER, 'src', 'routes', 'jev'));
} catch (_e) {
  createJevRouter = null;
}

const CREDENTIAL = 'sk-test-SECRET-0123456789abcdef';
const BODY_SECRET = 'sk-SECRET-abcdef0123456789xyz';
const BOOT_KEY = 'sk-boot-SECRET-0123456789abcdef';
const MARKERS = {
  goal: 'MARKERGOAL7f3a',
  title: 'MARKERTITLE7f3a',
  text: 'MARKERTEXT7f3a',
  label: 'MARKERLABEL7f3a',
  origin: 'markerorigin7f3a',
  path: 'markerpath7f3a',
};
const KINDS_MARKER = 'MARKER-KINDS-7f3a';
const PARSE_MESSAGE_RE = /Unexpected token|Unexpected end|is not valid JSON|JSON at position|SyntaxError|in JSON/i;
const CLIENT_TIMEOUT_MS = 8000;
const SUITE_WATCHDOG_MS = 90000;

let unhandledRejections = 0;
process.on('unhandledRejection', () => { unhandledRejections += 1; });
let genericHandlerHit = false;

// ---------------------------------------------------------------------------
// Console capture
// ---------------------------------------------------------------------------

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'];
const captured = [];
let originals = null;

function startCapture() {
  originals = {};
  for (const method of CONSOLE_METHODS) {
    originals[method] = console[method];
    console[method] = (...args) => { captured.push(args.map((a) => String(a)).join(' ')); };
  }
}

function stopCapture() {
  if (originals === null) return;
  for (const method of CONSOLE_METHODS) console[method] = originals[method];
  originals = null;
}

function makeLog() {
  const lines = [];
  const push = (...args) => { lines.push(args.map((a) => String(a)).join(' ')); };
  return { lines, log: { log: push, info: push, warn: push, error: push, debug: push } };
}

// ---------------------------------------------------------------------------
// Harness (production middleware order, port 0)
// ---------------------------------------------------------------------------

async function startGateway(routerOptions) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(createGlobalJsonParser());
  app.use('/api/jev', createJevRouter(routerOptions));
  app.use((_err, _req, res, _next) => {
    genericHandlerHit = true;
    res.status(500).json({ error: 'generic handler' });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }),
  };
}

const responses = [];

function send(port, { raw, body, reqPath = '/api/jev/decide', contentType = 'application/json' } = {}) {
  const payload = raw !== undefined ? Buffer.from(raw) : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: reqPath,
      method: 'POST',
      agent: false,
      headers: { 'Content-Type': contentType, 'Content-Length': payload.length },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_e) { parsed = null; }
        const result = { status: res.statusCode, headers: res.headers, text: `${JSON.stringify(res.headers)}\n${text}`, body: parsed };
        responses.push(result.text);
        resolve(result);
      });
      res.on('error', reject);
    });
    req.setTimeout(CLIENT_TIMEOUT_MS, () => {
      req.destroy();
      resolve({ status: 0, headers: {}, text: '', body: null });
    });
    req.on('error', (error) => {
      if (req.destroyed) return;
      reject(error);
    });
    req.write(payload);
    req.end();
  });
}

function markedRequest() {
  const request = baseRequest();
  request.goal = `Tick Alpha ${MARKERS.goal} and save the checklist`;
  request.page.origin = `https://${MARKERS.origin}.example`;
  request.page.path = `/${MARKERS.path}/checklist`;
  request.page.title = `Checklist ${MARKERS.title}`;
  request.page.text = `Alpha ${MARKERS.text} Bravo Charlie`;
  request.elements[0].label = `Alpha ${MARKERS.label}`;
  request.elements[1].label = `Save ${MARKERS.label}`;
  return request;
}

/** Forbidden needles: the credential, 'Bearer' and every marker (case-insensitive for markers and secrets). */
function leaks(haystack, extra) {
  const text = String(haystack);
  const lower = text.toLowerCase();
  const found = [];
  if (text.includes('Bearer')) found.push('Bearer');
  for (const needle of [CREDENTIAL, ...Object.values(MARKERS), ...(extra || [])]) {
    if (lower.includes(needle.toLowerCase())) found.push(needle);
  }
  return found;
}

function ledgerCells(db) {
  const cells = [];
  for (const table of ['jev_decisions', 'jev_daily']) {
    for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
      for (const [column, value] of Object.entries(row)) cells.push({ table, column, value: value === null ? '' : String(value) });
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------
// 1-3. In-process: echoing upstream, invalid kinds, malformed and oversize bodies
// ---------------------------------------------------------------------------

async function inProcessSection() {
  print('\n--- echoing upstream, markers and console capture (D-22, SC3) ---');
  const fake = await startFakeUpstream({ mode: 'echo' });
  const db = new Database(':memory:');
  const sink = makeLog();
  let gateway = null;
  startCapture();
  try {
    initializeDatabase(db);
    const config = loadJevConfig({
      JEV_ENABLED: 'true',
      JEV_UPSTREAM_URL: fake.url,
      JEV_MODEL: 'jev-1.13.0',
      JEV_API_KEY: CREDENTIAL,
      JEV_UPSTREAM_TIMEOUT_MS: '400',
    }, { log: console });
    gateway = await startGateway({ db, config, fetchImpl: (...args) => globalThis.fetch(...args), now: Date.now, log: sink.log });

    // Two full echo cycles: 400, 401, 500 and a 200 error envelope, twice.
    const statuses = [];
    for (let i = 0; i < 8; i += 1) statuses.push((await send(gateway.port, { body: markedRequest() })).status);
    fake.setMode({ mode: 'garbage' });
    statuses.push((await send(gateway.port, { body: markedRequest() })).status);
    fake.setMode({ mode: 'ok-direct' });
    const ok = await send(gateway.port, { body: markedRequest() });
    statuses.push(ok.status);
    fake.setMode({ mode: 'hang' });
    statuses.push((await send(gateway.port, { body: markedRequest() })).status);

    const echoedHeaders = fake.requests.filter((r) => typeof r.headers.authorization === 'string'
      && r.headers.authorization === `Bearer ${CREDENTIAL}`).length;
    const echoedBodies = fake.requests.filter((r) => r.rawBody.includes(MARKERS.goal)).length;
    check('the echo upstream really received the credential and the marked body (so the echo carried them back)',
      echoedHeaders === fake.requests.length && echoedBodies === fake.requests.length && fake.requests.length === 11,
      `${echoedHeaders}/${echoedBodies}/${fake.requests.length}`);
    check('statuses: 502 x6, 502 x2 (200-with-error), 502 garbage, 200 ok, 504 timeout',
      JSON.stringify(statuses) === JSON.stringify([502, 502, 502, 502, 502, 502, 502, 502, 502, 200, 504]), JSON.stringify(statuses));
    check('the ok response is a typed decision', ok.body !== null && ok.body.ok === true);

    print('\n--- invalid kinds carrying a marker (T-67-11) ---');
    const rowsBefore = db.prepare('SELECT COUNT(*) AS n FROM jev_decisions').get().n;
    const shortKinds = markedRequest();
    shortKinds.kinds = ['operation', KINDS_MARKER];
    delete shortKinds.proposedAction;
    const shortRes = await send(gateway.port, { body: shortKinds });
    check("kinds ['operation', marker] -> 400 invalid_request",
      shortRes.status === 400 && shortRes.body && shortRes.body.fallback === 'invalid_request', shortRes.text.slice(0, 200));
    const longKinds = markedRequest();
    longKinds.kinds = [`${KINDS_MARKER}-${'z'.repeat(2000 - KINDS_MARKER.length - 1)}`];
    delete longKinds.proposedAction;
    check('the long kinds marker is 2,000 characters', longKinds.kinds[0].length === 2000);
    const longRes = await send(gateway.port, { body: longKinds });
    check('kinds holding a 2,000-character marker -> 400 invalid_request',
      longRes.status === 400 && longRes.body && longRes.body.fallback === 'invalid_request', longRes.text.slice(0, 200));
    check('jev_decisions gained no row for either', db.prepare('SELECT COUNT(*) AS n FROM jev_decisions').get().n === rowsBefore);

    print('\n--- malformed and oversize bodies holding a secret (Pitfall 2) ---');
    const malformed = await send(gateway.port, { raw: `{"goal": "${BODY_SECRET}", "kinds": [` });
    check('malformed JSON with a secret -> 400 invalid_request',
      malformed.status === 400 && malformed.body && malformed.body.fallback === 'invalid_request', malformed.text.slice(0, 200));
    const bareToken = await send(gateway.port, { raw: BODY_SECRET });
    check('a bare secret token as the body -> 400 invalid_request',
      bareToken.status === 400 && bareToken.body && bareToken.body.fallback === 'invalid_request', bareToken.text.slice(0, 200));
    const oversize = await send(gateway.port, { raw: `{"goal":"${BODY_SECRET}","pad":"${'p'.repeat(50 * 1024)}"}` });
    check('an oversize body (> 48 KB) with a secret -> 413 payload_too_large',
      oversize.status === 413 && oversize.body && oversize.body.fallback === 'payload_too_large', oversize.text.slice(0, 200));
    check('the generic error handler was never hit', genericHandlerHit === false);
  } finally {
    stopCapture();
    if (gateway) await gateway.close();
    await fake.close();
  }

  print('\n--- scans: responses, captured console, injected log, ledger cells ---');
  const extra = [KINDS_MARKER, BODY_SECRET];
  const responseLeaks = responses.map((text) => leaks(text, extra)).filter((found) => found.length > 0);
  check(`no gateway response (${responses.length} checked) holds the credential, 'Bearer', a marker or the body secret`,
    responses.length >= 14 && responseLeaks.length === 0, JSON.stringify(responseLeaks.slice(0, 3)));
  check('no gateway response holds a JSON parse message', responses.every((text) => !PARSE_MESSAGE_RE.test(text)));

  const logLines = captured.concat(sink.lines);
  const logLeaks = logLines.map((line) => ({ line, found: leaks(line, extra) })).filter((entry) => entry.found.length > 0);
  check(`captured log lines checked: ${logLines.length} (console ${captured.length}, injected ${sink.lines.length}), none leaks`,
    captured.length > 0 && sink.lines.length > 0 && logLeaks.length === 0, JSON.stringify(logLeaks.slice(0, 3)));
  check('no captured line holds a JSON parse message or an Error dump',
    logLines.every((line) => !PARSE_MESSAGE_RE.test(line) && !/\bat .+:\d+:\d+/.test(line)));
  check('the injected log holds one decision line per upstream attempt (11)',
    sink.lines.filter((line) => line.startsWith('[jev] decision ')).length === 11, JSON.stringify(sink.lines));

  const cells = ledgerCells(db);
  const cellLeaks = cells.filter((cell) => leaks(cell.value, extra).length > 0);
  check(`ledger cells scanned: ${cells.length} (jev_decisions + jev_daily), none leaks`,
    cells.length > 0 && cellLeaks.length === 0, JSON.stringify(cellLeaks.slice(0, 3)));
  check('no ledger cell holds an origin-like or path-like value',
    cells.every((cell) => !/https?:\/\//i.test(cell.value) && !cell.value.startsWith('/')));
  db.close();
}

// ---------------------------------------------------------------------------
// 4. Static source bans (comments stripped, line numbers kept)
// ---------------------------------------------------------------------------

// Adapted from tests/server-no-ip-leak.test.js; comments are blanked rather
// than removed so reported line numbers match the file.
function stripComments(s) {
  let out = s.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ''));
  out = out.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return out;
}

const STATIC_BANS = [
  { name: 'err.message', re: /\berr\.message\b/ },
  { name: 'error.message', re: /\berror\.message\b/ },
  { name: 'e.message', re: /\be\.message\b/ },
  { name: '.stack', re: /\.stack\b/ },
  { name: 'console.error(err', re: /console\.error\(\s*err\b/ },
  { name: 'req.ip', re: /\breq\.ip\b/ },
  { name: 'clientIp(', re: /\bclientIp\(/ },
  { name: 'validateHashKey', re: /\bvalidateHashKey\b/ },
  { name: "require('../middleware/auth')", re: /require\(\s*['"]\.\.\/middleware\/auth['"]\s*\)/ },
  { name: 'long-context', re: /long-context/i },
  { name: 'Danger-Zone', re: /Danger-Zone/i },
  { name: 'a TypeSafe SDK', re: /require\(\s*['"]@typesafe-ai[^'"]*['"]\s*\)|from\s+['"]@typesafe-ai/ },
  { name: 'an OpenRouter SDK', re: /require\(\s*['"](@openrouter\/[^'"]*|openrouter[^'"]*)['"]\s*\)|from\s+['"](@openrouter\/|openrouter)/ },
];

function staticSection() {
  print('\n--- static source bans (comments stripped) ---');
  const jevDir = path.join(SERVER, 'src', 'jev');
  const files = fs.readdirSync(jevDir)
    .filter((name) => name.endsWith('.js'))
    .sort()
    .map((name) => path.join(jevDir, name));
  files.push(path.join(SERVER, 'src', 'routes', 'jev.js'));
  const violations = [];
  for (const file of files) {
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      for (const ban of STATIC_BANS) {
        if (ban.re.test(line)) violations.push(`${path.relative(ROOT, file)}:${index + 1} -- ${ban.name}`);
      }
    });
  }
  check(`no banned pattern in ${files.length} files (src/jev/*.js + routes/jev.js)`,
    files.length >= 11 && violations.length === 0, violations.join(' | '));
}

// ---------------------------------------------------------------------------
// 5. Spawned server.js boot checks (D-05)
// ---------------------------------------------------------------------------

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child, output, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('server.js did not start in time'));
    }, timeoutMs);
    const onOutput = () => {
      if (!output.text.includes('[FSB Server] Running on')) return;
      cleanup();
      resolve();
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`server.js exited before startup (${code})`));
    };
    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off('data', onOutput);
      child.stderr.off('data', onOutput);
      child.off('exit', onExit);
    }
    child.stdout.on('data', onOutput);
    child.stderr.on('data', onOutput);
    child.once('exit', onExit);
    onOutput();
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function bootServer(jevEnv) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-jev-boot-'));
  const port = await reservePort();
  const output = { text: '' };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: SERVER,
    env: Object.assign({}, process.env, { PORT: String(port), DB_PATH: path.join(tempDir, 'jev-boot.db') }, jevEnv),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const collect = (chunk) => { output.text += chunk.toString(); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  return { child, output, port, tempDir };
}

const JEV_VARS = ['JEV_ENABLED', 'JEV_UPSTREAM_URL', 'JEV_MODEL', 'JEV_API_KEY', 'JEV_INPUT_USD_PER_MTOK',
  'JEV_MAX_CONCURRENCY', 'JEV_UPSTREAM_TIMEOUT_MS', 'JEV_DAILY_USD_CAP'];

function jevEnv(values) {
  const env = {};
  for (const name of JEV_VARS) env[name] = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : '';
  return env;
}

async function spawnSection() {
  print('\n--- spawned server.js with Jev disabled and with an invalid Jev env (D-05, D-06) ---');
  const cases = [
    {
      label: 'JEV_ENABLED false',
      env: jevEnv({ JEV_ENABLED: 'false' }),
      fallback: 'disabled',
      configLines: 0,
    },
    {
      label: 'JEV_ENABLED true with an evil URL, an alias model and a key',
      env: jevEnv({
        JEV_ENABLED: 'true',
        JEV_UPSTREAM_URL: 'https://evil.example/v1/systemone',
        JEV_MODEL: 'jev-latest',
        JEV_API_KEY: BOOT_KEY,
      }),
      fallback: 'not_configured',
      configLines: 1,
    },
  ];
  for (const testCase of cases) {
    const boot = await bootServer(testCase.env);
    try {
      let started = true;
      try {
        await waitForServer(boot.child, boot.output);
      } catch (_e) {
        started = false;
      }
      check(`${testCase.label}: server.js boots`, started, boot.output.text.slice(-400));
      if (!started) continue;
      const res = await send(boot.port, { body: baseRequest() });
      check(`${testCase.label}: POST /api/jev/decide -> 503 '${testCase.fallback}'`,
        res.status === 503 && res.body !== null && res.body.ok === false && res.body.fallback === testCase.fallback
          && res.headers['cache-control'] === 'no-store',
        res.text.slice(0, 300));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const configLines = boot.output.text.split('\n').filter((line) => line.includes('[jev] config invalid'));
      check(`${testCase.label}: ${testCase.configLines} '[jev] config invalid' line(s)`, configLines.length === testCase.configLines,
        JSON.stringify(configLines));
      if (testCase.configLines > 0) {
        check(`${testCase.label}: the config line names variables only`,
          configLines.every((line) => /^\[jev\] config invalid: JEV_[A-Z_]+(,JEV_[A-Z_]+)*$/.test(line.trim())
            && !line.includes('evil.example') && !line.includes('jev-latest')),
          JSON.stringify(configLines));
      }
      check(`${testCase.label}: stdout/stderr never contain the key`,
        !boot.output.text.includes(BOOT_KEY) && !boot.output.text.includes('sk-boot'));
      check(`${testCase.label}: no '[jev] gateway enabled' line`, !boot.output.text.includes('[jev] gateway enabled'));
    } finally {
      await stopServer(boot.child);
      fs.rmSync(boot.tempDir, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------

async function main() {
  print('--- jev-gateway-log-hygiene (JEV-02, JEV-03, D-22, SC3) ---');
  check('showcase/server/src/routes/jev.js exports createJevRouter', typeof createJevRouter === 'function');
  if (typeof createJevRouter === 'function') await inProcessSection();
  staticSection();
  await spawnSection();
  await new Promise((resolve) => setTimeout(resolve, 20));
  check('no unhandled rejection', unhandledRejections === 0, String(unhandledRejections));
}

const suiteStarted = Date.now();
setTimeout(() => {
  stopCapture();
  print(`  FAIL: suite watchdog fired after ${SUITE_WATCHDOG_MS} ms`);
  print(`\n=== jev-gateway-log-hygiene results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
}, SUITE_WATCHDOG_MS).unref();

main()
  .catch((error) => {
    stopCapture();
    failed += 1;
    print(`  FAIL: suite crashed -- ${error && error.name}`);
  })
  .then(() => {
    stopCapture();
    print(`\n=== jev-gateway-log-hygiene results: ${passed} passed, ${failed} failed (${Date.now() - suiteStarted} ms) ===`);
    process.exit(failed > 0 ? 1 : 0);
  });
