/**
 * Phase 71 baseline safety sidecar (EVAL-02-h; CONTEXT D-15).
 *
 * Schema-1 rows (the V1 baseline at the pin, the core-rebaseline-71 pin
 * campaign) carry no safety block, so the non-Jev safety comparison reads the
 * pin's evidence from <campaign>/safety.jsonl. baseline-safety.mjs writes it
 * from the pin worktree's raw records; evaluate-gate.mjs reads it. Both use
 * this one validator (producer/validator parity).
 *
 * One line per run: exactly {schemaVersion: 1, runId, requestOvercount,
 * unexpectedMutations}. A count is a safe non-negative integer, or null when
 * the evidence is unverifiable (never 0 for "unknown"). No request body, URL,
 * token or page text ever appears. Lines are sorted by runId.
 *
 * Pure: no clock, no environment, no filesystem.
 */

export const SIDECAR_SCHEMA_VERSION = 1;
export const SIDECAR_FILE = 'safety.jsonl';
export const SIDECAR_KEYS = Object.freeze(['schemaVersion', 'runId', 'requestOvercount', 'unexpectedMutations']);

// The committed-row runId rule (scripts/bench/lib/runs.mjs RUN_ID_PATTERN).
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const MAX_INVALID_REPORTED = 10;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

const isNullableCount = (value) => value === null || (Number.isSafeInteger(value) && value >= 0);

/** The sidecar line for one run; counts that are not safe non-negative integers become null. */
export function sidecarLine(runId, evidence) {
  const source = isPlainObject(evidence) ? evidence : {};
  return {
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    runId,
    requestOvercount: isNullableCount(source.requestOvercount) ? source.requestOvercount : null,
    unexpectedMutations: isNullableCount(source.unexpectedMutations) ? source.unexpectedMutations : null,
  };
}

/** { ok, errors } for one parsed line; errors are codes with a key, never a value. */
export function validateSidecarLine(line) {
  const errors = [];
  if (!isPlainObject(line)) return { ok: false, errors: ['type:line'] };
  for (const key of Object.keys(line)) if (!SIDECAR_KEYS.includes(key)) errors.push(`extra_key:${key}`);
  for (const key of SIDECAR_KEYS) if (!Object.prototype.hasOwnProperty.call(line, key)) errors.push(`missing_key:${key}`);
  if (Object.prototype.hasOwnProperty.call(line, 'schemaVersion') && line.schemaVersion !== SIDECAR_SCHEMA_VERSION) errors.push('type:schemaVersion');
  if (Object.prototype.hasOwnProperty.call(line, 'runId') && !(typeof line.runId === 'string' && RUN_ID_PATTERN.test(line.runId))) {
    errors.push('type:runId');
  }
  for (const key of ['requestOvercount', 'unexpectedMutations']) {
    if (Object.prototype.hasOwnProperty.call(line, key) && !isNullableCount(line[key])) errors.push(`type:${key}`);
  }
  return { ok: errors.length === 0, errors };
}

/** The file text: one JSON line per entry, sorted by runId, ending in a newline. */
export function serializeSidecar(lines) {
  const sorted = [...lines].sort((a, b) => codeUnitCompare(a.runId, b.runId));
  return sorted.map((line) => JSON.stringify(line)).join('\n') + (sorted.length ? '\n' : '');
}

/**
 * Parses sidecar text into a Map runId -> {requestOvercount,
 * unexpectedMutations}, the shape the evaluator reads. Invalid JSON, an
 * invalid line or a repeated runId is listed by line number with its codes.
 */
export function parseSidecar(text) {
  const map = new Map();
  const invalid = [];
  String(text).split('\n').forEach((raw, index) => {
    if (!raw.trim()) return;
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      invalid.push({ line: index + 1, errors: ['not_json'] });
      return;
    }
    const check = validateSidecarLine(line);
    if (!check.ok) {
      invalid.push({ line: index + 1, errors: check.errors });
      return;
    }
    if (map.has(line.runId)) {
      invalid.push({ line: index + 1, errors: ['duplicate_run_id'] });
      return;
    }
    map.set(line.runId, { requestOvercount: line.requestOvercount, unexpectedMutations: line.unexpectedMutations });
  });
  return { map, invalid: invalid.slice(0, MAX_INVALID_REPORTED), invalidCount: invalid.length };
}
