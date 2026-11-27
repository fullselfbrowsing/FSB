/**
 * Phase 67 Jev shadow scoring (D-27).
 *
 * Pure: the same rows always give the same report, and nothing here reads the
 * clock, the environment or the filesystem.
 *
 * Every Jev answer becomes one reading on a single signal axis `s` in [0, 1],
 * larger meaning a stronger act-or-tighten signal:
 * - operation, target: s = confidence;
 * - completion (veto): s = 1 - p (p is the probability the task is done);
 * - stuck, risk: s = p.
 *
 * Reports per kind: accuracy by confidence bucket with Wilson intervals
 * (a Noul's bucket is |p - 0.5| x 2), coverage at every grid cut, and, for
 * Choice kinds, accuracy by option-count band. Empty data is null, never 0.
 *
 * Harness row (plan 67-12 writes it):
 *   {recordId, taskId, kind, label, decision, fallback}
 *   decision is {choice, confidence, optionCount} or {p}, or null exactly when
 *   fallback is a reason string.
 *
 * Reading: {s, correct, positive, optionCount, bucketValue, acting}.
 * A Noul reading is `correct` when its directional answer matches the label
 * (completion: done iff p > 0.5; stuck and risk: flagged iff p >= 0.5). For
 * every reading a selection pool can hold (s >= 0.5) this is exactly "the
 * veto or flag is right", so threshold selection is unchanged, and the
 * bucket report is a true accuracy on both sides of 0.5.
 */
import { wilson } from '../../lib/stats.mjs';

const CHOICE_KINDS = Object.freeze(['operation', 'target']);
const NOUL_KINDS = Object.freeze(['completion', 'stuck', 'risk']);
const KINDS = Object.freeze([...CHOICE_KINDS, ...NOUL_KINDS]);
const NONE_OF_THE_ABOVE = 'none_of_the_above';
const Z_TWO_SIDED_95 = 1.959963984540054;

const round6 = (x) => Math.round(x * 1e6) / 1e6;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isUnit = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

function assertKind(kind) {
  if (typeof kind !== 'string' || !KINDS.includes(kind)) {
    throw new TypeError(`score: unknown Jev kind ${JSON.stringify(String(kind)).slice(0, 40)}`);
  }
}

function assertDecision(kind, decision) {
  if (!isObject(decision)) throw new TypeError(`score: ${kind} decision must be an object`);
  if (CHOICE_KINDS.includes(kind)) {
    if (typeof decision.choice !== 'string' || decision.choice.length === 0) {
      throw new TypeError(`score: ${kind} decision.choice must be a non-empty string`);
    }
    if (!isUnit(decision.confidence)) throw new TypeError(`score: ${kind} decision.confidence must be in [0, 1]`);
    if (!Number.isInteger(decision.optionCount) || decision.optionCount < 1) {
      throw new TypeError(`score: ${kind} decision.optionCount must be a positive integer`);
    }
  } else if (!isUnit(decision.p)) {
    throw new TypeError(`score: ${kind} decision.p must be in [0, 1]`);
  }
}

// The act-or-tighten signal strength of one decision.
export function signalFor(kind, decision) {
  assertKind(kind);
  assertDecision(kind, decision);
  if (CHOICE_KINDS.includes(kind)) return decision.confidence;
  return kind === 'completion' ? 1 - decision.p : decision.p;
}

function readingFor(kind, label, decision) {
  const s = signalFor(kind, decision);
  if (CHOICE_KINDS.includes(kind)) {
    if (typeof label !== 'string' || label.length === 0) {
      throw new TypeError(`score: ${kind} label must be a non-empty string`);
    }
    return {
      s,
      correct: decision.choice === label,
      positive: true,
      optionCount: decision.optionCount,
      bucketValue: decision.confidence,
      acting: decision.choice !== NONE_OF_THE_ABOVE,
    };
  }
  if (typeof label !== 'boolean') throw new TypeError(`score: ${kind} label must be a boolean`);
  const { p } = decision;
  const saysYes = kind === 'completion' ? p > 0.5 : p >= 0.5;
  return {
    s,
    correct: saysYes === label,
    positive: kind === 'completion' ? label === false : label === true,
    optionCount: null,
    bucketValue: round6(Math.abs(p - 0.5) * 2),
    acting: true,
  };
}

// Readings for one kind; fallback rows are counted by reason, never read.
export function toReadings(rows, kind) {
  assertKind(kind);
  if (!Array.isArray(rows)) throw new TypeError('score: rows must be an array');
  const readings = [];
  const counts = new Map();
  for (const r of rows) {
    if (!isObject(r)) throw new TypeError('score: every row must be an object');
    if (r.kind !== kind) continue;
    const hasDecision = r.decision !== null && r.decision !== undefined;
    const hasFallback = typeof r.fallback === 'string' && r.fallback.length > 0;
    if (hasDecision === hasFallback) {
      throw new TypeError('score: a row needs exactly one of decision and fallback');
    }
    if (hasFallback) {
      counts.set(r.fallback, (counts.get(r.fallback) || 0) + 1);
      continue;
    }
    readings.push(readingFor(kind, r.label, r.decision));
  }
  // Object.fromEntries defines own data properties, so a reason such as
  // "__proto__" stays plain data.
  const fallbacks = Object.fromEntries([...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { readings, fallbacks };
}

function assertAscending(values, label) {
  if (!Array.isArray(values) || values.length < 2) throw new TypeError(`score: ${label} needs at least two values`);
  for (let i = 0; i < values.length; i += 1) {
    if (typeof values[i] !== 'number' || !Number.isFinite(values[i])) throw new TypeError(`score: ${label} must be finite numbers`);
    if (i > 0 && !(values[i] > values[i - 1])) throw new TypeError(`score: ${label} must be strictly ascending`);
  }
}

function tally(lo, hi, n, correct, z) {
  if (n === 0) return { lo, hi, n: 0, correct: 0, accuracy: null, wilson: [null, null] };
  return { lo, hi, n, correct, accuracy: correct / n, wilson: wilson(correct, n, z) };
}

// Accuracy by confidence bucket. Buckets are [lo, hi) except the last, which
// is closed so a value on the final edge is counted.
export function bucketAccuracy(readings, edges, z = Z_TWO_SIDED_95) {
  assertAscending(edges, 'bucket edges');
  const last = edges.length - 2;
  const n = new Array(edges.length - 1).fill(0);
  const correct = new Array(edges.length - 1).fill(0);
  for (const r of readings) {
    const v = r.bucketValue;
    for (let b = 0; b <= last; b += 1) {
      if (v >= edges[b] && (b === last ? v <= edges[b + 1] : v < edges[b + 1])) {
        n[b] += 1;
        if (r.correct) correct[b] += 1;
        break;
      }
    }
  }
  return n.map((count, b) => tally(edges[b], edges[b + 1], count, correct[b], z));
}

// Share of the kind's readings that would act at each cut (acting and
// s >= cut); the denominator is every reading of the kind.
export function coverageAtCuts(readings, grid) {
  if (!Array.isArray(grid)) throw new TypeError('score: grid must be an array');
  const total = readings.length;
  return grid.map((cut) => {
    let count = 0;
    for (const r of readings) if (r.acting && r.s >= cut) count += 1;
    return { cut, n: count, coverage: total === 0 ? null : count / total };
  });
}

// Accuracy by option-count band (inclusive [lo, hi]); Choice readings only,
// so readings without an option count are skipped.
export function optionBandAccuracy(readings, bands, z = Z_TWO_SIDED_95) {
  if (!Array.isArray(bands)) throw new TypeError('score: option bands must be an array');
  return bands.map((band) => {
    if (!Array.isArray(band) || band.length !== 2) throw new TypeError('score: each option band is [lo, hi]');
    const [lo, hi] = band;
    let n = 0;
    let correct = 0;
    for (const r of readings) {
      if (!Number.isInteger(r.optionCount) || r.optionCount < lo || r.optionCount > hi) continue;
      n += 1;
      if (r.correct) correct += 1;
    }
    return tally(lo, hi, n, correct, z);
  });
}

// The whole shadow score report, one entry per kind in a fixed order.
export function scoreRun(rows, targets) {
  if (!Array.isArray(rows)) throw new TypeError('score: rows must be an array');
  if (!isObject(targets)) throw new TypeError('score: targets must be an object');
  for (const r of rows) {
    if (!isObject(r)) throw new TypeError('score: every row must be an object');
    assertKind(r.kind);
  }
  const kinds = {};
  for (const kind of KINDS) {
    const { readings, fallbacks } = toReadings(rows, kind);
    kinds[kind] = {
      n: readings.length,
      fallbacks,
      buckets: bucketAccuracy(readings, targets.confidenceBuckets),
      coverage: coverageAtCuts(readings, targets.grid),
      optionBands: CHOICE_KINDS.includes(kind) ? optionBandAccuracy(readings, targets.optionBands) : null,
    };
  }
  return { kinds };
}
