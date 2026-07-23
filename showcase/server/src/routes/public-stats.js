/**
 * Phase 274 / AGG-01..09 + STATS-04 -- anonymous public-aggregates router.
 *
 * Two GET endpoints with NO auth middleware (anonymous-by-design per STATS-04):
 *
 *   - GET /global          -- FSBTelemetryHeadline response.
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
// A complete last-known-good GitHub snapshot remains useful during a short
// upstream outage, but it is never served indefinitely.
const GITHUB_CACHE_FRESH_MS = 15 * 60 * 1000;
const GITHUB_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000;

// One cohort and one timestamp for all active-now fields. The collector beats
// every five minutes, so a ten-minute window tolerates one delayed heartbeat
// without dividing an agent total by a different user population.
const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

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

function isoFromMsOrNull(value) {
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}

/**
 * Build the FSBTelemetryHeadline JSON object.
 *
 * @param {Queries} queries
 * @returns {Object}
 */
function buildHeadlineJson(queries) {
  const activeSnapshotMs = Date.now();
  const rows = queries.getPublicHeadlineRows(activeSnapshotMs);
  const active_users_now = activeTracker.countActiveUsers(ACTIVE_WINDOW_MS, activeSnapshotMs);
  const active_agents_now = activeTracker.getActiveAgentSum(ACTIVE_WINDOW_MS, activeSnapshotMs);
  const active_agents_reporting_users_now = activeTracker.countActiveAgentReporters(
    ACTIVE_WINDOW_MS,
    activeSnapshotMs,
  );

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

  const avg_agents_per_reporting_user = active_agents_reporting_users_now > 0
    ? Math.round((active_agents_now / active_agents_reporting_users_now) * 10) / 10
    : 0;
  const active_agents_coverage = active_users_now > 0
    ? active_agents_reporting_users_now / active_users_now
    : 1;
  const aggregateUsers = Number(rows.latest_global.unique_installs) || 0;
  const aggregateReportingUsers = Number(rows.latest_global.trusted_active_installs) || 0;
  const aggregate_active_coverage = aggregateUsers > 0
    ? aggregateReportingUsers / aggregateUsers
    : rows.latest_global.active_count_version >= 2 ? 1 : 0;

  return {
    generated_at: new Date(activeSnapshotMs).toISOString(),
    aggregate_as_of_day: rows.latest_global.day_utc || null,
    aggregate_updated_at: isoFromMsOrNull(rows.latest_global.updated_at),
    active_users_now,
    active_agents_now,
    active_agents_reporting_users_now,
    active_agents_coverage,
    active_agents_bucket: activeTracker.bucketAgents(active_agents_now),
    active_count_version: activeTracker.ACTIVE_COUNT_VERSION,
    active_history_since: rows.active_history_since,
    active_history_complete: false,
    active_metric_semantics: 'reported_registry_count_v2',
    users_365d: rows.users_365d,
    // Deprecated compatibility alias. Per-install rollups are retained for
    // 365 days, so this is not a lifetime distinct-user count.
    total_users: rows.total_users,
    agent_days_lifetime: rows.agent_days_lifetime,
    // Deprecated compatibility alias. It stays null because pre-v2 history is
    // corrupt and anonymous snapshots cannot count distinct lifetime agents.
    total_agents_lifetime: rows.total_agents_lifetime,
    agent_days_since_active_v2: rows.agent_days_since_active_v2,
    tokens_total_lifetime: rows.tokens_total_lifetime,
    tokens_24h: rows.tokens_24h,
    popular_mcp_clients,
    popular_agents,
    popular_regions,
    avg_agents_per_reporting_user,
    // Compatibility alias now uses the only valid denominator: installs that
    // supplied a v2 active count in the same ten-minute cohort.
    avg_agents_per_user: avg_agents_per_reporting_user,
    aggregate_active_reporting_installs: aggregateReportingUsers,
    aggregate_active_coverage,
  };
}

/**
 * Build the FSBTelemetrySeries JSON object.
 *
 * @param {Queries} queries
 * @returns {Object}
 */
function buildSeriesJson(queries) {
  const generatedAtMs = Date.now();
  const rows = queries.getPublicSeriesRows(generatedAtMs);
  const mapRow = (r) => {
    const uniqueInstalls = Number(r.unique_installs) || 0;
    const reportingInstalls = Number(r.trusted_active_installs) || 0;
    const hasV2Semantics = Number(r.active_count_version) >= activeTracker.ACTIVE_COUNT_VERSION;
    const coverage = uniqueInstalls > 0
      ? reportingInstalls / uniqueInstalls
      : hasV2Semantics ? 1 : 0;
    return {
      day_utc: r.day_utc,
      unique_installs: uniqueInstalls,
      tokens: (r.tokens_in_sum || 0) + (r.tokens_out_sum || 0),
      // Deprecated ambiguous field. A daily sum of per-install maxima is not
      // concurrency, so consumers must use the explicitly named v2 field.
      agents_active: null,
      reported_agent_daily_peak_sum: hasV2Semantics ? (r.agents_active_sum || 0) : null,
      active_reporting_installs: reportingInstalls,
      active_coverage: coverage,
      active_data_state: !hasV2Semantics ? 'unavailable' : coverage < 1 ? 'partial' : 'ready',
    };
  };
  return {
    generated_at: new Date(generatedAtMs).toISOString(),
    aggregate_as_of_day: rows.latest_global.day_utc || null,
    aggregate_updated_at: isoFromMsOrNull(rows.latest_global.updated_at),
    active_count_version: activeTracker.ACTIVE_COUNT_VERSION,
    active_history_since: rows.active_history_since,
    active_history_complete: false,
    active_metric_semantics: 'sum_of_per_install_daily_peaks',
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

  // Server-side GitHub stats cache route. The response is rebuilt through the
  // poller's public-payload sanitizer even for legacy database rows, so raw
  // GitHub identities and bulky nested objects can never be republished.
  const { GITHUB_ENDPOINT_IDS, sanitizePublicPayload } = require('../telemetry/github-poller');
  const GITHUB_ALLOW = new Set(GITHUB_ENDPOINT_IDS);

  function pendingResponse(res, endpointId, error, row, now) {
    const nextRetryAt = row && Number.isFinite(row.nextRetryAt) ? row.nextRetryAt : null;
    const retrySeconds = nextRetryAt && nextRetryAt > now
      ? Math.max(60, Math.ceil((nextRetryAt - now) / 1000))
      : 60;
    res.set('Retry-After', String(retrySeconds));
    return res.status(503).json({ error, endpoint_id: endpointId });
  }

  function parsedCacheRow(row) {
    try { return JSON.parse(row.payload); } catch { return null; }
  }

  function repoStarSnapshot(now, minimumFetchedAt = 0) {
    const summaryRow = queries.getGithubCachePayload('repo-summary');
    if (
      !summaryRow || summaryRow.fetchedAt <= 0 ||
      summaryRow.fetchedAt < minimumFetchedAt ||
      now - summaryRow.fetchedAt > GITHUB_CACHE_MAX_STALE_MS
    ) {
      return null;
    }
    const parsed = parsedCacheRow(summaryRow);
    if (!parsed || !Number.isInteger(parsed.stargazers_count) || parsed.stargazers_count < 0) return null;
    return { total: parsed.stargazers_count, fetchedAt: summaryRow.fetchedAt };
  }

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
      // Rebuild from DB. If cache row is absent, this is a first-boot pending
      // condition, not a missing API endpoint.
      const row = queries.getGithubCachePayload(endpointId);
      if (!row) {
        return pendingResponse(res, endpointId, 'cache pending', null, now);
      }

      // Legacy star and commit arrays are reduced safely at response time and
      // carry their own history_complete=false marker.
      if (!Number.isFinite(row.fetchedAt) || row.fetchedAt <= 0) {
        return pendingResponse(res, endpointId, 'cache pending', row, now);
      }

      // A repository summary may repair a legacy/incomplete star row, but an
      // older summary must never overwrite a newer aggregate from a complete
      // stargazer traversal.
      const starSnapshot = endpointId === 'stars'
        ? repoStarSnapshot(now, row.isComplete ? row.fetchedAt : 0)
        : null;
      if (endpointId === 'stars' && !row.isComplete && !starSnapshot) {
        return pendingResponse(res, endpointId, 'cache incomplete', row, now);
      }
      const effectiveFetchedAt = starSnapshot
        ? Math.max(row.fetchedAt, starSnapshot.fetchedAt)
        : row.fetchedAt;
      const newerCountOnlyStarSnapshot = endpointId === 'stars' && Boolean(
        starSnapshot && starSnapshot.fetchedAt > row.fetchedAt
      );
      const ageMs = Math.max(0, now - effectiveFetchedAt);
      if (ageMs > GITHUB_CACHE_MAX_STALE_MS) {
        return pendingResponse(res, endpointId, 'cache stale', row, now);
      }

      const parsed = parsedCacheRow(row);
      if (parsed === null) {
        return pendingResponse(res, endpointId, 'cache invalid', row, now);
      }

      let publicPayload;
      try {
        publicPayload = sanitizePublicPayload(endpointId, parsed, {
          nowMs: effectiveFetchedAt,
          repoTotal: starSnapshot ? starSnapshot.total : undefined,
          historyComplete: row.isComplete && !newerCountOnlyStarSnapshot,
        });
      } catch {
        return pendingResponse(res, endpointId, 'cache invalid', row, now);
      }

      // LRU eviction (mirrors the existing makeHandler behavior).
      if (memo.size >= MEMO_MAX_ENTRIES) {
        const oldest = memo.keys().next().value;
        if (oldest !== undefined) memo.delete(oldest);
      }
      const body = JSON.stringify(publicPayload);
      const etag = etagFor(body);
      const checkedAt = Number.isFinite(row.lastAttemptAt) && row.lastAttemptAt > 0
        ? row.lastAttemptAt
        : effectiveFetchedAt;
      const refreshFailed = Number.isFinite(row.lastErrorStatus) && row.lastErrorStatus !== null;
      entry = {
        body,
        etag,
        expiresAt: now + MEMO_TTL_MS,
        fetchedAt: effectiveFetchedAt,
        checkedAt,
        upstreamStatus: refreshFailed ? row.lastErrorStatus : row.status,
        cacheState: !refreshFailed && ageMs <= GITHUB_CACHE_FRESH_MS ? 'fresh' : 'stale',
        nextRetryAt: row.nextRetryAt,
        payloadAsOf: typeof publicPayload.as_of === 'string' ? publicPayload.as_of : null,
      };
      memo.set(memoKey, entry);
    }

    res.set('ETag', entry.etag);
    res.set('Cache-Control', CACHE_CONTROL);
    res.set('X-FSB-Stats-Cache', entry.cacheState);
    res.set('X-FSB-Stats-Fetched-At', new Date(entry.fetchedAt).toISOString());
    res.set('X-FSB-Stats-Checked-At', new Date(entry.checkedAt).toISOString());
    res.set('X-FSB-Stats-Upstream-Status', String(entry.upstreamStatus));
    if (entry.payloadAsOf) res.set('X-FSB-Stats-Payload-As-Of', entry.payloadAsOf);
    if (entry.nextRetryAt) {
      res.set('X-FSB-Stats-Next-Retry-At', new Date(entry.nextRetryAt).toISOString());
    }

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
module.exports.GITHUB_CACHE_FRESH_MS = GITHUB_CACHE_FRESH_MS;
module.exports.GITHUB_CACHE_MAX_STALE_MS = GITHUB_CACHE_MAX_STALE_MS;
module.exports.ACTIVE_WINDOW_MS = ACTIVE_WINDOW_MS;
