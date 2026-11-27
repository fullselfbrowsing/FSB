/**
 * Phase 70 bench mirror of the run_task fast_mode block (D-18, D-21, F10).
 *
 * A run_task that started with the fast-mode switch on returns its usual
 * result plus one key, fast_mode, built by FsbFastPath.buildFastModeBlock in
 * extension/ai/jev-fast-path.js. The runner keeps that block on the raw run
 * record as runTask.fastMode (run-bench.mjs runAutopilotArm) so V4 can count
 * how often the typed outcome agrees with the code-verified outcome checker.
 * Committed rows (runs.mjs RUN_ROW_KEYS, toCommittedRow) do not carry it.
 *
 * The three lists are copies of the extension's frozen FAST_MODE_* exports;
 * tests/bench-fast-mode-record.test.mjs fails when either side changes alone
 * (producer/validator parity). projectFastMode keeps exactly those keys,
 * closed outcomes, token-shaped codes and bounded counts, so a raw record
 * never carries page text, a URL, a label or model output.
 *
 * Pure: no imports, no clock, no filesystem, nothing runs at load.
 */

export const FAST_MODE_BLOCK_KEYS = Object.freeze([
  'outcome', 'reason', 'uncertain_unobserved', 'human_gate', 'budget_profile', 'jev',
]);

export const FAST_MODE_SUMMARY_KEYS = Object.freeze([
  'attempts', 'calls', 'fast_steps', 'jev_ms', 'calibration', 'latched', 'exhausted', 'escalations',
]);

export const FAST_MODE_OUTCOMES = Object.freeze(['done', 'ambiguous', 'blocked', 'needs_confirmation']);

const OTHER = 'other';
const TOKEN_PATTERN = /^[a-z_]{1,40}$/;
const MAX_ESCALATIONS = 64;

// Array.isArray throws on a revoked proxy; such a value is not a plain object.
function isPlainObject(value) {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  } catch {
    return false;
  }
}

// An own property's value, or null when it is missing, undefined or
// unreadable (a throwing getter or proxy trap).
function own(source, key) {
  try {
    if (!isPlainObject(source) || !Object.prototype.hasOwnProperty.call(source, key)) return null;
    const value = source[key];
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

// null stays null; a short lower-case code is kept; anything else is 'other'.
function token(value) {
  if (value === null) return null;
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : OTHER;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function isDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// The first MAX_ESCALATIONS entries with a token key and a count; {} when the
// map is missing or unreadable. '__proto__' is never a code, so it is dropped
// rather than assigned.
function projectEscalations(value) {
  const out = {};
  if (!isPlainObject(value)) return out;
  try {
    let kept = 0;
    for (const key of Object.keys(value)) {
      if (kept >= MAX_ESCALATIONS) break;
      if (key === '__proto__' || !TOKEN_PATTERN.test(key)) continue;
      const count = own(value, key);
      if (isCount(count)) {
        out[key] = count;
        kept += 1;
      }
    }
  } catch {
    return {};
  }
  return out;
}

// The jev summary, judged field by field. An unreadable count is unknown
// exposure, so it nulls the whole summary; jev_ms is null when no attempt was
// timed, so an unreadable jev_ms nulls only that field.
function projectJev(value) {
  if (!isPlainObject(value)) return null;
  const attempts = own(value, 'attempts');
  const calls = own(value, 'calls');
  const fastSteps = own(value, 'fast_steps');
  if (!isCount(attempts) || !isCount(calls) || !isCount(fastSteps)) return null;
  const jevMs = own(value, 'jev_ms');
  return {
    attempts,
    calls,
    fast_steps: fastSteps,
    jev_ms: isDuration(jevMs) ? jevMs : null,
    calibration: token(own(value, 'calibration')),
    latched: token(own(value, 'latched')),
    exhausted: token(own(value, 'exhausted')),
    escalations: projectEscalations(own(value, 'escalations')),
  };
}

function triState(value) {
  return value === true || value === false ? value : null;
}

/**
 * The fast_mode block as a fresh object with exactly FAST_MODE_BLOCK_KEYS in
 * order. Unknown keys are dropped and a missing value counts as null. Never
 * throws.
 */
export function projectFastMode(block) {
  try {
    const outcome = own(block, 'outcome');
    return {
      outcome: FAST_MODE_OUTCOMES.includes(outcome) ? outcome : OTHER,
      reason: token(own(block, 'reason')),
      uncertain_unobserved: triState(own(block, 'uncertain_unobserved')),
      human_gate: token(own(block, 'human_gate')),
      budget_profile: token(own(block, 'budget_profile')),
      jev: projectJev(own(block, 'jev')),
    };
  } catch {
    return { outcome: OTHER, reason: null, uncertain_unobserved: null, human_gate: null, budget_profile: null, jev: null };
  }
}
