/**
 * Phase 67 / JEV-04, JEV-07 -- body-free Jev accounting on the server SQLite db.
 *
 * Two tables, created in src/db/schema.js (D-24):
 *   - jev_decisions: one row per upstream attempt, holding only allowlisted
 *     operational fields. 7-day retention.
 *   - jev_daily: one row per (UTC day, outcome) with request counts, known
 *     tokens, FSB-borne cost by source and a separate spend-cap accrual (D-06,
 *     Pitfall 9). 365-day retention.
 *
 * Write policy (Pitfall 13): recordDecision is only for requests that reached
 * the router's upstream attempt (LEDGER_OUTCOMES). Every refusal before that
 * attempt goes through recordAggregateOnly, which bumps one bounded jev_daily
 * counter and never writes a ledger row, so anonymous refused traffic cannot
 * grow the database. 'server_error' is in both lists: a fault after the
 * upstream attempt is a ledger row carrying the attempt's spend accrual, a
 * fault before it is a counter only. Both land on the same (day, server_error)
 * aggregate row.
 *
 * Privacy (D-07, D-22, D-23, D-24):
 *   - no column can hold a goal, URL, origin, title, text, label, element id,
 *     hash key or IP; unknown row keys are ignored;
 *   - outcome, kinds, sources and calibration status must be CONTRACT members,
 *     so no caller string is ever stored;
 *   - usage and cost keep their source labels and are NULL when unknown,
 *     never 0; the served model is stored verbatim;
 *   - TypeError messages are fixed strings that never quote a value, and this
 *     module never logs.
 *
 * Prepared statements are cached per db in a WeakMap (as in
 * src/middleware/telemetry-rate-limit.js), not added to Queries, so the
 * housekeeper's broken-Queries test seam stays independent of Jev.
 */

'use strict';

const { CONTRACT } = require('./contract');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DECISION_RETENTION_MS = 7 * ONE_DAY_MS;
const DAILY_RETENTION_DAYS = 365;

// Gateway reasons that can only be produced by the upstream attempt itself.
const UPSTREAM_STAGE_REASONS = [
  'timeout',
  'rate_limited',
  'upstream_overloaded',
  'auth_error',
  'upstream_billing',
  'unavailable_model',
  'upstream_rejected',
  'upstream_error',
  'invalid_response',
];

// Both lists are derived from CONTRACT.GATEWAY_FALLBACK_REASONS, in contract
// order. A gateway reason added to the contract later lands in the
// aggregate-only list by default, which never writes a ledger row.
const LEDGER_OUTCOMES = Object.freeze([
  'ok',
  ...CONTRACT.GATEWAY_FALLBACK_REASONS.filter(
    (reason) => UPSTREAM_STAGE_REASONS.includes(reason) || reason === 'server_error'
  ),
]);
const AGGREGATE_ONLY_OUTCOMES = Object.freeze(
  CONTRACT.GATEWAY_FALLBACK_REASONS.filter((reason) => !UPSTREAM_STAGE_REASONS.includes(reason))
);

const LEDGER_COLUMNS = Object.freeze([
  'id',
  'decision_id',
  'created_at',
  'day_utc',
  'outcome',
  'served_model',
  'instrument_version',
  'calibration_status',
  'kinds',
  'element_count',
  'request_bytes',
  'input_tokens',
  'usage_source',
  'cost_usd',
  'cost_source',
  'upstream_latency_ms',
  'gateway_latency_ms',
  'upstream_status',
  'hash_key_present',
]);

// Fixed key order of the one allowlisted decision log line (D-24).
const LOG_KEYS = Object.freeze([
  'decisionId',
  'outcome',
  'kinds',
  'elements',
  'bytes',
  'servedModel',
  'calibration',
  'inputTokens',
  'usageSource',
  'costUsd',
  'costSource',
  'upstreamMs',
  'gatewayMs',
  'upstreamStatus',
  'hashKeyPresent',
]);

const statementCache = new WeakMap();

// ---------------------------------------------------------------------------
// Value checks (fresh, non-global regex literals: no shared lastIndex)
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isNonNegativeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isDayUtc(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** decisionId: 1..64 printable, space-free ASCII characters (a UUID in practice). */
function isDecisionId(value) {
  return typeof value === 'string' && /^[\x21-\x7E]{1,64}$/.test(value);
}

/** Served model: the same printable 1..128 shape upstream.js accepts, kept verbatim. */
function isServedModel(value) {
  return typeof value === 'string' && /^[\x21-\x7E]{1,128}$/.test(value);
}

function isInstrumentVersion(value) {
  return typeof value === 'string' && /^[\x21-\x7E]{1,64}$/.test(value);
}

function isHttpStatus(value) {
  return Number.isSafeInteger(value) && value >= 100 && value <= 599;
}

function isContractKinds(kinds) {
  if (!Array.isArray(kinds) || kinds.length === 0 || kinds.length > CONTRACT.KINDS.length) return false;
  const seen = new Set();
  for (const kind of kinds) {
    if (typeof kind !== 'string' || !CONTRACT.KINDS.includes(kind) || seen.has(kind)) return false;
    seen.add(kind);
  }
  return true;
}

function invalid(field) {
  // Fixed field names only; never the rejected value (D-22).
  return new TypeError(`jev ledger: invalid ${field}`);
}

/** 'YYYY-MM-DD' for the UTC day containing `ms` (the housekeeper's day format). */
function dayUtcKey(ms) {
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);
}

/**
 * Validate a decision row and return the column values. Throws a TypeError
 * (fixed message) on the first invalid field. Unknown keys are ignored.
 */
function normalizeDecision(row) {
  if (!isPlainObject(row)) throw invalid('row');

  const { decisionId, createdAtMs, outcome } = row;
  if (!isDecisionId(decisionId)) throw invalid('decisionId');
  if (!isNonNegativeSafeInteger(createdAtMs)) throw invalid('createdAtMs');
  if (!LEDGER_OUTCOMES.includes(outcome)) throw invalid('outcome');

  const servedModel = row.servedModel == null ? null : row.servedModel;
  if (servedModel !== null && !isServedModel(servedModel)) throw invalid('servedModel');
  const instrumentVersion = row.instrumentVersion == null ? null : row.instrumentVersion;
  if (instrumentVersion !== null && !isInstrumentVersion(instrumentVersion)) throw invalid('instrumentVersion');
  const calibrationStatus = row.calibrationStatus == null ? null : row.calibrationStatus;
  if (calibrationStatus !== null && !CONTRACT.CALIBRATION_STATUSES.includes(calibrationStatus)) {
    throw invalid('calibrationStatus');
  }

  if (!isContractKinds(row.kinds)) throw invalid('kinds');
  if (!isNonNegativeSafeInteger(row.elementCount)) throw invalid('elementCount');
  if (!isNonNegativeSafeInteger(row.requestBytes)) throw invalid('requestBytes');

  // D-23: a source label with null, never 0, when the value is unknown.
  const usageSource = row.usageSource;
  if (!CONTRACT.USAGE_SOURCES.includes(usageSource)) throw invalid('usageSource');
  const inputTokens = row.inputTokens == null ? null : row.inputTokens;
  if (usageSource === 'unavailable' ? inputTokens !== null : !isNonNegativeSafeInteger(inputTokens)) {
    throw invalid('inputTokens');
  }

  const costSource = row.costSource;
  if (!CONTRACT.COST_SOURCES.includes(costSource)) throw invalid('costSource');
  const costUsd = row.costUsd == null ? null : row.costUsd;
  if (costSource === 'unavailable' ? costUsd !== null : !isNonNegativeFinite(costUsd)) {
    throw invalid('costUsd');
  }

  const upstreamLatencyMs = row.upstreamLatencyMs == null ? null : row.upstreamLatencyMs;
  if (upstreamLatencyMs !== null && !isNonNegativeFinite(upstreamLatencyMs)) throw invalid('upstreamLatencyMs');
  if (!isNonNegativeFinite(row.gatewayLatencyMs)) throw invalid('gatewayLatencyMs');
  const upstreamStatus = row.upstreamStatus == null ? null : row.upstreamStatus;
  if (upstreamStatus !== null && !isHttpStatus(upstreamStatus)) throw invalid('upstreamStatus');
  if (typeof row.hashKeyPresent !== 'boolean') throw invalid('hashKeyPresent');

  return {
    decisionId,
    createdAtMs,
    dayUtc: dayUtcKey(createdAtMs),
    outcome,
    servedModel,
    instrumentVersion,
    calibrationStatus,
    kinds: [...row.kinds].sort().join(','),
    elementCount: row.elementCount,
    requestBytes: row.requestBytes,
    inputTokens,
    usageSource,
    costUsd,
    costSource,
    upstreamLatencyMs: upstreamLatencyMs === null ? null : Math.round(upstreamLatencyMs),
    gatewayLatencyMs: Math.round(row.gatewayLatencyMs),
    upstreamStatus,
    hashKeyPresent: row.hashKeyPresent ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

function statements(db) {
  let cached = statementCache.get(db);
  if (cached) return cached;
  const insertDecision = db.prepare(`
    INSERT INTO jev_decisions (
      decision_id, created_at, day_utc, outcome, served_model, instrument_version,
      calibration_status, kinds, element_count, request_bytes, input_tokens,
      usage_source, cost_usd, cost_source, upstream_latency_ms, gateway_latency_ms,
      upstream_status, hash_key_present
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertDaily = db.prepare(`
    INSERT INTO jev_daily (
      day_utc, outcome, requests, input_tokens_known, input_tokens_unavailable,
      cost_provider_usd, cost_estimate_usd, cost_unavailable, cap_accrued_usd
    )
    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(day_utc, outcome) DO UPDATE SET
      requests = requests + 1,
      input_tokens_known = input_tokens_known + excluded.input_tokens_known,
      input_tokens_unavailable = input_tokens_unavailable + excluded.input_tokens_unavailable,
      cost_provider_usd = cost_provider_usd + excluded.cost_provider_usd,
      cost_estimate_usd = cost_estimate_usd + excluded.cost_estimate_usd,
      cost_unavailable = cost_unavailable + excluded.cost_unavailable,
      cap_accrued_usd = cap_accrued_usd + excluded.cap_accrued_usd
  `);
  const bumpDaily = db.prepare(`
    INSERT INTO jev_daily (day_utc, outcome, requests)
    VALUES (?, ?, 1)
    ON CONFLICT(day_utc, outcome) DO UPDATE SET requests = requests + 1
  `);
  const spendForDay = db.prepare(
    'SELECT COALESCE(SUM(cap_accrued_usd), 0) AS usd FROM jev_daily WHERE day_utc = ?'
  );
  const deleteOldDecisions = db.prepare('DELETE FROM jev_decisions WHERE created_at < ?');
  const deleteOldDaily = db.prepare('DELETE FROM jev_daily WHERE day_utc < ?');

  const writeDecision = db.transaction((v, capUsd) => {
    insertDecision.run(
      v.decisionId,
      v.createdAtMs,
      v.dayUtc,
      v.outcome,
      v.servedModel,
      v.instrumentVersion,
      v.calibrationStatus,
      v.kinds,
      v.elementCount,
      v.requestBytes,
      v.inputTokens,
      v.usageSource,
      v.costUsd,
      v.costSource,
      v.upstreamLatencyMs,
      v.gatewayLatencyMs,
      v.upstreamStatus,
      v.hashKeyPresent
    );
    upsertDaily.run(
      v.dayUtc,
      v.outcome,
      v.inputTokens === null ? 0 : v.inputTokens,
      v.inputTokens === null ? 1 : 0,
      v.costSource === 'provider' ? v.costUsd : 0,
      v.costSource === 'estimate' ? v.costUsd : 0,
      v.costSource === 'unavailable' ? 1 : 0,
      capUsd
    );
  });
  const prune = db.transaction((decisionCutoffMs, dailyCutoffDay) => ({
    decisions: deleteOldDecisions.run(decisionCutoffMs).changes,
    daily: deleteOldDaily.run(dailyCutoffDay).changes,
  }));

  cached = { bumpDaily, spendForDay, writeDecision, prune };
  statementCache.set(db, cached);
  return cached;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write one ledger row and its jev_daily UPSERT in a single transaction.
 *
 * @param {Database} db better-sqlite3 instance
 * @param {object} row {decisionId, createdAtMs, outcome, servedModel,
 *   instrumentVersion, calibrationStatus, kinds, elementCount, requestBytes,
 *   inputTokens, usageSource, costUsd, costSource, upstreamLatencyMs,
 *   gatewayLatencyMs, upstreamStatus, hashKeyPresent}
 * @param {{capUsd?: number}} [options] the attempt's spend-cap accrual (>= 0)
 * @throws {TypeError} on an invalid row (nothing is written)
 */
function recordDecision(db, row, { capUsd = 0 } = {}) {
  const values = normalizeDecision(row);
  if (!isNonNegativeFinite(capUsd)) throw invalid('capUsd');
  statements(db).writeDecision(values, capUsd);
}

/**
 * Count one refused request on its (day, outcome) aggregate row. Never writes
 * a ledger row (Pitfall 13).
 *
 * @param {Database} db better-sqlite3 instance
 * @param {{dayUtc: string, outcome: string}} entry outcome in AGGREGATE_ONLY_OUTCOMES
 * @throws {TypeError} on a malformed day or an outcome outside AGGREGATE_ONLY_OUTCOMES
 */
function recordAggregateOnly(db, entry) {
  if (!isPlainObject(entry)) throw invalid('entry');
  const { dayUtc, outcome } = entry;
  if (!isDayUtc(dayUtc)) throw invalid('dayUtc');
  if (!AGGREGATE_ONLY_OUTCOMES.includes(outcome)) throw invalid('outcome');
  statements(db).bumpDaily.run(dayUtc, outcome);
}

/**
 * The day's spend-cap accrual across every outcome (0 when there is none), used
 * to reseed the fleet-wide daily ceiling after a restart (D-06, Pitfall 9).
 */
function todaySpendUsd(db, dayUtc) {
  if (!isDayUtc(dayUtc)) throw invalid('dayUtc');
  const row = statements(db).spendForDay.get(dayUtc);
  const usd = row ? Number(row.usd) : 0;
  return Number.isFinite(usd) ? usd : 0;
}

/**
 * Retention: ledger rows older than 7 days and aggregates for UTC days before
 * the day 365 days back. Throws when the tables are missing; the housekeeper
 * runs this in its own guarded step.
 */
function pruneJevLedger(db, nowMs) {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) throw invalid('nowMs');
  return statements(db).prune(
    nowMs - DECISION_RETENTION_MS,
    dayUtcKey(nowMs - DAILY_RETENTION_DAYS * ONE_DAY_MS)
  );
}

/**
 * The single allowlisted decision log line: '[jev] decision ' + JSON with
 * decisionId first. Built from LOG_KEYS only; values outside the contract
 * become null (kinds keep only contract members), so unknown row keys and
 * caller strings never appear. Never throws.
 */
function formatDecisionLog(row) {
  const r = isPlainObject(row) ? row : {};
  const nullable = (value, ok) => (ok(value) ? value : null);
  const kinds = Array.isArray(r.kinds)
    ? [...new Set(r.kinds.filter((k) => typeof k === 'string' && CONTRACT.KINDS.includes(k)))].sort()
    : [];
  const payload = {
    decisionId: nullable(r.decisionId, isDecisionId),
    outcome: nullable(r.outcome, (v) => LEDGER_OUTCOMES.includes(v)),
    kinds,
    elements: nullable(r.elementCount, isNonNegativeSafeInteger),
    bytes: nullable(r.requestBytes, isNonNegativeSafeInteger),
    servedModel: nullable(r.servedModel, isServedModel),
    calibration: nullable(r.calibrationStatus, (v) => CONTRACT.CALIBRATION_STATUSES.includes(v)),
    inputTokens: nullable(r.inputTokens, isNonNegativeSafeInteger),
    usageSource: nullable(r.usageSource, (v) => CONTRACT.USAGE_SOURCES.includes(v)),
    costUsd: nullable(r.costUsd, isNonNegativeFinite),
    costSource: nullable(r.costSource, (v) => CONTRACT.COST_SOURCES.includes(v)),
    upstreamMs: isNonNegativeFinite(r.upstreamLatencyMs) ? Math.round(r.upstreamLatencyMs) : null,
    gatewayMs: isNonNegativeFinite(r.gatewayLatencyMs) ? Math.round(r.gatewayLatencyMs) : null,
    upstreamStatus: nullable(r.upstreamStatus, isHttpStatus),
    hashKeyPresent: r.hashKeyPresent === true,
  };
  const ordered = {};
  for (const key of LOG_KEYS) ordered[key] = payload[key];
  return `[jev] decision ${JSON.stringify(ordered)}`;
}

module.exports = {
  recordDecision,
  recordAggregateOnly,
  todaySpendUsd,
  pruneJevLedger,
  dayUtcKey,
  formatDecisionLog,
  LEDGER_COLUMNS,
  LEDGER_OUTCOMES,
  AGGREGATE_ONLY_OUTCOMES,
  DECISION_RETENTION_MS,
  DAILY_RETENTION_DAYS,
};
