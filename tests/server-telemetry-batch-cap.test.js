/**
 * Phase 273 / INGEST-07(b) -- 50-event batch cap.
 *
 * 51 events in one batch -> 400 batch_too_large.
 * 50 events accepted (sanity).
 *
 * Run: node tests/server-telemetry-batch-cap.test.js
 */

'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');

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

function evt(installUuid) {
  return {
    event_id: uuidv4(),
    install_uuid: installUuid || uuidv4(),
    ts_minute: Date.now(),
    mcp_client: 'Claude',
    model: 'm',
    tokens_in: 1,
    tokens_out: 1,
    active_agent_count: 0,
    event_type: 'periodic',
  };
}

function postEvents(events) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ events });
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

(async function main() {
  console.log('--- server-telemetry-batch-cap (INGEST-07b) ---');

  const installUuid = uuidv4();
  const batch51 = Array.from({ length: 51 }, () => evt(installUuid));
  const r1 = await postEvents(batch51);
  check('51 events -> 400', r1.statusCode === 400, `got ${r1.statusCode}, body=${r1.body}`);
  let parsed1 = null;
  try { parsed1 = JSON.parse(r1.body); } catch {}
  check('51 events -> error: batch_too_large', parsed1 && parsed1.error === 'batch_too_large', `body=${r1.body}`);
  check('51 events -> response includes max:50', parsed1 && parsed1.max === 50, `body=${r1.body}`);
  check('51 events -> response includes got:51', parsed1 && parsed1.got === 51, `body=${r1.body}`);

  const batch50 = Array.from({ length: 50 }, () => evt(installUuid));
  const r2 = await postEvents(batch50);
  check('50 events -> 200 (sanity, cap boundary inclusive)', r2.statusCode === 200, `got ${r2.statusCode}, body=${r2.body}`);

  server.close();
  db.close();

  console.log(`\n=== server-telemetry-batch-cap results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
