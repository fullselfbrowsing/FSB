/**
 * Phase 67 / JEV-04, JEV-07 -- the body-free Jev ledger and its daily aggregate.
 *
 * Covers showcase/server/src/db/schema.js (jev_decisions + jev_daily) and
 * showcase/server/src/jev/ledger.js (D-06, D-07, D-08, D-23, D-24, Pitfalls 9
 * and 13) on in-memory SQLite:
 *   - the two tables hold exactly the allowlisted, body-free columns (no goal,
 *     URL, origin, title, text, label, element id, hash key or IP) and
 *     initializeDatabase stays idempotent;
 *   - recordDecision writes the ledger row and the daily UPSERT (with its
 *     spend-cap accrual) in one transaction, keeps usage and cost with their
 *     sources (null, never 0) and stores the served model verbatim;
 *   - recordDecision accepts only LEDGER_OUTCOMES and CONTRACT.KINDS, and a
 *     rejected or failed write leaves both tables untouched;
 *   - recordAggregateOnly touches one jev_daily row per (day, outcome) and never
 *     a ledger row, so refused traffic stays bounded;
 *   - todaySpendUsd, pruneJevLedger, dayUtcKey and the allowlisted
 *     formatDecisionLog line;
 *   - the hourly housekeeper prunes both tables in its own guarded step, with a
 *     fixed error line, and leaves the telemetry tick untouched;
 *   - the read-only operator report (src/jev/report.js): per-day outcomes,
 *     served models, usage and cost, the N newest decisions keyed by
 *     decisionId, fixed usage and failure lines, and a read-only file handle.
 *
 * Run: node tests/jev-gateway-ledger.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'showcase', 'server');
const SERVER_NM = path.join(SERVER_DIR, 'node_modules');
const JEV_DIR = path.join(SERVER_DIR, 'src', 'jev');

const Database = require(require.resolve('better-sqlite3', { paths: [SERVER_NM] }));
const { initializeDatabase } = require(path.join(SERVER_DIR, 'src', 'db', 'schema'));
const { CONTRACT } = require(path.join(JEV_DIR, 'contract.js'));

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label}${detail === undefined ? '' : ` -- ${detail}`}`); }
}
function deepEqual(a, b) {
  try { assert.deepStrictEqual(a, b); return true; } catch (_e) { return false; }
}
function show(value) {
  try { return JSON.stringify(value); } catch (_e) { return String(value); }
}
function approx(a, b) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12;
}

function loadModule(file) {
  try {
    return require(path.join(JEV_DIR, file));
  } catch (error) {
    check(`${file} loads`, false, error && error.code ? error.code : 'require failed');
    return null;
  }
}

const NOW = Date.UTC(2026, 4, 14, 12, 0, 0); // 2026-05-14 12:00 UTC
const ONE_DAY_MS = 86400000;
const TODAY = '2026-05-14';

const EXPECTED_DECISION_COLUMNS = [
  'id', 'decision_id', 'created_at', 'day_utc', 'outcome', 'served_model',
  'instrument_version', 'calibration_status', 'kinds', 'element_count',
  'request_bytes', 'input_tokens', 'usage_source', 'cost_usd', 'cost_source',
  'upstream_latency_ms', 'gateway_latency_ms', 'upstream_status', 'hash_key_present',
];
const EXPECTED_DAILY_COLUMNS = [
  'day_utc', 'outcome', 'requests', 'input_tokens_known', 'input_tokens_unavailable',
  'cost_provider_usd', 'cost_estimate_usd', 'cost_unavailable', 'cap_accrued_usd',
];
const UPSTREAM_STAGE = [
  'timeout', 'rate_limited', 'upstream_overloaded', 'auth_error', 'upstream_billing',
  'unavailable_model', 'upstream_rejected', 'upstream_error', 'invalid_response',
];
const EXPECTED_AGGREGATE_ONLY = [
  'disabled', 'not_configured', 'invalid_request', 'payload_too_large',
  'sensitive_goal', 'busy', 'spend_cap_reached', 'server_error',
];

// Strings planted in row keys that recordDecision must never persist.
const MARKERS = {
  goal: 'MARKER-GOAL-5be1c0',
  url: 'MARKER-URL-0a9e44',
  origin: 'MARKER-ORIGIN-77d2f1',
  title: 'MARKER-TITLE-3c80aa',
  text: 'MARKER-TEXT-e61b29',
  label: 'MARKER-LABEL-d4f803',
  elementId: 'MARKER-ELEMENT-ID-92c7be',
  hashKey: 'a'.repeat(64),
  ip: '203.0.113.77',
};

function freshDb() {
  const db = new Database(':memory:');
  const originalLog = console.log;
  console.log = () => {};
  try {
    initializeDatabase(db);
  } finally {
    console.log = originalLog;
  }
  return db;
}

function baseRow(over = {}) {
  return Object.assign({
    decisionId: 'd-0001',
    createdAtMs: NOW,
    outcome: 'ok',
    servedModel: 'typesafe/jev-1.13-20260901',
    instrumentVersion: 'fsb-jev-instrument-1',
    calibrationStatus: 'calibrated',
    kinds: ['target', 'operation'],
    elementCount: 12,
    requestBytes: 3456,
    inputTokens: 1234,
    usageSource: 'provider',
    costUsd: 0.000123,
    costSource: 'provider',
    upstreamLatencyMs: 420,
    gatewayLatencyMs: 455,
    upstreamStatus: 200,
    hashKeyPresent: true,
  }, over);
}

function tableColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}
function decisionCount(db) {
  return db.prepare('SELECT COUNT(*) AS n FROM jev_decisions').get().n;
}
function dailySnapshot(db) {
  return db.prepare('SELECT * FROM jev_daily ORDER BY day_utc, outcome').all();
}
function dailyRow(db, dayUtc, outcome) {
  return db.prepare('SELECT * FROM jev_daily WHERE day_utc = ? AND outcome = ?').get(dayUtc, outcome);
}
function allCells(db, table) {
  return db.prepare(`SELECT * FROM ${table}`).all()
    .map((row) => Object.values(row).map((v) => String(v)).join('|'))
    .join('\n');
}
function throwsTypeError(fn) {
  try {
    fn();
    return false;
  } catch (error) {
    return error instanceof TypeError;
  }
}

// ---------------------------------------------------------------------------

function schemaSection(ledger) {
  console.log('\n--- Schema: jev_decisions and jev_daily ---');
  const db = freshDb();
  const decisionCols = tableColumns(db, 'jev_decisions');
  const dailyCols = tableColumns(db, 'jev_daily');
  check('jev_decisions has exactly the interface columns', deepEqual(decisionCols, EXPECTED_DECISION_COLUMNS), show(decisionCols));
  check('jev_daily has exactly the interface columns', deepEqual(dailyCols, EXPECTED_DAILY_COLUMNS), show(dailyCols));
  if (ledger) {
    check('LEDGER_COLUMNS equals the jev_decisions columns', deepEqual([...ledger.LEDGER_COLUMNS], decisionCols), show(ledger.LEDGER_COLUMNS));
    check('LEDGER_COLUMNS is frozen', Object.isFrozen(ledger.LEDGER_COLUMNS));
  }

  const forbiddenTokens = ['goal', 'url', 'origin', 'title', 'text', 'label', 'ip'];
  for (const [table, cols] of [['jev_decisions', decisionCols], ['jev_daily', dailyCols]]) {
    const offenders = cols.filter((name) => {
      const tokens = name.split('_');
      if (tokens.some((t) => forbiddenTokens.includes(t))) return true;
      if (forbiddenTokens.slice(0, 6).some((word) => name.includes(word))) return true;
      if (name.includes('element_id')) return true;
      if (name.includes('hash_key') && name !== 'hash_key_present') return true;
      return false;
    });
    check(`${table}: no column can hold a goal, URL, origin, title, text, label, element id, hash key or IP`, offenders.length === 0, show(offenders));
  }
  check('hash_key_present is the only hash column', decisionCols.filter((c) => c.includes('hash')).join(',') === 'hash_key_present');

  const notNull = Object.fromEntries(db.prepare('PRAGMA table_info(jev_decisions)').all().map((c) => [c.name, c.notnull === 1]));
  for (const col of ['input_tokens', 'cost_usd', 'served_model', 'instrument_version', 'calibration_status', 'upstream_latency_ms', 'upstream_status']) {
    check(`jev_decisions.${col} is nullable`, notNull[col] === false);
  }
  for (const col of ['decision_id', 'created_at', 'day_utc', 'outcome', 'kinds', 'element_count', 'request_bytes', 'usage_source', 'cost_source', 'gateway_latency_ms', 'hash_key_present']) {
    check(`jev_decisions.${col} is NOT NULL`, notNull[col] === true);
  }

  const index = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index' AND name = 'idx_jev_decisions_created_at'").get();
  check('idx_jev_decisions_created_at exists on jev_decisions', !!index && index.tbl_name === 'jev_decisions', show(index));
  const indexCols = db.prepare('PRAGMA index_info(idx_jev_decisions_created_at)').all().map((c) => c.name);
  check('idx_jev_decisions_created_at covers created_at', deepEqual(indexCols, ['created_at']), show(indexCols));

  const uniqueDaily = db.prepare('PRAGMA index_list(jev_daily)').all().filter((i) => i.unique === 1)
    .map((i) => db.prepare(`PRAGMA index_info(${JSON.stringify(i.name)})`).all().map((c) => c.name));
  check('jev_daily is UNIQUE(day_utc, outcome)', uniqueDaily.some((cols) => deepEqual(cols, ['day_utc', 'outcome'])), show(uniqueDaily));

  const masterBefore = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'jev%' AND name NOT LIKE 'idx_jev%' ORDER BY type, name").all();
  let secondThrew = false;
  const originalLog = console.log;
  console.log = () => {};
  try {
    initializeDatabase(db);
  } catch (_e) {
    secondThrew = true;
  } finally {
    console.log = originalLog;
  }
  check('initializeDatabase is idempotent (second call does not throw)', !secondThrew);
  const masterAfter = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'jev%' AND name NOT LIKE 'idx_jev%' ORDER BY type, name").all();
  check('existing tables and indexes are unchanged by a second initializeDatabase', deepEqual(masterBefore, masterAfter));
  const existing = new Set(masterBefore.filter((r) => r.type === 'table').map((r) => r.name));
  for (const table of ['hash_keys', 'agents', 'agent_runs', 'pairing_tokens', 'telemetry_events', 'telemetry_rollups_daily', 'telemetry_global_aggregates', 'telemetry_daily_salt', 'github_cache']) {
    check(`existing table ${table} still exists`, existing.has(table));
  }
  check('no existing table definition mentions jev', masterBefore.every((r) => !String(r.sql || '').toLowerCase().includes('jev')));
  check('the jev tables survive a second initializeDatabase', deepEqual(tableColumns(db, 'jev_decisions'), EXPECTED_DECISION_COLUMNS));
}

function recordDecisionSection(ledger) {
  console.log('\n--- recordDecision: one transactional, body-free write ---');
  const db = freshDb();

  // ok row with provider tokens and provider cost.
  ledger.recordDecision(db, baseRow({ decisionId: 'd-provider' }), { capUsd: 0.000123 });
  const provider = db.prepare('SELECT * FROM jev_decisions WHERE decision_id = ?').get('d-provider');
  check('provider row stored', !!provider);
  check('provider row: created_at and day_utc', provider && provider.created_at === NOW && provider.day_utc === TODAY, show(provider));
  check('provider row: outcome ok', provider && provider.outcome === 'ok');
  check('provider row: served model stored verbatim', provider && provider.served_model === 'typesafe/jev-1.13-20260901');
  check('provider row: instrument version and calibration status', provider && provider.instrument_version === 'fsb-jev-instrument-1' && provider.calibration_status === 'calibrated');
  check('provider row: kinds sorted and joined with ","', provider && provider.kinds === 'operation,target', provider && provider.kinds);
  check('provider row: element count and request bytes', provider && provider.element_count === 12 && provider.request_bytes === 3456);
  check('provider row: provider tokens kept with their source', provider && provider.input_tokens === 1234 && provider.usage_source === 'provider');
  check('provider row: provider cost kept with its source', provider && approx(provider.cost_usd, 0.000123) && provider.cost_source === 'provider');
  check('provider row: latencies and upstream status', provider && provider.upstream_latency_ms === 420 && provider.gateway_latency_ms === 455 && provider.upstream_status === 200);
  check('provider row: hash_key_present stored as 1', provider && provider.hash_key_present === 1);
  const okDaily = dailyRow(db, TODAY, 'ok');
  check('daily (today, ok): requests 1', okDaily && okDaily.requests === 1, show(okDaily));
  check('daily (today, ok): known input tokens summed', okDaily && okDaily.input_tokens_known === 1234 && okDaily.input_tokens_unavailable === 0);
  check('daily (today, ok): provider cost summed', okDaily && approx(okDaily.cost_provider_usd, 0.000123) && okDaily.cost_estimate_usd === 0 && okDaily.cost_unavailable === 0);
  check('daily (today, ok): cap accrual recorded', okDaily && approx(okDaily.cap_accrued_usd, 0.000123));

  // estimate row.
  ledger.recordDecision(db, baseRow({
    decisionId: 'd-estimate', costUsd: 0.0000617, costSource: 'estimate', hashKeyPresent: false,
    servedModel: 'jev-1.13.0', kinds: ['completion'],
  }), { capUsd: 0.0000617 });
  const estimate = db.prepare('SELECT * FROM jev_decisions WHERE decision_id = ?').get('d-estimate');
  check('estimate row: cost_source estimate', estimate && estimate.cost_source === 'estimate' && approx(estimate.cost_usd, 0.0000617), show(estimate));
  check('estimate row: hash_key_present stored as 0', estimate && estimate.hash_key_present === 0);
  check('estimate row: single kind stored as is', estimate && estimate.kinds === 'completion');
  const okDaily2 = dailyRow(db, TODAY, 'ok');
  check('two ok rows on one day: requests 2', okDaily2 && okDaily2.requests === 2, show(okDaily2));
  check('daily (today, ok): estimate cost summed separately', okDaily2 && approx(okDaily2.cost_estimate_usd, 0.0000617) && approx(okDaily2.cost_provider_usd, 0.000123));
  check('daily (today, ok): known tokens summed across rows', okDaily2 && okDaily2.input_tokens_known === 2468);
  check('daily (today, ok): cap accrual summed', okDaily2 && approx(okDaily2.cap_accrued_usd, 0.000123 + 0.0000617));

  // unavailable row: null tokens and null cost, never 0.
  ledger.recordDecision(db, baseRow({
    decisionId: 'd-unavailable', outcome: 'timeout', servedModel: null, calibrationStatus: null,
    inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable',
    upstreamLatencyMs: null, upstreamStatus: null,
  }), { capUsd: 0.0001 });
  const unavailable = db.prepare('SELECT * FROM jev_decisions WHERE decision_id = ?').get('d-unavailable');
  check('unavailable row: input_tokens is NULL (never 0)', unavailable && unavailable.input_tokens === null, show(unavailable));
  check('unavailable row: cost_usd is NULL (never 0)', unavailable && unavailable.cost_usd === null);
  check('unavailable row: sources are unavailable', unavailable && unavailable.usage_source === 'unavailable' && unavailable.cost_source === 'unavailable');
  check('unavailable row: served model, calibration, upstream latency and status are NULL', unavailable
    && unavailable.served_model === null && unavailable.calibration_status === null
    && unavailable.upstream_latency_ms === null && unavailable.upstream_status === null);
  const timeoutDaily = dailyRow(db, TODAY, 'timeout');
  check('daily (today, timeout): input_tokens_unavailable and cost_unavailable incremented', timeoutDaily
    && timeoutDaily.requests === 1 && timeoutDaily.input_tokens_unavailable === 1 && timeoutDaily.cost_unavailable === 1
    && timeoutDaily.input_tokens_known === 0 && timeoutDaily.cost_provider_usd === 0 && timeoutDaily.cost_estimate_usd === 0, show(timeoutDaily));
  check('daily (today, timeout): the conservative cap accrual is kept apart from cost', timeoutDaily && approx(timeoutDaily.cap_accrued_usd, 0.0001));

  // Default capUsd is 0.
  ledger.recordDecision(db, baseRow({ decisionId: 'd-nocap', outcome: 'upstream_error', upstreamStatus: 500, inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable' }));
  const noCap = dailyRow(db, TODAY, 'upstream_error');
  check('capUsd defaults to 0', noCap && noCap.requests === 1 && noCap.cap_accrued_usd === 0, show(noCap));

  // Unknown row keys are ignored and never persisted.
  ledger.recordDecision(db, baseRow(Object.assign({ decisionId: 'd-markers' }, MARKERS)), { capUsd: 0 });
  const cells = `${allCells(db, 'jev_decisions')}\n${allCells(db, 'jev_daily')}`;
  const leaked = Object.values(MARKERS).filter((m) => cells.includes(m));
  check('unknown row keys (goal, url, origin, title, text, label, element id, hash key, IP) are never persisted', leaked.length === 0, show(leaked));

  // createdAtMs drives the UTC day.
  ledger.recordDecision(db, baseRow({ decisionId: 'd-late', createdAtMs: Date.UTC(2026, 4, 14, 23, 59, 59, 999) }));
  ledger.recordDecision(db, baseRow({ decisionId: 'd-next', createdAtMs: Date.UTC(2026, 4, 15, 0, 0, 0, 0) }));
  const late = db.prepare('SELECT day_utc FROM jev_decisions WHERE decision_id = ?').get('d-late');
  const next = db.prepare('SELECT day_utc FROM jev_decisions WHERE decision_id = ?').get('d-next');
  check('23:59:59.999 UTC stays on its day', late && late.day_utc === '2026-05-14', show(late));
  check('00:00 UTC starts the next day', next && next.day_utc === '2026-05-15', show(next));
  check('the next day gets its own (day, ok) aggregate row', dailyRow(db, '2026-05-15', 'ok') && dailyRow(db, '2026-05-15', 'ok').requests === 1);

  console.log('\n--- recordDecision: every LEDGER_OUTCOMES member ---');
  const perOutcome = freshDb();
  ledger.LEDGER_OUTCOMES.forEach((outcome, i) => {
    ledger.recordDecision(perOutcome, baseRow({
      decisionId: `d-outcome-${i}`, outcome,
      inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable',
    }), { capUsd: 0.00001 });
  });
  const rows = dailySnapshot(perOutcome);
  check('one jev_daily row per (day, outcome)', rows.length === ledger.LEDGER_OUTCOMES.length, `${rows.length} rows`);
  check('each outcome row has requests 1', rows.every((r) => r.day_utc === TODAY && r.requests === 1), show(rows.map((r) => [r.outcome, r.requests])));
  check('the aggregate rows cover exactly LEDGER_OUTCOMES', deepEqual(rows.map((r) => r.outcome).sort(), [...ledger.LEDGER_OUTCOMES].sort()));
  check('one ledger row per call', decisionCount(perOutcome) === ledger.LEDGER_OUTCOMES.length);
  ledger.recordDecision(perOutcome, baseRow({ decisionId: 'd-outcome-again', outcome: 'rate_limited', inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable' }));
  check('a second row on the same day and outcome increments requests to 2', dailyRow(perOutcome, TODAY, 'rate_limited').requests === 2);
}

function rejectionSection(ledger) {
  console.log('\n--- recordDecision: rejects and writes nothing ---');
  const db = freshDb();
  ledger.recordDecision(db, baseRow({ decisionId: 'd-seed' }), { capUsd: 0.00005 });
  const countBefore = decisionCount(db);
  const dailyBefore = dailySnapshot(db);

  const cases = [
    ['outcome network_error (client-only)', { outcome: 'network_error' }],
    ['outcome bogus', { outcome: 'bogus' }],
    ['outcome busy (aggregate-only)', { outcome: 'busy' }],
    ['outcome invalid_request (aggregate-only)', { outcome: 'invalid_request' }],
    ['outcome spend_cap_reached (aggregate-only)', { outcome: 'spend_cap_reached' }],
    ['outcome disabled (aggregate-only)', { outcome: 'disabled' }],
    ['outcome missing', { outcome: undefined }],
    ['kinds with a non-contract member', { kinds: ['operation', 'MARKER-KINDS'] }],
    ['kinds empty', { kinds: [] }],
    ['kinds a string', { kinds: 'operation' }],
    ['kinds duplicated', { kinds: ['operation', 'operation'] }],
    ['elementCount -1', { elementCount: -1 }],
    ['elementCount 1.5', { elementCount: 1.5 }],
    ['elementCount a string', { elementCount: '12' }],
    ['requestBytes -1', { requestBytes: -1 }],
    ['requestBytes NaN', { requestBytes: NaN }],
    ['decisionId empty', { decisionId: '' }],
    ['decisionId 65 characters', { decisionId: 'd'.repeat(65) }],
    ['decisionId a number', { decisionId: 7 }],
    ['usageSource outside CONTRACT', { usageSource: 'estimate' }],
    ['costSource outside CONTRACT', { costSource: 'guess' }],
    ['usage provider with null tokens', { inputTokens: null }],
    ['usage unavailable with tokens', { usageSource: 'unavailable' }],
    ['usage unavailable with 0 tokens (null, never 0)', { usageSource: 'unavailable', inputTokens: 0 }],
    ['cost unavailable with a number (null, never 0)', { costSource: 'unavailable', costUsd: 0 }],
    ['cost provider with null', { costUsd: null }],
    ['cost negative', { costUsd: -0.1 }],
    ['calibration status outside CONTRACT', { calibrationStatus: 'MARKER-CAL' }],
    ['upstream status out of range', { upstreamStatus: 99 }],
    ['gateway latency missing', { gatewayLatencyMs: undefined }],
    ['hashKeyPresent not a boolean', { hashKeyPresent: 'yes' }],
    ['createdAtMs not a number', { createdAtMs: 'now' }],
  ];
  for (const [label, over] of cases) {
    const row = baseRow(Object.assign({ decisionId: 'd-reject' }, over));
    check(`TypeError: ${label}`, throwsTypeError(() => ledger.recordDecision(db, row, { capUsd: 1 })));
  }
  check('TypeError: row is not an object', throwsTypeError(() => ledger.recordDecision(db, null)));
  check('TypeError: capUsd negative', throwsTypeError(() => ledger.recordDecision(db, baseRow({ decisionId: 'd-reject' }), { capUsd: -1 })));
  check('TypeError: capUsd NaN', throwsTypeError(() => ledger.recordDecision(db, baseRow({ decisionId: 'd-reject' }), { capUsd: NaN })));

  check('rejected rows leave jev_decisions unchanged', decisionCount(db) === countBefore, `${decisionCount(db)} vs ${countBefore}`);
  check('rejected rows leave jev_daily unchanged', deepEqual(dailySnapshot(db), dailyBefore), show(dailySnapshot(db)));
  check('the planted kinds marker reached no cell', !`${allCells(db, 'jev_decisions')}${allCells(db, 'jev_daily')}`.includes('MARKER'));

  let messageLeak = '';
  try {
    ledger.recordDecision(db, baseRow({ decisionId: 'd-reject', kinds: ['MARKER-KINDS-MSG'] }));
  } catch (error) {
    messageLeak = String(error && error.message);
  }
  check('a TypeError message never quotes the rejected value', messageLeak !== '' && !messageLeak.includes('MARKER'), messageLeak);

  console.log('\n--- recordDecision: a failed UPSERT rolls the ledger row back ---');
  const txDb = freshDb();
  txDb.exec("CREATE TRIGGER jev_daily_fail BEFORE INSERT ON jev_daily BEGIN SELECT RAISE(ABORT, 'synthetic daily failure'); END;");
  let threw = false;
  try {
    ledger.recordDecision(txDb, baseRow({ decisionId: 'd-rollback' }), { capUsd: 0.5 });
  } catch (_e) {
    threw = true;
  }
  check('recordDecision throws when the daily UPSERT fails', threw);
  check('the ledger INSERT was rolled back (one transaction)', decisionCount(txDb) === 0, `${decisionCount(txDb)} rows`);
  check('jev_daily stays empty', dailySnapshot(txDb).length === 0);
}

function outcomeListsSection(ledger) {
  console.log('\n--- LEDGER_OUTCOMES and AGGREGATE_ONLY_OUTCOMES ---');
  check('LEDGER_OUTCOMES is frozen', Object.isFrozen(ledger.LEDGER_OUTCOMES));
  check('AGGREGATE_ONLY_OUTCOMES is frozen', Object.isFrozen(ledger.AGGREGATE_ONLY_OUTCOMES));
  check('LEDGER_OUTCOMES is ok, the upstream-stage reasons and server_error',
    deepEqual([...ledger.LEDGER_OUTCOMES], ['ok', ...UPSTREAM_STAGE, 'server_error']), show(ledger.LEDGER_OUTCOMES));
  check('AGGREGATE_ONLY_OUTCOMES is the pre-upstream reasons and server_error',
    deepEqual([...ledger.AGGREGATE_ONLY_OUTCOMES], EXPECTED_AGGREGATE_ONLY), show(ledger.AGGREGATE_ONLY_OUTCOMES));
  const intersection = ledger.LEDGER_OUTCOMES.filter((o) => ledger.AGGREGATE_ONLY_OUTCOMES.includes(o));
  check('the two lists share exactly server_error', deepEqual(intersection, ['server_error']), show(intersection));
  const union = [...new Set([...ledger.LEDGER_OUTCOMES, ...ledger.AGGREGATE_ONLY_OUTCOMES])].sort();
  check('their union is ok plus GATEWAY_FALLBACK_REASONS', deepEqual(union, ['ok', ...CONTRACT.GATEWAY_FALLBACK_REASONS].sort()), show(union));
  check('neither list holds a client-only reason', CONTRACT.CLIENT_ONLY_FALLBACK_REASONS.every((r) => !union.includes(r)));
  check('at most 18 outcomes per UTC day', union.length === 18, `${union.length}`);
}

function aggregateOnlySection(ledger) {
  console.log('\n--- recordAggregateOnly: bounded counters, no ledger rows ---');
  const db = freshDb();
  for (const outcome of ledger.AGGREGATE_ONLY_OUTCOMES) {
    ledger.recordAggregateOnly(db, { dayUtc: TODAY, outcome });
  }
  check('no ledger row for any aggregate-only outcome', decisionCount(db) === 0);
  const rows = dailySnapshot(db);
  check('one jev_daily row per aggregate-only outcome', rows.length === ledger.AGGREGATE_ONLY_OUTCOMES.length, `${rows.length}`);
  check('each row counts requests only', rows.every((r) => r.requests === 1 && r.input_tokens_known === 0
    && r.input_tokens_unavailable === 0 && r.cost_provider_usd === 0 && r.cost_estimate_usd === 0
    && r.cost_unavailable === 0 && r.cap_accrued_usd === 0), show(rows));

  const flood = freshDb();
  for (let i = 0; i < 1000; i += 1) {
    const outcome = ledger.AGGREGATE_ONLY_OUTCOMES[i % ledger.AGGREGATE_ONLY_OUTCOMES.length];
    ledger.recordAggregateOnly(flood, { dayUtc: TODAY, outcome });
  }
  const floodRows = dailySnapshot(flood).filter((r) => r.day_utc === TODAY);
  check('1,000 refused requests leave jev_decisions empty', decisionCount(flood) === 0);
  check('1,000 refused requests leave at most 8 jev_daily rows for the day', floodRows.length <= 8 && floodRows.length === ledger.AGGREGATE_ONLY_OUTCOMES.length, `${floodRows.length}`);
  check('the counters add up to 1,000', floodRows.reduce((sum, r) => sum + r.requests, 0) === 1000);

  check('TypeError: aggregate-only rejects ok', throwsTypeError(() => ledger.recordAggregateOnly(db, { dayUtc: TODAY, outcome: 'ok' })));
  check('TypeError: aggregate-only rejects an upstream-stage outcome', throwsTypeError(() => ledger.recordAggregateOnly(db, { dayUtc: TODAY, outcome: 'timeout' })));
  check('TypeError: aggregate-only rejects a client-only outcome', throwsTypeError(() => ledger.recordAggregateOnly(db, { dayUtc: TODAY, outcome: 'network_error' })));
  check('TypeError: aggregate-only rejects a malformed day', throwsTypeError(() => ledger.recordAggregateOnly(db, { dayUtc: '2026-5-14', outcome: 'busy' })));
  check('TypeError: aggregate-only rejects a missing argument', throwsTypeError(() => ledger.recordAggregateOnly(db)));
  check('rejected aggregate calls changed nothing', deepEqual(dailySnapshot(db), rows));

  console.log('\n--- server_error on both paths shares one (day, server_error) row ---');
  const both = freshDb();
  ledger.recordAggregateOnly(both, { dayUtc: TODAY, outcome: 'server_error' });
  ledger.recordDecision(both, baseRow({
    decisionId: 'd-post-upstream', outcome: 'server_error', calibrationStatus: null,
    inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable',
    upstreamLatencyMs: null, upstreamStatus: null,
  }), { capUsd: 0.00002 });
  check('one jev_decisions row', decisionCount(both) === 1);
  const serverDaily = dailySnapshot(both);
  check('one jev_daily row for (day, server_error)', serverDaily.length === 1 && serverDaily[0].outcome === 'server_error', show(serverDaily));
  check('requests 2 and cap_accrued_usd 0.00002', serverDaily[0] && serverDaily[0].requests === 2 && approx(serverDaily[0].cap_accrued_usd, 0.00002), show(serverDaily[0]));
  check('todaySpendUsd includes the post-upstream accrual', approx(ledger.todaySpendUsd(both, TODAY), 0.00002), show(ledger.todaySpendUsd(both, TODAY)));
}

function spendSection(ledger) {
  console.log('\n--- todaySpendUsd ---');
  const db = freshDb();
  check('todaySpendUsd is 0 for an empty day', ledger.todaySpendUsd(db, TODAY) === 0);
  ledger.recordDecision(db, baseRow({ decisionId: 's-1' }), { capUsd: 0.25 });
  ledger.recordDecision(db, baseRow({ decisionId: 's-2', outcome: 'timeout', inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable' }), { capUsd: 0.5 });
  ledger.recordDecision(db, baseRow({ decisionId: 's-3', createdAtMs: NOW - ONE_DAY_MS }), { capUsd: 4 });
  ledger.recordAggregateOnly(db, { dayUtc: TODAY, outcome: 'busy' });
  check('todaySpendUsd sums the cap accrual across outcomes for the day', approx(ledger.todaySpendUsd(db, TODAY), 0.75), show(ledger.todaySpendUsd(db, TODAY)));
  check('todaySpendUsd keeps days apart', approx(ledger.todaySpendUsd(db, '2026-05-13'), 4));
  check('todaySpendUsd is 0 for a day with no rows', ledger.todaySpendUsd(db, '2026-05-16') === 0);
  check('TypeError: todaySpendUsd rejects a malformed day', throwsTypeError(() => ledger.todaySpendUsd(db, 'today')));
}

function dayKeySection(ledger) {
  console.log('\n--- dayUtcKey ---');
  check('dayUtcKey formats the UTC day', ledger.dayUtcKey(NOW) === TODAY);
  check('dayUtcKey uses UTC at the day edge', ledger.dayUtcKey(Date.UTC(2026, 0, 1, 0, 0, 0)) === '2026-01-01'
    && ledger.dayUtcKey(Date.UTC(2025, 11, 31, 23, 59, 59, 999)) === '2025-12-31');
}

function pruneSection(ledger) {
  console.log('\n--- pruneJevLedger: 7-day ledger, 365-day aggregate ---');
  const db = freshDb();
  const seven = 7 * ONE_DAY_MS;
  ledger.recordDecision(db, baseRow({ decisionId: 'p-old', createdAtMs: NOW - seven - 1 }));
  ledger.recordDecision(db, baseRow({ decisionId: 'p-edge', createdAtMs: NOW - seven }));
  ledger.recordDecision(db, baseRow({ decisionId: 'p-new', createdAtMs: NOW - ONE_DAY_MS }));
  const keptDay = ledger.dayUtcKey(NOW - 365 * ONE_DAY_MS);
  const goneDay = ledger.dayUtcKey(NOW - 366 * ONE_DAY_MS);
  ledger.recordAggregateOnly(db, { dayUtc: keptDay, outcome: 'busy' });
  ledger.recordAggregateOnly(db, { dayUtc: goneDay, outcome: 'busy' });
  ledger.recordAggregateOnly(db, { dayUtc: '2024-01-01', outcome: 'disabled' });
  ledger.pruneJevLedger(db, NOW);
  const ids = db.prepare('SELECT decision_id FROM jev_decisions ORDER BY decision_id').all().map((r) => r.decision_id);
  check('ledger rows older than 7 days are deleted', !ids.includes('p-old'), show(ids));
  check('ledger rows exactly 7 days old and newer are kept', ids.includes('p-edge') && ids.includes('p-new'), show(ids));
  const days = db.prepare('SELECT DISTINCT day_utc FROM jev_daily ORDER BY day_utc').all().map((r) => r.day_utc);
  check('the aggregate for the day 365 days back is kept', days.includes(keptDay), show(days));
  check('aggregates older than 365 days are deleted', !days.includes(goneDay) && !days.includes('2024-01-01'), show(days));
  check('aggregates for pruned ledger rows survive the 7-day prune', days.includes(ledger.dayUtcKey(NOW - seven - 1)), show(days));
  let threw = false;
  try { ledger.pruneJevLedger(db, NOW); } catch (_e) { threw = true; }
  check('pruneJevLedger is idempotent', !threw && decisionCount(db) === 2);
  const bare = new Database(':memory:');
  check('pruneJevLedger throws on a database without the jev tables (the housekeeper guards it)', (() => {
    try { ledger.pruneJevLedger(bare, NOW); return false; } catch (_e) { return true; }
  })());
}

function formatLogSection(ledger) {
  console.log('\n--- formatDecisionLog ---');
  const row = baseRow(Object.assign({ decisionId: 'd-log-1' }, MARKERS, { goal: 'SECRET-GOAL' }));
  const line = ledger.formatDecisionLog(row);
  check('the line starts with "[jev] decision "', typeof line === 'string' && line.startsWith('[jev] decision '), show(line));
  check('the line is a single line', typeof line === 'string' && !line.includes('\n'));
  let payload = null;
  try { payload = JSON.parse(String(line).slice('[jev] decision '.length)); } catch (_e) { payload = null; }
  const expectedKeys = ['decisionId', 'outcome', 'kinds', 'elements', 'bytes', 'servedModel', 'calibration',
    'inputTokens', 'usageSource', 'costUsd', 'costSource', 'upstreamMs', 'gatewayMs', 'upstreamStatus', 'hashKeyPresent'];
  check('the payload holds exactly the allowlisted keys in order', payload && deepEqual(Object.keys(payload), expectedKeys), show(payload && Object.keys(payload)));
  check('decisionId comes first', payload && Object.keys(payload)[0] === 'decisionId' && payload.decisionId === 'd-log-1');
  check('the payload values come from the row', payload && payload.outcome === 'ok' && payload.elements === 12 && payload.bytes === 3456
    && payload.servedModel === 'typesafe/jev-1.13-20260901' && payload.calibration === 'calibrated'
    && payload.inputTokens === 1234 && payload.usageSource === 'provider' && approx(payload.costUsd, 0.000123)
    && payload.costSource === 'provider' && payload.upstreamMs === 420 && payload.gatewayMs === 455
    && payload.upstreamStatus === 200 && payload.hashKeyPresent === true, show(payload));
  check('kinds are listed sorted', payload && deepEqual(payload.kinds, ['operation', 'target']), show(payload && payload.kinds));
  check('extra row keys never appear (SECRET-GOAL)', !String(line).includes('SECRET-GOAL'));
  const leaked = Object.values(MARKERS).filter((m) => String(line).includes(m));
  check('no planted marker appears in the line', leaked.length === 0, show(leaked));

  const unknownLine = ledger.formatDecisionLog(baseRow({
    decisionId: 'd-log-2', inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable',
    servedModel: null, calibrationStatus: null, upstreamLatencyMs: null, upstreamStatus: null, hashKeyPresent: false,
  }));
  let unknown = null;
  try { unknown = JSON.parse(String(unknownLine).slice('[jev] decision '.length)); } catch (_e) { unknown = null; }
  check('unknown usage and cost stay null in the line (never 0)', unknown && unknown.inputTokens === null && unknown.costUsd === null
    && unknown.servedModel === null && unknown.hashKeyPresent === false, show(unknown));

  const hostile = ledger.formatDecisionLog(baseRow({
    decisionId: 'd-log-3', kinds: ['operation', 'MARKER-KINDS-LOG'], outcome: 'MARKER-OUTCOME',
    calibrationStatus: 'MARKER-CAL', usageSource: 'MARKER-USAGE', costSource: 'MARKER-COST',
    servedModel: 'bad model with spaces MARKER-MODEL',
  }));
  check('values outside the contract never reach the line', typeof hostile === 'string' && !hostile.includes('MARKER'), show(hostile));
  let nonObject = '';
  try { nonObject = ledger.formatDecisionLog(null); } catch (_e) { nonObject = 'threw'; }
  check('formatDecisionLog never throws on a non-object row', typeof nonObject === 'string' && nonObject.startsWith('[jev] decision '), nonObject);
}

function staticSection() {
  console.log('\n--- Static: ledger.js never logs ---');
  const fs = require('fs');
  const source = fs.readFileSync(path.join(JEV_DIR, 'ledger.js'), 'utf8');
  check('ledger.js has no console call', !/console\./.test(source));
  check('ledger.js never reads err.message', !/err\.message|error\.message|\.stack\b/.test(source));
  check('ledger.js validates outcomes against GATEWAY_FALLBACK_REASONS', source.includes('GATEWAY_FALLBACK_REASONS'));
}

// ---------------------------------------------------------------------------
// Task 2: housekeeper retention and the read-only operator report
// ---------------------------------------------------------------------------

function captureConsoleError(fn) {
  const calls = [];
  const original = console.error;
  console.error = (...args) => { calls.push(args); };
  let threw = false;
  try {
    fn();
  } catch (_e) {
    threw = true;
  } finally {
    console.error = original;
  }
  return { calls, threw };
}

function seedJevRetention(ledger, db) {
  ledger.recordDecision(db, baseRow({ decisionId: 'h-old', createdAtMs: NOW - 8 * ONE_DAY_MS }));
  ledger.recordDecision(db, baseRow({ decisionId: 'h-new', createdAtMs: NOW - 2 * ONE_DAY_MS }));
  ledger.recordAggregateOnly(db, { dayUtc: ledger.dayUtcKey(NOW - 400 * ONE_DAY_MS), outcome: 'busy' });
  ledger.recordAggregateOnly(db, { dayUtc: ledger.dayUtcKey(NOW - 30 * ONE_DAY_MS), outcome: 'busy' });
}

function housekeeperSection(ledger) {
  console.log('\n--- Housekeeper: guarded Jev prune after the telemetry tick ---');
  const housekeeper = require(path.join(SERVER_DIR, 'src', 'telemetry', 'housekeeper'));
  const Queries = require(path.join(SERVER_DIR, 'src', 'db', 'queries'));

  const db = freshDb();
  const queries = new Queries(db);
  seedJevRetention(ledger, db);
  queries.insertTelemetryEventWithRegionV2.run(
    '00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111',
    NOW - 8 * ONE_DAY_MS, 'Claude', 'm', 10, 5, 1, 2, 'periodic', 'h1', NOW - 8 * ONE_DAY_MS, 'unknown'
  );
  queries.insertTelemetryEventWithRegionV2.run(
    '00000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111',
    NOW - 60000, 'Claude', 'm', 10, 5, 1, 2, 'periodic', 'h1', NOW - 60000, 'unknown'
  );
  const tick = captureConsoleError(() => housekeeper.runHousekeeperTick(db, queries, NOW));
  check('runHousekeeperTick does not throw', !tick.threw);
  check('a healthy tick logs nothing to console.error', tick.calls.length === 0, show(tick.calls));
  const ids = db.prepare('SELECT decision_id FROM jev_decisions').all().map((r) => r.decision_id);
  check('the tick deletes ledger rows older than 7 days', !ids.includes('h-old'), show(ids));
  check('the tick keeps newer ledger rows', ids.includes('h-new'), show(ids));
  const days = db.prepare('SELECT day_utc FROM jev_daily').all().map((r) => r.day_utc);
  check('the tick deletes aggregates older than 365 days', !days.includes(ledger.dayUtcKey(NOW - 400 * ONE_DAY_MS)), show(days));
  check('the tick keeps newer aggregates', days.includes(ledger.dayUtcKey(NOW - 30 * ONE_DAY_MS)), show(days));
  const events = db.prepare('SELECT event_id FROM telemetry_events').all().map((r) => r.event_id);
  check('the telemetry tick still prunes old raw events', !events.includes('00000000-0000-4000-8000-0000000000a1') && events.includes('00000000-0000-4000-8000-0000000000a2'), show(events));
  const global = db.prepare('SELECT unique_installs FROM telemetry_global_aggregates WHERE day_utc = ?').get(TODAY);
  check('the telemetry tick still writes today\'s global aggregate', global && global.unique_installs === 1, show(global));

  console.log('\n--- Housekeeper: missing Jev tables ---');
  const missing = freshDb();
  missing.exec('DROP TABLE jev_decisions; DROP TABLE jev_daily;');
  const missingTick = captureConsoleError(() => housekeeper.runHousekeeperTick(missing, undefined, NOW));
  check('missing jev tables: runHousekeeperTick does not throw', !missingTick.threw);
  check('missing jev tables: console.error receives exactly the fixed line',
    missingTick.calls.length === 1 && missingTick.calls[0].length === 1 && missingTick.calls[0][0] === '[housekeeper] jev prune failed',
    show(missingTick.calls));
  const missingGlobal = missing.prepare('SELECT day_utc FROM telemetry_global_aggregates WHERE day_utc = ?').get(TODAY);
  check('missing jev tables: the telemetry tick still ran', !!missingGlobal);

  console.log('\n--- Housekeeper: pruneJevLedger throws with a message ---');
  const throwing = freshDb();
  seedJevRetention(ledger, throwing);
  throwing.exec("CREATE TRIGGER jev_prune_fail BEFORE DELETE ON jev_decisions BEGIN SELECT RAISE(ABORT, 'MARKER-SQL-ERROR-6f1d'); END;");
  const throwingTick = captureConsoleError(() => housekeeper.runHousekeeperTick(throwing, undefined, NOW));
  check('a throwing prune: runHousekeeperTick does not throw', !throwingTick.threw);
  check('a throwing prune: console.error receives exactly the fixed line',
    throwingTick.calls.length === 1 && throwingTick.calls[0].length === 1 && throwingTick.calls[0][0] === '[housekeeper] jev prune failed',
    show(throwingTick.calls));
  check('a throwing prune: the SQL error message is never logged', !show(throwingTick.calls).includes('MARKER-SQL-ERROR'));
  check('a throwing prune: its transaction rolled back (aggregates untouched)', throwing.prepare('SELECT COUNT(*) AS n FROM jev_daily').get().n === 4);

  console.log('\n--- Housekeeper: the telemetry failure path is unchanged ---');
  const broken = freshDb();
  seedJevRetention(ledger, broken);
  const brokenQueries = { deleteOldEvents: { run: () => { throw new Error('synthetic SQL error'); } } };
  const brokenTick = captureConsoleError(() => housekeeper.runHousekeeperTick(broken, brokenQueries, NOW));
  const brokenText = brokenTick.calls.map((args) => args.join(' ')).join('\n');
  check('broken telemetry queries: runHousekeeperTick does not throw', !brokenTick.threw);
  check('broken telemetry queries: the existing tick-failed line is unchanged',
    brokenTick.calls.length === 1 && brokenTick.calls[0][0] === '[housekeeper] tick failed:' && brokenTick.calls[0][1] === 'synthetic SQL error',
    show(brokenTick.calls));
  check('broken telemetry queries: no jev prune failure', !brokenText.includes('jev prune failed'));
  check('broken telemetry queries: the Jev prune still runs in its own step',
    !broken.prepare('SELECT decision_id FROM jev_decisions').all().some((r) => r.decision_id === 'h-old'));

  const fs = require('fs');
  const source = fs.readFileSync(path.join(SERVER_DIR, 'src', 'telemetry', 'housekeeper.js'), 'utf8');
  check('housekeeper.js keeps exactly one tick-failed line', source.split('[housekeeper] tick failed:').length === 2);
  check('housekeeper.js has exactly one jev-prune-failed line', source.split('[housekeeper] jev prune failed').length === 2);
  check('housekeeper.js calls pruneJevLedger(db, nowMs)', /pruneJevLedger\(db, nowMs\)/.test(source));
}

const REPORT_USAGE_PREFIX = 'usage: node src/jev/report.js';

function seedReport(ledger, db, nowMs) {
  const day = (offset) => nowMs - offset * ONE_DAY_MS;
  const extra = Object.assign({}, MARKERS);
  const rows = [
    // today: 3 ok (2 calibrated on the dated snapshot, 1 uncalibrated on another family), 1 timeout
    baseRow(Object.assign({}, extra, { decisionId: 'r-1', createdAtMs: day(0) - 4000, servedModel: 'typesafe/jev-1.13-20260901', calibrationStatus: 'calibrated', inputTokens: 100, costUsd: 0.0001, costSource: 'provider' })),
    baseRow(Object.assign({}, extra, { decisionId: 'r-2', createdAtMs: day(0) - 3000, servedModel: 'typesafe/jev-1.13-20260901', calibrationStatus: 'calibrated', inputTokens: 200, costUsd: 0.00002, costSource: 'estimate' })),
    baseRow(Object.assign({}, extra, { decisionId: 'r-3', createdAtMs: day(0) - 2000, servedModel: 'jev-2.0.0', calibrationStatus: 'uncalibrated', inputTokens: 300, costUsd: 0.0003, costSource: 'provider' })),
    baseRow(Object.assign({}, extra, { decisionId: 'r-4', createdAtMs: day(0) - 1000, outcome: 'timeout', servedModel: null, calibrationStatus: null, inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable', upstreamLatencyMs: null, upstreamStatus: null })),
    // yesterday: 1 ok, 1 upstream_error
    baseRow(Object.assign({}, extra, { decisionId: 'r-5', createdAtMs: day(1), servedModel: 'typesafe/jev-1.13-20260901', calibrationStatus: 'snapshot_changed', inputTokens: 50, costUsd: 0.00005, costSource: 'provider' })),
  ];
  const caps = [0.0001, 0.00002, 0.0003, 0.00004, 0.00005];
  rows.forEach((row, i) => ledger.recordDecision(db, row, { capUsd: caps[i] }));
  ledger.recordDecision(db, baseRow(Object.assign({}, extra, { decisionId: 'r-6', createdAtMs: day(1) + 1000, outcome: 'upstream_error', servedModel: null, calibrationStatus: null, inputTokens: null, usageSource: 'unavailable', costUsd: null, costSource: 'unavailable', upstreamStatus: 503 })), { capUsd: 0.00004 });
  // two days ago: refusals only
  ledger.recordAggregateOnly(db, { dayUtc: ledger.dayUtcKey(day(2)), outcome: 'busy' });
  ledger.recordAggregateOnly(db, { dayUtc: ledger.dayUtcKey(day(2)), outcome: 'busy' });
  ledger.recordAggregateOnly(db, { dayUtc: ledger.dayUtcKey(day(2)), outcome: 'invalid_request' });
  ledger.recordAggregateOnly(db, { dayUtc: ledger.dayUtcKey(day(0)), outcome: 'spend_cap_reached' });
}

function runCapture(report, argv, deps) {
  const out = [];
  const err = [];
  const code = report.runCli(argv, Object.assign({ out: (line) => out.push(line), err: (line) => err.push(line) }, deps));
  return { code, out, err, text: out.join('\n') + '\n' + err.join('\n') };
}

function reportSection(ledger, report) {
  console.log('\n--- Report: buildReport ---');
  const fs = require('fs');
  const os = require('os');
  const { spawnSync } = require('child_process');

  const db = freshDb();
  seedReport(ledger, db, NOW);
  const built = report.buildReport(db, { days: 7, nowMs: NOW });
  check('buildReport returns days and servedModels', built && Array.isArray(built.days) && Array.isArray(built.servedModels), show(built));
  check('buildReport has exactly the top-level keys', built && deepEqual(Object.keys(built), ['days', 'servedModels']), show(built && Object.keys(built)));
  const byDay = Object.fromEntries((built.days || []).map((d) => [d.dayUtc, d]));
  check('three seeded days, newest first', deepEqual((built.days || []).map((d) => d.dayUtc), [TODAY, '2026-05-13', '2026-05-12']), show((built.days || []).map((d) => d.dayUtc)));
  const today = byDay[TODAY] || {};
  check('day keys are exactly the interface keys', deepEqual(Object.keys(today), ['dayUtc', 'requests', 'byOutcome', 'inputTokensKnown', 'inputTokensUnavailable', 'costProviderUsd', 'costEstimateUsd', 'costUnavailable', 'capAccruedUsd']), show(Object.keys(today)));
  check('today: requests across outcomes', today.requests === 5, show(today));
  check('today: per-outcome counts', deepEqual(today.byOutcome, { ok: 3, spend_cap_reached: 1, timeout: 1 }) || deepEqual(today.byOutcome, { ok: 3, timeout: 1, spend_cap_reached: 1 }), show(today.byOutcome));
  check('today: known and unavailable tokens', today.inputTokensKnown === 600 && today.inputTokensUnavailable === 1, show(today));
  check('today: cost by source', approx(today.costProviderUsd, 0.0004) && approx(today.costEstimateUsd, 0.00002) && today.costUnavailable === 1, show(today));
  check('today: cap accrual', approx(today.capAccruedUsd, 0.0001 + 0.00002 + 0.0003 + 0.00004), show(today.capAccruedUsd));
  const yesterday = byDay['2026-05-13'] || {};
  check('yesterday: ok and upstream_error', yesterday.requests === 2 && deepEqual(yesterday.byOutcome, { ok: 1, upstream_error: 1 }), show(yesterday));
  const twoAgo = byDay['2026-05-12'] || {};
  check('two days ago: refusals only, nothing spent', twoAgo.requests === 3 && twoAgo.byOutcome.busy === 2 && twoAgo.byOutcome.invalid_request === 1 && twoAgo.capAccruedUsd === 0, show(twoAgo));
  const models = Object.fromEntries((built.servedModels || []).map((m) => [String(m.servedModel), m]));
  check('served models: the dated snapshot counted with its calibration statuses',
    models['typesafe/jev-1.13-20260901'] && models['typesafe/jev-1.13-20260901'].n === 3
    && deepEqual(models['typesafe/jev-1.13-20260901'].calibration, { calibrated: 2, snapshot_changed: 1 }), show(built.servedModels));
  check('served models: the other family is uncalibrated', models['jev-2.0.0'] && models['jev-2.0.0'].n === 1 && deepEqual(models['jev-2.0.0'].calibration, { uncalibrated: 1 }));
  check('served models: rows without a served model are counted under null', models.null && models.null.servedModel === null && models.null.n === 2, show(models.null));
  check('served models: most frequent first', built.servedModels && built.servedModels[0] && built.servedModels[0].servedModel === 'typesafe/jev-1.13-20260901');
  const oneDay = report.buildReport(db, { days: 1, nowMs: NOW });
  check('days 1 covers only today', deepEqual(oneDay.days.map((d) => d.dayUtc), [TODAY]) && oneDay.servedModels.reduce((s, m) => s + m.n, 0) === 4, show(oneDay));

  console.log('\n--- Report: runCli --days ---');
  const cli = runCapture(report, ['--days', '7'], { db, now: () => NOW });
  check('runCli --days 7 returns 0', cli.code === 0, show(cli));
  check('runCli --days 7 prints nothing to err', cli.err.length === 0, show(cli.err));
  check('one header line', cli.out.length > 0 && cli.out[0].startsWith('jev-report ') && cli.out.filter((l) => l.startsWith('jev-report ')).length === 1, show(cli.out[0]));
  check('one line per day', cli.out.filter((l) => l.startsWith('day ')).length === 3);
  check('one line per served model', cli.out.filter((l) => l.startsWith('model ')).length === 3);
  check('only header, day and model lines', cli.out.every((l) => /^(jev-report|day|model) /.test(l)), show(cli.out));
  const modelLine = cli.out.find((l) => l.includes('typesafe/jev-1.13-20260901')) || '';
  check('the served model line names the model and its count', modelLine.includes('n=3') && modelLine.includes('calibrated:2') && modelLine.includes('snapshot_changed:1'), modelLine);
  const todayLine = cli.out.find((l) => l.startsWith(`day ${TODAY}`)) || '';
  check('the day line shows requests and outcomes', todayLine.includes('requests=5') && todayLine.includes('ok:3') && todayLine.includes('timeout:1'), todayLine);
  const leakedCli = Object.values(MARKERS).filter((m) => cli.text.includes(m));
  check('the days report contains none of the planted markers', leakedCli.length === 0, show(leakedCli));
  const defaultCli = runCapture(report, [], { db, now: () => NOW });
  check('runCli with no flags reports the last 7 days', defaultCli.code === 0 && deepEqual(defaultCli.out, cli.out), show(defaultCli.out));
  const eqForm = runCapture(report, ['--days=7'], { db, now: () => NOW });
  check('--days=N is accepted', eqForm.code === 0 && deepEqual(eqForm.out, cli.out));

  console.log('\n--- Report: runCli --recent ---');
  const recent = runCapture(report, ['--recent', '3'], { db, now: () => NOW });
  check('runCli --recent 3 returns 0', recent.code === 0, show(recent));
  const rowLines = recent.out.filter((l) => l.startsWith('decision '));
  check('exactly 3 row lines', rowLines.length === 3, show(recent.out));
  check('one header plus the row lines', recent.out.length === 4 && recent.out[0].startsWith('jev-report '), show(recent.out));
  check('newest first, each keyed by its decisionId', rowLines[0] && rowLines[0].startsWith('decision r-4 ')
    && rowLines[1].startsWith('decision r-3 ') && rowLines[2].startsWith('decision r-2 '), show(rowLines));
  const logLine = ledger.formatDecisionLog(baseRow({ decisionId: 'r-3' }));
  const loggedId = JSON.parse(logLine.slice('[jev] decision '.length)).decisionId;
  check('a decisionId copied from a decision log line finds its row', rowLines.some((l) => l.startsWith(`decision ${loggedId} `)));
  const r3 = rowLines[1] || '';
  for (const piece of ['created=2026-05-14T11:59:58.000Z', 'outcome=ok', 'served_model=jev-2.0.0', 'instrument_version=fsb-jev-instrument-1',
    'calibration=uncalibrated', 'kinds=operation,target', 'elements=12', 'bytes=3456', 'input_tokens=300', 'usage_source=provider',
    'cost_usd=0.0003', 'cost_source=provider', 'upstream_ms=420', 'gateway_ms=455', 'upstream_status=200', 'hash_key_present=1']) {
    check(`the row line holds ${piece}`, r3.includes(piece), r3);
  }
  const r4 = rowLines[0] || '';
  check('unknown usage and cost print as null, never 0', r4.includes('input_tokens=null') && r4.includes('cost_usd=null') && r4.includes('served_model=null'), r4);
  const leakedRecent = Object.values(MARKERS).filter((m) => recent.text.includes(m));
  check('the recent listing contains none of the planted markers', leakedRecent.length === 0, show(leakedRecent));
  const recentRows = report.buildRecent(db, { limit: 2 });
  check('buildRecent returns the newest rows', Array.isArray(recentRows) && recentRows.length === 2 && recentRows[0].decisionId === 'r-4' && recentRows[1].decisionId === 'r-3', show(recentRows));
  check('buildRecent rows hold only the allowlisted fields', recentRows[0] && deepEqual(Object.keys(recentRows[0]), [
    'decisionId', 'createdAt', 'outcome', 'servedModel', 'instrumentVersion', 'calibrationStatus', 'kinds', 'elementCount',
    'requestBytes', 'inputTokens', 'usageSource', 'costUsd', 'costSource', 'upstreamLatencyMs', 'gatewayLatencyMs',
    'upstreamStatus', 'hashKeyPresent']), show(recentRows[0] && Object.keys(recentRows[0])));
  const both = runCapture(report, ['--days', '1', '--recent', '1'], { db, now: () => NOW });
  check('--days and --recent together print both sections', both.code === 0 && both.out.filter((l) => l.startsWith('day ')).length === 1
    && both.out.filter((l) => l.startsWith('decision ')).length === 1, show(both.out));

  console.log('\n--- Report: usage errors ---');
  for (const argv of [['--days', '0'], ['--days', '366'], ['--days', '1.5'], ['--days', 'x'], ['--days'], ['--recent', '0'],
    ['--recent', '201'], ['--bogus'], ['--days', '7', '--days', '3'], ['--db'], ['extra']]) {
    const bad = runCapture(report, argv, { db, now: () => NOW });
    check(`runCli ${show(argv)} returns 2 with the fixed usage line`, bad.code === 2 && bad.out.length === 0
      && bad.err.length === 1 && bad.err[0].startsWith(REPORT_USAGE_PREFIX), show(bad));
  }
  const echo = runCapture(report, ['--MARKER-FLAG-ab12'], { db, now: () => NOW });
  check('a usage error never echoes the argument', !echo.text.includes('MARKER-FLAG'), echo.text);

  console.log('\n--- Report: file databases ---');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-jev-report-'));
  try {
    const missingPath = path.join(tmp, 'missing.db');
    const unopenable = runCapture(report, ['--db', missingPath]);
    check('an unopenable --db returns 1', unopenable.code === 1, show(unopenable));
    check('an unopenable --db prints only "jev-report: failed"', unopenable.out.length === 0 && deepEqual(unopenable.err, ['jev-report: failed']), show(unopenable));
    check('an unopenable --db is not created', !fs.existsSync(missingPath));

    const emptyPath = path.join(tmp, 'empty.db');
    new Database(emptyPath).close();
    const noTables = runCapture(report, ['--db', emptyPath]);
    check('a database without the jev tables returns 1 with the fixed line', noTables.code === 1 && deepEqual(noTables.err, ['jev-report: failed']) && noTables.out.length === 0, show(noTables));

    const filePath = path.join(tmp, 'fsb-data.db');
    const fileDb = new Database(filePath);
    const originalLog = console.log;
    console.log = () => {};
    try { initializeDatabase(fileDb); } finally { console.log = originalLog; }
    const realNow = Date.now();
    seedReport(ledger, fileDb, realNow);
    fileDb.close();
    const sizeBefore = fs.statSync(filePath).size;

    const fileRun = runCapture(report, ['--db', filePath, '--days', '7', '--recent', '2']);
    check('runCli opens a file database given by --db', fileRun.code === 0 && fileRun.out.filter((l) => l.startsWith('decision ')).length === 2, show(fileRun));

    const handle = report.openReadOnlyDb(filePath);
    let writeFailed = false;
    try {
      handle.prepare("INSERT INTO jev_daily (day_utc, outcome, requests) VALUES ('2026-01-01', 'busy', 1)").run();
    } catch (_e) {
      writeFailed = true;
    }
    check('the report handle is read-only', handle.readonly === true);
    check('a write through the report handle fails', writeFailed);
    handle.close();
    const check2 = new Database(filePath, { readonly: true });
    check('the file database is unchanged by the report', check2.prepare("SELECT COUNT(*) AS n FROM jev_daily WHERE day_utc = '2026-01-01'").get().n === 0);
    check2.close();
    check('the file size is unchanged by the report', fs.statSync(filePath).size === sizeBefore);

    console.log('\n--- Report: the CLI entry point (DB_PATH and exit codes) ---');
    const reportPath = path.join(JEV_DIR, 'report.js');
    const childEnv = Object.assign({}, process.env, { DB_PATH: filePath });
    const child = spawnSync(process.execPath, [reportPath, '--recent', '5'], { env: childEnv, encoding: 'utf8' });
    check('node src/jev/report.js --recent 5 with DB_PATH exits 0', child.status === 0, show({ status: child.status, stderr: child.stderr }));
    check('the child prints the newest rows keyed by decisionId', /^decision r-4 /m.test(child.stdout) && child.stdout.split('\n').filter((l) => l.startsWith('decision ')).length === 5, child.stdout);
    check('the child output contains none of the planted markers', Object.values(MARKERS).every((m) => !child.stdout.includes(m) && !child.stderr.includes(m)));
    const childDays = spawnSync(process.execPath, [reportPath, '--days', '1'], { env: childEnv, encoding: 'utf8' });
    check('node src/jev/report.js --days 1 exits 0 with one day line', childDays.status === 0 && childDays.stdout.split('\n').filter((l) => l.startsWith('day ')).length === 1, show({ status: childDays.status, stdout: childDays.stdout }));
    const childMissing = spawnSync(process.execPath, [reportPath], { env: Object.assign({}, process.env, { DB_PATH: missingPath }), encoding: 'utf8' });
    check('a missing DB_PATH exits 1 with only the fixed line', childMissing.status === 1 && childMissing.stdout === '' && childMissing.stderr === 'jev-report: failed\n', show({ status: childMissing.status, stdout: childMissing.stdout, stderr: childMissing.stderr }));
    const childBad = spawnSync(process.execPath, [reportPath, '--bogus'], { env: childEnv, encoding: 'utf8' });
    check('a usage error exits 2', childBad.status === 2 && childBad.stderr.startsWith(REPORT_USAGE_PREFIX), show({ status: childBad.status, stderr: childBad.stderr }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const source = fs.readFileSync(path.join(JEV_DIR, 'report.js'), 'utf8');
  check('report.js never prints an error message or stack', !/err\.message|error\.message|\.stack\b/.test(source));
  check('report.js has the CJS main guard', source.includes('if (require.main === module) process.exitCode = runCli(process.argv.slice(2));'));
  check('report.js opens databases read-only', /readonly:\s*true/.test(source) && /fileMustExist:\s*true/.test(source));
}

function main() {
  const ledger = loadModule('ledger.js');
  schemaSection(ledger);
  if (ledger) {
    recordDecisionSection(ledger);
    rejectionSection(ledger);
    outcomeListsSection(ledger);
    aggregateOnlySection(ledger);
    spendSection(ledger);
    dayKeySection(ledger);
    pruneSection(ledger);
    formatLogSection(ledger);
    staticSection();
    housekeeperSection(ledger);
    const report = loadModule('report.js');
    if (report) reportSection(ledger, report);
  }
  console.log(`\n=== jev-gateway-ledger results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.log(`  FAIL: suite crashed -- ${error && error.name}`);
  console.log(`\n=== jev-gateway-ledger results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
}
