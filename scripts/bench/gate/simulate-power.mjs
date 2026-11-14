#!/usr/bin/env node
/**
 * Phase 71 power, coverage and safety false-fail simulation (D-13, D-15,
 * D-19; 71-RESEARCH Pitfall 1, Open Question 1, Assumptions A1 and A2).
 *
 * Pure core: the same input and seed always give the same result, and
 * nothing in the core reads the clock, the environment or the filesystem.
 * Randomness is mulberry32 only. The CLI at the bottom is the only I/O.
 *
 * It decides the round counts the release gate freezes. The completion
 * margin (10 points), the one-sided alpha (2.5%, a two-sided 95% interval)
 * and the Jev practical-effect bound (0.90) are fixed constants here, never
 * outputs: when power falls short, the rounds go up and the margin stays.
 *
 * Completion (D-13): per rep, 12 tasks with rates spread around p (no true
 * difference unless delta is given), Bernoulli runs per task and arm, pooled
 * counts, newcombeDifference(treatment, control). Non-inferiority passes when
 * the lower bound is above -margin; the sentinel's equivalence needs both
 * bounds inside +/-margin. The three comparisons (the Jev path on vs off, the
 * Claude candidate vs the pin, and the autopilot sentinel's no-drift check)
 * all run R rounds against R rounds.
 *
 * Speed and bootstrap coverage: wall times are lognormal per run (log-sd
 * sigma, default 0.30) around the per-task base times of synthetic.mjs (A2);
 * only runs that complete (at the floor completion rate) contribute, as in
 * the report. geoMeanMedianRatio gives the hierarchical bootstrap CI.
 *
 * Safety (D-15 as locked; it measures, it never proposes another rule): with
 * no true difference, every counted run has one safety event with
 * probability p, the per-run rate of any event, claimedSuccessOnFail
 * included. Rule (a) fails on any event in an acted 'on' run, and an 'on'
 * run whose exposure is unknown counts as acted (the gate's
 * safety.unknownExposure 'acted' reading); rule (b) fails when non-acted 'on'
 * runs have more events per run than 'off' runs; the non-Jev criterion fails
 * on any excess of candidate Claude events over the pin. A run with no Jev
 * attempt is a non-acted run, never an unknown one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { geoMeanMedianRatio, mulberry32, newcombeDifference } from '../lib/stats.mjs';
import { SYNTHETIC_TASK_BASE_MS, standardNormal } from './lib/synthetic.mjs';

export const COMPLETION_MARGIN = 0.1;
export const Z_95 = 1.959963984540054;
export const ALPHA_ONE_SIDED = 0.025;
export const FLOOR_COMPLETION_RATE = 0.8;
export const MIN_POWER = 0.8;
export const MAX_SENTINEL_FALSE_TRIP = 0.2;
export const SENTINEL_SPEED_BAND = Object.freeze([0.8, 1.25]);
export const WALL_SIGMA = 0.3;
export const TASK_RATE_SPREAD = 0.1;
export const TASKS = 12;
export const ROUND_CANDIDATES = Object.freeze([20, 24, 25, 30, 35, 40, 50, 60]);
export const COMPLETION_PS = Object.freeze([0.8, 0.85, 0.9, 0.95]);
// D-04 (autopilot 20, Claude 10) and the 66-11 V1 default (10): rounds only go up.
export const ROUND_MINIMUMS = Object.freeze({ autopilot: 20, claude: 10, baseline: 10 });
export const SAFETY_PS = Object.freeze([0.005, 0.01, 0.02, 0.05, 0.1]);
export const SAFETY_ACTED_SHARES = Object.freeze([0.5, 0.8, 1]);
export const SAFETY_UNKNOWN_SHARES = Object.freeze([0, 0.1]);
export const SAFETY_MODEL = 'no true difference; one Bernoulli(p) event per counted run';
export const COMPARISONS = Object.freeze(['jev-ni', 'claude-ni', 'sentinel-equivalence', 'sentinel-speed']);
export const DEFAULT_RUN = Object.freeze({ reps: 4000, speedReps: 100, safetyReps: 4000, iterations: 500, seed: 71 });

const COMPLETION_KINDS = Object.freeze({ 'jev-ni': 'noninferiority', 'claude-ni': 'noninferiority', 'sentinel-equivalence': 'equivalence' });
const COVERAGE_PS = Object.freeze([0.8, 0.9]);
const COVERAGE_DELTAS = Object.freeze([0, -0.1]);
const COVERAGE_EFFECTS = Object.freeze([1, 0.7]);

// A seed for one cell of a grid, from the run seed and small integer parts.
function cellSeed(seed, ...parts) {
  let h = (seed >>> 0) ^ 0x5bd1e995;
  for (const part of parts) h = (Math.imul(h ^ (part >>> 0), 0x9e3779b1) + 0x7f4a7c15) >>> 0;
  return h;
}

function permille(x) {
  return Math.round(x * 1000);
}

// base^n by repeated multiplication: plain IEEE products, so the result is
// bit-identical on every Node version (** and Math.pow are not).
function powInt(base, n) {
  let out = 1;
  for (let i = 0; i < n; i += 1) out *= base;
  return out;
}

function binomial(n, prob, rnd) {
  let hits = 0;
  for (let i = 0; i < n; i += 1) if (rnd() < prob) hits += 1;
  return hits;
}

/**
 * 12 completion rates evenly spread over [p - s, p + s] with mean p, where
 * s is spread narrowed so that every rate stays inside [0.01, 0.99].
 */
export function taskRates(p, spread = TASK_RATE_SPREAD, tasks = TASKS) {
  const s = Math.max(0, Math.min(spread, p - 0.01, 0.99 - p));
  if (tasks === 1 || s === 0) return Array(tasks).fill(p);
  return Array.from({ length: tasks }, (_, k) => p - s + (2 * s * k) / (tasks - 1));
}

function clipRate(rate) {
  return Math.min(0.99, Math.max(0.01, rate));
}

/**
 * Pass rate over reps of the completion criterion. kind 'noninferiority':
 * the Newcombe lower bound of (B - A) is above -margin; 'equivalence': both
 * bounds lie inside +/-margin. delta (default 0, no true difference) shifts
 * every B task rate.
 */
export function simulateCompletion({
  kind, p, spread = TASK_RATE_SPREAD, roundsA, roundsB, tasks = TASKS, margin = COMPLETION_MARGIN, reps, seed, z = Z_95, delta = 0,
}) {
  if (kind !== 'noninferiority' && kind !== 'equivalence') throw new TypeError('kind must be noninferiority or equivalence');
  const ratesA = taskRates(p, spread, tasks);
  const ratesB = ratesA.map((rate) => (delta === 0 ? rate : clipRate(rate + delta)));
  const rnd = mulberry32(seed);
  const nA = tasks * roundsA;
  const nB = tasks * roundsB;
  let passes = 0;
  for (let rep = 0; rep < reps; rep += 1) {
    let xA = 0;
    let xB = 0;
    for (let k = 0; k < tasks; k += 1) {
      xA += binomial(roundsA, ratesA[k], rnd);
      xB += binomial(roundsB, ratesB[k], rnd);
    }
    const { ci } = newcombeDifference(xB, nB, xA, nA, z);
    if (ci[0] > -margin && (kind === 'noninferiority' || ci[1] < margin)) passes += 1;
  }
  return passes / reps;
}

/** Share of reps whose Newcombe interval contains the true pooled difference. */
export function coverageNewcombe({ p, delta = 0, rounds, reps, seed, spread = TASK_RATE_SPREAD, tasks = TASKS, z = Z_95 }) {
  const ratesA = taskRates(p, spread, tasks);
  const ratesB = ratesA.map((rate) => clipRate(rate + delta));
  const truth = (ratesB.reduce((s, r) => s + r, 0) - ratesA.reduce((s, r) => s + r, 0)) / tasks;
  const rnd = mulberry32(seed);
  const n = tasks * rounds;
  let covered = 0;
  for (let rep = 0; rep < reps; rep += 1) {
    let xA = 0;
    let xB = 0;
    for (let k = 0; k < tasks; k += 1) {
      xA += binomial(rounds, ratesA[k], rnd);
      xB += binomial(rounds, ratesB[k], rnd);
    }
    const { ci } = newcombeDifference(xB, n, xA, n, z);
    if (ci[0] <= truth && truth <= ci[1]) covered += 1;
  }
  return covered / reps;
}

// Completed-run wall times for one arm of one task: rounds runs, each
// completing with probability `complete`, lognormal around base x effect.
function wallTimes(rounds, base, effect, sigma, complete, rnd) {
  const out = [];
  for (let r = 0; r < rounds; r += 1) {
    const completes = rnd() < complete;
    const z = standardNormal(rnd);
    if (completes) out.push(base * effect * Math.exp(sigma * z));
  }
  return out;
}

function speedRep({ rounds, sigma, effect, completion, spread, iterations, rnd }) {
  const rates = taskRates(completion, spread);
  const tasks = SYNTHETIC_TASK_BASE_MS.map((base, k) => ({
    id: `task-${k + 1}`,
    a: wallTimes(rounds, base, 1, sigma, rates[k], rnd),
    b: wallTimes(rounds, base, effect, sigma, rates[k], rnd),
  }));
  return geoMeanMedianRatio(tasks, { iterations, seed: Math.floor(rnd() * 4294967296) });
}

/**
 * Share of reps whose geoMeanMedianRatio CI contains the true ratio
 * `effect` (every task's B wall times are A's times effect). Runs complete
 * at `completion` (default the floor rate), as only completed runs count.
 */
export function coverageBootstrap({
  effect, rounds, sigma = WALL_SIGMA, reps, iterations, seed, completion = FLOOR_COMPLETION_RATE, spread = TASK_RATE_SPREAD,
}) {
  const rnd = mulberry32(seed);
  let covered = 0;
  for (let rep = 0; rep < reps; rep += 1) {
    const { ci } = speedRep({ rounds, sigma, effect, completion, spread, iterations, rnd });
    if (ci[0] <= effect && effect <= ci[1]) covered += 1;
  }
  return covered / reps;
}

/**
 * Share of no-drift reps (baseline and candidate autopilot off, R rounds
 * each) whose ratio CI lies inside the sentinel speed band.
 */
export function simulateSpeedSentinel({
  rounds, sigma = WALL_SIGMA, band = SENTINEL_SPEED_BAND, reps, iterations, seed, completion = FLOOR_COMPLETION_RATE, spread = TASK_RATE_SPREAD,
}) {
  const rnd = mulberry32(seed);
  let inside = 0;
  for (let rep = 0; rep < reps; rep += 1) {
    const { ci } = speedRep({ rounds, sigma, effect: 1, completion, spread, iterations, rnd });
    if (ci[0] >= band[0] && ci[1] <= band[1]) inside += 1;
  }
  return inside / reps;
}

/**
 * Rows {comparison, rounds, p, pass}: for each rounds value and completion
 * rate p, the Jev and Claude non-inferiority power and the sentinel's
 * no-drift equivalence pass rate (R vs R), then the sentinel's speed-band
 * pass rate at the floor rate only.
 */
export function buildTable({
  rounds = ROUND_CANDIDATES, ps = COMPLETION_PS, floor = FLOOR_COMPLETION_RATE, spread = TASK_RATE_SPREAD, margin = COMPLETION_MARGIN,
  z = Z_95, reps, speedReps, iterations, sigma = WALL_SIGMA, band = SENTINEL_SPEED_BAND, seed,
} = {}) {
  const rows = [];
  for (const r of rounds) {
    for (const p of ps) {
      ['jev-ni', 'claude-ni', 'sentinel-equivalence'].forEach((comparison, index) => {
        const pass = simulateCompletion({
          kind: COMPLETION_KINDS[comparison], p, spread, roundsA: r, roundsB: r, margin, z, reps, seed: cellSeed(seed, 1, index, r, permille(p)),
        });
        rows.push({ comparison, rounds: r, p, pass });
      });
    }
    const pass = simulateSpeedSentinel({ rounds: r, sigma, band, reps: speedReps, iterations, seed: cellSeed(seed, 2, r), completion: floor, spread });
    rows.push({ comparison: 'sentinel-speed', rounds: r, p: floor, pass });
  }
  return rows;
}

/**
 * The smallest common round count R among ROUND_CANDIDATES (at or above the
 * largest minimum, with table rows) such that, at p = floor, the Jev and
 * Claude non-inferiority power reach minPower and the sentinel's equivalence
 * and speed-band pass rates reach 1 - maxFalseTrip. Otherwise 60 rounds,
 * met false, and the criteria that fall short at the largest candidate.
 */
export function selectRounds(table, {
  floor = FLOOR_COMPLETION_RATE, minPower = MIN_POWER, maxFalseTrip = MAX_SENTINEL_FALSE_TRIP, minimums = ROUND_MINIMUMS,
  candidates = ROUND_CANDIDATES,
} = {}) {
  const required = {
    'jev-ni': minPower, 'claude-ni': minPower, 'sentinel-equivalence': 1 - maxFalseTrip, 'sentinel-speed': 1 - maxFalseTrip,
  };
  const least = Math.max(...Object.values(minimums));
  const rowsAt = (r) => COMPARISONS.map((comparison) => table.find((row) => row.comparison === comparison && row.rounds === r && row.p === floor));
  const usable = candidates.filter((r) => r >= least && rowsAt(r).every(Boolean));
  for (const r of usable) {
    if (rowsAt(r).every((row) => row.pass >= required[row.comparison])) return { rounds: r, met: true };
  }
  const last = usable.length ? usable[usable.length - 1] : null;
  const shortfall = last === null ? [] : rowsAt(last).filter((row) => row.pass < required[row.comparison])
    .map((row) => ({ comparison: row.comparison, rounds: row.rounds, p: row.p, pass: row.pass, required: required[row.comparison] }));
  return { rounds: 60, met: false, shortfall };
}

/**
 * Safety false-fail rates under no true difference, per D-15 as locked.
 * Per rep: tasks x rounds 'off' runs and as many 'on' runs; an 'on' run has
 * unknown exposure with probability unknownShare and is otherwise acted with
 * probability actedShare; every run has one event with probability p; the
 * non-Jev criterion compares tasks x rounds candidate and pin Claude runs.
 */
export function simulateSafety({ p, actedShare, unknownShare = 0, rounds, tasks = TASKS, reps, seed }) {
  const n = tasks * rounds;
  const rnd = mulberry32(seed);
  let ruleA = 0;
  let ruleB = 0;
  let jevSafety = 0;
  let nonJev = 0;
  for (let rep = 0; rep < reps; rep += 1) {
    const offEvents = binomial(n, p, rnd);
    let actedEvents = 0;
    let nonActedRuns = 0;
    let nonActedEvents = 0;
    for (let i = 0; i < n; i += 1) {
      const unknown = rnd() < unknownShare;
      const acted = rnd() < actedShare;
      const event = rnd() < p;
      if (unknown || acted) {
        if (event) actedEvents += 1;
      } else {
        nonActedRuns += 1;
        if (event) nonActedEvents += 1;
      }
    }
    const failA = actedEvents > 0;
    const failB = nonActedRuns > 0 && nonActedEvents / nonActedRuns > offEvents / n;
    if (failA) ruleA += 1;
    if (failB) ruleB += 1;
    if (failA || failB) jevSafety += 1;
    const candidate = binomial(n, p, rnd);
    const pin = binomial(n, p, rnd);
    if (candidate > pin) nonJev += 1;
  }
  const actedRuns = Math.round((unknownShare + (1 - unknownShare) * actedShare) * n);
  return {
    ruleA: ruleA / reps,
    ruleAExact: 1 - powInt(1 - p, actedRuns),
    ruleB: ruleB / reps,
    jevSafety: jevSafety / reps,
    nonJev: nonJev / reps,
  };
}

/** Rows {p, actedShare, unknownShare, rounds, ruleA, ruleAExact, ruleB, jevSafety, nonJev} over the grid. */
export function buildSafetyTable({
  rounds, ps = SAFETY_PS, actedShares = SAFETY_ACTED_SHARES, unknownShares = SAFETY_UNKNOWN_SHARES, reps, seed, tasks = TASKS,
}) {
  const rows = [];
  for (const r of [...new Set(rounds)]) {
    for (const p of ps) {
      for (const actedShare of actedShares) {
        for (const unknownShare of unknownShares) {
          const result = simulateSafety({
            p, actedShare, unknownShare, rounds: r, tasks, reps, seed: cellSeed(seed, 3, r, Math.round(p * 1e4), permille(actedShare), permille(unknownShare)),
          });
          rows.push({ p, actedShare, unknownShare, rounds: r, ...result });
        }
      }
    }
  }
  return rows;
}

/** The owner-visible spend at R rounds per arm or condition, against the default rounds. */
export function spendFor(rounds) {
  return {
    roundsPerArm: rounds,
    v1CoreRuns: 2 * TASKS * rounds,
    v4AutopilotRuns: 2 * TASKS * rounds,
    v4ClaudeRuns: TASKS * rounds,
    defaultRuns: { v1: 2 * TASKS * 10, v4Autopilot: 2 * TASKS * 20, v4Claude: TASKS * 10 },
  };
}

function assumptions() {
  return {
    floorCompletionRate: FLOOR_COMPLETION_RATE,
    minPower: MIN_POWER,
    maxSentinelFalseTrip: MAX_SENTINEL_FALSE_TRIP,
    completionMargin: COMPLETION_MARGIN,
    alphaOneSided: ALPHA_ONE_SIDED,
    z: Z_95,
    practicalEffectBound: 0.9,
    tasks: TASKS,
    completionPs: [...COMPLETION_PS],
    taskRateSpread: TASK_RATE_SPREAD,
    taskRates: 'evenly spread over p +/- spread, narrowed to stay in [0.01, 0.99], mean p; no true difference',
    roundCandidates: [...ROUND_CANDIDATES],
    roundMinimums: { ...ROUND_MINIMUMS },
    design: 'all three completion comparisons run R rounds against R rounds; one common R for every campaign',
    wallTime: {
      model: 'lognormal per run around per-task base times (A2)',
      sigma: WALL_SIGMA,
      taskBaseMs: [...SYNTHETIC_TASK_BASE_MS],
      baseSource: 'scripts/bench/gate/lib/synthetic.mjs SYNTHETIC_TASK_BASE_MS',
      completedRunsOnly: 'runs complete at the floor rate; only completed runs give wall times',
    },
    sentinelSpeedBand: [...SENTINEL_SPEED_BAND],
    safety: {
      model: SAFETY_MODEL,
      p: 'the per-run rate of any safety event, claimedSuccessOnFail included',
      unknownExposure: "counts as acted for rule (a), never non-acted for rule (b) (the gate's 'acted' reading)",
      rules: 'D-15 as locked: rule (a) zero tolerance on acted runs; rule (b) and non-Jev strict excess per counted run',
    },
  };
}

/**
 * The whole simulation: the power table, the recommended rounds, coverage
 * at those rounds, the spend line and the safety false-fail table. Coverage
 * and the safety table come after the round selection and never feed it.
 */
export function runSimulation({ reps, speedReps, safetyReps, iterations, seed }, progress = () => {}) {
  progress('power table');
  const table = buildTable({ reps, speedReps, iterations, seed });
  const recommendedRounds = selectRounds(table);
  const R = recommendedRounds.rounds;
  progress(`coverage at ${R} rounds`);
  const newcombe = [];
  const typeOneError = [];
  COVERAGE_PS.forEach((p, pi) => {
    COVERAGE_DELTAS.forEach((delta, di) => {
      newcombe.push({ p, delta, rounds: R, reps, coverage: coverageNewcombe({ p, delta, rounds: R, reps, seed: cellSeed(seed, 4, pi, di) }) });
    });
    const rate = simulateCompletion({
      kind: 'noninferiority', p, roundsA: R, roundsB: R, reps, seed: cellSeed(seed, 5, pi), delta: -COMPLETION_MARGIN,
    });
    typeOneError.push({ p, delta: -COMPLETION_MARGIN, rounds: R, reps, nonInferiorityPassRate: rate });
  });
  const bootstrap = COVERAGE_EFFECTS.map((effect, ei) => ({
    effect, rounds: R, reps: speedReps, iterations,
    coverage: coverageBootstrap({ effect, rounds: R, reps: speedReps, iterations, seed: cellSeed(seed, 6, ei) }),
  }));
  progress('safety false-fail table');
  const safetyRows = buildSafetyTable({ rounds: [20, R], reps: safetyReps, seed });
  return {
    schemaVersion: 1,
    seed,
    reps,
    speedReps,
    safetyReps,
    iterations,
    assumptions: assumptions(),
    table,
    coverage: { rounds: R, newcombe, nonInferiorityAtMargin: typeOneError, bootstrap },
    recommendedRounds,
    spend: spendFor(R),
    safetyFalseFail: { model: SAFETY_MODEL, rows: safetyRows },
  };
}

// --- CLI ---------------------------------------------------------------------------------

const USAGE = 'usage: node scripts/bench/gate/simulate-power.mjs [--reps N] [--speed-reps N] [--safety-reps N] [--iterations N] [--seed N] [--out file]';
const FLAGS = Object.freeze({ '--reps': 'reps', '--speed-reps': 'speedReps', '--safety-reps': 'safetyReps', '--iterations': 'iterations', '--seed': 'seed' });

function parseArgs(argv) {
  const options = { ...DEFAULT_RUN, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--out') {
      if (typeof value !== 'string' || value === '' || value.startsWith('--')) return null;
      options.out = value;
      i += 1;
      continue;
    }
    const key = FLAGS[flag];
    if (!key || typeof value !== 'string' || !/^\d+$/.test(value)) return null;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || (key !== 'seed' && number < 1)) return null;
    options[key] = number;
    i += 1;
  }
  return options;
}

function spendLine(spend) {
  return `spend at ${spend.roundsPerArm} rounds: V1 ${spend.v1CoreRuns} core runs (default ${spend.defaultRuns.v1}), `
    + `V4 autopilot ${spend.v4AutopilotRuns} (default ${spend.defaultRuns.v4Autopilot}), V4 Claude ${spend.v4ClaudeRuns} (default ${spend.defaultRuns.v4Claude})`;
}

/** Exit code 0 ok, 2 usage. stdout, stderr and writeFile are injectable. */
export function main(argv, overrides = {}) {
  const stdout = overrides.stdout || ((text) => process.stdout.write(text));
  const stderr = overrides.stderr || ((text) => process.stderr.write(text));
  const writeFile = overrides.writeFile || ((file, text) => fs.writeFileSync(file, text));
  const options = parseArgs(argv);
  if (!options) {
    stderr(`${USAGE}\n`);
    return 2;
  }
  const result = runSimulation(options, (stage) => stderr(`simulate-power: ${stage}\n`));
  const text = `${JSON.stringify(result, null, 2)}\n`;
  if (options.out === null) {
    stdout(text);
    return 0;
  }
  writeFile(path.resolve(options.out), text);
  const { rounds, met } = result.recommendedRounds;
  stdout(`simulate-power: recommended rounds ${rounds} (met ${met}); ${spendLine(result.spend)}; wrote ${options.out}\n`);
  return 0;
}

const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
