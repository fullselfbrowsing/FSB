// Phase 71 Plan 02 Task 2 (EVAL-01-c; CONTEXT D-08 and its 2026-10-16
// amendment, D-15, D-16; 71-SYNC-RECHECK S4-S8, S12, S16): the versioned v2
// run row.
//
// - A schema-1 raw record still produces exactly the v1 row, and schema-1
//   rows validate unchanged (the V1 baseline).
// - A schema-2 raw record produces RUN_ROW_KEYS_V2 = RUN_ROW_KEYS plus
//   condition, jev, safety, endLabel and fastMode.
// - jev follows the Exposure rule: measurement, then the run_task fast_mode
//   summary, then known zero exposure ('no_block') on a counted autopilot
//   'on' row whose session detail was read, else unknown (source null).
// - safety comes from the raw request log and the task's check specs
//   (computeSafety); unverifiable is null, never 0. A typed `done` on a
//   checker-failed run is a claimed success on a failed run (false done).
// - Vocabularies are parity-checked against the real FsbJevState.CONTRACT
//   (67-06) and Phase 70's scripts/bench/lib/fast-mode.mjs (70-07).
//
// Pure: no server, no browser, no socket, nothing written to disk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

async function importOrNull(relative) {
  try {
    return await import(new URL(relative, import.meta.url));
  } catch {
    return null;
  }
}

const FAST_MODE = await importOrNull('../scripts/bench/lib/fast-mode.mjs');
const RUNS = await importOrNull('../scripts/bench/lib/runs.mjs');

function fastModeModule() {
  const m = FAST_MODE;
  if (!m || !Array.isArray(m.FAST_MODE_OUTCOMES) || !Array.isArray(m.FAST_MODE_BLOCK_KEYS)
    || !Array.isArray(m.FAST_MODE_SUMMARY_KEYS) || typeof m.projectFastMode !== 'function') {
    assert.fail('upstream 70-07 interface drift: fast-mode.mjs');
  }
  return m;
}

// runs.mjs imports fast-mode.mjs, so a drift there is reported by name first.
function runs() {
  fastModeModule();
  if (!RUNS) assert.fail('scripts/bench/lib/runs.mjs failed to load');
  return RUNS;
}

function jevContract() {
  let mod = null;
  try {
    mod = require('../extension/ai/jev-state.js');
  } catch {
    mod = null;
  }
  const contract = mod && mod.CONTRACT;
  if (!contract || !Array.isArray(contract.FALLBACK_REASONS) || !Array.isArray(contract.CALIBRATION_STATUSES)) {
    assert.fail('upstream 67-06 interface drift: FsbJevState.CONTRACT');
  }
  return contract;
}

const HEX64 = 'c'.repeat(64);
const JEV_FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'bench', 'jev-measurement-real-shape.json'), 'utf8'));
const CORE_DIR = path.join(ROOT, 'scripts', 'bench', 'tasks', 'core');
const CORE_TASKS = Object.freeze(fs.readdirSync(CORE_DIR).filter((name) => name.endsWith('.json')).sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(CORE_DIR, name), 'utf8'))));

// The implemented jevMeasurement keys (71-SYNC-RECHECK S4, Drift substitution 2: no toolMs).
const S4_ATTEMPT_KEYS = Object.freeze(['iteration', 'command', 'decisionSource', 'jevCalled', 'servedModel', 'instrumentVersion',
  'calibrationStatus', 'latencyMs', 'usage', 'cost', 'fallback', 'outcome', 'escalationReason', 'op', 'stepOutcome']);
const S4_COMMAND_KEYS = Object.freeze(['command', 'fastSteps', 'jevCalls', 'jevMs', 'usd', 'escalations']);

// Verbatim from 71-SYNC-RECHECK "Derived values".
const S7_END_LABELS = Object.freeze(['auth_required', 'blocked', 'complete_task', 'completed', 'cost_limit_exceeded', 'credentials_failed',
  'credentials_missing', 'end_turn', 'error', 'fail_task', 'iteration_limit_exceeded', 'manual_approval', 'meta_cognitive_loop_break',
  'safety', 'service_worker_restart', 'session_not_found', 'session_not_running', 'stopped', 'stuck_action_repetition',
  'stuck_dom_hash', 'stuck_no_goal_progress', 'tab_closed', 'time_limit_exceeded', 'user_skipped_login', 'user_stopped', 'other']);
const S6_FALLBACK_REASONS = Object.freeze(['disabled', 'not_configured', 'invalid_request', 'payload_too_large', 'sensitive_goal', 'busy',
  'spend_cap_reached', 'timeout', 'rate_limited', 'upstream_overloaded', 'auth_error', 'upstream_billing', 'unavailable_model',
  'upstream_rejected', 'upstream_error', 'invalid_response', 'network_error', 'aborted', 'server_error']);
const S5_CALIBRATION_STATUSES = Object.freeze(['calibrated', 'uncalibrated', 'snapshot_changed']);

const JEV_KEYS = Object.freeze(['acted', 'jevCalls', 'fastSteps', 'jevMs', 'usd', 'calibrationStatuses', 'fallbacks', 'servedModels',
  'instrumentVersions', 'attemptsTruncated', 'source']);
const SAFETY_KEYS = Object.freeze(['requestOvercount', 'unexpectedMutations', 'claimedSuccessOnFail']);
const V2_EXTRA_KEYS = Object.freeze(['condition', 'jev', 'safety', 'endLabel', 'fastMode']);

// --- Raw records (copied from tests/bench-report.test.mjs, not imported) -----------

const MCP_MEASUREMENT = Object.freeze({
  v: 1, kind: 'mcp', source: 'journal', calls: 7, callsWithTiming: 7,
  fsbMs: { total: 2400, median: 310, p90: 700 },
  callerGapMs: { total: 51000, median: 8200, p90: 9900, count: 6, overlapped: 0, label: 'upper bound on host thinking time' },
  callIntervalMs: { median: 8600, p90: 10100, count: 6 },
  activeSpanMs: 53400, endReason: 'task_complete', idleTimeout: false, idleTailExcluded: false,
  queueWaitMs: null, queueWaitStatus: 'not_measured',
  host: { modelMs: null, inputTokens: null, outputTokens: null, costUsd: null, status: 'unavailable', reason: 'host does not report to FSB' },
  truncated: false, pagesRead: 1,
});

const AUTOPILOT_MEASUREMENT = Object.freeze({
  v: 1, kind: 'autopilot', recorded: true, iterations: 4,
  modelMs: { total: 9100, median: 2200, p90: 2900 }, toolMs: { total: 1800, median: 400, p90: 600, calls: 5 },
  inputTokens: 21000, outputTokens: 900, reasoningTokens: 300, cachedInputTokens: 8000, usageSource: 'provider',
  costUsd: 0.0321, costSource: 'provider', costIterations: 4, requestedModel: 'grok-4.3', servedModels: ['grok-4.3'],
  perIteration: [{ iteration: 1, modelMs: 2200 }],
  legacyTotals: { costUsd: 0.03, costBasis: 'estimate', inputTokens: 21000, outputTokens: 900, usageBasis: 'provider', label: 'legacy price-table total; not provider-reported' },
});

const CLAUDE_OK_SUMMARY = Object.freeze({
  host: 'claude-code',
  init: { present: true, model: 'claude-model-fixture', toolLoading: 'eager', toolSearchEnv: 'unset', mcpServers: [{ name: 'fsb', status: 'connected' }] },
  toolUses: { total: 7, fsb: 7, toolSearch: 0, other: 0, byName: { mcp__fsb__complete_task: 1, mcp__fsb__click: 6 } },
  rateLimit: { events: 0, limited: false, statuses: [] },
  result: {
    present: true, count: 1, subtype: 'success', isError: false, durationMs: 61000, durationApiMs: 40000, numTurns: 9,
    usage: { input: 12000, output: 800, cacheRead: 30000, cacheCreation: 0 }, modelUsage: [], totalCostUsd: 0.41,
    costBasis: null, costLabel: 'list-price estimate, not billed', permissionDenials: 0,
  },
  claimedComplete: true,
  errorKind: null,
});

function rawRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    campaignId: 'cmp-rows',
    runId: 'cmp-rows-r1-core-sample-save-claude',
    attempt: 1,
    set: 'core',
    taskId: 'core-sample-save',
    taskVersion: 1,
    category: 'click-heavy',
    fixtureSha256: HEX64,
    arm: 'claude',
    round: 1,
    order: 2,
    startedAt: '2026-09-30T10:00:00.000Z',
    timing: { t0: 1000, initAt: 1500, t1: 62000, exitedAt: 62100 },
    wallMs: 61000,
    wallFromInitMs: 60500,
    timedOut: false,
    outcome: { pass: true, checks: [{ kind: 'request', pass: true, detail: { matched: 1, expected: 1 } }, { kind: 'marker', pass: true, detail: { present: true, matched: true } }] },
    infraError: null,
    claimed: { status: null, partialOutcome: null, isError: false, subtype: 'success', completeTask: true },
    sessions: [{ id: 'mcp-session-1', measurement: MCP_MEASUREMENT }],
    sessionMatch: 'unique',
    measurement: MCP_MEASUREMENT,
    hostSummary: CLAUDE_OK_SUMMARY,
    runTask: null,
    evidence: {
      requests: [{ t: 5, method: 'POST', path: '/api/sample/save', query: {}, bodyType: 'json', body: { value: 'BODY_SENTINEL_91' } }],
      finalUrl: 'http://127.0.0.1:5555/r/tokenABC123/fixtures/sample/index.html?view=saved',
      markers: { 'saved-value': 'MARKER_SENTINEL_92' },
      text: 'PAGE_TEXT_SENTINEL_93',
    },
    flags: [],
    ...overrides,
  };
}

const BASE_RUN_TASK = Object.freeze({ isError: false, status: 'completed', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task' });

function rawAutopilot(overrides = {}) {
  return rawRecord({
    runId: 'cmp-rows-r1-core-sample-save-autopilot',
    arm: 'autopilot',
    order: 1,
    wallFromInitMs: null,
    measurement: AUTOPILOT_MEASUREMENT,
    sessions: [{ id: 'autopilot-session-1', measurement: AUTOPILOT_MEASUREMENT }],
    hostSummary: null,
    claimed: { status: 'completed', partialOutcome: null, isError: false, subtype: null, completeTask: null },
    runTask: { ...BASE_RUN_TASK },
    ...overrides,
  });
}

// A schema-2 raw record as the Phase 71 runner writes it (71-03): a counted
// autopilot 'on' run whose session detail was read, with no jevMeasurement
// and no fast_mode block unless an override adds them.
function rawV2(overrides = {}) {
  const base = rawAutopilot();
  return {
    ...base,
    schemaVersion: 2,
    runId: 'cmp-rows-r1-core-sample-save-autopilot-on',
    condition: 'on',
    jevMeasurement: null,
    endReason: 'complete_task',
    safety: { requestOvercount: 0, unexpectedMutations: 0 },
    evidence: { ...base.evidence, dropped: 0 },
    ...overrides,
  };
}

function withFastMode(block, overrides = {}) {
  return rawV2({ runTask: { ...BASE_RUN_TASK, fastMode: block }, ...overrides });
}

// The 70-05 zero summary of a session with no jevMeasurement.
const Z = Object.freeze({ attempts: 0, calls: 0, fast_steps: 0, jev_ms: null, calibration: null, latched: null, exhausted: null, escalations: {} });
const ACTED_SUMMARY = Object.freeze({
  attempts: 2, calls: 2, fast_steps: 2, jev_ms: 640, calibration: 'calibrated', latched: null, exhausted: null, escalations: {},
});
const FM_DONE = Object.freeze({
  outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null, budget_profile: 'run_task', jev: ACTED_SUMMARY,
});

const FAILED_OUTCOME = Object.freeze({ pass: false, checks: [{ kind: 'request', pass: false, detail: { matched: 0, expected: 1 } }] });

const UNRECORDED_JEV = Object.freeze({
  acted: null, jevCalls: null, fastSteps: null, jevMs: null, usd: { provider: null, estimate: null }, calibrationStatuses: null,
  fallbacks: null, servedModels: null, instrumentVersions: null, attemptsTruncated: null, source: null,
});
const NO_BLOCK_JEV = Object.freeze({
  acted: false, jevCalls: 0, fastSteps: 0, jevMs: null, usd: { provider: null, estimate: null }, calibrationStatuses: {},
  fallbacks: {}, servedModels: [], instrumentVersions: [], attemptsTruncated: false, source: 'no_block',
});
const FIXTURE_JEV = Object.freeze({
  acted: true, jevCalls: 3, fastSteps: 1, jevMs: 360, usd: { provider: 0.0000756, estimate: null },
  calibrationStatuses: { calibrated: 1 }, fallbacks: { timeout: 1, sensitive_goal: 1 }, servedModels: ['jev-1.13.0'],
  instrumentVersions: ['fsb-jev-instrument-1'], attemptsTruncated: false, source: 'measurement',
});

// toCommittedRow output for the bench-report raw records before Phase 71.
const V1_GOLDEN_CLAUDE = '{"schemaVersion":1,"campaignId":"cmp-rows","runId":"cmp-rows-r1-core-sample-save-claude","attempts":1,"set":"core","taskId":"core-sample-save","taskVersion":1,"category":"click-heavy","fixtureSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","arm":"claude","round":1,"order":2,"startedAt":"2026-09-30T10:00:00.000Z","wallMs":61000,"wallFromInitMs":60500,"pass":true,"timedOut":false,"checks":[{"kind":"request","pass":true},{"kind":"marker","pass":true}],"infraError":null,"claimed":{"status":null,"partialOutcome":null,"isError":false,"subtype":"success","completeTask":true},"fsb":{"kind":"mcp","calls":7,"callsWithTiming":7,"fsbMsTotal":2400,"fsbMsMedian":310,"callerGapMsTotal":51000,"callerGapMsMedian":8200,"callIntervalMs":{"median":8600,"p90":10100,"count":6},"iterations":null,"modelMsTotal":null,"toolMsTotal":null,"endReason":"task_complete","idleTimeout":false,"sessionMatch":"unique"},"host":{"name":"claude-code","model":"claude-model-fixture","toolLoading":"eager","durationMs":61000,"durationApiMs":40000,"numTurns":9,"inputTokens":12000,"outputTokens":800,"cacheReadTokens":30000,"costUsd":0.41,"costLabel":"list-price estimate, not billed"},"cost":{"usd":0.41,"source":"host","label":"list-price estimate, not billed"},"provider":{"requestedModel":null,"servedModels":[],"servedModelMatch":null},"flags":[]}';
const V1_GOLDEN_AUTOPILOT = '{"schemaVersion":1,"campaignId":"cmp-rows","runId":"cmp-rows-r1-core-sample-save-autopilot","attempts":1,"set":"core","taskId":"core-sample-save","taskVersion":1,"category":"click-heavy","fixtureSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","arm":"autopilot","round":1,"order":1,"startedAt":"2026-09-30T10:00:00.000Z","wallMs":61000,"wallFromInitMs":null,"pass":true,"timedOut":false,"checks":[{"kind":"request","pass":true},{"kind":"marker","pass":true}],"infraError":null,"claimed":{"status":"completed","partialOutcome":null,"isError":false,"subtype":null,"completeTask":null},"fsb":{"kind":"autopilot","calls":5,"callsWithTiming":null,"fsbMsTotal":null,"fsbMsMedian":null,"callerGapMsTotal":null,"callerGapMsMedian":null,"callIntervalMs":{"median":null,"p90":null,"count":null},"iterations":4,"modelMsTotal":9100,"toolMsTotal":1800,"endReason":null,"idleTimeout":null,"sessionMatch":"unique"},"host":{"name":null,"model":null,"toolLoading":null,"durationMs":null,"durationApiMs":null,"numTurns":null,"inputTokens":null,"outputTokens":null,"cacheReadTokens":null,"costUsd":null,"costLabel":null},"cost":{"usd":0.0321,"source":"provider","label":"provider-reported (xAI cost ticks)"},"provider":{"requestedModel":"grok-4.3","servedModels":["grok-4.3"],"servedModelMatch":true},"flags":[]}';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertRejected(row, rule, why) {
  const { validateCommittedRow } = runs();
  const result = validateCommittedRow(row);
  assert.equal(result.ok, false, `${why} must be rejected`);
  if (rule) assert.ok(result.errors.some((error) => rule.test(error)), `${why}: errors ${JSON.stringify(result.errors)} name ${rule}`);
  return result.errors;
}

// --- Constants and vocabularies --------------------------------------------------

test('v2 contract constants: keys, vocabularies and caps', () => {
  const m = runs();
  assert.equal(m.RUN_ROW_SCHEMA_VERSION_V2, 2);
  assert.deepEqual([...m.RUN_ROW_KEYS_V2], [...m.RUN_ROW_KEYS, ...V2_EXTRA_KEYS]);
  assert.equal(m.RUN_ROW_KEYS.length, 25, 'RUN_ROW_KEYS stays the frozen v1 list');
  assert.deepEqual([...m.END_LABELS], [...S7_END_LABELS]);
  assert.equal(m.END_LABELS.length, 26);
  assert.deepEqual([...m.JEV_FALLBACK_REASONS], [...S6_FALLBACK_REASONS]);
  assert.equal(m.JEV_FALLBACK_REASONS.length, 19);
  assert.deepEqual([...m.JEV_CALIBRATION_STATUSES], [...S5_CALIBRATION_STATUSES]);
  assert.deepEqual([...m.AUTOPILOT_SUCCESS_STATUSES], ['completed', 'success']);
  assert.deepEqual([...m.TYPED_SUCCESS_OUTCOMES], ['done']);
  assert.deepEqual([...m.JEV_SOURCES], ['measurement', 'summary', 'no_block']);
  assert.deepEqual([...m.FAST_MODE_ROW_KEYS], ['outcome', 'reason', 'uncertainUnobserved', 'humanGate', 'exhausted', 'latched']);
  assert.equal(m.MAX_REQUESTS_PER_RUN, 2000);
  for (const list of [m.RUN_ROW_KEYS_V2, m.END_LABELS, m.JEV_FALLBACK_REASONS, m.JEV_CALIBRATION_STATUSES, m.AUTOPILOT_SUCCESS_STATUSES,
    m.TYPED_SUCCESS_OUTCOMES, m.JEV_SOURCES, m.FAST_MODE_ROW_KEYS, m.FAST_MODE_ROW_OUTCOMES]) {
    assert.ok(Object.isFrozen(list));
  }
});

test('jev vocabulary parity: JEV_FALLBACK_REASONS and JEV_CALIBRATION_STATUSES deep-equal the real FsbJevState.CONTRACT', () => {
  const contract = jevContract();
  const m = runs();
  assert.deepEqual([...m.JEV_FALLBACK_REASONS], [...contract.FALLBACK_REASONS]);
  assert.deepEqual([...m.JEV_CALIBRATION_STATUSES], [...contract.CALIBRATION_STATUSES]);
});

test('fastMode parity: the row vocabulary and mapping come from scripts/bench/lib/fast-mode.mjs (70-07)', () => {
  const fm = fastModeModule();
  const m = runs();
  assert.deepEqual([...m.FAST_MODE_ROW_OUTCOMES], [...fm.FAST_MODE_OUTCOMES, 'other']);
  assert.deepEqual(Object.keys(m.FAST_MODE_ROW_SOURCES), [...m.FAST_MODE_ROW_KEYS], 'one source path per row key, in order');
  for (const [rowKey, sourcePath] of Object.entries(m.FAST_MODE_ROW_SOURCES)) {
    assert.ok(Array.isArray(sourcePath) && (sourcePath.length === 1 || sourcePath.length === 2), `${rowKey} source path shape`);
    if (sourcePath.length === 1) {
      assert.ok(fm.FAST_MODE_BLOCK_KEYS.includes(sourcePath[0]), `${rowKey} <- ${sourcePath[0]} is a block key`);
    } else {
      assert.equal(sourcePath[0], 'jev');
      assert.ok(fm.FAST_MODE_BLOCK_KEYS.includes('jev'));
      assert.ok(fm.FAST_MODE_SUMMARY_KEYS.includes(sourcePath[1]), `${rowKey} <- jev.${sourcePath[1]} is a summary key`);
    }
  }
  for (const word of m.TYPED_SUCCESS_OUTCOMES) assert.ok(fm.FAST_MODE_OUTCOMES.includes(word), `${word} is a typed outcome`);
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'bench', 'lib', 'runs.mjs'), 'utf8');
  assert.equal((src.match(/from '\.\/fast-mode\.mjs'/g) || []).length, 1, 'runs.mjs imports the Phase 70 module, never a copy');
  assert.equal(/\['done', 'ambiguous', 'blocked', 'needs_confirmation'\]/.test(src), false, 'runs.mjs does not copy FAST_MODE_OUTCOMES');
});

test('MAX_REQUESTS_PER_RUN matches the fixture server default (source pin)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'bench', 'fixture-server.mjs'), 'utf8');
  assert.ok(src.includes('maxRequestsPerRun: 2000'), 'fixture-server.mjs DEFAULTS still caps a run at 2000 requests');
  assert.equal(runs().MAX_REQUESTS_PER_RUN, 2000);
});

test('the jevMeasurement fixture has the implemented S4 shape (no toolMs)', () => {
  const block = JEV_FIXTURE.jevMeasurement;
  assert.equal(block.v, 1);
  assert.deepEqual(Object.keys(block), ['v', 'attempts', 'commands']);
  assert.equal(block.commands.length, 2);
  for (const attempt of block.attempts) {
    assert.deepEqual(Object.keys(attempt), [...S4_ATTEMPT_KEYS]);
    assert.deepEqual(Object.keys(attempt.usage), ['inputTokens', 'source']);
    assert.deepEqual(Object.keys(attempt.cost), ['usd', 'source']);
  }
  for (const command of block.commands) {
    assert.deepEqual(Object.keys(command), [...S4_COMMAND_KEYS]);
    assert.deepEqual(Object.keys(command.usd), ['provider', 'estimate']);
  }
  assert.equal(JSON.stringify(block).includes('toolMs'), false);
});

// --- computeSafety -----------------------------------------------------------------

function slugOf(task) {
  return task.id.replace(/^core-(?:click|mixed)-/, '');
}

function exactLog(task) {
  const log = [];
  for (const check of task.success.all) {
    if (check.kind !== 'request' || Object.prototype.hasOwnProperty.call(check, 'jsonEquals')) continue;
    for (let i = 0; i < check.count; i += 1) {
      log.push({ t: log.length + 1, method: check.method, path: check.path, query: {}, bodyType: 'json', body: { n: i } });
    }
  }
  return log;
}

function totalCheck(task) {
  return task.success.all.find((check) => check.kind === 'request' && !Object.prototype.hasOwnProperty.call(check, 'jsonEquals'));
}

test('computeSafety: every core task has exactly one total-count check; kanban-moves expects 3, the rest 1', () => {
  assert.equal(CORE_TASKS.length, 12);
  for (const task of CORE_TASKS) {
    const totals = task.success.all.filter((check) => check.kind === 'request' && !Object.prototype.hasOwnProperty.call(check, 'jsonEquals'));
    assert.equal(totals.length, 1, `${task.id} total-count checks`);
    assert.equal(totals[0].count, task.id === 'core-click-kanban-moves' ? 3 : 1, `${task.id} expected count`);
  }
});

test('computeSafety: an exact log is {0, 0}; a duplicate is overcount 1; an extra mutation is 1, for all 12 core tasks', () => {
  const { computeSafety } = runs();
  for (const task of CORE_TASKS) {
    const slug = slugOf(task);
    const exact = exactLog(task);
    assert.deepEqual(computeSafety({ task, requests: exact, dropped: 0 }), { requestOvercount: 0, unexpectedMutations: 0 }, `${task.id} exact`);
    const noisy = [
      { t: 0, method: 'GET', path: `/fixtures/${slug}/index.html`, query: {}, bodyType: 'none', body: null },
      ...exact,
      { t: 90, method: 'GET', path: `/api/${slug}/state`, query: {}, bodyType: 'none', body: null },
      { t: 91, method: 'HEAD', path: `/api/${slug}/unnamed`, query: {}, bodyType: 'none', body: null },
      { t: 92, method: 'OPTIONS', path: `/api/${slug}/unnamed`, query: {}, bodyType: 'none', body: null },
      { t: 93, method: 'POST', path: `/fixtures/${slug}/submit`, query: {}, bodyType: 'json', body: {} },
      'not a request',
    ];
    assert.deepEqual(computeSafety({ task, requests: noisy, dropped: 0 }), { requestOvercount: 0, unexpectedMutations: 0 }, `${task.id} reads and non-api posts`);
    const total = totalCheck(task);
    const duplicate = [...exact, { t: 99, method: total.method.toLowerCase(), path: total.path, query: {}, bodyType: 'json', body: {} }];
    assert.deepEqual(computeSafety({ task, requests: duplicate, dropped: 0 }), { requestOvercount: 1, unexpectedMutations: 0 }, `${task.id} duplicate`);
    const extra = [...exact, { t: 99, method: 'POST', path: `/api/${slug}/unnamed-extra`, query: {}, bodyType: 'json', body: {} }];
    assert.deepEqual(computeSafety({ task, requests: extra, dropped: undefined }), { requestOvercount: 0, unexpectedMutations: 1 }, `${task.id} extra`);
    const otherMethod = [...exact, { t: 99, method: 'DELETE', path: total.path, query: {}, bodyType: 'none', body: null }];
    assert.deepEqual(computeSafety({ task, requests: otherMethod, dropped: 0 }), { requestOvercount: 0, unexpectedMutations: 1 },
      `${task.id} a DELETE on a path named only for POST`);
    assert.deepEqual(computeSafety({ task, requests: [], dropped: 0 }), { requestOvercount: 0, unexpectedMutations: 0 }, `${task.id} empty log`);
  }
  const kanban = CORE_TASKS.find((task) => task.id === 'core-click-kanban-moves');
  const five = [...exactLog(kanban), ...exactLog(kanban).slice(0, 2)];
  assert.equal(computeSafety({ task: kanban, requests: five, dropped: 0 }).requestOvercount, 2, 'kanban 5 of 3 moves is overcount 2');
});

test('computeSafety: an unverifiable log is null, never 0', () => {
  const { computeSafety, MAX_REQUESTS_PER_RUN } = runs();
  const task = CORE_TASKS[0];
  const nulls = { requestOvercount: null, unexpectedMutations: null };
  assert.deepEqual(computeSafety({ task, requests: null, dropped: 0 }), nulls, 'no request log');
  assert.deepEqual(computeSafety({ task, requests: 'x', dropped: 0 }), nulls, 'a non-array log');
  assert.deepEqual(computeSafety({ task, requests: exactLog(task), dropped: 1 }), nulls, 'dropped requests');
  const full = Array.from({ length: MAX_REQUESTS_PER_RUN }, (_, i) => ({ t: i, method: 'GET', path: '/x', query: {}, bodyType: 'none', body: null }));
  assert.deepEqual(computeSafety({ task, requests: full }), nulls, 'a log at the cap with an unknown dropped count');
  assert.deepEqual(computeSafety({ task, requests: full, dropped: null }), nulls, 'dropped null is unknown');
  assert.deepEqual(computeSafety({ task, requests: full, dropped: 0 }), { requestOvercount: 0, unexpectedMutations: 0 }, 'a full log with 0 dropped is complete');
  assert.deepEqual(computeSafety({ task, requests: full.slice(1) }), { requestOvercount: 0, unexpectedMutations: 0 }, 'under the cap');
  for (const bad of [-1, 1.5, '0', Number.NaN]) assert.deepEqual(computeSafety({ task, requests: exactLog(task), dropped: bad }), nulls, `dropped ${String(bad)}`);
  for (const badTask of [null, {}, { success: {} }, { success: { all: 'x' } }]) {
    assert.deepEqual(computeSafety({ task: badTask, requests: [], dropped: 0 }), nulls, 'a task without success.all');
  }
  assert.deepEqual(computeSafety(), nulls);
});

// --- isClaimedSuccess ----------------------------------------------------------------

test('isClaimedSuccess: autopilot status words with isError not true; host arms completeTask', () => {
  const { isClaimedSuccess } = runs();
  assert.equal(isClaimedSuccess('autopilot', { status: 'completed', isError: false }), true);
  assert.equal(isClaimedSuccess('autopilot', { status: 'success', isError: null }), true);
  assert.equal(isClaimedSuccess('autopilot', { status: 'success', isError: true }), false);
  for (const status of ['partial', 'error', 'stopped', 'done', null]) assert.equal(isClaimedSuccess('autopilot', { status, isError: false }), false, status);
  assert.equal(isClaimedSuccess('autopilot', { status: 'done', isError: false }, ['done']), true, 'the evaluator passes per-build words');
  assert.equal(isClaimedSuccess('autopilot', { status: 'completed', isError: false }, ['success']), false);
  assert.equal(isClaimedSuccess('claude', { status: null, completeTask: true }), true);
  assert.equal(isClaimedSuccess('cursor', { completeTask: true }), true);
  assert.equal(isClaimedSuccess('claude', { status: 'completed', completeTask: null }), false, 'host arms never read status');
  assert.equal(isClaimedSuccess('claude', { completeTask: false }), false);
  assert.equal(isClaimedSuccess('other', { status: 'completed', completeTask: true }), false);
  assert.equal(isClaimedSuccess('autopilot', null), false);
});

// --- v1 records stay v1 ----------------------------------------------------------------

test('a schema-1 raw record produces exactly the v1 row, byte for byte', () => {
  const { toCommittedRow, validateCommittedRow, RUN_ROW_KEYS } = runs();
  const claude = toCommittedRow(rawRecord());
  assert.equal(JSON.stringify(claude), V1_GOLDEN_CLAUDE);
  const autopilot = toCommittedRow(rawAutopilot());
  assert.equal(JSON.stringify(autopilot), V1_GOLDEN_AUTOPILOT);
  const absent = rawAutopilot();
  delete absent.schemaVersion;
  assert.equal(JSON.stringify(toCommittedRow(absent)), V1_GOLDEN_AUTOPILOT, 'an absent schemaVersion is v1');
  const v1WithV2Fields = rawAutopilot({
    condition: 'on', jevMeasurement: JEV_FIXTURE.jevMeasurement, endReason: 'complete_task', safety: { requestOvercount: 3, unexpectedMutations: 2 },
    runTask: { ...BASE_RUN_TASK, fastMode: FM_DONE },
  });
  assert.equal(JSON.stringify(toCommittedRow(v1WithV2Fields)), V1_GOLDEN_AUTOPILOT, 'a v1 record never grows v2 blocks');
  for (const row of [claude, autopilot]) {
    assert.deepEqual(Object.keys(row), [...RUN_ROW_KEYS]);
    assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] });
  }
  for (const golden of [V1_GOLDEN_CLAUDE, V1_GOLDEN_AUTOPILOT]) {
    assert.deepEqual(validateCommittedRow(JSON.parse(golden)), { ok: true, errors: [] }, 'schema-1 rows validate unchanged');
  }
});

// --- v2 rows ---------------------------------------------------------------------------

test('a schema-2 raw record produces RUN_ROW_KEYS_V2 in order and validates', () => {
  const { toCommittedRow, validateCommittedRow, RUN_ROW_KEYS_V2 } = runs();
  const row = toCommittedRow(rawV2({ jevMeasurement: clone(JEV_FIXTURE.jevMeasurement), runTask: { ...BASE_RUN_TASK, fastMode: FM_DONE } }));
  assert.deepEqual(Object.keys(row), [...RUN_ROW_KEYS_V2]);
  assert.equal(row.schemaVersion, 2);
  assert.deepEqual(Object.keys(row.jev), [...JEV_KEYS]);
  assert.deepEqual(Object.keys(row.jev.usd), ['provider', 'estimate']);
  assert.deepEqual(Object.keys(row.safety), [...SAFETY_KEYS]);
  assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] });
  const v1 = JSON.parse(V1_GOLDEN_AUTOPILOT);
  for (const key of Object.keys(v1)) {
    if (key === 'schemaVersion' || key === 'runId') continue;
    assert.deepEqual(row[key], v1[key], `v1 field ${key} is carried unchanged`);
  }
  assert.equal(row.runId, 'cmp-rows-r1-core-sample-save-autopilot-on');
  assert.equal(row.endLabel, 'complete_task');
});

test('v2 condition: off, on or null; anything else is null', () => {
  const { toCommittedRow } = runs();
  for (const [value, expected] of [['off', 'off'], ['on', 'on'], [null, null], [undefined, null], ['ON', null], ['maybe', null], [1, null]]) {
    assert.equal(toCommittedRow(rawV2({ condition: value })).condition, expected, `condition ${String(value)}`);
  }
});

test('v2 jev case (1): a real-shape jevMeasurement gives source measurement with commands[] sums', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  const row = toCommittedRow(rawV2({ jevMeasurement: clone(JEV_FIXTURE.jevMeasurement) }));
  assert.deepEqual(row.jev, FIXTURE_JEV);
  assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] });
  const off = toCommittedRow(rawV2({ condition: 'off', jevMeasurement: clone(JEV_FIXTURE.jevMeasurement) }));
  assert.equal(off.jev.source, 'measurement', 'an off run with a jevMeasurement is visible (condition leak, D-16)');
  assert.deepEqual(validateCommittedRow(off), { ok: true, errors: [] });
});

test('v2 jev case (1) rules: sums, acted attempts, vocabulary mapping, distinct models and truncation', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  const jevOf = (block) => toCommittedRow(rawV2({ jevMeasurement: block })).jev;
  const attempt = (over) => ({ ...clone(JEV_FIXTURE.jevMeasurement.attempts[0]), ...over });
  const command = (over) => ({ command: 1, fastSteps: 0, jevCalls: 0, jevMs: null, usd: { provider: null, estimate: null }, escalations: {}, ...over });

  const summed = jevOf({ v: 1, attempts: [], commands: [
    command({ command: 1, fastSteps: 2, jevCalls: 3, jevMs: 100, usd: { provider: 0.5, estimate: null } }),
    command({ command: 2, fastSteps: 1, jevCalls: 1, jevMs: 50.5, usd: { provider: 0.25, estimate: 0.125 } }),
  ] });
  assert.deepEqual([summed.acted, summed.fastSteps, summed.jevCalls, summed.jevMs], [true, 3, 4, 150.5]);
  assert.deepEqual(summed.usd, { provider: 0.75, estimate: 0.125 });

  const none = jevOf({ v: 1, attempts: [], commands: [] });
  assert.deepEqual([none.acted, none.fastSteps, none.jevCalls, none.jevMs], [false, null, null, null], 'no command reports a number: null, not acted');
  assert.deepEqual(none.usd, { provider: null, estimate: null });
  const zero = jevOf({ v: 1, attempts: [], commands: [command({ fastSteps: 0, jevCalls: 2, jevMs: 0 })] });
  assert.deepEqual([zero.acted, zero.fastSteps, zero.jevCalls, zero.jevMs], [false, 0, 2, 0], 'Jev called but never stepped');
  const badNumbers = jevOf({ v: 1, attempts: [], commands: [command({ fastSteps: -1, jevCalls: 1.5, jevMs: -3, usd: { provider: 'x', estimate: -1 } })] });
  assert.deepEqual([badNumbers.fastSteps, badNumbers.jevCalls, badNumbers.jevMs], [null, null, null]);
  assert.deepEqual(badNumbers.usd, { provider: null, estimate: null });

  const mapped = jevOf({ v: 1, commands: [command({ fastSteps: 3 })], attempts: [
    attempt({ calibrationStatus: 'calibrated' }),
    attempt({ calibrationStatus: 'uncalibrated' }),
    attempt({ calibrationStatus: 'Made_Up' }),
    attempt({ calibrationStatus: null }),
    attempt({ calibrationStatus: 'snapshot_changed', op: null }),
    attempt({ calibrationStatus: 'snapshot_changed', stepOutcome: null }),
    attempt({ calibrationStatus: 'snapshot_changed', fallback: 'timeout' }),
    attempt({ fallback: 'not_a_reason', op: null, stepOutcome: null }),
    attempt({ fallback: 'busy', op: null, stepOutcome: null }),
    attempt({ fallback: 'busy', op: null, stepOutcome: null }),
  ] });
  assert.deepEqual(mapped.calibrationStatuses, { calibrated: 1, uncalibrated: 1, other: 2 }, 'acted attempts only; unknown is other');
  assert.deepEqual(mapped.fallbacks, { timeout: 1, busy: 2, other: 1 }, 'non-null fallbacks; unknown is other');

  const models = jevOf({ v: 1, commands: [command({ fastSteps: 1 })], attempts: [
    attempt({ servedModel: 'jev-b', instrumentVersion: 'i-2' }),
    attempt({ servedModel: 'jev-a', instrumentVersion: 'i-1' }),
    attempt({ servedModel: 'jev-b', instrumentVersion: 'i-2' }),
    attempt({ servedModel: 'jev-local', instrumentVersion: 'i-local', jevCalled: false }),
    attempt({ servedModel: '', instrumentVersion: null }),
    attempt({ servedModel: 'https://evil.example/model', instrumentVersion: 'm'.repeat(300) }),
  ] });
  assert.deepEqual(models.servedModels, ['jev-a', 'jev-b'], 'sorted, distinct, jevCalled only, no URL');
  assert.deepEqual(models.instrumentVersions, ['i-1', 'i-2', 'm'.repeat(128)], 'capped at 128 characters');
  const many = jevOf({ v: 1, commands: [command({ fastSteps: 1 })], attempts: Array.from({ length: 12 }, (_, i) => attempt({ servedModel: `jev-${String(i).padStart(2, '0')}` })) });
  assert.equal(many.servedModels.length, 10, 'at most 10 served models');

  const full = jevOf({ v: 1, commands: [command({ fastSteps: 1 })], attempts: Array.from({ length: 100 }, () => attempt({})) });
  assert.equal(full.attemptsTruncated, true, '100 attempts is the cap: maybe truncated');
  assert.equal(full.calibrationStatuses.calibrated, 100);
  assert.equal(jevOf({ v: 1, commands: [], attempts: Array.from({ length: 99 }, () => attempt({})) }).attemptsTruncated, false);
  const junk = jevOf({ v: 1, commands: 'x', attempts: [null, 3, 'x'] });
  assert.deepEqual([junk.acted, junk.calibrationStatuses, junk.fallbacks, junk.servedModels, junk.source], [false, {}, {}, [], 'measurement']);
  for (const block of [summed, none, zero, badNumbers, mapped, models, many, full, junk]) {
    assert.deepEqual(validateCommittedRow({ ...toCommittedRow(rawV2()), jev: block }), { ok: true, errors: [] });
  }
});

test('v2 jev case (2): the run_task fast_mode summary, acted = fast_steps > 0', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  const acted = toCommittedRow(withFastMode(FM_DONE)).jev;
  assert.deepEqual(acted, {
    acted: true, jevCalls: 2, fastSteps: 2, jevMs: 640, usd: { provider: null, estimate: null }, calibrationStatuses: { calibrated: 1 },
    fallbacks: null, servedModels: null, instrumentVersions: null, attemptsTruncated: null, source: 'summary',
  });
  const zero = toCommittedRow(withFastMode({ ...FM_DONE, jev: Z })).jev;
  assert.deepEqual(zero, {
    acted: false, jevCalls: 0, fastSteps: 0, jevMs: null, usd: { provider: null, estimate: null }, calibrationStatuses: {},
    fallbacks: null, servedModels: null, instrumentVersions: null, attemptsTruncated: null, source: 'summary',
  });
  const uncalibrated = toCommittedRow(withFastMode({ ...FM_DONE, jev: { ...ACTED_SUMMARY, calibration: null } })).jev;
  assert.deepEqual(uncalibrated.calibrationStatuses, { other: 1 }, 'an acted summary with no known calibration fails D-16');
  const tokenCal = toCommittedRow(withFastMode({ ...FM_DONE, jev: { ...ACTED_SUMMARY, calibration: 'uncalibrated' } })).jev;
  assert.deepEqual(tokenCal.calibrationStatuses, { uncalibrated: 1 });
  for (const raw of [withFastMode(FM_DONE), withFastMode({ ...FM_DONE, jev: Z })]) {
    assert.deepEqual(validateCommittedRow(toCommittedRow(raw)), { ok: true, errors: [] });
  }
});

test('v2 jev cases (3) and (4): no_block is known zero exposure; everything else is unknown', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  const noBlock = toCommittedRow(rawV2());
  assert.deepEqual(noBlock.jev, NO_BLOCK_JEV);
  assert.deepEqual(validateCommittedRow(noBlock), { ok: true, errors: [] });
  const unknown = [
    ['off without a block', rawV2({ condition: 'off' })],
    ['condition null', rawV2({ condition: null })],
    ['host arm', rawV2({ arm: 'claude', runTask: null, hostSummary: CLAUDE_OK_SUMMARY, measurement: MCP_MEASUREMENT })],
    ['infra row', rawV2({ infraError: 'condition_not_applied' })],
    ['fast_mode with jev null', withFastMode({ ...FM_DONE, jev: null })],
    ['session detail never read', rawV2({ flags: ['session_detail_missing'] })],
    ['flags not an array', rawV2({ flags: undefined })],
  ];
  for (const [why, raw] of unknown) {
    const row = toCommittedRow(raw);
    assert.deepEqual(row.jev, UNRECORDED_JEV, why);
    assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] }, `${why} validates`);
  }
});

test('exposure cross-check (2026-10-16 orchestrator decision): the Exposure rule case by case', () => {
  const { toCommittedRow } = runs();
  const jev = (raw) => toCommittedRow(raw).jev;

  const bare = jev(rawV2());
  assert.deepEqual([bare.acted, bare.source, bare.jevCalls, bare.fastSteps], [false, 'no_block', 0, 0], 'on, no measurement, no block: zero, never null');

  const zero = jev(withFastMode({ ...FM_DONE, outcome: 'ambiguous', jev: Z }));
  assert.deepEqual([zero.acted, zero.source], [false, 'summary'], 'a zero summary is not acted');

  const acted = jev(withFastMode({ ...FM_DONE, jev: { ...ACTED_SUMMARY, fast_steps: 2, calibration: 'calibrated' } }));
  assert.deepEqual([acted.acted, acted.source, acted.calibrationStatuses], [true, 'summary', { calibrated: 1 }]);

  const measured = jev(withFastMode({ ...FM_DONE, jev: Z }, { jevMeasurement: clone(JEV_FIXTURE.jevMeasurement) }));
  assert.equal(measured.source, 'measurement', 'a jevMeasurement wins whatever the summary says');
  assert.equal(measured.acted, true);

  for (const [why, raw] of [
    ['condition null', rawV2({ condition: null })],
    ['arm claude', rawV2({ arm: 'claude', runTask: null })],
    ['infraError condition_not_applied', rawV2({ infraError: 'condition_not_applied' })],
    ['fast_mode jev null', withFastMode({ ...FM_DONE, jev: null })],
  ]) {
    const out = jev(raw);
    assert.deepEqual([out.acted, out.source], [null, null], why);
  }

  const timedOutNoDetail = rawV2({ timedOut: true, outcome: FAILED_OUTCOME, flags: ['session_detail_missing'] });
  assert.equal(toCommittedRow(timedOutNoDetail).infraError, null, 'the run is counted');
  assert.deepEqual([jev(timedOutNoDetail).acted, jev(timedOutNoDetail).source], [null, null], 'a detail never read proves nothing');
  const timedOutRead = rawV2({ timedOut: true, outcome: FAILED_OUTCOME, flags: [] });
  assert.deepEqual([jev(timedOutRead).acted, jev(timedOutRead).source], [false, 'no_block'], 'the same run with the detail read is no_block');
});

test('v2 fastMode: re-projected through projectFastMode and mapped to FAST_MODE_ROW_KEYS', () => {
  const { toCommittedRow, validateCommittedRow, FAST_MODE_ROW_KEYS } = runs();
  const row = toCommittedRow(withFastMode({ ...FM_DONE, jev: { ...ACTED_SUMMARY, latched: 'not_calibrated', exhausted: 'step_budget' } }));
  assert.deepEqual(Object.keys(row.fastMode), [...FAST_MODE_ROW_KEYS]);
  assert.deepEqual(row.fastMode, {
    outcome: 'done', reason: 'complete_task', uncertainUnobserved: false, humanGate: null, exhausted: 'step_budget', latched: 'not_calibrated',
  });
  assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] });
  const gate = toCommittedRow(withFastMode({ outcome: 'needs_confirmation', reason: 'manual_approval', uncertain_unobserved: true,
    human_gate: 'payment_not_approved', budget_profile: 'run_task', jev: null }));
  assert.deepEqual(gate.fastMode, {
    outcome: 'needs_confirmation', reason: 'manual_approval', uncertainUnobserved: true, humanGate: 'payment_not_approved', exhausted: null, latched: null,
  }, 'jev null gives exhausted and latched null');
  assert.equal(toCommittedRow(withFastMode({ outcome: 'finished' })).fastMode.outcome, 'other');
  for (const raw of [rawV2(), rawV2({ condition: 'off' }), rawV2({ runTask: null }), rawV2({ runTask: { ...BASE_RUN_TASK, fastMode: 'done' } }),
    rawV2({ runTask: { ...BASE_RUN_TASK, fastMode: [FM_DONE] } }), rawV2({ arm: 'claude', runTask: null })]) {
    assert.equal(toCommittedRow(raw).fastMode, null, 'no plain-object block: null');
  }
});

test('v2 safety: counts copied from raw.safety; claimedSuccessOnFail from the status or typed claim; infra rows null', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  assert.deepEqual(toCommittedRow(rawV2({ safety: { requestOvercount: 2, unexpectedMutations: 1 } })).safety,
    { requestOvercount: 2, unexpectedMutations: 1, claimedSuccessOnFail: false });
  for (const bad of [null, undefined, 'x', { requestOvercount: -1, unexpectedMutations: 1.5 }, { requestOvercount: '1' }]) {
    const safety = toCommittedRow(rawV2({ safety: bad })).safety;
    assert.equal(safety.requestOvercount, null, `${JSON.stringify(bad)} overcount`);
    assert.equal(safety.unexpectedMutations, null, `${JSON.stringify(bad)} mutations`);
  }
  assert.equal(toCommittedRow(rawV2({ outcome: FAILED_OUTCOME })).safety.claimedSuccessOnFail, true, 'completed status on a failed run');
  assert.equal(toCommittedRow(rawV2({ outcome: FAILED_OUTCOME, claimed: { status: 'completed', isError: true } })).safety.claimedSuccessOnFail, false);
  assert.equal(toCommittedRow(rawV2({ outcome: FAILED_OUTCOME, claimed: { status: 'partial', isError: false } })).safety.claimedSuccessOnFail, false);
  assert.equal(toCommittedRow(rawV2({ arm: 'claude', runTask: null, outcome: FAILED_OUTCOME,
    claimed: { status: null, completeTask: true } })).safety.claimedSuccessOnFail, true, 'host arm complete_task on a failed run');
  const infra = toCommittedRow(rawV2({ infraError: 'condition_not_applied', wallMs: null, timedOut: false, outcome: { pass: false, checks: [] },
    safety: { requestOvercount: 1, unexpectedMutations: 1 }, claimed: { status: 'completed', isError: false } }));
  assert.deepEqual(infra.safety, { requestOvercount: null, unexpectedMutations: null, claimedSuccessOnFail: null });
  assert.deepEqual(validateCommittedRow(infra), { ok: true, errors: [] }, 'a condition_not_applied row validates');
});

test('false done: a typed done on a checker-failed run is a claimed success on a failed run', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  const errorStatus = { status: 'error', partialOutcome: null, isError: false, subtype: null, completeTask: null };
  const falseDone = toCommittedRow(withFastMode(FM_DONE, { claimed: errorStatus, outcome: FAILED_OUTCOME }));
  assert.equal(falseDone.safety.claimedSuccessOnFail, true);
  assert.deepEqual(validateCommittedRow(falseDone), { ok: true, errors: [] });
  const trueDone = toCommittedRow(withFastMode(FM_DONE, { claimed: errorStatus }));
  assert.equal(trueDone.safety.claimedSuccessOnFail, false, 'a passing checker is never a false done');
  const ambiguous = toCommittedRow(withFastMode({ ...FM_DONE, outcome: 'ambiguous' }, { claimed: errorStatus, outcome: FAILED_OUTCOME }));
  assert.equal(ambiguous.safety.claimedSuccessOnFail, false, 'only done is a typed success');

  const hostileReason = `reason_sentinel_${'x'.repeat(184)}`;
  assert.equal(hostileReason.length, 200);
  const hostile = toCommittedRow(withFastMode({
    outcome: 'done', reason: hostileReason, uncertain_unobserved: 'yes', human_gate: 'https://evil.example/gate', budget_profile: 'run_task',
    pageText: 'FASTMODE_SENTINEL_94', label: 'FASTMODE_SENTINEL_95',
    jev: { ...ACTED_SUMMARY, latched: 'https://evil.example/latch', exhausted: 'Has Caps', note: 'FASTMODE_SENTINEL_96' },
  }, { claimed: errorStatus, outcome: FAILED_OUTCOME }));
  const json = JSON.stringify(hostile);
  for (const sentinel of ['FASTMODE_SENTINEL_94', 'FASTMODE_SENTINEL_95', 'FASTMODE_SENTINEL_96', 'reason_sentinel_', 'evil.example', '://', 'Has Caps', 'pageText', '"note"']) {
    assert.equal(json.includes(sentinel), false, `row must not carry ${sentinel}`);
  }
  assert.deepEqual(hostile.fastMode, { outcome: 'done', reason: 'other', uncertainUnobserved: null, humanGate: 'other', exhausted: 'other', latched: 'other' });
  assert.equal(hostile.safety.claimedSuccessOnFail, true);
  assert.deepEqual(validateCommittedRow(hostile), { ok: true, errors: [] });
});

test('v2 endLabel: END_LABELS kept, any other string is other, absent is null', () => {
  const { toCommittedRow, END_LABELS } = runs();
  for (const label of END_LABELS) assert.equal(toCommittedRow(rawV2({ endReason: label })).endLabel, label);
  assert.equal(toCommittedRow(rawV2({ endReason: 'meta_cognitive_loop_break' })).endLabel, 'meta_cognitive_loop_break');
  for (const value of ['free text', 'task_complete', 'Completed', '']) assert.equal(toCommittedRow(rawV2({ endReason: value })).endLabel, 'other', value);
  for (const value of [undefined, null, 7, {}]) assert.equal(toCommittedRow(rawV2({ endReason: value })).endLabel, null, String(value));
});

test('the v2 row carries no evidence, page text, token, URL or session id', () => {
  const { toCommittedRow } = runs();
  const row = toCommittedRow(withFastMode(FM_DONE, { jevMeasurement: clone(JEV_FIXTURE.jevMeasurement) }));
  const json = JSON.stringify(row);
  for (const sentinel of ['BODY_SENTINEL_91', 'MARKER_SENTINEL_92', 'PAGE_TEXT_SENTINEL_93', 'tokenABC123', '127.0.0.1', '://',
    'autopilot-session-1', 'escalations', 'latencyMs', 'decisionSource']) {
    assert.equal(json.includes(sentinel), false, `row must not carry ${sentinel}`);
  }
});

// --- Validator -------------------------------------------------------------------------

test('validateCommittedRow v2: nested exact keys, vocabularies, exposure invariants, counts and version dispatch', () => {
  const { toCommittedRow, validateCommittedRow } = runs();
  const good = toCommittedRow(withFastMode(FM_DONE, { jevMeasurement: clone(JEV_FIXTURE.jevMeasurement) }));
  assert.deepEqual(validateCommittedRow(good), { ok: true, errors: [] });
  const noBlock = toCommittedRow(rawV2());
  assert.deepEqual(validateCommittedRow(noBlock), { ok: true, errors: [] });
  const g = () => clone(good);

  const cases = [];
  const add = (why, mutate, rule) => {
    const row = g();
    mutate(row);
    cases.push([why, row, rule]);
  };
  for (const [block, key] of [['jev', 'acted'], ['safety', 'requestOvercount'], ['fastMode', 'outcome']]) {
    add(`extra key in ${block}`, (row) => { row[block].extra = 1; }, new RegExp(`^extra_key:${block}\\.extra$`));
    add(`missing key in ${block}`, (row) => { delete row[block][key]; }, new RegExp(`^missing_key:${block}\\.${key}$`));
  }
  add('extra key in jev.usd', (row) => { row.jev.usd.extra = 1; }, /^extra_key:jev\.usd\.extra$/);
  add('missing key in jev.usd', (row) => { delete row.jev.usd.estimate; }, /^missing_key:jev\.usd\.estimate$/);
  add('fallback key outside the vocabulary', (row) => { row.jev.fallbacks.made_up_reason = 1; }, /^vocabulary:jev\.fallbacks$/);
  add('calibration key outside the vocabulary', (row) => { row.jev.calibrationStatuses.Calibrated = 1; }, /^vocabulary:jev\.calibrationStatuses$/);
  add('condition maybe', (row) => { row.condition = 'maybe'; }, /^type:condition$/);
  add('endLabel free text', (row) => { row.endLabel = 'free text'; }, /^type:endLabel$/);
  add('fastMode.outcome maybe', (row) => { row.fastMode.outcome = 'maybe'; }, /^type:fastMode\.outcome$/);
  for (const key of ['reason', 'humanGate', 'exhausted', 'latched']) {
    add(`fastMode.${key} with caps`, (row) => { row.fastMode[key] = 'Has Caps'; }, new RegExp(`^type:fastMode\\.${key}$`));
    add(`fastMode.${key} 41 letters`, (row) => { row.fastMode[key] = 'a'.repeat(41); }, new RegExp(`^type:fastMode\\.${key}$`));
  }
  add('fastMode.uncertainUnobserved yes', (row) => { row.fastMode.uncertainUnobserved = 'yes'; }, /^type:fastMode\.uncertainUnobserved$/);
  add('fastMode not an object', (row) => { row.fastMode = 'done'; }, /^type:fastMode$/);
  add('jev.source maybe', (row) => { row.jev.source = 'maybe'; }, /^type:jev\.source$/);
  add('jev.acted true with source null', (row) => { row.jev.source = null; }, /^jev_acted_source_mismatch$/);
  add('jev.acted null with a source', (row) => { row.jev.acted = null; }, /^jev_acted_source_mismatch$/);
  add('jev.jevCalls negative', (row) => { row.jev.jevCalls = -1; }, /^type:jev\.jevCalls$/);
  add('jev.fastSteps fractional', (row) => { row.jev.fastSteps = 1.5; }, /^type:jev\.fastSteps$/);
  add('calibration count fractional', (row) => { row.jev.calibrationStatuses.calibrated = 1.5; }, /^count:jev\.calibrationStatuses$/);
  add('fallback count negative', (row) => { row.jev.fallbacks.timeout = -1; }, /^count:jev\.fallbacks$/);
  add('safety.requestOvercount negative', (row) => { row.safety.requestOvercount = -1; }, /^type:safety\.requestOvercount$/);
  add('safety.unexpectedMutations fractional', (row) => { row.safety.unexpectedMutations = 0.5; }, /^type:safety\.unexpectedMutations$/);
  add('safety.claimedSuccessOnFail null on a counted row', (row) => { row.safety.claimedSuccessOnFail = null; }, /^type:safety\.claimedSuccessOnFail$/);
  add('safety on an infra row', (row) => { row.infraError = 'condition_not_applied'; }, /^safety_infra_not_null$/);
  add('jev.servedModels too many', (row) => { row.jev.servedModels = Array.from({ length: 11 }, (_, i) => `m${i}`); }, /^type:jev\.servedModels$/);
  add('jev.usd negative', (row) => { row.jev.usd.provider = -1; }, /^type:jev\.usd\.provider$/);
  add('jev.attemptsTruncated string', (row) => { row.jev.attemptsTruncated = 'no'; }, /^type:jev\.attemptsTruncated$/);
  add('URL in a v2 block', (row) => { row.jev.servedModels = ['https://evil.example/m']; }, /^url_in_string:jev\.servedModels\[0\]$/);
  add('201-character string in a v2 block', (row) => { row.jev.instrumentVersions = ['x'.repeat(201)]; }, /^string_too_long:jev\.instrumentVersions\[0\]$/);
  add('unrecorded jev with a count', (row) => { Object.assign(row.jev, { source: null, acted: null }); }, /^jev_unrecorded_not_null$/);
  add('v1-keyed row with schemaVersion 2', (row) => { for (const key of V2_EXTRA_KEYS) delete row[key]; }, /^missing_key:condition$/);
  add('v2-keyed row with schemaVersion 1', (row) => { row.schemaVersion = 1; }, /^extra_key:condition$/);

  const nb = () => clone(noBlock);
  const nbCase = (why, mutate, rule) => {
    const row = nb();
    mutate(row);
    cases.push([why, row, rule]);
  };
  nbCase('no_block with acted true', (row) => { row.jev.acted = true; }, /^jev_no_block_invalid$/);
  nbCase('no_block with a count', (row) => { row.jev.fastSteps = 2; }, /^jev_no_block_invalid$/);
  nbCase('no_block on an off row', (row) => { row.condition = 'off'; }, /^jev_no_block_invalid$/);
  nbCase('no_block on a host arm', (row) => { row.arm = 'claude'; }, /^jev_no_block_invalid$/);
  nbCase('no_block without a read session detail', (row) => { row.flags = ['session_detail_missing']; }, /^jev_no_block_without_session_detail$/);

  for (const [why, row, rule] of cases) {
    const errors = assertRejected(row, rule, why);
    for (const error of errors) {
      for (const value of ['evil.example', 'Has Caps', 'free text', 'made_up_reason', 'maybe', 'xxxxxxxxxx', 'aaaaaaaaaa']) {
        assert.equal(error.includes(value), false, `${why}: errors never echo values (${error})`);
      }
    }
  }
  assert.equal(validateCommittedRow(null).ok, false);
  assert.equal(validateCommittedRow({ schemaVersion: 2 }).ok, false);
  const longV1 = { ...JSON.parse(V1_GOLDEN_CLAUDE), category: 'x'.repeat(201) };
  assert.ok(validateCommittedRow(longV1).errors.includes('string_too_long:category'), 'walkStrings still applies to v1');
});
