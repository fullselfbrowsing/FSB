/**
 * Phase 67 Jev shadow threshold selection (D-27, RESEARCH Pattern 11).
 *
 * Pure: the same readings and spec always give the same selection, and
 * nothing here reads the clock or the environment. The only filesystem read
 * is loadTargets(file), which loads the committed, predeclared spec.
 *
 * Readings come from score.mjs toReadings: {s, correct, positive, acting, ...}
 * on one signal axis s in [0, 1] (larger is a stronger act-or-tighten signal).
 *
 * For each kind, scan a predeclared grid of cuts. Each cut has an effective
 * threshold that puts ties on the conservative side:
 * - precision mode (operation, target, completion veto, stuck): effective
 *   threshold cut + tieBand; the pool is acting readings with s at or above
 *   it, hits are correct readings; cuts are scanned ascending, so the lowest
 *   qualifying cut (most coverage) wins;
 * - recall mode (risk): effective threshold cut - tieBand; the pool is
 *   positive readings, hits are those with s at or above it; cuts are scanned
 *   descending, so the highest qualifying cut (fewest added confirmations)
 *   wins.
 * A cut qualifies when its pool holds at least minN readings and the one-sided
 * Wilson lower bound of hits / pool, with z Bonferroni-adjusted over every cut
 * in the grid, is at or above the kind's target. A kind with no qualifying cut
 * is not_a_fit and gets no number.
 *
 * Every effective threshold and every raw profile threshold is rounded to 6
 * decimals, so 0.80 + 0.05 is exactly 0.85 and 1 - 0.9 is exactly 0.1.
 */
import fs from 'node:fs';

import { wilson } from '../../lib/stats.mjs';

const KINDS = Object.freeze(['operation', 'target', 'completion', 'stuck', 'risk']);
const MODES = Object.freeze(['precision', 'recall']);
const TOP_KEYS = Object.freeze([
  'schemaVersion', 'note', 'alpha', 'grid', 'tieBand', 'minN', 'confidenceBuckets', 'optionBands', 'kinds',
]);
const KIND_KEYS = Object.freeze(['mode', 'target']);

const round6 = (x) => Math.round(x * 1e6) / 1e6;
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isUnit = (value) => isNumber(value) && value >= 0 && value <= 1;
const quote = (key) => JSON.stringify(String(key)).slice(0, 60);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

// --- The one-sided normal quantile ---------------------------------------------

// Acklam's rational approximation to the standard-normal inverse CDF
// (relative error below 1.15e-9 over (0, 1)).
const A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
  1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
  6.680131188771972e+01, -1.328068155288572e+01];
const C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
  -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
  3.754408661907416e+00];
const P_LOW = 0.02425;
const P_HIGH = 1 - P_LOW;

function tail(q) {
  return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
    / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
}

function inverseNormalCdf(p) {
  if (p < P_LOW) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > P_HIGH) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q)
    / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}

// The z with P(Z > z) = alpha for a standard normal Z.
export function zOneSided(alpha) {
  if (!isNumber(alpha) || alpha <= 0 || alpha >= 1) {
    throw new RangeError('select: alpha must be a number in (0, 1)');
  }
  // Phi^-1(1 - alpha) = -Phi^-1(alpha); the lower tail avoids 1 - alpha cancellation.
  return -inverseNormalCdf(alpha);
}

// --- The predeclared spec ------------------------------------------------------

function checkExactKeys(obj, allowed, label, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${label} has unknown key ${quote(key)}`);
  }
  for (const key of allowed) {
    if (!hasOwn(obj, key)) errors.push(`${label} is missing key ${quote(key)}`);
  }
}

function checkGrid(t, errors) {
  if (!hasOwn(t, 'grid')) return;
  const { grid } = t;
  if (!Array.isArray(grid) || grid.length === 0) {
    errors.push('targets.grid must be a non-empty array');
    return;
  }
  const tieOk = isNumber(t.tieBand) && t.tieBand >= 0 && t.tieBand < 0.5;
  for (let i = 0; i < grid.length; i += 1) {
    const cut = grid[i];
    if (!isNumber(cut) || cut < 0.5 || cut >= 1) {
      errors.push(`targets.grid[${i}] must be a number in [0.5, 1)`);
      continue;
    }
    if (i > 0 && isNumber(grid[i - 1]) && !(cut > grid[i - 1])) {
      errors.push('targets.grid must be strictly ascending');
    }
    if (tieOk && (round6(cut + t.tieBand) > 1 || round6(cut - t.tieBand) < 0)) {
      errors.push(`targets.grid[${i}] plus or minus tieBand must stay within [0, 1]`);
    }
  }
}

function checkBuckets(t, errors) {
  if (!hasOwn(t, 'confidenceBuckets')) return;
  const edges = t.confidenceBuckets;
  if (!Array.isArray(edges) || edges.length < 2 || !edges.every(isNumber)) {
    errors.push('targets.confidenceBuckets must be an array of at least two numbers');
    return;
  }
  if (edges[0] !== 0 || edges[edges.length - 1] !== 1) {
    errors.push('targets.confidenceBuckets must start at 0 and end at 1');
  }
  for (let i = 1; i < edges.length; i += 1) {
    if (!(edges[i] > edges[i - 1])) {
      errors.push('targets.confidenceBuckets must be strictly ascending');
      break;
    }
  }
}

function checkOptionBands(t, errors) {
  if (!hasOwn(t, 'optionBands')) return;
  const bands = t.optionBands;
  if (!Array.isArray(bands) || bands.length === 0) {
    errors.push('targets.optionBands must be a non-empty array');
    return;
  }
  let previousHi = 0;
  for (let i = 0; i < bands.length; i += 1) {
    const band = bands[i];
    if (!Array.isArray(band) || band.length !== 2 || !Number.isInteger(band[0]) || !Number.isInteger(band[1])) {
      errors.push(`targets.optionBands[${i}] must be a pair of integers [lo, hi]`);
      return;
    }
    const [lo, hi] = band;
    if (lo < 1 || hi < lo) errors.push(`targets.optionBands[${i}] must satisfy 1 <= lo <= hi`);
    if (lo <= previousHi) errors.push(`targets.optionBands[${i}] must start above the previous band`);
    previousHi = hi;
  }
}

function checkKinds(t, errors) {
  if (!hasOwn(t, 'kinds')) return;
  const { kinds } = t;
  if (!isPlainObject(kinds)) {
    errors.push('targets.kinds must be an object');
    return;
  }
  checkExactKeys(kinds, KINDS, 'targets.kinds', errors);
  for (const kind of KINDS) {
    if (!hasOwn(kinds, kind)) continue;
    const entry = kinds[kind];
    const label = `targets.kinds.${kind}`;
    if (!isPlainObject(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    checkExactKeys(entry, KIND_KEYS, label, errors);
    if (hasOwn(entry, 'mode') && !MODES.includes(entry.mode)) {
      errors.push(`${label}.mode must be "precision" or "recall"`);
    }
    if (hasOwn(entry, 'target') && !(isNumber(entry.target) && entry.target > 0 && entry.target < 1)) {
      errors.push(`${label}.target must be a number in (0, 1)`);
    }
  }
}

// Exact keys at every level; returns every problem rather than the first.
export function validateTargets(targets) {
  if (!isPlainObject(targets)) return { ok: false, errors: ['targets must be a plain object'] };
  const errors = [];
  checkExactKeys(targets, TOP_KEYS, 'targets', errors);
  if (hasOwn(targets, 'schemaVersion') && targets.schemaVersion !== 1) {
    errors.push('targets.schemaVersion must be 1');
  }
  if (hasOwn(targets, 'note') && !(typeof targets.note === 'string' && targets.note.trim().length > 0)) {
    errors.push('targets.note must be a non-empty string');
  }
  if (hasOwn(targets, 'alpha') && !(isNumber(targets.alpha) && targets.alpha > 0 && targets.alpha < 0.5)) {
    errors.push('targets.alpha must be a number in (0, 0.5)');
  }
  if (hasOwn(targets, 'tieBand') && !(isNumber(targets.tieBand) && targets.tieBand >= 0 && targets.tieBand < 0.5)) {
    errors.push('targets.tieBand must be a number in [0, 0.5)');
  }
  if (hasOwn(targets, 'minN') && !(Number.isInteger(targets.minN) && targets.minN >= 1)) {
    errors.push('targets.minN must be a positive integer');
  }
  checkGrid(targets, errors);
  checkBuckets(targets, errors);
  checkOptionBands(targets, errors);
  checkKinds(targets, errors);
  return { ok: errors.length === 0, errors };
}

// Reads, validates and deep-freezes the committed spec; one aggregated Error
// on any problem.
export function loadTargets(file) {
  const text = fs.readFileSync(file, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`select: targets file ${file} is not valid JSON`);
  }
  const { ok, errors } = validateTargets(parsed);
  if (!ok) throw new Error(`select: targets file ${file} is invalid: ${errors.join('; ')}`);
  return deepFreeze(parsed);
}

// --- Selection -----------------------------------------------------------------

function assertSpec(spec) {
  if (!isPlainObject(spec)) throw new TypeError('select: spec must be an object');
  if (!MODES.includes(spec.mode)) throw new TypeError('select: spec.mode must be "precision" or "recall"');
  if (!Array.isArray(spec.grid) || spec.grid.length === 0 || !spec.grid.every(isNumber)) {
    throw new TypeError('select: spec.grid must be a non-empty array of numbers');
  }
  if (!isNumber(spec.tieBand) || spec.tieBand < 0) throw new TypeError('select: spec.tieBand must be a non-negative number');
  if (!Number.isInteger(spec.minN) || spec.minN < 1) throw new TypeError('select: spec.minN must be a positive integer');
  if (!(isNumber(spec.target) && spec.target > 0 && spec.target < 1)) {
    throw new TypeError('select: spec.target must be a number in (0, 1)');
  }
}

// One kind's cut. spec: {grid, alpha, tieBand, minN, mode, target}.
export function selectCut(readings, spec) {
  if (!Array.isArray(readings)) throw new TypeError('select: readings must be an array');
  assertSpec(spec);
  const recall = spec.mode === 'recall';
  const z = zOneSided(spec.alpha / spec.grid.length); // Bonferroni across every cut scanned
  const cuts = [...spec.grid].sort((a, b) => (recall ? b - a : a - b));
  let skipped = 0;
  for (const cut of cuts) {
    const effectiveThreshold = round6(recall ? cut - spec.tieBand : cut + spec.tieBand);
    let n = 0;
    let hits = 0;
    for (const r of readings) {
      if (recall) {
        if (r.positive !== true) continue;
        n += 1;
        if (r.s >= effectiveThreshold) hits += 1;
      } else {
        if (r.acting !== true || !(r.s >= effectiveThreshold)) continue;
        n += 1;
        if (r.correct === true) hits += 1;
      }
    }
    if (n < spec.minN) {
      skipped += 1;
      continue;
    }
    const [lower] = wilson(hits, n, z);
    if (lower >= spec.target) return { status: 'fit', cut, effectiveThreshold, n, hits, lower, z };
  }
  return {
    status: 'not_a_fit',
    effectiveThreshold: null,
    z,
    reason: skipped === cuts.length ? 'insufficient_samples' : 'no_cut_qualifies',
  };
}

// Every kind, each with its own mode and target from the validated spec.
export function selectAll(readingsByKind, targets) {
  if (!isPlainObject(readingsByKind)) throw new TypeError('select: readingsByKind must be an object');
  for (const key of Object.keys(readingsByKind)) {
    if (!KINDS.includes(key)) throw new TypeError(`select: unknown Jev kind ${quote(key)}`);
  }
  const { ok, errors } = validateTargets(targets);
  if (!ok) throw new TypeError(`select: invalid targets: ${errors.join('; ')}`);
  const selection = {};
  for (const kind of KINDS) {
    const readings = hasOwn(readingsByKind, kind) ? readingsByKind[kind] : [];
    selection[kind] = selectCut(readings, {
      grid: targets.grid,
      alpha: targets.alpha,
      tieBand: targets.tieBand,
      minN: targets.minN,
      mode: targets.kinds[kind].mode,
      target: targets.kinds[kind].target,
    });
  }
  return selection;
}

// Raw-scale thresholds for the server calibration profile (plan 67-03):
// operation, target, stuck and risk act or flag when confidence or p is at or
// above the threshold; completion vetoes when p is at or below
// 1 - effectiveThreshold. not_a_fit and missing kinds are null.
export function toProfileThresholds(selectionByKind) {
  if (!isPlainObject(selectionByKind)) throw new TypeError('select: selectionByKind must be an object');
  for (const key of Object.keys(selectionByKind)) {
    if (!KINDS.includes(key)) throw new TypeError(`select: unknown Jev kind ${quote(key)}`);
  }
  const thresholds = {};
  for (const kind of KINDS) {
    const selection = hasOwn(selectionByKind, kind) ? selectionByKind[kind] : undefined;
    if (selection === undefined) {
      thresholds[kind] = null;
      continue;
    }
    if (!isPlainObject(selection)) throw new TypeError(`select: ${kind} selection must be an object`);
    if (selection.status === 'not_a_fit') {
      if (selection.effectiveThreshold !== null) {
        throw new TypeError(`select: ${kind} is not_a_fit and must not carry a threshold`);
      }
      thresholds[kind] = null;
      continue;
    }
    if (selection.status !== 'fit') throw new TypeError(`select: ${kind} selection status must be fit or not_a_fit`);
    if (!isUnit(selection.effectiveThreshold)) {
      throw new TypeError(`select: ${kind} effectiveThreshold must be a number in [0, 1]`);
    }
    const t = selection.effectiveThreshold;
    thresholds[kind] = round6(kind === 'completion' ? 1 - t : t);
  }
  return thresholds;
}
