/**
 * Phase 67 / JEV-04 -- read-only operator report over the Jev ledger (D-24).
 *
 * The operator runs it on the Fly machine, where the image ships only
 * server.js and src/ (so this file lives under src/, not scripts/) and has no
 * sqlite3 CLI:
 *
 *   fly ssh console -C "node src/jev/report.js --days 1"
 *   fly ssh console -C "node src/jev/report.js --recent 5"
 *
 * usage: node src/jev/report.js [--days N] [--recent N] [--db PATH]
 *   --days N    per-day outcomes, usage and cost, plus served models, for the
 *               last N UTC days including today (1..365; default 7)
 *   --recent N  the N newest ledger rows, newest first, one line each, keyed
 *               by the decisionId that starts each "[jev] decision" log line
 *               (1..200)
 *   --db PATH   database file; else DB_PATH; else showcase/server/fsb-data.db
 *
 * Output is body-free: aggregate numbers, outcome names, served-model strings,
 * calibration statuses and, for --recent, only the allowlisted ledger columns.
 * The database is opened with {readonly: true, fileMustExist: true}. Any
 * failure prints the fixed line "jev-report: failed" (never an error message,
 * which could quote a row) and exits 1; a usage error exits 2.
 */

'use strict';

const path = require('path');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;
const MAX_RECENT = 200;
const FAILED_LINE = 'jev-report: failed';
const USAGE_LINE = 'usage: node src/jev/report.js [--days N (1..365)] [--recent N (1..200)] [--db PATH]';
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'fsb-data.db');

// Outcome display order: 'ok', then the gateway reasons in contract order.
const OUTCOME_ORDER = ['ok', ...require('./contract').CONTRACT.GATEWAY_FALLBACK_REASONS];

class UsageError extends Error {}

function floorToUtcDayMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function dayKey(ms) {
  return new Date(floorToUtcDayMs(ms)).toISOString().slice(0, 10);
}

/** First and last UTC day of the window and the window start in ms. */
function reportWindow(days, nowMs) {
  const startMs = floorToUtcDayMs(nowMs) - (days - 1) * ONE_DAY_MS;
  return { fromDay: dayKey(startMs), toDay: dayKey(nowMs), startMs };
}

function isCount(value, max) {
  return Number.isSafeInteger(value) && value >= 1 && value <= max;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Printable, space-free ASCII only, at most 128 characters; null stays null. */
function printable(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/[^\x21-\x7E]/g, '?').slice(0, 128);
}

function show(value) {
  return value === null || value === undefined ? 'null' : String(value);
}

function usd(value) {
  if (value === null || value === undefined) return 'null';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'null';
  return n.toFixed(8).replace(/\.?0+$/, '');
}

function outcomeRank(outcome) {
  const index = OUTCOME_ORDER.indexOf(outcome);
  return index === -1 ? OUTCOME_ORDER.length : index;
}

/**
 * Per-day aggregates and served models for the last `days` UTC days.
 *
 * @param {Database} db better-sqlite3 instance
 * @param {{days?: number, nowMs?: number}} [options]
 * @returns {{days: Array<object>, servedModels: Array<object>}} newest day
 *   first; served models by count, then name
 */
function buildReport(db, { days = DEFAULT_DAYS, nowMs = Date.now() } = {}) {
  if (!isCount(days, MAX_DAYS)) throw new TypeError('jev report: invalid days');
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) throw new TypeError('jev report: invalid nowMs');
  const { fromDay, toDay, startMs } = reportWindow(days, nowMs);

  const dailyRows = db.prepare(`
    SELECT day_utc, outcome, requests, input_tokens_known, input_tokens_unavailable,
      cost_provider_usd, cost_estimate_usd, cost_unavailable, cap_accrued_usd
    FROM jev_daily
    WHERE day_utc >= ? AND day_utc <= ?
    ORDER BY day_utc DESC, outcome ASC
  `).all(fromDay, toDay);

  const byDay = new Map();
  for (const row of dailyRows) {
    let day = byDay.get(row.day_utc);
    if (!day) {
      day = {
        dayUtc: printable(row.day_utc),
        requests: 0,
        outcomes: [],
        inputTokensKnown: 0,
        inputTokensUnavailable: 0,
        costProviderUsd: 0,
        costEstimateUsd: 0,
        costUnavailable: 0,
        capAccruedUsd: 0,
      };
      byDay.set(row.day_utc, day);
    }
    day.requests += num(row.requests);
    day.outcomes.push([printable(row.outcome), num(row.requests)]);
    day.inputTokensKnown += num(row.input_tokens_known);
    day.inputTokensUnavailable += num(row.input_tokens_unavailable);
    day.costProviderUsd += num(row.cost_provider_usd);
    day.costEstimateUsd += num(row.cost_estimate_usd);
    day.costUnavailable += num(row.cost_unavailable);
    day.capAccruedUsd += num(row.cap_accrued_usd);
  }

  const dayList = [...byDay.values()].map((day) => {
    const byOutcome = {};
    day.outcomes
      .sort((a, b) => outcomeRank(a[0]) - outcomeRank(b[0]) || String(a[0]).localeCompare(String(b[0])))
      .forEach(([outcome, n]) => { byOutcome[outcome] = (byOutcome[outcome] || 0) + n; });
    return {
      dayUtc: day.dayUtc,
      requests: day.requests,
      byOutcome,
      inputTokensKnown: day.inputTokensKnown,
      inputTokensUnavailable: day.inputTokensUnavailable,
      costProviderUsd: day.costProviderUsd,
      costEstimateUsd: day.costEstimateUsd,
      costUnavailable: day.costUnavailable,
      capAccruedUsd: day.capAccruedUsd,
    };
  });

  // Ledger rows are kept for 7 days, so served models cover at most that span.
  const modelRows = db.prepare(`
    SELECT served_model, calibration_status, COUNT(*) AS n
    FROM jev_decisions
    WHERE created_at >= ? AND created_at < ?
    GROUP BY served_model, calibration_status
  `).all(startMs, floorToUtcDayMs(nowMs) + ONE_DAY_MS);

  const byModel = new Map();
  for (const row of modelRows) {
    const servedModel = printable(row.served_model);
    let model = byModel.get(servedModel);
    if (!model) {
      model = { servedModel, n: 0, calibration: {} };
      byModel.set(servedModel, model);
    }
    const status = row.calibration_status === null ? 'none' : printable(row.calibration_status);
    model.n += num(row.n);
    model.calibration[status] = (model.calibration[status] || 0) + num(row.n);
  }
  const servedModels = [...byModel.values()].sort((a, b) => b.n - a.n
    || String(a.servedModel).localeCompare(String(b.servedModel)));
  for (const model of servedModels) {
    const sorted = {};
    for (const status of Object.keys(model.calibration).sort()) sorted[status] = model.calibration[status];
    model.calibration = sorted;
  }

  return { days: dayList, servedModels };
}

/**
 * The `limit` newest ledger rows, newest first, with only the allowlisted
 * body-free columns.
 *
 * @param {Database} db better-sqlite3 instance
 * @param {{limit: number}} options limit in 1..200
 */
function buildRecent(db, { limit } = {}) {
  if (!isCount(limit, MAX_RECENT)) throw new TypeError('jev report: invalid limit');
  return db.prepare(`
    SELECT decision_id, created_at, outcome, served_model, instrument_version,
      calibration_status, kinds, element_count, request_bytes, input_tokens,
      usage_source, cost_usd, cost_source, upstream_latency_ms, gateway_latency_ms,
      upstream_status, hash_key_present
    FROM jev_decisions
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    decisionId: printable(row.decision_id),
    createdAt: Number.isFinite(Number(row.created_at)) ? new Date(Number(row.created_at)).toISOString() : null,
    outcome: printable(row.outcome),
    servedModel: printable(row.served_model),
    instrumentVersion: printable(row.instrument_version),
    calibrationStatus: printable(row.calibration_status),
    kinds: printable(row.kinds),
    elementCount: row.element_count === null ? null : num(row.element_count),
    requestBytes: row.request_bytes === null ? null : num(row.request_bytes),
    inputTokens: row.input_tokens === null ? null : num(row.input_tokens),
    usageSource: printable(row.usage_source),
    costUsd: row.cost_usd === null ? null : num(row.cost_usd),
    costSource: printable(row.cost_source),
    upstreamLatencyMs: row.upstream_latency_ms === null ? null : num(row.upstream_latency_ms),
    gatewayLatencyMs: row.gateway_latency_ms === null ? null : num(row.gateway_latency_ms),
    upstreamStatus: row.upstream_status === null ? null : num(row.upstream_status),
    hashKeyPresent: num(row.hash_key_present) === 1 ? 1 : 0,
  }));
}

/** Open a database file read-only; it must already exist. */
function openReadOnlyDb(dbPath) {
  const Database = require('better-sqlite3');
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

function parseCount(raw, max) {
  if (typeof raw !== 'string' || !/^[0-9]{1,4}$/.test(raw)) throw new UsageError();
  const value = Number(raw);
  if (!isCount(value, max)) throw new UsageError();
  return value;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const seen = new Set();
  const parsed = { days: null, recent: null, dbPath: null };
  for (let i = 0; i < args.length; i += 1) {
    const token = String(args[i]);
    const eq = token.indexOf('=');
    const flag = token.startsWith('--') && eq !== -1 ? token.slice(0, eq) : token;
    if (!['--days', '--recent', '--db'].includes(flag) || seen.has(flag)) throw new UsageError();
    seen.add(flag);
    let value;
    if (flag !== token) {
      value = token.slice(eq + 1);
    } else {
      if (i + 1 >= args.length) throw new UsageError();
      i += 1;
      value = String(args[i]);
    }
    if (flag === '--days') parsed.days = parseCount(value, MAX_DAYS);
    else if (flag === '--recent') parsed.recent = parseCount(value, MAX_RECENT);
    else if (value === '') throw new UsageError();
    else parsed.dbPath = value;
  }
  if (parsed.days === null && parsed.recent === null) parsed.days = DEFAULT_DAYS;
  return parsed;
}

function formatDayLine(day) {
  const outcomes = Object.entries(day.byOutcome).map(([outcome, n]) => `${outcome}:${n}`).join(',');
  return `day ${day.dayUtc} requests=${day.requests} outcomes=${outcomes || '-'}`
    + ` tokens_known=${day.inputTokensKnown} tokens_unavailable=${day.inputTokensUnavailable}`
    + ` cost_provider_usd=${usd(day.costProviderUsd)} cost_estimate_usd=${usd(day.costEstimateUsd)}`
    + ` cost_unavailable=${day.costUnavailable} cap_accrued_usd=${usd(day.capAccruedUsd)}`;
}

function formatModelLine(model) {
  const calibration = Object.entries(model.calibration).map(([status, n]) => `${status}:${n}`).join(',');
  return `model ${show(model.servedModel)} n=${model.n} calibration=${calibration}`;
}

function formatRecentLine(row) {
  return `decision ${show(row.decisionId)} created=${show(row.createdAt)} outcome=${show(row.outcome)}`
    + ` served_model=${show(row.servedModel)} instrument_version=${show(row.instrumentVersion)}`
    + ` calibration=${show(row.calibrationStatus)} kinds=${show(row.kinds)}`
    + ` elements=${show(row.elementCount)} bytes=${show(row.requestBytes)}`
    + ` input_tokens=${show(row.inputTokens)} usage_source=${show(row.usageSource)}`
    + ` cost_usd=${usd(row.costUsd)} cost_source=${show(row.costSource)}`
    + ` upstream_ms=${show(row.upstreamLatencyMs)} gateway_ms=${show(row.gatewayLatencyMs)}`
    + ` upstream_status=${show(row.upstreamStatus)} hash_key_present=${row.hashKeyPresent}`;
}

function defaultOut(line) {
  process.stdout.write(`${line}\n`);
}

function defaultErr(line) {
  process.stderr.write(`${line}\n`);
}

/**
 * CLI entry. Returns the exit code: 0 ok, 1 failure ("jev-report: failed"),
 * 2 usage error. Lines are collected first, so a failure part-way prints no
 * partial report.
 *
 * @param {string[]} argv
 * @param {{db?: Database, out?: (line: string) => void, err?: (line: string) => void,
 *   now?: () => number}} [deps]
 */
function runCli(argv, deps = {}) {
  const out = typeof deps.out === 'function' ? deps.out : defaultOut;
  const err = typeof deps.err === 'function' ? deps.err : defaultErr;
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch {
    err(USAGE_LINE);
    return 2;
  }

  let db = deps.db || null;
  let opened = false;
  try {
    if (!db) {
      db = openReadOnlyDb(parsed.dbPath || process.env.DB_PATH || DEFAULT_DB_PATH);
      opened = true;
    }
    const nowMs = typeof deps.now === 'function' ? deps.now() : Date.now();
    const lines = [];
    if (parsed.days !== null) {
      const { fromDay, toDay } = reportWindow(parsed.days, nowMs);
      const report = buildReport(db, { days: parsed.days, nowMs });
      lines.push(`jev-report days=${parsed.days} from=${fromDay} to=${toDay} day_rows=${report.days.length} models=${report.servedModels.length}`);
      for (const day of report.days) lines.push(formatDayLine(day));
      for (const model of report.servedModels) lines.push(formatModelLine(model));
    }
    if (parsed.recent !== null) {
      const rows = buildRecent(db, { limit: parsed.recent });
      lines.push(`jev-report recent limit=${parsed.recent} rows=${rows.length}`);
      for (const row of rows) lines.push(formatRecentLine(row));
    }
    for (const line of lines) out(line);
    return 0;
  } catch {
    err(FAILED_LINE);
    return 1;
  } finally {
    if (opened && db) {
      try { db.close(); } catch { /* read-only handle; nothing to flush */ }
    }
  }
}

module.exports = { runCli, buildReport, buildRecent, openReadOnlyDb };

if (require.main === module) process.exitCode = runCli(process.argv.slice(2));
