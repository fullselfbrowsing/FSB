/**
 * Phase 67 labelled shadow step records (JEV-05, D-26).
 *
 * A record is one labelled step over a frozen core fixture. It lives under
 * scripts/bench/shadow/records/, outside scripts/bench/tasks/, so the frozen
 * core corpus, core.lock.json and loadTasks stay untouched (Phase 66 D-15).
 *
 * Exact keys:
 *   {schemaVersion: 1, id: 'shadow-<slug>-<nn>', provenance, task: {id,
 *    version, fixtureSha256}, step, request, labels: {operation, target,
 *    completion, stuck, risk}, note}
 *
 * - provenance is 'hand', 'recorded-llm' or 'code-outcome'.
 * - task references one entry of scripts/bench/tasks/core.lock.json, so a
 *   fixture change invalidates the record (checkLockReferences).
 * - request is a v1 Jev request exactly as the extension would send it: both
 *   the server validator and FsbJevState.validateRequest accept it, its text
 *   fields are already scrubbed and injection-filtered, its origin and path
 *   are what FsbJevState.toOriginPath gives, every recent-action target is
 *   null or a current element id, and it fits the extension's request byte
 *   budget.
 * - labels has every kind. A kind not in request.kinds is null. Otherwise
 *   operation is an offered op or none_of_the_above, target is a request
 *   element id or none_of_the_above, and completion, stuck and risk are
 *   booleans.
 * - note is a string of at most 300 code points.
 *
 * validateRecord collects every error and never throws. Nothing here writes
 * a file: the lock is read, never modified.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BENCH_TASKS_ROOT } from '../../lib/tasks.mjs';

const require = createRequire(import.meta.url);
const serverValidator = require('../../../../showcase/server/src/jev/validator.js');
const { CONTRACT } = require('../../../../showcase/server/src/jev/contract.js');
const FsbJevState = require('../../../../extension/ai/jev-state.js');

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const RECORD_SCHEMA_VERSION = 1;
export const PROVENANCES = Object.freeze(['hand', 'recorded-llm', 'code-outcome']);
export const SHADOW_RECORDS_ROOT = path.resolve(MODULE_DIR, '..', 'records');
export const CORE_LOCK_PATH = path.join(BENCH_TASKS_ROOT, 'core.lock.json');
export const RECORD_ID_PATTERN = /^shadow-[a-z0-9-]+-\d{2}$/;
export const NOTE_MAX_CHARS = 300;

const RECORD_KEYS = Object.freeze(['schemaVersion', 'id', 'provenance', 'task', 'step', 'request', 'labels', 'note']);
const TASK_KEYS = Object.freeze(['id', 'version', 'fixtureSha256']);
const LABEL_KEYS = CONTRACT.KINDS;
const NONE = CONTRACT.RESERVED_OPTION_KEY;
const TASK_ID_PATTERN = /^core-[a-z0-9]+(-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function codeUnitCompare(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function codePointLength(s) {
  return Array.from(s).length;
}

/** Pushes one error per unknown and per missing key; prefix names the nesting level. */
function keyErrors(obj, keys, prefix, errors) {
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) errors.push(`unknown key: ${prefix}${key}`);
  }
  for (const key of keys) {
    if (!hasOwn(obj, key)) errors.push(`missing key: ${prefix}${key}`);
  }
}

function taskErrors(task, errors) {
  if (!isPlainObject(task)) {
    errors.push('task must be an object');
    return;
  }
  keyErrors(task, TASK_KEYS, 'task.', errors);
  if (hasOwn(task, 'id') && (typeof task.id !== 'string' || !TASK_ID_PATTERN.test(task.id))) {
    errors.push(`task.id must match ${TASK_ID_PATTERN.source}`);
  }
  if (hasOwn(task, 'version') && !(Number.isSafeInteger(task.version) && task.version > 0)) {
    errors.push('task.version must be a positive integer');
  }
  if (hasOwn(task, 'fixtureSha256') && (typeof task.fixtureSha256 !== 'string' || !SHA256_PATTERN.test(task.fixtureSha256))) {
    errors.push('task.fixtureSha256 must be 64 lowercase hex characters');
  }
}

/** True when the extension's scrubber and injection filter leave s unchanged. */
function isSanitized(s) {
  return FsbJevState.scrubText(s) === s && FsbJevState.filterInjection(s) === s;
}

// Run only after both validators accept, so every field has its checked shape.
function sanitizedFormErrors(request, errors) {
  const { page } = request;
  const reduced = FsbJevState.toOriginPath(`${page.origin}${page.path}`);
  if (!reduced || reduced.origin !== page.origin || reduced.path !== page.path) {
    errors.push('request.page origin and path are not what the extension would send');
  }
  if (!isSanitized(page.title)) errors.push('request.page.title is not in sanitized form');
  if (!isSanitized(page.text)) errors.push('request.page.text is not in sanitized form');
  request.elements.forEach((element, index) => {
    if (!isSanitized(element.role)) errors.push(`request.elements[${index}].role is not in sanitized form`);
    if (!isSanitized(element.label)) errors.push(`request.elements[${index}].label is not in sanitized form`);
  });
  // The builder maps a recent action whose target is no longer listed to
  // null, so a sent request never carries a stale element id.
  const elementIds = new Set(request.elements.map((element) => element.id));
  request.recentActions.forEach((action, index) => {
    if (action.targetId !== null && !elementIds.has(action.targetId)) {
      errors.push(`request.recentActions[${index}].targetId must be null or a current element id`);
    }
  });
  const budget = CONTRACT.BUDGETS.requestByteBudget;
  const bytes = FsbJevState.utf8ByteLength(JSON.stringify(request));
  if (bytes > budget) errors.push(`request is ${bytes} bytes, over the ${budget}-byte request budget`);
}

function requestErrors(request, errors) {
  const server = serverValidator.validateRequest(request);
  const extension = FsbJevState.validateRequest(request);
  if (!server.ok) errors.push(`request rejected by the server validator: ${server.reason}`);
  if (!extension.ok) errors.push(`request rejected by the extension validator: ${extension.reason}`);
  if (server.ok && extension.ok) sanitizedFormErrors(request, errors);
}

function labelValueErrors(kind, value, request, errors) {
  if (kind === 'operation') {
    const offered = Array.isArray(request.offeredOps) ? request.offeredOps : [];
    if (value !== NONE && !(typeof value === 'string' && offered.includes(value))) {
      errors.push(`labels.operation must be one of request.offeredOps or ${NONE}`);
    }
  } else if (kind === 'target') {
    const ids = Array.isArray(request.elements)
      ? request.elements.filter(isPlainObject).map((element) => element.id)
      : [];
    if (value !== NONE && !(typeof value === 'string' && ids.includes(value))) {
      errors.push(`labels.target must be a request element id or ${NONE}`);
    }
  } else if (typeof value !== 'boolean') {
    errors.push(`labels.${kind} must be a boolean`);
  }
}

function labelErrors(labels, request, errors) {
  if (!isPlainObject(labels)) {
    errors.push('labels must be an object');
    return;
  }
  keyErrors(labels, LABEL_KEYS, 'labels.', errors);
  // Labels are judged against the request only when its kinds are readable;
  // a broken request is already reported by the validators.
  if (!isPlainObject(request) || !Array.isArray(request.kinds)) return;
  for (const kind of LABEL_KEYS) {
    if (!hasOwn(labels, kind)) continue;
    const value = labels[kind];
    const requested = request.kinds.includes(kind);
    if (!requested) {
      if (value !== null) errors.push(`labels.${kind} must be null because ${kind} is not in request.kinds`);
    } else if (value === null) {
      errors.push(`labels.${kind} must not be null because ${kind} is in request.kinds`);
    } else {
      labelValueErrors(kind, value, request, errors);
    }
  }
}

/**
 * Validates one record. Returns {ok, errors} and collects every error; it
 * never throws.
 */
export function validateRecord(record) {
  if (!isPlainObject(record)) return { ok: false, errors: ['record must be a JSON object'] };
  const errors = [];
  keyErrors(record, RECORD_KEYS, '', errors);

  if (hasOwn(record, 'schemaVersion') && record.schemaVersion !== RECORD_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${RECORD_SCHEMA_VERSION}`);
  }
  if (hasOwn(record, 'id') && (typeof record.id !== 'string' || !RECORD_ID_PATTERN.test(record.id))) {
    errors.push(`id must match ${RECORD_ID_PATTERN.source}`);
  }
  if (hasOwn(record, 'provenance') && !PROVENANCES.includes(record.provenance)) {
    errors.push(`provenance must be one of ${PROVENANCES.join(', ')}`);
  }
  if (hasOwn(record, 'task')) taskErrors(record.task, errors);
  if (hasOwn(record, 'step') && !(Number.isSafeInteger(record.step) && record.step >= 0)) {
    errors.push('step must be an integer >= 0');
  }
  if (hasOwn(record, 'request')) requestErrors(record.request, errors);
  if (hasOwn(record, 'labels')) labelErrors(record.labels, hasOwn(record, 'request') ? record.request : null, errors);
  if (hasOwn(record, 'note') && !(typeof record.note === 'string' && codePointLength(record.note) <= NOTE_MAX_CHARS)) {
    errors.push(`note must be a string of at most ${NOTE_MAX_CHARS} characters`);
  }
  return { ok: errors.length === 0, errors };
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Reads <recordsRoot>/*.json, validates each file (including that its name is
 * <id>.json), and returns the records sorted by id and deep-frozen. Throws one
 * Error that lists every invalid file.
 */
export function loadRecords({ recordsRoot = SHADOW_RECORDS_ROOT } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(recordsRoot, { withFileTypes: true });
  } catch {
    throw new Error(`shadow record directory not readable: ${recordsRoot}`);
  }
  const names = entries.filter((entry) => entry.name.endsWith('.json')).sort((a, b) => codeUnitCompare(a.name, b.name));
  const records = [];
  const problems = [];
  for (const entry of names) {
    if (!entry.isFile()) {
      problems.push(`${entry.name}: not a regular file`);
      continue;
    }
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(recordsRoot, entry.name), 'utf8'));
    } catch {
      problems.push(`${entry.name}: invalid JSON`);
      continue;
    }
    const { errors } = validateRecord(record);
    if (isPlainObject(record) && typeof record.id === 'string' && RECORD_ID_PATTERN.test(record.id)
      && entry.name !== `${record.id}.json`) {
      errors.push(`file name must be ${record.id}.json`);
    }
    if (errors.length) problems.push(`${entry.name}: ${errors.join('; ')}`);
    else records.push(record);
  }
  if (problems.length) {
    throw new Error(`Invalid shadow records under ${recordsRoot}:\n  ${problems.join('\n  ')}`);
  }
  return deepFreeze(records.sort((a, b) => codeUnitCompare(a.id, b.id)));
}

/** The core lock's task entries [{id, version, fixtureSha256}], read-only and deep-frozen. */
export function readCoreLock(lockPath = CORE_LOCK_PATH) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (!isPlainObject(lock) || !Array.isArray(lock.tasks)) throw new Error(`core lock has no tasks array: ${lockPath}`);
  return deepFreeze(lock.tasks);
}

/**
 * Compares each record.task with its lock entry. `lock` is the parsed lock
 * file ({tasks}) or its entry array; it defaults to core.lock.json on disk.
 * Returns {ok, errors}.
 */
export function checkLockReferences(records, lock = readCoreLock()) {
  const entries = Array.isArray(lock) ? lock : isPlainObject(lock) ? lock.tasks : null;
  if (!Array.isArray(entries)) return { ok: false, errors: ['lock must be the core lock or its tasks array'] };
  if (!Array.isArray(records)) return { ok: false, errors: ['records must be an array'] };
  const byId = new Map(entries.filter(isPlainObject).map((entry) => [entry.id, entry]));
  const errors = [];
  records.forEach((record, index) => {
    if (!isPlainObject(record) || !isPlainObject(record.task)) {
      errors.push(`records[${index}]: not a record with a task reference`);
      return;
    }
    const label = typeof record.id === 'string' ? record.id : `records[${index}]`;
    const { id, version, fixtureSha256 } = record.task;
    const entry = byId.get(id);
    if (!entry) {
      errors.push(`${label}: task.id ${String(id)} is not in the lock`);
      return;
    }
    if (version !== entry.version) {
      errors.push(`${label}: task.version ${String(version)} does not match the lock (${entry.version})`);
    }
    if (fixtureSha256 !== entry.fixtureSha256) errors.push(`${label}: task.fixtureSha256 does not match the lock`);
  });
  return { ok: errors.length === 0, errors };
}
