/**
 * Phase 274 / AGG-01..09 + STATS-04 -- public-stats /global endpoint shape.
 *
 * Mounts the public-stats router plus the telemetry router (so we can POST
 * events into active-tracker), seeds telemetry_rollups_daily +
 * telemetry_global_aggregates, then asserts the FSBTelemetryHeadline shape
 * + ETag + Cache-Control + no-PII invariants.
 *
 * Run: node tests/server-public-stats-headline.test.js
 */

'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');

// Disable per-IP rate-limit pressure for tests that POST many events fast.
delete process.env.TELEMETRY_RATE_MAX;

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const { hashIp } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'utils', 'telemetry-hash'));
const createTelemetryRouter = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'telemetry'));
const publicStatsModule = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'public-stats'));
const createPublicStatsRouter = publicStatsModule;
const { buildHeadlineJson } = publicStatsModule;
const activeTracker = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'active-tracker'));
const { resetPerUuidBudget } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'telemetry-rate-limit'));

resetPerUuidBudget();
activeTracker._resetForTest();
const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);

const app = express();
app.set('trust proxy', 1);
app.use('/api/telemetry', createTelemetryRouter(db, queries, hashIp));
app.use('/api/public-stats', createPublicStatsRouter(db, queries));
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

function postJson(path_, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      method: 'POST', host: '127.0.0.1', port, path: path_,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks }));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

function getJson(path_, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'GET', host: '127.0.0.1', port, path: path_,
      headers: extraHeaders,
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async function main() {
  console.log('--- server-public-stats-headline (AGG-01..09 + STATS-04) ---');

  // --- Seed telemetry_rollups_daily: 3 UUIDs across 2 days. ---
  const UUID_A = '11111111-1111-4111-8111-111111111111';
  const UUID_B = '22222222-2222-4222-8222-222222222222';
  const UUID_C = '33333333-3333-4333-8333-333333333333';
  const TODAY = new Date().toISOString().slice(0, 10);
  // Yesterday in UTC (used only for the rollup seed -- 1 row per UUID per day).
  const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  queries.upsertRollupDailyRow(UUID_A, TODAY, 100, 50, 2, 3);
  queries.upsertRollupDailyRow(UUID_B, TODAY, 200, 100, 1, 2);
  queries.upsertRollupDailyRow(UUID_C, TODAY, 50, 25, 3, 1);
  queries.upsertRollupDailyRow(UUID_A, YESTERDAY, 30, 20, 1, 1);

  // --- Seed telemetry_global_aggregates: 2 rows (today + yesterday). ---
  // popular_mcp_json has a >=k=5 label "Claude" plus an Other bucket (housekeeper
  // would have written this already). We seed it directly here.
  const popularMcpToday = JSON.stringify([
    { label: 'Claude', uniq: 6 },
    { label: 'Other (N=12)', uniq: 12 },
  ]);
  const popularAgentToday = JSON.stringify([
    { label: 'agent-x', uniq: 8 },
  ]);
  queries.upsertGlobalAggregateV2.run(TODAY, 3, 350, 175, 6, popularMcpToday, popularAgentToday, '[]', 0, 2, 3);
  queries.upsertGlobalAggregateV2.run(YESTERDAY, 1, 30, 20, 1, '[]', '[]', '[]', 0, 2, 1);

  // --- POST 3 telemetry events so active-tracker has 3 distinct UUIDs. ---
  // Use the active-tracker's _resetForTest to keep state hermetic.
  activeTracker._resetForTest();
  for (const uuid of [UUID_A, UUID_B, UUID_C]) {
    const ev = {
      event_id: uuidv4(),
      install_uuid: uuid,
      ts_minute: Date.now(),
      mcp_client: 'Claude',
      model: 'm',
      tokens_in: 10,
      tokens_out: 5,
      active_agent_count: uuid === UUID_A ? 2 : uuid === UUID_B ? 1 : 3,
      event_type: 'periodic',
      active_count_version: 2,
    };
    const r = await postJson('/api/telemetry/events', { events: [ev] });
    if (r.statusCode !== 200) {
      console.error(`  WARN: seed POST failed -- status ${r.statusCode} body=${r.body}`);
    }
  }
  check('active-tracker has 3 UUIDs after seed', activeTracker.countActiveUsers(5 * 60 * 1000) === 3,
    `got ${activeTracker.countActiveUsers(5 * 60 * 1000)}`);
  check('active-tracker agent-sum is 6 (2+1+3)', activeTracker.getActiveAgentSum(10 * 60 * 1000) === 6,
    `got ${activeTracker.getActiveAgentSum(10 * 60 * 1000)}`);

  // A heartbeat seven minutes old is outside the former 5m user window but
  // inside the 10m agent window. The headline must use one shared 10m cohort,
  // otherwise its ratio divides 10 agents by only 3 users.
  const UUID_D = '44444444-4444-4444-8444-444444444444';
  const activeSnapshot = Date.now();
  activeTracker.recordSeen(UUID_D, 4, activeSnapshot - 7 * 60 * 1000);
  check('7m-old heartbeat is outside 5m but inside the shared 10m cohort',
    activeTracker.countActiveUsers(5 * 60 * 1000, activeSnapshot) === 3
      && activeTracker.countActiveUsers(10 * 60 * 1000, activeSnapshot) === 4,
    'active cohort boundaries did not match');

  // --- GET /api/public-stats/global. ---
  const r = await getJson('/api/public-stats/global');
  check('GET /global -> 200', r.statusCode === 200, `got ${r.statusCode} body=${r.body.slice(0, 200)}`);
  check('Content-Type is JSON', /application\/json/.test(r.headers['content-type'] || ''),
    `got ${r.headers['content-type']}`);
  check('ETag header present and looks like "<16hex>"', typeof r.headers.etag === 'string' && /^"[a-f0-9]{16}"$/.test(r.headers.etag),
    `got ${r.headers.etag}`);
  check('Cache-Control: max-age=60 header present',
    typeof r.headers['cache-control'] === 'string' && /max-age=60/.test(r.headers['cache-control']),
    `got ${r.headers['cache-control']}`);
  check('No Set-Cookie header (STATS-04 + no-cookie invariant)',
    r.headers['set-cookie'] === undefined,
    `got ${JSON.stringify(r.headers['set-cookie'])}`);

  // --- Parse + validate the body shape. ---
  let body = null;
  try { body = JSON.parse(r.body); } catch {}
  check('body parses as JSON', body !== null, `body=${r.body.slice(0, 200)}`);
  if (body) {
    const expectedFields = [
      'generated_at', 'aggregate_as_of_day', 'aggregate_updated_at',
      'active_users_now', 'active_agents_now', 'active_agents_bucket',
      'active_agents_reporting_users_now', 'active_agents_coverage',
      'active_count_version', 'active_history_since', 'active_history_complete',
      'users_365d', 'total_users', 'agent_days_lifetime',
      'total_agents_lifetime', 'agent_days_since_active_v2', 'tokens_total_lifetime',
      'tokens_24h', 'popular_mcp_clients', 'popular_agents',
      'avg_agents_per_user', 'avg_agents_per_reporting_user',
    ];
    for (const f of expectedFields) {
      check(`body has field '${f}'`, f in body, `body keys=${Object.keys(body)}`);
    }
    check('generated_at is a valid request-generation timestamp',
      typeof body.generated_at === 'string' && Number.isFinite(Date.parse(body.generated_at)),
      `got ${body.generated_at}`);
    check('aggregate source age is explicit even for legacy rows without an update timestamp',
      body.aggregate_as_of_day === TODAY && body.aggregate_updated_at === null,
      `got day=${body.aggregate_as_of_day} updated=${body.aggregate_updated_at}`);
    check('active_users_now === 4 (same 10m cohort as agents)', body.active_users_now === 4, `got ${body.active_users_now}`);
    check('active_agents_now === 10', body.active_agents_now === 10, `got ${body.active_agents_now}`);
    check('active_agents_bucket === "9-16"', body.active_agents_bucket === '9-16', `got ${body.active_agents_bucket}`);
    check('all four active installs supplied v2 agent counts',
      body.active_agents_reporting_users_now === 4 && body.active_agents_coverage === 1,
      `got reporters=${body.active_agents_reporting_users_now} coverage=${body.active_agents_coverage}`);
    check('users_365d === 3 (DISTINCT retained UUIDs)', body.users_365d === 3, `got ${body.users_365d}`);
    check('total_users === 3 (DISTINCT UUIDs in rollups: A,B,C)', body.total_users === 3, `got ${body.total_users}`);
    check('known-corrupt lifetime fields are null while v2 daily peaks sum to 7',
      body.agent_days_lifetime === null
        && body.total_agents_lifetime === null
        && body.agent_days_since_active_v2 === 7,
      `got ${JSON.stringify({ lifetime: body.agent_days_lifetime, v2: body.agent_days_since_active_v2 })}`);
    // tokens lifetime: today (350+175) + yesterday (30+20) = 575
    check('tokens_total_lifetime === 575',
      body.tokens_total_lifetime === 575, `got ${body.tokens_total_lifetime}`);
    check('tokens_24h is a number >= 0', typeof body.tokens_24h === 'number' && body.tokens_24h >= 0,
      `got ${body.tokens_24h}`);
    check('popular_mcp_clients is array of {label,uniq}',
      Array.isArray(body.popular_mcp_clients) && body.popular_mcp_clients.every(
        (x) => typeof x.label === 'string' && Number.isInteger(x.uniq)),
      `got ${JSON.stringify(body.popular_mcp_clients)}`);
    check('popular_mcp_clients includes Claude with uniq=6',
      body.popular_mcp_clients.some((x) => x.label === 'Claude' && x.uniq === 6),
      `got ${JSON.stringify(body.popular_mcp_clients)}`);
    check('popular_agents is array of {label,uniq}',
      Array.isArray(body.popular_agents) && body.popular_agents.every(
        (x) => typeof x.label === 'string' && Number.isInteger(x.uniq)),
      `got ${JSON.stringify(body.popular_agents)}`);
    check('avg_agents_per_user === 2.5 (10/4 from one cohort)',
      body.avg_agents_per_user === 2.5 && body.avg_agents_per_reporting_user === 2.5,
      `got ${body.avg_agents_per_user}/${body.avg_agents_per_reporting_user}`);
  }

  // During the rollout, legacy heartbeats still prove user liveness but their
  // leaked counter is not a valid active-agent report. Coverage and the
  // average denominator must make that partial cohort explicit.
  activeTracker._resetForTest();
  activeTracker.recordSeen(UUID_A, 4, Date.now(), 'mixed-source-a', 2);
  activeTracker.recordSeen(UUID_B, 4_472, Date.now(), 'mixed-source-b', 0);
  const mixedHeadline = buildHeadlineJson(queries);
  check('mixed-version cohort quarantines legacy agents and exposes partial coverage',
    mixedHeadline.active_users_now === 2
      && mixedHeadline.active_agents_now === 4
      && mixedHeadline.active_agents_reporting_users_now === 1
      && mixedHeadline.active_agents_coverage === 0.5,
    `got ${JSON.stringify({
      users: mixedHeadline.active_users_now,
      agents: mixedHeadline.active_agents_now,
      reporters: mixedHeadline.active_agents_reporting_users_now,
      coverage: mixedHeadline.active_agents_coverage,
    })}`);
  check('mixed-version average divides only by current v2 reporters',
    mixedHeadline.avg_agents_per_reporting_user === 4
      && mixedHeadline.avg_agents_per_user === 4,
    `got ${mixedHeadline.avg_agents_per_reporting_user}/${mixedHeadline.avg_agents_per_user}`);

  // Exact rolling-24h semantics use trusted receive time, include both
  // endpoints, and reject events just outside or in the future.
  const TOKENS_NOW = Date.UTC(2030, 0, 2, 12, 0, 0);
  const TOKEN_UUID = '55555555-5555-4555-8555-555555555555';
  const H24 = 24 * 60 * 60 * 1000;
  const tokenBoundaryRows = [
    ['aaaaaaaa-0000-4000-8000-000000000001', TOKENS_NOW - H24, 10],
    ['aaaaaaaa-0000-4000-8000-000000000002', TOKENS_NOW - H24 - 1, 100],
    ['aaaaaaaa-0000-4000-8000-000000000003', TOKENS_NOW, 20],
    ['aaaaaaaa-0000-4000-8000-000000000004', TOKENS_NOW + 1, 1000],
  ];
  for (const [eventId, receivedAt, tokens] of tokenBoundaryRows) {
    queries.insertTelemetryEvent.run(
      eventId, TOKEN_UUID, receivedAt, 'Claude', 'm', tokens, 0, 0,
      'periodic', 'boundary-hash', receivedAt
    );
  }
  const exact24h = queries.getPublicHeadlineRows(TOKENS_NOW).tokens_24h;
  check('tokens_24h includes exact endpoints only (10 + 20 = 30)', exact24h === 30,
    `got ${exact24h}`);

  activeTracker._resetForTest();
  const ACTIVE_BOUNDARY_NOW = Date.UTC(2030, 0, 2, 12, 0, 0);
  const ACTIVE_WINDOW = 10 * 60 * 1000;
  activeTracker.recordSeen(UUID_C, 20, ACTIVE_BOUNDARY_NOW + 1);
  activeTracker.recordSeen(UUID_B, 10, ACTIVE_BOUNDARY_NOW - ACTIVE_WINDOW - 1);
  activeTracker.recordSeen(UUID_A, 2, ACTIVE_BOUNDARY_NOW - ACTIVE_WINDOW);
  const invalidNowIsSafe = activeTracker.countActiveUsers(ACTIVE_WINDOW, Infinity) === 0
    && activeTracker.getActiveAgentSum(ACTIVE_WINDOW, Infinity) === 0;
  check('active cohort includes the exact lower endpoint and excludes older/future entries',
    invalidNowIsSafe
      && activeTracker.countActiveUsers(ACTIVE_WINDOW, ACTIVE_BOUNDARY_NOW) === 1
      && activeTracker.getActiveAgentSum(ACTIVE_WINDOW, ACTIVE_BOUNDARY_NOW) === 2,
    'invalid now mutated state or active exact-boundary cohort was not {A}');

  // --- T-274-01 privacy: no PII in body. ---
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  check('body contains NO UUIDv4-shaped string (privacy)', !UUID_REGEX.test(r.body),
    `body=${r.body.slice(0, 200)}`);
  check('body contains NO literal "ip_hash"', !r.body.includes('ip_hash'), 'leaked ip_hash');
  check('body contains NO literal "event_id"', !r.body.includes('event_id'), 'leaked event_id');
  check('body contains NO literal "install_uuid"', !r.body.includes('install_uuid'), 'leaked install_uuid');

  server.close();
  db.close();

  console.log(`\n=== server-public-stats-headline results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
