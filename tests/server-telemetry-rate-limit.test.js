/**
 * Phase 273 / INGEST-02 + INGEST-07(c) -- per-IP-hash rate limit invariants.
 *
 * 30 valid 1-event batches in 60s -> all 200.
 * 31st batch in the same window -> 429 with RFC 9239 RateLimit-* headers.
 *
 * Zero-dep: pure Node + http.createServer + Express telemetry router.
 *
 * Run: node tests/server-telemetry-rate-limit.test.js
 */

'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');

// Force the rate-limit middleware's default cap (env override absent).
delete process.env.TELEMETRY_RATE_MAX;

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const { hashIp } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'utils', 'telemetry-hash'));
const createTelemetryRouter = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'telemetry'));
const { resetPerUuidBudget } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'telemetry-rate-limit'));

resetPerUuidBudget();

const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);
const app = express();
app.set('trust proxy', 1);
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
const server = http.createServer(app).listen(0);
const port = server.address().port;

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function uuidv4() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const FIXED_INSTALL_UUID = uuidv4();

function makeValidEvent() {
  return {
    event_id: uuidv4(),
    install_uuid: FIXED_INSTALL_UUID,
    ts_minute: Date.now(),
    mcp_client: 'Claude',
    model: 'claude-opus-4-7',
    tokens_in: 100,
    tokens_out: 50,
    active_agent_count: 1,
    event_type: 'periodic',
  };
}

function postBatch() {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ events: [makeValidEvent()] });
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async function main() {
  console.log('--- server-telemetry-rate-limit (INGEST-02 + INGEST-07c) ---');
  // 30 should succeed (200).
  const results = [];
  for (let i = 0; i < 31; i++) {
    results.push(await postBatch());
  }

  // requests 1..30
  let firstNon200 = -1;
  for (let i = 0; i < 30; i++) {
    if (results[i].statusCode !== 200) {
      firstNon200 = i;
      break;
    }
  }
  check('requests 1..30 all return 200', firstNon200 === -1, `first non-200 at index ${firstNon200}, status=${firstNon200 >= 0 ? results[firstNon200].statusCode : 'n/a'}, body=${firstNon200 >= 0 ? results[firstNon200].body : 'n/a'}`);

  // request 31 -> 429
  check('request 31 returns 429', results[30].statusCode === 429, `got ${results[30].statusCode}, body=${results[30].body}`);

  // RFC 9239 / draft-7 emits the combined `RateLimit` header of the form
  //   limit=30, remaining=0, reset=...
  // Plus the `RateLimit-Policy` header (limit and window). Node lowercases headers.
  const h = results[30].headers;
  const combined = h['ratelimit'] || h['RateLimit'];
  const policy = h['ratelimit-policy'] || h['RateLimit-Policy'];
  check('429 carries RateLimit combined header (RFC 9239 / draft-7)', typeof combined === 'string' && combined.length > 0, `headers: ${JSON.stringify(Object.keys(h))}`);
  check('429 carries RateLimit-Policy header', typeof policy === 'string' && policy.length > 0, `headers: ${JSON.stringify(Object.keys(h))}`);
  if (combined) {
    // Parse `limit=30, remaining=0, reset=...`
    const remainingMatch = /remaining=(\d+)/.exec(combined);
    check('RateLimit header contains remaining=0', remainingMatch && remainingMatch[1] === '0', `combined header: ${combined}`);
    const limitMatch = /limit=(\d+)/.exec(combined);
    check('RateLimit header contains limit=30', limitMatch && limitMatch[1] === '30', `combined header: ${combined}`);
  }

  server.close();
  db.close();

  console.log(`\n=== server-telemetry-rate-limit results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
