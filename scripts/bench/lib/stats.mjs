/**
 * Phase 66 benchmark statistics (D-16).
 *
 * Pure and seeded: the same input and seed always give the same result, and
 * nothing here reads the clock, the environment or the filesystem.
 *
 * The headline is the geometric mean of per-task median ratios (arm b over
 * arm a) with a hierarchical bootstrap CI: resample tasks, then runs within
 * each task. A CI that crosses 1.0 is "inconclusive". Per-task CIs are
 * descriptive only. Five runs per task is a smoke test, not a baseline.
 *
 * The A/A noise floor splits one arm's runs into odd and even rounds and runs
 * the same bootstrap; its CI width is the smallest effect a later comparison
 * can claim.
 */

export const AA_NOISE_FLOOR_LABEL = 'A/A odd-vs-even rounds';

// --- 66-RESEARCH.md Pattern 9 (verbatim) ---------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function median(xs) { const s = [...xs].sort((a, b) => a - b); const n = s.length;
  if (!n) return NaN; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
export function quantile(xs, q) { const s = [...xs].sort((a, b) => a - b); if (!s.length) return NaN;
  const h = (s.length - 1) * q; const lo = Math.floor(h); return s[lo] + (h - lo) * ((s[Math.ceil(h)] ?? s[lo]) - s[lo]); }
function resample(xs, rnd) { const out = new Array(xs.length);
  for (let i = 0; i < xs.length; i++) out[i] = xs[Math.floor(rnd() * xs.length)]; return out; }

// tasks: [{ id, a: [wallMs of completed runs], b: [wallMs of completed runs] }]; ratio = median(b)/median(a)
export function geoMeanMedianRatio(tasks, { iterations = 10000, seed = 66, level = 0.95 } = {}) {
  const usable = tasks.filter(t => t.a.length > 0 && t.b.length > 0);
  const dropped = tasks.filter(t => !(t.a.length > 0 && t.b.length > 0)).map(t => t.id);
  const logRatio = (t) => Math.log(median(t.b) / median(t.a));
  const estimate = Math.exp(usable.reduce((s, t) => s + logRatio(t), 0) / usable.length);
  const rnd = mulberry32(seed); const draws = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let k = 0; k < usable.length; k++) {                  // level 1: resample tasks
      const t = usable[Math.floor(rnd() * usable.length)];
      sum += Math.log(median(resample(t.b, rnd)) / median(resample(t.a, rnd)));   // level 2: runs within task
    }
    draws[i] = Math.exp(sum / usable.length);
  }
  const lo = quantile(draws, (1 - level) / 2), hi = quantile(draws, 1 - (1 - level) / 2);
  const verdict = lo > 1 ? 'slower' : hi < 1 ? 'faster' : 'inconclusive';    // CI crossing 1.0 => inconclusive
  return { estimate, ci: [lo, hi], verdict, usedTasks: usable.map(t => t.id), droppedTasks: dropped, iterations, seed };
}
export function wilson(successes, n, z = 1.959963984540054) {
  if (!n) return [NaN, NaN]; const p = successes / n; const d = 1 + z * z / n;
  const c = p + z * z / (2 * n); const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
// --- end Pattern 9 ---------------------------------------------------------

// Count, total, median, p90, min and max of a list of numbers. An empty list
// gives null for every statistic (never 0), so "no data" cannot read as a
// measured zero.
export function summarize(xs) {
  const n = xs.length;
  if (!n) return { n: 0, total: null, median: null, p90: null, min: null, max: null };
  let total = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const x of xs) {
    total += x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { n, total, median: median(xs), p90: quantile(xs, 0.9), min, max };
}

// A/A noise floor for one arm: tasks are [{ id, runs: [{ round, wallMs }] }].
// Odd rounds form arm a and even rounds form arm b; a task missing either
// half is dropped and listed by geoMeanMedianRatio.
export function aaNoiseFloor(tasks, opts) {
  const split = tasks.map((task) => {
    const a = [];
    const b = [];
    for (const run of task.runs || []) {
      if (!run || !Number.isInteger(run.round) || !Number.isFinite(run.wallMs)) continue;
      (Math.abs(run.round) % 2 === 1 ? a : b).push(run.wallMs);
    }
    return { id: task.id, a, b };
  });
  return { ...geoMeanMedianRatio(split, opts), label: AA_NOISE_FLOOR_LABEL };
}
