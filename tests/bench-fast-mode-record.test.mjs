// Phase 70 Plan 07 Task 2 (MCP-03; CONTEXT D-18, D-21; RESEARCH F10): the
// bench raw record keeps the run_task fast_mode block, projected through the
// bench-side frozen key mirror in scripts/bench/lib/fast-mode.mjs, so V4 can
// build the typed-outcome agreement table from raw records.
//
// - runAutopilotArm adds runTask.fastMode only when the run_task JSON carries
//   a plain-object fast_mode block, as the last runTask key; every other run
//   keeps the exact previous runTask key set and order.
// - projectFastMode keeps exactly the frozen keys with closed vocabularies
//   and token-shaped strings, and judges the jev summary field by field:
//   the 70-05 zero summary and a summary with jev_ms null project unchanged
//   (Phase 71 reads a non-null jev as known exposure), an unreadable count
//   nulls jev, an unreadable jev_ms nulls only that field.
// - Committed rows (RUN_ROW_KEYS, toCommittedRow) and the infra
//   classification are unchanged.
// - Producer/validator parity: the bench lists deep-equal the extension's
//   frozen FAST_MODE_* exports.
//
// Fakes only, as in tests/bench-drivers.test.mjs: no MCP server, no browser,
// no host CLI, no socket, nothing written to disk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FAST_MODE_BLOCK_KEYS,
  FAST_MODE_OUTCOMES,
  FAST_MODE_SUMMARY_KEYS,
  projectFastMode,
} from '../scripts/bench/lib/fast-mode.mjs';
import {
  RUN_ROW_KEYS,
  buildSchedule,
  classifyInfra,
  toCommittedRow,
  validateCommittedRow,
} from '../scripts/bench/lib/runs.mjs';
import { createRunExecutor, runAutopilotArm } from '../scripts/bench/run-bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const FsbFastPath = require('../extension/ai/jev-fast-path.js');

const SAMPLE_TASK = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'tests', 'fixtures', 'bench', 'tasks-sample', 'tasks', 'core', 'core-sample-save.json'), 'utf8'));
const HEX64 = 'c'.repeat(64);
const OLD_RUN_TASK_KEYS = Object.freeze(['isError', 'status', 'partialOutcome', 'swEvicted', 'sessionIdSource']);

// The exact 70-05 summary of a session with no jevMeasurement (70-05-PLAN.md:108).
const Z = Object.freeze({
  attempts: 0, calls: 0, fast_steps: 0, jev_ms: null, calibration: null, latched: null, exhausted: null, escalations: {},
});
// One uncalibrated decide, then the session latch (68-01-PLAN.md:142).
const U = Object.freeze({
  attempts: 1, calls: 1, fast_steps: 0, jev_ms: 420, calibration: 'uncalibrated', latched: 'not_calibrated', exhausted: null,
  escalations: {},
});

function blockWith(jev) {
  return { outcome: 'done', reason: 'complete_task', uncertain_unobserved: false, human_gate: null, budget_profile: 'run_task', jev };
}

const AUTOPILOT_MEASUREMENT = Object.freeze({
  v: 1, kind: 'autopilot', recorded: true, iterations: 4,
  modelMs: { total: 9100, median: 2200, p90: 2900 }, toolMs: { total: 1800, median: 400, p90: 600, calls: 5 },
  costUsd: 0.0321, costSource: 'provider', requestedModel: 'grok-4.3', servedModels: ['grok-4.3'],
});

// --- runAutopilotArm with fake deps ------------------------------------------------------

function fakeDeps(timed) {
  const calls = [];
  return {
    calls,
    deps: {
      openTab: async (client, startUrl) => { calls.push(['openTab', startUrl]); return { isError: false, json: { tabId: 7 }, text: '' }; },
      runTaskTimed: async (client, instruction, budgetMs) => { calls.push(['runTaskTimed', instruction, budgetMs]); return timed; },
      getSessionDetailWithRetry: async (client, sessionId) => {
        calls.push(['getSessionDetailWithRetry', sessionId]);
        return { success: true, session: { id: sessionId, measurement: AUTOPILOT_MEASUREMENT } };
      },
      now: () => 1760000000000,
    },
  };
}

function timedWith(json, extra = {}) {
  return {
    t0: 1000, t1: 2600, timedOut: false, aborted: false, isError: false, json,
    errorText: null, sessionId: 'sess_bench_fast', sessionIdSource: 'run_task', ...extra,
  };
}

async function armWith(json, extra) {
  const { deps } = fakeDeps(timedWith(json, extra));
  return runAutopilotArm({
    deps, client: null, task: SAMPLE_TASK, startUrl: 'http://127.0.0.1:5555/r/tokenFast/fixtures/sample/index.html',
    instruction: 'Open the page. Type alpha into the Value field, then press Save.', signal: undefined,
  });
}

function realBlock() {
  // The no-jevMeasurement session of the 70-05 "summary" case: the run_task
  // field and a resolved run evidence record.
  const session = {
    fastMode: { enabled: true, stored: true, source: 'mcp', budgetProfile: 'run_task' },
    status: 'completed',
    _fastRunEvidence: {
      v: 1, seq: 6, fastIteration: null, pending: null, lastUncertainSeq: 0, lastObservationSeq: 0, fastUnobservedSeq: 0, gates: [],
    },
  };
  return FsbFastPath.buildFastModeBlock(session, {
    source: 'lifecycleBus', kind: 'complete', message: { outcome: 'success', reason: 'complete_task' },
  });
}

test('runTask.fastMode only for a plain-object block', async () => {
  const base = { success: true, sessionId: 'sess_bench_fast', status: 'success', result: 'Saved alpha.' };
  const block = blockWith({ ...U, escalations: { not_calibrated: 1 } });
  for (const aborted of [false, true]) {
    const label = aborted ? 'aborted run' : 'finished run';
    const on = await armWith({ ...base, fast_mode: block }, { aborted });
    assert.deepEqual(Object.keys(on.runTask), [...OLD_RUN_TASK_KEYS, 'fastMode'], `${label}: fastMode is the last runTask key`);
    assert.deepEqual(on.runTask.fastMode, projectFastMode(block), `${label}: fastMode is the projected block`);
    assert.deepEqual(on.runTask.fastMode, block, `${label}: a well-formed block projects unchanged`);
    assert.notEqual(on.runTask.fastMode, block, `${label}: fastMode is a fresh object`);
    assert.deepEqual(
      Object.fromEntries(OLD_RUN_TASK_KEYS.map((key) => [key, on.runTask[key]])),
      { isError: false, status: 'success', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task' },
      `${label}: the other runTask fields are unchanged`);
    assert.equal(on.aborted, aborted);

    for (const [what, value] of [['absent', undefined], ['an array', [block]], ['a string', JSON.stringify(block)], ['null', null]]) {
      const json = { ...base };
      if (value !== undefined) json.fast_mode = value;
      const off = await armWith(json, { aborted });
      assert.deepEqual(Object.keys(off.runTask), [...OLD_RUN_TASK_KEYS], `${label}: fast_mode ${what} keeps the old runTask keys`);
      assert.equal(Object.prototype.hasOwnProperty.call(off.runTask, 'fastMode'), false, `${label}: fast_mode ${what} adds no fastMode`);
    }
  }
  const noJson = await armWith(null);
  assert.deepEqual(Object.keys(noJson.runTask), [...OLD_RUN_TASK_KEYS], 'a run_task with no JSON keeps the old runTask keys');
  const arrayJson = await armWith([{ fast_mode: block }]);
  assert.deepEqual(Object.keys(arrayJson.runTask), [...OLD_RUN_TASK_KEYS], 'an array JSON keeps the old runTask keys');
});

// --- projectFastMode ----------------------------------------------------------------------

test('zero summary projects unchanged', () => {
  for (const [name, jev] of [['Z', Z], ['U', U], ['U with jev_ms null', { ...U, jev_ms: null }]]) {
    const block = blockWith(jev);
    const projected = projectFastMode(block);
    assert.deepEqual(projected, block, `${name}: projects unchanged`);
    assert.equal(JSON.stringify(projected), JSON.stringify(block), `${name}: same keys in the same order`);
    assert.notEqual(projected.jev, null, `${name}: jev stays known exposure, never null`);
  }

  const real = realBlock();
  assert.deepEqual(real.jev, Z, 'the real builder gives the zero summary for a session with no jevMeasurement');
  assert.deepEqual(projectFastMode(real), real, 'the real zero-summary block projects unchanged');
  assert.equal(JSON.stringify(projectFastMode(real)), JSON.stringify(real));

  for (const field of ['attempts', 'calls', 'fast_steps']) {
    for (const [what, bad] of [['-1', -1], ['1.5', 1.5], ["'1'", '1'], ['NaN', Number.NaN], ['missing', undefined]]) {
      const jev = { ...Z, [field]: bad };
      if (bad === undefined) delete jev[field];
      assert.equal(projectFastMode({ outcome: 'done', jev }).jev, null, `${field} ${what} nulls jev (unknown exposure)`);
    }
  }
  for (const [what, bad] of [['-5', -5], ['Infinity', Number.POSITIVE_INFINITY], ["'420'", '420'], ['NaN', Number.NaN]]) {
    const projected = projectFastMode({ ...blockWith({ ...U, jev_ms: bad }) });
    assert.deepEqual(projected.jev, { ...U, jev_ms: null }, `jev_ms ${what} gives jev_ms null and keeps every other jev field`);
  }
  assert.deepEqual(projectFastMode(blockWith({ ...U, jev_ms: 0 })).jev, { ...U, jev_ms: 0 }, 'jev_ms 0 is a real value');
});

test('projection rules for the top level, jev and escalations', () => {
  assert.deepEqual(Object.keys(projectFastMode({})), [...FAST_MODE_BLOCK_KEYS], 'an empty block gives exactly the frozen keys');
  assert.deepEqual(projectFastMode({}), {
    outcome: 'other', reason: null, uncertain_unobserved: null, human_gate: null, budget_profile: null, jev: null,
  }, 'missing values count as null; an unknown outcome is other');
  for (const outcome of FAST_MODE_OUTCOMES) assert.equal(projectFastMode({ outcome }).outcome, outcome, `outcome ${outcome} is kept`);
  for (const outcome of ['success', 'Done', '', null, 1]) assert.equal(projectFastMode({ outcome }).outcome, 'other', `outcome ${String(outcome)} is other`);

  for (const key of ['reason', 'human_gate', 'budget_profile']) {
    assert.equal(projectFastMode({ [key]: null })[key], null, `${key} null stays null`);
    assert.equal(projectFastMode({ [key]: 'manual_approval' })[key], 'manual_approval', `${key} token is kept`);
    for (const bad of ['Complete_Task', 'complete-task', 'a'.repeat(41), '', 7, true, {}, ['run_task']]) {
      assert.equal(projectFastMode({ [key]: bad })[key], 'other', `${key} ${JSON.stringify(bad)} is other`);
    }
  }
  for (const value of [true, false, null]) assert.equal(projectFastMode({ uncertain_unobserved: value }).uncertain_unobserved, value);
  for (const bad of ['true', 1, 0, {}]) assert.equal(projectFastMode({ uncertain_unobserved: bad }).uncertain_unobserved, null);

  for (const bad of [null, [], 'jev', 3, [Z]]) assert.equal(projectFastMode({ jev: bad }).jev, null, `jev ${JSON.stringify(bad)} is null`);
  const tokens = projectFastMode({ jev: { ...Z, calibration: 'Calibrated', latched: 'x'.repeat(41), exhausted: 'step_budget' } }).jev;
  assert.deepEqual([tokens.calibration, tokens.latched, tokens.exhausted], ['other', 'other', 'step_budget'],
    'calibration, latched and exhausted follow the token rule');
  const extra = projectFastMode({ jev: { ...U, label: 'P70-MARKER', usd: 1 }, extra: 1 });
  assert.deepEqual(Object.keys(extra.jev), [...FAST_MODE_SUMMARY_KEYS], 'extra jev keys are dropped');
  assert.equal(Object.prototype.hasOwnProperty.call(extra, 'extra'), false, 'extra top-level keys are dropped');

  const escalations = {};
  for (let i = 0; i < 70; i += 1) escalations[`code_${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + (i % 26))}`] = i;
  const many = projectFastMode({ jev: { ...Z, escalations } }).jev.escalations;
  assert.equal(Object.keys(many).length, 64, 'at most 64 escalation entries');
  assert.deepEqual(Object.keys(many), Object.keys(escalations).slice(0, 64), 'the first 64 valid entries, in order');
  assert.deepEqual(projectFastMode({ jev: { ...Z, escalations: {
    timeout: 2, 'Bad-Key': 1, uncertain: -1, stale: 1.5, failed: '3', denied: Number.NaN, no_effect: 0, ['y'.repeat(41)]: 1,
  } } }).jev.escalations, { timeout: 2, no_effect: 0 }, 'invalid keys and counts are dropped');
  for (const bad of [null, [], 'x', 4]) {
    assert.deepEqual(projectFastMode({ jev: { ...Z, escalations: bad } }).jev.escalations, {}, `escalations ${JSON.stringify(bad)} gives {}`);
  }
  const proto = projectFastMode(JSON.parse('{"jev":{"attempts":0,"calls":0,"fast_steps":0,"escalations":{"__proto__":5,"timeout":1}}}'));
  assert.deepEqual(proto.jev.escalations, { timeout: 1 }, 'a __proto__ escalation key is dropped');
  assert.equal(Object.getPrototypeOf(proto.jev.escalations), Object.prototype, 'escalations stays a plain object');

  const input = blockWith({ ...U, escalations: { timeout: 1 } });
  const projected = projectFastMode(input);
  projected.jev.escalations.timeout = 99;
  projected.jev.attempts = 99;
  assert.equal(input.jev.escalations.timeout, 1, 'the projection shares no object with its input');
  assert.equal(input.jev.attempts, 1);
});

test('projectFastMode never throws', () => {
  const hostile = [
    undefined, null, 'done', 42, [], [blockWith(Z)],
    new Proxy({}, { get() { throw new Error('trap'); }, getOwnPropertyDescriptor() { throw new Error('trap'); } }),
    { get outcome() { throw new Error('getter'); }, reason: 'complete_task' },
    { outcome: 'done', jev: new Proxy({ ...Z }, { ownKeys() { throw new Error('trap'); } }) },
    { outcome: 'done', jev: { ...Z, escalations: new Proxy({}, { ownKeys() { throw new Error('trap'); } }) } },
    { outcome: 'done', jev: { ...Z, get attempts() { throw new Error('getter'); } } },
  ];
  for (const value of hostile) {
    let projected;
    assert.doesNotThrow(() => { projected = projectFastMode(value); });
    assert.deepEqual(Object.keys(projected), [...FAST_MODE_BLOCK_KEYS]);
    assert.ok(FAST_MODE_OUTCOMES.includes(projected.outcome) || projected.outcome === 'other');
  }
  const getter = projectFastMode({ get outcome() { throw new Error('getter'); }, reason: 'complete_task' });
  assert.equal(getter.outcome, 'other', 'a throwing getter reads as missing');
  assert.equal(getter.reason, 'complete_task', 'one unreadable field never loses the others');
});

test('no page content', () => {
  const marker = 'P70-MARKER-TASK';
  const url = 'https://shop.example.test/checkout?token=P70-MARKER-URL';
  const long = 'r'.repeat(200);
  const hostile = {
    outcome: 'done',
    reason: long,
    uncertain_unobserved: marker,
    human_gate: url,
    budget_profile: `run_task ${marker}`,
    task: marker,
    result: { text: marker, url },
    label: marker,
    jev: {
      attempts: 1, calls: 1, fast_steps: 0, jev_ms: 10,
      calibration: url, latched: marker, exhausted: long,
      escalations: { [marker]: 1, [url]: 2, [long]: 3, timeout: 1 },
      goal: marker, url,
    },
  };
  const projected = projectFastMode(hostile);
  const json = JSON.stringify(projected);
  for (const forbidden of [marker, 'P70-MARKER', url, '://', 'shop.example', long, 'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr']) {
    assert.equal(json.includes(forbidden), false, `the projected block never carries ${forbidden.slice(0, 40)}`);
  }
  assert.equal(projected.reason, 'other');
  assert.deepEqual(projected.jev.escalations, { timeout: 1 });
  assert.ok(json.length < 400, 'the projected block stays small');
});

// --- committed rows and the infra classification -------------------------------------------

function rawAutopilotRecord(runTask) {
  return {
    schemaVersion: 1,
    campaignId: 'cmp-fast',
    runId: 'cmp-fast-r1-core-sample-save-autopilot',
    attempt: 1,
    set: 'core',
    taskId: 'core-sample-save',
    taskVersion: 1,
    category: 'click-heavy',
    fixtureSha256: HEX64,
    arm: 'autopilot',
    round: 1,
    order: 1,
    startedAt: '2026-10-18T10:00:00.000Z',
    timing: { t0: 1000, initAt: null, t1: 2600, exitedAt: null },
    wallMs: 1600,
    wallFromInitMs: null,
    timedOut: false,
    outcome: { pass: true, checks: [{ kind: 'request', pass: true, detail: { matched: 1, expected: 1 } }] },
    infraError: null,
    claimed: { status: 'success', partialOutcome: null, isError: false, subtype: null, completeTask: null },
    sessions: [{ id: 'sess_bench_fast', measurement: AUTOPILOT_MEASUREMENT }],
    sessionMatch: 'unique',
    measurement: AUTOPILOT_MEASUREMENT,
    hostSummary: null,
    runTask,
    evidence: { collected: true, requests: [], finalUrl: null, markers: {}, text: null },
    flags: [],
  };
}

test('committed row unchanged', () => {
  assert.deepEqual([...RUN_ROW_KEYS], [
    'schemaVersion', 'campaignId', 'runId', 'attempts', 'set', 'taskId', 'taskVersion', 'category', 'fixtureSha256',
    'arm', 'round', 'order', 'startedAt', 'wallMs', 'wallFromInitMs', 'pass', 'timedOut', 'checks', 'infraError',
    'claimed', 'fsb', 'host', 'cost', 'provider', 'flags',
  ], 'RUN_ROW_KEYS is unchanged');
  const plain = { isError: false, status: 'success', partialOutcome: null, swEvicted: false, sessionIdSource: 'run_task' };
  const withBlock = { ...plain, fastMode: projectFastMode(realBlock()) };
  const rowOff = toCommittedRow(rawAutopilotRecord(plain));
  const rowOn = toCommittedRow(rawAutopilotRecord(withBlock));
  assert.deepEqual(rowOn, rowOff, 'toCommittedRow ignores runTask.fastMode');
  assert.deepEqual(Object.keys(rowOn), [...RUN_ROW_KEYS]);
  assert.deepEqual(validateCommittedRow(rowOn), { ok: true, errors: [] });
  for (const piece of ['fastMode', 'fast_mode', 'budget_profile', 'uncertain_unobserved', 'complete_task', 'escalations']) {
    assert.equal(JSON.stringify(rowOn).includes(piece), false, `nothing of the block reaches the committed row (${piece})`);
  }

  const block = { ...realBlock(), reason: 'API call failed: AGENT_CAP_REACHED Extension disconnected extension_not_connected' };
  const jsons = [
    { success: true, sessionId: 's', status: 'success', result: 'ok' },
    { success: true, sw_evicted: true, partial_state: null },
    { success: true, status: 'error', error: 'API call failed: provider returned 500' },
    { success: true, status: 'error', error: 'AGENT_CAP_REACHED' },
    { success: true, status: 'error', message: 'Extension WebSocket not connected' },
  ];
  for (const json of jsons) {
    for (const timedOut of [false, true]) {
      const input = { arm: 'autopilot', errorText: null, sessionErrorText: null, timedOut, sessionDetail: null, startFailed: false };
      assert.equal(
        classifyInfra({ ...input, taskJson: { ...json, fast_mode: block } }),
        classifyInfra({ ...input, taskJson: json }),
        `classifyAutopilot gives the same label with and without fast_mode (${JSON.stringify(json).slice(0, 60)}, timedOut ${timedOut})`);
    }
  }
});

test('raw record carries runTask.fastMode through the run executor', async () => {
  const block = realBlock();
  const runs = {};
  for (const [label, json] of [
    ['on', { success: true, sessionId: 'sess_bench_fast', status: 'success', result: 'Saved alpha.', fast_mode: block }],
    ['off', { success: true, sessionId: 'sess_bench_fast', status: 'success', result: 'Saved alpha.' }],
  ]) {
    const { deps } = fakeDeps(timedWith(json));
    const executeRun = createRunExecutor({
      campaignId: 'cmp-fast',
      tasksById: new Map([[SAMPLE_TASK.id, SAMPLE_TASK]]),
      fixtureSha256ById: new Map([[SAMPLE_TASK.id, HEX64]]),
      fixtureServer: {
        newRunToken: () => 'tokenFast0001',
        runUrl: (token, startPath) => `http://127.0.0.1:5555/r/${token}${startPath}`,
      },
      cdpPort: null,
      arms: {
        autopilot: ({ task, startUrl, instruction, signal }) => runAutopilotArm({ deps, client: null, task, startUrl, instruction, signal }),
      },
      collectEvidence: async ({ task, token }) => ({
        requests: [{ t: 1, method: 'POST', path: '/api/sample/save', query: {}, bodyType: 'json', body: { value: 'alpha' } }],
        finalUrl: `http://127.0.0.1:5555/r/${token}${task.startPath}?view=saved`,
        markers: { 'saved-value': 'alpha' },
        text: null,
        targetIds: [],
      }),
      cleanup: async () => {},
      streamsDir: null,
      now: () => 1760000000000,
    });
    const [entry] = buildSchedule({ campaignId: 'cmp-fast', taskIds: [SAMPLE_TASK.id], rounds: 1, arms: ['autopilot'], seed: 66 });
    const { record, aborted } = await executeRun(entry, { attempt: 1 });
    assert.equal(aborted, false);
    runs[label] = record;
  }
  assert.deepEqual(runs.on.runTask.fastMode, projectFastMode(block), 'the raw record keeps the projected block');
  assert.deepEqual(Object.keys(runs.on.runTask), [...OLD_RUN_TASK_KEYS, 'fastMode']);
  assert.deepEqual(Object.keys(runs.off.runTask), [...OLD_RUN_TASK_KEYS], 'a run without the block keeps the old runTask keys');
  assert.deepEqual(runs.on.claimed, runs.off.claimed, 'claimed is unchanged');
  assert.equal(runs.on.infraError, runs.off.infraError);
  // Phase 71 (71-03) writes schema-2 raw records, and a v2 row carries the
  // block as fastMode and its jev summary as the exposure (71-CONTEXT D-08,
  // amended 2026-10-16). The schema-1 rows of the same records stay
  // identical; the v2 rows differ in exactly those two blocks.
  const v1Row = (record) => toCommittedRow({ ...record, schemaVersion: 1 });
  assert.deepEqual(v1Row(runs.on), v1Row(runs.off), 'the schema-1 committed rows are identical');
  assert.deepEqual(Object.keys(v1Row(runs.on)), [...RUN_ROW_KEYS]);
  const { fastMode: onFastMode, jev: onJev, ...onRest } = toCommittedRow(runs.on);
  const { fastMode: offFastMode, jev: offJev, ...offRest } = toCommittedRow(runs.off);
  assert.deepEqual(onRest, offRest, 'the v2 committed rows differ only in fastMode and jev');
  assert.equal(offFastMode, null);
  assert.equal(onFastMode.outcome, runs.on.runTask.fastMode.outcome);
  assert.equal(offJev.source, null);
  assert.equal(onJev.source, 'summary');
  assert.deepEqual(validateCommittedRow(toCommittedRow(runs.on)), { ok: true, errors: [] });
  assert.deepEqual(validateCommittedRow(toCommittedRow(runs.off)), { ok: true, errors: [] });
});

// --- producer/validator parity ---------------------------------------------------------------

test('parity', () => {
  assert.deepEqual([...FAST_MODE_BLOCK_KEYS], [...FsbFastPath.FAST_MODE_BLOCK_KEYS], 'block keys match the extension');
  assert.deepEqual([...FAST_MODE_SUMMARY_KEYS], [...FsbFastPath.FAST_MODE_SUMMARY_KEYS], 'summary keys match the extension');
  assert.deepEqual([...FAST_MODE_OUTCOMES], [...FsbFastPath.FAST_MODE_OUTCOMES], 'outcomes match the extension');
  for (const list of [FAST_MODE_BLOCK_KEYS, FAST_MODE_SUMMARY_KEYS, FAST_MODE_OUTCOMES]) assert.ok(Object.isFrozen(list));

  // Every string the producer can write passes the bench token rule, so a
  // real block never loses a value to 'other'.
  const tokens = [].concat(
    ...Object.values(FsbFastPath.FAST_MODE_REASONS),
    FsbFastPath.FAST_MODE_HUMAN_GATES,
    FsbFastPath.FAST_MODE_ESCALATION_CODES,
    Object.keys(FsbFastPath.BUDGET_PROFILES || { autopilot: 1, run_task: 1 }),
    ['calibrated', 'uncalibrated', 'snapshot_changed'],
  );
  for (const token of tokens) {
    assert.match(token, /^[a-z_]{1,40}$/, `producer code ${token} fits the bench token rule`);
    assert.notEqual(token, '__proto__');
  }
  for (const outcome of FsbFastPath.FAST_MODE_OUTCOMES) {
    for (const reason of FsbFastPath.FAST_MODE_REASONS[outcome]) {
      const block = { outcome, reason, uncertain_unobserved: null, human_gate: null, budget_profile: 'run_task', jev: { ...Z } };
      assert.deepEqual(projectFastMode(block), block, `${outcome}/${reason} projects unchanged`);
    }
  }
  const escalations = Object.fromEntries(FsbFastPath.FAST_MODE_ESCALATION_CODES.slice(0, 64).map((code, i) => [code, i]));
  assert.deepEqual(projectFastMode(blockWith({ ...U, escalations })).jev.escalations, escalations,
    'producer escalation codes survive projection');
});
