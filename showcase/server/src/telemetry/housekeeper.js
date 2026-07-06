/**
 * Phase 273 / INGEST-11 -- hourly housekeeper.
 *
 * Every hour:
 *   1. DELETE telemetry_events older than 7 days (retention policy).
 *   2. Re-aggregate today + yesterday per install_uuid into telemetry_rollups_daily.
 *   3. Recompute telemetry_global_aggregates for today + yesterday, applying
 *      a k>=K_ANONYMITY_FLOOR anonymity floor on the mcp_client popular list
 *      (below-k labels bucket as "Other"). Floor history:
 *        - v0.9.69: floor=5 (free-form-label defaults)
 *        - v0.9.70: floor=2 (dev-phase visibility tradeoff)
 *        - v0.9.70+ (this change): floor=1, effectively DISABLING the floor.
 *      Rationale: MCP_CLIENT_ALLOWLIST in routes/telemetry.js is a FIXED
 *      PUBLIC 13-label set (Claude, Codex, ChatGPT, Perplexity, Windsurf,
 *      Cursor, Antigravity, OpenCode, OpenClaw, OpenClaw 🦀, Grok, Gemini,
 *      Hermes + 'unknown'). The label set carries no identifying information
 *      beyond the per-label install count, and that count is already exposed
 *      via total_users. Bucketing single-install labels into "Other" only
 *      hides legitimate diversity at single-digit install totals (the live
 *      bug: 3 installs, 3 distinct clients, all surfaced as 100% "Other").
 *   4. Nudge salt rotation by calling hashIp('0.0.0.0', db) -- the result is
 *      discarded; '0.0.0.0' is a harmless throwaway literal; the side effect
 *      is the lazy getOrMintTodaySalt() inside hashIp.
 *
 * Errors are logged via console.error but NEVER thrown. The interval must
 * never crash. tests/server-telemetry-housekeeper.test.js exercises a single
 * tick on an in-memory DB.
 */

'use strict';

const Queries = require('../db/queries');
const { hashIp } = require('../utils/telemetry-hash');

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const K_ANONYMITY_FLOOR = 1;
// Quick task 260630-hct -- region anonymity floor. HARD-required at k>=5 by
// CONTEXT (do NOT reuse the relaxed K_ANONYMITY_FLOOR=1 used for mcp_client).
// Regions with fewer than 5 unique installs collapse into a single 'Other'
// bucket; that bucket is suppressed entirely when its summed install count is
// itself < 5. This guarantees no surfaced region label represents < 5 installs.
const REGION_K_FLOOR = 5;

/**
 * Quick task 260630-hct -- apply a k-anonymity floor to a {label, uniq} list.
 * Rows with uniq >= floor pass through unchanged (keyed under `key`); rows below
 * the floor sum into a single { [key]: 'Other', uniq: <sum> } bucket, which is
 * SUPPRESSED when that sum is itself < floor. Mirrors the popular_mcp logic.
 *
 * @param {Array<Object>} rows  rows from a selectPopular*ForDayRange query
 * @param {string} key          the label field name on each row (e.g. 'region')
 * @param {number} floor        the k-anonymity floor
 * @returns {Array<Object>}
 */
function applyKFloor(rows, key, floor) {
  const above = rows.filter((r) => (r.uniq || 0) >= floor);
  const belowInstalls = rows
    .filter((r) => (r.uniq || 0) < floor)
    .reduce((sum, r) => sum + (r.uniq || 0), 0);
  return belowInstalls >= floor
    ? [...above, { [key]: 'Other', uniq: belowInstalls }]
    : above; // suppress entirely when total below-floor installs is itself < floor
}

function floorToUtcDayMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dayUtcKey(ms) {
  return new Date(floorToUtcDayMs(ms)).toISOString().slice(0, 10);
}

/**
 * Run a single housekeeper tick. Safe to invoke from anywhere; never throws.
 *
 * @param {Database} db better-sqlite3 instance
 * @param {Queries}  [queries] reuse a Queries instance to avoid re-preparing
 *                             statements; created fresh if absent.
 * @param {number}   [nowMs]   override Date.now() (test injection only).
 */
function runHousekeeperTick(db, queries, nowMs = Date.now()) {
  try {
    if (!queries) queries = new Queries(db);

    // Step 1: 7-day retention.
    queries.deleteOldEvents.run(nowMs - SEVEN_DAYS_MS);

    // Step 2 + 3: recompute rollups + globals for today and yesterday.
    for (const dayOffset of [0, 1]) {
      const dayStart = floorToUtcDayMs(nowMs - dayOffset * ONE_DAY_MS);
      const dayEnd = dayStart + ONE_DAY_MS;
      const dayKey = dayUtcKey(dayStart);

      const uuids = queries.selectUuidsForDayRange.all(dayStart, dayEnd);
      for (const u of uuids) {
        const row = queries.aggregateRollupForUuidDay.get(dayStart, dayEnd, u.install_uuid);
        if (!row) continue;
        queries.upsertRollupDaily.run(
          u.install_uuid,
          dayKey,
          row.tokens_in || 0,
          row.tokens_out || 0,
          row.max_active_agents || 0,
          row.event_count || 0
        );
      }

      const g = queries.selectGlobalForDayRange.get(dayStart, dayEnd) || {};
      const popularMcpRaw = queries.selectPopularMcpForDayRange.all(dayStart, dayEnd);

      // k>=K_ANONYMITY_FLOOR anonymity floor per D-07 (WR-01 fix from Phase 273
      // review). Floor history: 5 (v0.9.69) -> 2 (v0.9.70) -> 1 (this change).
      // At floor=1, every row from selectPopularMcpForDayRange already satisfies
      // `uniq >= 1` (GROUP BY emits no zero-count rows), so `above` equals
      // `popularMcpRaw`, `belowInstalls` is 0, and no "Other" bucket is ever
      // emitted. The filter + reduce stay in place so a future bump to floor>=2
      // (e.g. if MCP_CLIENT_ALLOWLIST ever opens to free-form labels) re-engages
      // bucketing without further plumbing.
      //
      // Each row's `uniq` is COUNT(DISTINCT install_uuid) per mcp_client (see
      // queries.js:selectPopularMcpForDayRange). The historical WR-01 fix --
      // SUMMING below-k installs (not COUNTING below-k labels) and SUPPRESSING
      // the bucket when the aggregate is itself < floor -- is preserved verbatim
      // below for that future-bump case.
      const above = popularMcpRaw.filter((r) => (r.uniq || 0) >= K_ANONYMITY_FLOOR);
      const belowInstalls = popularMcpRaw
        .filter((r) => (r.uniq || 0) < K_ANONYMITY_FLOOR)
        .reduce((sum, r) => sum + (r.uniq || 0), 0);
      const popularMcp = belowInstalls >= K_ANONYMITY_FLOOR
        ? [...above, { mcp_client: 'Other', uniq: belowInstalls }]
        : above; // suppress entirely when total below-k installs is itself < k
      // Phase 274 will source per-agent popularity from the rolled-up rows; v0.9.69 leaves this empty.
      const popularAgent = [];

      // Quick task 260630-hct -- region rollup at the HARD k>=5 floor (NOT the
      // relaxed mcp floor of 2). Rows are {region, uniq=COUNT(DISTINCT install_uuid)};
      // below-5 regions (including 'unknown' if it does not clear k) collapse into a
      // single {region:'Other', uniq:<sum>} bucket, suppressed when that sum < 5.
      const popularRegionRaw = queries.selectPopularRegionForDayRange.all(dayStart, dayEnd);
      const popularRegion = applyKFloor(popularRegionRaw, 'region', REGION_K_FLOOR);

      queries.upsertGlobalAggregateWithRegion.run(
        dayKey,
        g.unique_installs || 0,
        g.tokens_in_sum || 0,
        g.tokens_out_sum || 0,
        g.agents_active_sum || 0,
        JSON.stringify(popularMcp),
        JSON.stringify(popularAgent),
        JSON.stringify(popularRegion)
      );
    }

    // Step 4: nudge salt rotation. The '0.0.0.0' literal is a throwaway value
    // that never reaches storage; hashIp's side effect is the lazy
    // getOrMintTodaySalt() which we want to fire on every tick so the salt
    // table contains today's row even if no real traffic arrived.
    hashIp('0.0.0.0', db);
  } catch (err) {
    // Per CONTEXT "Errors logged but never crash the interval".
    console.error('[housekeeper] tick failed:', err && err.message ? err.message : err);
  }
}

/**
 * Start the hourly housekeeper. Runs once immediately (so the first aggregate
 * row exists before the next hour), then every hour. Returns the interval
 * handle so the caller can clearInterval() during shutdown.
 *
 * @param {Database} db better-sqlite3 instance
 * @returns {ReturnType<typeof setInterval>}
 */
function startHousekeeper(db) {
  const queries = new Queries(db);
  // Fire once on boot (next event-loop tick to avoid blocking startup).
  setImmediate(() => runHousekeeperTick(db, queries));
  return setInterval(() => runHousekeeperTick(db, queries), ONE_HOUR_MS);
}

module.exports = {
  startHousekeeper,
  runHousekeeperTick,
  floorToUtcDayMs,
  K_ANONYMITY_FLOOR,
  REGION_K_FLOOR,
  ONE_HOUR_MS,
};
