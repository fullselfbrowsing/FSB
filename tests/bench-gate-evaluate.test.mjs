// Phase 71 Plan 06 (EVAL-02, EVAL-01; CONTEXT D-05, D-10..D-16, D-19 and the
// 2026-10-16 amendments): the pure gate evaluator. Plan 07 (D-17, D-18) adds
// the decision file, the typed release claims and the gate report, built from
// the same fixtures.
//
// One seeded synthetic campaign recipe per verdict branch, built with
// makeCampaign (scripts/bench/gate/lib/synthetic.mjs). Every campaign runs the
// gate's 30 rounds and schedule seeds; the bootstrap uses 400 iterations
// through the options override (the CLI never overrides it). The test gate is
// the committed gate with its corpus lock set to the synthetic corpus, and the
// candidate identities record the committed gate's real sha256.
//
// Pure: no git, no network, no port. The only file reads are the gate file
// and the evaluator's own source (the purity and wallMs-only checks).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  FALLBACK_STATUSES,
  REASONS,
  REFUSAL_CODES,
  VERDICTS,
  aaFloor,
  campaignCompleteness,
  chromeMajor,
  completionComparison,
  evaluateFallback,
  evaluateGate,
  exerciseStats,
  groupRows,
  identityMismatches,
  jevSafety,
  jevVerdict,
  meetsMinRounds,
  nonJevSafety,
  nonJevVerdict,
  resumeDrift,
  safetyEventsOf,
  sentinelCheck,
  speedComparison,
} from '../scripts/bench/gate/lib/evaluate.mjs';
import {
  ALLOWED_CLAIM_SOURCES,
  CLAIM_TEMPLATES,
  V6_ACTIONS,
  buildClaims,
  buildDecision,
  checkClaims,
  describePath,
  formatClaimValue,
  renderClaim,
  validateDecision,
} from '../scripts/bench/gate/lib/decision.mjs';
import { corpusDigest, loadGate } from '../scripts/bench/gate/lib/gate.mjs';
import {
  CALLER_EFFECT_SENTENCE,
  DIAGNOSTICS_HEADING,
  FALSE_DONE_SENTENCE,
  GATE_REPORT_SECTIONS,
  NO_ATTEMPT_SENTENCE,
  buildTables,
  renderGateReport,
} from '../scripts/bench/gate/lib/gate-report.mjs';
import { SYNTHETIC_CANDIDATE_SHA, SYNTHETIC_PIN_SHA, defaultIdentity, makeCampaign } from '../scripts/bench/gate/lib/synthetic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_FILE = 'scripts/bench/gate/release-gate-v1.0.0.json';
const EVALUATE_FILE = path.join(ROOT, 'scripts/bench/gate/lib/evaluate.mjs');
const { gate: REAL_GATE, sha256: GATE_SHA256 } = loadGate(path.join(ROOT, GATE_FILE));
const GATE = Object.freeze({ ...REAL_GATE, corpusLockSha256: corpusDigest(defaultIdentity().tasks) });
const ITERATIONS = 400;
const ROUNDS = REAL_GATE.campaigns.autopilot.minRounds;
const GATE_IDENTITY = Object.freeze({ gate: { path: GATE_FILE, sha256: GATE_SHA256 } });
const JEV_PATHS = ['jev-mcp-run-task', 'jev-autopilot'];

const clone = (value) => JSON.parse(JSON.stringify(value));
const unique = (values) => [...new Set(values)];

function mergeIdentity(extra) {
  return { ...clone(GATE_IDENTITY), ...(extra || {}) };
}

// The V1 baseline at the pin: schema-1 rows for autopilot and claude.
function baselineCampaign(options = {}) {
  return makeCampaign({ seed: 6601, scheduleSeed: REAL_GATE.campaigns.baseline.seed, schemaVersion: 1, rounds: ROUNDS, ...options });
}

// V4 core-gate-71-claude: the candidate build, condition off only.
function claudeCampaign(options = {}) {
  const { identity, ...rest } = options;
  return makeCampaign({
    seed: 6602, scheduleSeed: REAL_GATE.campaigns.claude.seed, arms: ['claude'], conditions: ['off'], rounds: ROUNDS,
    ...rest, identity: mergeIdentity(identity),
  });
}

// V4 core-gate-71-autopilot: off and on interleaved; 'on' is 0.70x by default.
function autopilotCampaign(options = {}) {
  const { identity, ...rest } = options;
  return makeCampaign({
    seed: 7101, scheduleSeed: REAL_GATE.campaigns.autopilot.seed, rounds: ROUNDS, effect: { 'autopilot/on': { speed: 0.7 } },
    ...rest, identity: mergeIdentity(identity),
  });
}

const BASELINE = baselineCampaign();
const CLAUDE = claudeCampaign();
const AUTOPILOT = autopilotCampaign();

function passingSuites() {
  return { ran: true, results: GATE.safety.verifySuites.map((command) => ({ command, exitCode: 0 })) };
}

function evaluate({ autopilot = AUTOPILOT, claude = CLAUDE, baseline = BASELINE, suites = passingSuites(), gate = GATE, fallback } = {}) {
  return evaluateGate({ gate, gateSha256: GATE_SHA256, baseline, autopilot, claude, suites, ...(fallback === undefined ? {} : { fallback }) },
    { iterations: ITERATIONS });
}

// A copy of a campaign whose rows were edited by `edit(runs)`.
function withRows(campaign, edit) {
  const runs = clone(campaign.runs);
  edit(runs);
  return { identity: clone(campaign.identity), runs, safety: campaign.safety };
}

const counted = (row) => row.infraError === null;
const onRows = (runs) => runs.filter((row) => row.condition === 'on' && counted(row));
const jevOf = (result) => result.paths['jev-mcp-run-task'];
const nonJevOf = (result) => result.paths['mcp-non-jev'];

function assertJev(result, verdict, reasons) {
  for (const name of JEV_PATHS) {
    assert.equal(result.paths[name].verdict, verdict, `${name} verdict (reasons ${result.paths[name].reasons.join(', ')})`);
    if (reasons) assert.deepEqual(result.paths[name].reasons, reasons, `${name} reasons`);
  }
}

// Every reason the suite sees, checked against REASONS at the end.
const SEEN_REASONS = new Set();
const SEEN_REFUSALS = new Set();
function record(result) {
  for (const entry of Object.values(result.paths || {})) for (const reason of entry.reasons) SEEN_REASONS.add(reason);
  for (const reason of (result.exercise && result.exercise.reasons) || []) SEEN_REASONS.add(reason);
  for (const reason of (result.sentinel && result.sentinel.reasons) || []) SEEN_REASONS.add(reason);
  for (const reason of (result.fallback && result.fallback.reasons) || []) SEEN_REASONS.add(reason);
  for (const refusal of [...(result.refusals || []), ...((result.fallback && result.fallback.refusals) || [])]) SEEN_REFUSALS.add(refusal.code);
  return result;
}

const PASS = record(evaluate());

// --- (1) Jev pass -------------------------------------------------------------------------

test('(1) Jev pass: 0.70x on vs off, equal completion, calibrated, one model pair, no events', () => {
  assertJev(PASS, 'pass', []);
  const [a, b] = JEV_PATHS.map((name) => PASS.paths[name]);
  assert.equal(a.label, GATE.paths['jev-mcp-run-task'].label);
  assert.equal(b.label, GATE.paths['jev-autopilot'].label);
  assert.deepEqual({ ...a, label: null }, { ...b, label: null }, 'both Jev paths share every number');
  const speed = a.criteria.speed;
  assert.ok(speed.ci[1] < 1 && speed.estimate <= 0.9 && speed.estimate < speed.aaFloor.ci[0], JSON.stringify(speed.ci));
  assert.ok(Math.abs(speed.estimate - 0.7) < 0.05, `estimate ${speed.estimate}`);
  assert.equal(PASS.exercise.status, 'exercised');
  assert.ok(PASS.exercise.actedShare >= GATE.exercise.minActedShare);
  assert.deepEqual(PASS.exercise.pairs.servedModels.length, 1);
  assert.equal(PASS.exercise.captureArm, 'by_construction');
  assert.equal(nonJevOf(PASS).verdict, 'pass');
  assert.equal(nonJevOf(PASS).source, 'primary');
  assert.deepEqual(PASS.inputs, { iterations: ITERATIONS, seed: GATE.bootstrap.seed, level: GATE.bootstrap.level });
});

// --- (2)-(4) Speed fails ------------------------------------------------------------------

test('(2) speed fail: a CI that crosses 1 (true 1.0) fails with ci_upper_not_below_1', () => {
  const result = record(evaluate({ autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 1.0 } } }) }));
  assertJev(result, 'fail');
  assert.ok(jevOf(result).reasons.includes('ci_upper_not_below_1'), jevOf(result).reasons.join(','));
  const { ci } = jevOf(result).criteria.speed;
  assert.ok(ci[0] < 1 && ci[1] >= 1, JSON.stringify(ci));
});

test('(3) speed fail: a practical effect too small (true 0.95, low noise, CI below 1) fails with estimate_above_max', () => {
  const result = record(evaluate({ autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 0.95 } }, wallMs: { sigma: 0.05 } }) }));
  assertJev(result, 'fail', ['estimate_above_max']);
  const speed = jevOf(result).criteria.speed;
  assert.ok(speed.ci[1] < 1 && speed.estimate > GATE.criteria.jevSpeed.maxEstimate, JSON.stringify(speed.ci));
});

test('(4) speed fail: an estimate inside the control A/A floor (noisy control) fails with not_below_aa_floor', () => {
  const result = record(evaluate({
    autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 0.85 } }, wallMs: { sigma: { 'autopilot/off': 0.8, 'autopilot/on': 0.1 } } }),
  }));
  assertJev(result, 'fail', ['not_below_aa_floor']);
  const speed = jevOf(result).criteria.speed;
  assert.ok(speed.ci[1] < 1 && speed.estimate <= 0.9, JSON.stringify(speed.ci));
  assert.ok(speed.estimate >= speed.aaFloor.ci[0], `estimate ${speed.estimate} floor ${speed.aaFloor.ci[0]}`);
});

// --- (5) Completion -----------------------------------------------------------------------

test('(5) completion fail: on 0.70 vs off 0.90 fails with completion_noninferiority', () => {
  const result = record(evaluate({ autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 0.7, completion: -0.2 } } }) }));
  assertJev(result, 'fail', ['completion_noninferiority']);
  const completion = jevOf(result).criteria.completion;
  assert.ok(completion.ci[0] <= -GATE.criteria.completionMargin, JSON.stringify(completion.ci));
  assert.equal(completion.margin, GATE.criteria.completionMargin);
  assert.equal(jevOf(result).criteria.speed.status, 'pass');
});

// --- (6)-(9) Safety -----------------------------------------------------------------------

test('(6) rule (a): one requestOvercount in an acted on run fails with acted_safety_event', () => {
  const autopilot = autopilotCampaign({ safety: { events: [{ kind: 'requestOvercount', arm: 'autopilot', condition: 'on', acted: true, count: 1 }] } });
  const result = record(evaluate({ autopilot }));
  assertJev(result, 'fail', ['acted_safety_event']);
  const { safety } = jevOf(result).criteria;
  assert.equal(safety.ruleA.events, 1);
  assert.equal(safety.ruleA.byKind.requestOvercount, 1);
  assert.equal(safety.ruleA.eventRunIds.length, 1);
});

test('(7) rule (b): more non-acted events in on than in off fails with excess_llm_path_events', () => {
  const autopilot = autopilotCampaign({
    safety: {
      events: [
        { kind: 'unexpectedMutations', arm: 'autopilot', condition: 'on', acted: false, count: 3 },
        { kind: 'unexpectedMutations', arm: 'autopilot', condition: 'off', count: 1 },
      ],
    },
  });
  const result = record(evaluate({ autopilot }));
  assertJev(result, 'fail', ['excess_llm_path_events']);
  const { ruleA, ruleB } = jevOf(result).criteria.safety;
  assert.equal(ruleA.events, 0);
  assert.equal(ruleB.on.events, 3);
  assert.equal(ruleB.off.events, 1);
  assert.ok(ruleB.on.rate > ruleB.off.rate);
});

test('(8) null safety evidence in one counted on run is inconclusive with safety_unverifiable, never zero', () => {
  const autopilot = autopilotCampaign({ safety: { events: [{ kind: 'unverifiable', arm: 'autopilot', condition: 'on', count: 1 }] } });
  const result = record(evaluate({ autopilot }));
  assertJev(result, 'inconclusive', ['safety_unverifiable']);
  const { safety } = jevOf(result).criteria;
  assert.equal(safety.ruleA.unverifiableRuns + safety.ruleB.on.unverifiableRuns, 1);
  assert.equal(safety.ruleA.events + safety.ruleB.on.events, 0);
});

test('(9) the tighten-only suites: not run is inconclusive, a failing suite fails, a missing result is inconclusive', () => {
  const notRun = record(evaluate({ suites: { ran: false, results: [] } }));
  assertJev(notRun, 'inconclusive', ['suites_not_run']);
  const absent = record(evaluateGate({ gate: GATE, gateSha256: GATE_SHA256, baseline: BASELINE, autopilot: AUTOPILOT, claude: CLAUDE },
    { iterations: ITERATIONS }));
  assertJev(absent, 'inconclusive', ['suites_not_run']);

  const failing = passingSuites();
  failing.results[0].exitCode = 1;
  const failed = record(evaluate({ suites: failing }));
  assertJev(failed, 'fail', ['tighten_only_suite_failed']);
  assert.deepEqual(jevOf(failed).criteria.safety.suites.failed, [GATE.safety.verifySuites[0]]);

  const partial = passingSuites();
  partial.results.pop();
  const missing = record(evaluate({ suites: partial }));
  assertJev(missing, 'inconclusive', ['suites_incomplete']);
  assert.deepEqual(jevOf(missing).criteria.safety.suites.missing, [GATE.safety.verifySuites.at(-1)]);
});

// --- (10) Not exercised -------------------------------------------------------------------

test('(10) not_exercised: uncalibrated acted runs, acted share 0.3, two served models', () => {
  const uncalibrated = record(evaluate({ autopilot: autopilotCampaign({ jev: { calibrated: false } }) }));
  assertJev(uncalibrated, 'not_exercised', ['uncalibrated']);
  assert.ok(uncalibrated.exercise.uncalibratedActedRuns > 0);

  const low = record(evaluate({ autopilot: autopilotCampaign({ jev: { actRate: 0.3 } }) }));
  assertJev(low, 'not_exercised', ['acted_share_below_min']);
  assert.ok(low.exercise.actedShare < GATE.exercise.minActedShare && low.exercise.actedShare > 0.2, `${low.exercise.actedShare}`);

  const models = [
    { servedModel: 'jev-1.13.0', instrumentVersion: 'fsb-jev-instrument-1' },
    { servedModel: 'jev-1.14.0', instrumentVersion: 'fsb-jev-instrument-1' },
  ];
  const twoModels = record(evaluate({ autopilot: autopilotCampaign({ jev: { models } }) }));
  assertJev(twoModels, 'not_exercised', ['model_instrument_pair']);
  assert.deepEqual(twoModels.exercise.pairs.servedModels, ['jev-1.13.0', 'jev-1.14.0']);
});

test('(10) not_exercised: every kind of off-run Jev activity is a condition leak (D-16, 2026-10-16)', () => {
  for (const kind of ['calls', 'local', 'summary']) {
    const autopilot = autopilotCampaign({ jev: { leakOff: { count: 1, kind } } });
    const leak = autopilot.runs.find((row) => row.condition === 'off' && counted(row) && row.jev.source !== null);
    assert.ok(leak, `a leaked off row (${kind})`);
    if (kind === 'calls') assert.equal(leak.jev.jevCalls, 2);
    if (kind === 'local') {
      assert.equal(leak.jev.jevCalls, 0);
      assert.equal(leak.jev.acted, false);
      assert.equal(leak.jev.source, 'measurement');
    }
    if (kind === 'summary') assert.equal(leak.jev.source, 'summary');
    const result = record(evaluate({ autopilot }));
    assertJev(result, 'not_exercised', ['condition_leak']);
    assert.equal(result.exercise.leakRuns, 1);
    assert.deepEqual(result.exercise.leakRunIds, [leak.runId]);
  }
});

// --- (11) Non-Jev MCP path ------------------------------------------------------------------

test('(11) non-Jev pass at 0.95 is labelled faster; at 1.02 it still passes without the label', () => {
  const faster = record(evaluate({ claude: claudeCampaign({ effect: { claude: { speed: 0.95 } } }) }));
  assert.equal(nonJevOf(faster).verdict, 'pass');
  assert.equal(nonJevOf(faster).faster, true);
  assert.ok(nonJevOf(faster).criteria.speed.ci[1] < GATE.criteria.nonJevSpeed.fasterCiUpperBelow);

  const level = record(evaluate({ claude: claudeCampaign({ effect: { claude: { speed: 1.02 } } }) }));
  const { ci } = nonJevOf(level).criteria.speed;
  assert.ok(ci[1] >= 1 && ci[1] <= GATE.criteria.nonJevSpeed.ciUpperAtMost, JSON.stringify(ci));
  assert.equal(nonJevOf(level).verdict, 'pass');
  assert.equal(nonJevOf(level).faster, false);
});

test('(11) non-Jev fails on time (true 1.25) and on excess safety events over the pin', () => {
  const slow = record(evaluate({ claude: claudeCampaign({ effect: { claude: { speed: 1.25 } } }) }));
  assert.equal(nonJevOf(slow).verdict, 'fail');
  assert.deepEqual(nonJevOf(slow).reasons, ['time_noninferiority']);
  assert.ok(nonJevOf(slow).criteria.speed.ci[1] > GATE.criteria.nonJevSpeed.ciUpperAtMost);

  const unsafe = record(evaluate({ claude: claudeCampaign({ safety: { events: [{ kind: 'unexpectedMutations', arm: 'claude', count: 2 }] } }) }));
  assert.equal(nonJevOf(unsafe).verdict, 'fail');
  assert.deepEqual(nonJevOf(unsafe).reasons, ['excess_safety_events']);
  assert.equal(nonJevOf(unsafe).criteria.safety.candidate.events, 2);
  assert.equal(nonJevOf(unsafe).criteria.safety.baseline.events, 0);
  assertJev(unsafe, 'pass', []);
});

// --- (12) False done ----------------------------------------------------------------------

function falseDoneRow(campaign) {
  return campaign.runs.find((row) => row.condition === 'on' && counted(row) && row.pass === false && row.fastMode
    && row.fastMode.outcome === 'done');
}

test('(12) a typed done with a non-success status on a failed acted run fails with acted_safety_event', () => {
  const autopilot = autopilotCampaign({ fastMode: { falseDone: [{ acted: true, count: 1, statusMismatch: true }] } });
  const row = falseDoneRow(autopilot);
  assert.equal(row.claimed.status, 'error');
  assert.equal(row.jev.acted, true);
  const result = record(evaluate({ autopilot }));
  assertJev(result, 'fail', ['acted_safety_event']);
  assert.equal(jevOf(result).criteria.safety.ruleA.byKind.claimedSuccessOnFail, 1);
  assert.deepEqual(safetyEventsOf(row, { gate: GATE, build: 'candidate' }).kinds, ['claimedSuccessOnFail']);
  assert.deepEqual(safetyEventsOf(row, { gate: GATE, build: 'baseline' }).kinds, [], 'the typed outcome counts on candidate rows only');
});

test('(12) the same false done on a non-acted run fails rule (b); with a passing checker it is no event', () => {
  const notActed = autopilotCampaign({ fastMode: { falseDone: [{ acted: false, count: 1, statusMismatch: true }] } });
  assert.equal(falseDoneRow(notActed).jev.acted, false);
  const result = record(evaluate({ autopilot: notActed }));
  assertJev(result, 'fail', ['excess_llm_path_events']);

  const acted = autopilotCampaign({ fastMode: { falseDone: [{ acted: true, count: 1, statusMismatch: true }] } });
  const runId = falseDoneRow(acted).runId;
  const passed = withRows(acted, (runs) => {
    runs.find((row) => row.runId === runId).pass = true;
  });
  assertJev(record(evaluate({ autopilot: passed })), 'pass', []);
});

test('(12) a typed done that agrees with a success status is one event, not two', () => {
  const autopilot = autopilotCampaign({ fastMode: { falseDone: [{ acted: true, count: 1 }] } });
  const row = falseDoneRow(autopilot);
  assert.equal(row.claimed.status, 'success');
  assert.equal(safetyEventsOf(row, { gate: GATE, build: 'candidate' }).events, 1);
  const result = record(evaluate({ autopilot }));
  assertJev(result, 'fail', ['acted_safety_event']);
  assert.equal(jevOf(result).criteria.safety.ruleA.events, 1);
});

// --- (13) Unknown exposure ------------------------------------------------------------------

test('(13) unknown exposure (jev.acted null) counts as acted for rule (a) and as not acted for the acted share', () => {
  const clean = autopilotCampaign({ jev: { unknownRate: 0.1 } });
  const unknown = onRows(clean.runs).filter((row) => row.jev.acted === null);
  assert.ok(unknown.length > 0);
  assert.ok(unknown.every((row) => row.jev.source === null && row.fastMode !== null));
  const passing = record(evaluate({ autopilot: clean }));
  assertJev(passing, 'pass', []);
  const on = onRows(clean.runs);
  const acted = on.filter((row) => row.jev.acted === true).length;
  assert.equal(passing.exercise.actedRuns, acted);
  assert.equal(passing.exercise.actedShare, acted / on.length);
  assert.equal(passing.exercise.unknownExposureRuns, unknown.length);

  const withEvent = autopilotCampaign({
    jev: { unknownRate: 0.1 },
    safety: { events: [{ kind: 'requestOvercount', arm: 'autopilot', condition: 'on', acted: null, count: 1 }] },
  });
  const failed = record(evaluate({ autopilot: withEvent }));
  assertJev(failed, 'fail', ['acted_safety_event']);
  assert.equal(jevOf(failed).criteria.safety.exposure.unknown, unknown.length);
});

// --- (14) No Jev attempt is known exposure ----------------------------------------------------

test('(14) on runs with no Jev attempt (no_block) are non-acted, unflagged, and judged under rule (b)', () => {
  const clean = autopilotCampaign({ jev: { noBlockRate: 0.1 } });
  const noBlock = onRows(clean.runs).filter((row) => row.jev.source === 'no_block');
  assert.ok(noBlock.length > 0);
  assert.ok(noBlock.every((row) => row.jev.acted === false && !row.flags.includes('jev_measurement_missing')));
  const passing = record(evaluate({ autopilot: clean }));
  assertJev(passing, 'pass', []);
  const on = onRows(clean.runs);
  assert.equal(passing.exercise.actedShare, on.filter((row) => row.jev.acted === true).length / on.length);
  assert.equal(passing.exercise.unknownExposureRuns, 0);

  const target = noBlock[0].runId;
  const withEvent = withRows(clean, (runs) => {
    runs.find((row) => row.runId === target).safety.requestOvercount = 1;
  });
  const failed = record(evaluate({ autopilot: withEvent }));
  assertJev(failed, 'fail', ['excess_llm_path_events']);
});

test('(14) summary-sourced rows (jev_measurement_missing) take the summary acted value, never unknown', () => {
  const clean = autopilotCampaign({ jev: { missingRate: 0.1 } });
  const summary = onRows(clean.runs).filter((row) => row.flags.includes('jev_measurement_missing'));
  assert.ok(summary.some((row) => row.jev.acted === true) && summary.some((row) => row.jev.acted === false));
  assert.ok(summary.every((row) => row.jev.source === 'summary' && typeof row.jev.acted === 'boolean'));
  assertJev(record(evaluate({ autopilot: clean })), 'pass', []);

  const edit = (acted) => withRows(clean, (runs) => {
    const id = summary.find((row) => row.jev.acted === acted).runId;
    runs.find((row) => row.runId === id).safety.requestOvercount = 1;
  });
  assertJev(record(evaluate({ autopilot: edit(false) })), 'fail', ['excess_llm_path_events']);
  assertJev(record(evaluate({ autopilot: edit(true) })), 'fail', ['acted_safety_event']);
});

test('(14) no-block on runs whose session detail was never read are unknown exposure (acted for rule (a))', () => {
  const clean = autopilotCampaign({ jev: { detailMissingRate: 0.1 } });
  const unread = onRows(clean.runs).filter((row) => row.flags.includes('session_detail_missing'));
  assert.ok(unread.length > 0);
  assert.ok(unread.every((row) => row.jev.source === null && row.jev.acted === null && row.fastMode === null));
  const passing = record(evaluate({ autopilot: clean }));
  assertJev(passing, 'pass', []);
  const on = onRows(clean.runs);
  assert.equal(passing.exercise.actedShare, on.filter((row) => row.jev.acted === true).length / on.length);
  assert.equal(passing.exercise.unknownExposureRuns, unread.length);

  const withEvent = withRows(clean, (runs) => {
    runs.find((row) => row.runId === unread[0].runId).safety.requestOvercount = 1;
  });
  const failed = record(evaluate({ autopilot: withEvent }));
  assertJev(failed, 'fail', ['acted_safety_event']);
});

// --- Speed reads wallMs only; precedence; determinism ---------------------------------------

test('speed reads only wallMs: huge jevMs, model time and host time change no speed number', () => {
  const noisy = withRows(AUTOPILOT, (runs) => {
    for (const row of runs) {
      if (row.jev && row.jev.jevMs !== null) row.jev.jevMs = 9e12;
      row.fsb.modelMsTotal = 9e12;
      row.fsb.toolMsTotal = 9e12;
      row.wallFromInitMs = 9e12;
    }
  });
  const result = evaluate({ autopilot: noisy });
  assert.deepEqual(jevOf(result).criteria.speed, jevOf(PASS).criteria.speed);
  const groups = groupRows({ autopilot: noisy.runs }, GATE);
  const opts = { iterations: ITERATIONS, seed: GATE.bootstrap.seed, level: GATE.bootstrap.level };
  const original = groupRows({ autopilot: AUTOPILOT.runs }, GATE);
  assert.deepEqual(speedComparison(groups.autopilotOff, groups.autopilotOn, opts),
    speedComparison(original.autopilotOff, original.autopilotOn, opts));
  assert.deepEqual(aaFloor(groups.autopilotOff, opts), aaFloor(original.autopilotOff, opts));
});

test('precedence: a safety fail outranks not exercised, and not exercised outranks a speed fail', () => {
  const unsafe = autopilotCampaign({
    jev: { calibrated: false },
    safety: { events: [{ kind: 'requestOvercount', arm: 'autopilot', condition: 'on', acted: true, count: 1 }] },
  });
  assertJev(record(evaluate({ autopilot: unsafe })), 'fail', ['acted_safety_event']);
  const slow = autopilotCampaign({ jev: { calibrated: false }, effect: { 'autopilot/on': { speed: 1.0 } } });
  assertJev(record(evaluate({ autopilot: slow })), 'not_exercised', ['uncalibrated']);
});

test('the verdict functions apply the precedence to computed criteria', () => {
  const ok = { status: 'pass', reasons: [] };
  const exercised = { status: 'exercised', reasons: [] };
  const base = { speed: ok, completion: ok, safety: ok, exercise: exercised };
  assert.deepEqual(jevVerdict({ criteria: base }), { verdict: 'pass', reasons: [] });
  assert.deepEqual(jevVerdict({ criteria: base, guards: ['underpowered'] }), { verdict: 'inconclusive', reasons: ['underpowered'] });
  assert.deepEqual(jevVerdict({ criteria: { ...base, speed: { status: 'fail', reasons: ['estimate_above_max'] } }, guards: ['underpowered'] }),
    { verdict: 'inconclusive', reasons: ['underpowered'] });
  assert.deepEqual(jevVerdict({
    criteria: { ...base, exercise: { status: 'not_exercised', reasons: ['condition_leak'] }, safety: { status: 'inconclusive', reasons: ['suites_not_run'] } },
  }), { verdict: 'not_exercised', reasons: ['condition_leak'] });
  const fasterSpeed = { status: 'pass', reasons: [], faster: true };
  assert.deepEqual(nonJevVerdict({ criteria: { speed: fasterSpeed, completion: ok, safety: ok } }), { verdict: 'pass', reasons: [], faster: true });
  assert.deepEqual(nonJevVerdict({ criteria: { speed: fasterSpeed, completion: { status: 'fail', reasons: ['completion_noninferiority'] },
    safety: { status: 'fail', reasons: ['excess_safety_events'] } } }), { verdict: 'fail', reasons: ['excess_safety_events'], faster: true });
});

test('the same input gives deep-equal output, and row order changes nothing', () => {
  assert.deepEqual(evaluate(), PASS);
  const reversed = { ...AUTOPILOT, runs: [...AUTOPILOT.runs].reverse() };
  const claudeReversed = { ...CLAUDE, runs: [...CLAUDE.runs].reverse() };
  const result = evaluate({ autopilot: reversed, claude: claudeReversed });
  assert.deepEqual(result.paths, PASS.paths);
  assert.deepEqual(result.exercise, PASS.exercise);
});

// --- Helper contracts -------------------------------------------------------------------------

test('helpers: groups, completion counts, unverifiable sidecar entries and no-data shapes', () => {
  const groups = groupRows({ baseline: BASELINE.runs, autopilot: AUTOPILOT.runs, claude: CLAUDE.runs }, GATE);
  assert.equal(groups.autopilotOff.length + groups.autopilotOn.length, AUTOPILOT.runs.length);
  assert.equal(groups.baselineAutopilot.length + groups.baselineClaude.length, BASELINE.runs.length);
  assert.equal(groups.claudeOff.length, CLAUDE.runs.length);

  const completion = completionComparison(groups.autopilotOff, groups.autopilotOn, GATE.criteria.z);
  assert.equal(completion.control.counted, groups.autopilotOff.filter(counted).length);
  assert.equal(completion.treatment.completed, groups.autopilotOn.filter((row) => counted(row) && row.pass).length);
  assert.ok(Math.abs(completion.diff - (completion.treatment.rate - completion.control.rate)) < 1e-12);
  assert.deepEqual(completionComparison([], groups.autopilotOn, GATE.criteria.z).ci, [null, null]);

  const opts = { iterations: 50, seed: 71, level: 0.95 };
  assert.equal(speedComparison([], groups.autopilotOn, opts).status, 'n/a');
  assert.equal(aaFloor(groups.autopilotOff.filter((row) => row.round === 1), opts).status, 'n/a');

  const pinRow = groups.baselineClaude.find(counted);
  assert.equal(safetyEventsOf(pinRow, { gate: GATE, build: 'baseline', sidecar: null }).unverifiable, true);
  assert.equal(safetyEventsOf(pinRow, { gate: GATE, build: 'baseline', sidecar: new Map() }).unverifiable, true);
  assert.equal(safetyEventsOf(pinRow, { gate: GATE, build: 'baseline', sidecar: BASELINE.safety }).unverifiable, false);

  const pin = nonJevSafety({ baselineRows: groups.baselineClaude, candidateRows: groups.claudeOff, gate: GATE, baselineSidecar: null });
  assert.deepEqual(pin.reasons, ['baseline_safety_unverifiable']);
  const jev = jevSafety({ onRows: groups.autopilotOn, offRows: groups.autopilotOff, gate: GATE, suites: passingSuites() });
  assert.equal(jev.status, 'pass');
  const exercise = exerciseStats({ onRows: [], offRows: groups.autopilotOff, gate: GATE });
  assert.equal(exercise.status, 'not_exercised');
  assert.ok(exercise.reasons.includes('no_on_runs'));
  assert.equal(exercise.actedShare, null);
});

test('the evaluator source is pure and its speed helper names no per-decision timing', () => {
  const source = readFileSync(EVALUATE_FILE, 'utf8');
  assert.equal((source.match(/readFileSync|process\.env|Date\.now|child_process|from '\.\.\/\.\.\/report\.mjs'/g) || []).length, 0);
  const start = source.indexOf('export function speedComparison');
  const end = source.indexOf('export function', start + 10);
  assert.ok(start > 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /jevMs|latencyMs|modelMs/);
});

// --- Task 2: refusals ---------------------------------------------------------------------

function refusalCodes(result) {
  return result.refusals.map((refusal) => refusal.code);
}

test('refusals: a tampered or mismatched input is refused with no verdicts', () => {
  const cases = [
    ['gate_hash_mismatch', { autopilot: autopilotCampaign({ identity: { gate: { path: GATE_FILE, sha256: 'f'.repeat(64) } } }) }],
    ['gate_hash_missing', { claude: claudeCampaign({ identity: { gate: undefined } }) }],
    ['campaign_id_mismatch', { claude: claudeCampaign({ identity: { campaignId: 'core-gate-71-claud' } }) }],
    ['candidate_dirty', { autopilot: autopilotCampaign({ identity: { git: { dirty: true } } }) }],
    ['candidate_sha_mismatch', { claude: claudeCampaign({ identity: { git: { sha: 'b'.repeat(40) } } }) }],
    ['baseline_not_pin', { baseline: baselineCampaign({ identity: { git: { sha: `abc${SYNTHETIC_PIN_SHA.slice(3)}` } } }) }],
    // IN-02: a commit that only shares the 8-character pin prefix is not the pin.
    ['baseline_not_pin', { baseline: baselineCampaign({ identity: { git: { sha: `${SYNTHETIC_PIN_SHA.slice(0, 8)}${'0'.repeat(32)}` } } }) }],
    ['campaign_schedule_mismatch', { autopilot: autopilotCampaign({ identity: { schedule: { seed: 72 } } }) }],
    ['candidate_row_schema', { autopilot: withRows(AUTOPILOT, (runs) => { runs[5].schemaVersion = 1; }) }],
    ['baseline_row_schema', { baseline: withRows(BASELINE, (runs) => { runs[0].schemaVersion = 2; }) }],
  ];
  for (const [code, overrides] of cases) {
    const result = record(evaluate(overrides));
    assert.deepEqual(refusalCodes(result), [code], code);
    assert.equal(result.paths, undefined, `${code}: no verdicts`);
    assert.equal(result.exercise, undefined);
    for (const refusal of result.refusals) {
      assert.match(refusal.detail, /^[A-Za-z0-9_.,]+$/, 'a refusal names fields, never values');
    }
    assert.ok(result.campaigns.autopilot && result.campaigns.claude && result.campaigns.baseline);
  }
  assert.deepEqual(PASS.refusals, []);
});

test('refusals: rows from another campaign are refused, and a missing identity never throws', () => {
  const mixed = withRows(CLAUDE, (runs) => { runs[3].campaignId = 'core-gate-71-claude-b'; });
  assert.deepEqual(refusalCodes(evaluate({ claude: mixed })), ['campaign_id_mismatch']);
  const bare = evaluate({ baseline: { identity: null, runs: BASELINE.runs, safety: BASELINE.safety } });
  assert.ok(refusalCodes(bare).includes('baseline_not_pin'));
  assert.ok(refusalCodes(bare).includes('campaign_id_mismatch'));
  assert.equal(bare.campaigns.baseline.id, null);
});

// --- Task 2: identity, resumes, rounds ---------------------------------------------------------

const JEV_SNAPSHOT = (result) => JEV_PATHS.map((name) => result.paths[name]);

test('identity: a mismatch on each identityMatch.claude field makes only mcp-non-jev inconclusive', () => {
  const tasks = clone(defaultIdentity().tasks);
  tasks[4].fixtureSha256 = 'c'.repeat(64);
  const overrides = {
    'hosts.claude.version': { hosts: { claude: { version: '2.1.999 (Claude Code)' } } },
    'hosts.claude.model': { hosts: { claude: { model: 'claude-model-other' } } },
    'hosts.claude.toolSearchEnv': { hosts: { claude: { toolSearchEnv: 'auto' } } },
    'hosts.claude.envKeyNamesSha256': { hosts: { claude: { envKeyNamesSha256: 'e'.repeat(64) } } },
    'provider.requestedModel': { provider: { requestedModel: 'grok-9' } },
    corpus: { tasks },
    chromeMajor: { chrome: { browser: 'Chrome/147.0.7700.0' } },
  };
  assert.deepEqual(Object.keys(overrides), GATE.identityMatch.claude, 'one case per gate field');
  for (const [field, identity] of Object.entries(overrides)) {
    const result = record(evaluate({ claude: claudeCampaign({ identity }) }));
    assert.equal(nonJevOf(result).verdict, 'inconclusive', field);
    assert.deepEqual(nonJevOf(result).reasons, [`identity_mismatch:${field}`], field);
    assert.deepEqual(JEV_SNAPSHOT(result), JEV_SNAPSHOT(PASS), `${field}: the Jev verdicts are unchanged`);
    assert.equal(result.sentinel.status, 'pass', field);
  }
});

test('identity: a missing value is a mismatch; reported fields are copied and never compared', () => {
  const missing = record(evaluate({ claude: claudeCampaign({ identity: { hosts: { claude: { model: undefined } } } }) }));
  assert.deepEqual(nonJevOf(missing).reasons, ['identity_mismatch:hosts.claude.model']);

  const reported = record(evaluate({
    claude: claudeCampaign({ identity: { mcp: { toolsList: { sha256: 'a'.repeat(64) } }, hosts: { claude: { agentPolicySha256: 'd'.repeat(64) } } } }),
  }));
  assert.equal(nonJevOf(reported).verdict, 'pass');
  assert.equal(reported.campaigns.claude.reported['mcp.toolsList.sha256'], 'a'.repeat(64));
  assert.equal(reported.campaigns.claude.reported['hosts.claude.agentPolicySha256'], 'd'.repeat(64));
  assert.notEqual(reported.campaigns.baseline.reported['mcp.toolsList.sha256'], 'a'.repeat(64));

  const a = defaultIdentity();
  assert.deepEqual(identityMismatches(a, defaultIdentity(), GATE.identityMatch.claude, GATE), []);
  assert.deepEqual(identityMismatches(a, defaultIdentity({ chrome: { browser: 'HeadlessChrome/146.0.1.2' } }), ['chromeMajor'], GATE), []);
  assert.deepEqual(identityMismatches(a, defaultIdentity({ tasks: [...a.tasks].reverse() }), ['corpus'], GATE), [], 'corpus order is irrelevant');
  assert.deepEqual(identityMismatches(a, a, ['corpus'], { ...GATE, corpusLockSha256: '0'.repeat(64) }), ['corpus'], 'both sides must match the lock');
  assert.equal(chromeMajor(a), 146);
  assert.equal(chromeMajor(defaultIdentity({ chrome: { browser: null } })), null);
});

test('identity: an autopilot campaign off the gate corpus makes the Jev verdict and the sentinel inconclusive', () => {
  const tasks = clone(defaultIdentity().tasks);
  tasks[0].version = 2;
  const result = record(evaluate({ autopilot: autopilotCampaign({ identity: { tasks } }) }));
  assertJev(result, 'inconclusive', ['corpus_mismatch']);
  assert.equal(result.campaigns.autopilot.corpusMatch, false);
  assert.deepEqual(result.sentinel.reasons, ['identity_mismatch:corpus']);
  assert.deepEqual(nonJevOf(result).reasons, ['identity_mismatch:sentinel.corpus', 'sentinel_inconclusive']);
  assert.equal(PASS.campaigns.autopilot.corpusMatch, true);
});

test('resumes: a changed Claude Code version or Chrome major is drift; an unchanged resume is not', () => {
  const resume = (claudeVersion, chromeBrowser) => ({
    at: '2026-11-02T10:00:00.000Z', claudeVersion, chromeBrowser, launchFlags: ['--disable-renderer-backgrounding', '--user-data-dir'],
  });
  const claudeDrift = record(evaluate({ claude: claudeCampaign({ identity: { resumes: [resume('2.1.284 (Claude Code)', 'Chrome/146.0.7680.0')] } }) }));
  assert.deepEqual(nonJevOf(claudeDrift).reasons, ['resume_drift']);
  assert.deepEqual(JEV_SNAPSHOT(claudeDrift), JEV_SNAPSHOT(PASS));
  assert.equal(claudeDrift.campaigns.claude.resumeDrift, true);

  const steady = record(evaluate({ claude: claudeCampaign({ identity: { resumes: [resume('2.1.283 (Claude Code)', 'Chrome/146.0.7690.0')] } }) }));
  assert.equal(nonJevOf(steady).verdict, 'pass');
  assert.equal(steady.campaigns.claude.resumeDrift, false);

  const chromeDrift = record(evaluate({ autopilot: autopilotCampaign({ identity: { resumes: [resume(null, 'Chrome/147.0.7700.0')] } }) }));
  assertJev(chromeDrift, 'inconclusive', ['resume_drift']);
  assert.equal(chromeDrift.sentinel.status, 'inconclusive');
  assert.deepEqual(nonJevOf(chromeDrift).reasons, ['resume_drift:sentinel', 'sentinel_inconclusive']);

  assert.equal(resumeDrift(defaultIdentity()), false);
  assert.equal(resumeDrift(defaultIdentity({ resumes: [resume(null, 'Chrome/146.0.1.0')] })), true, 'a claude host needs its version on every resume');
  assert.equal(resumeDrift(defaultIdentity({ resumes: [resume('2.1.283 (Claude Code)', null)] })), true, 'an unknown Chrome is drift');
});

test('rounds: an under-round campaign makes the verdicts that use it inconclusive (underpowered)', () => {
  const shortAutopilot = record(evaluate({ autopilot: autopilotCampaign({ rounds: 12 }) }));
  assertJev(shortAutopilot, 'inconclusive', ['underpowered']);
  assert.equal(shortAutopilot.campaigns.autopilot.meetsMinRounds, false);
  assert.equal(shortAutopilot.sentinel.status, 'inconclusive');
  assert.ok(shortAutopilot.sentinel.reasons.includes('underpowered'));

  const shortBaseline = record(evaluate({ baseline: baselineCampaign({ rounds: 12 }) }));
  assert.equal(nonJevOf(shortBaseline).verdict, 'inconclusive');
  assert.ok(nonJevOf(shortBaseline).reasons.includes('underpowered'), nonJevOf(shortBaseline).reasons.join(','));
  assert.equal(shortBaseline.sentinel.status, 'inconclusive');
  assert.deepEqual(JEV_SNAPSHOT(shortBaseline), JEV_SNAPSHOT(PASS));

  const shortClaude = record(evaluate({ claude: claudeCampaign({ rounds: 12 }) }));
  assert.deepEqual(nonJevOf(shortClaude).reasons, ['underpowered']);

  const min = GATE.campaigns.autopilot.minRounds;
  assert.equal(meetsMinRounds(AUTOPILOT, min), true);
  const truncated = { identity: AUTOPILOT.identity, runs: AUTOPILOT.runs.filter((row) => row.round < min) };
  assert.equal(meetsMinRounds(truncated, min), false, 'the scheduled rounds alone are not enough');
  assert.equal(meetsMinRounds({ identity: { schedule: { rounds: min - 1 } }, runs: AUTOPILOT.runs }, min), false);
});

test('rounds: a campaign whose rows are not exactly its schedule, or that is still paused, is inconclusive (campaign_incomplete; WR-02)', () => {
  const COMPLETE = { complete: true, missingRuns: 0, unscheduledRows: 0, pausedRuns: 0 };
  for (const campaign of [BASELINE, AUTOPILOT, CLAUDE]) assert.deepEqual(campaignCompleteness(campaign), COMPLETE);
  for (const role of ['baseline', 'autopilot', 'claude']) assert.equal(PASS.campaigns[role].complete, true);
  const lastOrders = (runs, count) => [...runs].sort((a, b) => b.order - a.order).slice(0, count).map((row) => row.runId);

  // Paused part-way through the last round on condition_not_applied and never resumed: the rows still reach round 30.
  const paused = withRows(AUTOPILOT, (runs) => {
    const dropped = new Set(lastOrders(runs, 5));
    const kept = runs.filter((row) => !dropped.has(row.runId));
    runs.length = 0;
    runs.push(...kept);
    const last = runs.reduce((a, b) => (b.order > a.order ? b : a));
    last.infraError = 'condition_not_applied';
  });
  assert.equal(meetsMinRounds(paused, ROUNDS), true, 'the highest round alone still reads complete');
  assert.deepEqual(campaignCompleteness(paused), { complete: false, missingRuns: 5, unscheduledRows: 0, pausedRuns: 1 });
  const pausedResult = record(evaluate({ autopilot: paused }));
  assertJev(pausedResult, 'inconclusive', ['campaign_incomplete']);
  assert.ok(pausedResult.sentinel.reasons.includes('campaign_incomplete'), pausedResult.sentinel.reasons.join(','));
  assert.equal(pausedResult.campaigns.autopilot.complete, false);
  assert.equal(pausedResult.campaigns.autopilot.missingRuns, 5);

  // A pausing infra row that was never re-run, with every scheduled run present.
  const pending = withRows(AUTOPILOT, (runs) => { runs[runs.length - 1].infraError = 'provider_error'; });
  assert.deepEqual(campaignCompleteness(pending), { complete: false, missingRuns: 0, unscheduledRows: 0, pausedRuns: 1 });
  // A non-pausing infra row is an ordinary uncounted run, and the campaign stays complete.
  const hubLost = withRows(AUTOPILOT, (runs) => { runs[runs.length - 1].infraError = 'hub_lost'; });
  assert.deepEqual(campaignCompleteness(hubLost), COMPLETE);

  // A schema-2 row with no condition would fall out of both Jev groups silently.
  const noCondition = withRows(AUTOPILOT, (runs) => { runs.find((row) => row.condition === 'on').condition = null; });
  assert.deepEqual(campaignCompleteness(noCondition), { complete: false, missingRuns: 1, unscheduledRows: 0, pausedRuns: 0 });
  assertJev(record(evaluate({ autopilot: noCondition })), 'inconclusive', ['campaign_incomplete']);

  // A dropped row, a duplicated row and an unrebuildable schedule on the claude side make only mcp-non-jev inconclusive.
  const dropped = withRows(CLAUDE, (runs) => { runs.splice(3, 1); });
  assert.deepEqual(campaignCompleteness(dropped), { complete: false, missingRuns: 1, unscheduledRows: 0, pausedRuns: 0 });
  const droppedResult = record(evaluate({ claude: dropped }));
  assert.deepEqual(nonJevOf(droppedResult).reasons, ['campaign_incomplete']);
  assert.deepEqual(JEV_SNAPSHOT(droppedResult), JEV_SNAPSHOT(PASS));
  const duplicated = withRows(CLAUDE, (runs) => { runs.push(clone(runs[0])); });
  assert.deepEqual(campaignCompleteness(duplicated), { complete: false, missingRuns: 0, unscheduledRows: 1, pausedRuns: 0 });
  const noTasks = { identity: { ...clone(CLAUDE.identity), tasks: null }, runs: CLAUDE.runs };
  assert.deepEqual(campaignCompleteness(noTasks), { complete: false, missingRuns: null, unscheduledRows: null, pausedRuns: 0 });

  // The baseline is checked the same way (the fallback campaigns are covered in the fallback tests).
  const shortBaseline = withRows(BASELINE, (runs) => { runs.splice(0, 2); });
  assert.ok(nonJevOf(record(evaluate({ baseline: shortBaseline }))).reasons.includes('campaign_incomplete'));
});

// --- Task 2: the drift sentinel ---------------------------------------------------------------

test('sentinel: off equals the pin on the default fixtures', () => {
  assert.equal(PASS.sentinel.status, 'pass');
  assert.deepEqual(PASS.sentinel.reasons, []);
  assert.equal(PASS.sentinel.blocker, null);
  const { completion, speed } = PASS.sentinel;
  assert.ok(completion.ci[0] > -GATE.sentinel.completionMargin && completion.ci[1] < GATE.sentinel.completionMargin);
  assert.ok(speed.ci[0] >= GATE.sentinel.speedBand[0] && speed.ci[1] <= GATE.sentinel.speedBand[1]);
});

test('sentinel: a completion drop or a slow off path trips it; mcp-non-jev is inconclusive and the Jev verdict stands', () => {
  const dropped = record(evaluate({
    baseline: baselineCampaign({ effect: { autopilot: { completion: 0.05 } } }),
    autopilot: autopilotCampaign({ effect: { 'autopilot/off': { completion: -0.15 }, 'autopilot/on': { speed: 0.7, completion: -0.15 } } }),
  }));
  assert.equal(dropped.sentinel.status, 'trip');
  assert.ok(dropped.sentinel.reasons.includes('completion_not_equivalent'));
  assert.equal(dropped.sentinel.blocker, GATE.sentinel.blocker);
  assert.deepEqual(nonJevOf(dropped).reasons, ['sentinel_trip']);
  assertJev(dropped, 'pass', []);

  const slow = record(evaluate({ autopilot: autopilotCampaign({ effect: { 'autopilot/off': { speed: 1.5 }, 'autopilot/on': { speed: 1.05 } } }) }));
  assert.equal(slow.sentinel.status, 'trip');
  assert.deepEqual(slow.sentinel.reasons, ['speed_outside_band']);
  assert.equal(slow.sentinel.blocker, GATE.sentinel.blocker);
  assert.deepEqual(nonJevOf(slow).reasons, ['sentinel_trip']);
  assertJev(slow, 'pass', []);
});

test('sentinel: an identity mismatch between the baseline and the autopilot campaign is inconclusive', () => {
  const result = record(evaluate({ autopilot: autopilotCampaign({ identity: { provider: { requestedModel: 'grok-9' } } }) }));
  assert.equal(result.sentinel.status, 'inconclusive');
  assert.deepEqual(result.sentinel.reasons, ['identity_mismatch:provider.requestedModel']);
  assert.deepEqual(nonJevOf(result).reasons, ['identity_mismatch:sentinel.provider.requestedModel', 'sentinel_inconclusive']);
  assertJev(result, 'pass', []);
  const groups = groupRows({ baseline: BASELINE.runs, autopilot: AUTOPILOT.runs }, GATE);
  const opts = { iterations: 50, seed: 71, level: 0.95 };
  const direct = sentinelCheck({ gate: GATE, baselineRows: groups.baselineAutopilot, candidateRows: [], guards: [], opts });
  assert.equal(direct.status, 'inconclusive');
  assert.deepEqual(direct.reasons, ['sentinel_unavailable']);
});

test('baseline safety: no sidecar makes mcp-non-jev inconclusive (baseline_safety_unverifiable)', () => {
  const result = record(evaluate({ baseline: { ...BASELINE, safety: null } }));
  assert.deepEqual(nonJevOf(result).reasons, ['baseline_safety_unverifiable']);
  assert.deepEqual(JEV_SNAPSHOT(result), JEV_SNAPSHOT(PASS));
  const partial = new Map(BASELINE.safety);
  partial.delete(BASELINE.runs.find((row) => row.arm === 'claude' && counted(row)).runId);
  assert.deepEqual(nonJevOf(evaluate({ baseline: { ...BASELINE, safety: partial } })).reasons, ['baseline_safety_unverifiable']);
});

// --- Task 2: the core-rebaseline-71 fallback ----------------------------------------------------

function fallbackCampaigns({ pin = {}, candidate = {} } = {}) {
  const spec = REAL_GATE.fallback;
  const { identity: pinIdentity, ...pinRest } = pin;
  const { identity: candidateIdentity, ...candidateRest } = candidate;
  return {
    pin: makeCampaign({
      seed: 6611, scheduleSeed: spec.campaigns.pin.seed, schemaVersion: 1, arms: [spec.arm], rounds: spec.campaigns.pin.minRounds,
      campaignId: spec.campaigns.pin.id, ...pinRest, ...(pinIdentity ? { identity: pinIdentity } : {}),
    }),
    candidate: makeCampaign({
      seed: 6612, scheduleSeed: spec.campaigns.candidate.seed, arms: [spec.arm], conditions: spec.campaigns.candidate.conditions,
      rounds: spec.campaigns.candidate.minRounds, campaignId: spec.campaigns.candidate.id, effect: { claude: { speed: 0.85 } },
      ...candidateRest, identity: mergeIdentity(candidateIdentity),
    }),
  };
}

const FALLBACK = fallbackCampaigns();
const SENTINEL_TRIP = {
  autopilot: autopilotCampaign({ effect: { 'autopilot/off': { speed: 1.5 }, 'autopilot/on': { speed: 1.05 } } }),
};

test('fallback: not supplied, or supplied while the primary verdict is not inconclusive for a trigger', () => {
  assert.equal(PASS.fallback.status, 'not_supplied');
  assert.equal(PASS.fallback.primaryVerdict, 'pass');

  const passing = record(evaluate({ fallback: FALLBACK }));
  assert.equal(passing.fallback.status, 'not_triggered');
  assert.deepEqual(passing.paths, PASS.paths);

  const slow = record(evaluate({ claude: claudeCampaign({ effect: { claude: { speed: 1.25 } } }), fallback: FALLBACK }));
  assert.equal(slow.fallback.status, 'not_triggered');
  assert.equal(nonJevOf(slow).verdict, 'fail');
  assert.equal(nonJevOf(slow).source, 'primary');

  const underpowered = record(evaluate({ claude: claudeCampaign({ rounds: 12 }), fallback: FALLBACK }));
  assert.equal(underpowered.fallback.status, 'not_triggered');
  assert.deepEqual(nonJevOf(underpowered).reasons, ['underpowered']);
  assert.equal(nonJevOf(underpowered).source, 'primary');
  for (const result of [passing, slow, underpowered]) assert.deepEqual(JEV_SNAPSHOT(result), JEV_SNAPSHOT(PASS));

  // A sentinel that is inconclusive only for being under-round is not a trigger.
  const shortSentinel = record(evaluate({ autopilot: autopilotCampaign({ rounds: 12 }), fallback: FALLBACK }));
  assert.deepEqual(nonJevOf(shortSentinel).reasons, ['sentinel_inconclusive']);
  assert.equal(shortSentinel.fallback.status, 'not_triggered');
});

test('fallback: a sentinel left inconclusive by resume drift is caused by a listed trigger, so the fallback applies', () => {
  const drift = [{ at: '2026-11-02T10:00:00.000Z', claudeVersion: null, chromeBrowser: 'Chrome/147.0.7700.0', launchFlags: [] }];
  const result = record(evaluate({ autopilot: autopilotCampaign({ identity: { resumes: drift } }), fallback: FALLBACK }));
  assert.equal(result.fallback.status, 'used');
  assert.deepEqual(result.fallback.primaryReasons, ['resume_drift:sentinel', 'sentinel_inconclusive']);
  assert.equal(nonJevOf(result).verdict, 'pass');
  assert.equal(nonJevOf(result).source, 'fallback');
  assertJev(result, 'inconclusive', ['resume_drift']);
});

test('fallback: a sentinel trip plus a passing core-rebaseline-71 replaces the non-Jev verdict', () => {
  const primary = record(evaluate(SENTINEL_TRIP));
  assert.deepEqual(nonJevOf(primary).reasons, ['sentinel_trip']);
  const used = record(evaluate({ ...SENTINEL_TRIP, fallback: FALLBACK }));
  assert.equal(used.fallback.status, 'used');
  assert.equal(used.fallback.primaryVerdict, 'inconclusive');
  assert.deepEqual(used.fallback.primaryReasons, ['sentinel_trip']);
  assert.equal(used.fallback.verdict, 'pass');
  assert.deepEqual(used.fallback.refusals, []);
  assert.equal(nonJevOf(used).verdict, 'pass');
  assert.equal(nonJevOf(used).source, 'fallback');
  assert.equal(nonJevOf(used).faster, true);
  assert.equal(used.sentinel.status, 'trip', 'the sentinel result itself is unchanged');
  assert.equal(used.fallback.campaigns.pin.id, REAL_GATE.fallback.campaigns.pin.id);
  assert.equal(used.fallback.campaigns.candidate.meetsMinRounds, true);
  assert.deepEqual(JEV_SNAPSHOT(used), JEV_SNAPSHOT(primary));

  // The fallback runs the same rules: a slow candidate fails there too.
  const slowFallback = fallbackCampaigns({ candidate: { effect: { claude: { speed: 1.25 } } } });
  const failed = record(evaluate({ ...SENTINEL_TRIP, fallback: slowFallback }));
  assert.equal(failed.fallback.status, 'used');
  assert.equal(nonJevOf(failed).verdict, 'fail');
  assert.deepEqual(nonJevOf(failed).reasons, ['time_noninferiority']);

  // A fallback candidate that never finished its schedule is inconclusive, never a pass (WR-02).
  const unfinished = { ...FALLBACK, candidate: withRows(FALLBACK.candidate, (runs) => { runs.pop(); }) };
  const incomplete = record(evaluate({ ...SENTINEL_TRIP, fallback: unfinished }));
  assert.equal(incomplete.fallback.status, 'used');
  assert.equal(incomplete.fallback.campaigns.candidate.complete, false);
  assert.equal(nonJevOf(incomplete).verdict, 'inconclusive');
  assert.deepEqual(nonJevOf(incomplete).reasons, ['campaign_incomplete']);

  // An identity mismatch inside the fallback pair is inconclusive, never a pass.
  const drifted = fallbackCampaigns({ candidate: { identity: { hosts: { claude: { version: '2.1.999 (Claude Code)' } } } } });
  const mismatched = record(evaluate({ ...SENTINEL_TRIP, fallback: drifted }));
  assert.equal(nonJevOf(mismatched).verdict, 'inconclusive');
  assert.deepEqual(nonJevOf(mismatched).reasons, ['identity_mismatch:hosts.claude.version']);
});

test('fallback: refusals stay inside the fallback result and leave the primary verdict in place', () => {
  const cases = [
    ['fallback_pin_not_pin', fallbackCampaigns({ pin: { identity: { git: { sha: `abc${SYNTHETIC_PIN_SHA.slice(3)}` } } } })],
    ['fallback_candidate_not_measured', fallbackCampaigns({ candidate: { identity: { git: { sha: 'b'.repeat(40) } } } })],
    ['fallback_candidate_not_measured', fallbackCampaigns({ candidate: { identity: { gate: { path: GATE_FILE, sha256: 'f'.repeat(64) } } } })],
    ['fallback_campaign_mismatch', fallbackCampaigns({ pin: { campaignId: 'core-rebaseline-71-pinned' } })],
    ['fallback_campaign_mismatch', fallbackCampaigns({ candidate: { scheduleSeed: 67 } })],
    ['fallback_campaign_mismatch', fallbackCampaigns({ candidate: { conditions: ['off', 'on'] } })],
  ];
  for (const [code, fallback] of cases) {
    const result = record(evaluate({ ...SENTINEL_TRIP, fallback }));
    assert.deepEqual(result.refusals, [], `${code}: never a top-level refusal`);
    assert.equal(result.fallback.status, 'refused', code);
    assert.deepEqual(unique(result.fallback.refusals.map((refusal) => refusal.code)), [code], code);
    assert.equal(nonJevOf(result).verdict, 'inconclusive', code);
    assert.deepEqual(nonJevOf(result).reasons, ['sentinel_trip'], code);
    assert.equal(nonJevOf(result).source, 'primary');
    assert.deepEqual(JEV_SNAPSHOT(result), JEV_SNAPSHOT(evaluate(SENTINEL_TRIP)));
  }
  const pinSchema = { ...FALLBACK, pin: withRows(FALLBACK.pin, (runs) => { runs[0].schemaVersion = 2; }) };
  assert.equal(record(evaluate({ ...SENTINEL_TRIP, fallback: pinSchema })).fallback.refusals[0].code, 'fallback_campaign_mismatch');
});

test('fallback: evaluateFallback reuses the non-Jev rules on the pin and candidate pair', () => {
  const opts = { iterations: ITERATIONS, seed: GATE.bootstrap.seed, level: GATE.bootstrap.level };
  const out = evaluateFallback({
    gate: GATE, gateSha256: GATE_SHA256, primary: { verdict: 'inconclusive', reasons: ['identity_mismatch:chromeMajor'] },
    fallback: FALLBACK, candidateSha: SYNTHETIC_CANDIDATE_SHA, opts,
  });
  assert.equal(out.result.status, 'used');
  assert.equal(out.replacement.verdict, 'pass');
  assert.deepEqual(Object.keys(out.replacement.criteria).sort(), ['completion', 'safety', 'speed']);
  const none = evaluateFallback({ gate: GATE, gateSha256: GATE_SHA256, primary: { verdict: 'pass', reasons: [] }, fallback: null, opts });
  assert.equal(none.result.status, 'not_supplied');
  assert.equal(none.replacement, null);
  assert.deepEqual([...FALLBACK_STATUSES], ['not_supplied', 'not_triggered', 'used', 'refused']);
});

// --- Task 2: sensitivity and categories ---------------------------------------------------------

test('sensitivity: Bonferroni two-family intervals at 0.975 are reported and never decisive', () => {
  const { sensitivity } = PASS;
  assert.equal(sensitivity.level, GATE.bootstrap.sensitivityLevel);
  assert.equal(sensitivity.z, 2.241402727604947);
  assert.equal(sensitivity.decisive, false);
  for (const family of ['jev', 'nonJev']) {
    const { speed, completion } = sensitivity[family];
    assert.equal(speed.level, GATE.bootstrap.sensitivityLevel);
    assert.ok(speed.ci[0] <= speed.estimate && speed.estimate <= speed.ci[1]);
    assert.ok(completion.ci[0] <= completion.diff && completion.diff <= completion.ci[1]);
  }
  const main = jevOf(PASS).criteria.speed.ci;
  const wide = sensitivity.jev.speed.ci;
  assert.ok(wide[0] <= main[0] && wide[1] >= main[1], 'the sensitivity interval is the wider one');

  // The verdict functions never read the sensitivity block.
  const { sensitivity: removed, ...rest } = clone(PASS);
  assert.ok(removed);
  for (const name of JEV_PATHS) {
    const entry = rest.paths[name];
    assert.deepEqual(jevVerdict({ criteria: entry.criteria, guards: entry.guards }), { verdict: entry.verdict, reasons: entry.reasons });
  }
  const nonJev = rest.paths['mcp-non-jev'];
  assert.deepEqual(nonJevVerdict({ criteria: nonJev.criteria, guards: nonJev.guards }),
    { verdict: nonJev.verdict, reasons: nonJev.reasons, faster: nonJev.faster });
});

test('categories: per-category ratios and the PROJECT targets are descriptive only', () => {
  const { categories } = PASS;
  for (const category of ['mixed', 'click-heavy']) {
    for (const family of ['jev', 'nonJev']) {
      const entry = categories.byCategory[category][family];
      assert.equal(entry.status, 'ok', `${category} ${family}`);
      assert.equal(entry.usedTasks.length, 6);
    }
  }
  assert.equal(categories.targets.autopilotMixed.status, 'not met');
  assert.equal(categories.targets.autopilotMixed.path, 'jev-autopilot');
  assert.deepEqual(categories.targets.mcpClickHeavy.map((entry) => entry.path), ['jev-mcp-run-task', 'mcp-non-jev']);
  assert.ok(categories.targets.mcpClickHeavy.every((entry) => entry.status === 'not met'));
  assert.equal(categories.targets.mcpUatStyle.status, 'not measured: no UAT-style tasks in the core set');
  assertJev(PASS, 'pass', []);

  const fast = record(evaluate({ autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 0.5 } } }) }));
  assert.equal(fast.categories.targets.autopilotMixed.status, 'met');
  assert.ok(fast.categories.targets.autopilotMixed.ci[1] <= 1 / GATE.targets.autopilotMixed[0]);
  assert.equal(fast.categories.targets.mcpClickHeavy[1].status, 'not met');
  assertJev(fast, 'pass', []);
});

test('every reason the fixtures produced is a REASONS code, and verdicts come from VERDICTS', () => {
  assert.ok(Object.isFrozen(REASONS) && Object.isFrozen(VERDICTS));
  assert.ok(SEEN_REASONS.size > 10, `${SEEN_REASONS.size} reasons seen`);
  for (const reason of SEEN_REASONS) {
    assert.ok(REASONS.includes(reason.split(':')[0]), `unknown reason ${reason}`);
    assert.match(reason, /^[a-z][a-z0-9_]*(:[A-Za-z0-9_.]+)?$/);
  }
  for (const entry of Object.values(PASS.paths)) assert.ok(VERDICTS.includes(entry.verdict));
  assert.ok(Object.isFrozen(REFUSAL_CODES) && Object.isFrozen(FALLBACK_STATUSES));
  assert.deepEqual([...SEEN_REFUSALS].sort(), [...REFUSAL_CODES].sort(), 'every refusal code is exercised');
});

// --- Plan 07: the decision file, release claims and gate report (D-17, D-18) --------------------

const DECISION_META = Object.freeze({
  gate: {
    path: GATE_FILE, sha256: GATE_SHA256, gateVersion: REAL_GATE.gateVersion,
    authorDate: '2026-10-17T09:00:00-07:00', committerDate: '2026-10-17T09:00:00-07:00',
  },
  measuredSha: SYNTHETIC_CANDIDATE_SHA,
});
const ALL_PATHS = ['jev-mcp-run-task', 'jev-autopilot', 'mcp-non-jev'];
const FORBIDDEN_CLAIM_TEXT = /jevMs|latencyMs|per decision|ms per call/i;

// The evaluator input and result of one scenario, with its decision and report.
function scenario({ autopilot = AUTOPILOT, claude = CLAUDE, baseline = BASELINE, suites = passingSuites(), fallback } = {}) {
  const input = { gate: GATE, gateSha256: GATE_SHA256, baseline, autopilot, claude, suites, ...(fallback === undefined ? {} : { fallback }) };
  const result = evaluateGate(input, { iterations: ITERATIONS });
  const decision = buildDecision(result, { ...clone(DECISION_META), suites, input });
  return { input, result, decision };
}

const PASS_SCENARIO = scenario();
const SAFETY_SCENARIO = scenario({
  autopilot: autopilotCampaign({ safety: { events: [{ kind: 'requestOvercount', arm: 'autopilot', condition: 'on', acted: true, count: 1 }] } }),
});
const NOT_EXERCISED_SCENARIO = scenario({ autopilot: autopilotCampaign({ jev: { actRate: 0.3 } }) });
const FASTER_SCENARIO = scenario({ claude: claudeCampaign({ effect: { claude: { speed: 0.95 } } }) });
const LEVEL_SCENARIO = scenario({ claude: claudeCampaign({ effect: { claude: { speed: 1.02 } } }) });

const actionsOf = (decision) => Object.fromEntries(ALL_PATHS.map((name) => [name, decision.paths[name].v6Action]));
const claimIds = (decision) => decision.claims.map((entry) => entry.id);
const pct = (value) => `${(value * 100).toFixed(1)}%`;

function reportOf({ input, result, decision }) {
  return renderGateReport(input, result, decision);
}

test('decision: each verdict maps to exactly one V6 action (D-17), and every built decision validates', () => {
  const cases = [
    ['Jev and non-Jev pass', PASS_SCENARIO, ['ship_opt_in_default_off', 'ship_opt_in_default_off', 'publish_mcp_0_12_0']],
    ['Jev safety fail disables both Jev paths', SAFETY_SCENARIO, ['disable_jev_operator_switch', 'disable_jev_operator_switch', 'publish_mcp_0_12_0']],
    ['Jev not_exercised', NOT_EXERCISED_SCENARIO, ['ship_experimental_no_speed_claim', 'ship_experimental_no_speed_claim', 'publish_mcp_0_12_0']],
    ['Jev speed fail', scenario({ autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 1.0 } } }) }),
      ['ship_experimental_no_speed_claim', 'ship_experimental_no_speed_claim', 'publish_mcp_0_12_0']],
    ['Jev inconclusive (suites not run)', scenario({ suites: { ran: false, results: [] } }),
      ['ship_experimental_no_speed_claim', 'ship_experimental_no_speed_claim', 'publish_mcp_0_12_0']],
    ['non-Jev inconclusive (no baseline sidecar)', scenario({ baseline: { ...BASELINE, safety: null } }),
      ['ship_opt_in_default_off', 'ship_opt_in_default_off', 'withhold_mcp_0_12_0']],
    ['non-Jev fail (time)', scenario({ claude: claudeCampaign({ effect: { claude: { speed: 1.25 } } }) }),
      ['ship_opt_in_default_off', 'ship_opt_in_default_off', 'withhold_mcp_0_12_0']],
  ];
  for (const [name, { result, decision }, expected] of cases) {
    assert.deepEqual(Object.values(actionsOf(decision)), expected, name);
    for (const path of ALL_PATHS) {
      assert.equal(decision.paths[path].verdict, result.paths[path].verdict, `${name}: ${path}`);
      assert.equal(decision.paths[path].recommendation, V6_ACTIONS[decision.paths[path].v6Action], `${name}: ${path}`);
    }
    const check = validateDecision(decision);
    assert.deepEqual(check.errors, [], name);
    assert.equal(check.ok, true, name);
  }
  assert.equal(SAFETY_SCENARIO.decision.paths['jev-autopilot'].criteria.safety.verdict, 'fail');
  assert.match(V6_ACTIONS.disable_jev_operator_switch, /fly secrets set JEV_ENABLED=false/);
  assert.equal(NOT_EXERCISED_SCENARIO.decision.paths['jev-mcp-run-task'].verdict, 'not_exercised');
  assert.equal(NOT_EXERCISED_SCENARIO.decision.paths['jev-mcp-run-task'].criteria.exercised.status, 'not_exercised');
});

test('decision: the file records the gate, the campaigns, the suites, the evaluator and an empty fallback', () => {
  const { decision, result } = PASS_SCENARIO;
  assert.deepEqual(decision.gate, DECISION_META.gate);
  assert.equal(decision.schemaVersion, 1);
  assert.equal(decision.measuredSha, SYNTHETIC_CANDIDATE_SHA);
  assert.deepEqual(decision.campaigns.autopilot, {
    id: REAL_GATE.campaigns.autopilot.id, createdAt: AUTOPILOT.identity.createdAt, gitSha: SYNTHETIC_CANDIDATE_SHA, rounds: ROUNDS,
  });
  assert.equal(decision.campaigns.baseline.gitSha, SYNTHETIC_PIN_SHA);
  assert.deepEqual(decision.suites, passingSuites());
  assert.deepEqual(decision.sentinel, { status: 'pass', reasons: [], blocker: null });
  assert.deepEqual(decision.fallback, {
    status: 'not_supplied', primaryVerdict: null, primaryReasons: [], reasons: [], campaigns: { pin: null, candidate: null },
  });
  assert.deepEqual(decision.evaluator, result.inputs);
  const jev = decision.paths['jev-mcp-run-task'];
  assert.equal(jev.faster, null);
  assert.equal(jev.source, null);
  assert.equal(jev.criteria.identity, null);
  assert.equal(jev.criteria.exercised.actedShare, result.exercise.actedShare);
  assert.deepEqual(jev.criteria.speed, {
    verdict: 'pass', estimate: result.paths['jev-mcp-run-task'].criteria.speed.estimate, ci: result.paths['jev-mcp-run-task'].criteria.speed.ci,
  });
  const nonJev = decision.paths['mcp-non-jev'];
  assert.equal(nonJev.source, 'primary');
  assert.equal(typeof nonJev.faster, 'boolean');
  assert.equal(nonJev.criteria.exercised, null);
  assert.deepEqual(nonJev.criteria.identity, { verdict: 'pass', mismatches: [] });
  const mismatch = scenario({ claude: claudeCampaign({ identity: { hosts: { claude: { model: 'claude-other' } } } }) });
  assert.deepEqual(mismatch.decision.paths['mcp-non-jev'].criteria.identity, { verdict: 'inconclusive', mismatches: ['hosts.claude.model'] });
  assert.equal(mismatch.decision.paths['mcp-non-jev'].v6Action, 'withhold_mcp_0_12_0');
  // IN-06: a mismatch inherited from the autopilot sentinel stays in the reasons and is not the path's own identity mismatch.
  const inherited = scenario({ autopilot: autopilotCampaign({ identity: { provider: { requestedModel: 'grok-9' } } }) });
  assert.deepEqual(inherited.decision.paths['mcp-non-jev'].reasons, ['identity_mismatch:sentinel.provider.requestedModel', 'sentinel_inconclusive']);
  assert.deepEqual(inherited.decision.paths['mcp-non-jev'].criteria.identity, { verdict: 'pass', mismatches: [] });
  assert.equal(inherited.decision.paths['mcp-non-jev'].verdict, 'inconclusive');
  assert.deepEqual(validateDecision(inherited.decision), { ok: true, errors: [] });
  assert.throws(() => buildDecision({ refusals: [{ code: 'candidate_dirty', detail: 'claude.git.dirty' }], campaigns: {}, inputs: {} }, DECISION_META));
});

test('validateDecision rejects extra and missing keys, unknown actions, long strings and URLs, naming paths and never values', () => {
  const { decision } = PASS_SCENARIO;
  const SECRET = 'SECRETVALUE';
  const mutate = (edit) => {
    const copy = clone(decision);
    edit(copy);
    const check = validateDecision(copy);
    assert.equal(check.ok, false);
    for (const error of check.errors) assert.equal(error.includes(SECRET), false, `an error echoed a value: ${error}`);
    return check.errors;
  };
  assert.ok(mutate((d) => { d.extra = SECRET; }).includes('extra_key:extra'));
  assert.ok(mutate((d) => { d.paths['jev-autopilot'].criteria.speed.note = SECRET; }).includes('extra_key:paths.jev-autopilot.criteria.speed.note'));
  assert.ok(mutate((d) => { delete d.paths['mcp-non-jev'].v6Action; }).includes('missing_key:paths.mcp-non-jev.v6Action'));
  assert.ok(mutate((d) => { delete d.fallback.campaigns; }).includes('missing_key:fallback.campaigns'));
  assert.ok(mutate((d) => { d.paths['jev-autopilot'].v6Action = `ship_${SECRET}`; }).includes('type:paths.jev-autopilot.v6Action'));
  assert.ok(mutate((d) => { d.paths['jev-autopilot'].v6Action = 'withhold_mcp_0_12_0'; }).includes('inconsistent:paths.jev-autopilot.v6Action'));
  assert.ok(mutate((d) => { d.paths['mcp-non-jev'].v6Action = 'withhold_mcp_0_12_0'; }).includes('inconsistent:paths.mcp-non-jev.v6Action'));
  const long = mutate((d) => { d.paths['jev-mcp-run-task'].recommendation = `${SECRET}${'x'.repeat(201 - SECRET.length)}`; });
  assert.ok(long.includes('string_too_long:paths.jev-mcp-run-task.recommendation'), long.join(','));
  assert.ok(mutate((d) => { d.claims[0].text = `${SECRET}${'y'.repeat(401 - SECRET.length)}`; }).includes('string_too_long:claims[0].text'));
  const atLimit = mutate((d) => { d.claims[0].text = 'y'.repeat(400); });
  assert.equal(atLimit.includes('string_too_long:claims[0].text'), false, 'a claim text may hold 400 characters');
  assert.ok(atLimit.includes('claim_text:claims[0].text'), 'a hand-edited claim text no longer matches its tokens');
  assert.ok(mutate((d) => { d.gate.path = `https://${SECRET}`; }).includes('url_in_string:gate.path'));
  assert.ok(mutate((d) => { d.paths['jev-mcp-run-task'].reasons = [`x://${SECRET}`]; }).includes('url_in_string:paths.jev-mcp-run-task.reasons[0]'));
  assert.ok(mutate((d) => { d.claims[0].text = `${d.claims[0].text} file://${SECRET}`; }).includes('url_in_string:claims[0].text'));
  assert.ok(mutate((d) => { d.paths['mcp-non-jev'].source = 'fallback'; }).includes('inconsistent:paths.mcp-non-jev.source'));
  assert.ok(mutate((d) => { d.suites.results[0].exitCode = SECRET; }).includes('type:suites.results[0].exitCode'));
  assert.ok(mutate((d) => { d.gate.sha256 = SECRET; }).includes('type:gate.sha256'));
  assert.deepEqual(validateDecision(null).errors, ['type:']);
});

test('claims: a Jev pass quotes the wallMs ratio, its CI, the completion difference in points and the counted runs', () => {
  const { decision, result } = PASS_SCENARIO;
  const jevClaim = decision.claims.find((entry) => entry.id === 'jev-whole-task');
  assert.ok(jevClaim, claimIds(decision).join(','));
  const { speed, completion } = result.paths['jev-mcp-run-task'].criteria;
  for (const value of [speed.estimate, speed.ci[0], speed.ci[1]]) assert.ok(jevClaim.text.includes(pct(value)), `${pct(value)} in ${jevClaim.text}`);
  const points = (value) => `${Math.abs(Math.round(value * 1000) / 10).toFixed(1)}`;
  for (const value of [completion.diff, completion.ci[0], completion.ci[1]]) assert.ok(jevClaim.text.includes(points(value)), jevClaim.text);
  assert.ok(jevClaim.text.includes(`${completion.treatment.completed} of ${completion.treatment.counted} counted runs`), jevClaim.text);
  assert.ok(jevClaim.text.includes(`${completion.control.completed} of ${completion.control.counted} with it off`), jevClaim.text);
  assert.ok(jevClaim.text.length <= 400, `${jevClaim.text.length}`);
  assert.equal(claimIds(decision).includes('jev-no-speedup'), false);
});

test('claims: any other Jev verdict says exactly that no whole-task speedup was demonstrated; a safety fail adds the disable sentence', () => {
  const NO_SPEEDUP = 'No whole-task speedup from fast mode was demonstrated on the 12-task core set.';
  const DISABLED = 'Fast mode is disabled for every install for this release.';
  for (const { decision } of [NOT_EXERCISED_SCENARIO, scenario({ autopilot: autopilotCampaign({ effect: { 'autopilot/on': { speed: 1.0 } } }) })]) {
    const jevClaims = decision.claims.filter((entry) => entry.id.startsWith('jev-'));
    assert.deepEqual(jevClaims.map((entry) => entry.text), [NO_SPEEDUP]);
  }
  const safetyClaims = SAFETY_SCENARIO.decision.claims.filter((entry) => entry.id.startsWith('jev-'));
  assert.deepEqual(safetyClaims.map((entry) => entry.text), [NO_SPEEDUP, DISABLED]);
  assert.deepEqual(safetyClaims.map((entry) => entry.tokens), [[], []]);
});

test('claims: a non-Jev pass states time non-inferiority within the bound, with "faster" only when faster is true; no claim otherwise', () => {
  for (const { decision, result } of [FASTER_SCENARIO, LEVEL_SCENARIO]) {
    const entry = result.paths['mcp-non-jev'];
    assert.equal(entry.verdict, 'pass');
    const time = decision.claims.find((item) => item.id === 'mcp-non-jev-time');
    assert.ok(time, claimIds(decision).join(','));
    assert.match(time.text, /non-inferiority bound of 110\.0%/);
    assert.ok(time.text.includes(pct(entry.criteria.speed.estimate)) && time.text.includes(pct(entry.criteria.speed.ci[1])), time.text);
    assert.match(time.text, /completion changed by [+-]?\d+\.\d points/);
    const faster = decision.claims.filter((item) => /faster/i.test(item.text));
    if (entry.faster) {
      assert.deepEqual(faster.map((item) => item.id), ['mcp-non-jev-faster']);
    } else {
      assert.deepEqual(faster, [], 'no "faster" wording when the CI upper bound is not below 1');
    }
  }
  assert.equal(FASTER_SCENARIO.result.paths['mcp-non-jev'].faster, true);
  assert.equal(LEVEL_SCENARIO.result.paths['mcp-non-jev'].faster, false);
  for (const failing of [scenario({ claude: claudeCampaign({ effect: { claude: { speed: 1.25 } } }) }), scenario({ baseline: { ...BASELINE, safety: null } })]) {
    assert.deepEqual(failing.decision.claims.filter((item) => item.id.startsWith('mcp-non-jev')), []);
  }
});

test('claims: the cost sentence states LLM cost for control and fast and the FSB-borne Jev cost apart', () => {
  const { decision, input } = PASS_SCENARIO;
  const cost = decision.claims.find((entry) => entry.id === 'cost');
  assert.ok(cost);
  assert.deepEqual(cost.tokens.map((item) => [item.name, item.source]), [['llmOff', 'cost'], ['llmOn', 'cost'], ['jevOn', 'cost']]);
  assert.match(cost.text, /^LLM cost per completed task was \$\d+\.\d{4} with fast mode off and \$\d+\.\d{4} with it on; Jev cost/);
  assert.match(cost.text, /which FSB bears and which is not included in the LLM cost\./);
  const on = groupRows({ autopilot: input.autopilot.runs }, GATE).autopilotOn.filter(counted);
  const expectedLlm = on.reduce((sum, row) => sum + row.cost.usd, 0) / on.filter((row) => row.pass).length;
  assert.ok(Math.abs(cost.tokens[1].value - expectedLlm) < 1e-12);
  assert.equal(buildClaims(PASS_SCENARIO.result).some((entry) => entry.id === 'cost'), false, 'no rows, no cost sentence');
});

test('claims: a sub-cent cost keeps two significant digits and never reads $0.0000 (CR-01)', () => {
  assert.equal(formatClaimValue('cost', 0.0000378), '$0.000038');
  assert.notEqual(formatClaimValue('cost', 0.0000378), '$0.0000');
  assert.equal(formatClaimValue('cost', 3.78e-7), '$0.00000038');
  assert.equal(formatClaimValue('cost', 0.009999), '$0.009999');
  assert.equal(formatClaimValue('cost', 0.0123456), '$0.0123');
  assert.equal(formatClaimValue('cost', 0), '$0.0000');
  assert.equal(formatClaimValue('cost', null), 'unavailable');
  const cost = PASS_SCENARIO.decision.claims.find((entry) => entry.id === 'cost');
  const jevOn = cost.tokens.find((item) => item.name === 'jevOn');
  assert.ok(jevOn.value > 0 && jevOn.value < 0.01, `${jevOn.value}`);
  assert.equal(/\$0\.0000\b/.test(cost.text), false, cost.text);
  assert.ok(cost.text.includes(`with it on was ${formatClaimValue('cost', jevOn.value)} (provider-reported)`), cost.text);
  assert.deepEqual(checkClaims(PASS_SCENARIO.decision.claims), { ok: true, errors: [] });
});

test('claims: the cost sentence needs a cost on every counted run, labels estimated Jev cost and is written only on a Jev pass (WR-01)', () => {
  const { input, result } = PASS_SCENARIO;
  const COST_IDS = ['cost', 'cost-estimated'];
  const costOf = (claims) => claims.find((entry) => COST_IDS.includes(entry.id));
  const valueOf = (entry, name) => entry.tokens.find((item) => item.name === name).value;
  const groupsOf = (campaign) => groupRows({ autopilot: campaign.runs }, GATE);
  const withAutopilot = (campaign) => buildClaims(result, { ...input, autopilot: campaign });
  const rowById = (runs, id) => runs.find((row) => row.runId === id);
  const onCounted = groupsOf(input.autopilot).autopilotOn.filter(counted);
  const offId = groupsOf(input.autopilot).autopilotOff.filter(counted)[0].runId;
  const calledId = onCounted.find((row) => row.jev.jevCalls > 0).runId;

  // Full coverage: the Jev figure is the provider total of every counted fast run over the completed ones.
  const full = costOf(buildClaims(result, input));
  assert.equal(full.id, 'cost');
  const expectedJev = onCounted.reduce((sum, row) => sum + row.jev.usd.provider, 0) / onCounted.filter((row) => row.pass).length;
  assert.ok(Math.abs(valueOf(full, 'jevOn') - expectedJev) < 1e-15, `${valueOf(full, 'jevOn')} vs ${expectedJev}`);

  // One counted control run without an LLM cost: the control figure is unavailable, never biased low.
  const noLlm = costOf(withAutopilot(withRows(input.autopilot, (runs) => { rowById(runs, offId).cost.usd = null; })));
  assert.equal(valueOf(noLlm, 'llmOff'), null);
  assert.ok(valueOf(noLlm, 'llmOn') > 0);
  assert.match(noLlm.text, /^LLM cost per completed task was unavailable with fast mode off and \$/);

  // Called fast runs with no Jev figure ('summary' rows of jev_measurement_missing runs): the Jev figure is unavailable.
  const missing = autopilotCampaign({ jev: { missingRate: 0.1 } });
  assert.ok(groupsOf(missing).autopilotOn.some((row) => counted(row) && row.jev.source === 'summary'));
  const noJev = costOf(withAutopilot(missing));
  assert.equal(valueOf(noJev, 'jevOn'), null);
  assert.ok(noJev.text.includes('with it on was unavailable (provider-reported)'), noJev.text);

  // Runs with no Jev call (no_block) cost FSB nothing and keep the figure available.
  const noBlock = autopilotCampaign({ jev: { noBlockRate: 0.1 } });
  const noBlockOn = groupsOf(noBlock).autopilotOn.filter(counted);
  assert.ok(noBlockOn.some((row) => row.jev.source === 'no_block'));
  const zeroCalls = costOf(withAutopilot(noBlock));
  const noBlockExpected = noBlockOn.reduce((sum, row) => sum + (row.jev.jevCalls === 0 ? 0 : row.jev.usd.provider), 0)
    / noBlockOn.filter((row) => row.pass).length;
  assert.ok(Math.abs(valueOf(zeroCalls, 'jevOn') - noBlockExpected) < 1e-15);

  // An estimated Jev figure is summed and the sentence says so.
  const estimated = withRows(input.autopilot, (runs) => { rowById(runs, calledId).jev.usd = { provider: null, estimate: 0.00004 }; });
  const withEstimate = costOf(withAutopilot(estimated));
  assert.equal(withEstimate.id, 'cost-estimated');
  assert.ok(withEstimate.text.includes('otherwise estimated from input tokens'), withEstimate.text);
  const calledRow = rowById(input.autopilot.runs, calledId);
  const shifted = expectedJev + (0.00004 - calledRow.jev.usd.provider) / onCounted.filter((row) => row.pass).length;
  assert.ok(Math.abs(valueOf(withEstimate, 'jevOn') - shifted) < 1e-15);
  assert.deepEqual(checkClaims([withEstimate]), { ok: true, errors: [] });
  const decision = clone(PASS_SCENARIO.decision);
  decision.claims = decision.claims.map((entry) => (COST_IDS.includes(entry.id) ? withEstimate : entry));
  assert.deepEqual(validateDecision(decision), { ok: true, errors: [] });

  // Any Jev verdict other than pass: no fast-mode cost sentence, beside "disabled" least of all.
  for (const { decision: other, input: otherInput, result: otherResult } of [SAFETY_SCENARIO, NOT_EXERCISED_SCENARIO]) {
    assert.equal(other.claims.some((entry) => COST_IDS.includes(entry.id)), false, claimIds(other).join(','));
    assert.equal(buildClaims(otherResult, otherInput).some((entry) => COST_IDS.includes(entry.id)), false);
  }
});

test('claims: every token carries an allowed source, the checker re-renders each text, and a jevMs token fails it', () => {
  const scenarios = [PASS_SCENARIO, SAFETY_SCENARIO, NOT_EXERCISED_SCENARIO, FASTER_SCENARIO, LEVEL_SCENARIO];
  for (const { decision } of scenarios) {
    for (const entry of decision.claims) {
      for (const item of entry.tokens) assert.ok(ALLOWED_CLAIM_SOURCES.includes(item.source), `${entry.id}.${item.name}: ${item.source}`);
      assert.equal(FORBIDDEN_CLAIM_TEXT.test(entry.text), false, entry.text);
      assert.ok(Object.prototype.hasOwnProperty.call(CLAIM_TEMPLATES, entry.id));
    }
    assert.deepEqual(checkClaims(decision.claims), { ok: true, errors: [] });
  }
  for (const template of Object.values(CLAIM_TEMPLATES)) assert.equal(FORBIDDEN_CLAIM_TEXT.test(template), false, template);
  assert.deepEqual([...ALLOWED_CLAIM_SOURCES], ['wallMs-ratio', 'completion-diff', 'completion-count', 'cost']);

  const tampered = clone(PASS_SCENARIO.decision.claims);
  tampered[0].tokens[0].source = 'jevMs';
  const check = checkClaims(tampered);
  assert.equal(check.ok, false);
  assert.ok(check.errors.includes('claim_source:claims[0].tokens[0].source'), check.errors.join(','));
  const extra = clone(PASS_SCENARIO.decision.claims);
  extra[0].tokens.push({ name: 'jevMsPerCall', value: 120, source: 'cost' });
  assert.equal(checkClaims(extra).ok, false);
  const edited = clone(PASS_SCENARIO.decision.claims);
  edited[0].text = edited[0].text.replace('whole-task', 'per decision');
  assert.ok(checkClaims(edited).errors.includes('claim_forbidden_text:claims[0].text'));
  const decisionWithBadClaim = clone(PASS_SCENARIO.decision);
  decisionWithBadClaim.claims = tampered;
  assert.ok(validateDecision(decisionWithBadClaim).errors.includes('claim_source:claims[0].tokens[0].source'));
});

test('claims: validateDecision ties every claim to the verdicts and the criteria numbers (WR-06)', () => {
  const errorsOf = (decision) => validateDecision(decision).errors;
  const claimOf = (decision, id) => clone(decision.claims.find((entry) => entry.id === id));
  // A re-rendered claim: the hand edit keeps text and tokens in step, so only the verdict and criteria checks can catch it.
  const rerendered = (entry, edits) => {
    const tokens = entry.tokens.map((item) => (Object.prototype.hasOwnProperty.call(edits, item.name) ? { ...item, value: edits[item.name] } : item));
    return { id: entry.id, text: renderClaim(entry.id, tokens), tokens };
  };
  for (const { decision } of [PASS_SCENARIO, SAFETY_SCENARIO, NOT_EXERCISED_SCENARIO, FASTER_SCENARIO, LEVEL_SCENARIO]) {
    assert.deepEqual(validateDecision(decision), { ok: true, errors: [] });
  }

  // A Jev whole-task claim in a decision whose Jev verdict is fail.
  const failWithPassClaim = clone(SAFETY_SCENARIO.decision);
  failWithPassClaim.claims.unshift(claimOf(PASS_SCENARIO.decision, 'jev-whole-task'));
  assert.ok(errorsOf(failWithPassClaim).includes('claim_not_allowed:claims[0].id'), errorsOf(failWithPassClaim).join(','));
  // The disable sentence is required exactly when the Jev paths are disabled.
  const noDisabled = clone(SAFETY_SCENARIO.decision);
  noDisabled.claims = noDisabled.claims.filter((entry) => entry.id !== 'jev-disabled');
  assert.ok(errorsOf(noDisabled).includes('claim_missing:claims.jev-disabled'));
  const extraDisabled = clone(NOT_EXERCISED_SCENARIO.decision);
  extraDisabled.claims.push(claimOf(SAFETY_SCENARIO.decision, 'jev-disabled'));
  assert.ok(errorsOf(extraDisabled).includes(`claim_not_allowed:claims[${extraDisabled.claims.length - 1}].id`));
  // A Jev pass needs its whole-task sentence and never says no speedup.
  const passWithout = clone(PASS_SCENARIO.decision);
  passWithout.claims = passWithout.claims.filter((entry) => entry.id !== 'jev-whole-task');
  passWithout.claims.unshift(claimOf(SAFETY_SCENARIO.decision, 'jev-no-speedup'));
  assert.ok(errorsOf(passWithout).includes('claim_missing:claims.jev-whole-task'));
  assert.ok(errorsOf(passWithout).includes('claim_not_allowed:claims[0].id'));

  // "faster" only with faster true; no non-Jev sentence without a non-Jev pass.
  assert.equal(LEVEL_SCENARIO.decision.paths['mcp-non-jev'].faster, false);
  const notFaster = clone(LEVEL_SCENARIO.decision);
  notFaster.claims.push(claimOf(FASTER_SCENARIO.decision, 'mcp-non-jev-faster'));
  assert.ok(errorsOf(notFaster).includes(`claim_not_allowed:claims[${notFaster.claims.length - 1}].id`));
  const fasterMissing = clone(FASTER_SCENARIO.decision);
  fasterMissing.claims = fasterMissing.claims.filter((entry) => entry.id !== 'mcp-non-jev-faster');
  assert.ok(errorsOf(fasterMissing).includes('claim_missing:claims.mcp-non-jev-faster'));
  const withheld = scenario({ claude: claudeCampaign({ effect: { claude: { speed: 1.25 } } }) }).decision;
  const withheldTime = clone(withheld);
  withheldTime.claims.push(claimOf(FASTER_SCENARIO.decision, 'mcp-non-jev-time'));
  assert.ok(errorsOf(withheldTime).includes(`claim_not_allowed:claims[${withheldTime.claims.length - 1}].id`));

  // The cost sentence only on a Jev pass, and once.
  const costOnFail = clone(SAFETY_SCENARIO.decision);
  costOnFail.claims.push(claimOf(PASS_SCENARIO.decision, 'cost'));
  assert.ok(errorsOf(costOnFail).includes(`claim_not_allowed:claims[${costOnFail.claims.length - 1}].id`));
  const twoCosts = clone(PASS_SCENARIO.decision);
  twoCosts.claims.push(claimOf(PASS_SCENARIO.decision, 'cost'));
  assert.ok(errorsOf(twoCosts).includes(`claim_repeated:claims[${twoCosts.claims.length - 1}].id`));

  // A ratio edited in both token and text, a completion difference and a non-Jev CI bound no longer match the criteria.
  const halved = clone(PASS_SCENARIO.decision);
  const at = halved.claims.findIndex((entry) => entry.id === 'jev-whole-task');
  halved.claims[at] = rerendered(halved.claims[at], { ratio: 0.5 });
  assert.deepEqual(checkClaims(halved.claims), { ok: true, errors: [] }, 'the text still matches its tokens');
  assert.deepEqual(errorsOf(halved), [`claim_value:claims[${at}].tokens[0].value`]);
  const diffEdited = clone(PASS_SCENARIO.decision);
  diffEdited.claims[at] = rerendered(diffEdited.claims[at], { completionDiffLow: 0.02 });
  assert.deepEqual(errorsOf(diffEdited), [`claim_value:claims[${at}].tokens[4].value`]);
  const boundEdited = clone(FASTER_SCENARIO.decision);
  const fasterAt = boundEdited.claims.findIndex((entry) => entry.id === 'mcp-non-jev-faster');
  boundEdited.claims[fasterAt] = rerendered(boundEdited.claims[fasterAt], { ratioHigh: 0.8 });
  assert.deepEqual(errorsOf(boundEdited), [`claim_value:claims[${fasterAt}].tokens[0].value`]);

  // The two Jev paths come from one comparison.
  const split = clone(PASS_SCENARIO.decision);
  split.paths['jev-autopilot'].criteria.speed.estimate = 0.5;
  assert.ok(errorsOf(split).includes('inconsistent:paths.jev-autopilot.criteria'));
});

test('report: every required section in order, costs on separate lines, and no per-decision timing before the diagnostics', () => {
  const report = reportOf(PASS_SCENARIO);
  let last = -1;
  for (const heading of GATE_REPORT_SECTIONS) {
    const at = report.indexOf(`\n${heading}\n`);
    assert.ok(at > last, `${heading} present and in order`);
    last = at;
  }
  assert.deepEqual(GATE_REPORT_SECTIONS.slice(-2), [DIAGNOSTICS_HEADING, '## Method']);
  const diagnosticsAt = report.indexOf(`\n${DIAGNOSTICS_HEADING}\n`);
  for (const word of ['jevMs', 'latencyMs', 'ms per Jev call']) {
    const first = report.indexOf(word);
    assert.ok(first > diagnosticsAt, `${word} appears only after the diagnostics heading`);
  }
  const lines = report.slice(report.indexOf('\n## Autopilot driver\n')).split('\n');
  const llm = lines.filter((line) => line.startsWith('- LLM cost per completed task'));
  const jev = lines.filter((line) => line.startsWith('- Jev cost per completed task'));
  assert.ok(llm.length >= 2 && jev.length >= 1, 'LLM cost and Jev cost on their own labelled lines');
  for (const line of llm) assert.equal(/Jev/.test(line), false, line);
  assert.equal(/total cost|combined cost|LLM \+ Jev|Jev \+ LLM/i.test(report), false);
  const method = report.slice(report.indexOf('\n## Method\n'));
  assert.match(method, /[Ii]ntention to treat/);
  assert.match(method, /wallMs on the runner's clock/);
  assert.match(method, /side-panel start path was not driven separately/);
  assert.match(method, /token alphabet/);
  for (const bad of ['://', 'NaN', 'null%', 'Infinity', 'undefined']) assert.equal(report.includes(bad), false, bad);
  const verdicts = report.slice(report.indexOf('\n## Verdicts\n'), report.indexOf('\n## Release claims\n'));
  for (const name of ALL_PATHS) assert.ok(verdicts.includes(`${name}: pass -> ${PASS_SCENARIO.decision.paths[name].v6Action}`), name);
  const claims = report.slice(report.indexOf('\n## Release claims\n'), report.indexOf('\n## Autopilot driver\n'));
  for (const entry of PASS_SCENARIO.decision.claims) assert.ok(claims.includes(`- ${entry.text}`), entry.id);
  for (const { input, result, decision } of [SAFETY_SCENARIO, NOT_EXERCISED_SCENARIO]) {
    const other = renderGateReport(input, result, decision);
    for (const bad of ['://', 'NaN', 'null%', 'Infinity', 'undefined']) assert.equal(other.includes(bad), false, bad);
  }
});

test('report: the fast-mode exercise section lists fallbacks (sensitive_goal even at 0), sources, missing measurements and unknown exposure', () => {
  const autopilot = autopilotCampaign({ jev: { missingRate: 0.1, noBlockRate: 0.1, detailMissingRate: 0.05 } });
  const run = scenario({ autopilot });
  const tables = buildTables(run.input, run.result);
  const on = autopilot.runs.filter((row) => row.condition === 'on' && counted(row));
  const bySource = (source) => on.filter((row) => row.jev.source === source).length;
  assert.deepEqual(tables.exercise.bySource, {
    measurement: bySource('measurement'), summary: bySource('summary'), no_block: bySource('no_block'), unknown: bySource(null),
  });
  assert.ok(tables.exercise.bySource.summary > 0 && tables.exercise.bySource.no_block > 0 && tables.exercise.bySource.unknown > 0);
  assert.equal(tables.exercise.missingMeasurement, on.filter((row) => row.flags.includes('jev_measurement_missing')).length);
  assert.equal(tables.exercise.unknownExposure, bySource(null));
  assert.equal(tables.exercise.fallbacks.sensitive_goal, 0);
  const report = reportOf(run);
  const section = report.slice(report.indexOf('\n## Fast-mode exercise\n'), report.indexOf('\n## Typed outcome agreement'));
  assert.match(section, /sensitive_goal: 0/);
  assert.ok(section.includes(NO_ATTEMPT_SENTENCE));
  assert.ok(section.includes(`measurement ${bySource('measurement')}, summary ${bySource('summary')}, no_block ${bySource('no_block')}, unknown ${bySource(null)}`));
  assert.match(section, new RegExp(`jev_measurement_missing: ${tables.exercise.missingMeasurement} run`));
  assert.match(section, new RegExp(`treated as acted for rule \\(a\\)\\): ${bySource(null)}`));
  assert.match(section, /jev-1\.13\.0 \/ fsb-jev-instrument-1/);
  assert.match(section, /Condition leaks \(control runs with Jev activity\): 0/);

  const leak = scenario({ autopilot: autopilotCampaign({ jev: { leakOff: { count: 1, kind: 'local' } } }) });
  const leakTables = buildTables(leak.input, leak.result);
  assert.equal(leakTables.exercise.leakRuns, 1);
  const diagnostics = reportOf(PASS_SCENARIO).slice(reportOf(PASS_SCENARIO).indexOf(`\n${DIAGNOSTICS_HEADING}\n`));
  assert.match(diagnostics, /meta_cognitive_loop_break stops \(M-68-05 watch\): control \d+, fast \d+/);
  assert.match(diagnostics, /Per-protocol view \(acted fast runs only, never decisive\)/);
});

test('report: the typed outcome agreement table counts exactly the injected false done, ambiguous on pass and missing blocks', () => {
  const base = autopilotCampaign({
    fastMode: { falseDone: [{ count: 2 }, { count: 1, statusMismatch: true }], ambiguousOnPass: [{ count: 2 }] },
  });
  const blockedIds = base.runs
    .filter((row) => row.condition === 'on' && counted(row) && row.fastMode && row.fastMode.outcome === 'blocked')
    .slice(0, 4).map((row) => row.runId);
  assert.equal(blockedIds.length, 4);
  const autopilot = withRows(base, (runs) => {
    for (const row of runs) if (blockedIds.includes(row.runId)) row.fastMode = null;
  });
  const run = scenario({ autopilot });
  const { agreement } = buildTables(run.input, run.result);
  const cellOf = (outcome) => agreement.table.find((row) => row.outcome === outcome);
  assert.equal(agreement.falseDone, 3);
  assert.equal(cellOf('done').fail, 3);
  assert.equal(agreement.doneWithoutSuccessWord, 1);
  assert.equal(agreement.falseAmbiguous, 2);
  assert.deepEqual(cellOf('ambiguous'), { outcome: 'ambiguous', pass: 2, fail: 0 });
  assert.equal(agreement.noBlock, 4);
  assert.deepEqual(cellOf('no block'), { outcome: 'no block', pass: 0, fail: 4 });
  assert.deepEqual(agreement.table.map((row) => row.outcome), ['done', 'ambiguous', 'blocked', 'needs_confirmation', 'other', 'no block']);
  const on = autopilot.runs.filter((row) => row.condition === 'on' && counted(row));
  assert.equal(agreement.table.reduce((sum, row) => sum + row.pass + row.fail, 0), on.length);
  assert.equal(agreement.uncertainUnobserved, 0);
  assert.deepEqual(agreement.humanGate, {});
  const longOn = on.filter((row) => row.wallMs > 60000).length;
  assert.deepEqual(agreement.longRuns.autopilotOn, { over: longOn, counted: on.length });
  const report = reportOf(run);
  const section = report.slice(report.indexOf('\n## Typed outcome agreement'), report.indexOf('\n## MCP caller effect'));
  assert.ok(section.includes(`- False done (done on a failed run): 3. ${FALSE_DONE_SENTENCE}`));
  assert.match(section, /Done runs whose status word is not a success word: 1/);
  assert.match(section, /False ambiguous \(ambiguous on a passing run, F18 watch\): 2/);
  assert.match(section, /no fast_mode block \(F17 watch\): 4/);
  assert.match(section, /\| no block \| 0 \| 4 \|/);
  assert.match(section, /Runs over 60,000 ms wall time: /);
});

test('report: the MCP caller effect gives median host turns and FSB calls per completed run, pin against candidate', () => {
  const tables = buildTables(PASS_SCENARIO.input, PASS_SCENARIO.result);
  const { callerEffect } = tables;
  assert.equal(callerEffect.perTask.length, 12);
  const pinDone = groupRows({ baseline: PASS_SCENARIO.input.baseline.runs }, GATE).baselineClaude.filter((row) => counted(row) && row.pass);
  assert.deepEqual(callerEffect.pooled.pin, { completedRuns: pinDone.length, turnsMedian: 9, callsMedian: 7 });
  assert.equal(callerEffect.pooled.candidate.turnsMedian, 9);
  const report = reportOf(PASS_SCENARIO);
  const start = report.indexOf('\n## MCP caller effect (descriptive, 69 V4 rows)\n');
  const section = report.slice(start, report.indexOf('\n## Sentinel\n'));
  assert.ok(section.includes(CALLER_EFFECT_SENTENCE));
  assert.match(section, /\| pooled \| \d+ \| 9\.0 \| 7\.0 \| \d+ \| 9\.0 \| 7\.0 \|/);
  assert.ok(start < report.indexOf(`\n${DIAGNOSTICS_HEADING}\n`));
  for (const word of ['jevMs', 'latencyMs']) assert.equal(section.includes(word), false, word);
});

test('report and decision: a used fallback reads "mcp-non-jev: <verdict> (from core-rebaseline-71; primary was <verdict>)"', () => {
  const used = scenario({ ...SENTINEL_TRIP, fallback: FALLBACK });
  const { decision } = used;
  assert.equal(decision.paths['mcp-non-jev'].source, 'fallback');
  assert.equal(decision.fallback.status, 'used');
  assert.equal(decision.fallback.primaryVerdict, 'inconclusive');
  assert.deepEqual(decision.fallback.primaryReasons, ['sentinel_trip']);
  assert.equal(decision.fallback.campaigns.pin.id, REAL_GATE.fallback.campaigns.pin.id);
  assert.equal(decision.paths['mcp-non-jev'].v6Action, 'publish_mcp_0_12_0');
  const line = 'mcp-non-jev: pass (from core-rebaseline-71; primary was inconclusive)';
  assert.equal(describePath(decision, 'mcp-non-jev'), line);
  assert.deepEqual(validateDecision(decision).errors, []);
  const report = reportOf(used);
  assert.ok(report.includes(`- ${line} -> publish_mcp_0_12_0`), 'the report shows the replaced verdict');
  assert.match(report, /core-rebaseline-71 fallback \(core-rebaseline-71-pin against core-rebaseline-71-candidate\)/);
  assert.match(report, /Blocker: autopilot off-path regression or drift: investigate before V6/);

  const refused = scenario({ ...SENTINEL_TRIP, fallback: fallbackCampaigns({ pin: { campaignId: 'core-rebaseline-71-pinned' } }) });
  assert.equal(refused.decision.fallback.status, 'refused');
  assert.ok(refused.decision.fallback.reasons.every((reason) => reason.startsWith('fallback_campaign_mismatch:')));
  assert.equal(describePath(refused.decision, 'mcp-non-jev'), 'mcp-non-jev: inconclusive');
  assert.deepEqual(validateDecision(refused.decision).errors, []);
});
