// Phase 66 benchmark statistics (D-16): known answers, a known 0.7x effect,
// an A/A null, dropped tasks, seeded determinism and the odd/even noise floor.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aaNoiseFloor,
  geoMeanMedianRatio,
  median,
  mulberry32,
  quantile,
  summarize,
  wilson,
} from '../scripts/bench/lib/stats.mjs';

// Twelve tasks of different scale with seeded uniform noise of +/- `noise`.
// Arm b is `factor` times arm a.
function syntheticTasks({ seed, factor, noise, taskCount = 12, runs = 10 }) {
  const rnd = mulberry32(seed);
  const jitter = () => 1 + noise * (2 * rnd() - 1);
  const tasks = [];
  for (let k = 0; k < taskCount; k += 1) {
    const base = 2000 + 750 * k;
    const a = [];
    const b = [];
    for (let r = 0; r < runs; r += 1) {
      a.push(base * jitter());
      b.push(base * factor * jitter());
    }
    tasks.push({ id: `task-${String(k + 1).padStart(2, '0')}`, a, b });
  }
  return tasks;
}

test('median returns the middle value, the mean of the two middle values, or NaN', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.ok(Number.isNaN(median([])));
  const input = [5, 4, 3];
  median(input);
  assert.deepEqual(input, [5, 4, 3], 'median must not sort its input in place');
});

test('quantile interpolates linearly between order statistics', () => {
  const xs = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  assert.ok(Math.abs(quantile(xs, 0.9) - 9.1) < 1e-9);
  assert.equal(quantile(xs, 0), 1);
  assert.equal(quantile(xs, 1), 10);
  assert.equal(quantile(xs, 0.5), 5.5);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});

test('summarize reports n, total, median, p90, min and max, and null (not 0) when empty', () => {
  const s = summarize([5, 1, 3]);
  assert.equal(s.n, 3);
  assert.equal(s.total, 9);
  assert.equal(s.median, 3);
  assert.ok(Math.abs(s.p90 - 4.6) < 1e-9);
  assert.equal(s.min, 1);
  assert.equal(s.max, 5);
  assert.deepEqual(summarize([]), { n: 0, total: null, median: null, p90: null, min: null, max: null });
});

test('mulberry32 is deterministic per seed and stays in [0, 1)', () => {
  const first = mulberry32(66);
  const second = mulberry32(66);
  const a = Array.from({ length: 5 }, () => first());
  const b = Array.from({ length: 5 }, () => second());
  assert.deepEqual(a, b);
  const other = mulberry32(67);
  assert.notDeepEqual(Array.from({ length: 5 }, () => other()), a);
  const rnd = mulberry32(12345);
  for (let i = 0; i < 10000; i += 1) {
    const v = rnd();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('wilson gives the 95% score interval and NaN bounds for n = 0', () => {
  const [lo, hi] = wilson(8, 10);
  assert.ok(Math.abs(lo - 0.4902) < 1e-4, `lo ${lo}`);
  assert.ok(Math.abs(hi - 0.9433) < 1e-4, `hi ${hi}`);
  const empty = wilson(0, 0);
  assert.equal(empty.length, 2);
  assert.ok(Number.isNaN(empty[0]) && Number.isNaN(empty[1]));
});

test('geoMeanMedianRatio recovers a known 0.7x effect as "faster" with the CI below 1', () => {
  const tasks = syntheticTasks({ seed: 7, factor: 0.7, noise: 0.03 });
  const result = geoMeanMedianRatio(tasks);
  assert.ok(Math.abs(result.estimate - 0.7) < 0.05, `estimate ${result.estimate}`);
  assert.equal(result.verdict, 'faster');
  assert.ok(result.ci[0] <= result.estimate && result.estimate <= result.ci[1]);
  assert.ok(result.ci[1] < 1, `ci ${result.ci}`);
  assert.equal(result.usedTasks.length, 12);
  assert.deepEqual(result.droppedTasks, []);
});

test('geoMeanMedianRatio reports an A/A comparison as "inconclusive" with a CI straddling 1', () => {
  const tasks = syntheticTasks({ seed: 11, factor: 1, noise: 0.2 });
  const result = geoMeanMedianRatio(tasks);
  assert.ok(result.ci[0] < 1 && 1 < result.ci[1], `ci ${result.ci}`);
  assert.equal(result.verdict, 'inconclusive');
});

test('a task with no completed run in an arm is dropped and listed', () => {
  const tasks = syntheticTasks({ seed: 7, factor: 0.7, noise: 0.03, taskCount: 4 });
  const withEmpty = [...tasks, { id: 'no-b-runs', a: [1000, 1100, 1050], b: [] }];
  const result = geoMeanMedianRatio(withEmpty, { iterations: 500 });
  assert.deepEqual(result.droppedTasks, ['no-b-runs']);
  assert.deepEqual(result.usedTasks, tasks.map((t) => t.id));
  const without = geoMeanMedianRatio(tasks, { iterations: 500 });
  assert.equal(result.estimate, without.estimate);
});

test('the same seed gives deep-equal results; defaults are 10000 iterations and seed 66', () => {
  const tasks = syntheticTasks({ seed: 3, factor: 0.9, noise: 0.1 });
  const first = geoMeanMedianRatio(tasks);
  const second = geoMeanMedianRatio(tasks);
  assert.deepEqual(first, second);
  assert.equal(first.iterations, 10000);
  assert.equal(first.seed, 66);
  const explicit = geoMeanMedianRatio(tasks, { iterations: 10000, seed: 66, level: 0.95 });
  assert.deepEqual(explicit, first);
  const reseeded = geoMeanMedianRatio(tasks, { seed: 67 });
  assert.equal(reseeded.seed, 67);
  assert.equal(reseeded.estimate, first.estimate, 'the point estimate does not depend on the seed');
  assert.notDeepEqual(reseeded.ci, first.ci);
});

test('aaNoiseFloor splits odd and even rounds and labels the result', () => {
  const rnd = mulberry32(21);
  const tasks = [];
  for (let k = 0; k < 12; k += 1) {
    const base = 1500 + 500 * k;
    const runs = [];
    for (let round = 1; round <= 10; round += 1) runs.push({ round, wallMs: base * (1 + 0.2 * (2 * rnd() - 1)) });
    tasks.push({ id: `aa-${k + 1}`, runs });
  }
  const floor = aaNoiseFloor(tasks, { iterations: 2000 });
  assert.equal(floor.label, 'A/A odd-vs-even rounds');
  const manual = geoMeanMedianRatio(tasks.map((t) => ({
    id: t.id,
    a: t.runs.filter((r) => r.round % 2 === 1).map((r) => r.wallMs),
    b: t.runs.filter((r) => r.round % 2 === 0).map((r) => r.wallMs),
  })), { iterations: 2000 });
  const { label, ...rest } = floor;
  assert.deepEqual(rest, manual);
  assert.ok(floor.ci[0] < 1 && 1 < floor.ci[1], `ci ${floor.ci}`);
  assert.equal(floor.verdict, 'inconclusive');
});

test('aaNoiseFloor drops tasks that lack either half', () => {
  const tasks = [
    { id: 'both', runs: [{ round: 1, wallMs: 1000 }, { round: 2, wallMs: 1010 }, { round: 3, wallMs: 990 }, { round: 4, wallMs: 1005 }] },
    { id: 'odd-only', runs: [{ round: 1, wallMs: 1000 }, { round: 3, wallMs: 1020 }] },
    { id: 'even-only', runs: [{ round: 2, wallMs: 1000 }] },
    { id: 'empty', runs: [] },
  ];
  const floor = aaNoiseFloor(tasks, { iterations: 200 });
  assert.deepEqual(floor.usedTasks, ['both']);
  assert.deepEqual(floor.droppedTasks, ['odd-only', 'even-only', 'empty']);
  assert.equal(floor.label, 'A/A odd-vs-even rounds');
});
