// Phase 71 seeded synthetic campaigns (D-19, RESEARCH Pattern 7): schema-1
// baseline rows and schema-2 candidate rows with chosen true effects, built
// through toCommittedRow and checked by validateCommittedRow, from mulberry32
// only. The gate evaluator, its CLI and the power script share this generator.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CORE_TASK_IDS_SYNTHETIC,
  SYNTHETIC_CANDIDATE_SHA,
  SYNTHETIC_DEFAULT_CREATED_AT,
  SYNTHETIC_PIN_SHA,
  SYNTHETIC_TASK_BASE_MS,
  defaultIdentity,
  makeCampaign,
  makeRawCampaign,
  standardNormal,
} from '../scripts/bench/gate/lib/synthetic.mjs';
import {
  RUN_ROW_KEYS,
  RUN_ROW_KEYS_V2,
  buildSchedule,
  toCommittedRow,
  validateCommittedRow,
} from '../scripts/bench/lib/runs.mjs';
import { median, mulberry32 } from '../scripts/bench/lib/stats.mjs';

const counted = (row) => row.infraError === null;
const onRows = (runs) => runs.filter((row) => row.arm === 'autopilot' && row.condition === 'on');
const offRows = (runs) => runs.filter((row) => row.arm === 'autopilot' && row.condition === 'off');

function assertAllValid(runs) {
  for (const row of runs) assert.deepEqual(validateCommittedRow(row), { ok: true, errors: [] }, row.runId);
}

// A small schema-2 autopilot campaign with conditions off and on.
function candidate(overrides = {}) {
  return makeCampaign({ seed: 7, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 4, ...overrides });
}

test('exports: 12 synthetic core task ids, 12 base times, the pin and candidate shas and the fixed createdAt', () => {
  assert.equal(CORE_TASK_IDS_SYNTHETIC.length, 12);
  assert.deepEqual(CORE_TASK_IDS_SYNTHETIC, Array.from({ length: 12 }, (_, i) => `core-syn-${String(i + 1).padStart(2, '0')}`));
  for (const id of CORE_TASK_IDS_SYNTHETIC) assert.match(id, /^(?:core|live)-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(SYNTHETIC_TASK_BASE_MS.length, 12);
  assert.ok(SYNTHETIC_TASK_BASE_MS.every((ms) => Number.isInteger(ms) && ms > 0));
  assert.ok(SYNTHETIC_PIN_SHA.startsWith('8a058bdf'));
  assert.match(SYNTHETIC_PIN_SHA, /^[0-9a-f]{40}$/);
  assert.match(SYNTHETIC_CANDIDATE_SHA, /^[0-9a-f]{40}$/);
  assert.notEqual(SYNTHETIC_CANDIDATE_SHA, SYNTHETIC_PIN_SHA);
  assert.equal(SYNTHETIC_DEFAULT_CREATED_AT, '2026-11-02T00:00:00.000Z');
  assert.ok(Object.isFrozen(CORE_TASK_IDS_SYNTHETIC) && Object.isFrozen(SYNTHETIC_TASK_BASE_MS));
});

test('a schema-1 baseline: v1 rows with ids and orders from buildSchedule, all valid, pin identity', () => {
  const { identity, runs } = makeCampaign({ seed: 66, schemaVersion: 1, campaignId: 'core-baseline-66', arms: ['autopilot', 'claude'], rounds: 3 });
  const schedule = buildSchedule({ campaignId: 'core-baseline-66', taskIds: CORE_TASK_IDS_SYNTHETIC, rounds: 3, arms: ['autopilot', 'claude'], seed: 66 });
  assert.equal(runs.length, schedule.length);
  assert.equal(runs.length, 72);
  runs.forEach((row, i) => {
    assert.deepEqual(Object.keys(row), [...RUN_ROW_KEYS]);
    assert.equal(row.schemaVersion, 1);
    for (const key of ['campaignId', 'runId', 'round', 'order', 'taskId', 'arm']) assert.equal(row[key], schedule[i][key], key);
  });
  assertAllValid(runs);
  assert.equal(identity.campaignId, 'core-baseline-66');
  assert.ok(identity.git.sha.startsWith('8a058bdf'));
  assert.deepEqual(identity.schedule, { runs: 72, rounds: 3, arms: ['autopilot', 'claude'], seed: 66, cooldownMs: 3000 });
  assert.equal(identity.gate, undefined, 'the pin runner records no gate');
  assert.ok(identity.hosts.claude, 'a campaign with the claude arm records hosts.claude');
  assert.throws(() => makeCampaign({ seed: 1, schemaVersion: 1, conditions: ['off'] }), /conditions/);
});

test('a schema-2 candidate: v2 rows with condition-suffixed ids from buildSchedule, all valid', () => {
  const { identity, runs } = candidate({ campaignId: 'core-gate-71-autopilot', scheduleSeed: 71 });
  const schedule = buildSchedule({ campaignId: 'core-gate-71-autopilot', taskIds: CORE_TASK_IDS_SYNTHETIC, rounds: 4, arms: ['autopilot'], seed: 71, conditions: ['off', 'on'] });
  assert.equal(runs.length, 96);
  runs.forEach((row, i) => {
    assert.deepEqual(Object.keys(row), [...RUN_ROW_KEYS_V2]);
    assert.equal(row.schemaVersion, 2);
    for (const key of ['campaignId', 'runId', 'round', 'order', 'taskId', 'arm', 'condition']) assert.equal(row[key], schedule[i][key], key);
  });
  assertAllValid(runs);
  assert.deepEqual(identity.schedule, { runs: 96, rounds: 4, arms: ['autopilot'], seed: 71, cooldownMs: 3000, conditions: ['off', 'on'] });
  assert.equal(identity.git.sha, SYNTHETIC_CANDIDATE_SHA);
  assert.equal(identity.hosts.claude, undefined, 'an autopilot-only campaign records no claude host, as run-bench does');
});

test('rows come from toCommittedRow over the raw records, and schema follows the raw schema', () => {
  for (const options of [
    { seed: 3, schemaVersion: 1, arms: ['autopilot', 'claude'], rounds: 2 },
    { seed: 3, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 2 },
    { seed: 3, schemaVersion: 2, arms: ['claude'], conditions: ['off'], rounds: 2 },
  ]) {
    const raw = makeRawCampaign(options);
    const rows = makeCampaign(options);
    assert.deepEqual(rows.identity, raw.identity);
    assert.deepEqual(rows.runs, raw.raws.map(toCommittedRow));
    assert.ok(raw.raws.every((record) => record.schemaVersion === options.schemaVersion));
  }
});

test('pass/fail is Bernoulli(task rate + completion effect) per run', () => {
  const all = candidate({ rounds: 2, taskRates: 1 });
  assert.ok(all.runs.every((row) => row.pass === true));
  const none = candidate({ rounds: 2, taskRates: 0 });
  assert.ok(none.runs.every((row) => row.pass === false));
  const big = candidate({ seed: 11, rounds: 40, taskRates: 0.8, effect: { 'autopilot/on': { completion: -0.2 } } });
  const rate = (rows) => rows.filter((row) => row.pass).length / rows.length;
  assert.ok(Math.abs(rate(offRows(big.runs)) - 0.8) < 0.06, `off ${rate(offRows(big.runs))}`);
  assert.ok(Math.abs(rate(onRows(big.runs)) - 0.6) < 0.06, `on ${rate(onRows(big.runs))}`);
  const perTask = candidate({ rounds: 3, taskRates: CORE_TASK_IDS_SYNTHETIC.map((_, k) => (k < 6 ? 1 : 0)) });
  for (const row of perTask.runs) assert.equal(row.pass, CORE_TASK_IDS_SYNTHETIC.indexOf(row.taskId) < 6, row.runId);
  assert.ok(perTask.runs.filter((row) => row.category === 'mixed').every((row) => CORE_TASK_IDS_SYNTHETIC.indexOf(row.taskId) < 6));
});

test('wallMs is lognormal around base x speed effect; failed runs keep a wallMs; infra rows do not', () => {
  const exact = candidate({ rounds: 2, wallMs: { sigma: 0 }, effect: { 'autopilot/on': { speed: 0.5 } } });
  for (const row of exact.runs) {
    const base = SYNTHETIC_TASK_BASE_MS[CORE_TASK_IDS_SYNTHETIC.indexOf(row.taskId)];
    assert.equal(row.wallMs, Math.round(base * (row.condition === 'on' ? 0.5 : 1)), row.runId);
  }
  const noisy = candidate({ seed: 5, rounds: 40, wallMs: { sigma: 0.3 }, effect: { 'autopilot/on': { speed: 0.7 } } });
  const logRatios = noisy.runs.map((row) => Math.log(row.wallMs / SYNTHETIC_TASK_BASE_MS[CORE_TASK_IDS_SYNTHETIC.indexOf(row.taskId)]));
  const onLog = logRatios.filter((_, i) => noisy.runs[i].condition === 'on');
  const offLog = logRatios.filter((_, i) => noisy.runs[i].condition === 'off');
  assert.ok(Math.abs(median(offLog)) < 0.05, `off median log ${median(offLog)}`);
  assert.ok(Math.abs(median(onLog) - Math.log(0.7)) < 0.05, `on median log ${median(onLog)}`);
  const sd = Math.sqrt(offLog.reduce((s, x) => s + x * x, 0) / offLog.length);
  assert.ok(Math.abs(sd - 0.3) < 0.04, `log sd ${sd}`);
  const perGroupSigma = candidate({ rounds: 2, wallMs: { sigma: { 'autopilot/off': 0, 'autopilot/on': 0.3 } } });
  for (const row of offRows(perGroupSigma.runs)) {
    assert.equal(row.wallMs, SYNTHETIC_TASK_BASE_MS[CORE_TASK_IDS_SYNTHETIC.indexOf(row.taskId)]);
  }
  const failing = candidate({ rounds: 2, taskRates: 0 });
  assert.ok(failing.runs.every((row) => Number.isFinite(row.wallMs) && row.wallMs > 0));
  const infra = candidate({ rounds: 3, infra: { rate: 1, code: 'hub_lost' } });
  for (const row of infra.runs) {
    assert.equal(row.infraError, 'hub_lost');
    assert.equal(row.wallMs, null);
    assert.equal(row.pass, false);
    assert.deepEqual(row.safety, { requestOvercount: null, unexpectedMutations: null, claimedSuccessOnFail: null });
    assert.equal(row.jev.source, null);
  }
  assertAllValid(infra.runs);
  const someInfra = candidate({ seed: 9, rounds: 10, infra: { rate: 0.1 } });
  const infraRows = someInfra.runs.filter((row) => row.infraError !== null);
  assert.ok(infraRows.length > 0 && infraRows.length < someInfra.runs.length / 4);
  assert.ok(infraRows.every((row) => row.infraError === 'provider_error'), 'the default infra code');
});

test('standardNormal is Box-Muller over mulberry32: mean near 0, sd near 1, deterministic', () => {
  const rnd = mulberry32(42);
  const xs = Array.from({ length: 20000 }, () => standardNormal(rnd));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.03 && Math.abs(sd - 1) < 0.03, `mean ${mean} sd ${sd}`);
  const again = mulberry32(42);
  assert.equal(standardNormal(again), xs[0]);
});

test('on rows: Bernoulli(actRate) from a jevMeasurement; calibration and models; the raw summary agrees', () => {
  const models = [{ servedModel: 'jev-syn-1', instrumentVersion: 'fsb-jev-instrument-syn' }];
  const options = { seed: 13, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 30, jev: { actRate: 0.7, models } };
  const { runs } = makeCampaign(options);
  const on = onRows(runs);
  assert.ok(on.every((row) => row.jev.source === 'measurement'));
  const share = on.filter((row) => row.jev.acted === true).length / on.length;
  assert.ok(Math.abs(share - 0.7) < 0.06, `acted share ${share}`);
  for (const row of on) {
    assert.deepEqual(row.jev.servedModels, ['jev-syn-1']);
    assert.deepEqual(row.jev.instrumentVersions, ['fsb-jev-instrument-syn']);
    assert.deepEqual(row.jev.calibrationStatuses, row.jev.acted ? { calibrated: row.jev.fastSteps } : {});
    assert.equal(row.jev.acted, row.jev.fastSteps > 0);
    assert.ok(row.jev.jevCalls >= 1);
    assert.deepEqual(row.flags, []);
  }
  for (const row of offRows(runs)) {
    assert.equal(row.jev.source, null);
    assert.equal(row.jev.acted, null);
    assert.equal(row.fastMode, null);
  }
  const { raws } = makeRawCampaign(options);
  for (const raw of raws.filter((record) => record.condition === 'on')) {
    const summary = raw.runTask.fastMode.jev;
    const commands = raw.jevMeasurement.commands;
    assert.equal(summary.attempts, raw.jevMeasurement.attempts.length);
    assert.equal(summary.calls, commands.reduce((s, c) => s + c.jevCalls, 0));
    assert.equal(summary.fast_steps, commands.reduce((s, c) => s + c.fastSteps, 0));
  }
  const uncalibrated = makeCampaign({ ...options, rounds: 4, jev: { actRate: 1, calibrated: false } });
  for (const row of onRows(uncalibrated.runs)) assert.deepEqual(row.jev.calibrationStatuses, { uncalibrated: row.jev.fastSteps });
  const twoModels = makeCampaign({ ...options, rounds: 4, jev: {
    actRate: 1,
    models: [{ servedModel: 'jev-a', instrumentVersion: 'inst-a' }, { servedModel: 'jev-b', instrumentVersion: 'inst-a' }],
  } });
  const served = new Set(onRows(twoModels.runs).flatMap((row) => row.jev.servedModels));
  assert.deepEqual([...served].sort(), ['jev-a', 'jev-b']);
});

test('exposure rates: missing (summary, flagged), no_block (known zero), unknown and detail-missing (null)', () => {
  const base = { seed: 17, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 6 };
  const missing = makeCampaign({ ...base, jev: { actRate: 0.5, missingRate: 1 } });
  const missingOn = onRows(missing.runs).filter(counted);
  assert.ok(missingOn.some((row) => row.jev.acted === true) && missingOn.some((row) => row.jev.acted === false));
  for (const row of missingOn) {
    assert.equal(row.jev.source, 'summary');
    assert.equal(row.jev.acted, row.jev.fastSteps > 0);
    assert.ok(row.jev.jevCalls >= 1);
    assert.deepEqual(row.flags, ['jev_measurement_missing']);
    assert.notEqual(row.fastMode, null);
  }
  const { raws } = makeRawCampaign({ ...base, jev: { actRate: 0.5, missingRate: 1 } });
  for (const raw of raws.filter((record) => record.condition === 'on')) {
    assert.equal(raw.jevMeasurement, null);
    assert.ok(raw.runTask.fastMode.jev.attempts >= 1, 'missing rows report at least one attempt');
  }

  const noBlock = makeCampaign({ ...base, jev: { noBlockRate: 1 } });
  for (const row of onRows(noBlock.runs)) {
    assert.equal(row.jev.source, 'no_block');
    assert.equal(row.jev.acted, false);
    assert.equal(row.jev.jevCalls, 0);
    assert.deepEqual(row.flags, [], 'a no-block row carries no flag');
    assert.equal(row.fastMode, null);
  }

  const unknown = makeCampaign({ ...base, jev: { unknownRate: 1 } });
  for (const row of onRows(unknown.runs)) {
    assert.equal(row.jev.source, null);
    assert.equal(row.jev.acted, null);
    assert.deepEqual(row.flags, []);
    assert.notEqual(row.fastMode, null, 'the fast_mode block is there, with jev null');
  }
  const unknownRaw = makeRawCampaign({ ...base, jev: { unknownRate: 1 } });
  for (const raw of unknownRaw.raws.filter((record) => record.condition === 'on')) {
    assert.equal(raw.jevMeasurement, null);
    assert.equal(raw.runTask.fastMode.jev, null);
  }

  const detail = makeCampaign({ ...base, jev: { detailMissingRate: 1 } });
  for (const row of onRows(detail.runs)) {
    assert.equal(row.jev.source, null, 'never no_block when the session detail was never read');
    assert.equal(row.jev.acted, null);
    assert.deepEqual(row.flags, ['session_detail_missing']);
    assert.equal(row.fastMode, null);
  }

  const mixed = makeCampaign({ ...base, rounds: 20, jev: { actRate: 0.8, missingRate: 0.1, noBlockRate: 0.1, unknownRate: 0.1, detailMissingRate: 0.1 } });
  const sources = new Set(onRows(mixed.runs).map((row) => (row.flags.includes('session_detail_missing') ? 'detail' : String(row.jev.source))));
  assert.deepEqual([...sources].sort(), ['detail', 'measurement', 'no_block', 'null', 'summary']);
  for (const row of offRows(mixed.runs)) assert.equal(row.jev.source, null);
  assertAllValid([...missing.runs, ...noBlock.runs, ...unknown.runs, ...detail.runs, ...mixed.runs]);
  assert.throws(() => makeCampaign({ ...base, jev: { missingRate: 0.6, noBlockRate: 0.6 } }), /rate/);
});

test('leakOff puts a condition leak on the first count counted off rows, for each kind', () => {
  const base = { seed: 19, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 4 };
  const expected = {
    calls: { source: 'measurement', acted: false, jevCalls: 2, fastSteps: 0, fastMode: false },
    local: { source: 'measurement', acted: false, jevCalls: 0, fastSteps: 0, fastMode: false },
    summary: { source: 'summary', acted: false, jevCalls: 0, fastSteps: 0, fastMode: true },
  };
  for (const [kind, want] of Object.entries(expected)) {
    const { runs } = makeCampaign({ ...base, jev: { leakOff: { count: 2, kind } } });
    const off = offRows(runs).filter(counted);
    off.slice(0, 2).forEach((row) => {
      assert.equal(row.jev.source, want.source, kind);
      assert.equal(row.jev.acted, want.acted, kind);
      assert.equal(row.jev.jevCalls, want.jevCalls, kind);
      assert.equal(row.jev.fastSteps, want.fastSteps, kind);
      assert.equal(row.fastMode !== null, want.fastMode, kind);
    });
    for (const row of off.slice(2)) assert.equal(row.jev.source, null, `${kind}: only the first count rows leak`);
    assertAllValid(runs);
    if (kind === 'local') assert.deepEqual(off[0].jev.fallbacks, { sensitive_goal: 1 });
  }
  assert.throws(() => makeCampaign({ ...base, jev: { leakOff: { count: 1, kind: 'bogus' } } }), /leakOff/);
  assert.throws(() => makeCampaign({ ...base, rounds: 1, jev: { leakOff: { count: 13, kind: 'calls' } } }), /leakOff/);
});

test('safety injections land on the chosen (condition, acted) cells and nowhere else', () => {
  const base = { seed: 23, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 6, taskRates: 0.7, jev: { actRate: 0.5 } };
  const plain = makeCampaign(base);
  for (const row of plain.runs.filter(counted)) {
    assert.deepEqual(row.safety, { requestOvercount: 0, unexpectedMutations: 0, claimedSuccessOnFail: false }, row.runId);
  }
  const { runs } = makeCampaign({ ...base, safety: { events: [
    { condition: 'on', acted: true, kind: 'requestOvercount', count: 2 },
    { condition: 'on', acted: false, kind: 'unexpectedMutations', count: 1, value: 3 },
    { condition: 'off', kind: 'claimedSuccessOnFail', count: 2 },
    { condition: 'on', acted: false, kind: 'unverifiable', count: 1 },
  ] } });
  assertAllValid(runs);
  const over = runs.filter((row) => row.safety.requestOvercount > 0);
  assert.equal(over.length, 2);
  assert.ok(over.every((row) => row.condition === 'on' && row.jev.acted === true && row.safety.requestOvercount === 1));
  const mutations = runs.filter((row) => row.safety.unexpectedMutations > 0);
  assert.equal(mutations.length, 1);
  assert.ok(mutations[0].condition === 'on' && mutations[0].jev.acted === false && mutations[0].safety.unexpectedMutations === 3);
  const claims = runs.filter((row) => row.safety.claimedSuccessOnFail === true);
  assert.equal(claims.length, 2);
  assert.ok(claims.every((row) => row.condition === 'off' && row.pass === false && row.claimed.status === 'success'));
  const unverifiable = runs.filter(counted).filter((row) => row.safety.requestOvercount === null);
  assert.equal(unverifiable.length, 1);
  assert.equal(unverifiable[0].safety.unexpectedMutations, null);
  assert.equal(unverifiable[0].jev.acted, false);

  const unknownCell = makeCampaign({ ...base, jev: { actRate: 0.8, unknownRate: 0.2 }, safety: { events: [{ condition: 'on', acted: null, kind: 'requestOvercount', count: 1 }] } });
  const hit = unknownCell.runs.filter((row) => row.safety.requestOvercount > 0);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].jev.acted, null);
  assert.equal(hit[0].condition, 'on');

  const baseline = makeCampaign({ seed: 29, schemaVersion: 1, arms: ['autopilot', 'claude'], rounds: 4, taskRates: 0.7, safety: { events: [
    { arm: 'claude', kind: 'requestOvercount', count: 1 },
    { arm: 'claude', kind: 'claimedSuccessOnFail', count: 1 },
    { arm: 'autopilot', kind: 'claimedSuccessOnFail', count: 1 },
  ] } });
  assertAllValid(baseline.runs);
  const sidecar = [...baseline.safety.entries()].filter(([, value]) => value.requestOvercount > 0);
  assert.equal(sidecar.length, 1);
  assert.ok(sidecar[0][0].endsWith('-claude'));
  assert.equal(baseline.runs.filter((row) => row.arm === 'claude' && row.pass === false && row.claimed.completeTask === true).length, 1);
  assert.equal(baseline.runs.filter((row) => row.arm === 'autopilot' && row.pass === false && row.claimed.status === 'success').length, 1);
  assert.equal(baseline.safety.size, baseline.runs.filter(counted).length, 'the sidecar covers every counted row');

  assert.throws(() => makeCampaign({ ...base, rounds: 1, safety: { events: [{ condition: 'on', acted: true, kind: 'requestOvercount', count: 50 }] } }), /safety/);
  assert.throws(() => makeCampaign({ ...base, safety: { events: [{ condition: 'on', kind: 'bogus' }] } }), /safety/);
});

test('fastMode block: done on pass, blocked on fail; false done, ambiguous on pass, missing and status mismatch', () => {
  const base = { seed: 31, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 6, taskRates: 0.7, jev: { actRate: 0.5 } };
  const plain = makeCampaign(base);
  for (const row of onRows(plain.runs).filter(counted)) {
    assert.equal(row.fastMode.outcome, row.pass ? 'done' : 'blocked', row.runId);
    assert.equal(row.safety.claimedSuccessOnFail, false);
  }
  for (const row of offRows(plain.runs)) assert.equal(row.fastMode, null);

  const falseDone = makeCampaign({ ...base, fastMode: { falseDone: [{ acted: true, count: 1 }] } });
  const fd = onRows(falseDone.runs).filter((row) => row.pass === false && row.fastMode && row.fastMode.outcome === 'done');
  assert.equal(fd.length, 1);
  assert.equal(fd[0].jev.acted, true);
  assert.equal(fd[0].claimed.status, 'success', 'without statusMismatch the status agrees with the typed done');
  assert.equal(fd[0].safety.claimedSuccessOnFail, true);

  const mismatch = makeCampaign({ ...base, fastMode: { falseDone: [{ acted: true, count: 1 }], statusMismatch: true } });
  const mm = onRows(mismatch.runs).filter((row) => row.pass === false && row.fastMode && row.fastMode.outcome === 'done');
  assert.equal(mm.length, 1);
  assert.equal(mm[0].claimed.status, 'error');
  assert.equal(mm[0].safety.claimedSuccessOnFail, true, 'the typed done alone is a claimed success (M-70-04)');

  const ambiguous = makeCampaign({ ...base, fastMode: { ambiguousOnPass: [{ acted: false, count: 2 }] } });
  const amb = onRows(ambiguous.runs).filter((row) => row.fastMode && row.fastMode.outcome === 'ambiguous');
  assert.equal(amb.length, 2);
  assert.ok(amb.every((row) => row.pass === true && row.jev.acted === false && row.safety.claimedSuccessOnFail === false));

  const missing = makeCampaign({ ...base, fastMode: { missingRate: 1 } });
  for (const row of onRows(missing.runs)) {
    assert.equal(row.fastMode, null);
    assert.equal(row.jev.source, 'measurement', 'the jevMeasurement still records exposure');
  }
  const claude = makeCampaign({ seed: 31, schemaVersion: 2, arms: ['claude'], conditions: ['off'], rounds: 2 });
  for (const row of claude.runs) {
    assert.equal(row.fastMode, null);
    assert.equal(row.jev.source, null);
    assert.equal(row.claimed.completeTask, row.pass);
  }
  assertAllValid([...falseDone.runs, ...mismatch.runs, ...ambiguous.runs, ...missing.runs, ...claude.runs]);
});

test('identity: the shared fields, optional gate and resumes, and overrides that merge in', () => {
  const identity = defaultIdentity();
  assert.equal(identity.createdAt, SYNTHETIC_DEFAULT_CREATED_AT);
  assert.deepEqual(Object.keys(identity.git), ['sha', 'dirty']);
  assert.equal(identity.git.dirty, false);
  for (const key of ['version', 'model', 'toolSearchEnv', 'envKeyNamesSha256']) assert.ok(identity.hosts.claude[key], key);
  assert.equal(identity.provider.requestedModel, 'grok-4.3');
  assert.match(identity.chrome.browser, /^Chrome\/\d+\./);
  assert.equal(identity.tasks.length, 12);
  for (const task of identity.tasks) {
    assert.deepEqual(Object.keys(task), ['id', 'version', 'fixtureSha256']);
    assert.match(task.fixtureSha256, /^[0-9a-f]{64}$/);
  }
  assert.deepEqual(identity.tasks.map((task) => task.id), [...CORE_TASK_IDS_SYNTHETIC]);
  for (const key of ['rounds', 'arms', 'seed']) assert.ok(key in identity.schedule, key);
  assert.equal(identity.gate, undefined);
  assert.equal(identity.resumes, undefined);

  const merged = defaultIdentity({
    hosts: { claude: { version: '9.9.9 (Claude Code)' } },
    gate: { path: 'scripts/bench/gate/release-gate-v1.0.0.json', sha256: 'e'.repeat(64) },
    resumes: [{ at: '2026-11-03T00:00:00.000Z', claudeVersion: '9.9.9 (Claude Code)', chromeBrowser: 'Chrome/147.0.1.0', launchFlags: null }],
    chrome: undefined,
  });
  assert.equal(merged.hosts.claude.version, '9.9.9 (Claude Code)');
  assert.equal(merged.hosts.claude.model, identity.hosts.claude.model, 'nested fields not named stay');
  assert.deepEqual(merged.gate, { path: 'scripts/bench/gate/release-gate-v1.0.0.json', sha256: 'e'.repeat(64) });
  assert.equal(merged.resumes.length, 1);
  assert.equal('chrome' in merged, false, 'an undefined override removes the key');
  assert.deepEqual(defaultIdentity(), identity, 'defaultIdentity never mutates a shared default');

  const withGate = makeCampaign({ seed: 1, schemaVersion: 2, rounds: 1, identity: { gate: { path: 'g.json', sha256: 'f'.repeat(64) }, git: { dirty: true } } });
  assert.deepEqual(withGate.identity.gate, { path: 'g.json', sha256: 'f'.repeat(64) });
  assert.equal(withGate.identity.git.dirty, true);
  assert.equal(withGate.identity.git.sha, SYNTHETIC_CANDIDATE_SHA);
  assert.equal(withGate.identity.createdAt, SYNTHETIC_DEFAULT_CREATED_AT);
  const later = makeCampaign({ seed: 1, schemaVersion: 2, rounds: 1, createdAt: '2026-12-01T00:00:00.000Z' });
  assert.equal(later.identity.createdAt, '2026-12-01T00:00:00.000Z');
  assert.ok(later.runs.every((row) => Date.parse(row.startedAt) > Date.parse('2026-12-01T00:00:00.000Z')));
});

test('determinism: the same arguments give deep-equal output; another seed differs', () => {
  const options = { seed: 37, schemaVersion: 2, arms: ['autopilot'], conditions: ['off', 'on'], rounds: 3, taskRates: 0.85,
    jev: { actRate: 0.6, unknownRate: 0.05 }, safety: { events: [{ condition: 'on', acted: true, kind: 'requestOvercount', count: 1 }] } };
  assert.deepEqual(makeCampaign(options), makeCampaign(options));
  assert.notDeepEqual(makeCampaign({ ...options, seed: 38 }).runs, makeCampaign(options).runs);
  const sameSchedule = makeCampaign({ ...options, seed: 38, scheduleSeed: 37 });
  assert.deepEqual(sameSchedule.runs.map((row) => row.runId), makeCampaign(options).runs.map((row) => row.runId),
    'scheduleSeed fixes the ABBA order while seed changes the draws');
  // Adding an exposure rate leaves pass/fail and wall times alone (separate streams).
  const plain = makeCampaign({ ...options, jev: { actRate: 0.6 }, safety: undefined });
  const withUnknown = makeCampaign({ ...options, jev: { actRate: 0.6, unknownRate: 0.3 }, safety: undefined });
  assert.deepEqual(withUnknown.runs.map((row) => [row.pass, row.wallMs]), plain.runs.map((row) => [row.pass, row.wallMs]));
});

test('a custom task list: base times repeat in order, the first half is mixed, explicit lists must match', () => {
  const taskIds = ['core-a', 'core-b', 'core-c'];
  const { runs, identity } = makeCampaign({ seed: 2, schemaVersion: 2, rounds: 1, taskIds, wallMs: { sigma: 0 } });
  assert.equal(runs.length, 6);
  for (const row of runs) {
    const k = taskIds.indexOf(row.taskId);
    assert.equal(row.wallMs, SYNTHETIC_TASK_BASE_MS[k]);
    assert.equal(row.category, k === 0 ? 'mixed' : 'click-heavy');
  }
  assert.deepEqual(identity.tasks.map((task) => task.id), taskIds);
  assert.throws(() => makeCampaign({ seed: 2, schemaVersion: 2, rounds: 1, taskIds, taskRates: [0.9, 0.9] }), /one value per task/);
});

test('option checking: unknown keys and the cursor arm are refused', () => {
  assert.throws(() => makeCampaign({ seed: 1, schemaVersion: 2, bogus: true }), /unknown option/);
  assert.throws(() => makeCampaign({ seed: 1, schemaVersion: 2, jev: { actRate: 0.5, bogus: 1 } }), /unknown option/);
  assert.throws(() => makeCampaign({ seed: 1, schemaVersion: 3 }), /schemaVersion/);
  assert.throws(() => makeCampaign({ seed: 1, schemaVersion: 2, arms: ['cursor'] }), /cursor/);
  assert.throws(() => makeCampaign({ seed: 1.5, schemaVersion: 2 }), /seed/);
});

test('source hygiene: mulberry32 only; no clock, environment or filesystem reads', () => {
  const source = readFileSync(new URL('../scripts/bench/gate/lib/synthetic.mjs', import.meta.url), 'utf8');
  assert.equal(/Math\.random|Date\.now|process\.env|readFileSync/.test(source), false);
  assert.match(source, /mulberry32/);
});
