#!/usr/bin/env node
/**
 * Phase 68 / Plan 08 (D-22, F5, F6) -- recorded-llm shadow records from the
 * extension's fast-mode capture ring.
 *
 * Input: the capture ring {v:1, records:[...], drops:{<reason>: n}} that the
 * service worker keeps under the internal storage key fsbJevCaptureRing on
 * armed bench runs (fast mode switched on, the internal arm key set, a
 * loopback bench fixture page). It is read from a JSON file (--input, either
 * the ring itself or {fsbJevCaptureRing: ring}) or from the bench extension
 * over the DevTools pairing (--port and --extension-id, through
 * scripts/bench/lib/cdp.mjs).
 *
 * Output: one 67-10 record per usable capture, written as <id>.json under
 * --out, which defaults to the gitignored scripts/bench/.local/shadow/recorded-llm/.
 * Nothing is ever written under scripts/bench/shadow/records/ (the committed
 * hand set, F6) or scripts/bench/tasks/ (the frozen corpus, read only), and
 * nothing leaves scripts/bench/.local/ unless --out says so.
 *
 * Each capture becomes a record like this:
 *   - the origin becomes the 67-10 stand-in http://127.0.0.1:4173 and the
 *     path loses its /r/<segment> run prefix (matched generically, so a
 *     scrubbed [REDACTED_TOKEN] segment is removed too), query and fragment;
 *   - the fixture slug maps to its core task, and the task to its
 *     {id, version, fixtureSha256} entry in core.lock.json;
 *   - the goal is the task instruction without its 'Open {startUrl}.' prefix
 *     (F5: the run token never reaches the goal);
 *   - the request is rebuilt with FsbJevState.buildRequest, asking for
 *     operation and target only; labels map through its idMap (a handle the
 *     builder dropped becomes none_of_the_above) and completion, stuck and
 *     risk are null;
 *   - provenance is 'recorded-llm' and the id is
 *     shadow-<slug>-llm<run>-<nn>, nn 01..99 per slug in capture order;
 *   - validateRecord and checkLockReferences must pass before it is written.
 * Captures that cannot become a valid record are dropped and counted by
 * reason; the ring's own drop counters are carried into the summary.
 *
 * The ring is never cleared, so each export sees every capture still in it
 * (WR-07). A capture equal to one already exported in this run (same
 * capturedAt, command, iteration and url) is dropped as 'duplicate', and
 * --since <capturedAt> exports only captures taken after that time ('not_after_since').
 * The summary ends with the newest capturedAt in the ring: pass it as --since
 * next time so a later bench run exports only its own captures.
 *
 * --arm on|off sets or removes the internal arm key over the same pairing
 * (the only key it touches) and writes no file.
 *
 * Run:
 *   node scripts/bench/shadow/export-capture.mjs --input <ring.json> [--out <dir>] [--run <id>] [--since <capturedAt>]
 *   node scripts/bench/shadow/export-capture.mjs --port <n> --extension-id <id> [--out <dir>] [--run <id>] [--since <capturedAt>]
 *   node scripts/bench/shadow/export-capture.mjs --port <n> --extension-id <id> --arm on|off
 */

'use strict';

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { closeTargets, evaluate, findExtensionWorker } from '../lib/cdp.mjs';
import { loadTasks } from '../lib/tasks.mjs';
import { checkLockReferences, readCoreLock, SHADOW_RECORDS_ROOT, validateRecord } from './lib/records.mjs';

const require = createRequire(import.meta.url);
const FsbJevState = require('../../../extension/ai/jev-state.js');

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
const BENCH_TASKS_DIR = path.resolve(REPO_ROOT, 'scripts', 'bench', 'tasks');

export const DEFAULT_OUT_DIR = 'scripts/bench/.local/shadow/recorded-llm';
export const STAND_IN_ORIGIN = 'http://127.0.0.1:4173';
export const MAX_PER_SLUG = 99;

const NONE = FsbJevState.CONTRACT.RESERVED_OPTION_KEY;
const KINDS = Object.freeze(['operation', 'target']);
const START_PREFIX = 'Open {startUrl}.';
const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost']);
const FIXTURE_PATH = /^\/r\/[^/]+(\/fixtures\/([a-z0-9-]+)\/.*)$/;
const RUN_PATTERN = /^[a-z0-9]{1,16}$/;
const EXTENSION_ID = /^[a-p]{32}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const RING_EXPRESSION = "chrome.storage.local.get(['fsbJevCaptureRing']).then((data) => data.fsbJevCaptureRing || null)";
const ARM_ON_EXPRESSION = 'chrome.storage.local.set({ fsbJevCaptureArmed: true }).then(() => true)';
const ARM_OFF_EXPRESSION = "chrome.storage.local.remove('fsbJevCaptureArmed').then(() => true)";
const EVALUATE_TIMEOUT_MS = 10000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function bump(counts, reason) {
  counts[reason] = (hasOwn(counts, reason) ? counts[reason] : 0) + 1;
}

/** The ring's own drop counters, keys and counts checked; anything else is left out. */
function ringDropsOf(ring) {
  const out = {};
  if (!isPlainObject(ring) || !isPlainObject(ring.drops)) return out;
  for (const key of Object.keys(ring.drops).sort()) {
    const count = ring.drops[key];
    if (REASON_PATTERN.test(key) && Number.isSafeInteger(count) && count >= 0) out[key] = count;
  }
  return out;
}

/** {slug, segment, path} for a loopback bench fixture URL, else null. */
function fixtureLocation(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(parsed.hostname) || parsed.port === '') return null;
  const match = FIXTURE_PATH.exec(parsed.pathname);
  if (!match) return null;
  const segment = parsed.pathname.split('/')[2];
  return { slug: match[2], segment, path: match[1] };
}

/** slug -> core task, from each task's startPath (/fixtures/<slug>/...); a slug two tasks share maps to null. */
function tasksBySlug(tasks) {
  const map = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!isPlainObject(task) || typeof task.startPath !== 'string') continue;
    const match = /^\/fixtures\/([a-z0-9-]+)\//.exec(task.startPath);
    if (!match) continue;
    map.set(match[1], map.has(match[1]) ? null : task);
  }
  return map;
}

function lockEntries(lock) {
  if (Array.isArray(lock)) return lock;
  return isPlainObject(lock) && Array.isArray(lock.tasks) ? lock.tasks : [];
}

/** The goal the hand records use: the instruction without its 'Open {startUrl}.' prefix. */
function goalOf(task) {
  if (typeof task.instruction !== 'string' || !task.instruction.startsWith(START_PREFIX)) return null;
  const goal = task.instruction.slice(START_PREFIX.length).trim();
  return goal.length > 0 && goal.indexOf('{startUrl}') === -1 ? goal : null;
}

function capturedAtOf(capture) {
  return typeof capture.capturedAt === 'number' && Number.isFinite(capture.capturedAt) ? capture.capturedAt : null;
}

/** The newest capturedAt among the ring's captures, or null. */
function newestCapturedAt(captures) {
  let newest = null;
  for (const capture of captures) {
    const at = isPlainObject(capture) ? capturedAtOf(capture) : null;
    if (at !== null && (newest === null || at > newest)) newest = at;
  }
  return newest;
}

/** The builder input of one capture, copied key by key (nothing else in the capture is used). */
function builderInputOf(capture, goal, pathname) {
  const b = capture.builderInput;
  return {
    kinds: KINDS.slice(),
    goal,
    url: STAND_IN_ORIGIN + pathname,
    title: b.title,
    visibleText: b.visibleText,
    elements: b.elements,
    vaultFilledIds: b.vaultFilledIds,
    recentActions: b.recentActions,
    offeredOps: b.offeredOps
  };
}

/** The e-id buildRequest gave a capture handle, or null when the builder dropped it. */
function elementIdFor(idMap, handle) {
  for (const id of Object.keys(idMap)) {
    if (idMap[id] === handle) return id;
  }
  return null;
}

/**
 * Turn a capture ring into 67-10 recorded-llm records. Pure: it reads no
 * file and writes none. options: {tasks (core tasks, from loadTasks), lock
 * (the parsed core lock or its tasks array), run (the id discriminator,
 * [a-z0-9]{1,16}), since (optional: export only captures whose capturedAt
 * is later than this)}.
 * @returns {{records: Object[], drops: Object, ringDrops: Object, captures: number, newestCapturedAt: (number|null)}}
 */
export function deriveRecords(ring, { tasks, lock, run, since } = {}) {
  if (typeof run !== 'string' || !RUN_PATTERN.test(run)) throw new Error('run must match [a-z0-9]{1,16}');
  if (since !== undefined && since !== null && !(Number.isSafeInteger(since) && since >= 0)) {
    throw new Error('since must be a non-negative integer capturedAt');
  }
  const captures = isPlainObject(ring) && Array.isArray(ring.records) ? ring.records : null;
  if (captures === null) throw new Error('input is not a capture ring ({v:1, records:[...], drops:{...}})');
  const bySlug = tasksBySlug(tasks);
  const entries = lockEntries(lock);
  const lockById = new Map(entries.filter(isPlainObject).map((entry) => [entry.id, entry]));
  const perSlug = new Map();
  const exported = new Set();
  const records = [];
  const drops = {};

  for (const capture of captures) {
    if (!isPlainObject(capture) || capture.v !== 1 || !isPlainObject(capture.builderInput) || !isPlainObject(capture.label)
      || !Number.isSafeInteger(capture.iteration) || capture.iteration < 1) {
      bump(drops, 'malformed');
      continue;
    }
    if (since !== undefined && since !== null && !(capturedAtOf(capture) !== null && capturedAtOf(capture) > since)) {
      bump(drops, 'not_after_since');
      continue;
    }
    const where = fixtureLocation(capture.url);
    if (where === null) {
      bump(drops, 'not_fixture_url');
      continue;
    }
    const task = bySlug.get(where.slug);
    if (!task) {
      bump(drops, bySlug.has(where.slug) ? 'ambiguous_slug' : 'unknown_slug');
      continue;
    }
    const entry = lockById.get(task.id);
    if (!entry) {
      bump(drops, 'not_in_lock');
      continue;
    }
    const goal = goalOf(task);
    if (goal === null) {
      bump(drops, 'goal_unavailable');
      continue;
    }
    const { op, target } = capture.label;
    if (typeof op !== 'string' || op.length === 0) {
      bump(drops, 'unlabelled');
      continue;
    }
    if (typeof target !== 'string' || target === 'target_unknown') {
      bump(drops, 'target_unknown');
      continue;
    }
    const built = FsbJevState.buildRequest(builderInputOf(capture, goal, where.path));
    if (!isPlainObject(built) || built.ok !== true) {
      bump(drops, 'build_' + (built && typeof built.reason === 'string' && REASON_PATTERN.test(built.reason) ? built.reason : 'failed'));
      continue;
    }
    // The same capture seen twice (a ring that repeats a record) is exported once.
    const identity = JSON.stringify([capturedAtOf(capture), Number.isSafeInteger(capture.command) ? capture.command : null,
      capture.iteration, capture.url]);
    if (exported.has(identity)) {
      bump(drops, 'duplicate');
      continue;
    }
    const nn = (perSlug.get(where.slug) || 0) + 1;
    if (nn > MAX_PER_SLUG) {
      bump(drops, 'slug_limit');
      continue;
    }
    const request = built.request;
    const operation = request.offeredOps.includes(op) ? op : NONE;
    const targetId = target === NONE ? null : elementIdFor(built.idMap, target);
    const record = {
      schemaVersion: 1,
      id: `shadow-${where.slug}-llm${run}-${String(nn).padStart(2, '0')}`,
      provenance: 'recorded-llm',
      task: { id: entry.id, version: entry.version, fixtureSha256: entry.fixtureSha256 },
      step: capture.iteration - 1,
      request,
      labels: { operation, target: targetId === null ? NONE : targetId, completion: null, stuck: null, risk: null },
      note: `recorded-llm capture: command ${Number.isSafeInteger(capture.command) ? capture.command : 1}, iteration ${capture.iteration}.`
    };
    // The run segment never reaches a record, even through page text.
    if (where.segment && JSON.stringify(record).indexOf(where.segment) !== -1) {
      bump(drops, 'token_in_record');
      continue;
    }
    if (!validateRecord(record).ok) {
      bump(drops, 'invalid_record');
      continue;
    }
    if (!checkLockReferences([record], entries).ok) {
      bump(drops, 'lock_mismatch');
      continue;
    }
    perSlug.set(where.slug, nn);
    exported.add(identity);
    records.push(record);
  }
  return { records, drops, ringDrops: ringDropsOf(ring), captures: captures.length, newestCapturedAt: newestCapturedAt(captures) };
}

// ---- CLI -------------------------------------------------------------------

const USAGE = 'usage: node scripts/bench/shadow/export-capture.mjs (--input <ring.json> | --port <n> --extension-id <id>) '
  + '[--out <dir>] [--run <id>] [--since <capturedAt>] | --port <n> --extension-id <id> --arm on|off';
const FLAGS = Object.freeze(['input', 'port', 'extension-id', 'out', 'run', 'arm', 'since']);

class UsageError extends Error {}

/**
 * Parses the CLI flags. Every flag takes a value (--flag value or
 * --flag=value). Throws a UsageError for an unknown flag, a missing value,
 * a malformed value or a combination that does not fit one mode.
 * @returns {{input, port, extensionId, out, run, arm, since}}
 */
export function parseArgs(argv) {
  const values = {};
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const arg = String(list[i]);
    if (!arg.startsWith('--')) throw new UsageError(USAGE);
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!FLAGS.includes(name) || hasOwn(values, name)) throw new UsageError(USAGE);
    let value;
    if (eq === -1) {
      value = list[i + 1];
      i += 1;
    } else {
      value = arg.slice(eq + 1);
    }
    if (typeof value !== 'string' || value === '' || value.startsWith('--')) throw new UsageError(USAGE);
    values[name] = value;
  }
  const args = {
    input: values.input || null,
    port: null,
    extensionId: values['extension-id'] || null,
    out: values.out || null,
    run: values.run || null,
    arm: values.arm || null,
    since: null
  };
  if (hasOwn(values, 'since')) {
    const since = Number(values.since);
    if (!/^\d+$/.test(values.since) || !Number.isSafeInteger(since)) throw new UsageError(USAGE);
    args.since = since;
  }
  if (hasOwn(values, 'port')) {
    const port = Number(values.port);
    if (!/^\d+$/.test(values.port) || !Number.isSafeInteger(port) || port < 1 || port > 65535) throw new UsageError(USAGE);
    args.port = port;
  }
  if (args.extensionId !== null && !EXTENSION_ID.test(args.extensionId)) throw new UsageError(USAGE);
  if (args.run !== null && !RUN_PATTERN.test(args.run)) throw new UsageError(USAGE);
  if (args.arm !== null && args.arm !== 'on' && args.arm !== 'off') throw new UsageError(USAGE);
  const cdp = args.port !== null || args.extensionId !== null;
  if (cdp && (args.port === null || args.extensionId === null)) throw new UsageError(USAGE);
  if (args.arm !== null) {
    if (!cdp || args.input !== null || args.out !== null || args.run !== null || args.since !== null) throw new UsageError(USAGE);
  } else if ((args.input !== null) === cdp) {
    throw new UsageError(USAGE);
  }
  return args;
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function readRingFile(inputPath) {
  let text;
  try {
    text = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    throw new Error('cannot read input (' + (err && err.code ? err.code : 'read failed') + ')');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Never echo the parser message: it can quote captured page text.
    throw new Error('input is not valid JSON');
  }
  return isPlainObject(parsed) && hasOwn(parsed, 'fsbJevCaptureRing') ? parsed.fsbJevCaptureRing : parsed;
}

/** Evaluate one expression in the extension's service worker; the wake tab, if one was opened, is always closed. */
async function inWorker(args, cdp, expression) {
  let worker = null;
  try {
    worker = await cdp.findExtensionWorker(args.port, args.extensionId, {});
    if (!worker || !worker.target) throw new Error('the extension service worker was not found');
    return await cdp.evaluate(worker.target, expression, { timeoutMs: EVALUATE_TIMEOUT_MS });
  } finally {
    if (worker && worker.wakeTargetId) await cdp.closeTargets(args.port, [worker.wakeTargetId]);
  }
}

function countsText(counts) {
  const keys = Object.keys(counts).sort();
  return keys.length === 0 ? 'none' : keys.map((key) => `${key}=${counts[key]}`).join(', ');
}

/**
 * Runs the CLI. overrides (tests): {findExtensionWorker, evaluate,
 * closeTargets, tasks, lock, now, cwd, log, error}. Resolves the exit code:
 * 0 done, 1 failed, 2 usage.
 */
export async function main(argv, overrides = {}) {
  const log = overrides.log || ((line) => console.log(line));
  const error = overrides.error || ((line) => console.error(line));
  const cdp = {
    findExtensionWorker: overrides.findExtensionWorker || findExtensionWorker,
    evaluate: overrides.evaluate || evaluate,
    closeTargets: overrides.closeTargets || closeTargets
  };
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    error(err instanceof UsageError ? err.message : USAGE);
    return 2;
  }
  try {
    if (args.arm !== null) {
      const ok = await inWorker(args, cdp, args.arm === 'on' ? ARM_ON_EXPRESSION : ARM_OFF_EXPRESSION);
      if (ok !== true) throw new Error('the arm key could not be written');
      log(`export-capture: capture arm ${args.arm}`);
      return 0;
    }
    const ring = args.input !== null ? readRingFile(args.input) : await inWorker(args, cdp, RING_EXPRESSION);
    if (ring === null || ring === undefined) throw new Error('no capture ring found');
    const run = args.run || Math.floor((overrides.now ? overrides.now() : Date.now())).toString(36);
    const tasks = overrides.tasks || loadTasks({ set: 'core' });
    const lock = overrides.lock || readCoreLock();
    const result = deriveRecords(ring, { tasks, lock, run, since: args.since });

    const cwd = overrides.cwd || process.cwd();
    const outDir = path.resolve(args.out !== null ? path.resolve(cwd, args.out) : path.resolve(REPO_ROOT, DEFAULT_OUT_DIR));
    if (isInside(outDir, SHADOW_RECORDS_ROOT) || isInside(outDir, BENCH_TASKS_DIR)) {
      throw new Error('--out must not be inside scripts/bench/shadow/records or scripts/bench/tasks');
    }
    const files = result.records.map((record) => path.join(outDir, `${record.id}.json`));
    const existing = files.filter((file) => fs.existsSync(file));
    if (existing.length > 0) throw new Error(`${existing.length} output file(s) already exist; choose another --run`);
    if (files.length > 0) fs.mkdirSync(outDir, { recursive: true });
    result.records.forEach((record, index) => {
      fs.writeFileSync(files[index], JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    });
    const dropped = Object.values(result.drops).reduce((sum, n) => sum + n, 0);
    log(`export-capture: ${result.records.length} written, ${dropped} dropped (${countsText(result.drops)}) of ${result.captures} captures `
      + `-> ${outDir}; ring drops: ${countsText(result.ringDrops)}; newest capturedAt: `
      + `${result.newestCapturedAt === null ? 'none' : result.newestCapturedAt}`);
    return 0;
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    error('export-capture: ERROR ' + message.replace(/\s+/g, ' ').trim());
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
