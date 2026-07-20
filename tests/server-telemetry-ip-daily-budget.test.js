/**
 * Daily hashed-IP contribution ceilings prevent UUID rotation and extreme
 * numeric submissions from dominating public telemetry totals.
 *
 * Run: node tests/server-telemetry-ip-daily-budget.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const path = require('path');

process.env.TELEMETRY_RATE_MAX = '1000';
process.env.TELEMETRY_IP_DAILY_UUID_MAX = '2';
process.env.TELEMETRY_IP_DAILY_TOKEN_MAX = '10';

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));
const { initializeDatabase } = require('../showcase/server/src/db/schema');
const Queries = require('../showcase/server/src/db/queries');
const createTelemetryRouter = require('../showcase/server/src/routes/telemetry');
const { hashIp } = require('../showcase/server/src/utils/telemetry-hash');
const activeTracker = require('../showcase/server/src/telemetry/active-tracker');
const {
  PER_IP_DAILY_TOKEN_BUDGET,
  PER_IP_DAILY_UUID_BUDGET,
  resetPerUuidBudget,
} = require('../showcase/server/src/middleware/telemetry-rate-limit');

assert.strictEqual(PER_IP_DAILY_UUID_BUDGET, 2, 'UUID ceiling must be env-overridable');
assert.strictEqual(PER_IP_DAILY_TOKEN_BUDGET, 10, 'token ceiling must be env-overridable');

resetPerUuidBudget();
activeTracker._resetForTest();
const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);
const app = express();
app.set('trust proxy', 1);
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
const server = http.createServer(app).listen(0);
const port = server.address().port;

function uuidv4() {
  return crypto.randomUUID();
}

function event(installUuid, totalTokens, eventId = uuidv4(), activeAgents = 1) {
  return {
    event_id: eventId,
    install_uuid: installUuid,
    ts_minute: Date.now(),
    mcp_client: 'Codex',
    model: 'gpt-5',
    tokens_in: totalTokens,
    tokens_out: 0,
    active_agent_count: activeAgents,
    event_type: 'periodic',
    active_count_version: 2,
  };
}

function post(events, forwardedFor) {
  const payload = Buffer.from(JSON.stringify({ events }));
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        'X-Forwarded-For': forwardedFor,
      },
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function json(response) {
  try { return JSON.parse(response.body); } catch { return null; }
}

(async () => {
  const sharedIp = '198.51.100.30';
  const otherIp = '198.51.100.31';
  const installA = uuidv4();
  const installB = uuidv4();
  const installC = uuidv4();

  const eventA1 = event(installA, 4, uuidv4(), 64);
  const eventB1 = event(installB, 2, uuidv4(), 64);
  assert.strictEqual((await post([eventA1], sharedIp)).status, 200);
  assert.strictEqual((await post([eventB1], sharedIp)).status, 200);
  assert.strictEqual(activeTracker.countActiveUsers(10 * 60 * 1000), 2);
  assert.strictEqual(
    activeTracker.getActiveAgentSum(10 * 60 * 1000),
    64,
    'one daily hashed IP can contribute at most 64 active agents across rotating UUIDs',
  );

  const rotatedUuid = await post([event(installC, 0)], sharedIp);
  assert.strictEqual(rotatedUuid.status, 429);
  assert.strictEqual(json(rotatedUuid).reason, 'distinct_install_uuids');
  assert.strictEqual(rotatedUuid.headers['x-fsb-reason'], 'per-ip-uuid-budget');
  assert.ok(Number(rotatedUuid.headers['retry-after']) > 0);
  assert.strictEqual(activeTracker.countActiveUsers(10 * 60 * 1000), 2, 'rejected rotation never enters active-now');

  const eventA2 = event(installA, 4);
  assert.strictEqual((await post([eventA2], sharedIp)).status, 200, 'known UUID may use remaining token headroom');

  const mismatchedReplay = event(installC, 0, eventA2.event_id);
  const mismatchedResponse = await post([mismatchedReplay], sharedIp);
  assert.strictEqual(mismatchedResponse.status, 400, 'event IDs cannot be rebound to rotating UUIDs');
  assert.strictEqual(json(mismatchedResponse).error, 'event_id_identity_mismatch');

  const tooManyTokens = await post([event(installA, 1)], sharedIp);
  assert.strictEqual(tooManyTokens.status, 429);
  assert.strictEqual(json(tooManyTokens).reason, 'token_contribution');
  assert.strictEqual(tooManyTokens.headers['x-fsb-reason'], 'per-ip-token-budget');

  // Retrying a previously inserted event is still idempotent at the ceiling.
  const replay = await post([eventA2], sharedIp);
  assert.strictEqual(replay.status, 200);
  assert.strictEqual(json(replay).inserted, 0);

  // The cap is scoped to the daily HMAC IP identity, not global UUID traffic.
  assert.strictEqual((await post([event(installC, 1, uuidv4(), 64)], otherIp)).status, 200);
  assert.strictEqual(activeTracker.countActiveUsers(10 * 60 * 1000), 3);
  assert.strictEqual(activeTracker.getActiveAgentSum(10 * 60 * 1000), 128);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM telemetry_events').get().n, 4);

  server.close();
  db.close();
  delete process.env.TELEMETRY_RATE_MAX;
  delete process.env.TELEMETRY_IP_DAILY_UUID_MAX;
  delete process.env.TELEMETRY_IP_DAILY_TOKEN_MAX;
  console.log('telemetry per-IP daily contribution budgets: all assertions passed');
})().catch((error) => {
  server.close();
  db.close();
  console.error(error);
  process.exit(1);
});
