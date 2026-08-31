/**
 * Phase 273 / INGEST-07(e) -- timestamp tolerance window.
 *
 * Drop event if ts_minute > now + 5min (clock skew tolerance).
 * Drop event if ts_minute < now - 7d  (replay attack window).
 * Only the OFFENDING events are dropped; the rest of the batch is processed.
 * If ANY events were dropped, return 400 timestamp_out_of_window AFTER inserting
 * the accepted events.
 *
 * Run: node tests/server-telemetry-timestamp-tolerance.test.js
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

function event(ts, install_uuid) {
  return {
    event_id: uuidv4(),
    install_uuid: install_uuid || uuidv4(),
    ts_minute: ts,
    mcp_client: 'Claude',
    model: 'm',
    tokens_in: 1,
    tokens_out: 1,
    active_agent_count: 0,
    event_type: 'periodic',
  };
}

function post(events) {
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
  console.log('--- server-telemetry-timestamp-tolerance (INGEST-07e) ---');

  const now = Date.now();
  // 10 min in the future (> now+5min): dropped.
  const tooFar = now + 10 * 60 * 1000;
  // 8 days old (< now-7d): dropped.
  const tooOld = now - 8 * 24 * 60 * 60 * 1000;
  // Valid: now.
  const okTs = now;

  const batchInstallUuid = uuidv4();
  const futureEvent = event(tooFar, batchInstallUuid);
  const oldEvent = event(tooOld, batchInstallUuid);
  const validEvent = event(okTs, batchInstallUuid);

  const r1 = await post([futureEvent, oldEvent, validEvent]);
  let p1 = null; try { p1 = JSON.parse(r1.body); } catch {}
  check('mixed batch (2 dropped, 1 valid) -> 400', r1.statusCode === 400, `got ${r1.statusCode}, body=${r1.body}`);
  check('error === timestamp_out_of_window', p1 && p1.error === 'timestamp_out_of_window', `body=${r1.body}`);
  check('dropped_timestamps === 2', p1 && p1.dropped_timestamps === 2, `body=${r1.body}`);
  check('accepted === 1 (valid event)', p1 && p1.accepted === 1, `body=${r1.body}`);
  check('inserted === 1 (the valid event landed)', p1 && p1.inserted === 1, `body=${r1.body}`);

  // SELECT COUNT confirms exactly 1 row stored.
  const stored = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get().c;
  check('exactly 1 row stored in DB', stored === 1, `got ${stored}`);

  // Confirm it's the valid event (its event_id is in the table).
  const present = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events WHERE event_id = ?').get(validEvent.event_id).c;
  check('the valid event_id is the row that landed', present === 1, `got ${present}`);

  // Boundary: exactly +5 min in the future is ACCEPTED (the test is "> now+5min" strict greater).
  // Use +4.5 min to avoid race with Date.now().
  const boundaryFuture = event(now + 4.5 * 60 * 1000);
  const r2 = await post([boundaryFuture]);
  check('+4.5 min event accepted (inside +5min window)', r2.statusCode === 200, `got ${r2.statusCode}, body=${r2.body}`);

  // Boundary: 6.99 days old is ACCEPTED (inside the 7d replay window).
  const boundaryOld = event(now - 6.99 * 24 * 60 * 60 * 1000);
  const r3 = await post([boundaryOld]);
  check('6.99-day-old event accepted (inside -7d window)', r3.statusCode === 200, `got ${r3.statusCode}, body=${r3.body}`);

  // ALL events dropped (no surviving inserts) -> still 400 timestamp_out_of_window with accepted=0.
  const droppedBatchUuid = uuidv4();
  const r4 = await post([event(tooFar, droppedBatchUuid), event(tooOld, droppedBatchUuid)]);
  let p4 = null; try { p4 = JSON.parse(r4.body); } catch {}
  check('all-events-dropped -> 400', r4.statusCode === 400, `got ${r4.statusCode}, body=${r4.body}`);
  check('all-events-dropped: accepted === 0', p4 && p4.accepted === 0, `body=${r4.body}`);
  check('all-events-dropped: dropped_timestamps === 2', p4 && p4.dropped_timestamps === 2, `body=${r4.body}`);

  server.close();
  db.close();

  console.log(`\n=== server-telemetry-timestamp-tolerance results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
