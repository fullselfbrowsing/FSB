/**
 * Fly-Client-IP must drive telemetry hash + region, not Express req.ip.
 *
 * On Fly, trust proxy 1 resolves req.ip to the app anycast hop (SJC → US-CA)
 * or a 6PN IPv6 (unknown). This test sets X-Forwarded-For to a California-looking
 * address and Fly-Client-IP to the fixture's India range, then asserts the
 * stored region is IN-Maharashtra/Mumbai and that two Fly-Client-IP values do not
 * share one ip_hash (the production 20/20 cap bug).
 *
 * Run: node tests/server-client-ip-geo.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const path = require('path');

process.env.TELEMETRY_RATE_MAX = '1000';
process.env.DBIP_DATASET_PATH = path.join(
  __dirname, '..', 'showcase', 'server', 'data', 'dbip-city-lite.fixture.csv'
);

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));
const { initializeDatabase } = require('../showcase/server/src/db/schema');
const Queries = require('../showcase/server/src/db/queries');
const createTelemetryRouter = require('../showcase/server/src/routes/telemetry');
const { hashIp } = require('../showcase/server/src/utils/telemetry-hash');
const { clientIp } = require('../showcase/server/src/utils/client-ip');
const ipGeo = require('../showcase/server/src/utils/ip-geo');
const activeTracker = require('../showcase/server/src/telemetry/active-tracker');
const { resetPerUuidBudget } = require('../showcase/server/src/middleware/telemetry-rate-limit');

ipGeo._resetForTest();
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

function event() {
  return {
    event_id: crypto.randomUUID(),
    install_uuid: crypto.randomUUID(),
    ts_minute: Date.now(),
    mcp_client: 'Codex',
    model: 'gpt-5',
    tokens_in: 1,
    tokens_out: 0,
    active_agent_count: 1,
    event_type: 'periodic',
    active_count_version: 2,
  };
}

function post(body, headers) {
  const payload = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'POST',
      host: '127.0.0.1',
      port,
      path: '/api/telemetry/events',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: text }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

(async () => {
  assert.strictEqual(clientIp({ get: () => '  20.20.20.200  ', ip: '8.8.8.8' }), '20.20.20.200');
  assert.strictEqual(clientIp({ get: () => '', ip: '8.8.8.8' }), '8.8.8.8');
  assert.strictEqual(clientIp({ get: () => '   ', ip: '8.8.8.8' }), '8.8.8.8');

  const flyAnycast = '8.8.8.8'; // fixture US/California -- stands in for SJC
  const indiaClient = '20.20.20.200'; // fixture IN/Maharashtra/Mumbai
  const nyClient = '9.9.9.100'; // fixture US/New York

  const indiaRes = await post({ events: [event()] }, {
    'X-Forwarded-For': flyAnycast,
    'Fly-Client-IP': indiaClient,
  });
  assert.strictEqual(indiaRes.status, 200, indiaRes.body);

  const nyRes = await post({ events: [event()] }, {
    'X-Forwarded-For': flyAnycast,
    'Fly-Client-IP': nyClient,
  });
  assert.strictEqual(nyRes.status, 200, nyRes.body);

  const rows = db.prepare(
    'SELECT region, COUNT(DISTINCT ip_hash) AS hashes, COUNT(*) AS n FROM telemetry_events GROUP BY region ORDER BY region'
  ).all();
  const byRegion = Object.fromEntries(rows.map((r) => [r.region, r]));
  assert.ok(byRegion['IN-Maharashtra/Mumbai'], `expected IN-Maharashtra/Mumbai, got ${JSON.stringify(rows)}`);
  assert.ok(byRegion['US-NY/New York'], `expected US-NY/New York, got ${JSON.stringify(rows)}`);
  assert.strictEqual(byRegion['IN-Maharashtra/Mumbai'].n, 1);
  assert.strictEqual(byRegion['US-NY/New York'].n, 1);
  assert.ok(!rows.some((r) => r.region.startsWith('US-CA')), `Fly anycast must not win geo, got ${JSON.stringify(rows)}`);

  const hashCount = db.prepare('SELECT COUNT(DISTINCT ip_hash) AS c FROM telemetry_events').get().c;
  assert.strictEqual(hashCount, 2, `two client IPs must not collapse onto one hash, got ${hashCount}`);

  const mappedRes = await post({ events: [event()] }, {
    'X-Forwarded-For': flyAnycast,
    'Fly-Client-IP': '::ffff:20.20.20.200',
  });
  assert.strictEqual(mappedRes.status, 200, mappedRes.body);
  const indiaCount = db.prepare(
    "SELECT COUNT(*) AS n FROM telemetry_events WHERE region = 'IN-Maharashtra/Mumbai'"
  ).get().n;
  assert.strictEqual(indiaCount, 2, 'IPv4-mapped Fly-Client-IP must geolocate as India');

  const kinds = db.prepare(
    "SELECT DISTINCT geo_kind FROM telemetry_events WHERE region = 'IN-Maharashtra/Mumbai' ORDER BY 1"
  ).all().map((r) => r.geo_kind);
  assert.deepStrictEqual(kinds, ['ipv4', 'ipv4-mapped']);

  const ipv6Res = await post({ events: [event()] }, {
    'X-Forwarded-For': flyAnycast,
    'Fly-Client-IP': '2405:201:e00:1::1',
  });
  assert.strictEqual(ipv6Res.status, 200, ipv6Res.body);
  const indiaIpv6 = db.prepare(
    "SELECT region, geo_kind FROM telemetry_events WHERE geo_kind = 'ipv6'"
  ).get();
  assert.ok(indiaIpv6, 'native IPv6 Fly-Client-IP must insert a row');
  assert.strictEqual(indiaIpv6.region, 'IN-Maharashtra/Mumbai');
  const indiaCountAfterV6 = db.prepare(
    "SELECT COUNT(*) AS n FROM telemetry_events WHERE region = 'IN-Maharashtra/Mumbai'"
  ).get().n;
  assert.strictEqual(indiaCountAfterV6, 3, 'IPv4 + mapped + native IPv6 India');

  server.close();
  db.close();
  delete process.env.TELEMETRY_RATE_MAX;
  console.log('server-client-ip-geo: all assertions passed');
})().catch((error) => {
  server.close();
  db.close();
  console.error(error);
  process.exit(1);
});
