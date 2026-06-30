/**
 * Phase 274 / AGG-01..09 + STATS-04 -- anonymous public-aggregates router.
 *
 * Two GET endpoints with NO auth middleware (anonymous-by-design per STATS-04):
 *
 *   - GET /global          -- FSBTelemetryHeadline response (10 fields).
 *   - GET /global/series   -- FSBTelemetrySeries response (30d/90d/365d windows).
 *
 * Caching:
 *   - In-process Map keyed by route path. TTL = 30 s. LRU cap = 100 entries
 *     (only 2 routes today; the cap is belt-and-suspenders).
 *   - ETag = sha256(body).slice(0,16) wrapped in double quotes per RFC 7232.
 *   - Cache-Control: max-age=60 lets edge caches absorb load too.
 *
 * Privacy invariants:
 *   - Response body is hand-built from typed fields (FSBTelemetryHeadline). No
 *     SELECT *, no row-shape echo. tests/server-public-stats-no-auth.test.js
 *     regex-asserts no UUIDs, no ip_hash, no event_id leak.
 *   - res.removeHeader('Set-Cookie') runs before every send -- the CORS layer
 *     has credentials:true but on a path with no auth no cookie should ever be
 *     set. Defensive removal closes the loop.
 *
 * Coupling:
 *   - Reads telemetry_rollups_daily + telemetry_global_aggregates via
 *     queries.getPublicHeadlineRows() + queries.getPublicSeriesRows().
 *   - Reads in-memory liveness via active-tracker.countActiveUsers / getActiveAgentSum.
 *   - popular_mcp_json / popular_agent_json arrive pre-filtered by Phase 273
 *     housekeeper (k>=5 floor; below-k collapsed to "Other (N=<sum>)" -- per
 *     D-07 + WR-01).
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const activeTracker = require('../telemetry/active-tracker');

// 30-second in-process memo TTL.
const MEMO_TTL_MS = 30 * 1000;
// Hard cap on memo size. Only 2 routes exist today; cap guards against a future
// misconfigured caller (e.g. mounting under a wildcard).
const MEMO_MAX_ENTRIES = 100;
// HTTP Cache-Control header value.
const CACHE_CONTROL = 'public, max-age=60';

// Active-now windows (per CONTEXT decisions §"Active right now" sources).
const ACTIVE_USERS_WINDOW_MS = 5 * 60 * 1000;   // 5 min
const ACTIVE_AGENTS_WINDOW_MS = 10 * 60 * 1000; // 10 min

/**
 * Compute the ETag for a JSON body. Per RFC 7232 we wrap the hex digest
 * in double quotes (e.g. "abc123def4567890"). Slicing to 16 hex chars
 * = 64 bits of entropy -- comfortably collision-free for two routes.
 *
 * @param {string} bodyText
 * @returns {string}
 */
function etagFor(bodyText) {
  const hex = crypto.createHash('sha256').update(bodyText).digest('hex').slice(0, 16);
  return `"${hex}"`;
}

/**
 * Defensive JSON parse for popular_mcp_json / popular_agent_json columns.
 * Always returns an array (empty on parse failure or non-array payload).
 *
 * @param {string|null|undefined} json
 * @returns {Array<Object>}
 */
function safeParseArray(json) {
  if (json === null || json === undefined) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Build the FSBTelemetryHeadline JSON object.
 *
 * @param {Queries} queries
 * @returns {Object}
 */
function buildHeadlineJson(queries) {
  const rows = queries.getPublicHeadlineRows();
  const active_users_now = activeTracker.countActiveUsers(ACTIVE_USERS_WINDOW_MS);
  const active_agents_now = activeTracker.getActiveAgentSum(ACTIVE_AGENTS_WINDOW_MS);

  // popular_mcp_json rows look like {mcp_client, uniq}; rename to {label, uniq}
  // for the public-facing FSBTelemetryHeadline contract. popular_agent_json
  // follows the same shape (housekeeper writes {agent, uniq} -> rename agent).
  const popularMcpRaw = safeParseArray(rows.latest_global.popular_mcp_json);
  const popularAgentRaw = safeParseArray(rows.latest_global.popular_agent_json);
  // Quick task 260630-hct -- region breakdown. Stored as {region, uniq} (already
  // k>=5-floored by the housekeeper; sub-floor regions folded into 'Other'); map
  // region -> label for the public contract, mirroring the popular_mcp_clients shape.
  const popularRegionRaw = safeParseArray(rows.latest_global.popular_region_json);
  const popular_mcp_clients = popularMcpRaw.map((r) => ({
    label: typeof r.label === 'string' ? r.label
         : typeof r.mcp_client === 'string' ? r.mcp_client
         : 'unknown',
    uniq: Number.isInteger(r.uniq) ? r.uniq : 0,
  }));
  const popular_agents = popularAgentRaw.map((r) => ({
    label: typeof r.label === 'string' ? r.label
         : typeof r.agent === 'string' ? r.agent
         : 'unknown',
    uniq: Number.isInteger(r.uniq) ? r.uniq : 0,
  }));
  const popular_regions = popularRegionRaw.map((r) => ({
    label: typeof r.label === 'string' ? r.label
         : typeof r.region === 'string' ? r.region
         : 'unknown',
    uniq: Number.isInteger(r.uniq) ? r.uniq : 0,
  }));

  const avg_agents_per_user = active_users_now > 0
    ? Math.round((active_agents_now / active_users_now) * 10) / 10
    : 0;

  return {
    active_users_now,
    active_agents_now,
    active_agents_bucket: activeTracker.bucketAgents(active_agents_now),
    total_users: rows.total_users,
    total_agents_lifetime: rows.total_agents_lifetime,
    tokens_total_lifetime: rows.tokens_total_lifetime,
    tokens_24h: rows.tokens_24h,
    popular_mcp_clients,
    popular_agents,
    popular_regions,
    avg_agents_per_user,
  };
}

/**
 * Build the FSBTelemetrySeries JSON object.
 *
 * @param {Queries} queries
 * @returns {Object}
 */
function buildSeriesJson(queries) {
  const rows = queries.getPublicSeriesRows();
  const mapRow = (r) => ({
    day_utc: r.day_utc,
    unique_installs: r.unique_installs || 0,
    tokens: (r.tokens_in_sum || 0) + (r.tokens_out_sum || 0),
    agents_active: r.agents_active_sum || 0,
  });
  return {
    d30:  rows.d30.map(mapRow),
    d90:  rows.d90.map(mapRow),
    d365: rows.d365.map(mapRow),
  };
}

/**
 * Factory: returns a memoize-wrapped Express handler for one route key.
 * Honours If-None-Match, sets ETag + Cache-Control, strips Set-Cookie.
 *
 * @param {string} routeKey
 * @param {() => Object} builder
 * @param {Map<string, {body: string, etag: string, expiresAt: number}>} memo
 */
function makeHandler(routeKey, builder, memo) {
  return (req, res) => {
    const now = Date.now();
    let entry = memo.get(routeKey);
    if (!entry || entry.expiresAt <= now) {
      // LRU-ish eviction: if at cap, drop the oldest entry (the first key in
      // insertion-ordered Map iteration). Only fires when MEMO_MAX_ENTRIES is
      // reached; with 2 routes today this branch is effectively dead code.
      if (memo.size >= MEMO_MAX_ENTRIES) {
        const oldest = memo.keys().next().value;
        if (oldest !== undefined) memo.delete(oldest);
      }
      const obj = builder();
      const body = JSON.stringify(obj);
      const etag = etagFor(body);
      entry = { body, etag, expiresAt: now + MEMO_TTL_MS };
      memo.set(routeKey, entry);
    }

    // Strip any Set-Cookie the CORS layer or middleware below may have
    // added defensively. Public route MUST never set cookies (T-274-01).
    res.removeHeader('Set-Cookie');

    // ETag + Cache-Control are always set, even on 304.
    res.set('ETag', entry.etag);
    res.set('Cache-Control', CACHE_CONTROL);

    // If-None-Match round-trip per RFC 7232. Note: client may send the value
    // bare (no quotes) or quoted; we accept exact match against our quoted form.
    const inm = req.get('If-None-Match');
    if (inm && inm === entry.etag) {
      return res.status(304).end();
    }

    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(entry.body);
  };
}

/**
 * Build the public-stats router.
 *
 * @param {Database} db    -- better-sqlite3 instance (kept for parity with other routers; not used directly here).
 * @param {Queries}  queries -- showcase/server/src/db/queries.js instance with the new Phase 274 helpers.
 * @returns {express.Router}
 */
function createPublicStatsRouter(db, queries) {
  const router = express.Router();
  // Module-private memo keyed by route path. Lives as long as the router does
  // (i.e. process lifetime under normal mounts). _resetMemoForTest below is
  // exposed for tests that need to force a rebuild.
  const memo = new Map();

  router.get('/global', makeHandler('/global', () => buildHeadlineJson(queries), memo));
  router.get('/global/series', makeHandler('/global/series', () => buildSeriesJson(queries), memo));

  // Quick task 260516-7l5 -- server-side GitHub stats cache route.
  // The poller (src/telemetry/github-poller.js) populates github_cache every
  // 5 min; this handler serves the cached JSON STRING verbatim with the same
  // memo + ETag + Cache-Control + no-Set-Cookie posture as /global. First-boot
  // empty-cache case returns 503 + Retry-After: 60 (NOT 404) so the client
  // recognises "data not ready yet" vs "endpoint does not exist".
  const { GITHUB_ENDPOINT_IDS } = require('../telemetry/github-poller');
  const GITHUB_ALLOW = new Set(GITHUB_ENDPOINT_IDS);

  router.get('/github/:endpoint_id', (req, res) => {
    const endpointId = req.params.endpoint_id;

    // Always strip Set-Cookie before any send (defensive parity with line above).
    res.removeHeader('Set-Cookie');

    if (!GITHUB_ALLOW.has(endpointId)) {
      return res.status(400).json({ error: 'unknown endpoint_id' });
    }

    const memoKey = `github:${endpointId}`;
    const now = Date.now();
    let entry = memo.get(memoKey);

    if (!entry || entry.expiresAt <= now) {
      // Rebuild from DB. If cache row absent, return 503 (first-boot pending).
      const row = queries.getGithubCachePayload(endpointId);
      if (!row) {
        res.set('Retry-After', '60');
        return res.status(503).json({ error: 'cache pending', endpoint_id: endpointId });
      }
      // LRU eviction (mirrors the existing makeHandler behavior).
      if (memo.size >= MEMO_MAX_ENTRIES) {
        const oldest = memo.keys().next().value;
        if (oldest !== undefined) memo.delete(oldest);
      }
      // payload_json is already a JSON STRING; etag is sha256 over it (matches
      // /global path's etag-over-stringified-body contract).
      const body = row.payload;
      const etag = etagFor(body);
      entry = { body, etag, expiresAt: now + MEMO_TTL_MS };
      memo.set(memoKey, entry);
    }

    res.set('ETag', entry.etag);
    res.set('Cache-Control', CACHE_CONTROL);

    const inm = req.get('If-None-Match');
    if (inm && inm === entry.etag) return res.status(304).end();

    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(entry.body);
  });

  // Test-only attachments. Kept on the router so a test holding the router
  // reference can reach them without re-importing this module.
  router._memo = memo;
  router._resetMemoForTest = () => memo.clear();
  router._GITHUB_ALLOW = GITHUB_ALLOW;

  return router;
}

module.exports = createPublicStatsRouter;
module.exports.createPublicStatsRouter = createPublicStatsRouter;
module.exports.buildHeadlineJson = buildHeadlineJson;
module.exports.buildSeriesJson = buildSeriesJson;
module.exports.etagFor = etagFor;
module.exports.MEMO_TTL_MS = MEMO_TTL_MS;
