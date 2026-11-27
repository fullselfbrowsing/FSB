// Phase 67 Jev shadow scoring (D-27): the signal axis, readings, accuracy by
// confidence bucket with Wilson intervals, coverage at every grid cut and
// accuracy by option-count band. Known answers, a 1,000-reading seeded run
// checked against a direct recomputation, and determinism.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bucketAccuracy,
  coverageAtCuts,
  optionBandAccuracy,
  scoreRun,
  signalFor,
  toReadings,
} from '../scripts/bench/shadow/lib/score.mjs';
import { mulberry32, wilson } from '../scripts/bench/lib/stats.mjs';

// The five Jev question kinds, written out here (not imported) so this suite
// has no dependency on the server contract module.
const KINDS = ['operation', 'target', 'completion', 'stuck', 'risk'];
const CHOICE_KINDS = ['operation', 'target'];

// The predeclared spec values (same literal as scripts/bench/shadow/targets.json).
const TARGETS = Object.freeze({
  schemaVersion: 1,
  note: 'test copy',
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
});

const Z95 = 1.959963984540054;
const close = (actual, expected, eps = 1e-12) =>
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} is not within ${eps} of ${expected}`);
const round6 = (x) => Math.round(x * 1e6) / 1e6;

function row(kind, label, decision, fallback = null, recordId = 'rec-1') {
  return { recordId, taskId: 'core-click-checklist', kind, label, decision, fallback };
}
const choice = (c, confidence, optionCount) => ({ choice: c, confidence, optionCount });
const noul = (p) => ({ p });

// --- signalFor ---------------------------------------------------------------

test('signalFor puts every kind on one larger-is-stronger axis', () => {
  assert.equal(signalFor('completion', { p: 0.2 }), 0.8);
  assert.equal(signalFor('risk', { p: 0.7 }), 0.7);
  assert.equal(signalFor('stuck', { p: 0.35 }), 0.35);
  assert.equal(signalFor('target', { choice: 'e1', confidence: 0.6, optionCount: 4 }), 0.6);
  assert.equal(signalFor('operation', { choice: 'click', confidence: 0.9, optionCount: 9 }), 0.9);
});

test('signalFor throws a TypeError for an unknown kind or a malformed decision', () => {
  assert.throws(() => signalFor('bogus', { p: 0.5 }), TypeError);
  assert.throws(() => signalFor('__proto__', { p: 0.5 }), TypeError);
  assert.throws(() => signalFor('risk', null), TypeError);
  assert.throws(() => signalFor('risk', { p: 1.2 }), TypeError);
  assert.throws(() => signalFor('risk', { p: Number.NaN }), TypeError);
  assert.throws(() => signalFor('target', { choice: 'e1', confidence: -0.1, optionCount: 4 }), TypeError);
  assert.throws(() => signalFor('target', { p: 0.5 }), TypeError);
});

// --- toReadings --------------------------------------------------------------

test('toReadings builds Choice readings and counts fallbacks instead of reading them', () => {
  const rows = [
    row('target', 'e1', choice('e1', 0.9, 4)),
    row('target', 'e2', choice('e1', 0.7, 4)),
    row('target', 'e3', choice('none_of_the_above', 0.6, 5)),
    row('target', 'e1', null, 'timeout'),
    row('target', 'e1', null, 'timeout'),
    row('target', 'e1', null, 'busy'),
    row('completion', false, noul(0.2)),
  ];
  const { readings, fallbacks } = toReadings(rows, 'target');
  assert.deepEqual(readings, [
    { s: 0.9, correct: true, positive: true, optionCount: 4, bucketValue: 0.9, acting: true },
    { s: 0.7, correct: false, positive: true, optionCount: 4, bucketValue: 0.7, acting: true },
    { s: 0.6, correct: false, positive: true, optionCount: 5, bucketValue: 0.6, acting: false },
  ]);
  assert.deepEqual(fallbacks, { busy: 1, timeout: 2 });
  assert.deepEqual(Object.keys(fallbacks), ['busy', 'timeout'], 'fallback reasons are sorted');
});

test('toReadings builds Noul readings: completion veto, stuck flag and risk flag', () => {
  const completion = toReadings([
    row('completion', false, noul(0.2)),
    row('completion', true, noul(0.9)),
    row('completion', false, noul(0.7)),
  ], 'completion').readings;
  assert.equal(completion[0].s, 0.8);
  assert.deepEqual(
    completion.map(({ correct, positive, optionCount, bucketValue, acting }) => ({ correct, positive, optionCount, bucketValue, acting })),
    [
      { correct: true, positive: true, optionCount: null, bucketValue: 0.6, acting: true },
      { correct: true, positive: false, optionCount: null, bucketValue: 0.8, acting: true },
      { correct: false, positive: true, optionCount: null, bucketValue: 0.4, acting: true },
    ],
  );
  close(completion[1].s, 0.1);

  const stuck = toReadings([row('stuck', true, noul(0.8)), row('stuck', true, noul(0.3)), row('stuck', false, noul(0.1))], 'stuck').readings;
  assert.deepEqual(stuck.map((r) => [r.s, r.correct, r.positive, r.bucketValue]), [
    [0.8, true, true, 0.6],
    [0.3, false, true, 0.4],
    [0.1, true, false, 0.8],
  ]);

  const risk = toReadings([row('risk', true, noul(0.7)), row('risk', false, noul(0.4)), row('risk', false, noul(0.6))], 'risk').readings;
  assert.deepEqual(risk.map((r) => [r.s, r.correct, r.positive, r.bucketValue, r.acting]), [
    [0.7, true, true, 0.4, true],
    [0.4, true, false, 0.2, true],
    [0.6, false, false, 0.2, true],
  ]);
});

test('Noul bucket values are rounded to 6 decimals so a reading never lands in the bucket below its edge', () => {
  // |0.95 - 0.5| * 2 is 0.8999999999999999 in floating point; it belongs in the 0.9 bucket.
  const [reading] = toReadings([row('risk', true, noul(0.95))], 'risk').readings;
  assert.equal(reading.bucketValue, 0.9);
  const [bucket] = bucketAccuracy([reading], [0.9, 0.95, 1]);
  assert.equal(bucket.n, 1);
});

test('inside the selection region (s >= 0.5) a Noul reading is correct exactly when the veto or flag is right', () => {
  const rnd = mulberry32(6702);
  for (let i = 0; i < 2000; i += 1) {
    const p = Math.round(rnd() * 1000) / 1000;
    const label = rnd() < 0.5;
    const [c] = toReadings([row('completion', label, noul(p))], 'completion').readings;
    if (c.s >= 0.5) assert.equal(c.correct, label === false, `completion p=${p} label=${label}`);
    const [s] = toReadings([row('stuck', label, noul(p))], 'stuck').readings;
    if (s.s >= 0.5) assert.equal(s.correct, label === true, `stuck p=${p} label=${label}`);
  }
});

test('toReadings rejects malformed rows and unknown kinds with a TypeError', () => {
  assert.throws(() => toReadings([], 'bogus'), TypeError);
  assert.throws(() => toReadings('rows', 'risk'), TypeError);
  assert.throws(() => toReadings([row('risk', true, null, null)], 'risk'), TypeError, 'decision and fallback both null');
  assert.throws(() => toReadings([row('risk', true, noul(0.5), 'timeout')], 'risk'), TypeError, 'decision and fallback both set');
  assert.throws(() => toReadings([row('target', true, choice('e1', 0.5, 3))], 'target'), TypeError, 'Choice label must be a string');
  assert.throws(() => toReadings([row('risk', 'yes', noul(0.5))], 'risk'), TypeError, 'Noul label must be a boolean');
  assert.throws(() => toReadings([row('target', 'e1', choice('e1', 0.5, 0))], 'target'), TypeError, 'optionCount must be a positive integer');
});

test('a fallback reason named __proto__ is counted as data and never changes the prototype', () => {
  const { fallbacks } = toReadings([row('risk', true, null, '__proto__')], 'risk');
  assert.equal(Object.getPrototypeOf(fallbacks), Object.prototype);
  assert.deepEqual(Object.keys(fallbacks), ['__proto__']);
  assert.equal(Object.getOwnPropertyDescriptor(fallbacks, '__proto__').value, 1);
});

// --- bucketAccuracy ----------------------------------------------------------

test('bucketAccuracy uses half-open buckets, closes the last one and reports Wilson intervals', () => {
  const readings = [0, 0.25, 0.5, 0.75, 1].map((bucketValue, i) => ({
    s: bucketValue, correct: [true, false, true, true, false][i], positive: true, optionCount: 3, bucketValue, acting: true,
  }));
  const [lower, upper] = bucketAccuracy(readings, [0, 0.5, 1]);
  assert.deepEqual(lower, { lo: 0, hi: 0.5, n: 2, correct: 1, accuracy: 0.5, wilson: wilson(1, 2) });
  assert.deepEqual(upper, { lo: 0.5, hi: 1, n: 3, correct: 2, accuracy: 2 / 3, wilson: wilson(2, 3) });
  assert.deepEqual(bucketAccuracy(readings, [0, 0.5, 1], 2.5)[1].wilson, wilson(2, 3, 2.5));
});

test('an empty bucket reports null accuracy and null bounds, never 0', () => {
  const readings = [{ s: 0.9, correct: true, positive: true, optionCount: 2, bucketValue: 0.9, acting: true }];
  const [empty, full] = bucketAccuracy(readings, [0, 0.5, 1]);
  assert.deepEqual(empty, { lo: 0, hi: 0.5, n: 0, correct: 0, accuracy: null, wilson: [null, null] });
  assert.equal(full.n, 1);
  assert.throws(() => bucketAccuracy(readings, [0.5, 0]), TypeError, 'edges must ascend');
  assert.throws(() => bucketAccuracy(readings, [0]), TypeError, 'at least two edges');
});

// --- coverageAtCuts ----------------------------------------------------------

test('coverageAtCuts counts acting readings at or above each cut over all readings of the kind', () => {
  const readings = [
    [0.95, true], [0.85, true], [0.85, false], [0.6, true], [0.4, true],
  ].map(([s, acting]) => ({ s, correct: true, positive: true, optionCount: 3, bucketValue: s, acting }));
  assert.deepEqual(coverageAtCuts(readings, [0.5, 0.8, 0.9]), [
    { cut: 0.5, n: 3, coverage: 0.6 },
    { cut: 0.8, n: 2, coverage: 0.4 },
    { cut: 0.9, n: 1, coverage: 0.2 },
  ]);
  assert.deepEqual(coverageAtCuts([], [0.5, 0.8]), [
    { cut: 0.5, n: 0, coverage: null },
    { cut: 0.8, n: 0, coverage: null },
  ]);
});

// --- optionBandAccuracy ------------------------------------------------------

test('optionBandAccuracy buckets Choice readings by option count (inclusive bands) and skips Noul readings', () => {
  const pairs = [[2, true], [3, false], [4, true], [10, true], [11, false], [50, true], [51, true], [255, true], [null, false], [256, false]];
  const readings = pairs.map(([optionCount, correct]) => ({ s: 0.7, correct, positive: true, optionCount, bucketValue: 0.7, acting: true }));
  assert.deepEqual(optionBandAccuracy(readings, TARGETS.optionBands), [
    { lo: 2, hi: 3, n: 2, correct: 1, accuracy: 0.5, wilson: wilson(1, 2) },
    { lo: 4, hi: 10, n: 2, correct: 2, accuracy: 1, wilson: wilson(2, 2) },
    { lo: 11, hi: 50, n: 2, correct: 1, accuracy: 0.5, wilson: wilson(1, 2) },
    { lo: 51, hi: 255, n: 2, correct: 2, accuracy: 1, wilson: wilson(2, 2) },
  ]);
  const [first] = optionBandAccuracy([], TARGETS.optionBands);
  assert.deepEqual(first, { lo: 2, hi: 3, n: 0, correct: 0, accuracy: null, wilson: [null, null] });
});

// --- scoreRun ----------------------------------------------------------------

test('scoreRun reports every kind, with option bands only for Choice kinds and nulls for empty kinds', () => {
  const rows = [
    row('target', 'e1', choice('e1', 0.92, 4)),
    row('target', 'e1', null, 'rate_limited'),
    row('completion', false, noul(0.1)),
    row('risk', true, noul(0.8)),
  ];
  const report = scoreRun(rows, TARGETS);
  assert.deepEqual(Object.keys(report), ['kinds']);
  assert.deepEqual(Object.keys(report.kinds), KINDS);
  for (const kind of KINDS) {
    assert.deepEqual(Object.keys(report.kinds[kind]), ['n', 'fallbacks', 'buckets', 'coverage', 'optionBands']);
    assert.equal(report.kinds[kind].buckets.length, TARGETS.confidenceBuckets.length - 1);
    assert.equal(report.kinds[kind].coverage.length, TARGETS.grid.length);
    if (CHOICE_KINDS.includes(kind)) assert.equal(report.kinds[kind].optionBands.length, TARGETS.optionBands.length);
    else assert.equal(report.kinds[kind].optionBands, null);
  }
  assert.equal(report.kinds.target.n, 1);
  assert.deepEqual(report.kinds.target.fallbacks, { rate_limited: 1 });
  const op = report.kinds.operation;
  assert.equal(op.n, 0);
  assert.ok(op.buckets.every((b) => b.n === 0 && b.accuracy === null));
  assert.ok(op.coverage.every((c) => c.coverage === null));
  assert.ok(op.optionBands.every((b) => b.accuracy === null));
  // completion p=0.1 -> bucket |0.1 - 0.5| x 2 = 0.8 -> [0.8, 0.9)
  const completionBucket = report.kinds.completion.buckets.find((b) => b.n === 1);
  assert.deepEqual([completionBucket.lo, completionBucket.hi, completionBucket.correct], [0.8, 0.9, 1]);
});

test('scoreRun rejects a row of an unknown kind with a TypeError', () => {
  assert.throws(() => scoreRun([row('bogus', true, noul(0.5))], TARGETS), TypeError);
});

// A seeded synthetic shadow run: 1,000 readings across the five kinds plus
// fallback rows. Choice confidence is roughly calibrated; Noul labels are
// drawn with probability p.
function syntheticRows(seed) {
  const rnd = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < 1000; i += 1) {
    const kind = KINDS[i % KINDS.length];
    if (CHOICE_KINDS.includes(kind)) {
      const confidence = rnd();
      const optionCount = 2 + Math.floor(rnd() * 120);
      const pick = rnd() < 0.05 ? 'none_of_the_above' : 'e1';
      const label = rnd() < confidence ? pick : 'e2';
      rows.push(row(kind, label, choice(pick, confidence, optionCount), null, `rec-${i}`));
    } else {
      const p = rnd();
      rows.push(row(kind, rnd() < p, noul(p), null, `rec-${i}`));
    }
    if (i % 37 === 0) rows.push(row(kind, kind === 'target' || kind === 'operation' ? 'e1' : true, null, i % 2 ? 'timeout' : 'busy', `fb-${i}`));
  }
  return rows;
}

// Independent recomputation of one kind's bucket table straight from rows.
function directBuckets(rows, kind, edges) {
  const out = [];
  for (let b = 0; b < edges.length - 1; b += 1) out.push({ n: 0, correct: 0 });
  for (const r of rows) {
    if (r.kind !== kind || r.decision === null) continue;
    let value;
    let correct;
    if (CHOICE_KINDS.includes(kind)) {
      value = r.decision.confidence;
      correct = r.decision.choice === r.label;
    } else {
      const { p } = r.decision;
      value = round6(Math.abs(p - 0.5) * 2);
      correct = (kind === 'completion' ? p > 0.5 : p >= 0.5) === r.label;
    }
    for (let b = 0; b < edges.length - 1; b += 1) {
      const last = b === edges.length - 2;
      if (value >= edges[b] && (last ? value <= edges[b + 1] : value < edges[b + 1])) {
        out[b].n += 1;
        if (correct) out[b].correct += 1;
        break;
      }
    }
  }
  return out;
}

test('a 1,000-reading seeded run matches a direct recomputation of every bucket', () => {
  const rows = syntheticRows(67);
  const report = scoreRun(rows, TARGETS);
  let total = 0;
  for (const kind of KINDS) {
    const expected = directBuckets(rows, kind, TARGETS.confidenceBuckets);
    const actual = report.kinds[kind].buckets;
    assert.equal(actual.length, expected.length);
    for (let b = 0; b < expected.length; b += 1) {
      assert.equal(actual[b].n, expected[b].n, `${kind} bucket ${b} n`);
      assert.equal(actual[b].correct, expected[b].correct, `${kind} bucket ${b} correct`);
      if (expected[b].n === 0) {
        assert.equal(actual[b].accuracy, null);
      } else {
        assert.equal(actual[b].accuracy, expected[b].correct / expected[b].n);
        assert.deepEqual(actual[b].wilson, wilson(expected[b].correct, expected[b].n, Z95));
      }
    }
    const n = expected.reduce((sum, b) => sum + b.n, 0);
    assert.equal(report.kinds[kind].n, n, `${kind} total`);
    total += n;
  }
  assert.equal(total, 1000);
  const fallbackTotal = KINDS.reduce((sum, k) => sum + Object.values(report.kinds[k].fallbacks).reduce((a, b) => a + b, 0), 0);
  assert.equal(fallbackTotal, rows.length - 1000);
});

test('scoreRun is deterministic and leaves its input untouched', () => {
  const rows = syntheticRows(67);
  const before = JSON.stringify(rows);
  const first = scoreRun(rows, TARGETS);
  const second = scoreRun(syntheticRows(67), TARGETS);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(rows), before);
});
