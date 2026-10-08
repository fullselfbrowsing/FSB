/**
 * Quick task 260630-hct -- region rollup k>=5 floor + public-stats popular_regions.
 *
 * Reuses the in-memory better-sqlite3 harness pattern from
 * server-telemetry-housekeeper.test.js. Seeds insertTelemetryEventWithRegion rows
 * with controlled distinct-install counts per region for a fixed day, runs a
 * housekeeper tick, reads telemetry_global_aggregates.popular_region_json, and asserts:
 *
 *   (a) a region with >=5 distinct installs surfaces with its real uniq;
 *   (b) a label under the floor rolls up to its parent (city -> subdivision ->
 *       country); countries still under it collapse into a single 'Other'
 *       bucket equal to the SUM of their installs;
 *   (c) when that remainder is itself <5 the 'Other' bucket is SUPPRESSED;
 *   (d) events whose region is 'unknown' are handled by the same floor;
 *   and the public headline path (buildHeadlineJson) exposes popular_regions as
 *   {label, uniq} with NO sub-floor/UUID/ip_hash leak. users_by_region_365d is
 *   last successful geo (a newer 'unknown' day, or a later unknown event on the
 *   same day, does not replace a real region) and is bounded to the same
 *   today..today-364 window as users_365d. Published places carry the places
 *   file's centroid; 'Other' never does.
 *
 * Run: node tests/server-region-aggregation.test.js
 */

'use strict';

const path = require('path');

// The public headline looks up place centroids; point it at the fixtures.
process.env.DBIP_DATASET_PATH = path.join(__dirname, '..', 'showcase', 'server', 'data', 'dbip-city-lite.fixture.csv');
delete process.env.DBIP_IPV6_DATASET_PATH;
delete process.env.DBIP_PLACES_DATASET_PATH;

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const { runHousekeeperTick, floorToUtcDayMs, applyRegionKFloor, REGION_K_FLOOR } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'housekeeper'));
const { regionLabel, regionParent, regionDepth } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'utils', 'region-label'));
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
// Scenario 1: above-floor region surfaces; below-floor regions that cannot
// clear the floor at country level collapse to a single 'Other' bucket equal to
// the SUM; 'unknown' folds in under the floor.
//   US-CA: 6 distinct installs        (>=5 -> surfaces, uniq=6)
//   FR-Normandy: 3 distinct installs  (<5 -> FR 3 < 5 -> Other)
//   DE-Bavaria: 2 distinct installs   (<5 -> DE 2 < 5 -> Other)
//   unknown: 1 distinct install       (<5 -> Other)
// below-k sum = 3 + 2 + 1 = 6 >= 5 -> single 'Other' bucket uniq=6.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'US-CA', 6);
  seedRegion(queries, 'FR-Normandy', 3);
  seedRegion(queries, 'DE-Bavaria', 2);
  seedRegion(queries, 'unknown', 1);

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);
  check('S1: popular_region_json parses to an array', Array.isArray(pr), `got ${JSON.stringify(pr)}`);

  const ca = pr.find((r) => r.region === 'US-CA');
  check('S1: US-CA (6 installs) surfaces with real uniq=6', ca && ca.uniq === 6, `got ${JSON.stringify(ca)}`);

  const other = pr.find((r) => r.region === 'Other');
  check('S1: single Other bucket = SUM of below-k installs (3+2+1=6)', other && other.uniq === 6, `got ${JSON.stringify(other)}`);

  check('S1: exactly ONE Other bucket', pr.filter((r) => r.region === 'Other').length === 1, `got ${JSON.stringify(pr)}`);

  // No sub-floor region label leaks, at any level.
  for (const label of ['FR-Normandy', 'FR', 'DE-Bavaria', 'DE', 'unknown']) {
    check(`S1: below-floor ${label} does NOT leak by name`, !pr.some((r) => r.region === label), `got ${JSON.stringify(pr)}`);
  }
  // Every surfaced label is >= the floor.
  check('S1: every surfaced region.uniq >= REGION_K_FLOOR', pr.every((r) => r.uniq >= REGION_K_FLOOR), `got ${JSON.stringify(pr)}`);

  db.close();
}

// =============================================================================
// Scenario 1b: sub-floor states of one country pool into that country.
//   US-NY 3 + US-TX 2 -> 'US' 5 (published); neither state leaks by name.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'US-NY', 3);
  seedRegion(queries, 'US-TX', 2);

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);
  check('S1b: two sub-floor US states publish as US=5',
    pr.length === 1 && pr[0].region === 'US' && pr[0].uniq === 5, `got ${JSON.stringify(pr)}`);

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
// Scenario 4: one roaming install appears in five different sub-floor regions.
// Summing per-region counts would fabricate Other.uniq=5; distinct membership
// must recognize that the combined cohort has k=1 and suppress it.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const roamingUuid = nextUuid();
  ['US-CA', 'US-NY', 'US-TX', 'US-WA', 'US-FL'].forEach((region, i) => {
    queries.insertTelemetryEventWithRegion.run(
      nextEventId(), roamingUuid, TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 'periodic', 'iphash', NOW, region
    );
  });

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);
  check('S4: one install across five sub-floor regions does NOT fabricate Other.uniq=5',
    Array.isArray(pr) && pr.length === 0,
    `got ${JSON.stringify(pr)}`);

  db.close();
}

// =============================================================================
// Scenario 5: the same five installs first appear in an above-floor region and
// later move into five separate sub-floor regions. They must be assigned once,
// using their latest daily region, rather than surfacing CA=5 plus US=5.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const roaming = Array.from({ length: 5 }, () => nextUuid());
  roaming.forEach((installUuid, i) => {
    queries.insertTelemetryEventWithRegion.run(
      nextEventId(), installUuid, TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 'periodic', 'iphash', NOW, 'US-CA'
    );
    queries.insertTelemetryEventWithRegion.run(
      nextEventId(), installUuid, TS_TODAY + (i + 10) * 60000,
      'Claude', 'm', 1, 1, 0, 'periodic', 'iphash', NOW + 1000, `US-X${i}`
    );
  });

  runHousekeeperTick(db, queries, NOW + 2000);
  const pr = readPopularRegion(db);
  check('S5: roaming installs are counted once across the whole region breakdown',
    Array.isArray(pr) && pr.length === 1 && pr[0].region === 'US' && pr[0].uniq === 5,
    `got ${JSON.stringify(pr)}`);
  check('S5: prior US-CA membership does not also surface',
    !pr.some((row) => row.region === 'US-CA'),
    `got ${JSON.stringify(pr)}`);

  db.close();
}

// =============================================================================
// Scenario 6: city -> subdivision -> country -> Other, one bucket per install.
//   US-CA/San Jose 5                                   -> published as the city
//   US-CA/Fresno 2 + US-CA/Oakland 1 + US-CA 2         -> 'US-CA' 5
//   US-TX/Austin 3 + US-NY 2                           -> 'US' 5
//   SG/Singapore 2 + SG 1, JP-Tokyo/Tokyo 2            -> countries 3 and 2
//   -> 'Other' 5
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const seeded = [
    ['US-CA/San Jose', 5], ['US-CA/Fresno', 2], ['US-CA/Oakland', 1], ['US-CA', 2],
    ['US-TX/Austin', 3], ['US-NY', 2], ['SG/Singapore', 2], ['SG', 1], ['JP-Tokyo/Tokyo', 2],
  ];
  for (const [region, n] of seeded) seedRegion(queries, region, n);

  runHousekeeperTick(db, queries, NOW);
  const pr = readPopularRegion(db);
  check('S6: city, state, country and Other each publish in size order',
    JSON.stringify(pr) === JSON.stringify([
      { region: 'US', uniq: 5 },
      { region: 'US-CA', uniq: 5 },
      { region: 'US-CA/San Jose', uniq: 5 },
      { region: 'Other', uniq: 5 },
    ]),
    `got ${JSON.stringify(pr)}`);
  const seededTotal = seeded.reduce((sum, [, n]) => sum + n, 0);
  check('S6: buckets are disjoint -- they sum to the installs seeded',
    pr.reduce((sum, r) => sum + r.uniq, 0) === seededTotal, `got ${JSON.stringify(pr)} for ${seededTotal}`);

  db.close();
}

// =============================================================================
// applyRegionKFloor directly: suppression at every level, first label wins.
// =============================================================================
{
  const rows = (pairs) => pairs.flatMap(([region, n], i) =>
    Array.from({ length: n }, (_, j) => ({ region, install_uuid: `${i}-${j}` })));

  check('floor: a lone sub-floor city rolls all the way up and is suppressed',
    applyRegionKFloor(rows([['US-CA/Fresno', 4]]), 'install_uuid', 5).length === 0, 'expected []');
  check('floor: 4 installs in one city + 1 elsewhere in the state publish the state',
    JSON.stringify(applyRegionKFloor(rows([['US-CA/Fresno', 4], ['US-CA/Oakland', 1]]), 'install_uuid', 5))
      === JSON.stringify([{ region: 'US-CA', uniq: 5 }]),
    JSON.stringify(applyRegionKFloor(rows([['US-CA/Fresno', 4], ['US-CA/Oakland', 1]]), 'install_uuid', 5)));
  check('floor: a city with no subdivision rolls straight to its country',
    JSON.stringify(applyRegionKFloor(rows([['SG/Singapore', 3], ['SG', 2]]), 'install_uuid', 5))
      === JSON.stringify([{ region: 'SG', uniq: 5 }]),
    JSON.stringify(applyRegionKFloor(rows([['SG/Singapore', 3], ['SG', 2]]), 'install_uuid', 5)));
  const dup = [
    { region: 'US-CA/San Jose', install_uuid: 'a' },
    { region: 'US-NY', install_uuid: 'a' },
  ];
  check('floor: an install listed twice keeps its first label only',
    JSON.stringify(applyRegionKFloor(dup, 'install_uuid', 1))
      === JSON.stringify([{ region: 'US-CA/San Jose', uniq: 1 }]),
    JSON.stringify(applyRegionKFloor(dup, 'install_uuid', 1)));
  check('floor: malformed rows are ignored',
    applyRegionKFloor([null, {}, { region: '', install_uuid: 'x' }, { region: 'US', install_uuid: 7 }], 'install_uuid', 1).length === 0,
    'expected []');
}

// =============================================================================
// regionLabel / regionParent / regionDepth.
// =============================================================================
{
  const cases = [
    [{ country: 'US', subdivision: 'California', city: 'San Jose' }, 'US-CA/San Jose'],
    [{ country: 'US', subdivision: 'California' }, 'US-CA'],
    [{ country: 'us', subdivision: 'California', city: '' }, 'US-CA'],
    [{ country: 'AU', subdivision: 'New South Wales', city: 'Sydney' }, 'AU-New-South-Wales/Sydney'],
    [{ country: 'SG', subdivision: '', city: 'Singapore' }, 'SG/Singapore'],
    [{ country: 'DE' }, 'DE'],
    [{ country: 'US', subdivision: 'Puerto Rico' }, 'US-Puerto-Rico'],
    [{ country: 'XX', subdivision: 'A/B', city: 'C/D  E\tF' }, 'XX-A-B/C D E F'],
    [{ country: 'IN', subdivision: 'Maharashtra', city: 'x'.repeat(60) }, `IN-Maharashtra/${'x'.repeat(40)}`],
    [{ country: '' }, 'unknown'],
    ['unknown', 'unknown'],
    [null, 'unknown'],
  ];
  for (const [input, want] of cases) {
    check(`regionLabel(${JSON.stringify(input)}) -> ${want}`, regionLabel(input) === want, `got ${regionLabel(input)}`);
  }
  const parents = [
    ['US-CA/Winston-Salem', 'US-CA', 2], ['US-CA', 'US', 1], ['SG/Singapore', 'SG', 1],
    ['AU-New-South-Wales', 'AU', 1], ['US', null, 0], ['unknown', null, 0], ['Other', null, 0],
  ];
  for (const [label, parent, depth] of parents) {
    check(`regionParent(${label}) -> ${parent}, depth ${depth}`,
      regionParent(label) === parent && regionDepth(label) === depth,
      `got ${regionParent(label)} / ${regionDepth(label)}`);
  }
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
  seedRegion(queries, 'US-TX', 2); // below floor -> US 2 -> Other 2 -> suppressed

  runHousekeeperTick(db, queries, NOW);

  const headline = buildHeadlineJson(queries, NOW);
  check('HL: headline has popular_regions field', 'popular_regions' in headline, `keys=${Object.keys(headline)}`);
  check('HL: popular_regions is an array of {label, uniq, lat?, lon?}',
    Array.isArray(headline.popular_regions) && headline.popular_regions.every(
      (x) => typeof x.label === 'string' && Number.isInteger(x.uniq)
        && Object.keys(x).every((k) => ['label', 'uniq', 'lat', 'lon'].includes(k))),
    `got ${JSON.stringify(headline.popular_regions)}`);
  check('HL: published places carry the fixture centroid',
    headline.popular_regions.some((x) => x.label === 'US-CA' && x.lat === 36.7 && x.lon === -119.6)
      && headline.users_by_region_365d.some((x) => x.label === 'US-NY' && x.lat === 42.2 && x.lon === -74.9),
    `got ${JSON.stringify(headline.popular_regions)} / ${JSON.stringify(headline.users_by_region_365d)}`);
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

  check('HL: headline has users_by_region_365d from persisted rollups',
    Array.isArray(headline.users_by_region_365d),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);
  check('HL: 365d census includes US-CA with uniq=6',
    headline.users_by_region_365d.some((x) => x.label === 'US-CA' && x.uniq === 6),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);
  check('HL: 365d census includes US-NY with uniq=5',
    headline.users_by_region_365d.some((x) => x.label === 'US-NY' && x.uniq === 5),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);
  check('HL: 365d census does NOT leak sub-floor US-TX',
    !headline.users_by_region_365d.some((x) => x.label === 'US-TX'),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);

  db.close();
}

{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'IN-Maharashtra', 6);
  runHousekeeperTick(db, queries, NOW);
  db.prepare('DELETE FROM telemetry_events').run();
  runHousekeeperTick(db, queries, NOW);
  const headline = buildHeadlineJson(queries, NOW);
  check('persist: 365d still has IN-Maharashtra after raw events are wiped',
    Array.isArray(headline.users_by_region_365d)
      && headline.users_by_region_365d.some((x) => x.label === 'IN-Maharashtra' && x.uniq === 6),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);
  check('persist: today popular_regions may be empty after wipe, 365d is the durable copy',
    Array.isArray(headline.popular_regions),
    `got ${JSON.stringify(headline.popular_regions)}`);

  db.close();
}

{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const yesterdayStart = floorToUtcDayMs(NOW) - 24 * 60 * 60 * 1000;
  const tsYesterday = yesterdayStart + 3 * 60 * 60 * 1000;
  const uuids = [];
  for (let i = 0; i < 6; i++) {
    const uuid = nextUuid();
    uuids.push(uuid);
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuid, tsYesterday + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW - 24 * 60 * 60 * 1000,
      'IN-Maharashtra', 'ipv4'
    );
  }
  runHousekeeperTick(db, queries, NOW);
  for (let i = 0; i < 6; i++) {
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuids[i], TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW,
      'unknown', 'ipv6-ula'
    );
  }
  runHousekeeperTick(db, queries, NOW);
  const headline = buildHeadlineJson(queries, NOW);
  check('persist: newer unknown day does not replace last-known IN-Maharashtra',
    Array.isArray(headline.users_by_region_365d)
      && headline.users_by_region_365d.some((x) => x.label === 'IN-Maharashtra' && x.uniq === 6),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);
  check('persist: 365d census omits unknown when a real region still exists',
    !headline.users_by_region_365d.some((x) => x.label === 'unknown'),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);

  db.close();
}

{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const uuids = [];
  for (let i = 0; i < 6; i++) {
    const uuid = nextUuid();
    uuids.push(uuid);
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuid, TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW,
      'IN-Maharashtra', 'ipv4'
    );
  }
  runHousekeeperTick(db, queries, NOW);
  const laterMs = NOW + 60 * 60 * 1000;
  for (let i = 0; i < 6; i++) {
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuids[i], TS_TODAY + (6 + i) * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', laterMs,
      'unknown', 'ipv6-ula'
    );
  }
  runHousekeeperTick(db, queries, laterMs);
  const sameDayRow = db.prepare(
    'SELECT region, geo_kind FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?'
  ).get(uuids[0], TODAY);
  check('persist: same-day later unknown keeps IN-Maharashtra on the rollup row',
    sameDayRow && sameDayRow.region === 'IN-Maharashtra' && sameDayRow.geo_kind === 'ipv4',
    `got ${JSON.stringify(sameDayRow)}`);
  const headline = buildHeadlineJson(queries, NOW);
  check('persist: same-day later unknown still counts in 365d IN-Maharashtra',
    Array.isArray(headline.users_by_region_365d)
      && headline.users_by_region_365d.some((x) => x.label === 'IN-Maharashtra' && x.uniq === 6),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);

  db.close();
}

{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const uuids = [];
  for (let i = 0; i < 6; i++) {
    const uuid = nextUuid();
    uuids.push(uuid);
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuid, TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW,
      'IN-Maharashtra', 'ipv4'
    );
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuid, TS_TODAY + (6 + i) * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW + 1,
      'unknown', 'ipv6-ula'
    );
  }
  runHousekeeperTick(db, queries, NOW + 1);
  const firstTickRow = db.prepare(
    'SELECT region, geo_kind FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?'
  ).get(uuids[0], TODAY);
  check('persist: first tick of the day uses last successful geo, not latest unknown',
    firstTickRow && firstTickRow.region === 'IN-Maharashtra' && firstTickRow.geo_kind === 'ipv4',
    `got ${JSON.stringify(firstTickRow)}`);
  const headline = buildHeadlineJson(queries, NOW);
  check('persist: first-tick last-successful geo still surfaces in 365d',
    Array.isArray(headline.users_by_region_365d)
      && headline.users_by_region_365d.some((x) => x.label === 'IN-Maharashtra' && x.uniq === 6),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);

  db.close();
}

{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const threeDaysAgoStart = floorToUtcDayMs(NOW) - 3 * 24 * 60 * 60 * 1000;
  const threeDaysAgoKey = new Date(threeDaysAgoStart).toISOString().slice(0, 10);
  const seedAt = threeDaysAgoStart + 12 * 60 * 60 * 1000;
  const uuids = [];
  for (let i = 0; i < 6; i++) {
    const uuid = nextUuid();
    uuids.push(uuid);
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuid, threeDaysAgoStart + 3 * 60 * 60 * 1000 + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', seedAt,
      'IN-Maharashtra', 'ipv4'
    );
  }
  runHousekeeperTick(db, queries, seedAt);
  for (let i = 0; i < 6; i++) {
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuids[i], threeDaysAgoStart + 4 * 60 * 60 * 1000 + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW,
      'unknown', 'ipv6-ula'
    );
  }
  runHousekeeperTick(db, queries, NOW);
  const backfillRow = db.prepare(
    'SELECT region, geo_kind FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?'
  ).get(uuids[0], threeDaysAgoKey);
  check('persist: late unknown event does not wipe a day-2–7 rollup region',
    backfillRow && backfillRow.region === 'IN-Maharashtra' && backfillRow.geo_kind === 'ipv4',
    `got ${JSON.stringify(backfillRow)}`);
  const headline = buildHeadlineJson(queries, NOW);
  check('persist: day-2–7 last-known IN-Maharashtra survives a late unknown event',
    Array.isArray(headline.users_by_region_365d)
      && headline.users_by_region_365d.some((x) => x.label === 'IN-Maharashtra' && x.uniq === 6),
    `got ${JSON.stringify(headline.users_by_region_365d)}`);

  db.close();
}

{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const rowFor = (uuid) => db.prepare(
    'SELECT region, geo_kind FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?'
  ).get(uuid, TODAY);
  const uuids = [];
  for (let i = 0; i < 6; i++) {
    const uuid = nextUuid();
    uuids.push(uuid);
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuid, TS_TODAY + i * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', NOW,
      'unknown', 'ipv6-ula'
    );
  }
  runHousekeeperTick(db, queries, NOW);
  const unknownRow = rowFor(uuids[0]);
  check('persist: unknown-only day keeps the failed lookup geo_kind on the rollup',
    unknownRow && unknownRow.region === 'unknown' && unknownRow.geo_kind === 'ipv6-ula',
    `got ${JSON.stringify(unknownRow)}`);
  const unknownHeadline = buildHeadlineJson(queries, NOW);
  check('persist: unknown-only installs stay out of the 365d census',
    !unknownHeadline.users_by_region_365d.some((x) => x.label === 'unknown'),
    `got ${JSON.stringify(unknownHeadline.users_by_region_365d)}`);

  const hitMs = NOW + 60 * 60 * 1000;
  for (let i = 0; i < 6; i++) {
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuids[i], TS_TODAY + (6 + i) * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', hitMs,
      'IN-Maharashtra', 'ipv4'
    );
  }
  runHousekeeperTick(db, queries, hitMs);
  const missMs = hitMs + 60 * 60 * 1000;
  for (let i = 0; i < 6; i++) {
    queries.insertTelemetryEventWithRegionV3.run(
      nextEventId(), uuids[i], TS_TODAY + (12 + i) * 60000,
      'Claude', 'm', 1, 1, 0, 2, 'periodic', 'iphash', missMs,
      'unknown', 'ipv6'
    );
  }
  runHousekeeperTick(db, queries, missMs);
  const resolvedRow = rowFor(uuids[0]);
  check('persist: a real region keeps its own geo_kind after a later failed lookup',
    resolvedRow && resolvedRow.region === 'IN-Maharashtra' && resolvedRow.geo_kind === 'ipv4',
    `got ${JSON.stringify(resolvedRow)}`);

  db.close();
}

// The 365d census uses the same day window as users_365d: a rollup that has
// aged past retention but not yet been deleted by the hourly tick must not
// count on the globe.
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  const dayKey = (daysAgo) => new Date(floorToUtcDayMs(NOW) - daysAgo * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  for (let i = 0; i < 6; i++) {
    queries.upsertRollupDailyV3.run(nextUuid(), dayKey(365), 1, 1, 0, 0, 1, 'US-CA', 'ipv4');
  }
  let headline = buildHeadlineJson(queries, NOW);
  check('window: expired-but-undeleted rollups do not count in the 365d census',
    headline.users_365d === 0 && headline.users_by_region_365d.length === 0,
    `users_365d=${headline.users_365d} census=${JSON.stringify(headline.users_by_region_365d)}`);

  for (let i = 0; i < 6; i++) {
    queries.upsertRollupDailyV3.run(nextUuid(), dayKey(364), 1, 1, 0, 0, 1, 'US-NY', 'ipv4');
  }
  headline = buildHeadlineJson(queries, NOW);
  check('window: the oldest retained day (today-364) still counts',
    headline.users_365d === 6
      && headline.users_by_region_365d.length === 1
      && headline.users_by_region_365d[0].label === 'US-NY'
      && headline.users_by_region_365d[0].uniq === 6,
    `users_365d=${headline.users_365d} census=${JSON.stringify(headline.users_by_region_365d)}`);

  db.close();
}

// =============================================================================
// Public headline at city level: a city that clears the floor carries its
// centroid; 'Other' carries none.
// =============================================================================
{
  const db = new Database(':memory:');
  initializeDatabase(db);
  const queries = new Queries(db);
  seedRegion(queries, 'US-CA/Mountain View', 5);
  seedRegion(queries, 'GB-England/London', 3);
  seedRegion(queries, 'DE-Bavaria/Munich', 2);
  runHousekeeperTick(db, queries, NOW);
  const headline = buildHeadlineJson(queries, NOW);
  const census = headline.users_by_region_365d;
  check('HL-city: 365d census publishes the city with its centroid',
    census.some((x) => x.label === 'US-CA/Mountain View' && x.uniq === 5 && x.lat === 37.4 && x.lon === -122.1),
    `got ${JSON.stringify(census)}`);
  const other = census.find((x) => x.label === 'Other');
  check('HL-city: Other (GB 3 + DE 2) has no coordinates',
    !!other && other.uniq === 5 && !('lat' in other) && !('lon' in other), `got ${JSON.stringify(census)}`);
  check('HL-city: no sub-floor city leaks', !census.some((x) => /London|Munich|GB|DE/.test(x.label)), `got ${JSON.stringify(census)}`);
  db.close();
}

console.log(`\n=== server-region-aggregation results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
