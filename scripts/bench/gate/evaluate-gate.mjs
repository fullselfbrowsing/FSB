#!/usr/bin/env node
/**
 * Phase 71 release gate evaluator CLI (EVAL-02; CONTEXT D-06, D-11, D-15,
 * D-17, D-18; Pitfalls 6, 7, 13).
 *
 * It needs git history, so it is NOT part of npm test; tests inject git and
 * spawn (CI uses a shallow clone, 67-VALIDATION:27).
 *
 * V4 (M-71-08) runs it once on the real campaigns:
 *   node scripts/bench/gate/evaluate-gate.mjs --gate scripts/bench/gate/release-gate-v1.0.0.json
 *     --baseline scripts/bench/results/core-baseline-66
 *     --campaign scripts/bench/results/core-gate-71-autopilot --campaign scripts/bench/results/core-gate-71-claude
 *     --verify-suites --out scripts/bench/gate/decisions/core-gate-71.json
 *
 * What it does, in order, refusing at the first failing step:
 * 1. Loads the gate through its exact-key validator (the sha256 of the raw
 *    bytes) and every campaign through report.mjs loadCampaign, which rejects
 *    any invalid row. The two --campaign directories map to the gate's
 *    autopilot and claude roles by identity.campaignId. A safety.jsonl
 *    sidecar beside the baseline (and the fallback pin) is read when present.
 * 2. Predeclaration (D-11): a commit touching the gate must exist, and the
 *    author date (kept through rebase and cherry-pick, Pitfall 6) of every
 *    commit touching it must be strictly before the createdAt of every
 *    campaign it evaluates, the V1 baseline and the fallback campaigns
 *    included. There is no override. An amend or an interactive-rebase edit
 *    also keeps the author date, so git dates cannot detect one; the
 *    candidates' recorded gate sha256 binds the gate from V4 on.
 * 3. With --verify-suites: the working tree's code must equal the measured
 *    sha (results and decisions excluded), then every tighten-only suite the
 *    gate lists runs and its exit code is recorded. Without the flag the
 *    suites are not run and the Jev safety criterion is inconclusive.
 * 4. evaluateGate (pure). Any refusal prints its codes and writes nothing.
 * 5. The decision file goes to --out and the gate report beside it as
 *    <name>.report.md, never into a campaign directory (Pitfall 13). One line
 *    per path is printed: "<path>: <verdict> -> <v6Action>".
 *
 * Output prints codes, field names and paths, never a row value or an error
 * text. Exit codes: 0 written, 1 invalid input or I/O, 2 usage or refusal.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadCampaign } from '../report.mjs';
import { DECISION_PATHS, buildDecision, describePath, validateDecision } from './lib/decision.mjs';
import { evaluateGate } from './lib/evaluate.mjs';
import { renderGateReport } from './lib/gate-report.mjs';
import { loadGate } from './lib/gate.mjs';
import { SIDECAR_FILE, parseSidecar } from './lib/sidecar.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');
export const EXIT = Object.freeze({ OK: 0, ERROR: 1, REFUSED: 2 });
export const SUITE_TIMEOUT_MS = 900000;

// The tracked code a release measures (T-71-03): a working tree that differs
// from the measured sha here is not what V4 measured. Results and decisions
// are the only outputs written after the measurement.
export const MEASURED_CODE_PATHS = Object.freeze([
  'extension', 'mcp/src', 'mcp/build', 'showcase/server', 'scripts', 'tests', 'package.json', 'package-lock.json',
  ':(exclude)scripts/bench/results', ':(exclude)scripts/bench/gate/decisions',
]);

const GIT_SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const MAX_GIT_OUTPUT = 1024 * 1024;
const MAX_SUITE_OUTPUT = 64 * 1024 * 1024;
const MAX_LISTED = 10;
const VALUE_FLAGS = Object.freeze(['--gate', '--baseline', '--campaign', '--out', '--fallback-pin', '--fallback-candidate']);
const SINGLE_VALUE_FLAGS = Object.freeze(['--gate', '--baseline', '--out', '--fallback-pin', '--fallback-candidate']);
const SWITCHES = Object.freeze(['--verify-suites', '--help']);

export const USAGE = [
  'usage: node scripts/bench/gate/evaluate-gate.mjs --gate <file> --baseline <dir> --campaign <dir> --campaign <dir>',
  '         --out <file.json> [--verify-suites] [--fallback-pin <dir> --fallback-candidate <dir>]',
  '',
  '  --gate <file>               the predeclared gate (scripts/bench/gate/release-gate-v1.0.0.json)',
  '  --baseline <dir>            the V1 baseline campaign (scripts/bench/results/core-baseline-66); its safety.jsonl is read when present',
  '  --campaign <dir>            exactly twice: the core-gate-71-autopilot and core-gate-71-claude campaigns, matched by campaign id',
  '  --out <file.json>           the decision file; the gate report goes beside it as <name>.report.md; never inside a campaign directory',
  '  --verify-suites             refuse unless the tracked code equals the measured sha, then run the gate\'s tighten-only suites',
  '                              (without it the Jev safety criterion is inconclusive)',
  '  --fallback-pin <dir>        with --fallback-candidate: the core-rebaseline-71 campaigns (gate.fallback); the pin\'s safety.jsonl',
  '  --fallback-candidate <dir>  is read like the baseline\'s',
  '  --help                      this text',
  '',
  'Needs git history: every commit touching the gate must be authored before every campaign\'s createdAt. There is no override.',
  'Exit codes: 0 written, 1 invalid input or I/O, 2 usage or refusal.',
].join('\n');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// --- Default dependencies (tests replace git and spawn) ------------------------------------------

function runGit(args, repoRoot = REPO_ROOT) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: MAX_GIT_OUTPUT,
    shell: false,
  });
  return {
    status: result.error || result.signal ? null : result.status,
    stdout: result.stdout ? Buffer.from(result.stdout).toString('utf8') : '',
  };
}

// One gate-listed suite, `node tests/...`, split on single spaces, bounded,
// with stdin closed; its output stays in memory and is never printed.
function runSuite(command, repoRoot = REPO_ROOT) {
  const [program, ...args] = command.split(' ');
  const result = spawnSync(program === 'node' ? process.execPath : program, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    timeout: SUITE_TIMEOUT_MS,
    killSignal: 'SIGTERM',
    maxBuffer: MAX_SUITE_OUTPUT,
  });
  return { status: result.error || result.signal ? null : result.status, signal: result.signal || null };
}

function writeFileAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, text);
  fs.renameSync(temp, file);
}

function writeJsonAtomic(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function defaultDeps() {
  return {
    repoRoot: REPO_ROOT,
    git: runGit,
    spawn: runSuite,
    loadGate,
    loadCampaign,
    exists: (file) => fs.existsSync(file),
    readText: (file) => fs.readFileSync(file, 'utf8'),
    writeJsonAtomic,
    writeText: writeFileAtomic,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    // undefined: the gate's bootstrap iterations. Only tests set it.
    iterations: undefined,
  };
}

// --- Arguments ------------------------------------------------------------------------------------

// The real path of p, resolving the deepest existing ancestor when p does not exist yet.
function canonical(p) {
  const abs = path.resolve(p);
  try {
    return fs.realpathSync(abs);
  } catch {
    const parent = path.dirname(abs);
    return parent === abs ? abs : path.join(canonical(parent), path.basename(abs));
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * { options, errors, help } for argv. Errors are {code, detail} with a flag
 * name as the only detail; an unknown flag or argument is never echoed.
 */
export function parseArgs(argv) {
  const errors = [];
  const values = Object.fromEntries(VALUE_FLAGS.map((flag) => [flag, []]));
  const switches = Object.fromEntries(SWITCHES.map((flag) => [flag, 0]));
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
    } else if (SWITCHES.includes(arg) || arg === '-h') {
      switches[arg === '-h' ? '--help' : arg] += 1;
    } else if (arg.startsWith('-')) {
      errors.push({ code: 'unknown_flag' });
    } else {
      errors.push({ code: 'unexpected_argument' });
    }
  }
  const help = switches['--help'] > 0;
  for (const flag of ['--gate', '--baseline', '--out']) {
    if (!values[flag].length && !errors.some((error) => error.code === 'missing_value' && error.detail === flag)) {
      errors.push({ code: 'missing_flag', detail: flag });
    }
  }
  for (const flag of SINGLE_VALUE_FLAGS) if (values[flag].length > 1) errors.push({ code: 'repeated_flag', detail: flag });
  if (switches['--verify-suites'] > 1) errors.push({ code: 'repeated_flag', detail: '--verify-suites' });
  if (values['--campaign'].length !== 2) errors.push({ code: 'campaign_count', detail: '--campaign' });
  if ((values['--fallback-pin'].length > 0) !== (values['--fallback-candidate'].length > 0)) {
    errors.push({ code: 'fallback_pair', detail: '--fallback-pin, --fallback-candidate' });
  }

  const options = {
    gatePath: values['--gate'][0] === undefined ? null : path.resolve(values['--gate'][0]),
    baselineDir: values['--baseline'][0] === undefined ? null : path.resolve(values['--baseline'][0]),
    campaignDirs: values['--campaign'].map((dir) => path.resolve(dir)),
    outPath: values['--out'][0] === undefined ? null : path.resolve(values['--out'][0]),
    verifySuites: switches['--verify-suites'] > 0,
    fallbackPin: values['--fallback-pin'][0] === undefined ? null : path.resolve(values['--fallback-pin'][0]),
    fallbackCandidate: values['--fallback-candidate'][0] === undefined ? null : path.resolve(values['--fallback-candidate'][0]),
  };
  if (options.outPath !== null) {
    if (!options.outPath.endsWith('.json')) errors.push({ code: 'out_not_json', detail: '--out' });
    const out = canonical(options.outPath);
    const dirs = [options.baselineDir, ...options.campaignDirs, options.fallbackPin, options.fallbackCandidate].filter(Boolean);
    if (dirs.some((dir) => isInside(out, canonical(dir)))) errors.push({ code: 'out_inside_campaign', detail: '--out' });
    // IN-03: a typo must never replace the frozen gate with the decision file.
    if (options.gatePath !== null && out === canonical(options.gatePath)) errors.push({ code: 'out_is_gate', detail: '--out' });
  }
  return { options, errors, help };
}

// --- Steps ----------------------------------------------------------------------------------------

function errorCodes(error) {
  return error && Array.isArray(error.codes) ? error.codes.slice(0, MAX_LISTED).join(', ') : '';
}

// Repo-relative, forward-slashed; null when the file lies outside the repo.
function repoRelative(repoRoot, file) {
  const rel = path.relative(canonical(repoRoot), canonical(file));
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function loadCampaigns(deps, sources) {
  const campaigns = {};
  const issues = [];
  for (const { key, label, dir } of sources) {
    try {
      campaigns[key] = deps.loadCampaign(dir);
    } catch (error) {
      if (error && Array.isArray(error.invalidRows)) {
        issues.push({ code: 'campaign_invalid', detail: `${label} (${error.invalidRows.length} invalid rows)` });
        for (const item of error.invalidRows.slice(0, MAX_LISTED)) {
          issues.push({ code: 'campaign_invalid', detail: `${label} line ${item.line}: ${item.errors.slice(0, 6).join(', ')}` });
        }
      } else {
        issues.push({ code: 'campaign_unreadable', detail: label });
      }
    }
  }
  return { campaigns, issues };
}

function readSidecar(deps, dir, label, issues) {
  const file = path.join(dir, SIDECAR_FILE);
  if (!deps.exists(file)) return null;
  let text;
  try {
    text = deps.readText(file);
  } catch {
    issues.push({ code: 'sidecar_unreadable', detail: label });
    return null;
  }
  const parsed = parseSidecar(text);
  for (const item of parsed.invalid) issues.push({ code: 'sidecar_invalid', detail: `${label} line ${item.line}: ${item.errors.join(', ')}` });
  return parsed.map;
}

const isIsoDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

// D-11 and Pitfall 6: the author date of EVERY commit that touched the gate
// against every createdAt (WR-03). Checking only the last commit let an
// older-authored commit on top (a cherry-pick) hide a later edit beneath it.
// The author date is kept because a rebase rewrites committer dates
// (Pitfall 6); the decision records the last commit's two dates.
export const GATE_LOG_ARGS = Object.freeze(['log', '--format=%aI%x09%cI']);

function predeclaration(deps, gateRel, dated) {
  const log = deps.git([...GATE_LOG_ARGS, '--', gateRel], deps.repoRoot);
  if (!isPlainObject(log) || log.status !== 0) return { issues: [{ code: 'git_failed', detail: 'git log' }] };
  const commits = String(log.stdout || '').split('\n').map((line) => line.trim()).filter(Boolean)
    .map((line) => line.split('\t').map((part) => part.trim()));
  if (!commits.length) return { issues: [{ code: 'gate_not_committed', detail: gateRel }] };
  if (!commits.every((parts) => parts.length === 2 && isIsoDate(parts[0]) && isIsoDate(parts[1]))) {
    return { issues: [{ code: 'git_output_invalid', detail: 'git log' }] };
  }
  const [[authorDate, committerDate]] = commits;
  const latestAuthor = Math.max(...commits.map(([author]) => Date.parse(author)));
  const issues = [];
  for (const [role, campaign] of dated) {
    const createdAt = isPlainObject(campaign.identity) ? campaign.identity.createdAt : null;
    if (!(isIsoDate(createdAt) && latestAuthor < Date.parse(createdAt))) issues.push({ code: 'gate_not_predeclared', detail: `${role}.createdAt` });
  }
  return { issues, authorDate, committerDate };
}

// T-71-03: the tracked code must be the measured code; then the suites run.
function verifySuites(deps, gate, measuredSha, out) {
  if (typeof measuredSha !== 'string' || !GIT_SHA.test(measuredSha)) return { issues: [{ code: 'measured_sha_invalid', detail: 'autopilot.git.sha' }] };
  const diff = deps.git(['diff', '--quiet', measuredSha, '--', ...MEASURED_CODE_PATHS], deps.repoRoot);
  if (!isPlainObject(diff) || diff.status !== 0) return { issues: [{ code: 'working_tree_not_measured', detail: 'tracked code differs from the measured sha' }] };
  const results = [];
  for (const command of gate.safety.verifySuites) {
    out(`evaluate-gate: running ${command}`);
    const run = deps.spawn(command, deps.repoRoot);
    if (!isPlainObject(run) || !Number.isSafeInteger(run.status)) return { issues: [{ code: 'verify_suite_not_finished', detail: command }] };
    out(`evaluate-gate: ${command} exited ${run.status}`);
    results.push({ command, exitCode: run.status });
  }
  return { issues: [], suites: { ran: true, results } };
}

/**
 * CLI entry. Returns the exit code; never calls process.exit itself.
 * overrides replace any dependency (tests inject git, spawn and output).
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const out = (text) => deps.stdout(`${text}\n`);
  const err = (text) => deps.stderr(`${text}\n`);
  const stop = (exit, heading, issues) => {
    err(`evaluate-gate: ${heading}:`);
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

  // 1. The gate, the campaigns, the roles and the sidecars.
  let loaded;
  try {
    loaded = deps.loadGate(options.gatePath);
  } catch (error) {
    return stop(EXIT.ERROR, 'invalid input', [{ code: 'gate_invalid', detail: errorCodes(error) }]);
  }
  const { gate, sha256 } = loaded;
  const gateRel = repoRelative(deps.repoRoot, options.gatePath);
  if (gateRel === null) return stop(EXIT.REFUSED, 'refusing', [{ code: 'gate_outside_repo', detail: '--gate' }]);

  const fallbackGiven = options.fallbackPin !== null;
  const sources = [
    { key: 'baseline', label: '--baseline', dir: options.baselineDir },
    { key: 'first', label: '--campaign 1', dir: options.campaignDirs[0] },
    { key: 'second', label: '--campaign 2', dir: options.campaignDirs[1] },
    ...(fallbackGiven ? [
      { key: 'pin', label: '--fallback-pin', dir: options.fallbackPin },
      { key: 'candidate', label: '--fallback-candidate', dir: options.fallbackCandidate },
    ] : []),
  ];
  const { campaigns, issues: loadIssues } = loadCampaigns(deps, sources);
  if (loadIssues.length) return stop(EXIT.ERROR, 'invalid input', loadIssues);

  const roleOf = { [gate.campaigns.autopilot.id]: 'autopilot', [gate.campaigns.claude.id]: 'claude' };
  const roles = {};
  const roleIssues = [];
  ['first', 'second'].forEach((key, index) => {
    const identity = campaigns[key].identity;
    const id = isPlainObject(identity) ? identity.campaignId : null;
    const role = typeof id === 'string' && Object.prototype.hasOwnProperty.call(roleOf, id) ? roleOf[id] : null;
    if (role === null) roleIssues.push({ code: 'campaign_unknown', detail: `--campaign ${index + 1}` });
    else if (roles[role]) roleIssues.push({ code: 'campaign_duplicate', detail: `--campaign ${index + 1}` });
    else roles[role] = campaigns[key];
  });
  if (roleIssues.length) return stop(EXIT.REFUSED, 'refusing', roleIssues);

  const sidecarIssues = [];
  const baselineSafety = readSidecar(deps, options.baselineDir, '--baseline', sidecarIssues);
  const pinSafety = fallbackGiven ? readSidecar(deps, options.fallbackPin, '--fallback-pin', sidecarIssues) : null;
  if (sidecarIssues.length) return stop(EXIT.ERROR, 'invalid input', sidecarIssues);

  // 2. Predeclaration.
  const dated = [
    ['baseline', campaigns.baseline], ['autopilot', roles.autopilot], ['claude', roles.claude],
    ...(fallbackGiven ? [['fallbackPin', campaigns.pin], ['fallbackCandidate', campaigns.candidate]] : []),
  ];
  const dates = predeclaration(deps, gateRel, dated);
  if (dates.issues.length) return stop(EXIT.REFUSED, 'refusing', dates.issues);

  // 3. The tighten-only suites at the measured sha.
  let suites = { ran: false, results: [] };
  if (options.verifySuites) {
    const identity = roles.autopilot.identity;
    const measuredSha = isPlainObject(identity) && isPlainObject(identity.git) ? identity.git.sha : null;
    const verified = verifySuites(deps, gate, measuredSha, out);
    if (verified.issues.length) return stop(EXIT.REFUSED, 'refusing', verified.issues);
    suites = verified.suites;
  }

  // 4. The pure evaluation.
  const input = {
    gate,
    gateSha256: sha256,
    baseline: { ...campaigns.baseline, safety: baselineSafety },
    autopilot: roles.autopilot,
    claude: roles.claude,
    suites,
    ...(fallbackGiven ? { fallback: { pin: { ...campaigns.pin, safety: pinSafety }, candidate: campaigns.candidate } } : {}),
  };
  const result = evaluateGate(input, deps.iterations === undefined ? {} : { iterations: deps.iterations });
  if (result.refusals.length) return stop(EXIT.REFUSED, 'refusing (evaluator)', result.refusals);

  // 5. The decision file and the gate report beside it.
  const decision = buildDecision(result, {
    gate: { path: gateRel, sha256, gateVersion: gate.gateVersion, authorDate: dates.authorDate, committerDate: dates.committerDate },
    suites,
    input,
  });
  const check = validateDecision(decision);
  if (!check.ok) return stop(EXIT.ERROR, 'decision invalid', check.errors.slice(0, 20).map((code) => ({ code: 'decision_invalid', detail: code })));
  const report = renderGateReport(input, result, decision);
  const reportPath = options.outPath.replace(/\.json$/, '.report.md');
  try {
    deps.writeJsonAtomic(options.outPath, decision);
    deps.writeText(reportPath, report);
  } catch {
    return stop(EXIT.ERROR, 'I/O', [{ code: 'write_failed', detail: '--out' }]);
  }
  for (const name of DECISION_PATHS) out(`${describePath(decision, name)} -> ${decision.paths[name].v6Action}`);
  out(`evaluate-gate: wrote ${options.outPath} and ${reportPath}`);
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
    process.stderr.write('evaluate-gate: unexpected_failure\n');
    process.exitCode = EXIT.ERROR;
  });
}
