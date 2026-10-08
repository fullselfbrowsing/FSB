/**
 * Phase 273 / INGEST-11 -- hourly housekeeper.
 *
 * Every hour:
 *   1. DELETE telemetry_events older than 7 days (retention policy).
 *   2. Enforce 365-day retention on per-UUID telemetry_rollups_daily rows;
 *      pre-v2 active values remain quarantined as untrusted history.
 *   3. Re-aggregate today + yesterday per install_uuid into telemetry_rollups_daily,
 *      including the install's last successful coarse region + geo_kind
 *      (anonymous, 365-day durable last-known location; never an IP). A later
 *      'unknown' that day must not replace a real region already on the row.
 *   3b. Copy last-successful region/geo_kind onto existing rollup rows for the
 *       rest of the 7-day event window so a deploy backfills remaining events.
 *   4. Recompute telemetry_global_aggregates for today + yesterday, applying
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
 *   5. Nudge salt rotation by calling hashIp('0.0.0.0', db) -- the result is
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
const { regionDepth, regionParent } = require('../utils/region-label');

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ROLLUP_RETENTION_DAYS = 365;
const ACTIVE_COUNT_VERSION = 2;
const K_ANONYMITY_FLOOR = 1;
// Quick task 260630-hct -- region anonymity floor. HARD-required at k>=5 by
// CONTEXT (do NOT reuse the relaxed K_ANONYMITY_FLOOR=1 used for mcp_client).
// No published region label -- city, subdivision, country, or 'Other' -- ever
// represents fewer than 5 unique installs; see applyRegionKFloor.
const REGION_K_FLOOR = 5;

/**
 * Publish each install at the most specific place that clears the k-floor.
 *
 * Labels nest city -> subdivision -> country (region-label.js). Working from
 * the finest level up, a label with >= `floor` installs is published and the
 * installs of one below the floor move to its parent: 'US-CA/Fresno' (2) joins
 * 'US-CA', which may then clear the floor on its own. Top-level labels still
 * short (countries, 'unknown') pool into 'Other', which is itself dropped when
 * under the floor. Every install lands in exactly one bucket, so the published
 * counts are disjoint and each is >= `floor`.
 *
 * An install that appears under several labels keeps the first; the callers'
 * queries already return one row per install.
 *
 * @param {Array<{region:string}>} rows
 * @param {string} memberKey install id field on each row
 * @param {number} floor
 * @returns {Array<{region:string, uniq:number}>} published labels by size, 'Other' last
 */
function applyRegionKFloor(rows, memberKey, floor) {
  const pools = new Map();
  const addMember = (label, member) => {
    let members = pools.get(label);
    if (!members) { members = new Set(); pools.set(label, members); }
    members.add(member);
  };

  const placed = new Set();
  for (const row of rows) {
    if (!row || typeof row.region !== 'string' || row.region === '') continue;
    const member = row[memberKey];
    if (typeof member !== 'string' || placed.has(member)) continue;
    placed.add(member);
    addMember(row.region, member);
  }

  const published = [];
  const other = new Set();
  let depth = 0;
  for (const label of pools.keys()) depth = Math.max(depth, regionDepth(label));
  for (; depth >= 0; depth--) {
    for (const [label, members] of [...pools]) {
      if (regionDepth(label) !== depth) continue;
      pools.delete(label);
      if (members.size >= floor) {
        published.push({ region: label, uniq: members.size });
        continue;
      }
      const parent = regionParent(label);
      for (const member of members) {
        if (parent === null) other.add(member);
        else addMember(parent, member);
      }
    }
  }

  published.sort((a, b) => b.uniq - a.uniq || a.region.localeCompare(b.region));
  return other.size >= floor
    ? [...published, { region: 'Other', uniq: other.size }]
    : published;
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

    // Step 1: 7-day raw-event retention.
    queries.deleteOldEvents.run(nowMs - SEVEN_DAYS_MS);

    // Step 2: retain exactly today + the prior 364 UTC days. Legacy active
    // maxima are deliberately not normalized into public history: rows written
    // before active-count v2 are known-corrupt and remain quarantined.
    const oldestRetainedRollupDay = dayUtcKey(
      floorToUtcDayMs(nowMs) - (ROLLUP_RETENTION_DAYS - 1) * ONE_DAY_MS
    );
    queries.deleteOldRollups.run(oldestRetainedRollupDay);

    // Step 3 + 4: recompute rollups + globals for today and yesterday.
    for (const dayOffset of [0, 1]) {
      const dayStart = floorToUtcDayMs(nowMs - dayOffset * ONE_DAY_MS);
      const dayEnd = dayStart + ONE_DAY_MS;
      const dayKey = dayUtcKey(dayStart);

      const uuids = queries.selectUuidsForDayRange.all(dayStart, dayEnd);
      const regionMemberships = queries.selectRegionInstallMembershipsForDayRange.all(dayStart, dayEnd);
      // Seed with the latest event so an install whose lookups all failed keeps
      // the failure's geo_kind (ipv6-ula, ipv6-cidr, ...) on its rollup, then
      // let the last successful lookup of the day win over it.
      const locationByUuid = new Map();
      const successfulMemberships = queries.selectLastSuccessfulRegionMembershipsForDayRange.all(dayStart, dayEnd);
      for (const row of [...regionMemberships, ...successfulMemberships]) {
        if (!row || typeof row.install_uuid !== 'string') continue;
        locationByUuid.set(row.install_uuid, {
          region: typeof row.region === 'string' && row.region ? row.region : 'unknown',
          geo_kind: typeof row.geo_kind === 'string' && row.geo_kind ? row.geo_kind : 'unknown',
        });
      }
      for (const u of uuids) {
        const row = queries.aggregateRollupForUuidDay.get(dayStart, dayEnd, u.install_uuid);
        if (!row) continue;
        const loc = locationByUuid.get(u.install_uuid) || { region: 'unknown', geo_kind: 'unknown' };
        queries.upsertRollupDailyV3.run(
          u.install_uuid,
          dayKey,
          row.tokens_in || 0,
          row.tokens_out || 0,
          row.max_active_agents || 0,
          row.trusted_active_sample_count || 0,
          row.event_count || 0,
          loc.region,
          loc.geo_kind
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

      // Region rollup uses each install's latest membership for the day.
      // Assigning one region before applying the floor prevents a roaming
      // install from being counted in two published places.
      const popularRegion = applyRegionKFloor(regionMemberships, 'install_uuid', REGION_K_FLOOR);

      queries.upsertGlobalAggregateV2.run(
        dayKey,
        g.unique_installs || 0,
        g.tokens_in_sum || 0,
        g.tokens_out_sum || 0,
        g.agents_active_sum || 0,
        JSON.stringify(popularMcp),
        JSON.stringify(popularAgent),
        JSON.stringify(popularRegion),
        nowMs,
        ACTIVE_COUNT_VERSION,
        g.trusted_active_installs || 0
      );
    }

    // Copy last-successful region onto rollups for the rest of the 7-day event
    // window without recomputing (and possibly zeroing) those days' global
    // aggregates. Today + yesterday already wrote region via upsertRollupDailyV3.
    // Unknown memberships are omitted so a late failed lookup cannot wipe a
    // real region already stored on that day.
    for (let dayOffset = 2; dayOffset <= 7; dayOffset += 1) {
      const dayStart = floorToUtcDayMs(nowMs - dayOffset * ONE_DAY_MS);
      const dayEnd = dayStart + ONE_DAY_MS;
      const dayKey = dayUtcKey(dayStart);
      const successfulMemberships = queries.selectLastSuccessfulRegionMembershipsForDayRange.all(dayStart, dayEnd);
      for (const row of successfulMemberships) {
        if (!row || typeof row.install_uuid !== 'string') continue;
        const region = typeof row.region === 'string' && row.region ? row.region : 'unknown';
        if (region === 'unknown') continue;
        queries.updateRollupRegion.run(
          region,
          typeof row.geo_kind === 'string' && row.geo_kind ? row.geo_kind : 'unknown',
          row.install_uuid,
          dayKey
        );
      }
    }

    // Step 5: nudge salt rotation. The '0.0.0.0' literal is a throwaway value
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
  applyRegionKFloor,
  K_ANONYMITY_FLOOR,
  REGION_K_FLOOR,
  ROLLUP_RETENTION_DAYS,
  ACTIVE_COUNT_VERSION,
  ONE_HOUR_MS,
};
