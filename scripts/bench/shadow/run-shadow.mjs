#!/usr/bin/env node
/**
 * Phase 67 Jev shadow harness (JEV-05; D-26, D-27, D-28).
 *
 *   node scripts/bench/shadow/run-shadow.mjs --gateway <url> [--pin <model>]
 *     [--records <dir>] [--targets <file>] [--out <dir>] [--run-id <id>] [--limit <n>]
 *
 * Sends every labelled shadow record's request to FSB's own gateway with the
 * real FsbJevClient (extension/ai/jev-client.js), so it evaluates exactly the
 * instrument production sends. It never talks to an upstream and holds no
 * credential: the gateway owns both.
 *
 * - --gateway must be an https URL, or an http URL on a loopback host, whose
 *   path ends with /api/jev/decide.
 * - One request is in flight at a time, so the gateway's own concurrency cap
 *   and spend ceiling still apply.
 * - Refused (exit 3) when the gateway's instrumentVersion is not the local
 *   INSTRUMENT_VERSION (tests/jev-instrument.test.js pins each version to
 *   exactly one INSTRUMENT_HASH, so the version check is sufficient) or when
 *   the served model changes during the run. Nothing is written then.
 * - Writes <out>/<runId>.jsonl (one row per record and requested kind) and
 *   <out>/<runId>.report.json (counts, scores by confidence bucket, the
 *   predeclared selection from targets.json and the candidate profile). Both
 *   are body-free: no goal, URL, title, page text or element label.
 * - The candidate profile is null unless --pin is given, the served model is
 *   in the pin's family and at least one kind is fit. Committing it is a V3
 *   human step.
 *
 * Exit codes: 0 ok, 1 failure (including a run where no decision came back),
 * 2 usage error, 3 refused.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checkLockReferences, loadRecords, SHADOW_RECORDS_ROOT } from './lib/records.mjs';
import { scoreRun, toReadings } from './lib/score.mjs';
import { loadTargets, selectAll, toProfileThresholds } from './lib/select.mjs';

const require = createRequire(import.meta.url);
require('../../../extension/ai/jev-state.js');
const FsbJevClient = require('../../../extension/ai/jev-client.js');
const { INSTRUMENT_VERSION, INSTRUMENT_HASH } = require('../../../showcase/server/src/jev/instrument.js');
const { validateProfile, servedModelInFamily } = require('../../../showcase/server/src/jev/calibration.js');
const { canonicalJson, sha256Hex } = require('../../../showcase/server/src/jev/canonical-json.js');

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const EXIT = Object.freeze({ OK: 0, FAILURE: 1, USAGE: 2, REFUSED: 3 });
export const DEFAULT_TARGETS_PATH = path.join(MODULE_DIR, 'targets.json');
export const DEFAULT_OUT_DIR = path.resolve(MODULE_DIR, '..', '.local', 'shadow');
export const GATEWAY_PATH_SUFFIX = '/api/jev/decide';

const KINDS = Object.freeze(['operation', 'target', 'completion', 'stuck', 'risk']);
const CHOICE_KINDS = Object.freeze(['operation', 'target']);
const RUN_FLAGS = Object.freeze(['--gateway', '--records', '--targets', '--out', '--run-id', '--limit', '--pin']);
const LOOPBACK_HOSTNAMES = Object.freeze(['127.0.0.1', 'localhost', '[::1]']);
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MODEL_PATTERN = /^[\x21-\x7e]{1,128}$/;
const LIMIT_PATTERN = /^[1-9][0-9]{0,5}$/;
const MAX_URL_CHARS = 2048;
const PROFILE_NOTE = 'Candidate profile from scripts/bench/shadow/run-shadow.mjs: thresholds selected with the '
  + 'committed scripts/bench/shadow/targets.json (D-27) from a live shadow run through the gateway. Review the '
  + 'run report (buckets, coverage, not-a-fit kinds) before committing it beside uncalibrated.json (V3).';

export const RUN_USAGE = 'usage: node scripts/bench/shadow/run-shadow.mjs --gateway <https URL ending in '
  + `${GATEWAY_PATH_SUFFIX}> [--pin <model>] [--records <dir>] [--targets <file>] [--out <dir>] `
  + '[--run-id <id>] [--limit <n>]';

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Text safe to echo on one terminal line: control characters removed, at most `max` characters. */
export function forEcho(value, max = 60) {
  return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, max);
}

/**
 * The normalized gateway URL, or null. Accepts an https URL, or an http URL on
 * a loopback host, with no credentials, query or fragment, whose path ends with
 * /api/jev/decide.
 */
export function checkGatewayUrl(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_URL_CHARS) return null;
  if (text.includes('?') || text.includes('#')) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') return null;
  const secure = url.protocol === 'https:';
  const loopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTNAMES.includes(url.hostname);
  if (!secure && !loopbackHttp) return null;
  if (!url.pathname.endsWith(GATEWAY_PATH_SUFFIX)) return null;
  return url.href;
}

/**
 * Raw `--flag value` / `--flag=value` map for the allowed value flags, plus
 * errors for unknown, repeated or value-less flags and stray arguments.
 */
export function parseFlags(argv, allowed) {
  const raw = {};
  const errors = [];
  const list = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < list.length; i += 1) {
    const arg = String(list[i]);
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (!allowed.includes(name)) {
      errors.push(arg.startsWith('-') ? `unknown flag ${forEcho(arg)}` : `unexpected argument ${forEcho(arg)}`);
      continue;
    }
    let value;
    if (eq > 0) {
      value = arg.slice(eq + 1);
    } else {
      value = list[i + 1];
      if (value === undefined || String(value).startsWith('--')) {
        errors.push(`${name} needs a value`);
        continue;
      }
      i += 1;
    }
    if (hasOwn(raw, name)) {
      errors.push(`${name} is given more than once`);
      continue;
    }
    raw[name] = String(value);
  }
  return { raw, errors };
}

/** The gateway URL from raw flags, pushing a fixed error (the value is never echoed). */
export function gatewayFrom(raw, errors) {
  if (!hasOwn(raw, '--gateway')) {
    errors.push('--gateway is required');
    return null;
  }
  const gateway = checkGatewayUrl(raw['--gateway']);
  if (gateway === null) {
    errors.push(`--gateway must be an https URL, or an http URL on a loopback host, whose path ends with ${GATEWAY_PATH_SUFFIX}`);
  }
  return gateway;
}

function defaultRunId(now) {
  let t = Date.now();
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    if (typeof value === 'number' && Number.isFinite(value)) t = value;
  } catch {
    // A broken clock falls back to the wall clock.
  }
  return `shadow-${new Date(t).toISOString().replace(/[:.]/g, '-')}`;
}

function pathFlag(raw, name, fallback, errors) {
  if (!hasOwn(raw, name)) return fallback;
  if (raw[name].length === 0) {
    errors.push(`${name} must not be empty`);
    return null;
  }
  return path.resolve(raw[name]);
}

/** {ok:true, options} or {ok:false, errors}. Pure apart from the default run id's clock read. */
export function parseArgs(argv, { now } = {}) {
  const { raw, errors } = parseFlags(argv, RUN_FLAGS);
  const options = {
    gateway: gatewayFrom(raw, errors),
    records: pathFlag(raw, '--records', SHADOW_RECORDS_ROOT, errors),
    targets: pathFlag(raw, '--targets', DEFAULT_TARGETS_PATH, errors),
    out: pathFlag(raw, '--out', DEFAULT_OUT_DIR, errors),
    runId: null,
    limit: null,
    pin: null,
  };
  if (hasOwn(raw, '--run-id')) {
    if (RUN_ID_PATTERN.test(raw['--run-id'])) options.runId = raw['--run-id'];
    else errors.push('--run-id must be 1-64 letters, digits, dots, dashes or underscores, starting with a letter or digit');
  }
  if (hasOwn(raw, '--limit')) {
    if (LIMIT_PATTERN.test(raw['--limit'])) options.limit = Number(raw['--limit']);
    else errors.push('--limit must be a positive integer');
  }
  if (hasOwn(raw, '--pin')) {
    if (MODEL_PATTERN.test(raw['--pin'])) options.pin = raw['--pin'];
    else errors.push('--pin must be 1-128 printable ASCII characters without spaces');
  }
  if (errors.length > 0) return { ok: false, errors };
  if (options.runId === null) options.runId = defaultRunId(now);
  return { ok: true, options };
}

/**
 * The calibrated profile for a selection, or null when no kind is fit or the
 * served model is outside the pin's family. The profile passes the server's
 * validateProfile; anything else throws, so a bad profile is never written.
 */
export function buildCandidateProfile({ selection, pin, servedModel, instrumentVersion, instrumentHash } = {}) {
  if (typeof pin !== 'string' || !servedModelInFamily(servedModel, pin)) return null;
  if (selection === null || typeof selection !== 'object') return null;
  if (!KINDS.some((kind) => hasOwn(selection, kind) && selection[kind] && selection[kind].status === 'fit')) return null;
  const thresholds = toProfileThresholds(selection);
  const digest = sha256Hex(canonicalJson({ model: pin, snapshot: servedModel, instrumentHash, thresholds }));
  const profile = {
    schemaVersion: 1,
    profileId: `calibrated-${digest.slice(0, 16)}`,
    status: 'calibrated',
    note: PROFILE_NOTE,
    model: pin,
    snapshot: servedModel,
    instrumentVersion,
    instrumentHash,
    thresholds,
  };
  const verdict = validateProfile(profile);
  if (!verdict.ok) throw new Error(`run-shadow: the candidate profile is invalid: ${verdict.errors.join('; ')}`);
  return profile;
}

function decisionRow(kind, decision) {
  if (CHOICE_KINDS.includes(kind)) {
    return { choice: decision.choice, confidence: decision.confidence, optionCount: Object.keys(decision.probabilities).length };
  }
  return { p: decision.p };
}

function rowsFor(record, result) {
  return record.request.kinds.map((kind) => ({
    recordId: record.id,
    taskId: record.task.id,
    kind,
    label: record.labels[kind],
    decision: result.ok ? decisionRow(kind, result.decisions[kind]) : null,
    fallback: result.ok ? null : result.fallback,
  }));
}

function sortedCounts(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function safeMessage(error) {
  return forEcho(error && error.message ? error.message : error, 300);
}

/**
 * Run the harness. overrides: {fetchImpl, now, log} for tests; log is
 * console-like ({log, error}). Resolves to an exit code and never rejects.
 */
export async function main(argv = [], overrides = {}) {
  const opts = overrides && typeof overrides === 'object' ? overrides : {};
  const log = opts.log || console;
  const say = (line) => { try { log.log(line); } catch { /* a broken logger never breaks the run */ } };
  const warn = (line) => {
    try { (typeof log.error === 'function' ? log.error : log.log).call(log, line); } catch { /* ignored */ }
  };

  const parsed = parseArgs(argv, { now: opts.now });
  if (!parsed.ok) {
    for (const error of parsed.errors) warn(`run-shadow: ${error}`);
    warn(RUN_USAGE);
    return EXIT.USAGE;
  }
  const { gateway, records: recordsRoot, targets: targetsFile, out, runId, limit, pin } = parsed.options;
  const rowsFile = path.join(out, `${runId}.jsonl`);
  const reportFile = path.join(out, `${runId}.report.json`);
  if (fs.existsSync(rowsFile) || fs.existsSync(reportFile)) {
    warn(`run-shadow: run id ${runId} already has output in ${out}; choose another --run-id`);
    warn(RUN_USAGE);
    return EXIT.USAGE;
  }

  try {
    const all = loadRecords({ recordsRoot });
    const lock = checkLockReferences(all);
    if (!lock.ok) {
      warn(`run-shadow: records do not match core.lock.json: ${lock.errors.join('; ')}`);
      return EXIT.FAILURE;
    }
    const targets = loadTargets(targetsFile);
    const records = limit === null ? all.slice() : all.slice(0, limit);
    if (records.length === 0) {
      warn('run-shadow: no records to run');
      return EXIT.FAILURE;
    }

    const client = FsbJevClient.createJevClient({ endpoint: gateway, fetchImpl: opts.fetchImpl, now: opts.now });
    const rows = [];
    const fallbacks = new Map();
    let ok = 0;
    let servedModel = null;
    // Strictly sequential: one request in flight, honouring the gateway's caps.
    for (const record of records) {
      const result = await client.decide(record.request);
      if (result.ok && result.instrumentVersion !== INSTRUMENT_VERSION) {
        warn(`run-shadow: REFUSED: the gateway's instrument ${forEcho(result.instrumentVersion, 64)} is not the local `
          + `${INSTRUMENT_VERSION}; update the checkout to the deployed instrument. Nothing was written.`);
        return EXIT.REFUSED;
      }
      if (typeof result.servedModel === 'string') {
        if (servedModel === null) {
          servedModel = result.servedModel;
        } else if (result.servedModel !== servedModel) {
          warn(`run-shadow: REFUSED: mixed served models (${forEcho(servedModel, 128)} then `
            + `${forEcho(result.servedModel, 128)}); results are keyed by one served model. Nothing was written.`);
          return EXIT.REFUSED;
        }
      }
      if (result.ok) ok += 1;
      else fallbacks.set(result.fallback, (fallbacks.get(result.fallback) || 0) + 1);
      rows.push(...rowsFor(record, result));
    }

    const readingsByKind = {};
    for (const kind of KINDS) readingsByKind[kind] = toReadings(rows, kind).readings;
    const scores = scoreRun(rows, targets);
    const selection = selectAll(readingsByKind, targets);
    const candidateProfile = pin === null
      ? null
      : buildCandidateProfile({ selection, pin, servedModel, instrumentVersion: INSTRUMENT_VERSION, instrumentHash: INSTRUMENT_HASH });
    const report = {
      runId,
      servedModel,
      instrumentVersion: INSTRUMENT_VERSION,
      instrumentHash: INSTRUMENT_HASH,
      counts: { records: records.length, ok, fallbacks: sortedCounts(fallbacks) },
      scores,
      selection,
      candidateProfile,
    };

    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(rowsFile, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', { flag: 'wx' });
    fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });

    say(`run-shadow: run=${runId} records=${records.length} ok=${ok} fallbacks=${records.length - ok} `
      + `servedModel=${servedModel === null ? 'none' : forEcho(servedModel, 128)} instrument=${INSTRUMENT_VERSION}`);
    for (const kind of KINDS) say(`kind=${kind} status=${selection[kind].status} n=${scores.kinds[kind].n}`);
    if (candidateProfile !== null) {
      say(`run-shadow: candidate profile ${candidateProfile.profileId} for ${pin}; review the report before committing it`);
    } else if (pin === null) {
      say('run-shadow: candidate profile: none (no --pin)');
    } else if (!servedModelInFamily(servedModel, pin)) {
      say(`run-shadow: candidate profile: none (served model is outside the ${forEcho(pin, 128)} family)`);
    } else {
      say('run-shadow: candidate profile: none (no kind is fit)');
    }
    say(`run-shadow: wrote ${rowsFile}`);
    say(`run-shadow: wrote ${reportFile}`);
    if (ok === 0) {
      warn('run-shadow: no decision came back from the gateway; see counts.fallbacks in the report');
      return EXIT.FAILURE;
    }
    return EXIT.OK;
  } catch (error) {
    warn(`run-shadow: ERROR ${safeMessage(error)}`);
    return EXIT.FAILURE;
  }
}

const invokedPath = (() => {
  try {
    return process.argv[1] ? pathToFileURL(fs.realpathSync(process.argv[1])).href : null;
  } catch {
    return null;
  }
})();
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
