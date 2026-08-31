/**
 * Phase 273 / INGEST-08 + INGEST-12 + D-14 -- /optout and /forget invariants.
 *
 * - POST /optout {install_uuid:A} -> 204 (whether rows existed or not; no enumeration).
 * - POST /forget {install_uuid:A} -> 204 (same contract; GDPR Article 17).
 * - Both DELETE from telemetry_events AND telemetry_rollups_daily for the UUID.
 * - Malformed install_uuid -> 400 invalid_install_uuid.
 *
 * Run: node tests/server-telemetry-optout-forget.test.js
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
const {
  checkPerUuidBudget,
  getPerUuidBudgetSizeForTest,
  resetPerUuidBudget,
} = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'telemetry-rate-limit'));
const activeTracker = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'active-tracker'));

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

function post(routePath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: `/api/telemetry${routePath}`,
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
  console.log('--- server-telemetry-optout-forget (INGEST-08 + INGEST-12) ---');

  // Seed: 3 events + 1 rollup for install_uuid A.
  const A = uuidv4();
  const B = uuidv4();  // present but a different UUID
  const C = uuidv4();  // never seen

  for (let i = 0; i < 3; i++) {
    queries.insertTelemetryEvent.run(uuidv4(), A, Date.now(), 'Claude', 'm', 1, 1, 0, 'periodic', 'hash-A', Date.now());
  }
  queries.insertTelemetryEvent.run(uuidv4(), B, Date.now(), 'Codex', 'm', 1, 1, 0, 'periodic', 'hash-B', Date.now());
  queries.upsertRollupDaily.run(A, '2026-05-14', 100, 50, 2, 3);
  queries.upsertRollupDaily.run(B, '2026-05-14', 10, 5, 1, 1);
  activeTracker._resetForTest();
  const activeNow = Date.now();
  activeTracker.recordSeen(A, 2, activeNow);
  activeTracker.recordSeen(B, 1, activeNow);
  checkPerUuidBudget(A, activeNow);
  checkPerUuidBudget(B, activeNow);

  // Pre-condition checks.
  const aBefore = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events WHERE install_uuid = ?').get(A).c;
  const bBefore = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events WHERE install_uuid = ?').get(B).c;
  const aRollupBefore = db.prepare('SELECT COUNT(*) AS c FROM telemetry_rollups_daily WHERE install_uuid = ?').get(A).c;
  check('seed: 3 events for A', aBefore === 3, `got ${aBefore}`);
  check('seed: 1 event for B', bBefore === 1, `got ${bBefore}`);
  check('seed: 1 rollup for A', aRollupBefore === 1, `got ${aRollupBefore}`);

  // POST /optout with valid UUID A.
  const r1 = await post('/optout', { install_uuid: A });
  check('/optout {A} -> 204', r1.statusCode === 204, `got ${r1.statusCode}, body=${r1.body}`);
  const aAfter = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events WHERE install_uuid = ?').get(A).c;
  const aRollupAfter = db.prepare('SELECT COUNT(*) AS c FROM telemetry_rollups_daily WHERE install_uuid = ?').get(A).c;
  check('/optout {A} deleted all events for A', aAfter === 0, `got ${aAfter}`);
  check('/optout {A} deleted all rollups for A', aRollupAfter === 0, `got ${aRollupAfter}`);
  check('/optout {A} removed A from active-now memory', activeTracker.countActiveUsers(10 * 60 * 1000, activeNow) === 1, 'expected only B to remain');
  check('/optout {A} released A from per-UUID budget memory', getPerUuidBudgetSizeForTest() === 1, `got ${getPerUuidBudgetSizeForTest()}`);

  // Other UUID's rows untouched.
  const bAfter = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events WHERE install_uuid = ?').get(B).c;
  check('/optout {A} did NOT touch B rows', bAfter === 1, `got ${bAfter}`);

  // POST /optout with non-existent UUID C -> 204 (no enumeration leak).
  const r2 = await post('/optout', { install_uuid: C });
  check('/optout {non-existent C} -> 204 (no enumeration)', r2.statusCode === 204, `got ${r2.statusCode}, body=${r2.body}`);

  // POST /forget with valid UUID B -> 204 + rows deleted.
  const r3 = await post('/forget', { install_uuid: B });
  check('/forget {B} -> 204', r3.statusCode === 204, `got ${r3.statusCode}, body=${r3.body}`);
  const bFinal = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events WHERE install_uuid = ?').get(B).c;
  check('/forget {B} deleted all events for B', bFinal === 0, `got ${bFinal}`);
  check('/forget {B} removed B from active-now memory', activeTracker.countActiveUsers(10 * 60 * 1000, activeNow) === 0, 'expected no live installs');
  check('/forget {B} released B from per-UUID budget memory', getPerUuidBudgetSizeForTest() === 0, `got ${getPerUuidBudgetSizeForTest()}`);

  // POST /forget with malformed UUID -> 400.
  const r4 = await post('/forget', { install_uuid: 'not-a-uuid' });
  check('/forget {malformed} -> 400', r4.statusCode === 400, `got ${r4.statusCode}, body=${r4.body}`);
  let p4 = null; try { p4 = JSON.parse(r4.body); } catch {}
  check('/forget {malformed} -> error: invalid_install_uuid', p4 && p4.error === 'invalid_install_uuid', `body=${r4.body}`);

  // POST /optout with malformed UUID -> 400 (same gate).
  const r5 = await post('/optout', { install_uuid: '' });
  check('/optout {empty} -> 400', r5.statusCode === 400, `got ${r5.statusCode}, body=${r5.body}`);

  // POST /optout with missing body field -> 400.
  const r6 = await post('/optout', {});
  check('/optout {missing field} -> 400', r6.statusCode === 400, `got ${r6.statusCode}, body=${r6.body}`);

  // /optout is NOT rate-limited (privacy operation must always succeed).
  // Smoke: 50 rapid optouts all succeed (200 or 204).
  for (let i = 0; i < 50; i++) {
    const r = await post('/optout', { install_uuid: uuidv4() });
    if (r.statusCode !== 204) {
      check(`rapid /optout #${i + 1} -> 204 (no rate limit)`, false, `got ${r.statusCode}, body=${r.body}`);
      break;
    }
  }
  check('50 rapid /optout calls all 204 (no rate limit on privacy ops)', true, '');

  server.close();
  db.close();

  console.log(`\n=== server-telemetry-optout-forget results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
