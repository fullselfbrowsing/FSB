/**
 * Parser failures still consume the /events per-IP burst budget.
 *
 * Run: node tests/server-telemetry-parser-rate-limit.test.js
 */

'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');

process.env.TELEMETRY_RATE_MAX = '1';

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));
const { initializeDatabase } = require('../showcase/server/src/db/schema');
const Queries = require('../showcase/server/src/db/queries');
const { createGlobalJsonParser } = require('../showcase/server/src/middleware/global-json-parser');
const createTelemetryRouter = require('../showcase/server/src/routes/telemetry');
const { hashIp } = require('../showcase/server/src/utils/telemetry-hash');
const { resetPerUuidBudget } = require('../showcase/server/src/middleware/telemetry-rate-limit');

resetPerUuidBudget();
const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);
const app = express();
app.set('trust proxy', 1);
app.use(createGlobalJsonParser());
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
// Same final fallback semantics as production. Parser-specific responses must
// already have been handled by the telemetry router without echoing the body.
app.use((err, _req, res, _next) => {
  if (err && (err.status === 413 || err.type === 'entity.too.large')) {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app).listen(0);
const port = server.address().port;

function postRaw(raw, forwardedFor) {
  const body = Buffer.from(raw);
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
        'X-Forwarded-For': forwardedFor,
      },
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: responseBody }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function parsed(response) {
  try { return JSON.parse(response.body); } catch { return null; }
}

(async () => {
  const oversizeIp = '203.0.113.10';
  const oversize = JSON.stringify({ events: [], filler: 'x'.repeat(33 * 1024) });
  const oversizeResponse = await postRaw(oversize, oversizeIp);
  assert.strictEqual(oversizeResponse.status, 413);
  assert.deepStrictEqual(parsed(oversizeResponse), { error: 'payload_too_large' });
  const afterOversize = await postRaw('{"events":[]}', oversizeIp);
  assert.strictEqual(afterOversize.status, 429, 'oversize parser attempt must consume the IP budget');

  const malformedIp = '203.0.113.11';
  const malformedResponse = await postRaw('{"events":[', malformedIp);
  assert.strictEqual(malformedResponse.status, 400);
  assert.deepStrictEqual(parsed(malformedResponse), { error: 'invalid_json' });
  assert.ok(!malformedResponse.body.includes('{"events":['), 'response must not echo malformed content');
  const afterMalformed = await postRaw('{"events":[]}', malformedIp);
  assert.strictEqual(afterMalformed.status, 429, 'malformed parser attempt must consume the IP budget');

  const cleanIp = '203.0.113.12';
  const cleanResponse = await postRaw('{"events":[]}', cleanIp);
  assert.strictEqual(cleanResponse.status, 204, 'a fresh IP still reaches the route');
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM telemetry_events').get().n, 0);

  server.close();
  db.close();
  delete process.env.TELEMETRY_RATE_MAX;
  console.log('telemetry parser/rate-limit ordering: all assertions passed');
})().catch((error) => {
  server.close();
  db.close();
  delete process.env.TELEMETRY_RATE_MAX;
  console.error(error);
  process.exit(1);
});
