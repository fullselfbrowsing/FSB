// Phase 71 power and coverage simulation (D-13, D-15, D-19; RESEARCH
// Pitfall 1 and Open Question 1): the seeded small version of the run that
// decides the round counts the gate freezes. The full run is the CLI, and its
// output is .planning/phases/71-comparative-gate-and-release/71-POWER.json.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ROUND_CANDIDATES,
  buildSafetyTable,
  buildTable,
  coverageBootstrap,
  coverageNewcombe,
  main,
  selectRounds,
  simulateCompletion,
  simulateSafety,
  simulateSpeedSentinel,
  spendFor,
  taskRates,
} from '../scripts/bench/gate/simulate-power.mjs';

// The snapshot run: buildTable over rounds [20, 30] (completion reps 400,
// speed reps 20, bootstrap iterations 200) and buildSafetyTable over rounds
// [20, 30] (safety reps 400), seed 71. Filled from the first GREEN run and
// frozen; a change here means the simulation changed.
const SNAPSHOT_SEED = 71;
const SNAPSHOT = Object.freeze({
  table: [
    { comparison: 'jev-ni', rounds: 20, p: 0.8, pass: 0.805 },
    { comparison: 'claude-ni', rounds: 20, p: 0.8, pass: 0.795 },
    { comparison: 'sentinel-equivalence', rounds: 20, p: 0.8, pass: 0.54 },
    { comparison: 'jev-ni', rounds: 20, p: 0.85, pass: 0.895 },
    { comparison: 'claude-ni', rounds: 20, p: 0.85, pass: 0.885 },
    { comparison: 'sentinel-equivalence', rounds: 20, p: 0.85, pass: 0.73 },
    { comparison: 'jev-ni', rounds: 20, p: 0.9, pass: 0.9275 },
    { comparison: 'claude-ni', rounds: 20, p: 0.9, pass: 0.945 },
    { comparison: 'sentinel-equivalence', rounds: 20, p: 0.9, pass: 0.935 },
    { comparison: 'jev-ni', rounds: 20, p: 0.95, pass: 0.9975 },
    { comparison: 'claude-ni', rounds: 20, p: 0.95, pass: 0.995 },
    { comparison: 'sentinel-equivalence', rounds: 20, p: 0.95, pass: 0.9975 },
    { comparison: 'sentinel-speed', rounds: 20, p: 0.8, pass: 1 },
    { comparison: 'jev-ni', rounds: 30, p: 0.8, pass: 0.9125 },
    { comparison: 'claude-ni', rounds: 30, p: 0.8, pass: 0.9375 },
    { comparison: 'sentinel-equivalence', rounds: 30, p: 0.8, pass: 0.8475 },
    { comparison: 'jev-ni', rounds: 30, p: 0.85, pass: 0.96 },
    { comparison: 'claude-ni', rounds: 30, p: 0.85, pass: 0.9775 },
    { comparison: 'sentinel-equivalence', rounds: 30, p: 0.85, pass: 0.9425 },
    { comparison: 'jev-ni', rounds: 30, p: 0.9, pass: 0.9925 },
    { comparison: 'claude-ni', rounds: 30, p: 0.9, pass: 0.9925 },
    { comparison: 'sentinel-equivalence', rounds: 30, p: 0.9, pass: 0.99 },
    { comparison: 'jev-ni', rounds: 30, p: 0.95, pass: 1 },
    { comparison: 'claude-ni', rounds: 30, p: 0.95, pass: 1 },
    { comparison: 'sentinel-equivalence', rounds: 30, p: 0.95, pass: 1 },
    { comparison: 'sentinel-speed', rounds: 30, p: 0.8, pass: 1 },
  ],
  safety: [
    { p: 0.005, actedShare: 0.5, unknownShare: 0, rounds: 20, ruleA: 0.425, ruleAExact: 0.452013714509958, ruleB: 0.355, jevSafety: 0.63, nonJev: 0.3525 },
    { p: 0.005, actedShare: 0.5, unknownShare: 0.1, rounds: 20, ruleA: 0.4575, ruleAExact: 0.48400361570628414, ruleB: 0.3825, jevSafety: 0.66, nonJev: 0.3725 },
    { p: 0.005, actedShare: 0.8, unknownShare: 0, rounds: 20, ruleA: 0.605, ruleAExact: 0.6180280223946972, ruleB: 0.1825, jevSafety: 0.6825, nonJev: 0.375 },
    { p: 0.005, actedShare: 0.8, unknownShare: 0.1, rounds: 20, ruleA: 0.6425, ruleAExact: 0.6274823051129316, ruleB: 0.2125, jevSafety: 0.7175, nonJev: 0.36 },
    { p: 0.005, actedShare: 1, unknownShare: 0, rounds: 20, ruleA: 0.725, ruleAExact: 0.699711030914826, ruleB: 0, jevSafety: 0.725, nonJev: 0.3475 },
    { p: 0.005, actedShare: 1, unknownShare: 0.1, rounds: 20, ruleA: 0.69, ruleAExact: 0.699711030914826, ruleB: 0, jevSafety: 0.69, nonJev: 0.3325 },
    { p: 0.01, actedShare: 0.5, unknownShare: 0, rounds: 20, ruleA: 0.7075, ruleAExact: 0.7006196086876688, ruleB: 0.4125, jevSafety: 0.8325, nonJev: 0.42 },
    { p: 0.01, actedShare: 0.5, unknownShare: 0.1, rounds: 20, ruleA: 0.7375, ruleAExact: 0.7346337502522947, ruleB: 0.4925, jevSafety: 0.8875, nonJev: 0.3775 },
    { p: 0.01, actedShare: 0.8, unknownShare: 0, rounds: 20, ruleA: 0.865, ruleAExact: 0.8548030937842173, ruleB: 0.355, jevSafety: 0.9, nonJev: 0.425 },
    { p: 0.01, actedShare: 0.8, unknownShare: 0.1, rounds: 20, ruleA: 0.865, ruleAExact: 0.8619191869125272, ruleB: 0.33, jevSafety: 0.905, nonJev: 0.3725 },
    { p: 0.01, actedShare: 1, unknownShare: 0, rounds: 20, ruleA: 0.9125, ruleAExact: 0.9103713812976753, ruleB: 0, jevSafety: 0.9125, nonJev: 0.395 },
    { p: 0.01, actedShare: 1, unknownShare: 0.1, rounds: 20, ruleA: 0.9025, ruleAExact: 0.9103713812976753, ruleB: 0, jevSafety: 0.9025, nonJev: 0.4075 },
    { p: 0.02, actedShare: 0.5, unknownShare: 0, rounds: 20, ruleA: 0.9, ruleAExact: 0.9114621272740426, ruleB: 0.5075, jevSafety: 0.9425, nonJev: 0.44 },
    { p: 0.02, actedShare: 0.5, unknownShare: 0.1, rounds: 20, ruleA: 0.9375, ruleAExact: 0.930522850588038, ruleB: 0.485, jevSafety: 0.965, nonJev: 0.4325 },
    { p: 0.02, actedShare: 0.8, unknownShare: 0, rounds: 20, ruleA: 0.9725, ruleAExact: 0.9793268558471807, ruleB: 0.44, jevSafety: 0.98, nonJev: 0.45 },
    { p: 0.02, actedShare: 0.8, unknownShare: 0.1, rounds: 20, ruleA: 0.9875, ruleAExact: 0.9813131150650223, ruleB: 0.4525, jevSafety: 0.9875, nonJev: 0.4375 },
    { p: 0.02, actedShare: 1, unknownShare: 0, rounds: 20, ruleA: 0.9875, ruleAExact: 0.9921610450931622, ruleB: 0, jevSafety: 0.9875, nonJev: 0.41 },
    { p: 0.02, actedShare: 1, unknownShare: 0.1, rounds: 20, ruleA: 0.99, ruleAExact: 0.9921610450931622, ruleB: 0, jevSafety: 0.99, nonJev: 0.4025 },
    { p: 0.05, actedShare: 0.5, unknownShare: 0, rounds: 20, ruleA: 0.9975, ruleAExact: 0.9978775736213018, ruleB: 0.5, jevSafety: 0.9975, nonJev: 0.48 },
    { p: 0.05, actedShare: 0.5, unknownShare: 0.1, rounds: 20, ruleA: 1, ruleAExact: 0.9988531254959492, ruleB: 0.485, jevSafety: 1, nonJev: 0.4525 },
    { p: 0.05, actedShare: 0.8, unknownShare: 0, rounds: 20, ruleA: 1, ruleAExact: 0.9999471637221351, ruleB: 0.485, jevSafety: 1, nonJev: 0.45 },
    { p: 0.05, actedShare: 0.8, unknownShare: 0.1, rounds: 20, ruleA: 1, ruleAExact: 0.9999591162953797, ruleB: 0.4725, jevSafety: 1, nonJev: 0.475 },
    { p: 0.05, actedShare: 1, unknownShare: 0, rounds: 20, ruleA: 1, ruleAExact: 0.999995495306267, ruleB: 0, jevSafety: 1, nonJev: 0.425 },
    { p: 0.05, actedShare: 1, unknownShare: 0.1, rounds: 20, ruleA: 1, ruleAExact: 0.999995495306267, ruleB: 0, jevSafety: 1, nonJev: 0.45 },
    { p: 0.1, actedShare: 0.5, unknownShare: 0, rounds: 20, ruleA: 1, ruleAExact: 0.999996770753982, ruleB: 0.47, jevSafety: 1, nonJev: 0.5 },
    { p: 0.1, actedShare: 0.5, unknownShare: 0.1, rounds: 20, ruleA: 1, ruleAExact: 0.9999990879655439, ruleB: 0.4975, jevSafety: 1, nonJev: 0.5225 },
    { p: 0.1, actedShare: 0.8, unknownShare: 0, rounds: 20, ruleA: 1, ruleAExact: 0.9999999983610647, ruleB: 0.4825, jevSafety: 1, nonJev: 0.4575 },
    { p: 0.1, actedShare: 0.8, unknownShare: 0.1, rounds: 20, ruleA: 1, ruleAExact: 0.9999999990322251, ruleB: 0.4325, jevSafety: 1, nonJev: 0.4925 },
    { p: 0.1, actedShare: 1, unknownShare: 0, rounds: 20, ruleA: 1, ruleAExact: 0.999999999989572, ruleB: 0, jevSafety: 1, nonJev: 0.485 },
    { p: 0.1, actedShare: 1, unknownShare: 0.1, rounds: 20, ruleA: 1, ruleAExact: 0.999999999989572, ruleB: 0, jevSafety: 1, nonJev: 0.485 },
    { p: 0.005, actedShare: 0.5, unknownShare: 0, rounds: 30, ruleA: 0.605, ruleAExact: 0.5943471474984818, ruleB: 0.44, jevSafety: 0.775, nonJev: 0.375 },
    { p: 0.005, actedShare: 0.5, unknownShare: 0.1, rounds: 30, ruleA: 0.645, ruleAExact: 0.6293448935873669, ruleB: 0.4575, jevSafety: 0.8075, nonJev: 0.3725 },
    { p: 0.005, actedShare: 0.8, unknownShare: 0, rounds: 30, ruleA: 0.765, ruleAExact: 0.7639264913631594, ruleB: 0.305, jevSafety: 0.83, nonJev: 0.39 },
    { p: 0.005, actedShare: 0.8, unknownShare: 0.1, rounds: 30, ruleA: 0.775, ruleAExact: 0.7720661532463733, ruleB: 0.2425, jevSafety: 0.8225, nonJev: 0.37 },
    { p: 0.005, actedShare: 1, unknownShare: 0, rounds: 30, ruleA: 0.8175, ruleAExact: 0.8354457632573815, ruleB: 0, jevSafety: 0.8175, nonJev: 0.39 },
    { p: 0.005, actedShare: 1, unknownShare: 0.1, rounds: 30, ruleA: 0.8275, ruleAExact: 0.8354457632573815, ruleB: 0, jevSafety: 0.8275, nonJev: 0.415 },
    { p: 0.01, actedShare: 0.5, unknownShare: 0, rounds: 30, ruleA: 0.8375, ruleAExact: 0.8361920302919126, ruleB: 0.51, jevSafety: 0.9025, nonJev: 0.4475 },
    { p: 0.01, actedShare: 0.5, unknownShare: 0.1, rounds: 30, ruleA: 0.8525, ruleAExact: 0.8632999950434019, ruleB: 0.4975, jevSafety: 0.9025, nonJev: 0.44 },
    { p: 0.01, actedShare: 0.8, unknownShare: 0, rounds: 30, ruleA: 0.9525, ruleAExact: 0.9446731373287794, ruleB: 0.4275, jevSafety: 0.9725, nonJev: 0.4025 },
    { p: 0.01, actedShare: 0.8, unknownShare: 0.1, rounds: 30, ruleA: 0.95, ruleAExact: 0.9484317484957465, ruleB: 0.415, jevSafety: 0.9575, nonJev: 0.425 },
    { p: 0.01, actedShare: 1, unknownShare: 0, rounds: 30, ruleA: 0.98, ruleAExact: 0.9731669490601144, ruleB: 0, jevSafety: 0.98, nonJev: 0.4275 },
    { p: 0.01, actedShare: 1, unknownShare: 0.1, rounds: 30, ruleA: 0.9725, ruleAExact: 0.9731669490601144, ruleB: 0, jevSafety: 0.9725, nonJev: 0.455 },
    { p: 0.02, actedShare: 0.5, unknownShare: 0, rounds: 30, ruleA: 0.9675, ruleAExact: 0.9736552777231164, ruleB: 0.465, jevSafety: 0.9825, nonJev: 0.415 },
    { p: 0.02, actedShare: 0.5, unknownShare: 0.1, rounds: 30, ruleA: 0.975, ruleAExact: 0.9816868527637219, ruleB: 0.465, jevSafety: 0.99, nonJev: 0.43 },
    { p: 0.02, actedShare: 0.8, unknownShare: 0, rounds: 30, ruleA: 0.9925, ruleAExact: 0.9970275825690957, ruleB: 0.4775, jevSafety: 0.9925, nonJev: 0.455 },
    { p: 0.02, actedShare: 0.8, unknownShare: 0.1, rounds: 30, ruleA: 0.995, ruleAExact: 0.9974195685327644, ruleB: 0.4475, jevSafety: 1, nonJev: 0.455 },
    { p: 0.02, actedShare: 1, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 0.9993059556081538, ruleB: 0, jevSafety: 1, nonJev: 0.4525 },
    { p: 0.02, actedShare: 1, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 0.9993059556081538, ruleB: 0, jevSafety: 1, nonJev: 0.4525 },
    { p: 0.05, actedShare: 0.5, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 0.9999022202433687, ruleB: 0.4725, jevSafety: 1, nonJev: 0.4375 },
    { p: 0.05, actedShare: 0.5, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 0.9999611604806107, ruleB: 0.51, jevSafety: 1, nonJev: 0.46 },
    { p: 0.05, actedShare: 0.8, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 0.9999996159406671, ruleB: 0.46, jevSafety: 1, nonJev: 0.4725 },
    { p: 0.05, actedShare: 0.8, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 0.9999997317970439, ruleB: 0.48, jevSafety: 1, nonJev: 0.4875 },
    { p: 0.05, actedShare: 1, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 0.9999999904391192, ruleB: 0, jevSafety: 1, nonJev: 0.435 },
    { p: 0.05, actedShare: 1, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 0.9999999904391192, ruleB: 0, jevSafety: 1, nonJev: 0.505 },
    { p: 0.1, actedShare: 0.5, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 0.9999999941970117, ruleB: 0.47, jevSafety: 1, nonJev: 0.435 },
    { p: 0.1, actedShare: 0.5, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 0.9999999991290026, ruleB: 0.4575, jevSafety: 1, nonJev: 0.5025 },
    { p: 0.1, actedShare: 0.8, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 0.9999999999999336, ruleB: 0.4425, jevSafety: 1, nonJev: 0.47 },
    { p: 0.1, actedShare: 0.8, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 0.9999999999999682, ruleB: 0.4725, jevSafety: 1, nonJev: 0.4825 },
    { p: 0.1, actedShare: 1, unknownShare: 0, rounds: 30, ruleA: 1, ruleAExact: 1, ruleB: 0, jevSafety: 1, nonJev: 0.465 },
    { p: 0.1, actedShare: 1, unknownShare: 0.1, rounds: 30, ruleA: 1, ruleAExact: 1, ruleB: 0, jevSafety: 1, nonJev: 0.49 },
  ],
  recommended: { rounds: 30, met: true },
});

function snapshotRun() {
  const table = buildTable({ rounds: [20, 30], reps: 400, speedReps: 20, iterations: 200, seed: SNAPSHOT_SEED });
  const safety = buildSafetyTable({ rounds: [20, 30], reps: 400, seed: SNAPSHOT_SEED });
  return { table, safety, recommended: selectRounds(table) };
}

const started = process.hrtime.bigint();
const RUN = snapshotRun();
const SNAPSHOT_SECONDS = Number(process.hrtime.bigint() - started) / 1e9;

const cell = (table, comparison, rounds, p) => table.find((row) => row.comparison === comparison && row.rounds === rounds && row.p === p);

test('taskRates: 12 evenly spaced rates with mean p, kept inside [0.01, 0.99]', () => {
  for (const [p, spread] of [[0.8, 0.1], [0.85, 0.1], [0.95, 0.1], [0.5, 0], [0.02, 0.1]]) {
    const rates = taskRates(p, spread);
    assert.equal(rates.length, 12);
    const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
    assert.ok(Math.abs(mean - p) < 1e-12, `mean ${mean} for p ${p}`);
    assert.ok(rates.every((r) => r >= 0.01 - 1e-12 && r <= 0.99 + 1e-12), `bounds for p ${p}`);
    const steps = rates.slice(1).map((r, i) => r - rates[i]);
    assert.ok(steps.every((step) => Math.abs(step - steps[0]) < 1e-12), 'evenly spaced');
  }
  assert.deepEqual(taskRates(0.8, 0), Array(12).fill(0.8));
  const wide = taskRates(0.8, 0.1);
  assert.ok(Math.abs(wide[0] - 0.7) < 1e-12 && Math.abs(wide[11] - 0.9) < 1e-12);
});

test('simulateCompletion: seeded, more rounds give more power, equivalence is stricter, the margin holds alpha', () => {
  const args = { kind: 'noninferiority', p: 0.85, spread: 0.1, roundsA: 20, roundsB: 20, reps: 300, seed: 5 };
  const first = simulateCompletion(args);
  assert.equal(simulateCompletion(args), first, 'same seed, same pass rate');
  assert.ok(first >= 0 && first <= 1);
  const more = simulateCompletion({ ...args, roundsA: 40, roundsB: 40 });
  assert.ok(more > first, `40 rounds ${more} vs 20 rounds ${first}`);
  const equivalence = simulateCompletion({ ...args, kind: 'equivalence' });
  assert.ok(equivalence <= first, 'equivalence needs both bounds inside the margin');
  const atMargin = simulateCompletion({ ...args, delta: -0.1, reps: 2000, roundsA: 30, roundsB: 30 });
  assert.ok(atMargin < 0.05, `false pass rate at a true difference of -10 points: ${atMargin}`);
  assert.throws(() => simulateCompletion({ ...args, kind: 'superiority' }), /kind/);
});

test('coverage: the Newcombe interval and the hierarchical bootstrap cover the truth near or above 95%', () => {
  const newcombe = coverageNewcombe({ p: 0.85, delta: 0, rounds: 30, reps: 600, seed: 9 });
  assert.ok(newcombe >= 0.92 && newcombe <= 1, `newcombe ${newcombe}`);
  const shifted = coverageNewcombe({ p: 0.85, delta: -0.1, rounds: 30, reps: 600, seed: 9 });
  assert.ok(shifted >= 0.92 && shifted <= 1, `newcombe at -10 points ${shifted}`);
  const bootstrap = coverageBootstrap({ effect: 0.7, rounds: 20, sigma: 0.3, reps: 20, iterations: 200, seed: 9 });
  assert.ok(bootstrap >= 0.85 && bootstrap <= 1, `bootstrap ${bootstrap}`);
  assert.equal(coverageBootstrap({ effect: 0.7, rounds: 20, sigma: 0.3, reps: 20, iterations: 200, seed: 9 }), bootstrap);
  const sentinel = simulateSpeedSentinel({ rounds: 20, sigma: 0.3, band: [0.8, 1.25], reps: 20, iterations: 200, seed: 9 });
  assert.ok(sentinel >= 0.8, `no-drift speed band pass ${sentinel}`);
  const narrow = simulateSpeedSentinel({ rounds: 20, sigma: 0.3, band: [0.99, 1.01], reps: 20, iterations: 200, seed: 9 });
  assert.ok(narrow < sentinel, 'a narrow band trips on noise');
});

test('simulateSafety: D-15 as locked, measured with no true difference', () => {
  const base = { p: 0.01, actedShare: 0.5, rounds: 20, reps: 400, seed: 3 };
  const result = simulateSafety(base);
  assert.deepEqual(Object.keys(result), ['ruleA', 'ruleAExact', 'ruleB', 'jevSafety', 'nonJev']);
  assert.deepEqual(simulateSafety(base), result);
  assert.ok(Math.abs(result.ruleAExact - (1 - 0.99 ** 120)) < 1e-12);
  assert.ok(result.jevSafety >= Math.max(result.ruleA, result.ruleB) && result.jevSafety <= result.ruleA + result.ruleB + 1e-12);
  const none = simulateSafety({ ...base, p: 0 });
  assert.deepEqual(none, { ruleA: 0, ruleAExact: 0, ruleB: 0, jevSafety: 0, nonJev: 0 });
  const every = simulateSafety({ ...base, p: 1 });
  assert.equal(every.ruleA, 1);
  assert.equal(every.ruleB, 0, 'equal rates are no excess');
  assert.equal(every.nonJev, 0);
  // An unknown-exposure run counts as acted for rule (a) and never as non-acted for rule (b).
  const unknownOnly = simulateSafety({ ...base, p: 0.05, actedShare: 0, unknownShare: 1 });
  assert.equal(unknownOnly.ruleB, 0, 'no non-acted runs means no excess');
  assert.ok(Math.abs(unknownOnly.ruleAExact - (1 - 0.95 ** 240)) < 1e-12);
  assert.ok(unknownOnly.ruleA > 0.99);
  const noneActed = simulateSafety({ ...base, p: 0.05, actedShare: 0, unknownShare: 0 });
  assert.equal(noneActed.ruleA, 0);
  assert.equal(noneActed.ruleAExact, 0);
  assert.ok(noneActed.ruleB > 0.3 && noneActed.ruleB < 0.6, `any-excess rule (b) ${noneActed.ruleB}`);
  assert.ok(result.nonJev > 0.3 && result.nonJev < 0.6, `non-Jev any-excess ${result.nonJev}`);
});

test('the snapshot run is deterministic and equals the pinned numbers', () => {
  assert.deepEqual(RUN, SNAPSHOT);
  assert.deepEqual(snapshotRun(), RUN, 'a second run gives deep-equal output');
});

test('the snapshot table covers the three completion comparisons and the speed sentinel at the floor', () => {
  const { table } = RUN;
  for (const row of table) {
    assert.deepEqual(Object.keys(row), ['comparison', 'rounds', 'p', 'pass']);
    assert.ok(row.pass >= 0 && row.pass <= 1);
  }
  for (const rounds of [20, 30]) {
    for (const p of [0.8, 0.85, 0.9, 0.95]) {
      for (const comparison of ['jev-ni', 'claude-ni', 'sentinel-equivalence']) assert.ok(cell(table, comparison, rounds, p), `${comparison} ${rounds} ${p}`);
    }
    assert.ok(cell(table, 'sentinel-speed', rounds, 0.8), `sentinel-speed ${rounds}`);
    assert.equal(table.filter((row) => row.comparison === 'sentinel-speed' && row.rounds === rounds).length, 1, 'speed at the floor only');
  }
  assert.ok(cell(table, 'jev-ni', 30, 0.85).pass > cell(table, 'jev-ni', 20, 0.85).pass, 'NI power at p 0.85 rises from 20 to 30 rounds');
  assert.ok(cell(table, 'claude-ni', 30, 0.85).pass > cell(table, 'claude-ni', 20, 0.85).pass);
  assert.ok(SNAPSHOT_SECONDS < 30, `snapshot run took ${SNAPSHOT_SECONDS} s`);
});

test('the snapshot safety table: every cell, rule (a) rises with rounds and p, and matches its exact form', () => {
  const { safety } = RUN;
  assert.equal(safety.length, 60);
  for (const row of safety) {
    assert.deepEqual(Object.keys(row), ['p', 'actedShare', 'unknownShare', 'rounds', 'ruleA', 'ruleAExact', 'ruleB', 'jevSafety', 'nonJev']);
    for (const key of ['ruleA', 'ruleAExact', 'ruleB', 'jevSafety', 'nonJev']) assert.ok(row[key] >= 0 && row[key] <= 1, key);
    assert.ok(Math.abs(row.ruleA - row.ruleAExact) < 0.06, `ruleA ${row.ruleA} vs exact ${row.ruleAExact} at ${JSON.stringify(row)}`);
  }
  const at = (p, actedShare, unknownShare, rounds) => safety.find((row) => row.p === p && row.actedShare === actedShare
    && row.unknownShare === unknownShare && row.rounds === rounds);
  const ps = [0.005, 0.01, 0.02, 0.05, 0.1];
  for (const unknownShare of [0, 0.1]) {
    for (const p of ps) assert.ok(at(p, 0.5, unknownShare, 30).ruleA >= at(p, 0.5, unknownShare, 20).ruleA, `rounds ${p}`);
    for (const rounds of [20, 30]) {
      ps.slice(1).forEach((p, i) => assert.ok(at(p, 0.5, unknownShare, rounds).ruleA >= at(ps[i], 0.5, unknownShare, rounds).ruleA, `p ${p}`));
    }
  }
  assert.ok(at(0.005, 0.5, 0, 30).ruleA > at(0.005, 0.5, 0, 20).ruleA);
  assert.ok(at(0.01, 0.5, 0, 30).ruleAExact > 0.8, 'p 1%, half acted, 30 rounds: rule (a) fails more than 80% of the time');
  for (const p of ps) {
    for (const rounds of [20, 30]) {
      assert.ok(at(p, 0.5, 0.1, rounds).ruleAExact > at(p, 0.5, 0, rounds).ruleAExact);
      assert.ok(at(p, 0.8, 0.1, rounds).ruleAExact > at(p, 0.8, 0, rounds).ruleAExact);
      assert.equal(at(p, 1, 0.1, rounds).ruleAExact, at(p, 1, 0, rounds).ruleAExact);
    }
  }
});

test('selectRounds: the smallest common candidate meeting every criterion at the floor, else 60 with a shortfall', () => {
  assert.deepEqual([...ROUND_CANDIDATES], [20, 24, 25, 30, 35, 40, 50, 60]);
  const synthetic = (passFor) => ROUND_CANDIDATES.flatMap((rounds) => [
    ...['jev-ni', 'claude-ni', 'sentinel-equivalence'].map((comparison) => ({ comparison, rounds, p: 0.8, pass: passFor(comparison, rounds) })),
    { comparison: 'sentinel-speed', rounds, p: 0.8, pass: 1 },
  ]);
  assert.deepEqual(selectRounds(synthetic((c, r) => (c === 'sentinel-equivalence' ? (r >= 35 ? 0.85 : 0.7) : 0.9))), { rounds: 35, met: true });
  assert.deepEqual(selectRounds(synthetic(() => 0.95)), { rounds: 20, met: true }, 'never below the D-04 minimums');
  const notMet = selectRounds(synthetic((c) => (c === 'claude-ni' ? 0.5 : 0.95)));
  assert.equal(notMet.rounds, 60);
  assert.equal(notMet.met, false);
  assert.deepEqual(notMet.shortfall, [{ comparison: 'claude-ni', rounds: 60, p: 0.8, pass: 0.5, required: 0.8 }]);
  const tooFewRounds = synthetic(() => 0.95).map((row) => ({ ...row, rounds: row.rounds - 15 }));
  // Shifted rows exist at 5, 9, 10, 15, 20, 25, 35 and 45 rounds. A minimum of 21 skips 20, and 24 has no row.
  assert.deepEqual(selectRounds(tooFewRounds, { minimums: { autopilot: 21, claude: 10, baseline: 10 } }), { rounds: 25, met: true },
    'candidates below the largest minimum, and candidates with no table rows, are skipped');
  assert.deepEqual(RUN.recommended, SNAPSHOT.recommended);
});

test('spendFor: V1 and V4 run counts at R rounds against the defaults', () => {
  assert.deepEqual(spendFor(30), {
    roundsPerArm: 30, v1CoreRuns: 720, v4AutopilotRuns: 720, v4ClaudeRuns: 360, defaultRuns: { v1: 240, v4Autopilot: 480, v4Claude: 120 },
  });
});

function io() {
  const out = { stdout: '', stderr: '', files: {} };
  return {
    out,
    overrides: {
      stdout: (text) => { out.stdout += text; },
      stderr: (text) => { out.stderr += text; },
      writeFile: (file, text) => { out.files[file] = text; },
    },
  };
}

test('CLI: unknown flags and bad values exit 2; a tiny run writes the full output shape', () => {
  for (const argv of [['--bogus'], ['--reps'], ['--reps', '0'], ['--seed', 'x'], ['--iterations', '1.5'], ['extra']]) {
    const { out, overrides } = io();
    assert.equal(main(argv, overrides), 2, argv.join(' '));
    assert.match(out.stderr, /usage/);
  }
  const { out, overrides } = io();
  const code = main(['--reps', '40', '--speed-reps', '2', '--safety-reps', '40', '--iterations', '40', '--seed', '5', '--out', 'power.json'], overrides);
  assert.equal(code, 0, out.stderr);
  const files = Object.keys(out.files);
  assert.equal(files.length, 1);
  assert.ok(files[0].endsWith('power.json'));
  const text = out.files[files[0]];
  assert.ok(text.endsWith('}\n'));
  assert.equal(text.includes('://'), false);
  const result = JSON.parse(text);
  assert.deepEqual(Object.keys(result), ['schemaVersion', 'seed', 'reps', 'speedReps', 'safetyReps', 'iterations', 'assumptions', 'table',
    'coverage', 'recommendedRounds', 'spend', 'safetyFalseFail']);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual([result.seed, result.reps, result.speedReps, result.safetyReps, result.iterations], [5, 40, 2, 40, 40]);
  const R = result.recommendedRounds.rounds;
  assert.ok(Number.isInteger(R) && R >= 20);
  assert.deepEqual(result.spend, spendFor(R));
  assert.equal(result.table.length, ROUND_CANDIDATES.length * 13);
  assert.equal(result.safetyFalseFail.model, 'no true difference; one Bernoulli(p) event per counted run');
  assert.equal(result.safetyFalseFail.rows.length, 30 * new Set([20, R]).size);
  assert.ok(result.coverage.newcombe.length > 0 && result.coverage.bootstrap.length > 0);
  assert.ok(result.coverage.newcombe.every((row) => row.rounds === R));
  assert.match(out.stdout, new RegExp(`recommended rounds ${R}`));
  assert.match(out.stdout, /spend/);
  const again = io();
  assert.equal(main(['--reps', '40', '--speed-reps', '2', '--safety-reps', '40', '--iterations', '40', '--seed', '5'], again.overrides), 0);
  assert.deepEqual(JSON.parse(again.out.stdout), result, 'without --out the JSON goes to stdout, and the same seed gives the same output');
});

test('source hygiene: no Math.random and no clock reads in the simulation', () => {
  const source = readFileSync(new URL('../scripts/bench/gate/simulate-power.mjs', import.meta.url), 'utf8');
  assert.equal(/Math\.random|Date\.now/.test(source), false);
  assert.match(source, /newcombeDifference/);
  assert.match(source, /geoMeanMedianRatio/);
  assert.match(source, /mulberry32/);
});
