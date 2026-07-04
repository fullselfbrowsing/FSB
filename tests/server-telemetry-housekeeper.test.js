/**
 * Phase 273 / INGEST-11 -- hourly housekeeper invariants.
 *
 * Seeds a synthetic event timeline, runs ONE housekeeper tick, and asserts:
 *   - events older than 7 days are DELETED
 *   - telemetry_rollups_daily contains one row per (install_uuid, day) with
 *     correct sums + max + count
 *   - telemetry_global_aggregates contains a row for today + yesterday with
 *     unique_installs reflecting both UUIDs
 *   - telemetry_daily_salt contains today's row (nudge fired)
 *   - the handler does NOT rethrow on injected SQL error
 *
 * Run: node tests/server-telemetry-housekeeper.test.js
 */

'use strict';

const path = require('path');

const SERVER_NM = path.join(__dirname, '..', 'showcase', 'server', 'node_modules');
const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));

const { initializeDatabase } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'schema'));
const Queries = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'db', 'queries'));
const { runHousekeeperTick, floorToUtcDayMs, K_ANONYMITY_FLOOR } = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'telemetry', 'housekeeper'));

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail}`); }
}

const db = new Database(':memory:');
initializeDatabase(db);
const queries = new Queries(db);

// Anchor "now" to a fixed point so day boundaries are deterministic.
const NOW = Date.UTC(2026, 4, 14, 12, 0, 0); // 2026-05-14 12:00 UTC
const ONE_DAY_MS = 86400000;
const TODAY = new Date(floorToUtcDayMs(NOW)).toISOString().slice(0, 10);              // 2026-05-14
const YESTERDAY = new Date(floorToUtcDayMs(NOW - ONE_DAY_MS)).toISOString().slice(0, 10); // 2026-05-13

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

// Seed 1: 1 event for UUID_A older than 7 days (8d ago) -- should be DELETED.
const oldReceivedAt = NOW - 8 * ONE_DAY_MS;
queries.insertTelemetryEvent.run(
  '00000000-0000-4000-8000-000000000001', UUID_A,
  NOW - 8 * ONE_DAY_MS, 'Claude', 'm', 10, 5, 1, 'periodic', 'h1', oldReceivedAt
);

// Seed 2: 3 events for UUID_A inside today.
const tsToday = floorToUtcDayMs(NOW) + 3 * 60 * 60 * 1000; // 03:00 UTC today
for (let i = 0; i < 3; i++) {
  queries.insertTelemetryEvent.run(
    '00000000-0000-4000-8000-000000000' + (10 + i),
    UUID_A,
    tsToday + i * 60000,
    'Claude', 'm', 100, 50, 2, 'periodic', 'h1', NOW
  );
}

// Seed 3: 2 events for UUID_B inside today.
for (let i = 0; i < 2; i++) {
  queries.insertTelemetryEvent.run(
    '00000000-0000-4000-8000-000000000' + (20 + i),
    UUID_B,
    tsToday + i * 60000,
    'Codex', 'm', 200, 100, 1, 'periodic', 'h2', NOW
  );
}

// Seed 4: 1 event for UUID_A inside yesterday.
const tsYesterday = floorToUtcDayMs(NOW - ONE_DAY_MS) + 12 * 60 * 60 * 1000; // 12:00 UTC yesterday
queries.insertTelemetryEvent.run(
  '00000000-0000-4000-8000-000000000030',
  UUID_A,
  tsYesterday,
  'Claude', 'm', 50, 25, 1, 'periodic', 'h1', NOW - 12 * 60 * 60 * 1000
);

const before = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get().c;
check('seed: 7 events present (1 old + 3 today A + 2 today B + 1 yesterday A)', before === 7, `got ${before}`);

console.log('--- server-telemetry-housekeeper (INGEST-11) ---');

let threw = false;
try {
  runHousekeeperTick(db, queries, NOW);
} catch (e) {
  threw = true;
}
check('runHousekeeperTick does NOT throw', !threw, 'unexpected throw');

// Step 1: 7-day retention -- old event deleted.
const afterEvents = db.prepare('SELECT COUNT(*) AS c FROM telemetry_events').get().c;
check('after tick: old event (>7d) deleted, 6 events remain', afterEvents === 6, `got ${afterEvents}`);
const oldStill = db.prepare("SELECT COUNT(*) AS c FROM telemetry_events WHERE event_id = '00000000-0000-4000-8000-000000000001'").get().c;
check('the >7d event is gone', oldStill === 0, `got ${oldStill}`);

// Step 2: rollups per (uuid, day).
const rollupAToday = db.prepare('SELECT * FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?').get(UUID_A, TODAY);
check('rollup row exists for (A, today)', !!rollupAToday, `got ${JSON.stringify(rollupAToday)}`);
check('rollup (A, today).event_count === 3', rollupAToday && rollupAToday.event_count === 3, `got ${JSON.stringify(rollupAToday)}`);
check('rollup (A, today).tokens_in === 300', rollupAToday && rollupAToday.tokens_in === 300, `got ${JSON.stringify(rollupAToday)}`);
check('rollup (A, today).tokens_out === 150', rollupAToday && rollupAToday.tokens_out === 150, `got ${JSON.stringify(rollupAToday)}`);
check('rollup (A, today).max_active_agents === 2', rollupAToday && rollupAToday.max_active_agents === 2, `got ${JSON.stringify(rollupAToday)}`);

const rollupAYesterday = db.prepare('SELECT * FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?').get(UUID_A, YESTERDAY);
check('rollup row exists for (A, yesterday)', !!rollupAYesterday, `got ${JSON.stringify(rollupAYesterday)}`);
check('rollup (A, yesterday).event_count === 1', rollupAYesterday && rollupAYesterday.event_count === 1, `got ${JSON.stringify(rollupAYesterday)}`);

const rollupBToday = db.prepare('SELECT * FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?').get(UUID_B, TODAY);
check('rollup row exists for (B, today)', !!rollupBToday, `got ${JSON.stringify(rollupBToday)}`);
check('rollup (B, today).event_count === 2', rollupBToday && rollupBToday.event_count === 2, `got ${JSON.stringify(rollupBToday)}`);

// Step 3: global aggregates for today + yesterday.
const globalToday = db.prepare('SELECT * FROM telemetry_global_aggregates WHERE day_utc = ?').get(TODAY);
check('global aggregate exists for today', !!globalToday, `got ${JSON.stringify(globalToday)}`);
check('global today.unique_installs === 2 (A + B)', globalToday && globalToday.unique_installs === 2, `got ${JSON.stringify(globalToday)}`);
check('global today.tokens_in_sum === 700 (3*100 + 2*200)', globalToday && globalToday.tokens_in_sum === 700, `got ${JSON.stringify(globalToday)}`);
check('global today.tokens_out_sum === 350 (3*50 + 2*100)', globalToday && globalToday.tokens_out_sum === 350, `got ${JSON.stringify(globalToday)}`);

const globalYesterday = db.prepare('SELECT * FROM telemetry_global_aggregates WHERE day_utc = ?').get(YESTERDAY);
check('global aggregate exists for yesterday', !!globalYesterday, `got ${JSON.stringify(globalYesterday)}`);
check('global yesterday.unique_installs === 1 (A)', globalYesterday && globalYesterday.unique_installs === 1, `got ${JSON.stringify(globalYesterday)}`);

// popular_mcp_json: today has Claude (1 distinct install, A) and Codex (1 distinct install, B).
// Floor history: k=5 (v0.9.69, bucket SUPPRESSED -> []) -> k=2 (v0.9.70, both labels below floor,
// aggregate 1+1=2 >= floor -> single "Other" bucket uniq=2) -> k=1 (this fix, both labels >= floor
// -> both labels surface UNCHANGED as separate rows, no "Other" bucket emitted).
//
// Rationale for k=1: MCP_CLIENT_ALLOWLIST in routes/telemetry.js is a FIXED PUBLIC 13-label set
// whose contents leak no identifying information beyond install counts (already exposed via
// total_users). See housekeeper.js comment block for the full justification.
const popularToday = JSON.parse(globalToday.popular_mcp_json);
check('K_ANONYMITY_FLOOR is exported and equals 1 (regression guard: any bump to >=2 will fail this test)',
  K_ANONYMITY_FLOOR === 1,
  `got K_ANONYMITY_FLOOR=${K_ANONYMITY_FLOOR}`
);
check('popular_mcp_json at k=1: both real labels (Claude + Codex) surface as separate rows with uniq=1, no "Other" bucket',
  Array.isArray(popularToday)
    && popularToday.length === 2
    && popularToday.every((r) => r.uniq === 1)
    && popularToday.some((r) => r.mcp_client === 'Claude')
    && popularToday.some((r) => r.mcp_client === 'Codex')
    && popularToday.every((r) => r.mcp_client !== 'Other'),
  `got ${JSON.stringify(popularToday)}`
);

// Step 4: salt nudge.
const todaySalt = db.prepare('SELECT * FROM telemetry_daily_salt WHERE day_utc = ?').get(new Date().toISOString().slice(0, 10));
check('salt nudge minted today\'s row (runHousekeeperTick called hashIp with REAL now)', !!todaySalt, `got ${JSON.stringify(todaySalt)}`);

// Re-run idempotency: second tick produces the same outputs.
console.log('\n--- Idempotency: second tick ---');
runHousekeeperTick(db, queries, NOW);
const rollupAToday2 = db.prepare('SELECT * FROM telemetry_rollups_daily WHERE install_uuid = ? AND day_utc = ?').get(UUID_A, TODAY);
check('rollup (A, today).event_count still 3 after 2nd tick', rollupAToday2.event_count === 3, `got ${JSON.stringify(rollupAToday2)}`);

// Inject a broken Queries to confirm the handler swallows errors and keeps going.
console.log('\n--- Error-resilience: handler does not crash on injected SQL error ---');
const brokenQueries = {
  deleteOldEvents: { run: () => { throw new Error('synthetic SQL error'); } },
};
// Redirect console.error briefly to keep test output clean.
const originalErr = console.error;
let errCaptured = '';
console.error = (...args) => { errCaptured += args.join(' ') + '\n'; };
let threwOnBroken = false;
try {
  runHousekeeperTick(db, brokenQueries, NOW);
} catch (e) {
  threwOnBroken = true;
}
console.error = originalErr;
check('broken queries: runHousekeeperTick does NOT throw', !threwOnBroken, `threw: ${threwOnBroken}`);
check('broken queries: console.error logged the failure',
  errCaptured.includes('[housekeeper] tick failed') && errCaptured.includes('synthetic SQL error'),
  `captured: ${errCaptured}`
);

db.close();

console.log(`\n=== server-telemetry-housekeeper results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
