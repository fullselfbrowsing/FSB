/**
 * Phase 273 / INGEST-02 + INGEST-07(c)(d) -- two rate-limit layers.
 *
 * LAYER 1: createTelemetryRateLimiter(db) wraps express-rate-limit@^8.3.0
 * (CVE-2026-30827 IPv4-mapped-IPv6 collision fix) with a CUSTOM keyGenerator
 * that returns hashIp(req.ip, db). The rate-limit bucket and the storage
 * identifier are therefore the same value -- an attacker cannot rotate one
 * without also rotating the other (BLOCKER #2 alignment).
 *
 *   - windowMs:           60 * 1000 (1 minute)
 *   - max:                30 batches/min (env-overridable for tests)
 *   - standardHeaders:    'draft-7' -> RFC 9239 RateLimit-* headers
 *   - legacyHeaders:      false (no X-RateLimit-*)
 *
 * LAYER 2: checkPerUuidBudget(installUuid, nowMs?) tracks events-per-UUID-per-day
 * in an in-memory Map. Hot-path SQLite writes for budget would dwarf the cost
 * of the actual telemetry inserts; the in-memory Map is the right primitive.
 * Reset happens automatically when the UTC day rolls over for that UUID.
 *
 * Budget exceed: route returns 429 with the custom header
 * `X-FSB-Reason: per-uuid-budget`. The header is the routes module's responsibility
 * (the express-rate-limit handler fires for per-IP bucket exceed only).
 *
 * LAYER 3: checkPerIpDailyContribution(db, ipHash, installUuid, events, nowMs?)
 * uses the already-persisted, daily-rotating HMAC IP hash to cap both distinct
 * install UUIDs and token contribution per IP/day. The database is the source
 * of truth so process restarts do not reset these limits, and no plaintext IP
 * or additional tracking identifier is retained.
 */

'use strict';

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { hashIp } = require('../utils/telemetry-hash');

/**
 * @param {Database} db better-sqlite3 instance
 */
function createTelemetryRateLimiter(db) {
  // Env-override for tests that need to inject 1000+ events/UUID without tripping
  // the per-IP bucket first (see tests/server-telemetry-daily-budget.test.js).
  // Default 30 batches/min per CONTEXT decision.
  const max = parseInt(process.env.TELEMETRY_RATE_MAX, 10) || 30;

  return rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: 'draft-7',     // RFC 9239 RateLimit-* headers
    legacyHeaders: false,
    // BLOCKER #2 alignment: bucket key = HMAC-SHA256(canonicalised_ip, todays_salt).
    // The canonicalisation runs through express-rate-limit's ipKeyGenerator helper
    // which collapses IPv6 to a /56 subnet and resolves IPv4-mapped-IPv6 forms
    // (CVE-2026-30827 fix; req.ip alone would let dual-stack users escape buckets).
    // The hashIp() output becomes the same identifier we store as ip_hash in
    // telemetry_events, so an attacker cannot rotate the rate-limit identity
    // without also rotating the storage identity.
    // PRIVACY: req.ip is referenced exactly here, immediately canonicalised then
    // hashed; the canonical form is discarded after the digest.
    keyGenerator: (req) => hashIp(ipKeyGenerator(req.ip), db),
    handler: (req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
    skip: () => false,
  });
}

// Per-UUID daily budget tracking. The whole Map is discarded on UTC rollover;
// retaining one stale entry per UUID forever lets rotating identifiers exhaust
// the server heap. A hard daily cardinality cap bounds same-day abuse too.
const budgets = new Map();
const PER_UUID_DAILY_BUDGET = 1000;
const parsedBudgetEntryCap = parseInt(process.env.TELEMETRY_UUID_BUDGET_MAX, 10);
const MAX_UUID_BUDGET_ENTRIES = Number.isInteger(parsedBudgetEntryCap) && parsedBudgetEntryCap > 0
  ? parsedBudgetEntryCap
  : 100000;
let currentBudgetDay = null;

function positiveSafeIntegerEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Generous enough for a shared office/NAT, while preventing one source from
// manufacturing an unbounded user population or arbitrarily large token sum.
// Operators with a measured baseline can tune these without a deploy.
const PER_IP_DAILY_UUID_BUDGET = positiveSafeIntegerEnv('TELEMETRY_IP_DAILY_UUID_MAX', 20);
const PER_IP_DAILY_TOKEN_BUDGET = positiveSafeIntegerEnv('TELEMETRY_IP_DAILY_TOKEN_MAX', 100_000_000);

// Cache prepared statements by Database instance. WeakMap avoids extending a
// temporary/test database's lifetime and stores no request identity itself.
const perIpStatementCache = new WeakMap();

function utcDayString(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function msUntilNextUtcMidnight(nowMs) {
  const startOfTodayUtc = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );
  return startOfTodayUtc + 86400000 - nowMs;
}

function utcDayBounds(nowMs) {
  const d = new Date(nowMs);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { start, end: start + 86400000 };
}

function perIpStatements(db) {
  let statements = perIpStatementCache.get(db);
  if (statements) return statements;
  statements = {
    distinctInstalls: db.prepare(`
      SELECT COUNT(DISTINCT install_uuid) AS n
      FROM telemetry_events
      WHERE ip_hash = ? AND received_at >= ? AND received_at < ?
    `),
    hasInstall: db.prepare(`
      SELECT 1 AS present
      FROM telemetry_events
      WHERE ip_hash = ? AND install_uuid = ?
        AND received_at >= ? AND received_at < ?
      LIMIT 1
    `),
    tokenSum: db.prepare(`
      SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS n
      FROM telemetry_events
      WHERE ip_hash = ? AND received_at >= ? AND received_at < ?
    `),
    eventOwner: db.prepare('SELECT install_uuid FROM telemetry_events WHERE event_id = ? LIMIT 1'),
  };
  perIpStatementCache.set(db, statements);
  return statements;
}

/**
 * Bound one daily hashed-IP's contribution to public telemetry aggregates.
 * Duplicate event IDs are excluded from the proposed token contribution so a
 * legitimate replay remains idempotent even after the token ceiling is met.
 *
 * The caller has already shape-validated the batch and enforces one install
 * UUID per request. This function intentionally persists no new IP state; it
 * reads the existing daily `ip_hash` rows, whose salt rotates at UTC midnight.
 *
 * @param {Database} db better-sqlite3 instance
 * @param {string} ipHash daily HMAC digest, never a plaintext IP
 * @param {string} installUuid validated UUIDv4
 * @param {Array<object>} events in-window, validated candidate events
 * @param {number} [nowMs]
 * @returns {{ok:boolean, reason?:string, retryAfter?:number, current?:number, limit?:number}}
 */
function checkPerIpDailyContribution(db, ipHash, installUuid, events, nowMs = Date.now()) {
  if (!db || typeof db.prepare !== 'function'
      || typeof ipHash !== 'string' || ipHash.length === 0
      || typeof installUuid !== 'string' || installUuid.length === 0
      || !Array.isArray(events)
      || !Number.isFinite(nowMs)) {
    return { ok: false, reason: 'invalid_budget_input', retryAfter: msUntilNextUtcMidnight(Date.now()) };
  }

  const statements = perIpStatements(db);
  const { start, end } = utcDayBounds(nowMs);

  // INSERT OR IGNORE makes replays harmless. Mirror that here so already
  // persisted event IDs do not consume token headroom a second time.
  const batchIds = new Set();
  const newEvents = [];
  for (const event of events) {
    if (!event || typeof event.event_id !== 'string' || batchIds.has(event.event_id)) continue;
    batchIds.add(event.event_id);
    const existing = statements.eventOwner.get(event.event_id);
    if (existing && existing.install_uuid !== installUuid) {
      return { ok: false, reason: 'event_identity_mismatch' };
    }
    if (!existing) newEvents.push(event);
  }
  if (newEvents.length === 0) return { ok: true };

  const hasInstall = Boolean(statements.hasInstall.get(ipHash, installUuid, start, end));
  const distinctInstalls = Number(statements.distinctInstalls.get(ipHash, start, end).n) || 0;
  if (!hasInstall && distinctInstalls >= PER_IP_DAILY_UUID_BUDGET) {
    return {
      ok: false,
      reason: 'distinct_install_uuids',
      retryAfter: msUntilNextUtcMidnight(nowMs),
      current: distinctInstalls,
      limit: PER_IP_DAILY_UUID_BUDGET,
    };
  }

  const currentTokens = Number(statements.tokenSum.get(ipHash, start, end).n) || 0;
  let proposedTokens = 0;
  for (const event of newEvents) proposedTokens += event.tokens_in + event.tokens_out;
  if (!Number.isSafeInteger(proposedTokens)
      || currentTokens + proposedTokens > PER_IP_DAILY_TOKEN_BUDGET) {
    return {
      ok: false,
      reason: 'token_contribution',
      retryAfter: msUntilNextUtcMidnight(nowMs),
      current: currentTokens,
      limit: PER_IP_DAILY_TOKEN_BUDGET,
    };
  }

  return { ok: true };
}

/**
 * Increment + check the per-UUID daily counter.
 *
 * On UTC day rollover the counter for that UUID resets to 1.
 * Returns { ok: false, retryAfter, currentCount } once count >= 1000 for the day.
 *
 * @param {string} installUuid
 * @param {number} [nowMs]
 * @returns {{ ok: boolean, retryAfter?: number, currentCount?: number }}
 */
function checkPerUuidBudget(installUuid, nowMs = Date.now()) {
  const day_utc = utcDayString(nowMs);
  if (currentBudgetDay !== day_utc) {
    budgets.clear();
    currentBudgetDay = day_utc;
  }
  const entry = budgets.get(installUuid);
  if (!entry) {
    if (budgets.size >= MAX_UUID_BUDGET_ENTRIES) {
      return {
        ok: false,
        retryAfter: msUntilNextUtcMidnight(nowMs),
        currentCount: 0,
        reason: 'daily_uuid_capacity',
      };
    }
    budgets.set(installUuid, { count: 1, day_utc });
    return { ok: true, currentCount: 1 };
  }
  if (entry.count >= PER_UUID_DAILY_BUDGET) {
    return {
      ok: false,
      retryAfter: msUntilNextUtcMidnight(nowMs),
      currentCount: entry.count,
    };
  }
  entry.count += 1;
  return { ok: true, currentCount: entry.count };
}

/** Remove a privacy-deleted install from the in-memory daily budget. */
function forgetPerUuidBudget(installUuid) {
  if (typeof installUuid !== 'string' || installUuid.length === 0) return false;
  return budgets.delete(installUuid);
}

/** Test-only helper. Clears the per-UUID Map. */
function resetPerUuidBudget() {
  budgets.clear();
  currentBudgetDay = null;
}

function getPerUuidBudgetSizeForTest() {
  return budgets.size;
}

module.exports = {
  createTelemetryRateLimiter,
  checkPerUuidBudget,
  checkPerIpDailyContribution,
  forgetPerUuidBudget,
  resetPerUuidBudget,
  getPerUuidBudgetSizeForTest,
  PER_UUID_DAILY_BUDGET,
  MAX_UUID_BUDGET_ENTRIES,
  PER_IP_DAILY_UUID_BUDGET,
  PER_IP_DAILY_TOKEN_BUDGET,
};
