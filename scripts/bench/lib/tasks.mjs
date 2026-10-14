/**
 * Phase 66 benchmark task schema, loader and fixture hashing (D-15, D-18).
 *
 * Every task JSON passes an exact-key schema before use. Core tasks run only
 * from local fixture files served under a per-run /r/<token>/ prefix; live
 * tasks run only against absolute https URLs and are reported apart from the
 * release gate (D-15).
 *
 * A task's identity is id + version + fixtureSha256: the SHA-256 of the
 * canonical task JSON plus every fixture file's bytes, so a later run can
 * prove it measured the same task (D-18).
 *
 * Fixture paths are plain relative segments (letters, digits, '.', '_',
 * '-'). Before a file is read it must resolve inside the fixtures root both
 * lexically and after symlinks are resolved (T-66-06).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJson, sha256Hex } from './identity.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const TASK_SCHEMA_VERSION = 1;
export const TASK_SETS = Object.freeze(['core', 'live']);
export const CORE_CATEGORIES = Object.freeze(['mixed', 'click-heavy']);
export const LIVE_CATEGORIES = Object.freeze(['reading']);
export const BENCH_TASKS_ROOT = path.resolve(MODULE_DIR, '..', 'tasks');
export const BENCH_FIXTURES_ROOT = path.resolve(MODULE_DIR, '..', 'fixtures');

// Exact key sets, sorted, compared the way claude-profile.ts checks fsb.json.
const CORE_KEYS = Object.freeze([
  'category', 'fixtureFiles', 'id', 'instruction', 'schemaVersion',
  'set', 'startPath', 'success', 'timeBudgetMs', 'version',
]);
const LIVE_KEYS = Object.freeze([
  'category', 'id', 'instruction', 'schemaVersion',
  'set', 'startUrl', 'success', 'timeBudgetMs', 'version',
]);
const ANY_SET_KEYS = Object.freeze([...new Set([...CORE_KEYS, ...LIVE_KEYS])].sort());

const ID_PATTERN = /^(core|live)-[a-z0-9]+(-[a-z0-9]+)*$/;
const MARKER_NAME_PATTERN = /^[a-z0-9-]{1,40}$/;
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const REQUEST_METHODS = Object.freeze(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const REQUEST_KEYS = Object.freeze(['count', 'jsonEquals', 'kind', 'method', 'path']);
const CORE_FINAL_URL_KEYS = Object.freeze(['kind', 'pathEquals', 'queryIncludes']);
const START_URL_TOKEN = '{startUrl}';
const START_PATH_PREFIX = '/fixtures/';
const TIME_BUDGET_MS = Object.freeze({ min: 30000, max: 900000 });
const INSTRUCTION_CHARS = Object.freeze({ min: 20, max: 2000 });
const MAX_CHECKS = 20;
const MAX_REQUEST_COUNT = 100;
const MAX_MARKER_EQUALS = 200;
const MAX_TEXT_INCLUDES = 200;
const MAX_URL_CHARS = 2000;

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

function sameKeys(obj, sortedKeys) {
  return JSON.stringify(Object.keys(obj).sort()) === JSON.stringify(sortedKeys);
}

// Plain segments only: no empty, '.' or '..' segment and no character that
// needs URL encoding. Rules out '%2e%2e', backslashes and whitespace too.
function plainSegments(rel) {
  return rel.split('/').every((s) => s !== '.' && s !== '..' && PATH_SEGMENT_PATTERN.test(s));
}

const PLAIN_SEGMENTS_RULE = "must use plain segments of letters, digits, '.', '_' or '-'";

function startPathErrors(value) {
  if (typeof value !== 'string' || !value.startsWith(START_PATH_PREFIX) || !value.endsWith('.html')) {
    return ['startPath must start with /fixtures/ and end with .html'];
  }
  const errors = [];
  for (const bad of ['..', '//', '?', '#']) {
    if (value.includes(bad)) errors.push(`startPath must not contain '${bad}'`);
  }
  if (errors.length === 0 && !plainSegments(value.slice(START_PATH_PREFIX.length))) {
    errors.push(`startPath ${PLAIN_SEGMENTS_RULE}`);
  }
  return errors;
}

function fixturePathErrors(label, value) {
  if (typeof value !== 'string' || value.length === 0) return [`${label} must be a non-empty relative path`];
  if (value.startsWith('/')) return [`${label} must not start with '/'`];
  const errors = [];
  for (const bad of ['..', '//']) {
    if (value.includes(bad)) errors.push(`${label} must not contain '${bad}'`);
  }
  if (errors.length === 0 && !plainSegments(value)) errors.push(`${label} ${PLAIN_SEGMENTS_RULE}`);
  return errors;
}

// { abs, real } for a fixtures root, or null when it does not exist.
function openRoot(fixturesRoot) {
  const abs = path.resolve(String(fixturesRoot));
  try {
    const real = fs.realpathSync(abs);
    return fs.statSync(real).isDirectory() ? { abs, real } : null;
  } catch {
    return null;
  }
}

function inside(root, candidate) {
  return candidate.startsWith(root + path.sep);
}

// Resolves a checked relative fixture path to a real file inside the root:
// { file } or { error } where error names the failed rule.
function resolveFixture(root, rel) {
  const lexical = path.resolve(root.abs, ...rel.split('/'));
  if (!inside(root.abs, lexical)) return { error: 'resolves outside the fixtures root' };
  let real;
  try {
    real = fs.realpathSync(lexical);
  } catch {
    return { error: 'not found under the fixtures root' };
  }
  if (!inside(root.real, real)) return { error: 'resolves outside the fixtures root' };
  let stat;
  try {
    stat = fs.statSync(real);
  } catch {
    return { error: 'not found under the fixtures root' };
  }
  if (!stat.isFile()) return { error: 'is not a file' };
  return { file: real };
}

function startUrlErrors(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_CHARS) return ['startUrl must be an absolute https:// URL'];
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return ['startUrl must be an absolute https:// URL'];
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || !value.toLowerCase().startsWith('https://')) {
    return ['startUrl must be an absolute https:// URL'];
  }
  if (parsed.username || parsed.password) return ['startUrl must not carry credentials'];
  return [];
}

function unknownKeyErrors(check, allowed, label) {
  return Object.keys(check).filter((key) => !allowed.includes(key)).sort()
    .map((key) => `${label} has unknown key: ${key}`);
}

function requestCheckErrors(check, label) {
  const errors = unknownKeyErrors(check, REQUEST_KEYS, label);
  if (!hasOwn(check, 'method') || !hasOwn(check, 'path') || !hasOwn(check, 'count')) {
    errors.push(`${label} needs method, path and count`);
  }
  if (hasOwn(check, 'method') && !REQUEST_METHODS.includes(check.method)) {
    errors.push(`${label} method must be one of ${REQUEST_METHODS.join(', ')}`);
  }
  if (hasOwn(check, 'path')
    && !(typeof check.path === 'string' && check.path.startsWith('/') && !check.path.includes('..'))) {
    errors.push(`${label} path must start with '/' and not contain '..'`);
  }
  if (hasOwn(check, 'count')
    && !(Number.isInteger(check.count) && check.count >= 0 && check.count <= MAX_REQUEST_COUNT)) {
    errors.push(`${label} count must be an integer in 0..${MAX_REQUEST_COUNT}`);
  }
  return errors;
}

function coreFinalUrlErrors(check, label) {
  const errors = unknownKeyErrors(check, CORE_FINAL_URL_KEYS, label);
  if (!hasOwn(check, 'pathEquals')) {
    errors.push(`${label} requires pathEquals`);
  } else if (typeof check.pathEquals !== 'string' || !check.pathEquals.startsWith('/')) {
    errors.push(`${label} pathEquals must be a path starting with '/'`);
  }
  if (hasOwn(check, 'queryIncludes')) {
    const query = check.queryIncludes;
    const ok = isPlainObject(query) && Object.keys(query).length > 0
      && Object.values(query).every((v) => typeof v === 'string');
    if (!ok) errors.push(`${label} queryIncludes must be a non-empty object of string values`);
  }
  return errors;
}

function liveFinalUrlErrors(check, label) {
  if (!sameKeys(check, ['kind', 'urlIncludes'])) {
    return [`${label} must be exactly { kind, urlIncludes } for live tasks`];
  }
  if (typeof check.urlIncludes !== 'string' || check.urlIncludes.length === 0
    || check.urlIncludes.length > MAX_URL_CHARS) {
    return [`${label} urlIncludes must be 1..${MAX_URL_CHARS} characters`];
  }
  return [];
}

function markerCheckErrors(check, label) {
  if (!sameKeys(check, ['equals', 'kind', 'name'])) return [`${label} must be exactly { kind, name, equals }`];
  const errors = [];
  if (typeof check.name !== 'string' || !MARKER_NAME_PATTERN.test(check.name)) {
    errors.push(`${label} name must match ${MARKER_NAME_PATTERN.source}`);
  }
  if (typeof check.equals !== 'string' || check.equals.length > MAX_MARKER_EQUALS) {
    errors.push(`${label} equals must be a string of at most ${MAX_MARKER_EQUALS} characters`);
  }
  return errors;
}

function textCheckErrors(check, label) {
  if (!sameKeys(check, ['includes', 'kind'])) return [`${label} must be exactly { kind, includes }`];
  if (typeof check.includes !== 'string' || check.includes.length === 0
    || check.includes.length > MAX_TEXT_INCLUDES) {
    return [`${label} includes must be 1..${MAX_TEXT_INCLUDES} characters`];
  }
  return [];
}

function checkErrors(check, index, set) {
  const where = `success.all[${index}]`;
  if (!isPlainObject(check)) return [`${where} must be an object`];
  const label = `${where} (${check.kind})`;
  switch (check.kind) {
    case 'request':
      return set === 'core' ? requestCheckErrors(check, label) : [`${label} is core-only`];
    case 'finalUrl':
      return set === 'core' ? coreFinalUrlErrors(check, label) : liveFinalUrlErrors(check, label);
    case 'marker':
      return set === 'core' ? markerCheckErrors(check, label) : [`${label} is core-only`];
    case 'text':
      return set === 'live' ? textCheckErrors(check, label) : [`${label} is live-only`];
    default:
      return [`${where} has an unknown kind`];
  }
}

function successErrors(success, set) {
  if (!isPlainObject(success) || !sameKeys(success, ['all']) || !Array.isArray(success.all)) {
    return ['success must be exactly { all: [...] }'];
  }
  const checks = success.all;
  const errors = [];
  if (checks.length < 1 || checks.length > MAX_CHECKS) errors.push(`success.all must hold 1..${MAX_CHECKS} checks`);
  checks.forEach((check, index) => errors.push(...checkErrors(check, index, set)));
  return errors;
}

function fixtureFilesErrors(task, startPathOk, fixturesRoot) {
  const list = task.fixtureFiles;
  if (!Array.isArray(list) || list.length === 0) return ['fixtureFiles must be a non-empty array'];
  const errors = [];
  const seen = new Set();
  const clean = [];
  list.forEach((rel, index) => {
    const label = `fixtureFiles[${index}]`;
    const problems = fixturePathErrors(label, rel);
    if (problems.length) {
      errors.push(...problems);
      return;
    }
    if (seen.has(rel)) {
      errors.push(`${label} repeats ${rel}`);
      return;
    }
    seen.add(rel);
    clean.push({ label, rel });
  });
  if (startPathOk) {
    const startFile = task.startPath.slice(START_PATH_PREFIX.length);
    if (!seen.has(startFile)) errors.push(`fixtureFiles must include ${startFile} (the startPath file)`);
  }
  if (fixturesRoot !== undefined && fixturesRoot !== null) {
    const root = openRoot(fixturesRoot);
    if (!root) return [...errors, 'fixtures root not found'];
    for (const { label, rel } of clean) {
      const resolved = resolveFixture(root, rel);
      if (resolved.error) errors.push(`${label} ${resolved.error}: ${rel}`);
    }
  }
  return errors;
}

/**
 * Validates one task against the schema. Returns { ok, errors } and collects
 * every error. Fixture files are checked on disk only when fixturesRoot is
 * given; each must resolve to a file inside it.
 */
export function validateTask(task, options = {}) {
  if (!isPlainObject(task)) return { ok: false, errors: ['task must be a JSON object'] };
  const fixturesRoot = isPlainObject(options) ? options.fixturesRoot : undefined;
  const set = TASK_SETS.includes(task.set) ? task.set : null;
  const errors = [];

  // Exact key set. With an unknown set only keys foreign to both sets are
  // reported, since the expected set cannot be known.
  const expected = set === 'core' ? CORE_KEYS : set === 'live' ? LIVE_KEYS : null;
  const present = Object.keys(task).sort();
  if (expected) {
    for (const key of expected) if (!hasOwn(task, key)) errors.push(`missing key: ${key}`);
  }
  for (const key of present) {
    if (!(expected || ANY_SET_KEYS).includes(key)) errors.push(`unknown key: ${key}`);
  }
  const checkable = (key) => hasOwn(task, key) && (!expected || expected.includes(key));

  if (checkable('schemaVersion') && task.schemaVersion !== TASK_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${TASK_SCHEMA_VERSION}`);
  }
  if (checkable('id')) {
    if (typeof task.id !== 'string' || !ID_PATTERN.test(task.id)) {
      errors.push(`id must match ${ID_PATTERN.source}`);
    } else if (set && !task.id.startsWith(`${set}-`)) {
      errors.push(`id prefix must equal set '${set}'`);
    }
  }
  if (checkable('version') && !(Number.isSafeInteger(task.version) && task.version > 0)) {
    errors.push('version must be a positive integer');
  }
  if (checkable('set') && !set) errors.push("set must be 'core' or 'live'");
  if (set && checkable('category')) {
    const allowed = set === 'core' ? CORE_CATEGORIES : LIVE_CATEGORIES;
    if (!allowed.includes(task.category)) {
      errors.push(`category must be one of ${allowed.join(', ')} for ${set} tasks`);
    }
  }
  let startPathOk = false;
  if (set === 'core' && checkable('startPath')) {
    const problems = startPathErrors(task.startPath);
    errors.push(...problems);
    startPathOk = problems.length === 0;
  }
  if (set === 'live' && checkable('startUrl')) errors.push(...startUrlErrors(task.startUrl));
  if (checkable('instruction')) {
    const text = task.instruction;
    if (typeof text !== 'string' || text.length < INSTRUCTION_CHARS.min || text.length > INSTRUCTION_CHARS.max) {
      errors.push(`instruction must be a string of ${INSTRUCTION_CHARS.min}..${INSTRUCTION_CHARS.max} characters`);
    }
    if (typeof text === 'string' && text.split(START_URL_TOKEN).length !== 2) {
      errors.push(`instruction must contain ${START_URL_TOKEN} exactly once`);
    }
  }
  if (checkable('timeBudgetMs')) {
    const ms = task.timeBudgetMs;
    if (!(Number.isInteger(ms) && ms >= TIME_BUDGET_MS.min && ms <= TIME_BUDGET_MS.max)) {
      errors.push(`timeBudgetMs must be an integer in ${TIME_BUDGET_MS.min}..${TIME_BUDGET_MS.max}`);
    }
  }
  if (set && checkable('success')) errors.push(...successErrors(task.success, set));
  if (set === 'core' && checkable('fixtureFiles')) {
    errors.push(...fixtureFilesErrors(task, startPathOk, fixturesRoot));
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
 * Reads <tasksRoot>/<set>/*.json, validates each file (including its fixture
 * files, its <id>.json name and its set), and returns the tasks sorted by id
 * and deep-frozen. Throws one Error that lists every invalid file.
 */
export function loadTasks({ tasksRoot = BENCH_TASKS_ROOT, fixturesRoot = BENCH_FIXTURES_ROOT, set } = {}) {
  if (!TASK_SETS.includes(set)) throw new Error("loadTasks: set must be 'core' or 'live'");
  const dir = path.join(tasksRoot, set);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new Error(`benchmark task directory not readable: ${dir}`);
  }
  const names = entries.filter((entry) => entry.name.endsWith('.json')).sort((a, b) => codeUnitCompare(a.name, b.name));
  const tasks = [];
  const problems = [];
  for (const entry of names) {
    const label = `${set}/${entry.name}`;
    if (!entry.isFile()) {
      problems.push(`${label}: not a regular file`);
      continue;
    }
    let task;
    try {
      task = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
    } catch {
      problems.push(`${label}: invalid JSON`);
      continue;
    }
    const { errors } = validateTask(task, { fixturesRoot });
    if (isPlainObject(task)) {
      if (typeof task.id === 'string' && ID_PATTERN.test(task.id) && entry.name !== `${task.id}.json`) {
        errors.push(`file name must be ${task.id}.json`);
      }
      if (task.set !== set) errors.push(`set must match the directory '${set}'`);
    }
    if (errors.length) problems.push(`${label}: ${errors.join('; ')}`);
    else tasks.push(task);
  }
  if (problems.length) {
    throw new Error(`Invalid benchmark tasks under ${dir}:\n  ${problems.join('\n  ')}`);
  }
  return tasks.sort((a, b) => codeUnitCompare(a.id, b.id)).map(deepFreeze);
}

/**
 * SHA-256 over canonicalJson({ task, files }), where files lists every
 * fixture file as { path, sha256 } sorted by path. A live task has no
 * fixtures and hashes its canonical JSON alone. The hash depends on bytes
 * and relative paths only, never on where the fixtures root lives.
 */
export function fixtureSha256(task, fixturesRoot = BENCH_FIXTURES_ROOT) {
  if (!isPlainObject(task)) throw new TypeError('fixtureSha256 needs a task object');
  if (task.set === 'live') return sha256Hex(canonicalJson(task));
  if (task.set !== 'core') throw new TypeError("fixtureSha256 needs a task whose set is 'core' or 'live'");
  const list = task.fixtureFiles;
  if (!Array.isArray(list) || list.length === 0) throw new TypeError('fixtureSha256 needs a non-empty fixtureFiles array');
  const root = openRoot(fixturesRoot);
  if (!root) throw new Error('fixtures root not found');
  const files = list.map((rel, index) => {
    const label = `fixtureFiles[${index}]`;
    const problems = fixturePathErrors(label, rel);
    if (problems.length) throw new Error(problems[0]);
    const resolved = resolveFixture(root, rel);
    if (resolved.error) throw new Error(`${label} ${resolved.error}: ${rel}`);
    return { path: rel, sha256: sha256Hex(fs.readFileSync(resolved.file)) };
  }).sort((a, b) => codeUnitCompare(a.path, b.path));
  return sha256Hex(canonicalJson({ task, files }));
}

/** [{ id, version, fixtureSha256 }] for a task list, sorted by id. */
export function corpusLock(tasks, fixturesRoot = BENCH_FIXTURES_ROOT) {
  if (!Array.isArray(tasks)) throw new TypeError('corpusLock needs an array of tasks');
  return tasks
    .map((task) => ({ id: task.id, version: task.version, fixtureSha256: fixtureSha256(task, fixturesRoot) }))
    .sort((a, b) => codeUnitCompare(a.id, b.id));
}

/**
 * The task instruction with its single {startUrl} token replaced. Split and
 * join, not String.replace, so '$&'-style patterns in the URL stay literal.
 */
export function renderInstruction(task, startUrl) {
  if (!isPlainObject(task) || typeof task.instruction !== 'string') {
    throw new TypeError('renderInstruction needs a task with an instruction');
  }
  if (typeof startUrl !== 'string' || startUrl.length === 0) {
    throw new TypeError('renderInstruction needs a non-empty startUrl string');
  }
  const parts = task.instruction.split(START_URL_TOKEN);
  if (parts.length !== 2) throw new Error(`instruction must contain ${START_URL_TOKEN} exactly once`);
  return `${parts[0]}${startUrl}${parts[1]}`;
}
