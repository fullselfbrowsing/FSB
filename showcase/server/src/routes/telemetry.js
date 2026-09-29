/**
 * Phase 273 / INGEST-07..10 + INGEST-12 -- anonymous telemetry ingest router.
 *
 * 3 PUBLIC POST endpoints (no auth -- anonymous by privacy mandate; adding auth
 * would create a tracking vector). Layered abuse defenses replace authentication:
 *
 *   - 32 KB body cap         (express.json({limit:'32kb'}) -> 413 PayloadTooLarge)
 *   - 50-event batch cap     (400 batch_too_large)
 *   - versioned allowlist    (400 unknown_field)
 *   - UUIDv4 shape           (400 invalid_event_id / invalid_install_uuid)
 *   - 13 + 'unknown' mcp_client allowlist (400 invalid_mcp_client)
 *   - event_type allowlist   (400 invalid_event_type)
 *   - timestamp tolerance    (+5min / -7d window; drop offending events; 400 if any dropped)
 *   - per-IP rate limit      (30 batches/min via express-rate-limit; CVE-2026-30827 fixed)
 *   - per-UUID daily budget  (1000 events/UUID/day; 429 X-FSB-Reason: per-uuid-budget)
 *   - Sec-GPC: 1             (-> 204 silent drop; no row inserted, no budget consumed)
 *   - INSERT OR IGNORE       (BEAT-04 client-side replay dedup survives at server)
 *
 * PRIVACY INVARIANT (per CONTEXT D-09 + INGEST-13):
 *   req.ip is referenced EXACTLY ONCE per request. The reference is the argument
 *   of a hashIp(req.ip, db) call -- never assigned to a local variable, never
 *   logged, never persisted. tests/server-no-ip-leak.test.js audits this.
 */

'use strict';

const express = require('express');
const { ipKeyGenerator } = require('express-rate-limit');
const { isValidUuidV4 } = require('../utils/telemetry-hash');
// Quick task 260630-hct -- coarse IP -> region derive. Required directly as a
// sibling util (NOT passed through the router factory) so the factory signature
// stays stable. Posture mirrors hashIp: the plaintext client IP is an inline
// argument, used once then discarded; only the coarse region label and the
// address family are retained, and only k>=5-floored aggregates are published.
const { deriveRegion, classifyIp } = require('../utils/ip-geo');
const { regionLabel } = require('../utils/region-label');
const { clientIp } = require('../utils/client-ip');
const {
  createTelemetryRateLimiter,
  checkPerUuidBudget,
  checkPerIpDailyContribution,
  forgetPerUuidBudget,
} = require('../middleware/telemetry-rate-limit');
// Phase 274 / AGG-02 + AGG-03 -- in-memory liveness tracker. Hook fires AFTER
// the SQLite insert succeeds; failure paths (validation, timestamp, budget
// reject) do NOT record. Only counts/sums leave the module surface.
const activeTracker = require('../telemetry/active-tracker');

// ---------------------------------------------------------------------------
// Allowlists (hardcoded per CONTEXT specifics -- decoupled from Phase 270's JSON).
// ---------------------------------------------------------------------------

// Active-count v2 is optional during rollout; legacy collectors omit it.
const ALLOWED_EVENT_FIELDS = new Set([
  'event_id', 'install_uuid', 'ts_minute', 'mcp_client', 'model',
  'tokens_in', 'tokens_out', 'active_agent_count', 'event_type',
  'active_count_version',
]);

// 13 labels from mcp/src/tools/visual-session.ts (v0.9.36 allowlist) + 'unknown'.
const MCP_CLIENT_ALLOWLIST = new Set([
  'Claude', 'Codex', 'ChatGPT', 'Perplexity', 'Windsurf', 'Cursor',
  'Antigravity', 'OpenCode', 'OpenClaw', 'OpenClaw 🦀', 'Grok', 'Gemini', 'Hermes',
  'unknown',
]);

const ALLOWED_EVENT_TYPES = new Set(['periodic', 'install_announce']);

const FIVE_MIN_MS = 5 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BATCH = 50;
const MAX_MODEL_LEN = 128;
// A five-minute aggregate may legitimately contain several large-context
// calls, but billion-token single events are not plausible. Keep generous
// headroom while bounding one anonymous event's influence on public totals.
const TOKEN_COUNT_CEILING = 10_000_000;
// The extension registry enforces the same hard maximum. Rejecting impossible
// counts prevents one anonymous event from dominating active-now aggregates.
const ACTIVE_AGENT_COUNT_CEILING = 64;
const ACTIVE_COUNT_VERSION = 2;
// Retried queue entries may be accepted for seven days, but an old snapshot
// must not be reinterpreted as the install's current agent population.
const ACTIVE_AGENT_LIVENESS_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Validate one event against the strict allowlist + shape rules.
 * Returns null on success, { error, field? } on failure.
 */
function validateEvent(ev) {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) {
    return { error: 'invalid_event_shape' };
  }
  const keys = Object.keys(ev);
  for (const k of keys) {
    if (!ALLOWED_EVENT_FIELDS.has(k)) {
      return { error: 'unknown_field', field: k };
    }
  }

  if (!isValidUuidV4(ev.event_id)) return { error: 'invalid_event_id' };
  if (!isValidUuidV4(ev.install_uuid)) return { error: 'invalid_install_uuid' };

  if (!Number.isInteger(ev.ts_minute) || ev.ts_minute < 0) {
    return { error: 'invalid_ts_minute' };
  }
  if (!MCP_CLIENT_ALLOWLIST.has(ev.mcp_client)) {
    return { error: 'invalid_mcp_client' };
  }
  // model is optional in the SQL schema; an undefined value normalises to null on insert.
  // When present, it must be a string and <= 128 chars (per PITFALLS 5.1 cap).
  if (ev.model !== undefined && ev.model !== null) {
    if (typeof ev.model !== 'string' || ev.model.length > MAX_MODEL_LEN) {
      return { error: 'invalid_model' };
    }
  }
  for (const n of ['tokens_in', 'tokens_out']) {
    const v = ev[n];
    if (!Number.isInteger(v) || v < 0 || v > TOKEN_COUNT_CEILING) {
      return { error: `invalid_${n}` };
    }
  }
  const activeCountVersion = ev.active_count_version === undefined ? 0 : ev.active_count_version;
  if (activeCountVersion !== 0 && activeCountVersion !== ACTIVE_COUNT_VERSION) {
    return { error: 'invalid_active_count_version' };
  }
  // Legacy collectors are known to carry a leaked persistent counter. Accept
  // their batch so token/user telemetry survives rollout, but the insert path
  // stores an untrusted zero. V2 counts must satisfy the registry hard cap.
  const validLegacyCount = typeof ev.active_agent_count === 'number'
    && Number.isFinite(ev.active_agent_count) && ev.active_agent_count >= 0;
  const validV2Count = Number.isInteger(ev.active_agent_count)
    && ev.active_agent_count >= 0
    && ev.active_agent_count <= ACTIVE_AGENT_COUNT_CEILING;
  if ((activeCountVersion === ACTIVE_COUNT_VERSION && !validV2Count)
      || (activeCountVersion === 0 && !validLegacyCount)) {
    return { error: 'invalid_active_agent_count' };
  }
  if (!ALLOWED_EVENT_TYPES.has(ev.event_type)) {
    return { error: 'invalid_event_type' };
  }
  return null;
}

/**
 * @param {Database} db better-sqlite3 instance
 * @param {Queries}  queries  showcase/server/src/db/queries.js instance
 * @param {Function} hashIp   the (plaintextIp, db) -> hex function from utils/telemetry-hash.js
 */
function createTelemetryRouter(db, queries, hashIp) {
  const router = express.Router();
  // INGEST-07(a): per-route 32 KB body cap. Express emits 413 PayloadTooLarge automatically.
  const bodyCap = express.json({ limit: '32kb' });
  // INGEST-02 + INGEST-07(c): per-IP-hash rate limit.
  const limiter = createTelemetryRateLimiter(db);

  // -----------------------------------------------------------------
  // POST /api/telemetry/events -- anonymous batch ingest.
  // -----------------------------------------------------------------
  // The IP limiter intentionally runs before JSON parsing. Malformed and
  // oversized attempts still consume burst budget instead of giving an
  // attacker a free, CPU-consuming parser path.
  router.post('/events', limiter, bodyCap, (req, res) => {
    // INGEST-10: Sec-GPC: 1 -> 204 silent drop BEFORE hashIp / DB writes.
    // Note: express-rate-limit middleware ran before this handler, so it already
    // counted the request in the per-IP bucket. The privacy guarantee we make is
    // "no row inserted + no per-UUID budget consumed", not "no rate-limit increment".
    if (req.get('Sec-GPC') === '1') {
      return res.status(204).end();
    }

    // PRIVACY INVARIANT -- Per CONTEXT D-09 + INGEST-13 + quick task 260630-hct:
    //   the plaintext client IP is referenced EXACTLY THREE times per request, on
    //   the next three lines, via clientIp(req) (Fly-Client-IP, else req.ip):
    //     1. hashIp(ipKeyGenerator(clientIp(req)), db)  -- rate-limit/HMAC hash
    //     2. deriveRegion(clientIp(req))                -- coarse city/state/country geo
    //     3. classifyIp(clientIp(req))                  -- address family enum, never the IP
    //   All three references are inline arguments to an immediately-evaluated
    //   call. The IP is NEVER assigned to a local that escapes this scope, NEVER
    //   logged, NEVER stored. What is retained is the ip_hash, the coarse region
    //   label, and the address-family enum: on the raw event (7-day retention)
    //   and, for region + geo_kind, on the install's daily rollup (365-day
    //   retention, erased with the install). Public output is k>=5 floored.
    //   Test: tests/server-no-ip-leak.test.js (positively asserts the 3-inline count).
    //
    // Why clientIp() instead of req.ip: Fly's X-Forwarded-For chain is two hops
    // (client + shared/anycast). trust proxy 1 therefore hashes/geolocates the
    // SJC anycast IPv4 (everyone → US-CA) or a 6PN IPv6 (everyone → unknown),
    // and the per-IP UUID cap of 20 silently drops the rest of the world.
    // Fly-Client-IP is the TCP peer Fly accepted. Geo uses the raw address, NOT
    // ipKeyGenerator's IPv6 /56 form -- that string is not an IPv4 and would
    // force every IPv6 client (most of India) into 'unknown'.
    //
    // WR-02 alignment (Phase 273 review): ipKeyGenerator is the CVE-2026-30827 fix
    // from express-rate-limit. It collapses IPv6 addresses to a /56 subnet and
    // normalises IPv4-mapped-IPv6 forms so dual-stack users cannot escape buckets
    // by switching address families. middleware/telemetry-rate-limit.js already
    // applies it to the rate-limit bucket key; applying the same canonicalisation
    // here makes the stored ip_hash equal to the rate-limit bucket key for every
    // request (the "same identifier" invariant claimed by that middleware's
    // docstring). For IPv6 clients this slightly widens anonymity (same /56 ->
    // same stored hash); for IPv4 it is a no-op since ipKeyGenerator returns the
    // address unchanged.
    const clientHash = hashIp(ipKeyGenerator(clientIp(req)), db);
    // Second inline client-IP touch: coarse geo derive. Pass the raw client
    // address, not the rate-limit key. deriveRegion unwraps IPv4-mapped IPv6,
    // returns {country, subdivision, city} | 'unknown'; regionLabel() collapses
    // it to a compact place STRING (e.g. 'US-CA/San Jose', 'US-CA', 'unknown').
    const regionTag = regionLabel(deriveRegion(clientIp(req)));
    // Third inline client-IP touch: address-family enum only (never the IP).
    // Persisted beside region so 'unknown' is diagnosable after 7-day event
    // expiry (ipv6-ula = Fly 6PN, ipv6-cidr = /56 rate-limit key, ipv6 = native
    // IPv6 with no city table, ipv4 = dataset miss).
    const geoKind = classifyIp(clientIp(req));

    const body = req.body;
    if (!body || !Array.isArray(body.events)) {
      return res.status(400).json({ error: 'invalid_payload' });
    }
    if (body.events.length === 0) {
      // Benign empty batch -- 204 no work.
      return res.status(204).end();
    }
    if (body.events.length > MAX_BATCH) {
      return res.status(400).json({ error: 'batch_too_large', max: MAX_BATCH, got: body.events.length });
    }

    // INGEST-09 / D-12: strict allowlist + shape validation per event.
    // ANY validation failure poisons the WHOLE batch (no per-event opt-in).
    for (let i = 0; i < body.events.length; i++) {
      const err = validateEvent(body.events[i]);
      if (err) {
        return res.status(400).json(err);
      }
    }

    // The official collector owns one stable install identity, so a valid
    // retry batch can contain many events but never many identities. Rejecting
    // mixed UUIDs prevents one anonymous request from manufacturing up to 50
    // distinct users and 50 independent daily-budget buckets.
    const batchInstallUuid = body.events[0].install_uuid;
    if (body.events.some((ev) => ev.install_uuid !== batchInstallUuid)) {
      return res.status(400).json({ error: 'mixed_install_uuid_batch' });
    }

    // INGEST-07(e): timestamp tolerance. Drop offending events only;
    // remaining events still inserted. If ANY dropped, return 400 AFTER insertion
    // with {error:'timestamp_out_of_window', dropped, accepted}.
    const now = Date.now();
    const minOk = now - SEVEN_DAYS_MS;
    const maxOk = now + FIVE_MIN_MS;
    const inWindow = [];
    const droppedTs = [];
    for (const ev of body.events) {
      if (ev.ts_minute > maxOk || ev.ts_minute < minOk) {
        droppedTs.push(ev);
      } else {
        inWindow.push(ev);
      }
    }

    // A UUID can be rotated cheaply by an anonymous sender, so the UUID-only
    // budget is insufficient on its own. Bound the proposed contribution by
    // the already-computed daily HMAC IP hash. This reads existing rows only;
    // it neither stores nor exposes a plaintext IP or a new identifier.
    const ipBudget = checkPerIpDailyContribution(
      db,
      clientHash,
      batchInstallUuid,
      inWindow,
      now,
    );
    if (!ipBudget.ok) {
      if (ipBudget.reason === 'event_identity_mismatch') {
        return res.status(400).json({ error: 'event_id_identity_mismatch' });
      }
      const reason = ipBudget.reason === 'token_contribution'
        ? 'per-ip-token-budget'
        : 'per-ip-uuid-budget';
      res.set('X-FSB-Reason', reason);
      if (Number.isFinite(ipBudget.retryAfter)) {
        res.set('Retry-After', String(Math.max(1, Math.ceil(ipBudget.retryAfter / 1000))));
      }
      return res.status(429).json({
        error: 'per_ip_daily_budget_exceeded',
        reason: ipBudget.reason,
        accepted: 0,
        inserted: 0,
        limit: ipBudget.limit,
      });
    }

    // INGEST-07(d): per-UUID daily budget. Each event is counted independently;
    // the single-identity batch gate above guarantees one UUID for this loop.
    const budgetAccepted = [];
    let droppedBudget = 0;
    for (const ev of inWindow) {
      const b = checkPerUuidBudget(ev.install_uuid, now);
      if (b.ok) {
        budgetAccepted.push(ev);
      } else {
        droppedBudget += 1;
      }
    }

    // INGEST-05 / INGEST-07(f): wrap inserts in a single transaction so a
    // 50-event batch = 1 WAL commit. INSERT OR IGNORE swallows duplicate event_id
    // (BEAT-04 client-side replay-dedup survives at the server boundary).
    let inserted = 0;
    if (budgetAccepted.length > 0) {
      const tx = db.transaction((rows) => {
        let n = 0;
        for (const e of rows) {
          // Quick task 260630-hct -- 12-arg region-bearing insert. The trailing
          // regionTag is a coarse city-granularity label derived inline above,
          // NEVER the raw IP. All other args + batching/budget logic unchanged.
          const activeCountVersion = e.active_count_version === ACTIVE_COUNT_VERSION
            ? ACTIVE_COUNT_VERSION : 0;
          const trustedActiveCount = activeCountVersion === ACTIVE_COUNT_VERSION
            ? e.active_agent_count : 0;
          const r = queries.insertTelemetryEventWithRegionV3.run(
            e.event_id, e.install_uuid, e.ts_minute,
            e.mcp_client, e.model || null,
            e.tokens_in, e.tokens_out, trustedActiveCount,
            activeCountVersion, e.event_type, clientHash, now, regionTag, geoKind
          );
          n += r.changes;
        }
        return n;
      });
      inserted = tx(budgetAccepted);
    }

    // Record one liveness update for this single-install batch, even when
    // INSERT OR IGNORE recognized a retry. Receive time proves the client is
    // online; only a recent event is allowed to supply its agent population.
    // A day-old queued event therefore counts as an active user with an
    // unknown (zero) current agent count instead of reviving stale concurrency.
    if (budgetAccepted.length > 0) {
      let freshest = budgetAccepted[0];
      for (let i = 1; i < budgetAccepted.length; i += 1) {
        if (budgetAccepted[i].ts_minute > freshest.ts_minute
            || (budgetAccepted[i].ts_minute === freshest.ts_minute
              && budgetAccepted[i].active_count_version === ACTIVE_COUNT_VERSION
              && freshest.active_count_version !== ACTIVE_COUNT_VERSION)) {
          freshest = budgetAccepted[i];
        }
      }
      const hasFreshActiveSnapshot = freshest.ts_minute >= now - ACTIVE_AGENT_LIVENESS_MAX_AGE_MS;
      const livenessActiveVersion = hasFreshActiveSnapshot
          && freshest.active_count_version === ACTIVE_COUNT_VERSION
        ? ACTIVE_COUNT_VERSION : 0;
      const livenessAgentCount = livenessActiveVersion === ACTIVE_COUNT_VERSION
        ? freshest.active_agent_count
        : 0;
      activeTracker.recordSeen(
        batchInstallUuid,
        livenessAgentCount,
        now,
        clientHash,
        livenessActiveVersion,
      );
    }

    // Build the response. Priority of error status codes:
    //  1. all-budget-rejected  -> 429 with X-FSB-Reason: per-uuid-budget
    //  2. any-timestamp-dropped -> 400 timestamp_out_of_window (after partial insert)
    //  3. otherwise            -> 200 with {accepted, inserted}
    if (budgetAccepted.length === 0 && droppedBudget > 0 && droppedTs.length === 0) {
      res.set('X-FSB-Reason', 'per-uuid-budget');
      return res.status(429).json({
        error: 'per_uuid_budget_exceeded',
        accepted: 0,
        inserted: 0,
        dropped_budget: droppedBudget,
      });
    }
    if (droppedTs.length > 0) {
      return res.status(400).json({
        error: 'timestamp_out_of_window',
        accepted: budgetAccepted.length,
        inserted,
        dropped_timestamps: droppedTs.length,
        dropped_budget: droppedBudget,
      });
    }
    if (droppedBudget > 0) {
      // Some events accepted, some hit the daily budget. Return 200 with the partial-success body
      // plus the X-FSB-Reason header so the client knows why some events did not land.
      res.set('X-FSB-Reason', 'per-uuid-budget');
      return res.status(200).json({
        accepted: budgetAccepted.length,
        inserted,
        dropped_budget: droppedBudget,
      });
    }
    return res.status(200).json({ accepted: budgetAccepted.length, inserted });
  });

  // -----------------------------------------------------------------
  // POST /api/telemetry/optout -- 204 always (no enumeration leak).
  //   NOT rate-limited; privacy operation must always succeed.
  // -----------------------------------------------------------------
  router.post('/optout', bodyCap, (req, res) => {
    const installUuid = req.body && req.body.install_uuid;
    if (!isValidUuidV4(installUuid)) {
      return res.status(400).json({ error: 'invalid_install_uuid' });
    }
    queries.deleteEventsByUuid.run(installUuid);
    queries.deleteRollupsByUuid.run(installUuid);
    activeTracker.forgetInstall(installUuid);
    forgetPerUuidBudget(installUuid);
    // No row counts in response (no enumeration leak per T-273-05).
    return res.status(204).end();
  });

  // -----------------------------------------------------------------
  // POST /api/telemetry/forget -- GDPR Article 17; same contract as /optout.
  //   NOT rate-limited; privacy operation must always succeed.
  // -----------------------------------------------------------------
  router.post('/forget', bodyCap, (req, res) => {
    const installUuid = req.body && req.body.install_uuid;
    if (!isValidUuidV4(installUuid)) {
      return res.status(400).json({ error: 'invalid_install_uuid' });
    }
    queries.deleteEventsByUuid.run(installUuid);
    queries.deleteRollupsByUuid.run(installUuid);
    activeTracker.forgetInstall(installUuid);
    forgetPerUuidBudget(installUuid);
    return res.status(204).end();
  });

  // Keep body-parser failures deterministic and safe in both the standalone
  // router tests and the production server's generic error stack. Never echo
  // malformed request content in a response.
  router.use((err, _req, res, next) => {
    if (err && (err.status === 413 || err.type === 'entity.too.large')) {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    if (err && (err.status === 400 || err.type === 'entity.parse.failed')) {
      return res.status(400).json({ error: 'invalid_json' });
    }
    return next(err);
  });

  return router;
}

module.exports = createTelemetryRouter;
module.exports.createTelemetryRouter = createTelemetryRouter;
module.exports.MCP_CLIENT_ALLOWLIST = MCP_CLIENT_ALLOWLIST;
module.exports.ALLOWED_EVENT_FIELDS = ALLOWED_EVENT_FIELDS;
module.exports.ALLOWED_EVENT_TYPES = ALLOWED_EVENT_TYPES;
module.exports.TOKEN_COUNT_CEILING = TOKEN_COUNT_CEILING;
module.exports.ACTIVE_AGENT_COUNT_CEILING = ACTIVE_AGENT_COUNT_CEILING;
module.exports.ACTIVE_COUNT_VERSION = ACTIVE_COUNT_VERSION;
module.exports.ACTIVE_AGENT_LIVENESS_MAX_AGE_MS = ACTIVE_AGENT_LIVENESS_MAX_AGE_MS;
