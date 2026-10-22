// Phase 66 benchmark runner and report (D-06, D-15, D-16, D-17, D-18, D-20,
// D-21, W3, W4, W6, W9, W-A, W-B, B-TIMEOUT).
//
// Runner part: the seeded ABBA schedule, sanitized run rows, infra
// classification, the bench safety gate, and the run-bench CLI (argument
// validation, dry run, preflight, pause and resume) driven through injected
// fakes. Nothing here starts an MCP server, a browser or a host CLI, and
// nothing touches port 7225 or the repo's .local and results trees.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { splitNdjson, summarizeClaudeStream } from '../scripts/bench/lib/host-stream.mjs';
import { WEB_STORE_EXTENSION_ID } from '../scripts/bench/lib/identity.mjs';
import {
  INFRA_CODES,
  PAUSING_INFRA_CODES,
  RUN_FLAGS,
  RUN_ROW_KEYS,
  buildSchedule,
  classifyInfra,
  evaluateBenchSafety,
  pauseDecision,
  sessionDetailFlags,
  toCommittedRow,
  validateCommittedRow,
} from '../scripts/bench/lib/runs.mjs';
import { createRunExecutor, main, runCampaignLoop } from '../scripts/bench/run-bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_BENCH = path.join(ROOT, 'scripts', 'bench', 'run-bench.mjs');
const BENCH_FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'bench');
const SAMPLE_TASKS = path.join(BENCH_FIXTURES, 'tasks-sample', 'tasks');
const SAMPLE_FIXTURES = path.join(BENCH_FIXTURES, 'tasks-sample', 'fixtures');
const SAMPLE_TASK = JSON.parse(fs.readFileSync(path.join(SAMPLE_TASKS, 'core', 'core-sample-save.json'), 'utf8'));
const CASES = JSON.parse(fs.readFileSync(path.join(BENCH_FIXTURES, 'infra-classification-cases.json'), 'utf8'));
const PROVIDER_ERROR = JSON.parse(fs.readFileSync(path.join(BENCH_FIXTURES, 'run-task-provider-error.json'), 'utf8'));
const VALID_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const HEX64 = 'c'.repeat(64);

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fsb-bench-report-${label}-`));
}

function runCli(args) {
  const result = spawnSync(process.execPath, [RUN_BENCH, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}` };
}

function capture() {
  const out = [];
  const err = [];
  return {
    stdout: (text) => { out.push(String(text)); },
    stderr: (text) => { err.push(String(text)); },
    text: () => `${out.join('')}\n${err.join('')}`,
    out: () => out.join(''),
  };
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

// --- Contract constants ---------------------------------------------------------

test('RUN_ROW_KEYS, INFRA_CODES and PAUSING_INFRA_CODES match the run row contract', () => {
  assert.deepEqual([...RUN_ROW_KEYS], [
    'schemaVersion', 'campaignId', 'runId', 'attempts', 'set', 'taskId', 'taskVersion', 'category', 'fixtureSha256',
    'arm', 'round', 'order', 'startedAt', 'wallMs', 'wallFromInitMs', 'pass', 'timedOut', 'checks', 'infraError',
    'claimed', 'fsb', 'host', 'cost', 'provider', 'flags',
  ]);
  assert.deepEqual([...INFRA_CODES].sort(), [
    'agent_auth', 'agent_cap', 'claude_no_init', 'condition_not_applied', 'extension_not_connected', 'fsb_agent_cap', 'host_api_error',
    'host_no_result', 'hub_lost', 'mcp_session_not_found_no_calls', 'provider_error', 'spawn_failed',
  ]);
  assert.deepEqual([...PAUSING_INFRA_CODES], ['agent_cap', 'agent_auth', 'provider_error', 'condition_not_applied']);
  assert.deepEqual([...RUN_FLAGS].sort(), [
    'experimental_arm', 'idle_timeout_session', 'jev_measurement_missing', 'live_task', 'multiple_mcp_sessions', 'served_model_mismatch',
    'session_detail_missing',
  ]);
  for (const list of [RUN_ROW_KEYS, INFRA_CODES, PAUSING_INFRA_CODES, RUN_FLAGS]) assert.ok(Object.isFrozen(list));
});

// --- Schedule ---------------------------------------------------------------------

const TWELVE = Array.from({ length: 12 }, (_, i) => `core-task-${String(i + 1).padStart(2, '0')}`);

test('buildSchedule: 12 tasks x 10 rounds x 2 arms, each (round, task, arm) once, ABBA arm order', () => {
  const schedule = buildSchedule({ campaignId: 'core-20260930-abc1234', taskIds: TWELVE, rounds: 10, arms: ['autopilot', 'claude'], seed: 66 });
  assert.equal(schedule.length, 240);
  const seen = new Set(schedule.map((entry) => `${entry.round}|${entry.taskId}|${entry.arm}`));
  assert.equal(seen.size, 240);
  assert.deepEqual(schedule.map((entry) => entry.order), Array.from({ length: 240 }, (_, i) => i + 1));
  for (const entry of schedule) {
    assert.equal(entry.runId, `core-20260930-abc1234-r${entry.round}-${entry.taskId}-${entry.arm}`);
    assert.equal(entry.campaignId, 'core-20260930-abc1234');
  }
  for (let round = 1; round <= 10; round += 1) {
    const inRound = schedule.filter((entry) => entry.round === round);
    assert.equal(inRound.length, 24);
    for (let i = 0; i < inRound.length; i += 2) {
      assert.equal(inRound[i].taskId, inRound[i + 1].taskId, 'both arms run a task back to back');
      const expected = round % 2 === 1 ? ['autopilot', 'claude'] : ['claude', 'autopilot'];
      assert.deepEqual([inRound[i].arm, inRound[i + 1].arm], expected);
    }
  }
});

test('buildSchedule: the task order is a seeded permutation, stable per seed and different for seed 67', () => {
  const order = (seed) => buildSchedule({ campaignId: 'c-1', taskIds: TWELVE, rounds: 10, arms: ['autopilot', 'claude'], seed })
    .filter((entry) => entry.arm === 'autopilot').map((entry) => `${entry.round}:${entry.taskId}`);
  assert.deepEqual(order(66), order(66));
  assert.notDeepEqual(order(66), order(67));
  const round1 = buildSchedule({ campaignId: 'c-1', taskIds: TWELVE, rounds: 1, arms: ['autopilot'], seed: 66 }).map((e) => e.taskId);
  assert.deepEqual([...round1].sort(), TWELVE);
  assert.notDeepEqual(round1, TWELVE, 'the seeded shuffle actually permutes');
  const reversedInput = buildSchedule({ campaignId: 'c-1', taskIds: [...TWELVE].reverse(), rounds: 1, arms: ['autopilot'], seed: 66 }).map((e) => e.taskId);
  assert.deepEqual(reversedInput, round1, 'input order does not change the schedule');
  assert.throws(() => buildSchedule({ campaignId: '../x', taskIds: TWELVE, rounds: 1, arms: ['autopilot'], seed: 66 }), /campaignId/);
  assert.throws(() => buildSchedule({ campaignId: 'c', taskIds: TWELVE, rounds: 0, arms: ['autopilot'], seed: 66 }), /rounds/);
  assert.throws(() => buildSchedule({ campaignId: 'c', taskIds: TWELVE, rounds: 1, arms: ['autopilot', 'autopilot'], seed: 66 }), /arms/);
});

// --- Rows -------------------------------------------------------------------------

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

test('toCommittedRow keeps exactly RUN_ROW_KEYS and copies no evidence, page text, claim text or URL', () => {
  const row = toCommittedRow(rawRecord());
  assert.deepEqual(Object.keys(row), [...RUN_ROW_KEYS]);
  const json = JSON.stringify(row);
  for (const sentinel of ['BODY_SENTINEL_91', 'MARKER_SENTINEL_92', 'PAGE_TEXT_SENTINEL_93', '127.0.0.1', '://', 'tokenABC123', 'mcp-session-1']) {
    assert.equal(json.includes(sentinel), false, `row must not carry ${sentinel}`);
  }
  assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] });
  assert.equal(row.attempts, 1);
  assert.deepEqual(row.checks, [{ kind: 'request', pass: true }, { kind: 'marker', pass: true }]);
  assert.deepEqual(row.fsb.callIntervalMs, { median: 8600, p90: 10100, count: 6 }, 'W6: receive-to-receive call interval');
  assert.equal(row.fsb.kind, 'mcp');
  assert.equal(row.fsb.calls, 7);
  assert.equal(row.fsb.fsbMsMedian, 310);
  assert.equal(row.fsb.callerGapMsMedian, 8200);
  assert.equal(row.fsb.sessionMatch, 'unique');
  assert.equal(row.host.name, 'claude-code');
  assert.equal(row.host.toolLoading, 'eager');
  assert.equal(row.host.cacheReadTokens, 30000);
  assert.deepEqual(row.cost, { usd: 0.41, source: 'host', label: 'list-price estimate, not billed' });
  assert.deepEqual(row.claimed, { status: null, partialOutcome: null, isError: false, subtype: 'success', completeTask: true });
});

test('toCommittedRow for an autopilot run: provider-first cost, served-model match, null MCP interval fields', () => {
  const row = toCommittedRow(rawRecord({
    runId: 'cmp-rows-r1-core-sample-save-autopilot',
    arm: 'autopilot',
    order: 1,
    wallFromInitMs: null,
    measurement: AUTOPILOT_MEASUREMENT,
    sessions: [{ id: 'autopilot-session-1', measurement: AUTOPILOT_MEASUREMENT }],
    hostSummary: null,
    claimed: { status: 'completed', partialOutcome: null, isError: false, subtype: null, completeTask: null },
    runTask: { isError: false, status: 'completed', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task' },
  }));
  assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] });
  assert.deepEqual(row.fsb.callIntervalMs, { median: null, p90: null, count: null });
  assert.equal(row.fsb.kind, 'autopilot');
  assert.equal(row.fsb.iterations, 4);
  assert.equal(row.fsb.modelMsTotal, 9100);
  assert.equal(row.fsb.toolMsTotal, 1800);
  assert.equal(row.fsb.calls, 5);
  assert.equal(row.cost.usd, 0.0321);
  assert.equal(row.cost.source, 'provider');
  assert.match(row.cost.label, /provider/);
  assert.deepEqual(row.provider, { requestedModel: 'grok-4.3', servedModels: ['grok-4.3'], servedModelMatch: true });
  assert.equal(row.host.name, null);
  assert.equal(row.claimed.status, 'completed');
});

test('validateCommittedRow rejects extra and missing keys, URLs, long strings and unknown infra codes', () => {
  const good = toCommittedRow(rawRecord());
  assert.equal(validateCommittedRow(good).ok, true);

  const extra = { ...good, pageText: 'x' };
  assert.equal(validateCommittedRow(extra).ok, false);
  assert.ok(validateCommittedRow(extra).errors.some((error) => /extra/.test(error)));

  const missing = { ...good };
  delete missing.cost;
  assert.equal(validateCommittedRow(missing).ok, false);
  assert.ok(validateCommittedRow(missing).errors.some((error) => /missing/.test(error)));

  const url = { ...good, host: { ...good.host, model: 'https://example.invalid/model' } };
  assert.equal(validateCommittedRow(url).ok, false);
  assert.ok(validateCommittedRow(url).errors.some((error) => /url/.test(error)));

  const long = { ...good, category: 'x'.repeat(201) };
  assert.equal(validateCommittedRow(long).ok, false);
  assert.ok(validateCommittedRow(long).errors.some((error) => /too_long/.test(error)));

  const infra = { ...good, infraError: 'rate_limited_somehow' };
  assert.equal(validateCommittedRow(infra).ok, false);

  const nestedExtra = { ...good, fsb: { ...good.fsb, rawEvents: [] } };
  assert.equal(validateCommittedRow(nestedExtra).ok, false);
  const badFlag = { ...good, flags: ['page_text'] };
  assert.equal(validateCommittedRow(badFlag).ok, false);
  const zeroAttempts = { ...good, attempts: 0 };
  assert.equal(validateCommittedRow(zeroAttempts).ok, false);
  for (const error of validateCommittedRow(url).errors) assert.equal(error.includes('example.invalid'), false, 'errors never echo values');
});

// --- Infra classification (W4, W-A, B-TIMEOUT) --------------------------------------

function resolveCaseInput(input) {
  const resolved = { ...input };
  if (resolved.hostSummaryFromStream) {
    const text = fs.readFileSync(path.join(BENCH_FIXTURES, resolved.hostSummaryFromStream), 'utf8');
    resolved.hostSummary = summarizeClaudeStream(splitNdjson(text).events, { toolSearchEnv: 'unset' });
    delete resolved.hostSummaryFromStream;
  }
  if (resolved.taskJsonFromFixture) {
    resolved.taskJson = JSON.parse(fs.readFileSync(path.join(BENCH_FIXTURES, resolved.taskJsonFromFixture), 'utf8'));
    delete resolved.taskJsonFromFixture;
  }
  return resolved;
}

test('the classification case table is synthetic and covers the contract', () => {
  assert.match(CASES._fixture, /synthetic/);
  const names = CASES.cases.map((c) => c.name);
  for (const required of ['claude-usage-cap-stream', 'claude-auth', 'claude-api-error', 'claude-no-init',
    'autopilot-run-task-provider-error-fixture', 'autopilot-timeout-with-unrecorded-detail', 'autopilot-timeout-with-recorded-detail',
    'autopilot-timeout-missing-detail', 'negative-element-not-found-after-500-ms', 'negative-provider-page-did-not-load',
    'negative-status-less-500', 'autopilot-agent-cap-reached', 'autopilot-normal-failed-task']) {
    assert.ok(names.includes(required), `case ${required}`);
  }
  const expected = new Set(CASES.cases.map((c) => c.expected));
  // Phase 71: condition_not_applied is assigned by the runner when the
  // fast-mode switch is not confirmed before t0, never by classifyInfra.
  const runnerAssigned = ['condition_not_applied'];
  for (const code of runnerAssigned) assert.equal(expected.has(code), false, `no classification case expects ${code}`);
  for (const code of INFRA_CODES.filter((c) => !runnerAssigned.includes(c))) assert.ok(expected.has(code), `some case expects ${code}`);
  assert.ok(expected.has(null));
});

for (const { name, input, expected } of CASES.cases) {
  test(`classifyInfra: ${name} -> ${expected}`, () => {
    assert.equal(classifyInfra(resolveCaseInput(input)), expected);
  });
}

test('sessionDetailFlags flags a missing autopilot session detail only (B-TIMEOUT)', () => {
  assert.deepEqual(sessionDetailFlags({ arm: 'autopilot', sessionDetail: null }), ['session_detail_missing']);
  assert.deepEqual(sessionDetailFlags({ arm: 'autopilot', sessionDetail: { success: true } }), ['session_detail_missing']);
  assert.deepEqual(sessionDetailFlags({ arm: 'autopilot', sessionDetail: { session: {} } }), []);
  assert.deepEqual(sessionDetailFlags({ arm: 'claude', sessionDetail: null }), []);
});

test('pauseDecision: pausing codes stop at once, other codes on the second in a row, a clean run resets', () => {
  for (const code of PAUSING_INFRA_CODES) assert.deepEqual(pauseDecision(0, code), { pause: code, consecutiveOther: 0 });
  assert.deepEqual(pauseDecision(0, 'claude_no_init'), { pause: null, consecutiveOther: 1 });
  assert.deepEqual(pauseDecision(1, 'hub_lost'), { pause: 'hub_lost', consecutiveOther: 2 });
  assert.deepEqual(pauseDecision(1, null), { pause: null, consecutiveOther: 0 });
});

test('evaluateBenchSafety accepts only a strict true telemetry opt-out (W-B)', () => {
  assert.deepEqual(evaluateBenchSafety({ telemetryOptOut: true }), { ok: true, refusals: [] });
  const cases = [[false, 'false'], [undefined, 'absent'], [null, 'unverifiable'], ['true', 'unverifiable']];
  for (const [value, detail] of cases) {
    const result = evaluateBenchSafety({ telemetryOptOut: value });
    assert.equal(result.ok, false);
    assert.deepEqual(result.refusals, [{ code: 'telemetry_not_opted_out', detail }]);
  }
  assert.equal(evaluateBenchSafety({}).ok, false);
});

// --- CLI: dry run and argument validation (spawned; nothing live) -------------------

test('--dry-run with the sample set prints the schedule summary (1 task x 2 rounds x 2 arms = 4 runs)', () => {
  const result = runCli(['--dry-run', '--tasks-root', SAMPLE_TASKS, '--fixtures-root', SAMPLE_FIXTURES, '--rounds', '2',
    '--arms', 'autopilot,claude', '--claude-model', 'claude-model-fixture']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.stdout, /"runs":4/);
  const summary = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.equal(summary.runs, 4);
  assert.deepEqual(summary.arms, ['autopilot', 'claude']);
  assert.equal(summary.rounds, 2);
  assert.deepEqual(summary.tasks.map((t) => t.id), ['core-sample-save']);
  assert.match(summary.tasks[0].fixtureSha256, /^[0-9a-f]{64}$/);
  assert.match(summary.campaignId, /^core-\d{8}-[0-9a-f]{7,}$/);
});

test('--smoke with the claude arm and no --claude-model refuses before anything starts (exit 2)', () => {
  const result = runCli(['--smoke', '--arms', 'claude', '--tasks-root', SAMPLE_TASKS, '--fixtures-root', SAMPLE_FIXTURES]);
  assert.equal(result.status, 2, result.output);
  assert.match(result.output, /claude_model_required/);
  assert.match(result.output, /extension_id_invalid/, 'every failing code is listed at once');
});

test('an unknown flag exits 2 with usage text', () => {
  const result = runCli(['--dry-run', '--no-such-flag']);
  assert.equal(result.status, 2);
  assert.match(result.output, /unknown_flag/);
  assert.match(result.output, /usage: node scripts\/bench\/run-bench\.mjs/);
  assert.match(result.output, /--pair-via-cdp/);
});

test('--help prints usage including --pair-via-cdp and exits 0', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--pair-via-cdp/);
  assert.match(result.stdout, /--resume <campaignId>/);
});

for (const [label, idArgs] of [
  ['missing', []],
  ['malformed', ['--expect-extension-id', 'abc']],
  ['uppercase', ['--expect-extension-id', 'ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP']],
  ['the Web Store id', ['--expect-extension-id', WEB_STORE_EXTENSION_ID]],
]) {
  test(`W9: --smoke/--campaign/--pair-via-cdp refuse an ${label} extension id before anything else (exit 2)`, () => {
    for (const mode of [['--smoke'], ['--campaign'], ['--pair-via-cdp']]) {
      const result = runCli(['--dry-run', ...mode, ...idArgs, '--claude-model', 'm',
        '--tasks-root', SAMPLE_TASKS, '--fixtures-root', SAMPLE_FIXTURES]);
      assert.equal(result.status, 2, `${mode} ${result.output}`);
      assert.match(result.output, /extension_id_invalid/);
    }
  });
}

test('W9: a valid 32-letter id passes validation (the dry run then prints the smoke schedule)', () => {
  const result = runCli(['--dry-run', '--smoke', '--expect-extension-id', VALID_EXTENSION_ID, '--claude-model', 'm',
    '--tasks-root', SAMPLE_TASKS, '--fixtures-root', SAMPLE_FIXTURES]);
  assert.equal(result.status, 0, result.output);
  const summary = JSON.parse(result.stdout.trim().split('\n').pop());
  assert.equal(summary.mode, 'smoke');
  assert.equal(summary.rounds, 1, 'a smoke defaults to one round');
  assert.equal(summary.runs, 2, 'every task in the set x 1 round x 2 arms');
});

// --- In-process runner with injected dependencies ------------------------------------

function spy(label, calls, impl) {
  return (...args) => {
    calls.push(label);
    if (impl) return impl(...args);
    throw new Error(`${label} must not be called`);
  };
}

const CONFIG_PAYLOAD = Object.freeze({
  success: true,
  config: { providerKind: 'api', modelProvider: 'xai', modelName: 'grok-4.3' },
  extension: { id: VALID_EXTENSION_ID, version: '0.9.91', measurement: { callTiming: 1, sessionDetailJournal: 1 } },
});

function liveDeps(overrides = {}) {
  const calls = [];
  const localRoot = tempDir('local');
  const resultsRoot = tempDir('results');
  const out = capture();
  let closed = false;
  const deps = {
    calls,
    localRoot,
    resultsRoot,
    out,
    wasClosed: () => closed,
    installSignalHandlers: false,
    stdout: out.stdout,
    stderr: out.stderr,
    sleep: async () => {},
    openRunnerClient: spy('openRunnerClient', calls, async () => ({
      client: { fake: true },
      transport: { pid: 4242 },
      sdkVersion: '1.29.0',
      close: async () => { closed = true; },
    })),
    collectServerIdentity: spy('collectServerIdentity', calls, async () => ({
      serverVersion: { name: 'fsb-mcp-server', version: '0.11.0' }, sdkVersion: '1.29.0', serverPid: 4242,
      toolsList: { count: 60, sha256: 'b'.repeat(64) },
    })),
    readFsbConfig: spy('readFsbConfig', calls, async () => ({ ok: true, payload: CONFIG_PAYLOAD })),
    gitIdentity: spy('gitIdentity', calls, () => ({ sha: 'a'.repeat(40), dirty: false, dirtyPaths: [] })),
    hubListenerPid: spy('hubListenerPid', calls, () => 4242),
    readDevToolsPort: spy('readDevToolsPort', calls, async () => 9222),
    readExtensionStorageFlag: spy('readExtensionStorageFlag', calls, async () => true),
    browserVersion: spy('browserVersion', calls, async () => ({ browser: 'Chrome/146.0.7680.0', protocolVersion: '1.3' })),
    claudeVersion: spy('claudeVersion', calls, () => '2.1.283 (Claude Code)'),
    cursorVersion: spy('cursorVersion', calls, () => null),
    loadProviderKeyNames: spy('loadProviderKeyNames', calls, async () => ['XAI_API_KEY', 'ANTHROPIC_API_KEY']),
    readPairingCode: spy('readPairingCode', calls),
    pairExtensionViaCdp: spy('pairExtensionViaCdp', calls),
    startFixtureServer: spy('startFixtureServer', calls),
    // Phase 71: only --conditions writes or reads the fast-mode switch.
    writeSetting: spy('writeSetting', calls),
    readSetting: spy('readSetting', calls),
    ...overrides,
  };
  deps.cleanup = () => {
    fs.rmSync(localRoot, { recursive: true, force: true });
    fs.rmSync(resultsRoot, { recursive: true, force: true });
  };
  return deps;
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

test('argument validation fires before any dependency is touched (W9, in process)', async () => {
  const deps = liveDeps();
  try {
    const code = await main(['--smoke', '--pair-via-cdp', '--expect-extension-id', WEB_STORE_EXTENSION_ID, '--claude-model', 'm',
      '--tasks-root', SAMPLE_TASKS, '--fixtures-root', SAMPLE_FIXTURES], deps);
    assert.equal(code, 2);
    assert.deepEqual(deps.calls, []);
    assert.match(deps.out.text(), /extension_id_invalid/);
  } finally {
    deps.cleanup();
  }
});

test('the preflight refuses with telemetry_not_opted_out when the bench extension flag is not true (W-B)', async () => {
  for (const flag of [false, null]) {
    const deps = liveDeps({ readExtensionStorageFlag: async () => flag });
    try {
      const code = await main(['--smoke', '--arms', 'autopilot', '--expect-extension-id', VALID_EXTENSION_ID,
        '--chrome-profile', deps.localRoot, '--tasks-root', SAMPLE_TASKS, '--fixtures-root', SAMPLE_FIXTURES,
        '--campaign-id', 'smoke-telemetry-test'], deps);
      assert.equal(code, 2);
      assert.match(deps.out.text(), /telemetry_not_opted_out/);
      assert.equal(deps.calls.includes('startFixtureServer'), false, 'no run is scheduled');
      assert.deepEqual([...filesUnder(deps.localRoot), ...filesUnder(deps.resultsRoot)].filter((f) => f.endsWith('identity.json')), []);
      assert.equal(deps.wasClosed(), true, 'the runner client is closed');
    } finally {
      deps.cleanup();
    }
  }
});

test('--preflight prints a secret-free identity summary with telemetryOptOut true and writes no identity.json', async () => {
  const deps = liveDeps();
  try {
    const code = await main(['--preflight', '--arms', 'autopilot,claude', '--claude-model', 'claude-model-fixture',
      '--expect-extension-id', VALID_EXTENSION_ID, '--chrome-profile', deps.localRoot], deps);
    assert.equal(code, 0, deps.out.text());
    const summary = JSON.parse(deps.out.out());
    assert.equal(summary.ok, true);
    assert.equal(summary.identity.extension.telemetryOptOut, true);
    assert.equal(summary.identity.extension.id, VALID_EXTENSION_ID);
    assert.equal(summary.identity.provider.requestedModel, 'grok-4.3');
    assert.equal(summary.identity.hosts.claude.model, 'claude-model-fixture');
    assert.match(summary.identity.hosts.claude.envKeyNamesSha256, /^[0-9a-f]{64}$/);
    assert.ok(Array.isArray(summary.identity.hosts.claude.envKeyNames));
    assert.equal(summary.hub.owned, true);
    assert.equal(JSON.stringify(summary).includes('://'), false);
    assert.equal(filesUnder(deps.localRoot).some((f) => f.endsWith('identity.json')), false);
  } finally {
    deps.cleanup();
  }
});

test('--preflight lists every evaluatePreflight refusal (for example a hub it does not own)', async () => {
  const deps = liveDeps({ hubListenerPid: () => 999 });
  try {
    const code = await main(['--preflight', '--arms', 'autopilot', '--expect-extension-id', VALID_EXTENSION_ID,
      '--chrome-profile', deps.localRoot], deps);
    assert.equal(code, 2);
    assert.match(deps.out.text(), /hub_not_owned/);
  } finally {
    deps.cleanup();
  }
});

test('--pair-via-cdp delivers the pair --json code in process and never prints it (B2)', async () => {
  const code = `fsb-auth.RUNNER_PAIR_SENTINEL_${'z'.repeat(22)}`;
  let delivered = null;
  const deps = liveDeps({
    readPairingCode: async () => code,
    pairExtensionViaCdp: async (port, id, value) => { delivered = { port, id, value }; return { ok: true, reason: null, pairingStatus: 'paired' }; },
  });
  try {
    const exit = await main(['--preflight', '--pair-via-cdp', '--arms', 'autopilot', '--expect-extension-id', VALID_EXTENSION_ID,
      '--chrome-profile', deps.localRoot], deps);
    assert.equal(exit, 0, deps.out.text());
    assert.deepEqual(delivered, { port: 9222, id: VALID_EXTENSION_ID, value: code });
    assert.equal(deps.out.text().includes('RUNNER_PAIR_SENTINEL'), false);
  } finally {
    deps.cleanup();
  }
  const failing = liveDeps({
    readPairingCode: async () => code,
    pairExtensionViaCdp: async () => ({ ok: false, reason: 'service_worker_unreachable' }),
  });
  try {
    const exit = await main(['--preflight', '--pair-via-cdp', '--arms', 'autopilot', '--expect-extension-id', VALID_EXTENSION_ID,
      '--chrome-profile', failing.localRoot], failing);
    assert.equal(exit, 2);
    assert.match(failing.out.text(), /pairing_failed/);
    assert.match(failing.out.text(), /service_worker_unreachable/);
    assert.equal(failing.out.text().includes('RUNNER_PAIR_SENTINEL'), false);
  } finally {
    failing.cleanup();
  }
});

test('run-bench.mjs and cdp.mjs never print the pairing code (B2 source check)', () => {
  for (const file of ['scripts/bench/lib/cdp.mjs', 'scripts/bench/run-bench.mjs']) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(/console\.(log|error|warn|info)\([^)]*(pairingCode|fsb-auth\.)/.test(source), false, file);
    assert.equal(/process\.(stdout|stderr)\.write\([^)]*pairingCode/.test(source), false, file);
  }
});

// --- Executor and loop with fake arms (W4, W6, D-20) ------------------------------------

const LOOP_TASK_IDS = ['core-sample-a', 'core-sample-b', 'core-sample-c'];

function loopHarness({ campaignId, script }) {
  const dir = tempDir('loop');
  const rawDir = path.join(dir, 'local', campaignId, 'runs');
  const outDir = path.join(dir, 'results', campaignId);
  const progressPath = path.join(dir, 'local', campaignId, 'progress.json');
  const tasks = LOOP_TASK_IDS.map((id) => ({ ...SAMPLE_TASK, id }));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const fixtureSha256ById = new Map(tasks.map((task) => [task.id, HEX64]));
  let tokenCounter = 0;
  const fixtureServer = {
    newRunToken: () => `tokenLoop${String(++tokenCounter).padStart(4, '0')}`,
    runUrl: (token, startPath) => `http://127.0.0.1:5555/r/${token}${startPath}`,
    evidence: () => ({ requests: [], dropped: 0 }),
    clear: () => {},
  };
  const attemptsSeen = [];
  const outcomeFor = (entry, attempt) => {
    const planned = script[entry.runId];
    if (!planned) return 'ok';
    return planned[Math.min(attempt, planned.length) - 1];
  };
  const arms = {
    autopilot: async ({ entry, attempt }) => {
      attemptsSeen.push(`${entry.runId}#${attempt}`);
      const kind = outcomeFor(entry, attempt);
      const t0 = Date.now();
      return {
        t0, t1: t0 + 1200, timedOut: false, aborted: false, startFailed: false,
        runTask: { isError: false, status: kind === 'ok' ? 'completed' : 'error', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task' },
        taskJson: null,
        errorText: kind === 'provider' ? 'API call failed: PROVIDER_LOOP_SENTINEL_44' : kind === 'offline' ? 'Extension WebSocket not connected' : null,
        sessionId: `autopilot-${entry.runId}`,
        sessionDetail: { success: true, session: { id: `autopilot-${entry.runId}`, error: kind === 'provider' ? 'API call failed: PROVIDER_LOOP_SENTINEL_44' : null, measurement: AUTOPILOT_MEASUREMENT } },
      };
    },
    claude: async ({ entry, attempt }) => {
      attemptsSeen.push(`${entry.runId}#${attempt}`);
      const kind = outcomeFor(entry, attempt);
      const t0 = Date.now();
      let hostSummary = CLAUDE_OK_SUMMARY;
      if (kind === 'cap') hostSummary = { ...CLAUDE_OK_SUMMARY, rateLimit: { events: 1, limited: true, statuses: ['rejected'] }, errorKind: 'usage_limit' };
      if (kind === 'no_init') hostSummary = { ...CLAUDE_OK_SUMMARY, init: { ...CLAUDE_OK_SUMMARY.init, present: false } };
      return {
        t0, initAt: t0 + 300, t1: t0 + 61000, exitedAt: t0 + 61100, timedOut: false, aborted: false, spawnError: null,
        hostSummary, envKeyNamesSha256: HEX64, rawStreamPath: null,
        sessions: [{ id: `mcp-${entry.runId}`, detail: { success: true, session: { id: `mcp-${entry.runId}`, measurement: MCP_MEASUREMENT } } }],
        sessionMatch: 'unique',
      };
    },
  };
  const collectEvidence = async ({ task, token }) => ({
    requests: [{ t: 1, method: 'POST', path: '/api/sample/save', query: {}, bodyType: 'json', body: { value: 'alpha' } }],
    finalUrl: `http://127.0.0.1:5555/r/${token}${task.startPath}?view=saved`,
    markers: { 'saved-value': 'alpha' },
    text: null,
    targetIds: [],
  });
  const executeRun = createRunExecutor({
    campaignId, tasksById, fixtureSha256ById, fixtureServer, cdpPort: null, arms, collectEvidence,
    cleanup: async () => {}, streamsDir: path.join(dir, 'local', campaignId, 'streams'),
  });
  const schedule = buildSchedule({ campaignId, taskIds: LOOP_TASK_IDS, rounds: 2, arms: ['autopilot', 'claude'], seed: 66 });
  const out = capture();
  const loop = () => runCampaignLoop({
    schedule, campaignId, rawDir, outDir, progressPath, executeRun,
    resumeCommand: `node scripts/bench/run-bench.mjs --campaign --resume ${campaignId}`,
    stdout: out.stdout, stderr: out.stderr, cooldownMs: 0, sleep: async () => {}, isStopping: () => false,
  });
  return { dir, rawDir, outDir, progressPath, schedule, attemptsSeen, out, loop, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the first agent_cap pauses the campaign with exit 75 and a --resume hint; --resume re-runs only infra-failed runIds', async () => {
  const campaignId = 'cmp-pause-cap';
  const schedule = buildSchedule({ campaignId, taskIds: LOOP_TASK_IDS, rounds: 2, arms: ['autopilot', 'claude'], seed: 66 });
  const capped = schedule[3].runId;
  assert.match(capped, /-claude$/);
  const harness = loopHarness({ campaignId, script: { [capped]: ['cap', 'ok'] } });
  try {
    const first = await harness.loop();
    assert.equal(first.exitCode, 75);
    assert.equal(first.paused, 'agent_cap');
    assert.match(harness.out.text(), /agent_cap/);
    assert.match(harness.out.text(), /--resume cmp-pause-cap/);
    let rows = readJsonl(path.join(harness.outDir, 'runs.jsonl'));
    assert.equal(rows.length, 4, 'every finished run is saved immediately, including the capped one');
    assert.equal(rows.find((row) => row.runId === capped).infraError, 'agent_cap');

    const second = await harness.loop();
    assert.equal(second.exitCode, 0, harness.out.text());
    rows = readJsonl(path.join(harness.outDir, 'runs.jsonl'));
    assert.equal(rows.length, 12);
    assert.equal(new Set(rows.map((row) => row.runId)).size, 12, 'exactly one row per runId');
    const cappedRow = rows.find((row) => row.runId === capped);
    assert.equal(cappedRow.infraError, null);
    assert.equal(cappedRow.attempts, 2);
    for (const row of rows) {
      assert.equal(validateCommittedRow(row).ok, true);
      assert.ok(row.attempts >= 1);
      if (row.runId !== capped) assert.equal(row.attempts, 1);
    }
    assert.equal(harness.attemptsSeen.filter((seen) => seen.startsWith(schedule[0].runId)).length, 1, 'clean runs are skipped on resume');
    assert.ok(harness.attemptsSeen.includes(`${capped}#2`));
    assert.ok(fs.existsSync(path.join(harness.rawDir, `${capped}.attempt1.json`)), 'the superseded attempt is archived');
    assert.equal(JSON.parse(fs.readFileSync(path.join(harness.rawDir, `${capped}.json`), 'utf8')).attempt, 2);
    const progress = JSON.parse(fs.readFileSync(harness.progressPath, 'utf8'));
    assert.equal(progress.status, 'complete');
  } finally {
    harness.cleanup();
  }
});

test('a provider_error pauses at once; two consecutive other infra errors also pause; one alone does not', async () => {
  const campaignId = 'cmp-pause-other';
  const schedule = buildSchedule({ campaignId, taskIds: LOOP_TASK_IDS, rounds: 2, arms: ['autopilot', 'claude'], seed: 66 });
  const provider = loopHarness({ campaignId, script: { [schedule[0].runId]: ['provider'] } });
  try {
    const result = await provider.loop();
    assert.equal(result.exitCode, 75);
    assert.equal(result.paused, 'provider_error');
    assert.equal(provider.out.text().includes('PROVIDER_LOOP_SENTINEL_44'), false, 'pauses never print error text');
    const raw = fs.readFileSync(path.join(provider.rawDir, `${schedule[0].runId}.json`), 'utf8');
    assert.equal(raw.includes('PROVIDER_LOOP_SENTINEL_44'), false, 'error text is never stored');
  } finally {
    provider.cleanup();
  }

  const twice = loopHarness({ campaignId, script: { [schedule[0].runId]: ['offline'], [schedule[1].runId]: ['no_init'] } });
  try {
    const result = await twice.loop();
    assert.equal(result.exitCode, 75);
    assert.equal(result.paused, 'claude_no_init');
    const rows = readJsonl(path.join(twice.outDir, 'runs.jsonl'));
    assert.deepEqual(rows.map((row) => row.infraError), ['extension_not_connected', 'claude_no_init']);
  } finally {
    twice.cleanup();
  }

  const once = loopHarness({ campaignId, script: { [schedule[0].runId]: ['offline'] } });
  try {
    const result = await once.loop();
    assert.equal(result.exitCode, 0);
    const rows = readJsonl(path.join(once.outDir, 'runs.jsonl'));
    assert.equal(rows.length, 12);
    assert.equal(rows.filter((row) => row.infraError !== null).length, 1);
  } finally {
    once.cleanup();
  }
});

test('rows from the executor carry fsb.callIntervalMs from the MCP measurement and null interval fields for autopilot (W6)', async () => {
  const harness = loopHarness({ campaignId: 'cmp-rows-w6', script: {} });
  try {
    const result = await harness.loop();
    assert.equal(result.exitCode, 0);
    const rows = readJsonl(path.join(harness.outDir, 'runs.jsonl'));
    assert.deepEqual(rows.map((row) => row.order), Array.from({ length: 12 }, (_, i) => i + 1), 'rows follow schedule order');
    for (const row of rows) {
      assert.equal(row.pass, true, 'the fake evidence satisfies the sample checks');
      if (row.arm === 'claude') {
        assert.deepEqual(row.fsb.callIntervalMs, { median: 8600, p90: 10100, count: 6 });
        assert.equal(row.wallMs, 61000);
        assert.equal(row.wallFromInitMs, 60700);
      } else {
        assert.deepEqual(row.fsb.callIntervalMs, { median: null, p90: null, count: null });
        assert.equal(row.wallMs, 1200);
        assert.equal(row.provider.servedModelMatch, true);
      }
      assert.deepEqual(row.flags, []);
      assert.ok(row.attempts >= 1);
    }
  } finally {
    harness.cleanup();
  }
});

test('the provider-error fixture is classified in memory and its text never reaches a row or raw record', async () => {
  const campaignId = 'cmp-provider-fixture';
  const schedule = buildSchedule({ campaignId, taskIds: LOOP_TASK_IDS, rounds: 1, arms: ['autopilot'], seed: 66 });
  const harness = loopHarness({ campaignId, script: {} });
  try {
    const tasks = LOOP_TASK_IDS.map((id) => ({ ...SAMPLE_TASK, id }));
    const executeRun = createRunExecutor({
      campaignId,
      tasksById: new Map(tasks.map((task) => [task.id, task])),
      fixtureSha256ById: new Map(tasks.map((task) => [task.id, HEX64])),
      fixtureServer: { newRunToken: () => 'tokenFixture01', runUrl: (t, p) => `http://127.0.0.1:1/r/${t}${p}`, evidence: () => ({ requests: [] }), clear: () => {} },
      cdpPort: null,
      arms: {
        autopilot: async () => ({
          t0: 1, t1: 2, timedOut: false, aborted: false, startFailed: false,
          runTask: { isError: true, status: null, partialOutcome: null, swEvicted: false, sessionIdSource: null },
          taskJson: PROVIDER_ERROR, errorText: null, sessionId: null, sessionDetail: null,
        }),
      },
      collectEvidence: async () => ({ requests: [], finalUrl: null, markers: {}, text: null, targetIds: [] }),
      cleanup: async () => {},
      streamsDir: harness.dir,
    });
    const { record } = await executeRun(schedule[0], { attempt: 1 });
    assert.equal(record.infraError, 'provider_error');
    assert.deepEqual(record.flags, ['session_detail_missing']);
    const row = toCommittedRow(record);
    assert.equal(validateCommittedRow(row).ok, true);
    assert.equal(JSON.stringify(row).includes('PROVIDER_ERROR_TEXT_77c1'), false);
    assert.equal(JSON.stringify(record).includes('PROVIDER_ERROR_TEXT_77c1'), false);
  } finally {
    harness.cleanup();
  }
});

test('a failed post-window evidence read is an infra error, never a task failure', async () => {
  const campaignId = 'cmp-evidence-lost';
  const schedule = buildSchedule({ campaignId, taskIds: LOOP_TASK_IDS, rounds: 1, arms: ['autopilot'], seed: 66 });
  const dir = tempDir('evidence');
  try {
    const tasks = LOOP_TASK_IDS.map((id) => ({ ...SAMPLE_TASK, id }));
    const base = {
      campaignId,
      tasksById: new Map(tasks.map((task) => [task.id, task])),
      fixtureSha256ById: new Map(tasks.map((task) => [task.id, HEX64])),
      fixtureServer: { newRunToken: () => 'tokenEvidence1', runUrl: (t, p) => `http://127.0.0.1:1/r/${t}${p}`, evidence: () => ({ requests: [] }), clear: () => {} },
      cdpPort: 9222,
      arms: {
        autopilot: async () => ({
          t0: 1, t1: 2, timedOut: false, aborted: false, startFailed: false,
          runTask: { isError: false, status: 'completed', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task' },
          taskJson: null, errorText: null, sessionId: 's', sessionDetail: { success: true, session: { measurement: AUTOPILOT_MEASUREMENT } },
        }),
      },
      cleanup: async () => {},
      streamsDir: dir,
    };
    const thrown = await createRunExecutor({ ...base, collectEvidence: async () => { throw new Error('cdp_http_failed'); } })(schedule[0], { attempt: 1 });
    assert.equal(thrown.record.infraError, 'extension_not_connected');
    assert.equal(thrown.record.evidence.collected, false);
    const flagged = await createRunExecutor({
      ...base,
      collectEvidence: async () => ({ requests: [], finalUrl: null, markers: {}, text: null, targetIds: [], collectionFailed: true }),
    })(schedule[0], { attempt: 1 });
    assert.equal(flagged.record.infraError, 'extension_not_connected');
    const fine = await createRunExecutor({
      ...base,
      collectEvidence: async () => ({ requests: [], finalUrl: null, markers: {}, text: null, targetIds: [] }),
    })(schedule[0], { attempt: 1 });
    assert.equal(fine.record.infraError, null, 'an empty but successful read is an ordinary task failure');
    assert.equal(fine.record.outcome.pass, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Report (Task 3): completion CIs, wall per completed task, labelled cost, --
// --- host metrics and the A/A noise floor (D-12, D-15, D-16, W4, W6, I-C) ------

const REPORT = path.join(ROOT, 'scripts', 'bench', 'report.mjs');
const loadReport = () => import('../scripts/bench/report.mjs');
const stats = await import('../scripts/bench/lib/stats.mjs');

const REPORT_TASKS = ['core-alpha-one', 'core-bravo-two', 'core-charlie-three', 'core-delta-four', 'core-echo-five', 'core-foxtrot-six'];
const BASE_WALL = {
  'core-alpha-one': 40000, 'core-bravo-two': 90000, 'core-charlie-three': 150000,
  'core-delta-four': 60000, 'core-echo-five': 75000, 'core-foxtrot-six': 120000,
};

function reportRow({ campaignId = 'cmp-report', taskId, round, arm, order, pass = true, wallMs, infraError = null, set = 'core', costUsd = 0.03, attempts = 1 }) {
  const isClaude = arm === 'claude';
  const raw = rawRecord({
    campaignId,
    runId: `${campaignId}-r${round}-${taskId}-${arm}`,
    attempt: attempts,
    set,
    taskId,
    category: set === 'live' ? 'reading' : 'click-heavy',
    arm,
    round,
    order,
    wallMs,
    wallFromInitMs: isClaude ? wallMs - 500 : null,
    timedOut: false,
    outcome: { pass, checks: [{ kind: 'request', pass }, { kind: 'marker', pass }] },
    infraError,
    measurement: isClaude ? MCP_MEASUREMENT : { ...AUTOPILOT_MEASUREMENT, costUsd },
    sessionMatch: 'unique',
    hostSummary: isClaude
      ? { ...CLAUDE_OK_SUMMARY, result: { ...CLAUDE_OK_SUMMARY.result, totalCostUsd: costUsd, durationMs: wallMs, durationApiMs: Math.round(wallMs * 0.6) } }
      : null,
    claimed: isClaude
      ? { status: null, partialOutcome: null, isError: false, subtype: 'success', completeTask: true }
      : { status: 'completed', partialOutcome: null, isError: false, subtype: null, completeTask: null },
    flags: set === 'live' ? ['live_task'] : [],
  });
  const row = toCommittedRow(raw);
  assert.equal(validateCommittedRow(row).ok, true, `synthetic row ${row.runId}`);
  return row;
}

// 6 tasks x 10 rounds x 2 arms = 120 rows: three task failures and two infra errors.
function baselineRows({ rounds = 10, tasks = REPORT_TASKS, set = 'core', campaignId = 'cmp-report' } = {}) {
  const rows = [];
  let order = 0;
  for (let round = 1; round <= rounds; round += 1) {
    for (const [taskIndex, taskId] of tasks.entries()) {
      const arms = round % 2 === 1 ? ['autopilot', 'claude'] : ['claude', 'autopilot'];
      for (const arm of arms) {
        order += 1;
        const wobble = 1 + (((round * 7 + taskIndex * 3) % 5) - 2) * 0.05;
        const base = BASE_WALL[taskId] || 60000;
        const wallMs = Math.round(base * wobble * (arm === 'claude' ? 1.5 : 1));
        let pass = true;
        let infraError = null;
        let attempts = 1;
        if (arm === 'autopilot' && taskId === 'core-bravo-two' && (round === 3 || round === 7)) pass = false;
        if (arm === 'claude' && taskId === 'core-charlie-three' && round === 5) pass = false;
        if (arm === 'autopilot' && taskId === 'core-alpha-one' && round === 2) { infraError = 'provider_error'; pass = false; attempts = 2; }
        if (arm === 'claude' && taskId === 'core-bravo-two' && round === 9) { infraError = 'agent_cap'; pass = false; }
        rows.push(reportRow({ campaignId, taskId, round, arm, order, pass, wallMs, infraError, set, attempts, costUsd: arm === 'claude' ? 0.4 : 0.03 }));
      }
    }
  }
  return rows;
}

const REPORT_IDENTITY = Object.freeze({
  schemaVersion: 1,
  campaignId: 'cmp-report',
  mode: 'campaign',
  set: 'core',
  schedule: { runs: 120, rounds: 10, arms: ['autopilot', 'claude'], seed: 66, cooldownMs: 3000 },
  git: { sha: 'a'.repeat(40), dirty: false },
  extension: { id: VALID_EXTENSION_ID, version: '0.9.91', measurement: { callTiming: 1, sessionDetailJournal: 1 }, telemetryOptOut: true, startTabActive: true },
  mcp: { serverName: 'fsb-mcp-server', serverVersion: '0.11.0', sdkVersion: '1.29.0', toolsList: { count: 60, sha256: 'b'.repeat(64) } },
  provider: { kind: 'api', name: 'xai', requestedModel: 'grok-4.3', pinnedModel: 'grok-4.3' },
  hosts: { claude: { name: 'claude-code', version: '2.1.283 (Claude Code)', model: 'claude-model-fixture', toolSearchEnv: 'unset', toolLoadingObserved: ['eager'], envKeyNames: ['HOME', 'PATH'], envKeyNamesSha256: 'd'.repeat(64) } },
  chrome: { browser: 'Chrome/146.0.7680.0', protocolVersion: '1.3', launchFlags: ['--disable-renderer-backgrounding', '--user-data-dir'], launchRecord: 'present' },
  tasks: REPORT_TASKS.map((id) => ({ id, version: 1, fixtureSha256: HEX64 })),
});

test('report.mjs exports loadCampaign, buildSummary, renderMarkdown and writeReport', async () => {
  const report = await loadReport();
  for (const name of ['loadCampaign', 'buildSummary', 'renderMarkdown', 'writeReport']) assert.equal(typeof report[name], 'function', name);
});

test('buildSummary: per set and arm, infra errors leave the denominator and completion carries a Wilson CI', async () => {
  const { buildSummary } = await loadReport();
  const rows = baselineRows();
  assert.equal(rows.length, 120);
  const summary = buildSummary({ identity: REPORT_IDENTITY, runs: rows }, { iterations: 300, seed: 66 });
  assert.equal(summary.kind, 'baseline');
  assert.equal(summary.rounds, 10);
  const autopilot = summary.sets.core.arms.autopilot;
  assert.equal(autopilot.runs, 60);
  assert.deepEqual(autopilot.infraErrors, { count: 1, byCode: { provider_error: 1 }, runIds: ['cmp-report-r2-core-alpha-one-autopilot'] });
  assert.equal(autopilot.denominator, 59);
  assert.equal(autopilot.completed, 57);
  assert.equal(autopilot.completionRate, 57 / 59);
  assert.deepEqual(autopilot.completionCi95, stats.wilson(57, 59));
  assert.equal(autopilot.attempts, 61, 'total attempts include the infra retry');
  const claude = summary.sets.core.arms.claude;
  assert.equal(claude.runs, 60);
  assert.equal(claude.completed, 58);
  assert.deepEqual(claude.infraErrors.byCode, { agent_cap: 1 });
  assert.deepEqual(summary.infraErrors.byCode, { agent_cap: 1, provider_error: 1 });
  assert.equal(summary.infraErrors.total, 2);
  assert.equal(summary.attempts, 121);
  assert.equal(summary.sets.live, null);
});

test('buildSummary: per-task medians and p90 over completed runs, the geometric mean of task medians, and cost per completed task', async () => {
  const { buildSummary } = await loadReport();
  const rows = baselineRows();
  const summary = buildSummary({ identity: REPORT_IDENTITY, runs: rows }, { iterations: 300, seed: 66 });
  const autopilot = summary.sets.core.arms.autopilot;
  const medians = [];
  for (const taskId of REPORT_TASKS) {
    const walls = rows.filter((row) => row.arm === 'autopilot' && row.taskId === taskId && row.infraError === null && row.pass).map((row) => row.wallMs);
    const perTask = autopilot.perTask.find((entry) => entry.taskId === taskId);
    assert.equal(perTask.wallMs.median, stats.median(walls));
    assert.equal(perTask.wallMs.p90, stats.quantile(walls, 0.9));
    assert.equal(perTask.completed, walls.length);
    medians.push(stats.median(walls));
  }
  const geo = Math.exp(medians.reduce((sum, value) => sum + Math.log(value), 0) / medians.length);
  assert.ok(Math.abs(autopilot.wallPerCompletedTask.geoMeanOfTaskMediansMs - geo) < 1e-6);
  assert.deepEqual(autopilot.wallPerCompletedTask.tasksUsed, REPORT_TASKS);

  const counted = rows.filter((row) => row.arm === 'autopilot' && row.infraError === null);
  const total = counted.reduce((sum, row) => sum + row.cost.usd, 0);
  assert.ok(Math.abs(autopilot.costPerCompletedTask.usd - total / 57) < 1e-12);
  assert.deepEqual(autopilot.costPerCompletedTask.sources, { provider: 59 });
  assert.equal(autopilot.costPerCompletedTask.label, 'provider-reported (xAI cost ticks)');
  assert.equal(summary.sets.core.arms.claude.costPerCompletedTask.label, 'list-price estimate, not billed');
});

test('buildSummary: the A/A noise floor comes from stats.aaNoiseFloor over completed runs by round', async () => {
  const { buildSummary } = await loadReport();
  const rows = baselineRows();
  const summary = buildSummary({ identity: REPORT_IDENTITY, runs: rows }, { iterations: 300, seed: 66 });
  const floor = summary.sets.core.arms.claude.aaNoiseFloor;
  const tasks = REPORT_TASKS.map((id) => ({
    id,
    runs: rows.filter((row) => row.arm === 'claude' && row.taskId === id && row.infraError === null && row.pass)
      .map((row) => ({ round: row.round, wallMs: row.wallMs })),
  }));
  const expected = stats.aaNoiseFloor(tasks, { iterations: 300, seed: 66 });
  assert.equal(floor.status, 'ok');
  assert.equal(floor.estimate, expected.estimate);
  assert.deepEqual(floor.ci, expected.ci);
  assert.equal(floor.verdict, expected.verdict);
  assert.equal(floor.label, stats.AA_NOISE_FLOOR_LABEL);
  assert.ok(floor.ciWidth > 0);
});

test('buildSummary: fewer than 10 rounds is a smoke, and live rows never change the core aggregates', async () => {
  const { buildSummary } = await loadReport();
  const smoke = buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows({ rounds: 9 }) }, { iterations: 200 });
  assert.equal(smoke.kind, 'smoke (not a baseline)');
  const coreOnly = buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows() }, { iterations: 200 });
  const live = [
    reportRow({ taskId: 'live-jira-read', round: 1, arm: 'autopilot', order: 1, pass: true, wallMs: 30000, set: 'live' }),
    reportRow({ taskId: 'live-jira-read', round: 1, arm: 'claude', order: 2, pass: false, wallMs: 50000, set: 'live' }),
  ];
  const withLive = buildSummary({ identity: REPORT_IDENTITY, runs: [...baselineRows(), ...live] }, { iterations: 200 });
  assert.deepEqual(withLive.sets.core, coreOnly.sets.core);
  assert.equal(withLive.sets.live.arms.autopilot.completed, 1);
  assert.equal(withLive.sets.live.arms.claude.completed, 0);
  assert.equal(withLive.sets.live.runs, 2);
});

test('buildSummary: fsb per-call medians, the labelled caller gap and call interval, and Claude host metrics (D-12, W6)', async () => {
  const { buildSummary } = await loadReport();
  const summary = buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows() }, { iterations: 200 });
  const claude = summary.sets.core.arms.claude;
  assert.equal(claude.fsb.fsbMsMedianPerCall, 310);
  assert.equal(claude.fsb.callerGapMsMedianPerCall, 8200);
  assert.equal(claude.fsb.callerGapLabel, 'upper bound on host thinking time');
  assert.equal(claude.fsb.callIntervalMsMedian, 8600);
  assert.equal(claude.fsb.callIntervalLabel, 'receive-to-receive call interval');
  assert.equal(claude.fsb.queueWait, 'not measured');
  assert.ok(Math.abs(claude.host.durationApiShareMedian - 0.6) < 0.001);
  assert.equal(claude.host.numTurnsMedian, 9);
  assert.equal(claude.host.costLabel, 'list-price estimate, not billed');
  assert.deepEqual(claude.host.toolLoading, { eager: 59 });
  const autopilot = summary.sets.core.arms.autopilot;
  assert.equal(autopilot.fsb.callIntervalMsMedian, null, 'autopilot rows have no MCP call interval');
  assert.equal(autopilot.fsb.iterationsMedian, 4);
  assert.equal(autopilot.fsb.modelMsTotalMedian, 9100);
  assert.equal(autopilot.host, null);
});

test('renderMarkdown: the required headings, the Method statements, n/a for missing numbers, and no URL', async () => {
  const { buildSummary, renderMarkdown } = await loadReport();
  const markdown = renderMarkdown(buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows() }, { iterations: 200 }));
  for (const heading of ['## Identity', '## Core set', '## A/A noise floor', '## Costs', '## Host metrics', '## Live set (reported separately)', '## Method']) {
    assert.ok(markdown.includes(`\n${heading}\n`), heading);
  }
  const method = markdown.slice(markdown.indexOf('## Method'));
  assert.match(method, /runner's own clock/);
  assert.match(method, /[Cc]laims? .*not counted|never counted/);
  assert.match(method, /upper bound/);
  assert.match(method, /queue wait is not measured/i);
  assert.match(method, /list-price estimate, not billed/);
  assert.match(method, /not compared with each other/);
  assert.match(markdown, /agent_cap: 1/);
  assert.match(markdown, /provider_error: 1/);
  assert.equal(markdown.includes('://'), false);
  assert.equal(/NaN|null%|Infinity|undefined/.test(markdown), false);
});

test('a one-round smoke (12 tasks x 1 round x 2 arms) reports A/A as n/a and still renders the per-task table (I-C)', async () => {
  const { buildSummary, renderMarkdown } = await loadReport();
  const tasks = Array.from({ length: 12 }, (_, i) => `core-smoke-task-${String.fromCharCode(97 + i)}`);
  const rows = baselineRows({ rounds: 1, tasks, campaignId: 'smoke-20260930' });
  assert.equal(rows.length, 24);
  const summary = buildSummary({ identity: { ...REPORT_IDENTITY, campaignId: 'smoke-20260930', mode: 'smoke' }, runs: rows });
  assert.equal(summary.kind, 'smoke (not a baseline)');
  for (const arm of ['autopilot', 'claude']) {
    assert.deepEqual(summary.sets.core.arms[arm].aaNoiseFloor, { status: 'n/a', reason: 'needs at least 2 rounds' });
    assert.equal(summary.sets.core.arms[arm].perTask.length, 12);
  }
  const markdown = renderMarkdown(summary);
  const aa = markdown.slice(markdown.indexOf('## A/A noise floor'), markdown.indexOf('## Costs'));
  assert.match(aa, /n\/a/);
  for (const text of [markdown, JSON.stringify(summary)]) {
    assert.equal(/NaN|null%|Infinity/.test(text), false);
  }
  for (const taskId of tasks) assert.ok(markdown.includes(taskId), `per-task row for ${taskId}`);
});

test('the report CLI writes summary.json and report.md, and exits 1 on an invalid row', async () => {
  const dir = tempDir('report-cli');
  try {
    fs.writeFileSync(path.join(dir, 'identity.json'), `${JSON.stringify(REPORT_IDENTITY, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'runs.jsonl'), `${baselineRows().map((row) => JSON.stringify(row)).join('\n')}\n`);
    const ok = spawnSync(process.execPath, [REPORT, dir], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(ok.status, 0, `${ok.stdout}\n${ok.stderr}`);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
    assert.equal(summary.kind, 'baseline');
    const markdown = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
    assert.match(markdown, /## Core set/);
    for (const file of ['summary.json', 'report.md']) {
      assert.equal(fs.readFileSync(path.join(dir, file), 'utf8').includes('://'), false, `${file} carries no URL`);
    }

    const { loadCampaign } = await loadReport();
    assert.equal(loadCampaign(dir).runs.length, 120);
    const bad = { ...baselineRows()[0], runId: 'cmp-report-extra-row', pageText: 'x' };
    fs.appendFileSync(path.join(dir, 'runs.jsonl'), `${JSON.stringify(bad)}\n`);
    assert.throws(() => loadCampaign(dir), /invalid/);
    const failed = spawnSync(process.execPath, [REPORT, dir], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /extra_key/);
    assert.equal(failed.stderr.includes('pageText') && failed.stderr.includes('"x"'), false, 'errors never echo row values');

    const usage = spawnSync(process.execPath, [REPORT], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(usage.status, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('report.mjs labels smoke campaigns and passes the Claude list-price label through', () => {
  const source = fs.readFileSync(REPORT, 'utf8');
  assert.match(source, /smoke \(not a baseline\)/);
  assert.ok(/list-price estimate/.test(source) || /COST_LABEL_LIST_PRICE/.test(source));
  assert.equal(/geoMeanMedianRatio\(|cross-arm|autopilot.*\/.*claude.*ratio/i.test(source.replace(/\/\/.*$/gm, '')), false, 'no cross-arm speed ratio');
});

// --- Phase 71 (71-03 Task 2): (arm, condition) groups, descriptive exposure, cost and --
// --- safety, and the method notes (D-07, D-10, D-18; Pitfalls 2, 3, 15) ------------------

const JEV_REAL_SHAPE = JSON.parse(fs.readFileSync(path.join(BENCH_FIXTURES, 'jev-measurement-real-shape.json'), 'utf8')).jevMeasurement;
const EXPOSURE_KEYS = ['exposure', 'safety', 'endLabels'];

function fastModeBlockFor(attempts, outcome = 'done') {
  const jev = attempts === null ? null : {
    attempts, calls: attempts, fast_steps: attempts > 0 ? 1 : 0, jev_ms: attempts > 0 ? 360 : null,
    calibration: attempts > 0 ? 'calibrated' : null, latched: null, exhausted: null, escalations: {},
  };
  return { outcome, reason: outcome === 'done' ? 'complete_task' : 'blocked', uncertain_unobserved: false, human_gate: null, budget_profile: 'run_task', jev };
}

// One schema-2 autopilot raw record through toCommittedRow, as the 71-03 runner writes it.
function v2Raw({
  campaignId = 'cmp-v2', taskId = 'core-alpha-one', round = 1, order = 1, condition = 'on', pass = true, wallMs = 60000,
  infraError = null, jevMeasurement = null, fastMode = null, safety = { requestOvercount: 0, unexpectedMutations: 0 },
  endReason = 'complete_task', flags = [], outcome = null, costUsd = 0.03,
} = {}) {
  return rawRecord({
    schemaVersion: 2,
    campaignId,
    runId: `${campaignId}-r${round}-${taskId}-autopilot${condition ? `-${condition}` : ''}`,
    attempt: 1,
    taskId,
    category: 'click-heavy',
    arm: 'autopilot',
    round,
    order,
    condition,
    wallMs,
    wallFromInitMs: null,
    timedOut: false,
    outcome: outcome || { pass, checks: [{ kind: 'request', pass }, { kind: 'marker', pass }] },
    infraError,
    measurement: { ...AUTOPILOT_MEASUREMENT, costUsd },
    sessions: [],
    sessionMatch: 'unique',
    hostSummary: null,
    claimed: { status: 'success', partialOutcome: null, isError: false, subtype: null, completeTask: null },
    runTask: { isError: false, status: 'success', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task', ...(fastMode ? { fastMode } : {}) },
    jevMeasurement,
    endReason,
    safety,
    flags,
  });
}

function v2Row(spec) {
  const row = toCommittedRow(v2Raw(spec));
  assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] }, `v2 row ${row.runId}`);
  assert.equal(row.schemaVersion, 2);
  return row;
}

// 6 tasks x 4 rounds x 2 conditions = 48 schema-2 autopilot rows, off and on
// alternating ABBA. The on rows cover every exposure source; a few rows carry
// a failure, an infra error, a safety event or a meta-loop end label.
function v2Rows({ rounds = 4, campaignId = 'cmp-v2' } = {}) {
  const rows = [];
  let order = 0;
  for (let round = 1; round <= rounds; round += 1) {
    for (const [taskIndex, taskId] of REPORT_TASKS.entries()) {
      for (const condition of round % 2 === 1 ? ['off', 'on'] : ['on', 'off']) {
        order += 1;
        const base = Math.round((BASE_WALL[taskId] || 60000) * (1 + (((round * 7 + taskIndex * 3) % 5) - 2) * 0.05));
        const spec = { campaignId, taskId, round, order, condition, wallMs: condition === 'on' ? Math.round(base * 0.8) : base };
        if (condition === 'off') {
          if (taskIndex === 0 && round === 3) Object.assign(spec, { pass: false, endReason: 'stuck_dom_hash' });
        } else {
          if (taskIndex === 0 || taskIndex === 5) Object.assign(spec, { jevMeasurement: JEV_REAL_SHAPE, fastMode: fastModeBlockFor(4) });
          if (taskIndex === 1) Object.assign(spec, { fastMode: fastModeBlockFor(2), flags: ['jev_measurement_missing'] });
          if (taskIndex === 2) spec.fastMode = fastModeBlockFor(0);
          if (taskIndex === 4) spec.fastMode = fastModeBlockFor(null, 'ambiguous');
          if (taskIndex === 1 && round === 2) spec.pass = false;
          if (taskIndex === 0 && round === 4) Object.assign(spec, { pass: false, endReason: 'meta_cognitive_loop_break' });
          if (taskIndex === 2 && round === 3) {
            Object.assign(spec, {
              infraError: 'condition_not_applied', wallMs: null, fastMode: null, safety: null, endReason: null,
              outcome: { pass: false, checks: [] },
            });
          }
          if (taskIndex === 3 && round === 4) spec.safety = { requestOvercount: 1, unexpectedMutations: 0 };
          if (taskIndex === 4 && round === 1) spec.safety = { requestOvercount: 0, unexpectedMutations: 2 };
          if (taskIndex === 5 && round === 2) spec.safety = { requestOvercount: null, unexpectedMutations: null };
        }
        rows.push(v2Row(spec));
      }
    }
  }
  return rows;
}

const V2_IDENTITY = Object.freeze({
  ...REPORT_IDENTITY,
  campaignId: 'cmp-v2',
  schedule: { runs: 48, rounds: 4, arms: ['autopilot'], seed: 71, cooldownMs: 3000, conditions: ['off', 'on'] },
  gate: { path: 'scripts/bench/gate/release-gate-v1.0.0.json', sha256: 'e'.repeat(64) },
  hosts: {},
});

test('71-03 report: v1 campaigns keep the per-arm keys and gain no exposure, safety, endLabels, gate or conditions', async () => {
  const { buildSummary } = await loadReport();
  const summary = buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows() }, { iterations: 200 });
  assert.deepEqual(Object.keys(summary.sets.core.arms), ['autopilot', 'claude']);
  for (const arm of ['autopilot', 'claude']) {
    for (const key of EXPOSURE_KEYS) assert.equal(Object.prototype.hasOwnProperty.call(summary.sets.core.arms[arm], key), false, `${arm}.${key}`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(summary.identity, 'gate'), false);
  assert.deepEqual(Object.keys(summary.identity.schedule), ['runs', 'rounds', 'arms', 'seed']);
});

test('71-03 report: v2 rows group by arm/condition and never pool off and on', async () => {
  const { buildSummary } = await loadReport();
  const rows = v2Rows();
  assert.equal(rows.length, 48);
  const summary = buildSummary({ identity: V2_IDENTITY, runs: rows }, { iterations: 300, seed: 71 });
  assert.deepEqual(Object.keys(summary.sets.core.arms), ['autopilot/off', 'autopilot/on']);
  assert.equal(Object.prototype.hasOwnProperty.call(summary.sets.core.arms, 'autopilot'), false, 'no pooled autopilot group');
  const off = summary.sets.core.arms['autopilot/off'];
  const on = summary.sets.core.arms['autopilot/on'];
  assert.equal(off.runs, 24);
  assert.equal(on.runs, 24);
  assert.equal(off.denominator, 24);
  assert.equal(on.denominator, 23, 'the condition_not_applied run leaves only the on denominator');
  assert.equal(off.completed, 23);
  assert.equal(on.completed, 21);
  assert.deepEqual(on.infraErrors.byCode, { condition_not_applied: 1 });
  assert.deepEqual(off.infraErrors.byCode, {});

  // Each group is built from its own rows only: the same as a summary of that condition alone.
  for (const condition of ['off', 'on']) {
    const alone = buildSummary({ identity: V2_IDENTITY, runs: rows.filter((row) => row.condition === condition) }, { iterations: 300, seed: 71 });
    assert.deepEqual(alone.sets.core.arms[`autopilot/${condition}`], summary.sets.core.arms[`autopilot/${condition}`], `${condition} is never pooled`);
    assert.equal(alone.sets.core.arms[`autopilot/${condition}`].aaNoiseFloor.status, 'ok', 'the A/A floor is computed per group');
  }

  const unconditioned = [1, 2].map((round) => v2Row({ campaignId: 'cmp-v2-plain', taskId: 'core-alpha-one', round, order: round, condition: null }));
  const plain = buildSummary({ identity: null, runs: unconditioned }, { iterations: 100 });
  assert.deepEqual(Object.keys(plain.sets.core.arms), ['autopilot'], 'v2 rows with condition null group under the bare arm');
  assert.ok(plain.sets.core.arms.autopilot.exposure, 'a group with v2 rows carries the exposure block');
});

test('71-03 report: groups with v2 rows carry descriptive exposure, cost, typed outcomes, safety and end labels', async () => {
  const { buildSummary } = await loadReport();
  const rows = v2Rows();
  const summary = buildSummary({ identity: V2_IDENTITY, runs: rows }, { iterations: 200, seed: 71 });
  const on = summary.sets.core.arms['autopilot/on'];
  const off = summary.sets.core.arms['autopilot/off'];
  const measured = rows.find((row) => row.jev.source === 'measurement');

  assert.deepEqual(Object.keys(on.exposure), [
    'exposureSources', 'actedRuns', 'jevCallsTotal', 'fallbacks', 'calibrationStatuses', 'servedModels', 'instrumentVersions',
    'missingMeasurement', 'jevCostPerCompletedTask', 'typedOutcomes',
  ]);
  assert.deepEqual(on.exposure.exposureSources, { measurement: 8, summary: 7, no_block: 4, unknown: 4 });
  assert.equal(on.exposure.actedRuns, 12);
  assert.equal(on.exposure.jevCallsTotal, 8 * measured.jev.jevCalls + 4 * 2);
  assert.deepEqual(on.exposure.fallbacks, { sensitive_goal: 8, timeout: 8 });
  assert.deepEqual(on.exposure.calibrationStatuses, { calibrated: 12 });
  assert.deepEqual(on.exposure.servedModels, measured.jev.servedModels);
  assert.deepEqual(on.exposure.instrumentVersions, measured.jev.instrumentVersions);
  assert.equal(on.exposure.missingMeasurement, 4);
  const jevCost = on.exposure.jevCostPerCompletedTask;
  assert.deepEqual(Object.keys(jevCost), ['provider', 'estimate', 'label']);
  assert.ok(Math.abs(jevCost.provider - (8 * measured.jev.usd.provider) / 21) < 1e-15);
  assert.equal(jevCost.estimate, null);
  assert.equal(jevCost.label, 'Jev cost (FSB-borne), reported beside the LLM cost and never added to it');
  assert.ok(Math.abs(on.costPerCompletedTask.usd - (23 * 0.03) / 21) < 1e-12, 'the LLM cost is unchanged and kept apart');
  assert.deepEqual(on.exposure.typedOutcomes, { done: { pass: 13, fail: 2 }, ambiguous: { pass: 4, fail: 0 }, none: { pass: 4, fail: 0 } });
  assert.deepEqual(on.safety, {
    verifiableRuns: 22, unverifiableRuns: 1, requestOvercountRuns: 1, unexpectedMutationRuns: 1, claimedSuccessOnFailRuns: 2,
  });
  assert.deepEqual(on.endLabels, { complete_task: 22, meta_cognitive_loop_break: 1 });

  assert.deepEqual(off.exposure.exposureSources, { measurement: 0, summary: 0, no_block: 0, unknown: 24 });
  assert.equal(off.exposure.actedRuns, 0);
  assert.equal(off.exposure.jevCallsTotal, null, 'no recorded Jev calls is n/a, never 0');
  assert.deepEqual(off.exposure.fallbacks, {});
  assert.deepEqual(off.exposure.calibrationStatuses, {});
  assert.deepEqual(off.exposure.servedModels, []);
  assert.equal(off.exposure.missingMeasurement, 0);
  assert.deepEqual(off.exposure.jevCostPerCompletedTask.provider, null);
  assert.deepEqual(off.exposure.typedOutcomes, { none: { pass: 23, fail: 1 } });
  assert.deepEqual(off.safety, {
    verifiableRuns: 24, unverifiableRuns: 0, requestOvercountRuns: 0, unexpectedMutationRuns: 0, claimedSuccessOnFailRuns: 1,
  });
  assert.deepEqual(off.endLabels, { complete_task: 23, stuck_dom_hash: 1 });
});

test('71-03 report: markdown has a heading per group and the descriptive exposure section, and no per-decision timing, URL or broken number', async () => {
  const { buildSummary, renderMarkdown } = await loadReport();
  const summary = buildSummary({ identity: V2_IDENTITY, runs: v2Rows() }, { iterations: 200, seed: 71 });
  const markdown = renderMarkdown(summary);
  assert.ok(markdown.includes('\n### autopilot/off\n'));
  assert.ok(markdown.includes('\n### autopilot/on\n'));
  assert.ok(markdown.includes('\n## Fast-mode exposure and safety (descriptive)\n'));
  const section = markdown.slice(markdown.indexOf('## Fast-mode exposure and safety (descriptive)'), markdown.indexOf('## Live set'));
  assert.match(section, /core \/ autopilot\/on/);
  assert.match(section, /measurement 8, summary 7, no_block 4, unknown 4/);
  assert.match(section, /Jev cost \(FSB-borne\), reported beside the LLM cost and never added to it/);
  assert.match(section, /claimed success on a failed run in 2 runs/);
  assert.match(markdown, /- Gate: sha256 e{64}/);
  assert.match(markdown, /conditions off, on/);
  for (const text of [markdown, JSON.stringify(summary)]) {
    for (const banned of ['jevMs', 'latencyMs', '://']) assert.equal(text.includes(banned), false, banned);
    assert.equal(/NaN|null%|Infinity|undefined/.test(text), false);
  }
  const v1 = renderMarkdown(buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows() }, { iterations: 200 }));
  assert.equal(v1.includes('Fast-mode exposure and safety'), false, 'v1 reports have no exposure section');
  assert.equal(v1.includes('- Gate:'), false);
});

test('71-03 report: identitySummary adds gate.sha256 and schedule.conditions only when the identity has them', async () => {
  const { buildSummary } = await loadReport();
  const summary = buildSummary({ identity: V2_IDENTITY, runs: v2Rows({ rounds: 1 }) }, { iterations: 100 });
  assert.deepEqual(summary.identity.gate, { sha256: 'e'.repeat(64) });
  assert.deepEqual(summary.identity.schedule, { runs: 48, rounds: 4, arms: ['autopilot'], seed: 71, conditions: ['off', 'on'] });
  assert.equal(JSON.stringify(summary.identity).includes('release-gate'), false, 'the gate path is not repeated in the summary');
});

test('71-03 report: the method notes keep every Phase 66 sentence and disclose conditions, ITT, survivorship, the token alphabet and the cost split', async () => {
  const { METHOD_NOTES, buildSummary, renderMarkdown } = await loadReport();
  const method = renderMarkdown(buildSummary({ identity: REPORT_IDENTITY, runs: baselineRows() }, { iterations: 100 }));
  const notes = method.slice(method.indexOf('## Method'));
  for (const pattern of [
    /runner's own clock/, /never counted/, /upper bound/, /queue wait is not measured/i, /not compared with each other/,
    /interleaved run by run/, /written through the MCP settings tool before t0 and read back over CDP/, /condition_not_applied/,
    /intention to treat/, /whether or not Jev acted/,
    /completed runs only/, /read together with completion/,
    /24-letter lowercase run tokens/, /8a058bdf baseline used base64url tokens/, /token alphabet and length only/, /22 base64url characters at the pin/,
    /FSB-borne/, /user-borne/, /side by side and never summed/,
  ]) {
    assert.match(notes, pattern);
  }
  assert.equal(METHOD_NOTES.filter((note) => /not compared with each other/.test(note)).length, 1);
  for (const note of METHOD_NOTES) assert.equal(/jevMs|latencyMs|:\/\//.test(note), false);
});

test('71-03 report.mjs: no per-decision timing names and still no ratio code', () => {
  const source = fs.readFileSync(REPORT, 'utf8');
  assert.equal(/jevMs|latencyMs/.test(source), false);
  assert.equal(/geoMeanMedianRatio\(|cross-arm|autopilot.*\/.*claude.*ratio/i.test(source.replace(/\/\/.*$/gm, '')), false);
  assert.equal(/newcombe|verdict\s*:/i.test(source.replace(/\/\/.*$/gm, '').replace(/verdict: result\.verdict/g, '')), false,
    'no Newcombe interval or new verdict here');
});

test('71-03 report parity: condition, jev, safety, endLabel and fastMode each change a summary field', async () => {
  const { buildSummary } = await loadReport();
  const base = { taskId: 'core-alpha-one', round: 1, order: 1, condition: 'on', fastMode: fastModeBlockFor(0) };
  const summarize = (spec) => buildSummary({ identity: null, runs: [v2Row({ ...base, ...spec })] }, { iterations: 50 }).sets.core.arms;
  const before = summarize({});
  const group = (arms) => arms['autopilot/on'];

  assert.deepEqual(Object.keys(summarize({ condition: 'off' })), ['autopilot/off'], 'condition picks the group');
  assert.notDeepEqual(group(summarize({ jevMeasurement: JEV_REAL_SHAPE })).exposure.exposureSources, group(before).exposure.exposureSources, 'jev');
  assert.notDeepEqual(group(summarize({ safety: { requestOvercount: 2, unexpectedMutations: 0 } })).safety, group(before).safety, 'safety');
  assert.notDeepEqual(group(summarize({ endReason: 'stuck_dom_hash' })).endLabels, group(before).endLabels, 'endLabel');
  assert.notDeepEqual(group(summarize({ fastMode: fastModeBlockFor(0, 'blocked') })).exposure.typedOutcomes, group(before).exposure.typedOutcomes, 'fastMode');
  assert.deepEqual(group(before).exposure.typedOutcomes, { done: { pass: 1, fail: 0 } });
});
