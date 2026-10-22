// Phase 71 Plan 07 Task 2 (EVAL-02-g, EVAL-02-h; CONTEXT D-06, D-11, D-15,
// D-17; Pitfalls 6, 7, 13): the gate evaluator CLI and the baseline safety
// sidecar CLI.
//
// Both CLIs run through main(argv, overrides) against temp directories that
// hold synthetic campaigns. git is a fake returning scripted {status, stdout}
// and the suite runner is a fake returning scripted exit codes, so no test
// runs git or a test suite (67-VALIDATION:27). The real gate file and the
// real core tasks are read, never written. The evaluator runs 200 bootstrap
// iterations through the injected `iterations` dependency; the CLI itself
// never overrides the gate's 10,000.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { main as safetyMain } from '../scripts/bench/gate/baseline-safety.mjs';
import { MEASURED_CODE_PATHS, main as evaluateMain } from '../scripts/bench/gate/evaluate-gate.mjs';
import { validateDecision } from '../scripts/bench/gate/lib/decision.mjs';
import { loadGate } from '../scripts/bench/gate/lib/gate.mjs';
import { validateSidecarLine } from '../scripts/bench/gate/lib/sidecar.mjs';
import { SYNTHETIC_CANDIDATE_SHA, makeCampaign } from '../scripts/bench/gate/lib/synthetic.mjs';
import { computeSafety, isClaimedSuccess } from '../scripts/bench/lib/runs.mjs';
import { corpusLock, loadTasks } from '../scripts/bench/lib/tasks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE_REL = 'scripts/bench/gate/release-gate-v1.0.0.json';
const GATE_PATH = path.join(ROOT, GATE_REL);
const { gate: GATE, sha256: GATE_SHA256 } = loadGate(GATE_PATH);
const CORE_TASKS = loadTasks({ set: 'core' });
const CORE_LOCK = corpusLock(CORE_TASKS);
const CORE_IDS = CORE_TASKS.map((task) => task.id);
const TASKS_BY_ID = new Map(CORE_TASKS.map((task) => [task.id, task]));
const ROUNDS = GATE.campaigns.autopilot.minRounds;
const ITERATIONS = 200;
const AUTHOR_BEFORE = '2026-10-17T09:00:00-07:00';
const GATE_IDENTITY = Object.freeze({ gate: { path: GATE_REL, sha256: GATE_SHA256 }, tasks: CORE_LOCK });
const PATHS = ['jev-mcp-run-task', 'jev-autopilot', 'mcp-non-jev'];

const clone = (value) => JSON.parse(JSON.stringify(value));

// --- Synthetic campaigns on the real core corpus ----------------------------------------------

function merged(identity, extra) {
  return { ...clone(identity), ...(extra || {}) };
}

function baselineCampaign({ identity, ...rest } = {}) {
  return makeCampaign({
    seed: 6601, scheduleSeed: GATE.campaigns.baseline.seed, schemaVersion: 1, rounds: ROUNDS, taskIds: CORE_IDS,
    ...rest, identity: merged({ tasks: CORE_LOCK }, identity),
  });
}

function autopilotCampaign({ identity, ...rest } = {}) {
  return makeCampaign({
    seed: 7101, scheduleSeed: GATE.campaigns.autopilot.seed, rounds: ROUNDS, taskIds: CORE_IDS, effect: { 'autopilot/on': { speed: 0.7 } },
    ...rest, identity: merged(GATE_IDENTITY, identity),
  });
}

function claudeCampaign({ identity, ...rest } = {}) {
  return makeCampaign({
    seed: 6602, scheduleSeed: GATE.campaigns.claude.seed, arms: ['claude'], conditions: ['off'], rounds: ROUNDS, taskIds: CORE_IDS,
    ...rest, identity: merged(GATE_IDENTITY, identity),
  });
}

function fallbackPair({ candidateIdentity } = {}) {
  const spec = GATE.fallback;
  return {
    pin: makeCampaign({
      seed: 6611, scheduleSeed: spec.campaigns.pin.seed, schemaVersion: 1, arms: [spec.arm], rounds: spec.campaigns.pin.minRounds,
      taskIds: CORE_IDS, campaignId: spec.campaigns.pin.id, identity: { tasks: CORE_LOCK },
    }),
    candidate: makeCampaign({
      seed: 6612, scheduleSeed: spec.campaigns.candidate.seed, arms: [spec.arm], conditions: spec.campaigns.candidate.conditions,
      rounds: spec.campaigns.candidate.minRounds, taskIds: CORE_IDS, campaignId: spec.campaigns.candidate.id, effect: { claude: { speed: 0.85 } },
      identity: merged(GATE_IDENTITY, candidateIdentity),
    }),
  };
}

const BASELINE = baselineCampaign();
const AUTOPILOT = autopilotCampaign();
const CLAUDE = claudeCampaign();

// --- Temp directories ---------------------------------------------------------------------------

function sidecarText(campaign) {
  return campaign.runs.map((row) => {
    const evidence = campaign.safety.get(row.runId) || { requestOvercount: null, unexpectedMutations: null };
    return JSON.stringify({ schemaVersion: 1, runId: row.runId, ...evidence });
  }).join('\n') + '\n';
}

function writeCampaign(dir, campaign, { sidecar = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'identity.json'), `${JSON.stringify(campaign.identity, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'runs.jsonl'), `${campaign.runs.map((row) => JSON.stringify(row)).join('\n')}\n`);
  if (sidecar) fs.writeFileSync(path.join(dir, 'safety.jsonl'), sidecarText(campaign));
}

function tempRoot(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-gate-cli-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function workspace(t, {
  baseline = BASELINE, autopilot = AUTOPILOT, claude = CLAUDE, baselineSidecar = true, fallback = null,
} = {}) {
  const root = tempRoot(t);
  const dirs = {
    root,
    baseline: path.join(root, 'results', 'core-baseline-66'),
    autopilot: path.join(root, 'results', 'core-gate-71-autopilot'),
    claude: path.join(root, 'results', 'core-gate-71-claude'),
    out: path.join(root, 'decisions', 'core-gate-71.json'),
    report: path.join(root, 'decisions', 'core-gate-71.report.md'),
  };
  writeCampaign(dirs.baseline, baseline, { sidecar: baselineSidecar });
  writeCampaign(dirs.autopilot, autopilot);
  writeCampaign(dirs.claude, claude);
  if (fallback) {
    dirs.pin = path.join(root, 'results', 'core-rebaseline-71-pin');
    dirs.candidate = path.join(root, 'results', 'core-rebaseline-71-candidate');
    writeCampaign(dirs.pin, fallback.pin, { sidecar: true });
    writeCampaign(dirs.candidate, fallback.candidate);
  }
  return dirs;
}

function argvOf(dirs, extra = []) {
  return ['--gate', GATE_PATH, '--baseline', dirs.baseline, '--campaign', dirs.autopilot, '--campaign', dirs.claude, '--out', dirs.out, ...extra];
}

function listTree(dir) {
  const out = [];
  const walk = (at) => {
    for (const name of fs.readdirSync(at).sort()) {
      const full = path.join(at, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out;
}

// --- Fakes --------------------------------------------------------------------------------------

function fakeGit({ log = { status: 0, stdout: `${AUTHOR_BEFORE}\t${AUTHOR_BEFORE}\n` }, diff = { status: 0, stdout: '' } } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push([...args]);
    if (args[0] === 'log') return log;
    if (args[0] === 'diff') return diff;
    return { status: 128, stdout: '' };
  };
  git.calls = calls;
  return git;
}

function fakeSuites(results = {}) {
  const calls = [];
  const spawn = (command) => {
    calls.push(command);
    return Object.prototype.hasOwnProperty.call(results, command) ? results[command] : { status: 0, signal: null };
  };
  spawn.calls = calls;
  return spawn;
}

function capture() {
  const out = [];
  const err = [];
  return {
    stdout: (text) => { out.push(String(text)); },
    stderr: (text) => { err.push(String(text)); },
    text: () => `${out.join('')}\n${err.join('')}`,
    out: () => out.join(''),
  };
}

function evalDeps(extra = {}) {
  const io = capture();
  const git = extra.git || fakeGit();
  const spawn = extra.spawn || fakeSuites();
  return { deps: { repoRoot: ROOT, iterations: ITERATIONS, ...extra, git, spawn, stdout: io.stdout, stderr: io.stderr }, io, git, spawn };
}

async function runEvaluate(argv, extra) {
  const { deps, io, git, spawn } = evalDeps(extra);
  const code = await evaluateMain(argv, deps);
  return { code, io, git, spawn };
}

// --- evaluate-gate.mjs ---------------------------------------------------------------------------

test('evaluate-gate --help prints the usage and exits 0', async () => {
  const { code, io, git } = await runEvaluate(['--help']);
  assert.equal(code, 0);
  assert.match(io.out(), /--gate <file>/);
  assert.match(io.out(), /--verify-suites/);
  assert.match(io.out(), /--fallback-pin <dir>/);
  assert.equal(io.text().includes('://'), false);
  assert.deepEqual(git.calls, []);
});

test('evaluate-gate usage errors exit 2 with a code, run no git and write nothing', async (t) => {
  const dirs = workspace(t);
  const base = argvOf(dirs);
  const without = (flag) => {
    const at = base.indexOf(flag);
    return [...base.slice(0, at), ...base.slice(at + 2)];
  };
  const cases = [
    ['missing_flag', without('--gate')],
    ['missing_flag', without('--out')],
    ['campaign_count', without('--campaign')],
    ['campaign_count', [...base, '--campaign', dirs.claude]],
    ['repeated_flag', [...base, '--out', path.join(dirs.root, 'other.json')]],
    ['repeated_flag', [...base, '--verify-suites', '--verify-suites']],
    ['fallback_pair', [...base, '--fallback-pin', dirs.baseline]],
    ['fallback_pair', [...base, '--fallback-candidate', dirs.claude]],
    ['out_not_json', [...without('--out'), '--out', path.join(dirs.root, 'decisions', 'core-gate-71.md')]],
    ['out_inside_campaign', [...without('--out'), '--out', path.join(dirs.autopilot, 'decision.json')]],
    ['out_inside_campaign', [...without('--out'), '--out', path.join(dirs.baseline, 'gate', 'decision.json')]],
    ['out_is_gate', [...without('--out'), '--out', base[base.indexOf('--gate') + 1]]],
    ['unknown_flag', [...base, '--force']],
    ['unexpected_argument', [...base, 'stray']],
    ['missing_value', [...without('--gate'), '--gate']],
  ];
  for (const [codeName, argv] of cases) {
    const { code, io, git, spawn } = await runEvaluate(argv);
    assert.equal(code, 2, `${codeName}: ${argv.join(' ')}`);
    assert.match(io.text(), new RegExp(`\\b${codeName}\\b`), codeName);
    assert.deepEqual(git.calls, [], `${codeName}: no git`);
    assert.deepEqual(spawn.calls, [], `${codeName}: no suite`);
    assert.equal(fs.existsSync(dirs.out), false, codeName);
  }
});

test('evaluate-gate invalid input exits 1: a bad gate, an invalid row, an invalid sidecar line; no value is printed', async (t) => {
  const dirs = workspace(t);
  const badGate = path.join(dirs.root, 'gate.json');
  fs.writeFileSync(badGate, '{"schemaVersion": 1}\n');
  const gateArgv = argvOf(dirs);
  gateArgv[gateArgv.indexOf('--gate') + 1] = badGate;
  const gate = await runEvaluate(gateArgv);
  assert.equal(gate.code, 1);
  assert.match(gate.io.text(), /gate_invalid/);

  const SECRET = 'SECRETROWVALUE';
  const rows = clone(AUTOPILOT.runs);
  rows[3].claimed.status = `https://${SECRET}.example/x`;
  fs.writeFileSync(path.join(dirs.autopilot, 'runs.jsonl'), `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const row = await runEvaluate(argvOf(dirs));
  assert.equal(row.code, 1);
  assert.match(row.io.text(), /campaign_invalid/);
  assert.match(row.io.text(), /line 4: .*url_in_string:claimed\.status/);
  assert.equal(row.io.text().includes(SECRET), false);
  assert.equal(row.io.text().includes('://'), false);
  writeCampaign(dirs.autopilot, AUTOPILOT);

  const lines = sidecarText(BASELINE).split('\n');
  lines[1] = JSON.stringify({ ...JSON.parse(lines[1]), body: SECRET });
  fs.writeFileSync(path.join(dirs.baseline, 'safety.jsonl'), lines.join('\n'));
  const sidecar = await runEvaluate(argvOf(dirs));
  assert.equal(sidecar.code, 1);
  assert.match(sidecar.io.text(), /sidecar_invalid/);
  assert.match(sidecar.io.text(), /line 2: extra_key:body/);
  assert.equal(sidecar.io.text().includes(SECRET), false);
  assert.equal(fs.existsSync(dirs.out), false);
});

test('evaluate-gate maps the two campaigns to roles by campaign id; an unknown or repeated id refuses', async (t) => {
  const dirs = workspace(t, { autopilot: autopilotCampaign({ identity: { campaignId: 'core-gate-71-other' } }) });
  const unknown = await runEvaluate(argvOf(dirs));
  assert.equal(unknown.code, 2);
  assert.match(unknown.io.text(), /campaign_unknown/);

  writeCampaign(dirs.autopilot, AUTOPILOT);
  const argv = argvOf(dirs);
  argv[argv.lastIndexOf('--campaign') + 1] = dirs.autopilot;
  const repeated = await runEvaluate(argv);
  assert.equal(repeated.code, 2);
  assert.match(repeated.io.text(), /campaign_duplicate/);

  const swapped = argvOf(dirs);
  const first = swapped.indexOf('--campaign');
  const second = swapped.lastIndexOf('--campaign');
  [swapped[first + 1], swapped[second + 1]] = [swapped[second + 1], swapped[first + 1]];
  const ok = await runEvaluate(swapped);
  assert.equal(ok.code, 0, ok.io.text());
});

test('evaluate-gate refuses a gate that is not committed or not predeclared, by author date, with no override', async (t) => {
  const dirs = workspace(t);
  const notCommitted = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: '' } }) });
  assert.equal(notCommitted.code, 2);
  assert.match(notCommitted.io.text(), /gate_not_committed/);
  assert.deepEqual(notCommitted.git.calls, [['log', '--format=%aI%x09%cI', '--', GATE_REL]]);

  const failed = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 128, stdout: '' } }) });
  assert.equal(failed.code, 2);
  assert.match(failed.io.text(), /git_failed/);

  const after = '2026-11-03T00:00:00Z';
  const late = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: `${after}\t${after}\n` } }) });
  assert.equal(late.code, 2);
  assert.match(late.io.text(), /gate_not_predeclared/);
  assert.match(late.io.text(), /baseline\.createdAt/);

  const equal = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: `${CLAUDE.identity.createdAt}\t${AUTHOR_BEFORE}\n` } }) });
  assert.equal(equal.code, 2, 'an author date equal to a createdAt is not strictly before it');
  assert.match(equal.io.text(), /gate_not_predeclared/);

  const earlyBaseline = workspace(t, { baseline: baselineCampaign({ createdAt: '2026-10-16T00:00:00.000Z' }) });
  const v1 = await runEvaluate(argvOf(earlyBaseline));
  assert.equal(v1.code, 2, 'the V1 baseline is included in the date check');
  assert.match(v1.io.text(), /gate_not_predeclared/);

  // WR-03: every commit touching the gate is checked, not only the last one, so
  // an older-authored commit on top cannot hide a later edit beneath it.
  const buried = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: `${AUTHOR_BEFORE}\t${after}\n${after}\t${after}\n` } }) });
  assert.equal(buried.code, 2, buried.io.text());
  assert.match(buried.io.text(), /gate_not_predeclared/);
  const garbled = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: `${AUTHOR_BEFORE}\t${AUTHOR_BEFORE}\nnot-a-date\n` } }) });
  assert.equal(garbled.code, 2);
  assert.match(garbled.io.text(), /git_output_invalid/);
  const older = '2026-10-10T09:00:00-07:00';
  const twoBefore = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: `${AUTHOR_BEFORE}\t${AUTHOR_BEFORE}\n${older}\t${older}\n` } }) });
  assert.equal(twoBefore.code, 0, twoBefore.io.text());
  assert.equal(JSON.parse(fs.readFileSync(dirs.out, 'utf8')).gate.authorDate, AUTHOR_BEFORE, 'the decision records the last commit');

  // Pitfall 6: a rebase rewrites the committer date; the author date decides.
  const rebased = await runEvaluate(argvOf(dirs), { git: fakeGit({ log: { status: 0, stdout: `${AUTHOR_BEFORE}\t${after}\n` } }) });
  assert.equal(rebased.code, 0, rebased.io.text());
  const decision = JSON.parse(fs.readFileSync(dirs.out, 'utf8'));
  assert.equal(decision.gate.authorDate, AUTHOR_BEFORE);
  assert.equal(decision.gate.committerDate, after);

  const forced = await runEvaluate([...argvOf(dirs), '--force']);
  assert.equal(forced.code, 2);
  assert.match(forced.io.text(), /unknown_flag/);
});

test('evaluate-gate --verify-suites refuses a working tree that differs from the measured sha before any suite runs', async (t) => {
  const dirs = workspace(t);
  const { code, io, git, spawn } = await runEvaluate(argvOf(dirs, ['--verify-suites']), { git: fakeGit({ diff: { status: 1, stdout: '' } }) });
  assert.equal(code, 2);
  assert.match(io.text(), /working_tree_not_measured/);
  assert.deepEqual(spawn.calls, []);
  assert.deepEqual(git.calls[1], ['diff', '--quiet', SYNTHETIC_CANDIDATE_SHA, '--', ...MEASURED_CODE_PATHS]);
  assert.deepEqual([...MEASURED_CODE_PATHS], [
    'extension', 'mcp/src', 'mcp/build', 'showcase/server', 'scripts', 'tests', 'package.json', 'package-lock.json',
    ':(exclude)scripts/bench/results', ':(exclude)scripts/bench/gate/decisions',
  ]);
  assert.equal(fs.existsSync(dirs.out), false);
});

test('evaluate-gate --verify-suites runs every gate suite and records its exit code; an unfinished suite refuses', async (t) => {
  const dirs = workspace(t);
  const passing = await runEvaluate(argvOf(dirs, ['--verify-suites']));
  assert.equal(passing.code, 0, passing.io.text());
  assert.deepEqual(passing.spawn.calls, GATE.safety.verifySuites);
  const decision = JSON.parse(fs.readFileSync(dirs.out, 'utf8'));
  assert.deepEqual(decision.suites, { ran: true, results: GATE.safety.verifySuites.map((command) => ({ command, exitCode: 0 })) });
  for (const name of ['jev-mcp-run-task', 'jev-autopilot']) assert.equal(decision.paths[name].v6Action, 'ship_opt_in_default_off');

  const failing = await runEvaluate(argvOf(dirs, ['--verify-suites']), { spawn: fakeSuites({ [GATE.safety.verifySuites[0]]: { status: 1, signal: null } }) });
  assert.equal(failing.code, 0);
  const failed = JSON.parse(fs.readFileSync(dirs.out, 'utf8'));
  assert.equal(failed.suites.results[0].exitCode, 1);
  assert.deepEqual(failed.paths['jev-mcp-run-task'].reasons, ['tighten_only_suite_failed']);
  for (const name of ['jev-mcp-run-task', 'jev-autopilot']) assert.equal(failed.paths[name].v6Action, 'disable_jev_operator_switch');

  fs.rmSync(dirs.out);
  const unfinished = await runEvaluate(argvOf(dirs, ['--verify-suites']), {
    spawn: fakeSuites({ [GATE.safety.verifySuites[1]]: { status: null, signal: 'SIGTERM' } }),
  });
  assert.equal(unfinished.code, 2);
  assert.match(unfinished.io.text(), /verify_suite_not_finished/);
  assert.equal(fs.existsSync(dirs.out), false);
});

test('evaluate-gate prints each evaluator refusal code, exits 2 and writes nothing', async (t) => {
  const dirty = workspace(t, { autopilot: autopilotCampaign({ identity: { git: { sha: SYNTHETIC_CANDIDATE_SHA, dirty: true } } }) });
  const refused = await runEvaluate(argvOf(dirty));
  assert.equal(refused.code, 2);
  assert.match(refused.io.text(), /candidate_dirty: autopilot\.git\.dirty/);
  assert.equal(fs.existsSync(dirty.out), false);

  const tampered = workspace(t, { claude: claudeCampaign({ identity: { gate: { path: GATE_REL, sha256: 'f'.repeat(64) } } }) });
  const mismatch = await runEvaluate(argvOf(tampered));
  assert.equal(mismatch.code, 2);
  assert.match(mismatch.io.text(), /gate_hash_mismatch: claude\.gate\.sha256/);
  assert.equal(fs.existsSync(tampered.out), false);
});

test('evaluate-gate writes the decision and the report beside it, prints one line per path, and leaves the campaigns untouched', async (t) => {
  const dirs = workspace(t);
  const before = listTree(path.join(dirs.root, 'results'));
  const { code, io, git, spawn } = await runEvaluate(argvOf(dirs));
  assert.equal(code, 0, io.text());
  assert.deepEqual(listTree(path.join(dirs.root, 'results')), before, 'nothing is written into a campaign directory');
  assert.deepEqual(listTree(path.join(dirs.root, 'decisions')), ['core-gate-71.json', 'core-gate-71.report.md']);
  assert.deepEqual(spawn.calls, [], 'no suite runs without --verify-suites');
  assert.deepEqual(git.calls, [['log', '--format=%aI%x09%cI', '--', GATE_REL]]);

  const decision = JSON.parse(fs.readFileSync(dirs.out, 'utf8'));
  assert.deepEqual(validateDecision(decision).errors, []);
  assert.deepEqual(decision.gate, { path: GATE_REL, sha256: GATE_SHA256, gateVersion: GATE.gateVersion, authorDate: AUTHOR_BEFORE, committerDate: AUTHOR_BEFORE });
  assert.equal(decision.measuredSha, SYNTHETIC_CANDIDATE_SHA);
  assert.deepEqual(decision.suites, { ran: false, results: [] });
  assert.deepEqual(decision.evaluator, { iterations: ITERATIONS, seed: GATE.bootstrap.seed, level: GATE.bootstrap.level });
  assert.deepEqual(decision.paths['jev-mcp-run-task'].reasons, ['suites_not_run']);
  assert.equal(decision.paths['jev-mcp-run-task'].v6Action, 'ship_experimental_no_speed_claim');
  assert.equal(decision.paths['mcp-non-jev'].verdict, 'pass');

  const lines = io.out().split('\n').filter((line) => / -> /.test(line));
  assert.deepEqual(lines, PATHS.map((name) => `${name}: ${decision.paths[name].verdict} -> ${decision.paths[name].v6Action}`));
  const report = fs.readFileSync(dirs.report, 'utf8');
  assert.match(report, /^# Release gate report: gate 1\.0\.0/);
  assert.match(report, /\n## Diagnostics \(per decision, not whole-task speed\)\n/);
  for (const text of [io.text(), report]) assert.equal(text.includes('://'), false);

  const noSidecar = workspace(t, { baselineSidecar: false });
  const unverifiable = await runEvaluate(argvOf(noSidecar));
  assert.equal(unverifiable.code, 0);
  const withheld = JSON.parse(fs.readFileSync(noSidecar.out, 'utf8'));
  assert.deepEqual(withheld.paths['mcp-non-jev'].reasons, ['baseline_safety_unverifiable']);
  assert.equal(withheld.paths['mcp-non-jev'].v6Action, 'withhold_mcp_0_12_0');
});

test('evaluate-gate reads the core-rebaseline-71 pair with its pin sidecar, records the fallback, and date-checks both campaigns', async (t) => {
  const tripped = autopilotCampaign({ effect: { 'autopilot/off': { speed: 1.5 }, 'autopilot/on': { speed: 1.05 } } });
  const dirs = workspace(t, { autopilot: tripped, fallback: fallbackPair() });
  const fallbackArgv = argvOf(dirs, ['--fallback-pin', dirs.pin, '--fallback-candidate', dirs.candidate]);
  const used = await runEvaluate(fallbackArgv);
  assert.equal(used.code, 0, used.io.text());
  const decision = JSON.parse(fs.readFileSync(dirs.out, 'utf8'));
  assert.deepEqual(validateDecision(decision).errors, []);
  assert.equal(decision.fallback.status, 'used');
  assert.equal(decision.paths['mcp-non-jev'].source, 'fallback');
  assert.equal(decision.fallback.campaigns.pin.id, GATE.fallback.campaigns.pin.id);
  assert.ok(used.io.out().includes('mcp-non-jev: pass (from core-rebaseline-71; primary was inconclusive) -> publish_mcp_0_12_0'), used.io.out());

  fs.rmSync(path.join(dirs.pin, 'safety.jsonl'));
  const noPinSidecar = await runEvaluate(fallbackArgv);
  assert.equal(noPinSidecar.code, 0);
  const inconclusive = JSON.parse(fs.readFileSync(dirs.out, 'utf8'));
  assert.deepEqual(inconclusive.paths['mcp-non-jev'].reasons, ['baseline_safety_unverifiable']);
  assert.equal(inconclusive.paths['mcp-non-jev'].source, 'fallback');

  const early = workspace(t, { autopilot: tripped, fallback: fallbackPair() });
  const earlyCandidate = makeCampaign({
    seed: 6612, scheduleSeed: 66, arms: ['claude'], conditions: ['off'], rounds: ROUNDS, taskIds: CORE_IDS,
    campaignId: GATE.fallback.campaigns.candidate.id, createdAt: '2026-10-16T00:00:00.000Z', identity: clone(GATE_IDENTITY),
  });
  writeCampaign(early.candidate, earlyCandidate);
  const late = await runEvaluate(argvOf(early, ['--fallback-pin', early.pin, '--fallback-candidate', early.candidate]));
  assert.equal(late.code, 2);
  assert.match(late.io.text(), /gate_not_predeclared/);
  assert.match(late.io.text(), /fallbackCandidate\.createdAt/);
});

// --- baseline-safety.mjs -------------------------------------------------------------------------

const SENTINEL = 'SENTINELBODY';
const TOKEN = 'zqxjkvbnmwpltrghsdcfyaeo';

function requestCheck(task) {
  return task.success.all.find((check) => check.kind === 'request' && !Object.prototype.hasOwnProperty.call(check, 'jsonEquals'));
}

// The request log of a clean run: every total-count request check met
// exactly, with bodies and URLs that must never leave the raw record.
function cleanRequests(task) {
  const log = [{ method: 'GET', path: `/r/${TOKEN}/index.html`, url: `http://127.0.0.1:41234/r/${TOKEN}/index.html`, body: null }];
  for (const check of task.success.all.filter((item) => item.kind === 'request' && !Object.prototype.hasOwnProperty.call(item, 'jsonEquals'))) {
    for (let k = 0; k < check.count; k += 1) {
      log.push({ method: check.method, path: check.path, url: `http://127.0.0.1:41234${check.path}?token=${TOKEN}`, body: `{"note":"${SENTINEL}"}` });
    }
  }
  return log;
}

function smokeCampaign() {
  return makeCampaign({
    seed: 4242, scheduleSeed: 66, schemaVersion: 1, rounds: 2, taskIds: CORE_IDS, taskRates: 0.7, infra: { rate: 0.1 },
    safety: { events: [{ kind: 'claimedSuccessOnFail', arm: 'autopilot', count: 2 }, { kind: 'claimedSuccessOnFail', arm: 'claude', count: 1 }] },
    identity: { tasks: CORE_LOCK },
  });
}

// A campaign directory and a raw directory with one latest raw record per run,
// plus four injected autopilot cells on passing runs: an overcount (A), an
// unexpected mutation (B), dropped requests (C) and a missing record (D), and
// an archived attempt for E that must be ignored.
function safetyWorkspace(t, campaign = smokeCampaign()) {
  const root = tempRoot(t);
  const dirs = { root, campaign: path.join(root, 'smoke-20261020'), raw: path.join(root, 'smoke-20261020', 'runs') };
  writeCampaign(dirs.campaign, campaign);
  fs.mkdirSync(dirs.raw, { recursive: true });
  const passing = campaign.runs.filter((row) => row.arm === 'autopilot' && row.infraError === null && row.pass);
  const [a, b, c, d, e] = passing;
  const evidenceOf = new Map();
  for (const row of campaign.runs) {
    const task = TASKS_BY_ID.get(row.taskId);
    let requests = cleanRequests(task);
    let dropped = 0;
    if (row === a) {
      const check = requestCheck(task);
      requests = [...requests, { ...requests.at(-1) }, { ...requests.at(-1) }];
      assert.equal(computeSafety({ task, requests, dropped }).requestOvercount, 2, check.path);
    }
    if (row === b) requests = [...requests, { method: 'DELETE', path: '/api/unnamed/thing', url: `http://127.0.0.1:41234/api/unnamed/thing?t=${TOKEN}`, body: SENTINEL }];
    if (row === c) dropped = 3;
    evidenceOf.set(row.runId, { requests, dropped });
    if (row === d) continue;
    fs.writeFileSync(path.join(dirs.raw, `${row.runId}.json`), JSON.stringify({ runId: row.runId, campaignId: row.campaignId, evidence: { requests, dropped } }));
  }
  const overcount = [...cleanRequests(TASKS_BY_ID.get(e.taskId)), ...cleanRequests(TASKS_BY_ID.get(e.taskId)).slice(1)];
  fs.writeFileSync(path.join(dirs.raw, `${e.runId}.attempt1.json`), JSON.stringify({ runId: e.runId, evidence: { requests: overcount, dropped: 0 } }));
  return { dirs, campaign, cells: { a, b, c, d, e }, evidenceOf };
}

async function runSafety(argv, extra = {}) {
  const io = capture();
  const code = await safetyMain(argv, { repoRoot: ROOT, ...extra, stdout: io.stdout, stderr: io.stderr });
  return { code, io };
}

test('baseline-safety --help exits 0; usage errors exit 2 and an unreadable raw directory exits 1', async (t) => {
  const help = await runSafety(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.io.out(), /--raw <dir>/);
  assert.match(help.io.out(), /--tasks-root <dir>/);
  const { dirs } = safetyWorkspace(t);
  for (const [codeName, argv] of [
    ['missing_flag', ['--campaign', dirs.campaign]],
    ['missing_flag', ['--raw', dirs.raw]],
    ['unknown_flag', ['--raw', dirs.raw, '--campaign', dirs.campaign, '--force']],
    ['repeated_flag', ['--raw', dirs.raw, '--raw', dirs.raw, '--campaign', dirs.campaign]],
    ['missing_value', ['--raw', dirs.raw, '--campaign']],
  ]) {
    const { code, io } = await runSafety(argv);
    assert.equal(code, 2, codeName);
    assert.match(io.text(), new RegExp(`\\b${codeName}\\b`), codeName);
  }
  const missing = await runSafety(['--raw', path.join(dirs.root, 'nowhere'), '--campaign', dirs.campaign]);
  assert.equal(missing.code, 1);
  assert.match(missing.io.text(), /raw_unreadable/);
  assert.equal(fs.existsSync(path.join(dirs.campaign, 'safety.jsonl')), false);
});

test('baseline-safety derives one sorted line per run with computeSafety from the latest raw record', async (t) => {
  const { dirs, campaign, cells, evidenceOf } = safetyWorkspace(t);
  const { code, io } = await runSafety(['--raw', dirs.raw, '--campaign', dirs.campaign]);
  assert.equal(code, 0, io.text());
  const text = fs.readFileSync(path.join(dirs.campaign, 'safety.jsonl'), 'utf8');
  const lines = text.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map((line) => line.runId), campaign.runs.map((row) => row.runId).sort());
  for (const line of lines) assert.deepEqual(validateSidecarLine(line), { ok: true, errors: [] });
  const byId = new Map(lines.map((line) => [line.runId, line]));
  for (const row of campaign.runs) {
    const line = byId.get(row.runId);
    if (row.infraError !== null || row === cells.d) {
      assert.deepEqual([line.requestOvercount, line.unexpectedMutations], [null, null], row.runId);
      continue;
    }
    const expected = computeSafety({ task: TASKS_BY_ID.get(row.taskId), ...evidenceOf.get(row.runId) });
    assert.deepEqual([line.requestOvercount, line.unexpectedMutations], [expected.requestOvercount, expected.unexpectedMutations], row.runId);
  }
  assert.equal(byId.get(cells.a.runId).requestOvercount, 2);
  assert.equal(byId.get(cells.b.runId).unexpectedMutations, 1);
  assert.deepEqual([byId.get(cells.c.runId).requestOvercount, byId.get(cells.c.runId).unexpectedMutations], [null, null]);
  assert.deepEqual([byId.get(cells.e.runId).requestOvercount, byId.get(cells.e.runId).unexpectedMutations], [0, 0], 'archived attempts are skipped');
  assert.ok(campaign.runs.some((row) => row.infraError !== null), 'the fixture has an infra row');

  // Sentinel: no request body, URL, token or request path leaves the raw records.
  for (const bad of [SENTINEL, TOKEN, '://', '/api/', '127.0.0.1']) assert.equal(text.includes(bad), false, bad);
  assert.equal(Object.keys(lines[0]).join(','), 'schemaVersion,runId,requestOvercount,unexpectedMutations');

  const custom = path.join(dirs.root, 'elsewhere', 'safety.jsonl');
  const again = await runSafety(['--raw', dirs.raw, '--campaign', dirs.campaign, '--out', custom, '--gate', GATE_PATH]);
  assert.equal(again.code, 0);
  assert.equal(fs.readFileSync(custom, 'utf8'), text);
});

test('baseline-safety prints per-arm counts only: counted, each event kind, unverifiable and any event', async (t) => {
  const { dirs, campaign, cells } = safetyWorkspace(t);
  const { code, io } = await runSafety(['--raw', dirs.raw, '--campaign', dirs.campaign]);
  assert.equal(code, 0, io.text());
  const counted = (arm) => campaign.runs.filter((row) => row.arm === arm && row.infraError === null);
  const claimed = (arm) => counted(arm).filter((row) => isClaimedSuccess(arm, row.claimed, GATE.claimWords.autopilot.baseline) && row.pass !== true);
  assert.equal(claimed('autopilot').length, 2);
  assert.equal(claimed('claude').length, 1);
  for (const cell of Object.values(cells)) assert.equal(cell.pass, true);
  const lines = io.out().split('\n').filter((line) => line.startsWith('rates '));
  assert.deepEqual(lines, [
    `rates autopilot: counted ${counted('autopilot').length} requestOvercount 1 unexpectedMutations 1 unverifiable 2 claimedSuccessOnFail 2 anyEvent 4`,
    `rates claude: counted ${counted('claude').length} requestOvercount 0 unexpectedMutations 0 unverifiable 0 claimedSuccessOnFail 1 anyEvent 1`,
  ]);
  const output = io.text();
  for (const row of campaign.runs) {
    assert.equal(output.includes(row.runId), false, 'no run id is printed');
  }
  for (const taskId of CORE_IDS) assert.equal(output.includes(taskId), false, 'no task id is printed');
  for (const bad of [SENTINEL, TOKEN, '://']) assert.equal(output.includes(bad), false, bad);
});

test('baseline-safety refuses corpus_mismatch unless the campaign corpus equals the core lock, and writes nothing', async (t) => {
  const tasks = clone(CORE_LOCK);
  tasks[0].fixtureSha256 = 'f'.repeat(64);
  const campaign = makeCampaign({ seed: 4243, scheduleSeed: 66, schemaVersion: 1, rounds: 1, taskIds: CORE_IDS, identity: { tasks } });
  const root = tempRoot(t);
  const dir = path.join(root, 'core-baseline-66');
  writeCampaign(dir, campaign);
  fs.mkdirSync(path.join(root, 'raw'));
  const { code, io } = await runSafety(['--raw', path.join(root, 'raw'), '--campaign', dir]);
  assert.equal(code, 2);
  assert.match(io.text(), /corpus_mismatch/);
  assert.equal(fs.existsSync(path.join(dir, 'safety.jsonl')), false);
});
