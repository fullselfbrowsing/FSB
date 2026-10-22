// Phase 67 Jev shadow threshold selection (D-27, RESEARCH Pattern 11): the
// one-sided normal quantile, the committed predeclared spec and its exact-key
// validator, precision and recall selection on seeded synthetic data with a
// known answer, not_a_fit on small samples, and the raw-scale profile
// thresholds.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadTargets,
  selectAll,
  selectCut,
  toProfileThresholds,
  validateTargets,
  zOneSided,
} from '../scripts/bench/shadow/lib/select.mjs';
import { mulberry32, wilson } from '../scripts/bench/lib/stats.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS_FILE = path.join(ROOT, 'scripts', 'bench', 'shadow', 'targets.json');

// The five Jev question kinds, written out here (not imported) so this suite
// has no dependency on the server contract module.
const KINDS = ['operation', 'target', 'completion', 'stuck', 'risk'];

// Upper-tail standard-normal quantile for alpha 0.05 / 10 cuts, from tables.
const Z_BONFERRONI_10 = 2.5758293035489004;

const EXPECTED_SPEC = {
  schemaVersion: 1,
  note: 'Predeclared before V3 (D-27). Do not edit after viewing live shadow results; a change needs a new note and a fresh V3 run.',
  alpha: 0.05,
  grid: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95],
  tieBand: 0.05,
  minN: 30,
  confidenceBuckets: [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1],
  optionBands: [[2, 3], [4, 10], [11, 50], [51, 255]],
  kinds: {
    operation: { mode: 'precision', target: 0.95 },
    target: { mode: 'precision', target: 0.95 },
    completion: { mode: 'precision', target: 0.95 },
    stuck: { mode: 'precision', target: 0.9 },
    risk: { mode: 'recall', target: 0.95 },
  },
};

const readCommitted = () => JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
const round6 = (x) => Math.round(x * 1e6) / 1e6;
const near = (actual, expected, eps) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} is not within ${eps} of ${expected}`);
const reading = (s, correct, { positive = true, acting = true } = {}) =>
  ({ s, correct, positive, optionCount: null, bucketValue: s, acting });
const specFor = (targets, kind) => ({
  grid: targets.grid, alpha: targets.alpha, tieBand: targets.tieBand, minN: targets.minN,
  mode: targets.kinds[kind].mode, target: targets.kinds[kind].target,
});

// --- zOneSided ---------------------------------------------------------------

test('zOneSided matches tabulated upper-tail normal quantiles to 1e-6', () => {
  near(zOneSided(0.05), 1.644854, 1e-6);
  near(zOneSided(0.025), 1.959964, 1e-6);
  near(zOneSided(0.005), 2.575829, 1e-6);
  near(zOneSided(0.01), 2.326348, 1e-6);
  near(zOneSided(0.001), 3.090232, 1e-6);
  near(zOneSided(0.0001), 3.719016, 1e-6);
  near(zOneSided(0.05 / 19), 2.790470, 1e-6);
  near(zOneSided(0.5), 0, 1e-9);
  near(zOneSided(0.95), -1.644854, 1e-6);
  near(zOneSided(0.2), 0.841621, 1e-6);
});

test('zOneSided is strictly decreasing in alpha and rejects alpha outside (0, 1)', () => {
  let previous = Infinity;
  for (let a = 0.0005; a < 1; a += 0.0105) {
    const z = zOneSided(a);
    assert.ok(z < previous, `z(${a}) must be below the previous value`);
    previous = z;
  }
  for (const bad of [0, 1, -0.1, 1.5, Number.NaN, Infinity, '0.05', null, undefined]) {
    assert.throws(() => zOneSided(bad), RangeError, `alpha ${String(bad)}`);
  }
});

// --- targets.json and validateTargets ----------------------------------------

test('the committed targets.json is exactly the predeclared spec and validates', () => {
  const committed = readCommitted();
  assert.deepEqual(committed, EXPECTED_SPEC);
  assert.deepEqual(validateTargets(committed), { ok: true, errors: [] });
  assert.deepEqual(Object.keys(committed.kinds), KINDS);
});

test('validateTargets rejects every malformed spec with a message', () => {
  const cases = [
    ['unknown top-level key', (t) => { t.extra = 1; }],
    ['missing top-level key', (t) => { delete t.minN; }],
    ['missing kind', (t) => { delete t.kinds.stuck; }],
    ['unknown kind', (t) => { t.kinds.bogus = { mode: 'precision', target: 0.9 }; }],
    ['unknown key in a kind entry', (t) => { t.kinds.risk.extra = 1; }],
    ['missing key in a kind entry', (t) => { delete t.kinds.risk.target; }],
    ['kind entry not an object', (t) => { t.kinds.risk = 'recall'; }],
    ['unsorted grid', (t) => { t.grid = [0.6, 0.5, 0.7]; }],
    ['duplicate grid cut', (t) => { t.grid = [0.5, 0.5, 0.7]; }],
    ['grid below 0.5', (t) => { t.grid = [0.4, 0.5]; }],
    ['grid at 1', (t) => { t.grid = [0.5, 1]; }],
    ['grid cut plus tie band above 1', (t) => { t.grid = [0.5, 0.97]; }],
    ['empty grid', (t) => { t.grid = []; }],
    ['grid not numbers', (t) => { t.grid = ['0.5']; }],
    ['mode other than precision or recall', (t) => { t.kinds.target.mode = 'f1'; }],
    ['target 1', (t) => { t.kinds.target.target = 1; }],
    ['target 0', (t) => { t.kinds.target.target = 0; }],
    ['target above 1', (t) => { t.kinds.target.target = 1.5; }],
    ['target as a string', (t) => { t.kinds.target.target = '0.9'; }],
    ['alpha 0', (t) => { t.alpha = 0; }],
    ['alpha 1', (t) => { t.alpha = 1; }],
    ['minN 0', (t) => { t.minN = 0; }],
    ['minN not an integer', (t) => { t.minN = 2.5; }],
    ['negative tie band', (t) => { t.tieBand = -0.1; }],
    ['tie band 0.5', (t) => { t.tieBand = 0.5; }],
    ['schemaVersion 2', (t) => { t.schemaVersion = 2; }],
    ['empty note', (t) => { t.note = ''; }],
    ['buckets not starting at 0', (t) => { t.confidenceBuckets = [0.1, 0.5, 1]; }],
    ['buckets not ending at 1', (t) => { t.confidenceBuckets = [0, 0.5, 0.9]; }],
    ['unsorted buckets', (t) => { t.confidenceBuckets = [0, 0.6, 0.5, 1]; }],
    ['overlapping option bands', (t) => { t.optionBands = [[2, 4], [4, 10]]; }],
    ['option band lo above hi', (t) => { t.optionBands = [[3, 2]]; }],
    ['option band not integers', (t) => { t.optionBands = [[2, 3.5]]; }],
    ['option band not a pair', (t) => { t.optionBands = [[2, 3, 4]]; }],
    ['empty option bands', (t) => { t.optionBands = []; }],
  ];
  for (const [name, mutate] of cases) {
    const t = readCommitted();
    mutate(t);
    const result = validateTargets(t);
    assert.equal(result.ok, false, name);
    assert.ok(result.errors.length > 0 && result.errors.every((e) => typeof e === 'string' && e.length > 0), name);
  }
  for (const notObject of [null, [], 'targets', 42]) {
    assert.equal(validateTargets(notObject).ok, false, String(notObject));
  }
  const withProto = JSON.parse(JSON.stringify(EXPECTED_SPEC).replace('{', '{"__proto__":{"minN":1},'));
  assert.equal(validateTargets(withProto).ok, false, 'an own __proto__ key is an unknown key');
});

test('loadTargets returns a deep-frozen spec and throws one aggregated Error on a bad file', () => {
  const t = loadTargets(TARGETS_FILE);
  assert.deepEqual(t, EXPECTED_SPEC);
  for (const part of [t, t.grid, t.kinds, t.kinds.risk, t.optionBands, t.optionBands[0], t.confidenceBuckets]) {
    assert.ok(Object.isFrozen(part));
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jev-targets-'));
  try {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, JSON.stringify({ ...EXPECTED_SPEC, minN: 0, extra: true }));
    assert.throws(() => loadTargets(bad), (err) => err instanceof Error && /minN/.test(err.message) && /extra/.test(err.message));
    const notJson = path.join(dir, 'not.json');
    fs.writeFileSync(notJson, '{"schemaVersion": 1,');
    assert.throws(() => loadTargets(notJson), Error);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- selectCut: not_a_fit ----------------------------------------------------

test('fewer readings than minN is not_a_fit for insufficient samples, with no number', () => {
  const targets = loadTargets(TARGETS_FILE);
  const readings = Array.from({ length: 20 }, () => reading(0.99, true));
  const result = selectCut(readings, specFor(targets, 'operation'));
  assert.deepEqual(Object.keys(result), ['status', 'effectiveThreshold', 'z', 'reason']);
  assert.equal(result.status, 'not_a_fit');
  assert.equal(result.reason, 'insufficient_samples');
  assert.equal(result.effectiveThreshold, null);
  near(result.z, Z_BONFERRONI_10, 1e-6);
  const recall = selectCut(readings, specFor(targets, 'risk'));
  assert.deepEqual([recall.status, recall.reason, recall.effectiveThreshold], ['not_a_fit', 'insufficient_samples', null]);
});

test('enough readings whose lower bound never clears the target is not_a_fit with no cut qualifying', () => {
  const targets = loadTargets(TARGETS_FILE);
  const readings = Array.from({ length: 100 }, (_, i) => reading(0.99, i % 2 === 0));
  const result = selectCut(readings, specFor(targets, 'operation'));
  assert.deepEqual([result.status, result.reason, result.effectiveThreshold], ['not_a_fit', 'no_cut_qualifies', null]);
});

test('no small sample ever yields a threshold, however perfect it is', () => {
  const targets = loadTargets(TARGETS_FILE);
  for (let seed = 1; seed <= 200; seed += 1) {
    const rnd = mulberry32(seed);
    const n = Math.floor(rnd() * targets.minN);
    const readings = Array.from({ length: n }, () => reading(0.9 + 0.1 * rnd(), true));
    for (const kind of KINDS) {
      const result = selectCut(readings, specFor(targets, kind));
      assert.equal(result.status, 'not_a_fit');
      assert.equal(result.effectiveThreshold, null);
    }
  }
});

// --- selectCut: the tie band and the Bonferroni z ----------------------------

test('precision mode counts only readings at or above cut + tieBand (ties fall on the conservative side)', () => {
  const readings = [
    ...Array.from({ length: 100 }, () => reading(0.82, false)),
    ...Array.from({ length: 200 }, () => reading(0.9, true)),
  ];
  const spec = { grid: [0.75, 0.8, 0.85], alpha: 0.05, tieBand: 0.05, minN: 30, mode: 'precision', target: 0.95 };
  const result = selectCut(readings, spec);
  assert.equal(result.status, 'fit');
  assert.equal(result.cut, 0.8);
  assert.equal(result.effectiveThreshold, 0.85, 'cut 0.80 + 0.05 is exactly 0.85');
  assert.equal(result.n, 200);
  assert.equal(result.hits, 200);
  assert.equal(result.z, zOneSided(0.05 / 3), 'Bonferroni over the three cuts scanned');
  assert.equal(result.lower, wilson(200, 200, result.z)[0]);
  assert.deepEqual(Object.keys(result), ['status', 'cut', 'effectiveThreshold', 'n', 'hits', 'lower', 'z']);
});

test('the Bonferroni z for the committed 10-cut grid is zOneSided(alpha / 10), about 2.5758', () => {
  const targets = loadTargets(TARGETS_FILE);
  const result = selectCut([], specFor(targets, 'stuck'));
  assert.equal(result.z, zOneSided(targets.alpha / targets.grid.length));
  near(result.z, Z_BONFERRONI_10, 1e-6);
});

// --- selectCut: known answers on seeded synthetic data -----------------------

// 600 readings with s uniform in [0.5, 1): precision about 0.99 for s >= 0.80
// and about 0.60 below.
function precisionData(seed) {
  const rnd = mulberry32(seed);
  return Array.from({ length: 600 }, () => {
    const s = 0.5 + 0.5 * rnd();
    return reading(s, rnd() < (s >= 0.8 ? 0.99 : 0.6));
  });
}

// Independent derivation with the tabulated z: which cuts qualify in precision mode.
function qualifyingPrecisionCuts(readings, spec) {
  return [...spec.grid].sort((a, b) => a - b).flatMap((cut) => {
    const eff = round6(cut + spec.tieBand);
    const pool = readings.filter((r) => r.acting && r.s >= eff);
    const hits = pool.filter((r) => r.correct).length;
    if (pool.length < spec.minN) return [];
    const [lower] = wilson(hits, pool.length, Z_BONFERRONI_10);
    return lower >= spec.target ? [{ cut, eff, n: pool.length, hits, lower }] : [];
  });
}

test('precision mode finds the known lowest qualifying cut on seeded synthetic data', () => {
  const targets = loadTargets(TARGETS_FILE);
  const spec = specFor(targets, 'stuck'); // precision, target 0.90
  const readings = precisionData(67);
  const qualifying = qualifyingPrecisionCuts(readings, spec);
  assert.ok(qualifying.length > 1, 'several cuts qualify, so the scan order decides');
  const expected = qualifying[0];
  const result = selectCut(readings, spec);
  assert.equal(result.status, 'fit');
  assert.equal(result.cut, expected.cut);
  assert.equal(result.cut, 0.75, 'the known cut: the first effective threshold at or above 0.80');
  assert.equal(result.effectiveThreshold, expected.eff);
  assert.equal(result.effectiveThreshold, 0.8);
  assert.deepEqual([result.n, result.hits], [expected.n, expected.hits]);
  near(result.lower, expected.lower, 1e-6);
});

test('readings that do not act never count toward a precision pool', () => {
  const targets = loadTargets(TARGETS_FILE);
  const spec = specFor(targets, 'stuck');
  const readings = precisionData(67);
  const withAbstentions = [...readings, ...Array.from({ length: 100 }, () => reading(0.99, false, { acting: false }))];
  assert.deepEqual(selectCut(withAbstentions, spec), selectCut(readings, spec));
});

// 500 risk-positive readings (99% with p in [0.72, 1), 1% with p in [0, 0.4))
// plus 500 negatives with p uniform; recall is measured on the positives.
function recallData(seed) {
  const rnd = mulberry32(seed);
  const positives = Array.from({ length: 500 }, () => {
    const p = rnd() < 0.99 ? 0.72 + 0.28 * rnd() : 0.4 * rnd();
    return reading(p, p >= 0.5, { positive: true });
  });
  const negatives = Array.from({ length: 500 }, () => {
    const p = rnd();
    return reading(p, p < 0.5, { positive: false });
  });
  return { positives, negatives };
}

test('recall mode scans down and finds the known highest cut whose recall lower bound clears the target', () => {
  const targets = loadTargets(TARGETS_FILE);
  const spec = specFor(targets, 'risk'); // recall, target 0.95
  const { positives, negatives } = recallData(67);
  const qualifying = [...spec.grid].sort((a, b) => b - a).flatMap((cut) => {
    const eff = round6(cut - spec.tieBand);
    const hits = positives.filter((r) => r.s >= eff).length;
    const [lower] = wilson(hits, positives.length, Z_BONFERRONI_10);
    return lower >= spec.target ? [{ cut, eff, hits, lower }] : [];
  });
  assert.ok(qualifying.length > 1, 'several cuts qualify, so the scan order decides');
  const expected = qualifying[0];
  const result = selectCut([...positives, ...negatives], spec);
  assert.equal(result.status, 'fit');
  assert.equal(result.cut, expected.cut);
  assert.equal(result.cut, 0.75, 'the known cut: the highest whose effective threshold sits below 0.72');
  assert.equal(result.effectiveThreshold, 0.7, 'cut 0.75 - 0.05 is exactly 0.7');
  assert.deepEqual([result.n, result.hits], [positives.length, expected.hits]);
  near(result.lower, expected.lower, 1e-6);
  assert.deepEqual(selectCut(positives, spec), result, 'negatives never change recall');
});

test('selectCut is deterministic, leaves its input untouched and rejects an unknown mode', () => {
  const targets = loadTargets(TARGETS_FILE);
  const readings = precisionData(7);
  const before = JSON.stringify(readings);
  assert.deepEqual(selectCut(readings, specFor(targets, 'stuck')), selectCut(precisionData(7), specFor(targets, 'stuck')));
  assert.equal(JSON.stringify(readings), before);
  assert.throws(() => selectCut(readings, { ...specFor(targets, 'stuck'), mode: 'f1' }), TypeError);
  assert.throws(() => selectCut('readings', specFor(targets, 'stuck')), TypeError);
});

// --- selectAll ---------------------------------------------------------------

test('selectAll applies each kind its own mode and target from the committed spec', () => {
  const targets = loadTargets(TARGETS_FILE);
  const { positives, negatives } = recallData(67);
  const selection = selectAll({ stuck: precisionData(67), risk: [...positives, ...negatives] }, targets);
  assert.deepEqual(Object.keys(selection), KINDS);
  assert.equal(selection.stuck.status, 'fit');
  assert.equal(selection.stuck.cut, 0.75);
  assert.equal(selection.risk.status, 'fit');
  assert.equal(selection.risk.effectiveThreshold, 0.7);
  for (const kind of ['operation', 'target', 'completion']) {
    assert.deepEqual([selection[kind].status, selection[kind].reason], ['not_a_fit', 'insufficient_samples']);
  }
});

test('a seed-set-sized run (a dozen perfect readings per kind) is not_a_fit for every kind', () => {
  const targets = loadTargets(TARGETS_FILE);
  const readingsByKind = Object.fromEntries(KINDS.map((k) => [k, Array.from({ length: 12 }, () => reading(0.97, true))]));
  const selection = selectAll(readingsByKind, targets);
  for (const kind of KINDS) {
    assert.equal(selection[kind].status, 'not_a_fit', kind);
    assert.equal(selection[kind].effectiveThreshold, null, kind);
  }
  assert.deepEqual(toProfileThresholds(selection), { operation: null, target: null, completion: null, stuck: null, risk: null });
  assert.throws(() => selectAll({ bogus: [] }, targets), TypeError);
});

// --- toProfileThresholds -----------------------------------------------------

test('toProfileThresholds maps effective thresholds to the raw scale, completion as 1 - t, not_a_fit as null', () => {
  const fit = (effectiveThreshold) => ({ status: 'fit', cut: 0, effectiveThreshold, n: 100, hits: 100, lower: 0.97, z: Z_BONFERRONI_10 });
  const notFit = { status: 'not_a_fit', effectiveThreshold: null, z: Z_BONFERRONI_10, reason: 'no_cut_qualifies' };
  const thresholds = toProfileThresholds({
    operation: fit(0.85), target: notFit, completion: fit(0.9), stuck: notFit, risk: notFit,
  });
  assert.deepEqual(thresholds, { operation: 0.85, target: null, completion: 0.1, stuck: null, risk: null });
  assert.equal(thresholds.completion, 0.1, '1 - 0.9 is rounded to exactly 0.1');
  assert.deepEqual(toProfileThresholds({ stuck: fit(0.95), risk: fit(0.7), target: fit(0.6) }),
    { operation: null, target: 0.6, completion: null, stuck: 0.95, risk: 0.7 });
  assert.throws(() => toProfileThresholds({ bogus: notFit }), TypeError);
  assert.throws(() => toProfileThresholds({ risk: fit(null) }), TypeError);
  assert.throws(() => toProfileThresholds({ risk: fit(1.2) }), TypeError);
  assert.throws(() => toProfileThresholds({ risk: { ...notFit, effectiveThreshold: 0.5 } }), TypeError, 'not_a_fit never carries a number');
});
