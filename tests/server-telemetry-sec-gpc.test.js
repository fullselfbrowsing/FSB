/**
 * Phase 273 / INGEST-10 + T-273-10 -- Sec-GPC: 1 honor.
 *
 * A valid batch carrying header `Sec-GPC: 1` returns 204 with empty body
 * and zero rows written. The privacy short-circuit fires BEFORE the hashIp
 * call BEFORE the row insertion.
 *
 * Run: node tests/server-telemetry-sec-gpc.test.js
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
    tokens_in: 100,
    tokens_out: 50,
    active_agent_count: 1,
    event_type: 'periodic',
  };
}

function postWithGpc(events, gpcValue) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ events });
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    };
    if (gpcValue !== undefined) headers['Sec-GPC'] = gpcValue;
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers,
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
  console.log('--- server-telemetry-sec-gpc (INGEST-10) ---');

  // Build a 50-event batch -- worst-case work that should be skipped entirely on Sec-GPC:1.
  const installUuid = uuidv4();
  const batch = Array.from({ length: 50 }, () => evt(installUuid));

  const r1 = await postWithGpc(batch, '1');
  check('Sec-GPC: 1 -> 204', r1.statusCode === 204, `got ${r1.statusCode}, body=${r1.body}`);
  check('Sec-GPC: 1 -> empty body', r1.body === '' || r1.body == null, `body=${JSON.stringify(r1.body)}`);

  const stored = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get().c;
  check('zero rows written on Sec-GPC: 1', stored === 0, `got ${stored}`);

  // Sanity: without the header, the same batch DOES land.
  const r2 = await postWithGpc(batch.map((e) => ({ ...e, event_id: uuidv4() })), undefined);
  check('without Sec-GPC -> 200 (sanity)', r2.statusCode === 200, `got ${r2.statusCode}, body=${r2.body}`);
  const storedAfter = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get().c;
  check('50 rows after the no-GPC batch (sanity)', storedAfter === 50, `got ${storedAfter}`);

  // Sec-GPC: 0 is NOT honored (only "1" -> drop). Send an event with Sec-GPC: 0 -- should land.
  const evRow = evt();
  const r3 = await postWithGpc([evRow], '0');
  check('Sec-GPC: 0 -> 200 (only "1" triggers the drop)', r3.statusCode === 200, `got ${r3.statusCode}, body=${r3.body}`);

  server.close();
  db.close();

  console.log(`\n=== server-telemetry-sec-gpc results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
