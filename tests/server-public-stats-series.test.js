/**
 * Phase 274 / AGG-09 -- public-stats /global/series endpoint shape.
 *
 * Seeds telemetry_global_aggregates across ~100 days, then asserts:
 *  - three keys present (d30, d90, d365)
 *  - pre-v2 active history is null; v2 points expose truthful peak semantics
 *  - arrays sorted ascending by day_utc
 *  - d30.length <= d90.length <= d365.length (window invariant)
 *
 * Run: node tests/server-public-stats-series.test.js
 */

'use strict';

const path = require('path');
const http = require('http');

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const express = require(require.resolve('express', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const createPublicStatsRouter = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'public-stats'));
const activeTracker = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'active-tracker'));
const { resetPerUuidBudget } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'middleware', 'telemetry-rate-limit'));

resetPerUuidBudget();
activeTracker._resetForTest();
const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);

const app = express();
app.use('/api/public-stats', createPublicStatsRouter(db, queries));
const server = http.createServer(app).listen(0);
const port = server.address().port;

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

function getJson(path_) {
  return new Promise((resolve, reject) => {
    const req = http.request({ method: 'GET', host: '127.0.0.1', port, path: path_ }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async function main() {
  console.log('--- server-public-stats-series (AGG-09) ---');

  // Seed 400 consecutive days plus one future row. Exact inclusive windows
  // must return 30/90/365 points and exclude both day 366 and tomorrow.
  const ONE_DAY_MS = 86400000;
  const today = Date.now();
  const seededDays = 400;
  for (let i = 0; i < seededDays; i++) {
    const dayMs = today - i * ONE_DAY_MS;
    const day_utc = new Date(dayMs).toISOString().slice(0, 10);
    if (i < 30) {
      queries.upsertGlobalAggregateV2.run(
        day_utc, 5 + i, 100 * (i + 1), 50 * (i + 1), 7,
        '[]', '[]', '[]', 0, 2, 5 + i
      );
    } else {
      queries.upsertGlobalAggregateRow(day_utc, 5 + i, 100 * (i + 1), 50 * (i + 1), 999, '[]', '[]');
    }
  }
  const tomorrowUtc = new Date(today + ONE_DAY_MS).toISOString().slice(0, 10);
  queries.upsertGlobalAggregateRow(tomorrowUtc, 999, 999, 999, 999, '[]', '[]');

  const r = await getJson('/api/public-stats/global/series');
  check('GET /global/series -> 200', r.statusCode === 200, `got ${r.statusCode} body=${r.body.slice(0, 200)}`);
  check('Content-Type is JSON', /application\/json/.test(r.headers['content-type'] || ''),
    `got ${r.headers['content-type']}`);
  check('ETag header present', typeof r.headers.etag === 'string' && r.headers.etag.startsWith('"'),
    `got ${r.headers.etag}`);
  check('Cache-Control: max-age=60 present',
    /max-age=60/.test(r.headers['cache-control'] || ''),
    `got ${r.headers['cache-control']}`);

  let body = null;
  try { body = JSON.parse(r.body); } catch {}
  check('body parses as JSON', body !== null, `body=${r.body.slice(0, 200)}`);
  if (body) {
    check('series exposes request and aggregate source freshness independently',
      Number.isFinite(Date.parse(body.generated_at)) &&
        body.aggregate_as_of_day === new Date(today).toISOString().slice(0, 10) &&
        body.aggregate_updated_at === null,
      `got generated=${body.generated_at} day=${body.aggregate_as_of_day} updated=${body.aggregate_updated_at}`);
    check('body has d30 key', Array.isArray(body.d30), `got ${typeof body.d30}`);
    check('body has d90 key', Array.isArray(body.d90), `got ${typeof body.d90}`);
    check('body has d365 key', Array.isArray(body.d365), `got ${typeof body.d365}`);
    check('series declares v2 active history incomplete and names its semantics',
      body.active_count_version === 2
        && body.active_history_complete === false
        && body.active_metric_semantics === 'sum_of_per_install_daily_peaks',
      `got ${JSON.stringify(body)}`);

    check('d30.length === 30 (today + prior 29 UTC days)', body.d30.length === 30, `got ${body.d30.length}`);
    check('d90.length === 90 (today + prior 89 UTC days)', body.d90.length === 90, `got ${body.d90.length}`);
    check('d365.length === 365 (today + prior 364 UTC days)',
      body.d365.length === 365, `got ${body.d365.length}`);
    const expectedOldest365 = new Date(today - 364 * ONE_DAY_MS).toISOString().slice(0, 10);
    const expectedToday = new Date(today).toISOString().slice(0, 10);
    check('d365 lower boundary is exactly 364 days before today',
      body.d365[0] && body.d365[0].day_utc === expectedOldest365,
      `got ${body.d365[0] && body.d365[0].day_utc}`);
    check('all windows end today and exclude tomorrow',
      body.d30.at(-1)?.day_utc === expectedToday
        && body.d90.at(-1)?.day_utc === expectedToday
        && body.d365.at(-1)?.day_utc === expectedToday
        && !body.d365.some((p) => p.day_utc === tomorrowUtc),
      `last=${body.d365.at(-1)?.day_utc}, tomorrow=${tomorrowUtc}`);

    check('d30.length <= d90.length', body.d30.length <= body.d90.length,
      `${body.d30.length} > ${body.d90.length}`);
    check('d90.length <= d365.length', body.d90.length <= body.d365.length,
      `${body.d90.length} > ${body.d365.length}`);

    // Sort + shape check on one window.
    if (body.d30.length > 1) {
      let isAscending = true;
      for (let i = 1; i < body.d30.length; i++) {
        if (body.d30[i].day_utc < body.d30[i - 1].day_utc) {
          isAscending = false; break;
        }
      }
      check('d30 is sorted ascending by day_utc', isAscending,
        `got ${body.d30.map((p) => p.day_utc).join(',')}`);
    }

    // Per-point shape.
    if (body.d30.length > 0) {
      const p = body.d30[0];
      check('d30[0].day_utc is YYYY-MM-DD string',
        typeof p.day_utc === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day_utc),
        `got ${p.day_utc}`);
      check('d30[0].unique_installs is integer', Number.isInteger(p.unique_installs),
        `got ${p.unique_installs} (${typeof p.unique_installs})`);
      check('d30[0].tokens is integer (sum of in + out)', Number.isInteger(p.tokens),
        `got ${p.tokens} (${typeof p.tokens})`);
      check('ambiguous agents_active compatibility field is null', p.agents_active === null,
        `got ${p.agents_active}`);
      check('v2 point exposes reported daily peak sum and complete reporting coverage',
        Number.isInteger(p.reported_agent_daily_peak_sum)
          && p.reported_agent_daily_peak_sum === 7
          && p.active_coverage === 1
          && p.active_data_state === 'ready',
        `got ${JSON.stringify(p)}`);
      const preV2 = body.d365[0];
      check('pre-v2 active point is unavailable rather than laundering legacy 999',
        preV2.reported_agent_daily_peak_sum === null
          && preV2.agents_active === null
          && preV2.active_data_state === 'unavailable',
        `got ${JSON.stringify(preV2)}`);
    }

    // Privacy: series body must not leak install_uuid or ip_hash or event_id.
    check('body contains NO "install_uuid"', !r.body.includes('install_uuid'), 'leak');
    check('body contains NO "ip_hash"', !r.body.includes('ip_hash'), 'leak');
    check('body contains NO "event_id"', !r.body.includes('event_id'), 'leak');
  }

  server.close();
  db.close();

  console.log(`\n=== server-public-stats-series results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
})();
