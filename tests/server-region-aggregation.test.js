/**
 * Quick task 260630-hct -- region rollup k>=5 floor + public-stats popular_regions.
 *
 * Reuses the in-memory better-sqlite3 harness pattern from
 * server-telemetry-housekeeper.test.js. Seeds insertTelemetryEventWithRegion rows
 * with controlled distinct-install counts per region for a fixed day, runs a
 * housekeeper tick, reads telemetry_global_aggregates.popular_region_json, and asserts:
 *
 *   (a) a region with >=5 distinct installs surfaces with its real uniq;
 *   (b) regions with <5 distinct installs collapse into a single 'Other' bucket
 *       equal to the SUM of their installs;
 *   (c) when the total below-k sum is itself <5 the 'Other' bucket is SUPPRESSED;
 *   (d) events whose region is 'unknown' are handled by the same floor;
 *   and the public headline path (buildHeadlineJson) exposes popular_regions as
 *   {label, uniq} with NO sub-floor/UUID/ip_hash leak.
 *
 * Run: node tests/server-region-aggregation.test.js
 */

'use strict';

const path = require('path');

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const { runHousekeeperTick, floorToUtcDayMs, REGION_K_FLOOR } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'housekeeper'));
const { buildHeadlineJson } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'routes', 'public-stats'));

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const NOW = Date.UTC(2026, 4, 14, 12, 0, 0); // 2026-05-14 12:00 UTC
const TODAY = new Date(floorToUtcDayMs(NOW)).toISOString().slice(0, 10);
const TS_TODAY = floorToUtcDayMs(NOW) + 3 * 60 * 60 * 1000; // 03:00 UTC today

let uuidCounter = 0;
function nextUuid() {
  uuidCounter += 1;
  const hex = uuidCounter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}
let eventCounter = 0;
function nextEventId() {
  eventCounter += 1;
  const hex = eventCounter.toString(16).padStart(12, '0');
  return `11111111-1111-4111-8111-${hex}`;
}

/**
 * Seed `count` events, EACH from a distinct install_uuid, for `region` on TODAY.
 * Distinct uuids => COUNT(DISTINCT install_uuid) per region == count.
 */
function seedRegion(queries, region, count) {
  for (let i = 0; i < count; i++) {
    queries.insertTelemetryEventWithRegion.run(
      nextEventId(), nextUuid(), TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 'periodic', 'iphash', NOW, region
    );
  }
}

function readPopularRegion(db) {
  const row = db.prepare('SELECT popular_region_json FROM telemetry_global_aggregates WHERE day_utc = ?').get(TODAY);
  return row ? JSON.parse(row.popular_region_json) : null;
}

console.log('--- server-region-aggregation (260630-hct) ---');
check('REGION_K_FLOOR is the HARD k>=5 (not the relaxed mcp floor of 2)', REGION_K_FLOOR === 5, `got ${REGION_K_FLOOR}`);

// =============================================================================
// Scenario 1: above-floor region surfaces; below-floor regions collapse to a
// single 'Other' bucket equal to the SUM; 'unknown' folds in under the floor.
//   US-CA: 6 distinct installs   (>=5 -> surfaces, uniq=6)
//   US-NY: 3 distinct installs   (<5)
//   US-TX: 2 distinct installs   (<5)
//   unknown: 1 distinct install  (<5)
// below-k sum = 3 + 2 + 1 = 6 >= 5 -> single 'Other' bucket uniq=6.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'US-CA', 6);
  seedRegion(queries, 'US-NY', 3);
  seedRegion(queries, 'US-TX', 2);
  seedRegion(queries, 'unknown', 1);

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);
  check('S1: popular_region_json parses to an array', Array.isArray(pr), `got ${JSON.stringify(pr)}`);

  const ca = pr.find((r) => r.region === 'US-CA');
  check('S1: US-CA (6 installs) surfaces with real uniq=6', ca && ca.uniq === 6, `got ${JSON.stringify(ca)}`);

  const other = pr.find((r) => r.region === 'Other');
  check('S1: single Other bucket = SUM of below-k installs (3+2+1=6)', other && other.uniq === 6, `got ${JSON.stringify(other)}`);

  check('S1: exactly ONE Other bucket', pr.filter((r) => r.region === 'Other').length === 1, `got ${JSON.stringify(pr)}`);

  // No sub-floor region label leaks (US-NY / US-TX must NOT appear by name).
  check('S1: below-floor US-NY does NOT leak by name', !pr.some((r) => r.region === 'US-NY'), `got ${JSON.stringify(pr)}`);
  check('S1: below-floor US-TX does NOT leak by name', !pr.some((r) => r.region === 'US-TX'), `got ${JSON.stringify(pr)}`);
  // 'unknown' was below the floor here, so it folded into Other (did not surface).
  check('S1: sub-floor unknown folded into Other (not surfaced)', !pr.some((r) => r.region === 'unknown'), `got ${JSON.stringify(pr)}`);
  // Every surfaced label is >= the floor.
  check('S1: every surfaced region.uniq >= REGION_K_FLOOR', pr.every((r) => r.uniq >= REGION_K_FLOOR), `got ${JSON.stringify(pr)}`);

  db.close();
}

// =============================================================================
// Scenario 2: total below-k sum is itself < 5 -> 'Other' bucket SUPPRESSED.
//   US-CA: 5 distinct installs  (>=5 -> surfaces, uniq=5)
//   US-NY: 2 distinct installs  (<5)
//   US-TX: 1 distinct install   (<5)
// below-k sum = 2 + 1 = 3 < 5 -> Other suppressed; only US-CA remains.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'US-CA', 5);
  seedRegion(queries, 'US-NY', 2);
  seedRegion(queries, 'US-TX', 1);

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);

  const ca = pr.find((r) => r.region === 'US-CA');
  check('S2: US-CA (5 installs, exactly at floor) surfaces with uniq=5', ca && ca.uniq === 5, `got ${JSON.stringify(ca)}`);
  check('S2: Other bucket SUPPRESSED when below-k sum (3) < floor', !pr.some((r) => r.region === 'Other'), `got ${JSON.stringify(pr)}`);
  check('S2: only the above-floor region remains (length 1)', pr.length === 1, `got ${JSON.stringify(pr)}`);

  db.close();
}

// =============================================================================
// Scenario 3: 'unknown' itself clears the floor and surfaces as 'unknown'.
//   unknown: 7 distinct installs (>=5 -> surfaces as 'unknown', uniq=7)
//   US-CA: 1 distinct install    (<5 -> below floor, alone, sum 1 < 5 -> suppressed)
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'unknown', 7);
  seedRegion(queries, 'US-CA', 1);

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);

  const unknown = pr.find((r) => r.region === 'unknown');
  check('S3: unknown (7 installs) surfaces as its own label with uniq=7', unknown && unknown.uniq === 7, `got ${JSON.stringify(unknown)}`);
  check('S3: lone below-floor US-CA suppressed (sum 1 < 5, no Other)', !pr.some((r) => r.region === 'Other') && !pr.some((r) => r.region === 'US-CA'), `got ${JSON.stringify(pr)}`);

  db.close();
}

// =============================================================================
// Public headline: buildHeadlineJson exposes popular_regions as {label, uniq}
// with no sub-floor leak and no UUID/ip_hash fields.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'US-CA', 6);
  seedRegion(queries, 'US-NY', 5);
  seedRegion(queries, 'US-TX', 2); // below floor -> folds into Other (sum 2 < 5 -> suppressed)

  runHousekeeperTick(db, queries, NOW);

  const headline = buildHeadlineJson(queries);
  check('HL: headline has popular_regions field', 'popular_regions' in headline, `keys=${Object.keys(headline)}`);
  check('HL: popular_regions is an array of {label, uniq}',
    Array.isArray(headline.popular_regions) && headline.popular_regions.every(
      (x) => typeof x.label === 'string' && Number.isInteger(x.uniq)),
    `got ${JSON.stringify(headline.popular_regions)}`);
  check('HL: popular_regions includes US-CA with uniq=6',
    headline.popular_regions.some((x) => x.label === 'US-CA' && x.uniq === 6),
    `got ${JSON.stringify(headline.popular_regions)}`);
  check('HL: popular_regions includes US-NY with uniq=5',
    headline.popular_regions.some((x) => x.label === 'US-NY' && x.uniq === 5),
    `got ${JSON.stringify(headline.popular_regions)}`);
  check('HL: sub-floor US-TX (2) does NOT leak by name',
    !headline.popular_regions.some((x) => x.label === 'US-TX'),
    `got ${JSON.stringify(headline.popular_regions)}`);
  check('HL: every surfaced popular_regions.uniq >= REGION_K_FLOOR',
    headline.popular_regions.every((x) => x.uniq >= REGION_K_FLOOR),
    `got ${JSON.stringify(headline.popular_regions)}`);

  // No PII in the serialized headline.
  const serialized = JSON.stringify(headline);
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  check('HL: serialized headline contains NO UUIDv4 string', !UUID_REGEX.test(serialized), `serialized=${serialized.slice(0, 200)}`);
  check('HL: serialized headline contains NO ip_hash', !serialized.includes('ip_hash'), 'leaked ip_hash');
  check('HL: serialized headline contains NO install_uuid', !serialized.includes('install_uuid'), 'leaked install_uuid');

  db.close();
}

console.log(`\n=== server-region-aggregation results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
