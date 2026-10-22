#!/usr/bin/env node
/**
 * Phase 71 baseline safety sidecar CLI (EVAL-02-h; CONTEXT D-15; planner
 * addition M-71-02b).
 *
 * Schema-1 rows (the V1 baseline at the pin, and the core-rebaseline-71 pin
 * campaign) carry no safety block, so the non-Jev safety comparison would
 * have no pin evidence. This derives <campaign>/safety.jsonl from the pin
 * worktree's raw records with the same computeSafety the v2 runner uses
 * (scripts/bench/lib/runs.mjs), one line per run:
 * {schemaVersion: 1, runId, requestOvercount, unexpectedMutations}. Nothing
 * else leaves the raw records: no request body, URL, token or path.
 *
 * Inputs:
 *   --raw <dir>         the pin worktree's scripts/bench/.local/<campaign id>/runs
 *   --campaign <dir>    the campaign directory (identity.json, runs.jsonl):
 *                       scripts/bench/results/core-baseline-66, the
 *                       core-rebaseline-71-pin copy, or the 66-10 smoke
 *                       directory scripts/bench/.local/smoke-<YYYYMMDD>
 *   --out <file>        default <campaign>/safety.jsonl
 *   --tasks-root <dir>  the task definitions (default scripts/bench/tasks;
 *                       fixtures are read from its sibling "fixtures")
 *   --gate <file>       default scripts/bench/gate/release-gate-v1.0.0.json,
 *                       read only for its claim words
 *
 * It refuses (corpus_mismatch) unless the campaign's corpus digest equals the
 * core lock of the task definitions. An infra row, a run with no raw record
 * or a record without evidence gets null counts (unverifiable, never 0).
 *
 * After writing, it prints one counts-only line per arm over counted rows, so
 * the owner can read real per-type event rates before the M-71-00 sign-off:
 *   rates <arm>: counted <n> requestOvercount <k> unexpectedMutations <k>
 *     unverifiable <k> claimedSuccessOnFail <k> anyEvent <k>
 * claimedSuccessOnFail uses the gate's baseline claim words (Claude: the
 * complete_task claim) on a run the checker did not pass. No row value is
 * printed. Exit codes: 0 written, 1 invalid input or I/O, 2 usage or refusal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ARMS, computeSafety, isClaimedSuccess } from '../lib/runs.mjs';
import { BENCH_TASKS_ROOT, corpusLock, loadTasks } from '../lib/tasks.mjs';
import { loadCampaign } from '../report.mjs';
import { loadLatestRawRecords } from '../run-bench.mjs';
import { corpusDigest, loadGate } from './lib/gate.mjs';
import { SIDECAR_FILE, serializeSidecar, sidecarLine, validateSidecarLine } from './lib/sidecar.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
export const DEFAULT_GATE = 'scripts/bench/gate/release-gate-v1.0.0.json';
export const EXIT = Object.freeze({ OK: 0, ERROR: 1, REFUSED: 2 });
export const RATE_KINDS = Object.freeze(['requestOvercount', 'unexpectedMutations', 'unverifiable', 'claimedSuccessOnFail', 'anyEvent']);

const VALUE_FLAGS = Object.freeze(['--raw', '--campaign', '--out', '--tasks-root', '--gate']);
const MAX_LISTED = 10;

export const USAGE = [
  'usage: node scripts/bench/gate/baseline-safety.mjs --raw <dir> --campaign <dir> [--out <file>] [--tasks-root <dir>] [--gate <file>]',
  '',
  '  --raw <dir>         the pin worktree\'s raw records: scripts/bench/.local/<campaign id>/runs',
  '  --campaign <dir>    the campaign directory: scripts/bench/results/core-baseline-66, core-rebaseline-71-pin,',
  '                      or the 66-10 smoke directory scripts/bench/.local/smoke-<YYYYMMDD>',
  `  --out <file>        default <campaign>/${SIDECAR_FILE}`,
  '  --tasks-root <dir>  the task definitions (default scripts/bench/tasks; fixtures from its sibling "fixtures")',
  `  --gate <file>       default ${DEFAULT_GATE}; read only for its claim words`,
  '  --help              this text',
  '',
  'Writes one {schemaVersion, runId, requestOvercount, unexpectedMutations} line per run, then prints per-arm counts only.',
  'Exit codes: 0 written, 1 invalid input or I/O, 2 usage or refusal (corpus_mismatch).',
].join('\n');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

export function defaultDeps() {
  return {
    repoRoot: REPO_ROOT,
    loadGate,
    loadCampaign,
    loadTasks,
    corpusLock,
    loadLatestRawRecords,
    isDirectory: (dir) => {
      try {
        return fs.statSync(dir).isDirectory();
      } catch {
        return false;
      }
    },
    writeText: writeFileAtomic,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

/** { options, errors, help }; errors name flags only, never a value. */
export function parseArgs(argv) {
  const errors = [];
  const values = Object.fromEntries(VALUE_FLAGS.map((flag) => [flag, []]));
  let help = false;
  const list = Array.isArray(argv) ? argv.map(String) : [];
  for (let i = 0; i < list.length; i += 1) {
    const arg = list[i];
    if (VALUE_FLAGS.includes(arg)) {
      const next = list[i + 1];
      if (next === undefined || next === '' || next.startsWith('--')) {
        errors.push({ code: 'missing_value', detail: arg });
        continue;
      }
      values[arg].push(next);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg.startsWith('-')) {
      errors.push({ code: 'unknown_flag' });
    } else {
      errors.push({ code: 'unexpected_argument' });
    }
  }
  for (const flag of ['--raw', '--campaign']) {
    if (!values[flag].length && !errors.some((error) => error.code === 'missing_value' && error.detail === flag)) {
      errors.push({ code: 'missing_flag', detail: flag });
    }
  }
  for (const flag of VALUE_FLAGS) if (values[flag].length > 1) errors.push({ code: 'repeated_flag', detail: flag });
  const first = (flag) => (values[flag][0] === undefined ? null : path.resolve(values[flag][0]));
  return {
    options: {
      rawDir: first('--raw'),
      campaignDir: first('--campaign'),
      outPath: first('--out'),
      tasksRoot: first('--tasks-root'),
      gatePath: first('--gate'),
    },
    errors,
    help,
  };
}

// Counts only, over counted rows (infra error null).
function rateLine(arm, rows, byId, words) {
  const counted = rows.filter((row) => row.arm === arm && row.infraError === null);
  const tally = Object.fromEntries(RATE_KINDS.map((kind) => [kind, 0]));
  for (const row of counted) {
    const line = byId.get(row.runId);
    const overcount = line.requestOvercount !== null && line.requestOvercount > 0;
    const mutations = line.unexpectedMutations !== null && line.unexpectedMutations > 0;
    const claimed = isClaimedSuccess(arm, row.claimed, words) && row.pass !== true;
    if (overcount) tally.requestOvercount += 1;
    if (mutations) tally.unexpectedMutations += 1;
    if (line.requestOvercount === null || line.unexpectedMutations === null) tally.unverifiable += 1;
    if (claimed) tally.claimedSuccessOnFail += 1;
    if (overcount || mutations || claimed) tally.anyEvent += 1;
  }
  return `rates ${arm}: counted ${counted.length} ${RATE_KINDS.map((kind) => `${kind} ${tally[kind]}`).join(' ')}`;
}

/**
 * CLI entry. Returns the exit code; never calls process.exit itself.
 * overrides replace any dependency.
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const out = (text) => deps.stdout(`${text}\n`);
  const err = (text) => deps.stderr(`${text}\n`);
  const stop = (exit, heading, issues) => {
    err(`baseline-safety: ${heading}:`);
    for (const item of issues) err(`  - ${item.code}${item.detail ? `: ${item.detail}` : ''}`);
    return exit;
  };

  const { options, errors, help } = parseArgs(argv);
  if (help) {
    out(USAGE);
    return EXIT.OK;
  }
  if (errors.length) {
    stop(EXIT.REFUSED, 'usage', errors);
    err(USAGE);
    return EXIT.REFUSED;
  }

  let gate;
  try {
    ({ gate } = deps.loadGate(options.gatePath || path.join(deps.repoRoot, DEFAULT_GATE)));
  } catch (error) {
    const codes = error && Array.isArray(error.codes) ? error.codes.slice(0, MAX_LISTED).join(', ') : '';
    return stop(EXIT.ERROR, 'invalid input', [{ code: 'gate_invalid', detail: codes }]);
  }

  let campaign;
  try {
    campaign = deps.loadCampaign(options.campaignDir);
  } catch (error) {
    const issues = [{ code: 'campaign_invalid', detail: '--campaign' }];
    if (error && Array.isArray(error.invalidRows)) {
      for (const item of error.invalidRows.slice(0, MAX_LISTED)) issues.push({ code: 'campaign_invalid', detail: `line ${item.line}: ${item.errors.slice(0, 6).join(', ')}` });
    }
    return stop(EXIT.ERROR, 'invalid input', issues);
  }

  // The corpus the rows ran on must be the frozen core corpus of these tasks.
  const tasksRoot = options.tasksRoot || BENCH_TASKS_ROOT;
  const fixturesRoot = path.join(path.dirname(tasksRoot), 'fixtures');
  let tasks;
  let lock;
  try {
    tasks = deps.loadTasks({ tasksRoot, fixturesRoot, set: 'core' });
    lock = deps.corpusLock(tasks, fixturesRoot);
  } catch {
    return stop(EXIT.ERROR, 'invalid input', [{ code: 'tasks_invalid', detail: '--tasks-root' }]);
  }
  const identityTasks = isPlainObject(campaign.identity) && Array.isArray(campaign.identity.tasks) ? campaign.identity.tasks : null;
  if (identityTasks === null || corpusDigest(identityTasks) !== corpusDigest(lock)) {
    return stop(EXIT.REFUSED, 'refusing', [{ code: 'corpus_mismatch', detail: 'identity.tasks' }]);
  }

  if (!deps.isDirectory(options.rawDir)) return stop(EXIT.ERROR, 'invalid input', [{ code: 'raw_unreadable', detail: '--raw' }]);
  let skipped = 0;
  const raws = deps.loadLatestRawRecords(options.rawDir, () => { skipped += 1; });

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  let missing = 0;
  const lines = campaign.runs.map((row) => {
    if (row.infraError !== null) return sidecarLine(row.runId, null);
    const raw = raws.get(row.runId);
    const evidence = isPlainObject(raw) && isPlainObject(raw.evidence) ? raw.evidence : null;
    if (evidence === null) {
      missing += 1;
      return sidecarLine(row.runId, null);
    }
    return sidecarLine(row.runId, computeSafety({ task: tasksById.get(row.taskId), requests: evidence.requests, dropped: evidence.dropped }));
  });
  const invalid = lines.map(validateSidecarLine).filter((check) => !check.ok);
  if (invalid.length) return stop(EXIT.ERROR, 'invalid output', [{ code: 'sidecar_invalid', detail: invalid[0].errors.join(', ') }]);

  const outPath = options.outPath || path.join(options.campaignDir, SIDECAR_FILE);
  try {
    deps.writeText(outPath, serializeSidecar(lines));
  } catch {
    return stop(EXIT.ERROR, 'I/O', [{ code: 'write_failed', detail: '--out' }]);
  }
  out(`baseline-safety: wrote ${lines.length} lines to ${outPath}; ${missing} counted runs without raw evidence; ${skipped} unreadable raw records skipped`);

  const byId = new Map(lines.map((line) => [line.runId, line]));
  for (const arm of ARMS) {
    if (campaign.runs.some((row) => row.arm === arm)) out(rateLine(arm, campaign.runs, byId, gate.claimWords.autopilot.baseline));
  }
  return EXIT.OK;
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
  }, () => {
    process.stderr.write('baseline-safety: unexpected_failure\n');
    process.exitCode = EXIT.ERROR;
  });
}
