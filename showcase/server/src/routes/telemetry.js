/**
 * Phase 273 / INGEST-07..10 + INGEST-12 -- anonymous telemetry ingest router.
 *
 * 3 PUBLIC POST endpoints (no auth -- anonymous by privacy mandate; adding auth
 * would create a tracking vector). Layered abuse defenses replace authentication:
 *
 *   - 32 KB body cap         (express.json({limit:'32kb'}) -> 413 PayloadTooLarge)
 *   - 50-event batch cap     (400 batch_too_large)
 *   - 9-field allowlist      (400 unknown_field)
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
// stays stable. Posture mirrors hashIp: req.ip is an inline argument, used once
// then discarded; only the k>=5-floored aggregate region label is retained.
const { deriveRegion } = require('../utils/ip-geo');
const { createTelemetryRateLimiter, checkPerUuidBudget } = require('../middleware/telemetry-rate-limit');
// Phase 274 / AGG-02 + AGG-03 -- in-memory liveness tracker. Hook fires AFTER
// the SQLite insert succeeds; failure paths (validation, timestamp, budget
// reject) do NOT record. Only counts/sums leave the module surface.
const activeTracker = require('../telemetry/active-tracker');

// ---------------------------------------------------------------------------
// Allowlists (hardcoded per CONTEXT specifics -- decoupled from Phase 270's JSON).
// ---------------------------------------------------------------------------

// Exactly 9 fields are permitted per event. ANY extra key -> 400 unknown_field.
const ALLOWED_EVENT_FIELDS = new Set([
  'event_id', 'install_uuid', 'ts_minute', 'mcp_client', 'model',
  'tokens_in', 'tokens_out', 'active_agent_count', 'event_type',
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
const NUMERIC_CEILING = 1_000_000_000;

// Quick task 260630-hct -- US state name -> USPS 2-letter code, so the stored
// region label is compact (e.g. "US-CA") rather than a free-form state string.
const US_STATE_CODES = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

/**
 * Quick task 260630-hct -- normalise a deriveRegion() result into a compact,
 * state-granularity STRING label for storage (never the raw IP).
 *
 *   { country: 'US', subdivision: 'California' } -> 'US-CA'
 *   { country: 'AU', subdivision: 'Victoria' }   -> 'AU-Victoria' (slugged)
 *   'unknown' / missing country                  -> 'unknown'
 *
 * @param {{country?:string, subdivision?:string}|string} region
 * @returns {string}
 */
function regionLabel(region) {
  if (!region || typeof region !== 'object' || typeof region.country !== 'string' || region.country === '') {
    return 'unknown';
  }
  const country = region.country.trim().toUpperCase().slice(0, 8);
  const sub = typeof region.subdivision === 'string' ? region.subdivision.trim() : '';
  if (sub === '') return country;
  if (country === 'US' && US_STATE_CODES[sub]) {
    return `US-${US_STATE_CODES[sub]}`;
  }
  // Generic compact slug for non-US (or unknown US) subdivisions: collapse
  // whitespace to single hyphens and cap length so labels stay bounded.
  const slug = sub.replace(/\s+/g, '-').slice(0, 24);
  return `${country}-${slug}`;
}

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
  for (const n of ['tokens_in', 'tokens_out', 'active_agent_count']) {
    const v = ev[n];
    if (!Number.isInteger(v) || v < 0 || v > NUMERIC_CEILING) {
      return { error: `invalid_${n}` };
    }
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
  router.post('/events', bodyCap, limiter, (req, res) => {
    // INGEST-10: Sec-GPC: 1 -> 204 silent drop BEFORE hashIp / DB writes.
    // Note: express-rate-limit middleware ran before this handler, so it already
    // counted the request in the per-IP bucket. The privacy guarantee we make is
    // "no row inserted + no per-UUID budget consumed", not "no rate-limit increment".
    if (req.get('Sec-GPC') === '1') {
      return res.status(204).end();
    }

    // PRIVACY INVARIANT -- Per CONTEXT D-09 + INGEST-13 + quick task 260630-hct:
    //   req.ip is referenced EXACTLY TWICE per request, on the next two lines:
    //     1. hashIp(ipKeyGenerator(req.ip), db)      -- rate-limit/HMAC hash
    //     2. deriveRegion(ipKeyGenerator(req.ip))    -- coarse country/US-state geo
    //   BOTH references are inline arguments to an immediately-evaluated call. In
    //   neither case is req.ip (or the canonical form ipKeyGenerator returns)
    //   assigned to a local variable that escapes this scope, NEVER logged, NEVER
    //   stored. Plaintext IP is discarded at end-of-function. Only the derived
    //   ip_hash and the k>=5-floored AGGREGATE region label are retained; the raw
    //   per-event region is rolled up daily and dropped by the 7-day retention --
    //   there is no durable (install_uuid -> region) profile.
    //   Test: tests/server-no-ip-leak.test.js (positively asserts the 2-inline count).
    //
    // WR-02 alignment (Phase 273 review): ipKeyGenerator is the CVE-2026-30827 fix
    // from express-rate-limit. It collapses IPv6 addresses to a /56 subnet and
    // normalises IPv4-mapped-IPv6 forms so dual-stack users cannot escape buckets
    // by switching address families. middleware/telemetry-rate-limit.js:54 already
    // applies it to the rate-limit bucket key; applying the same canonicalisation
    // here makes the stored ip_hash equal to the rate-limit bucket key for every
    // request (the "same identifier" invariant claimed by that middleware's
    // docstring). For IPv6 clients this slightly widens anonymity (same /56 ->
    // same stored hash); for IPv4 it is a no-op since ipKeyGenerator returns the
    // address unchanged.
    const clientHash = hashIp(ipKeyGenerator(req.ip), db);
    // Second (and only other) inline req.ip touch: coarse geo derive. deriveRegion
    // returns {country, subdivision} | 'unknown'; regionLabel() collapses it to a
    // compact state-granularity STRING (e.g. 'US-CA' or 'unknown'). The plaintext
    // IP is consumed inline here exactly as in the hashIp call above and discarded.
    const regionTag = regionLabel(deriveRegion(ipKeyGenerator(req.ip)));

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

    // INGEST-07(d): per-UUID daily budget. Each event is counted independently
    // (one batch may carry events from multiple install_uuids in pathological
    // cases; the budget reset is per-UUID/day).
    const budgetAccepted = [];
    let droppedBudget = 0;
    for (const ev of inWindow) {
      const b = checkPerUuidBudget(ev.install_uuid);
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
          // regionTag is a coarse state-granularity label derived inline above,
          // NEVER the raw IP. All other args + batching/budget logic unchanged.
          const r = queries.insertTelemetryEventWithRegion.run(
            e.event_id, e.install_uuid, e.ts_minute,
            e.mcp_client, e.model || null,
            e.tokens_in, e.tokens_out, e.active_agent_count,
            e.event_type, clientHash, now, regionTag
          );
          n += r.changes;
        }
        return n;
      });
      inserted = tx(budgetAccepted);
    }

    // Phase 274 / AGG-02 + AGG-03 -- record active liveness in the in-memory
    // tracker AFTER the SQLite insert succeeded for the batch. We pass the
    // wall-clock receive time `now` (already captured at line 168), NOT
    // ev.ts_minute (client clock). A drifted client cannot pin itself as
    // "active" indefinitely because the tracker stores receive time.
    // Note: we record once per event in budgetAccepted, even if INSERT OR IGNORE
    // dropped some as duplicates -- the activity signal is "client beat for this
    // UUID in this window", which is still true on a replay collision.
    if (inserted > 0) {
      for (const ev of budgetAccepted) {
        activeTracker.recordSeen(ev.install_uuid, ev.active_agent_count, now);
      }
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
    return res.status(204).end();
  });

  return router;
}

module.exports = createTelemetryRouter;
module.exports.createTelemetryRouter = createTelemetryRouter;
module.exports.MCP_CLIENT_ALLOWLIST = MCP_CLIENT_ALLOWLIST;
module.exports.ALLOWED_EVENT_FIELDS = ALLOWED_EVENT_FIELDS;
module.exports.ALLOWED_EVENT_TYPES = ALLOWED_EVENT_TYPES;
