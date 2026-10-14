#!/usr/bin/env node
/**
 * Phase 66 benchmark runner (MEAS-03; D-06, D-13..D-21; W3, W4, W6, W9,
 * W10, W12, W-A, W-B, B2, B3, B-TIMEOUT).
 *
 * Runs only on request; it is never part of npm test. It adds no
 * dependencies: the MCP SDK and ws come from mcp/node_modules, and nothing
 * under mcp/ is edited (D-01, D-13).
 *
 * Modes:
 *   --dry-run    load tasks, hash fixtures, build the schedule, print it.
 *   --preflight  open the runner's own MCP server (it must own the 7225 hub),
 *                verify identity and refuse on any evaluatePreflight code or a
 *                bench extension whose fsbTelemetryOptOut is not strictly
 *                true, then print a secret-free identity summary.
 *   --smoke      the same checks, then every task in the set x 1 round by
 *                default; output under scripts/bench/.local/<campaignId>/.
 *   --campaign   the baseline: 10 ABBA rounds by default; rows, identity and
 *                the later report under scripts/bench/results/<campaignId>/.
 *   --resume <campaignId> re-runs every runId whose latest attempt ended in
 *                an infra error and skips the ones that did not.
 *
 * Wall time is the runner's clock (D-06): t0 before run_task or before the
 * host is spawned, t1 when run_task settles or at the host's result event.
 * Success comes only from independent evidence (D-17): the fixture server's
 * request log plus a post-window CDP read of the final URL and DOM markers,
 * or of the live page text. Agent claims are stored as "claimed" and never
 * decide a pass.
 *
 * Every run is saved the moment it ends (D-20): the raw record under the
 * gitignored scripts/bench/.local/<campaignId>/runs/, and runs.jsonl
 * regenerated from the latest raw record of every runId (one sanitized,
 * validated row each, D-21). The first agent_cap, agent_auth or
 * provider_error pauses the campaign (exit 75); two consecutive other infra
 * errors do too. A pause prints the code and the exact --resume command,
 * never error text.
 *
 * Nothing prints or persists the fixture-server secret, API keys, the bridge
 * pairing code or environment values. --pair-via-cdp reads the code from
 * `pair --json` in process and hands it straight to the CDP pairing call.
 *
 * Exit codes: 0 ok, 1 error, 2 refusal or usage, 75 paused (infra),
 * 130 SIGINT, 143 SIGTERM.
 */

import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { startFixtureServer } from './fixture-server.mjs';
import {
  browserVersion,
  closeTargets,
  collectCoreEvidence,
  collectLiveEvidence,
  pairExtensionViaCdp,
  readDevToolsPort,
  readExtensionStorageFlag,
} from './lib/cdp.mjs';
import { buildBenchChildEnv, claudeVersion, loadProviderKeyNames, runClaudeTask, TOOL_SEARCH_MODES } from './lib/claude-arm.mjs';
import { cursorVersion, runCursorTask } from './lib/cursor-arm.mjs';
import { readFsbAgentPolicy, serializeFsbAgents } from './lib/host-stream.mjs';
import { PINNED_AUTOPILOT_MODEL, WEB_STORE_EXTENSION_ID, evaluatePreflight, gitIdentity, sha256Hex } from './lib/identity.mjs';
import {
  collectServerIdentity,
  getSessionDetailWithRetry,
  listSessions,
  openRunnerClient,
  openTab,
  readFsbConfig,
  runTaskTimed,
} from './lib/mcp-client.mjs';
import { evaluateOutcome } from './lib/outcome.mjs';
import {
  ARMS,
  CAMPAIGN_ID_PATTERN,
  HOST_ARMS,
  MAX_ROUNDS,
  RUN_FLAGS,
  buildSchedule,
  classifyInfra,
  evaluateBenchSafety,
  pauseDecision,
  servedModelMatch,
  sessionDetailFlags,
  toCommittedRow,
  validateCommittedRow,
} from './lib/runs.mjs';
import { BENCH_FIXTURES_ROOT, BENCH_TASKS_ROOT, TASK_SETS, fixtureSha256, loadTasks, renderInstruction } from './lib/tasks.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..');
export const BENCH_LOCAL_ROOT = path.join(MODULE_DIR, '.local');
export const BENCH_RESULTS_ROOT = path.join(MODULE_DIR, 'results');
const DEFAULT_CHROME_PROFILE = path.join(os.homedir(), '.fsb-bench', 'chrome-profile');
const DEFAULT_LAUNCH_RECORD = path.join(BENCH_LOCAL_ROOT, 'bench-chrome.json');

export const EXIT = Object.freeze({ OK: 0, ERROR: 1, REFUSED: 2, PAUSED: 75, SIGINT: 130, SIGTERM: 143 });

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const MODEL_PATTERN = /^[A-Za-z0-9._:[\]-]{1,80}$/;
const TASK_ID_PATTERN = /^(?:core|live)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LAUNCH_FLAG_PATTERN = /^--[a-z0-9][a-z0-9-]{0,80}$/;
const REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const TELEMETRY_KEY = 'fsbTelemetryOptOut';
const DEFAULT_SEED = 66;
const DEFAULT_COOLDOWN_MS = 3000;
const MAX_COOLDOWN_MS = 600000;
const CAMPAIGN_ROUNDS = 10;
const SMOKE_ROUNDS = 1;
const PAIRING_CONNECT_TIMEOUT_MS = 30000;
const PAIRING_POLL_MS = 1000;
const HUB_OWNERSHIP_WAIT_MS = 5000;
const HUB_POLL_MS = 250;
const MAX_HOST_SESSIONS = 5;
const IDENTITY_SCHEMA_VERSION = 1;

export const USAGE = [
  'usage: node scripts/bench/run-bench.mjs (--dry-run | --preflight | --smoke | --campaign) [options]',
  '',
  'Modes:',
  '  --dry-run                    load tasks, hash fixtures, print the schedule; starts nothing',
  '  --preflight                  verify identity, hub ownership and the telemetry opt-out; runs nothing',
  '  --smoke                      every task in the set x 1 round (default); output under scripts/bench/.local/',
  '  --campaign                   10 ABBA rounds (default); rows under scripts/bench/results/<campaignId>/',
  '  --resume <campaignId>        with --smoke or --campaign: re-run only runIds whose latest attempt hit an infra error',
  '',
  'Tasks and schedule:',
  '  --set core|live              task set (default core; live is reported separately)',
  '  --tasks <id,id,...>          subset of the set (default: every task)',
  '  --rounds N                   rounds (smoke 1, campaign 10)',
  '  --arms <list>                autopilot,claude (default); cursor only when listed (experimental)',
  '  --seed N                     schedule seed (default 66)',
  '  --campaign-id <id>           default <set>-<YYYYMMDD>-<git short sha>',
  '  --cooldown-ms N              pause between runs (default 3000)',
  '  --tasks-root <dir>           task definitions (default scripts/bench/tasks)',
  '  --fixtures-root <dir>        fixture pages (default scripts/bench/fixtures)',
  '',
  'Hosts:',
  '  --claude-model <id>          required with the claude arm for --smoke and --campaign (no default)',
  '  --claude-tool-search <mode>  unset (default), auto, true or false (ENABLE_TOOL_SEARCH)',
  '  --cursor-model <id>          model for the experimental cursor arm',
  '',
  'Browser and identity:',
  '  --chrome-profile <dir>       bench Chrome profile (default ~/.fsb-bench/chrome-profile)',
  '  --expect-extension-id <id>   the unpacked bench extension id (32 letters a-p, never the Web Store id);',
  '                               required with --pair-via-cdp, --smoke and --campaign',
  '  --chrome-launch-record <f>   launch record whose flag names go into identity (default scripts/bench/.local/bench-chrome.json)',
  '  --pair-via-cdp               deliver the `pair --json` code to the bench extension over CDP (never printed)',
  '  --allow-dirty                let a campaign run on a tree with tracked changes',
  '  --help                       show this help',
  '',
  'Exit codes: 0 ok, 1 error, 2 refusal or usage, 75 paused (infra error; resume later), 130 SIGINT, 143 SIGTERM.',
].join('\n');

const VALUE_FLAGS = new Set([
  '--set', '--tasks', '--rounds', '--arms', '--seed', '--claude-model', '--claude-tool-search', '--cursor-model',
  '--chrome-profile', '--expect-extension-id', '--chrome-launch-record', '--campaign-id', '--resume',
  '--tasks-root', '--fixtures-root', '--cooldown-ms',
]);
const BOOLEAN_FLAGS = new Set(['--dry-run', '--preflight', '--smoke', '--campaign', '--allow-dirty', '--pair-via-cdp', '--help', '-h']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function issue(code, detail) {
  return { code, detail };
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeMessage(error) {
  const text = error && error.message ? String(error.message) : String(error);
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
}

function label(value, max = 120) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  return clean && !clean.includes('://') ? clean : null;
}

function nonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

// --- Arguments ---------------------------------------------------------------------

/** Raw flag map plus parse errors; values stay strings. */
export function parseArgs(argv) {
  const raw = {};
  const errors = [];
  let unknown = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (BOOLEAN_FLAGS.has(name)) {
      if (eq > 0) errors.push(issue('flag_takes_no_value', `${name} takes no value`));
      else raw[name] = true;
      continue;
    }
    if (VALUE_FLAGS.has(name)) {
      let value;
      if (eq > 0) {
        value = arg.slice(eq + 1);
      } else {
        value = argv[i + 1];
        if (value === undefined || String(value).startsWith('--')) {
          errors.push(issue('missing_value', `${name} needs a value`));
          continue;
        }
        i += 1;
      }
      if (Object.prototype.hasOwnProperty.call(raw, name)) errors.push(issue('flag_repeated', `${name} is given more than once`));
      raw[name] = String(value);
      continue;
    }
    unknown = true;
    const shown = arg.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 60);
    errors.push(arg.startsWith('-')
      ? issue('unknown_flag', `unknown flag ${shown}`)
      : issue('unexpected_argument', `unexpected argument ${shown}`));
  }
  return { raw, errors, unknown };
}

function parseInteger(text) {
  return typeof text === 'string' && /^-?\d{1,15}$/.test(text) ? Number(text) : NaN;
}

function parseList(text) {
  return String(text).split(',').map((part) => part.trim()).filter(Boolean);
}

function validModel(value) {
  return typeof value === 'string' && MODEL_PATTERN.test(value) && !value.startsWith('-');
}

/**
 * Resolves defaults and validates every option at once. Nothing here spawns,
 * pairs or opens a file, so a refusal always comes before any side effect.
 */
export function resolveOptions(raw) {
  const errors = [];
  const modes = ['--preflight', '--smoke', '--campaign'].filter((flag) => raw[flag] === true);
  const dryRun = raw['--dry-run'] === true;
  const mode = modes.length === 1 ? modes[0].slice(2) : null;
  if (modes.length > 1) errors.push(issue('mode_conflict', 'choose one of --preflight, --smoke and --campaign'));
  if (dryRun && mode === 'preflight') errors.push(issue('mode_conflict', '--dry-run does not apply to --preflight'));
  if (modes.length === 0 && !dryRun) errors.push(issue('mode_required', 'one of --dry-run, --preflight, --smoke or --campaign is required'));

  const set = raw['--set'] === undefined ? 'core' : raw['--set'];
  if (!TASK_SETS.includes(set)) errors.push(issue('set_invalid', '--set must be core or live'));

  const arms = raw['--arms'] === undefined ? ['autopilot', 'claude'] : parseList(raw['--arms']);
  if (arms.length === 0 || new Set(arms).size !== arms.length || !arms.every((arm) => ARMS.includes(arm))) {
    errors.push(issue('arms_invalid', `--arms must list distinct arms from ${ARMS.join(', ')}`));
  }

  let rounds = mode === 'smoke' ? SMOKE_ROUNDS : CAMPAIGN_ROUNDS;
  if (raw['--rounds'] !== undefined) {
    rounds = parseInteger(raw['--rounds']);
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS) errors.push(issue('rounds_invalid', `--rounds must be an integer in 1..${MAX_ROUNDS}`));
  }

  let seed = DEFAULT_SEED;
  if (raw['--seed'] !== undefined) {
    seed = parseInteger(raw['--seed']);
    if (!Number.isSafeInteger(seed)) errors.push(issue('seed_invalid', '--seed must be an integer'));
  }

  let tasks = null;
  if (raw['--tasks'] !== undefined) {
    tasks = parseList(raw['--tasks']);
    if (tasks.length === 0 || new Set(tasks).size !== tasks.length || !tasks.every((id) => TASK_ID_PATTERN.test(id))) {
      errors.push(issue('tasks_invalid', '--tasks must list distinct task ids'));
    }
  }

  const claudeModel = raw['--claude-model'];
  if (claudeModel !== undefined && !validModel(claudeModel)) {
    errors.push(issue('claude_model_invalid', "--claude-model must be 1..80 characters of letters, digits, '.', '_', ':', '[', ']' or '-'"));
  }
  if (arms.includes('claude') && (mode === 'smoke' || mode === 'campaign') && claudeModel === undefined) {
    errors.push(issue('claude_model_required', '--claude-model is required when the claude arm runs in --smoke or --campaign'));
  }
  const claudeToolSearch = raw['--claude-tool-search'] === undefined ? 'unset' : raw['--claude-tool-search'];
  if (!TOOL_SEARCH_MODES.includes(claudeToolSearch)) {
    errors.push(issue('claude_tool_search_invalid', '--claude-tool-search must be unset, auto, true or false'));
  }
  const cursorModel = raw['--cursor-model'];
  if (cursorModel !== undefined && !validModel(cursorModel)) errors.push(issue('cursor_model_invalid', '--cursor-model is not a valid model id'));

  const pairViaCdp = raw['--pair-via-cdp'] === true;
  const expectExtensionId = raw['--expect-extension-id'];
  const needsExtensionId = pairViaCdp || mode === 'smoke' || mode === 'campaign';
  const extensionIdValid = typeof expectExtensionId === 'string' && EXTENSION_ID_PATTERN.test(expectExtensionId)
    && expectExtensionId !== WEB_STORE_EXTENSION_ID;
  if ((needsExtensionId || expectExtensionId !== undefined) && !extensionIdValid) {
    errors.push(issue('extension_id_invalid',
      '--expect-extension-id must be the unpacked bench extension id: 32 letters a-p, never the Web Store id'));
  }

  const campaignId = raw['--campaign-id'];
  if (campaignId !== undefined && !CAMPAIGN_ID_PATTERN.test(campaignId)) {
    errors.push(issue('campaign_id_invalid', '--campaign-id must be 1..80 characters of letters, digits, ".", "_" or "-"'));
  }
  const resume = raw['--resume'];
  if (resume !== undefined) {
    if (!CAMPAIGN_ID_PATTERN.test(resume)) errors.push(issue('campaign_id_invalid', '--resume needs a valid campaign id'));
    if (mode !== 'smoke' && mode !== 'campaign') errors.push(issue('resume_needs_mode', '--resume goes with --smoke or --campaign'));
    if (campaignId !== undefined && campaignId !== resume) errors.push(issue('campaign_id_conflict', '--campaign-id and --resume name different campaigns'));
  }

  let cooldownMs = DEFAULT_COOLDOWN_MS;
  if (raw['--cooldown-ms'] !== undefined) {
    cooldownMs = parseInteger(raw['--cooldown-ms']);
    if (!Number.isInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > MAX_COOLDOWN_MS) {
      errors.push(issue('cooldown_invalid', `--cooldown-ms must be an integer in 0..${MAX_COOLDOWN_MS}`));
    }
  }

  const pathOption = (flag, fallback) => (raw[flag] === undefined ? fallback : path.resolve(raw[flag]));
  return {
    options: {
      mode,
      dryRun,
      set,
      arms,
      rounds,
      seed,
      tasks,
      claudeModel: claudeModel === undefined ? null : claudeModel,
      claudeToolSearch,
      cursorModel: cursorModel === undefined ? null : cursorModel,
      chromeProfile: pathOption('--chrome-profile', DEFAULT_CHROME_PROFILE),
      expectExtensionId: expectExtensionId === undefined ? null : expectExtensionId,
      launchRecord: pathOption('--chrome-launch-record', DEFAULT_LAUNCH_RECORD),
      campaignId: resume !== undefined ? resume : (campaignId === undefined ? null : campaignId),
      resume: resume !== undefined,
      allowDirty: raw['--allow-dirty'] === true,
      pairViaCdp,
      tasksRoot: pathOption('--tasks-root', BENCH_TASKS_ROOT),
      fixturesRoot: pathOption('--fixtures-root', BENCH_FIXTURES_ROOT),
      cooldownMs,
    },
    errors,
  };
}

function shellQuote(value) {
  return /^[A-Za-z0-9_./:=,@%+-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

/** The exact command that resumes a paused campaign. */
export function buildResumeCommand(argv, campaignId) {
  const kept = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i]);
    const name = arg.startsWith('--') && arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (name === '--resume' || name === '--campaign-id') {
      if (!arg.includes('=')) i += 1;
      continue;
    }
    kept.push(arg);
  }
  return ['node', 'scripts/bench/run-bench.mjs', ...kept, '--resume', campaignId].map(shellQuote).join(' ');
}

// --- Machine facts --------------------------------------------------------------------

/** PID of the single process listening on TCP 7225, or null (lsof missing or ambiguous). */
export function readHubListenerPid() {
  let result;
  try {
    result = spawnSync('lsof', ['-nP', '-iTCP:7225', '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 10000, shell: false });
  } catch {
    return null;
  }
  if (!result || result.error || result.status !== 0) return null;
  const pids = [...new Set(String(result.stdout).split(/\s+/).filter(Boolean).map(Number))]
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  return pids.length === 1 ? pids[0] : null;
}

function gitShortSha(repoRoot) {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    timeout: 10000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  const sha = result && result.status === 0 ? String(result.stdout).trim() : '';
  return /^[0-9a-f]{4,40}$/.test(sha) ? sha : 'nogit';
}

// Reads the current pairing code from the product's own `pair --json`
// (which never rotates it). The value is returned to the caller only: it is
// never printed, logged or written, and failures carry fixed messages.
export function readPairingCode(repoRoot) {
  const env = {};
  for (const name of ['HOME', 'PATH', 'USER', 'LOGNAME', 'TMPDIR', 'LANG']) {
    if (typeof process.env[name] === 'string') env[name] = process.env[name];
  }
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [path.join(repoRoot, 'mcp', 'build', 'index.js'), 'pair', '--json'], {
      shell: false,
      timeout: 15000,
      maxBuffer: 64 * 1024,
      env,
    }, (error, stdout) => {
      if (error) {
        reject(new Error('pair_json_failed'));
        return;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(String(stdout));
      } catch {
        parsed = null;
      }
      const value = isPlainObject(parsed) ? parsed.pairingCode : null;
      if (typeof value !== 'string' || !value) {
        reject(new Error('pair_json_invalid'));
        return;
      }
      resolve(value);
    });
  });
}

function readLaunchFlags(recordPath) {
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch {
    return null;
  }
  if (!isPlainObject(record) || !Array.isArray(record.flags)) return null;
  // Names only; the record's flagValues stay in the gitignored file (I-3).
  return [...new Set(record.flags.filter((flag) => typeof flag === 'string' && LAUNCH_FLAG_PATTERN.test(flag)))].sort();
}

export function defaultDeps() {
  return {
    repoRoot: REPO_ROOT,
    localRoot: BENCH_LOCAL_ROOT,
    resultsRoot: BENCH_RESULTS_ROOT,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    installSignalHandlers: true,
    now: () => Date.now(),
    sleep: defaultSleep,
    gitIdentity,
    gitShortSha,
    hubListenerPid: readHubListenerPid,
    openRunnerClient,
    collectServerIdentity,
    readFsbConfig,
    openTab,
    runTaskTimed,
    getSessionDetailWithRetry,
    listSessions,
    readDevToolsPort,
    browserVersion,
    readExtensionStorageFlag,
    pairExtensionViaCdp,
    collectCoreEvidence,
    collectLiveEvidence,
    closeTargets,
    readPairingCode,
    claudeVersion,
    cursorVersion,
    loadProviderKeyNames,
    runClaudeTask,
    runCursorTask,
    startFixtureServer,
  };
}

// --- Files ----------------------------------------------------------------------------

function writeFileAtomic(file, text, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, text, { mode });
  fs.renameSync(temp, file);
}

function writeJsonAtomic(file, value, mode) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`, mode);
}

const RAW_RECORD_FILE = /^([A-Za-z0-9][A-Za-z0-9._-]*)\.json$/;
const RAW_ARCHIVE_FILE = /\.attempt\d+\.json$/;

/** runId -> latest raw record, read from <rawDir>/<runId>.json (archived attempts are skipped). */
export function loadLatestRawRecords(rawDir, warn = () => {}) {
  const records = new Map();
  let names = [];
  try {
    names = fs.readdirSync(rawDir);
  } catch {
    return records;
  }
  for (const name of names.sort()) {
    const match = RAW_RECORD_FILE.exec(name);
    if (!match || RAW_ARCHIVE_FILE.test(name)) continue;
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(rawDir, name), 'utf8'));
    } catch {
      warn(`run-bench: skipping unreadable raw record ${name}`);
      continue;
    }
    if (!isPlainObject(record) || record.runId !== match[1]) {
      warn(`run-bench: skipping raw record ${name} (runId does not match its file name)`);
      continue;
    }
    records.set(record.runId, record);
  }
  return records;
}

function writeRunsJsonl(outDir, rows) {
  const ordered = [...rows.values()].sort((a, b) => (a.order - b.order) || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  writeFileAtomic(path.join(outDir, 'runs.jsonl'), ordered.map((row) => JSON.stringify(row)).join('\n') + (ordered.length ? '\n' : ''));
}

function campaignHasRecords(rawDir, outDir) {
  try {
    if (fs.readdirSync(rawDir).some((name) => name.endsWith('.json'))) return true;
  } catch {
    // no raw directory yet
  }
  return fs.existsSync(path.join(outDir, 'runs.jsonl')) || fs.existsSync(path.join(outDir, 'identity.json'));
}

// --- Arms -----------------------------------------------------------------------------

/**
 * Autopilot arm: open_tab outside the timed window (foregrounded), then
 * run_task on the runner's clock, then get_session_detail for the returned
 * session id until the 66-06 measurement block is recorded. On a timeout the
 * id comes from get_task_status (called before stop_task) or the
 * list_sessions fallback. Error text stays in memory for classification.
 */
export async function runAutopilotArm({ deps, client, task, startUrl, instruction, signal }) {
  let opened;
  try {
    opened = await deps.openTab(client, startUrl);
  } catch (error) {
    opened = { isError: true, json: null, text: safeMessage(error) };
  }
  if (!opened || opened.isError) {
    const now = deps.now();
    return {
      t0: now, t1: now, timedOut: false, aborted: !!(signal && signal.aborted), startFailed: true,
      runTask: null, taskJson: opened ? opened.json : null, errorText: opened ? opened.text : null,
      sessionId: null, sessionDetail: null,
    };
  }
  const timed = await deps.runTaskTimed(client, instruction, task.timeBudgetMs, { signal });
  const json = isPlainObject(timed.json) ? timed.json : null;
  const runTask = {
    isError: typeof timed.isError === 'boolean' ? timed.isError : null,
    status: json && typeof json.status === 'string' ? json.status : null,
    partialOutcome: json && typeof json.partial_outcome === 'string' ? json.partial_outcome : null,
    swEvicted: !!(json && json.sw_evicted === true),
    sessionIdSource: timed.sessionIdSource || null,
  };
  if (timed.aborted) {
    return { ...timed, startFailed: false, runTask, taskJson: json, sessionDetail: null };
  }
  const sessionDetail = await deps.getSessionDetailWithRetry(client, timed.sessionId, {
    until: (detail) => !!(detail && detail.session && detail.session.measurement && detail.session.measurement.recorded === true),
  });
  return {
    t0: timed.t0, t1: timed.t1, timedOut: timed.timedOut, aborted: false, startFailed: false,
    runTask, taskJson: json, errorText: timed.errorText, sessionId: timed.sessionId, sessionDetail,
  };
}

/**
 * Host arm (Claude Code, or the experimental Cursor driver): run the host,
 * then find the MCP sessions (mode mcp-agent) that started inside the run's
 * window and read each one's get_session_detail measurement.
 */
export async function runHostArm({ deps, client, launch }) {
  const run = await launch();
  const base = {
    t0: run.t0, initAt: run.initAt, t1: run.t1, exitedAt: run.exitedAt, timedOut: run.timedOut === true,
    aborted: run.aborted === true, spawnError: run.spawnError || null, hostSummary: run.summary || null,
    envKeyNamesSha256: run.envKeyNamesSha256 || null,
  };
  if (base.aborted || base.spawnError) return { ...base, sessions: [], sessionMatch: 'none' };
  const windowEnd = Number.isFinite(run.t1) ? run.t1 : (Number.isFinite(run.exitedAt) ? run.exitedAt : deps.now());
  let listed = [];
  try {
    listed = await deps.listSessions(client, 50);
  } catch {
    listed = [];
  }
  const inWindow = (Array.isArray(listed) ? listed : [])
    .filter((entry) => isPlainObject(entry) && entry.mode === 'mcp-agent' && typeof entry.id === 'string' && entry.id
      && Number.isFinite(entry.startTime) && entry.startTime >= run.t0 && entry.startTime <= windowEnd)
    .sort((a, b) => a.startTime - b.startTime);
  const sessions = [];
  for (const entry of inWindow.slice(0, MAX_HOST_SESSIONS)) {
    const detail = await deps.getSessionDetailWithRetry(client, entry.id, {
      attempts: 3,
      delayMs: 500,
      until: (value) => !!(value && value.session && value.session.measurement && value.session.measurement.kind === 'mcp'),
    });
    sessions.push({ id: entry.id, detail });
  }
  let sessionMatch = 'none';
  if (inWindow.length === 1) sessionMatch = 'unique';
  else if (inWindow.length > 1) sessionMatch = 'multiple';
  return { ...base, sessions, sessionMatch };
}

function measurementOf(detail) {
  return detail && isPlainObject(detail.session) && isPlainObject(detail.session.measurement) ? detail.session.measurement : null;
}

function hostClaimed(arm, summary) {
  const source = isPlainObject(summary) ? summary : {};
  const result = isPlainObject(source.result) ? source.result : {};
  const byName = isPlainObject(source.toolUses) && isPlainObject(source.toolUses.byName) ? source.toolUses.byName : {};
  return {
    status: null,
    partialOutcome: null,
    isError: typeof result.isError === 'boolean' ? result.isError : null,
    subtype: typeof result.subtype === 'string' ? result.subtype : null,
    completeTask: arm === 'claude' ? (byName.mcp__fsb__complete_task || 0) > 0 : null,
  };
}

function sessionErrorTextOf(detail) {
  if (!detail || !isPlainObject(detail.session)) return null;
  const session = detail.session;
  const parts = [session.error, isPlainObject(session.outcomeDetails) ? session.outcomeDetails.error : null]
    .filter((part) => typeof part === 'string' && part);
  return parts.length ? parts.join('\n') : null;
}

/**
 * Builds the per-run executor. Each call runs one schedule entry through its
 * arm, collects the independent evidence after the timed window, evaluates
 * the claim-blind outcome, classifies infra errors, and returns
 * { record, aborted, cleanup }: the raw record (claims stored, never passed
 * to evaluateOutcome; error texts never stored) and a cleanup that closes the
 * run's targets and clears its fixture token.
 */
export function createRunExecutor({
  campaignId, tasksById, fixtureSha256ById, fixtureServer = null, cdpPort = null, arms, collectEvidence, cleanup,
  streamsDir, now = () => Date.now(), signal = null,
}) {
  return async function executeRun(entry, { attempt }) {
    const task = tasksById.get(entry.taskId);
    if (!task) throw new Error(`schedule names an unknown task ${entry.taskId}`);
    let token = null;
    let startUrl;
    if (task.set === 'core') {
      token = fixtureServer.newRunToken();
      startUrl = fixtureServer.runUrl(token, task.startPath);
    } else {
      startUrl = task.startUrl;
    }
    const instruction = renderInstruction(task, startUrl);
    const startedAt = new Date(now()).toISOString();
    const isHost = HOST_ARMS.includes(entry.arm);
    let rawStreamPath = null;
    if (isHost && streamsDir) {
      fs.mkdirSync(streamsDir, { recursive: true, mode: 0o700 });
      rawStreamPath = path.join(streamsDir, `${entry.runId}.attempt${attempt}.jsonl`);
    }

    let result = null;
    let armError = null;
    const armFn = arms[entry.arm];
    try {
      if (typeof armFn !== 'function') throw new Error(`no driver for arm ${entry.arm}`);
      result = await armFn({ entry, task, attempt, instruction, startUrl, token, signal, rawStreamPath });
    } catch (error) {
      armError = error || new Error('arm failed');
    }

    // Evidence after the timed window; the agent's claims are not part of it.
    let evidence = { requests: null, finalUrl: null, markers: {}, text: null, targetIds: [] };
    let evidenceCollected = true;
    try {
      evidence = await collectEvidence({ task, token });
      if (evidence && evidence.collectionFailed === true) evidenceCollected = false;
    } catch {
      evidenceCollected = false;
    }
    const runCleanup = async () => {
      try {
        await cleanup({ targetIds: evidence && Array.isArray(evidence.targetIds) ? evidence.targetIds : [], token, task });
      } catch {
        // best effort; a leftover tab never fails the run
      }
    };
    if (result && result.aborted === true) return { record: null, aborted: true, cleanup: runCleanup };

    const outcome = evaluateOutcome(task, evidence, { token });

    let sessionDetail = null;
    let measurement = null;
    let sessions = [];
    let sessionMatch = 'none';
    if (isHost) {
      const found = result && Array.isArray(result.sessions) ? result.sessions : [];
      sessions = found.map((session) => ({ id: session.id, measurement: measurementOf(session.detail), detail: session.detail }));
      let best = null;
      for (const session of sessions) {
        const calls = session.measurement && Number.isFinite(session.measurement.calls) ? session.measurement.calls : -1;
        if (!best || calls > best.calls) best = { calls, session };
      }
      sessionDetail = best ? best.session.detail || null : null;
      measurement = best ? best.session.measurement : null;
      sessionMatch = result && typeof result.sessionMatch === 'string' ? result.sessionMatch : 'none';
    } else if (result) {
      sessionDetail = result.sessionDetail || null;
      measurement = measurementOf(sessionDetail);
      sessionMatch = sessionDetail && isPlainObject(sessionDetail.session) ? 'unique' : 'none';
      if (typeof result.sessionId === 'string' && result.sessionId) sessions = [{ id: result.sessionId, measurement }];
    }

    let infraError = armError
      ? 'spawn_failed'
      : classifyInfra({
        arm: entry.arm,
        hostSummary: result ? result.hostSummary || null : null,
        taskJson: result ? result.taskJson || null : null,
        errorText: result ? result.errorText || null : null,
        sessionErrorText: isHost ? null : sessionErrorTextOf(sessionDetail),
        timedOut: !!(result && result.timedOut === true),
        sessionDetail,
        sessionMatch,
        startFailed: !!(result && (result.startFailed === true || result.spawnError)),
      });
    // Without the post-window CDP read the outcome cannot be judged: the bench
    // browser (and the extension in it) is gone, which is not a task failure.
    if (!infraError && !evidenceCollected) infraError = 'extension_not_connected';

    const flags = new Set(sessionDetailFlags({ arm: entry.arm, sessionDetail }));
    if (task.set === 'live') flags.add('live_task');
    if (entry.arm === 'cursor') flags.add('experimental_arm');
    if (entry.arm === 'autopilot' && servedModelMatch(measurement) === false) flags.add('served_model_mismatch');
    if (measurement && measurement.idleTimeout === true) flags.add('idle_timeout_session');
    if (sessionMatch === 'multiple') flags.add('multiple_mcp_sessions');

    const t0 = result && Number.isFinite(result.t0) ? result.t0 : null;
    const endAt = result ? (Number.isFinite(result.t1) ? result.t1 : (isHost && Number.isFinite(result.exitedAt) ? result.exitedAt : null)) : null;
    const wallMs = t0 !== null && endAt !== null && endAt >= t0 ? endAt - t0 : null;
    const wallFromInitMs = isHost && result && Number.isFinite(result.initAt) && Number.isFinite(result.t1) && result.t1 >= result.initAt
      ? result.t1 - result.initAt
      : null;
    const runTask = !isHost && result && isPlainObject(result.runTask) ? result.runTask : null;
    const claimed = isHost
      ? hostClaimed(entry.arm, result ? result.hostSummary : null)
      : {
        status: runTask ? runTask.status : null,
        partialOutcome: runTask ? runTask.partialOutcome : null,
        isError: runTask && typeof runTask.isError === 'boolean' ? runTask.isError : null,
        subtype: null,
        completeTask: null,
      };

    const record = {
      schemaVersion: 1,
      campaignId,
      runId: entry.runId,
      attempt,
      set: task.set,
      taskId: task.id,
      taskVersion: task.version,
      category: task.category,
      fixtureSha256: fixtureSha256ById.get(task.id),
      arm: entry.arm,
      round: entry.round,
      order: entry.order,
      startedAt,
      timing: {
        t0,
        initAt: isHost && result && Number.isFinite(result.initAt) ? result.initAt : null,
        t1: result && Number.isFinite(result.t1) ? result.t1 : null,
        exitedAt: isHost && result && Number.isFinite(result.exitedAt) ? result.exitedAt : null,
      },
      wallMs,
      wallFromInitMs,
      timedOut: !!(result && result.timedOut === true),
      outcome: { pass: outcome.pass, checks: outcome.checks },
      infraError,
      claimed,
      // Session ids and the 66-06 measurement blocks only; never the detail.
      sessions: sessions.map((session) => ({ id: session.id, measurement: session.measurement })),
      sessionMatch,
      measurement,
      hostSummary: isHost && result ? result.hostSummary || null : null,
      runTask,
      evidence: {
        collected: evidenceCollected,
        requests: evidence ? evidence.requests : null,
        finalUrl: evidence ? evidence.finalUrl : null,
        markers: evidence ? evidence.markers : null,
        text: evidence ? evidence.text : null,
      },
      flags: RUN_FLAGS.filter((flag) => flags.has(flag)),
      stream: rawStreamPath ? path.basename(rawStreamPath) : null,
      armError: armError ? { name: String(armError.name || 'Error').slice(0, 40), message: safeMessage(armError) } : null,
    };
    return { record, aborted: false, cleanup: runCleanup };
  };
}

// --- Campaign loop ----------------------------------------------------------------------

function describeRow(row) {
  const wall = Number.isFinite(row.wallMs) ? ` in ${Math.round(row.wallMs)} ms` : '';
  if (row.infraError) return `infra ${row.infraError}${wall}`;
  if (row.pass) return `pass${wall}`;
  const failed = [...new Set(row.checks.filter((check) => !check.pass).map((check) => check.kind))].join(',');
  return `fail${row.timedOut ? ' (timed out)' : ''}${failed ? ` [${failed}]` : ''}${wall}`;
}

/**
 * Runs the schedule, saving every run the moment it ends. Resume semantics:
 * a runId whose latest raw record has infraError null is done and skipped;
 * any other runId runs again as attempt N+1, and the superseded record is
 * archived as <runId>.attempt<N>.json. runs.jsonl is regenerated from the
 * latest record of every runId after each run (one row per runId).
 * Returns { exitCode, paused, interrupted, ran }.
 */
export async function runCampaignLoop({
  schedule, campaignId, rawDir, outDir, progressPath, executeRun, resumeCommand,
  stdout = () => {}, stderr = () => {}, cooldownMs = 0, sleep = defaultSleep, isStopping = () => false, onRow = null,
}) {
  const line = (write, text) => write(`${text}\n`);
  fs.mkdirSync(rawDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(outDir, { recursive: true });
  const records = loadLatestRawRecords(rawDir, (text) => line(stderr, text));
  const rows = new Map();
  for (const [runId, record] of records) {
    const row = toCommittedRow(record);
    const check = validateCommittedRow(row);
    if (!check.ok) {
      line(stderr, `run-bench: raw record ${runId} does not make a valid row (${check.errors.slice(0, 5).join(', ')})`);
      return { exitCode: EXIT.ERROR, paused: null, interrupted: false, ran: 0 };
    }
    rows.set(runId, row);
  }
  writeRunsJsonl(outDir, rows);

  const total = schedule.length;
  const isDone = (runId) => {
    const latest = records.get(runId);
    return !!latest && latest.infraError === null;
  };
  const progress = (status, extra = {}) => {
    const done = schedule.filter((entry) => isDone(entry.runId)).length;
    writeJsonAtomic(progressPath, {
      campaignId, status, updatedAt: new Date().toISOString(), total, done, remaining: total - done, ...extra,
    });
  };
  progress('running');

  let consecutiveOther = 0;
  let ran = 0;
  for (const entry of schedule) {
    if (isDone(entry.runId)) continue;
    if (isStopping()) {
      progress('interrupted');
      return { exitCode: null, paused: null, interrupted: true, ran };
    }
    const latest = records.get(entry.runId);
    const attempt = latest && Number.isSafeInteger(latest.attempt) && latest.attempt >= 1 ? latest.attempt + 1 : 1;
    const { record, aborted, cleanup } = await executeRun(entry, { attempt });
    if (aborted || !record) {
      if (cleanup) await cleanup();
      progress('interrupted');
      return { exitCode: null, paused: null, interrupted: true, ran };
    }
    record.attempt = attempt;
    const row = toCommittedRow(record);
    const check = validateCommittedRow(row);
    if (!check.ok) {
      if (cleanup) await cleanup();
      line(stderr, `run-bench: ${entry.runId} did not make a valid row (${check.errors.slice(0, 5).join(', ')})`);
      progress('error');
      return { exitCode: EXIT.ERROR, paused: null, interrupted: false, ran };
    }
    if (latest && fs.existsSync(path.join(rawDir, `${entry.runId}.json`))) {
      fs.renameSync(path.join(rawDir, `${entry.runId}.json`), path.join(rawDir, `${entry.runId}.attempt${latest.attempt}.json`));
    }
    writeJsonAtomic(path.join(rawDir, `${entry.runId}.json`), record, 0o600);
    records.set(entry.runId, record);
    rows.set(entry.runId, row);
    writeRunsJsonl(outDir, rows);
    ran += 1;
    progress('running', { lastRunId: entry.runId });
    if (typeof onRow === 'function') onRow(row);
    line(stdout, `[${entry.order}/${total}] ${entry.runId} attempt ${attempt}: ${describeRow(row)}`);
    if (cleanup) await cleanup();

    const decision = pauseDecision(consecutiveOther, row.infraError);
    consecutiveOther = decision.consecutiveOther;
    if (decision.pause) {
      progress('paused', { pauseReason: decision.pause, lastRunId: entry.runId });
      line(stderr, `run-bench: paused on ${decision.pause} after ${entry.runId} (attempt ${attempt}).`);
      line(stderr, `run-bench: resume with: ${resumeCommand}`);
      return { exitCode: EXIT.PAUSED, paused: decision.pause, interrupted: false, ran };
    }
    if (cooldownMs > 0 && !isStopping()) await sleep(cooldownMs);
  }
  progress('complete');
  return { exitCode: EXIT.OK, paused: null, interrupted: false, ran };
}

// --- Identity ---------------------------------------------------------------------------

function loadedExtensionId(payload) {
  const extension = isPlainObject(payload) && isPlainObject(payload.extension) ? payload.extension : {};
  return typeof extension.id === 'string' && EXTENSION_ID_PATTERN.test(extension.id) ? extension.id : null;
}

/**
 * Run identity (D-18, W12, B3, W-B): ids, versions, digests, model and
 * provider names, host versions, env key NAMES with their SHA-256, and the
 * bench Chrome's launch flag names. No env value, key, credential, secret
 * or URL.
 */
async function collectIdentity({ deps, options, mode, campaignId, schedule, lock, pre, providerKeyNames }) {
  const payload = pre.config.ok ? pre.config.payload : {};
  const extension = isPlainObject(payload.extension) ? payload.extension : {};
  const marker = isPlainObject(extension.measurement) ? extension.measurement : {};
  const config = isPlainObject(payload.config) ? payload.config : {};
  let chrome = { browser: null, protocolVersion: null };
  if (pre.cdpPort) {
    try {
      chrome = await deps.browserVersion(pre.cdpPort);
    } catch {
      chrome = { browser: null, protocolVersion: null };
    }
  }
  const launchFlags = readLaunchFlags(options.launchRecord);
  const server = pre.serverIdentity;
  const identity = {
    schemaVersion: IDENTITY_SCHEMA_VERSION,
    campaignId: campaignId || null,
    mode,
    set: options.set,
    createdAt: new Date(deps.now()).toISOString(),
    schedule: schedule
      ? { runs: schedule.length, rounds: options.rounds, arms: options.arms, seed: options.seed, cooldownMs: options.cooldownMs }
      : null,
    git: { sha: typeof pre.git.sha === 'string' ? pre.git.sha : null, dirty: typeof pre.git.dirty === 'boolean' ? pre.git.dirty : null },
    node: process.version,
    extension: {
      id: label(extension.id, 64),
      version: label(extension.version, 40),
      measurement: {
        callTiming: Number.isInteger(marker.callTiming) ? marker.callTiming : null,
        sessionDetailJournal: Number.isInteger(marker.sessionDetailJournal) ? marker.sessionDetailJournal : null,
      },
      telemetryOptOut: pre.telemetryOptOut,
      startTabActive: true,
    },
    mcp: {
      serverName: server.serverVersion ? label(server.serverVersion.name, 80) : null,
      serverVersion: server.serverVersion ? label(server.serverVersion.version, 40) : null,
      sdkVersion: label(server.sdkVersion, 40),
      toolsList: { count: server.toolsList.count, sha256: server.toolsList.sha256 },
    },
    provider: {
      kind: label(config.providerKind, 40),
      name: label(config.modelProvider, 40),
      requestedModel: label(config.modelName, 128),
      pinnedModel: PINNED_AUTOPILOT_MODEL,
    },
    hosts: {},
    chrome: {
      browser: label(chrome && chrome.browser, 120),
      protocolVersion: label(chrome && chrome.protocolVersion, 20),
      launchFlags,
      launchRecord: launchFlags ? 'present' : 'missing',
    },
    tasks: lock || [],
  };
  if (options.arms.includes('claude')) {
    const env = buildBenchChildEnv(process.env, { toolSearch: options.claudeToolSearch, providerKeyNames });
    identity.hosts.claude = {
      name: 'claude-code',
      version: deps.claudeVersion({ providerKeyNames }),
      model: options.claudeModel,
      toolSearchEnv: options.claudeToolSearch,
      toolLoadingObserved: [],
      envKeyNames: env.keyNames,
      envKeyNamesSha256: env.keyNamesSha256,
      agentPolicySha256: sha256Hex(serializeFsbAgents(readFsbAgentPolicy(deps.repoRoot))),
    };
  }
  if (options.arms.includes('cursor')) {
    identity.hosts.cursor = {
      name: 'cursor-agent',
      version: deps.cursorVersion({ providerKeyNames }),
      model: options.cursorModel,
      experimental: true,
    };
  }
  return identity;
}

// Fields a resumed campaign must share with the one it continues.
function stableIdentity(identity) {
  const hostsClaude = isPlainObject(identity.hosts) && isPlainObject(identity.hosts.claude) ? identity.hosts.claude : {};
  return {
    set: identity.set,
    mode: identity.mode,
    schedule: identity.schedule ? { rounds: identity.schedule.rounds, arms: identity.schedule.arms, seed: identity.schedule.seed } : null,
    gitSha: identity.git ? identity.git.sha : null,
    extensionId: identity.extension ? identity.extension.id : null,
    extensionVersion: identity.extension ? identity.extension.version : null,
    toolsSha256: identity.mcp && identity.mcp.toolsList ? identity.mcp.toolsList.sha256 : null,
    requestedModel: identity.provider ? identity.provider.requestedModel : null,
    claudeModel: hostsClaude.model || null,
    claudeToolSearch: hostsClaude.toolSearchEnv || null,
    claudeEnvKeys: hostsClaude.envKeyNamesSha256 || null,
    tasks: identity.tasks,
  };
}

function identityMismatches(prior, current) {
  const a = stableIdentity(prior);
  const b = stableIdentity(current);
  return Object.keys(a).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}

// --- Preflight --------------------------------------------------------------------------

// The runner's server binds 7225 while the MCP handshake completes, so the
// listener is polled briefly (a bounded number of 250 ms steps).
async function waitForHubListener(deps, serverPid) {
  let pid = deps.hubListenerPid();
  for (let step = 0; pid !== serverPid && step < HUB_OWNERSHIP_WAIT_MS / HUB_POLL_MS; step += 1) {
    await deps.sleep(HUB_POLL_MS);
    pid = deps.hubListenerPid();
  }
  return pid;
}

async function runPreflight({ deps, options, mode, client, transport, sdkVersion }) {
  const serverIdentity = await deps.collectServerIdentity(client, transport, sdkVersion);
  const listenerPid = await waitForHubListener(deps, serverIdentity.serverPid);
  const config = await deps.readFsbConfig(client);
  let git;
  try {
    git = deps.gitIdentity(deps.repoRoot);
  } catch {
    git = { sha: null, dirty: null, dirtyPaths: [] };
  }
  const preflight = evaluatePreflight({
    mode,
    arms: options.arms,
    configPayload: config.ok ? config.payload : null,
    hub: { listenerPid, serverPid: serverIdentity.serverPid },
    claudeModel: options.claudeModel,
    expectExtensionId: options.expectExtensionId,
    git,
    allowDirty: options.allowDirty,
    toolsList: serverIdentity.toolsList,
  });
  let cdpPort = null;
  try {
    cdpPort = await deps.readDevToolsPort(options.chromeProfile, 5000);
  } catch {
    cdpPort = null;
  }
  const extensionId = options.expectExtensionId || loadedExtensionId(config.ok ? config.payload : null);
  let telemetryOptOut = null;
  if (cdpPort && extensionId) {
    try {
      telemetryOptOut = await deps.readExtensionStorageFlag(cdpPort, extensionId, TELEMETRY_KEY);
    } catch {
      telemetryOptOut = null;
    }
  }
  const safety = evaluateBenchSafety({ telemetryOptOut });
  return {
    ok: preflight.ok && safety.ok,
    refusals: [...preflight.refusals, ...safety.refusals],
    serverIdentity,
    listenerPid,
    config,
    git,
    cdpPort,
    telemetryOptOut: typeof telemetryOptOut === 'boolean' ? telemetryOptOut : null,
  };
}

function isConnectedConfig(result) {
  return !!(result && result.ok && isPlainObject(result.payload) && result.payload.success !== false && isPlainObject(result.payload.config));
}

async function pairViaCdp({ deps, options, client }) {
  let port;
  try {
    port = await deps.readDevToolsPort(options.chromeProfile, 10000);
  } catch {
    return { ok: false, reason: 'cdp_unavailable' };
  }
  let delivered;
  {
    let code = null;
    try {
      code = await deps.readPairingCode(deps.repoRoot);
    } catch (error) {
      return { ok: false, reason: error && REASON_PATTERN.test(error.message) ? error.message : 'pair_json_failed' };
    }
    try {
      delivered = await deps.pairExtensionViaCdp(port, options.expectExtensionId, code);
    } catch {
      delivered = { ok: false, reason: 'cdp_pairing_failed' };
    }
    code = null;
  }
  if (!delivered || delivered.ok !== true) {
    const reason = delivered && typeof delivered.reason === 'string' && REASON_PATTERN.test(delivered.reason) ? delivered.reason : 'cdp_pairing_failed';
    return { ok: false, reason };
  }
  for (let step = 0; step <= PAIRING_CONNECT_TIMEOUT_MS / PAIRING_POLL_MS; step += 1) {
    if (step > 0) await deps.sleep(PAIRING_POLL_MS);
    if (isConnectedConfig(await deps.readFsbConfig(client))) return { ok: true, reason: null };
  }
  return { ok: false, reason: 'extension_not_connected_after_pairing' };
}

// --- Production evidence and cleanup ------------------------------------------------------

function productionEvidence({ deps, fixtureServer, cdpPort }) {
  return async ({ task, token }) => {
    if (task.set === 'core') {
      // The request log is in process and always available; the CDP read can
      // fail only when the bench browser is unreachable.
      const requests = fixtureServer.evidence(token).requests;
      try {
        const cdp = await deps.collectCoreEvidence(cdpPort, token);
        return { requests, finalUrl: cdp.finalUrl, markers: cdp.markers, text: null, targetIds: cdp.targetIds };
      } catch {
        return { requests, finalUrl: null, markers: {}, text: null, targetIds: [], collectionFailed: true };
      }
    }
    try {
      const live = await deps.collectLiveEvidence(cdpPort, task);
      return { requests: null, finalUrl: live.finalUrl, markers: {}, text: live.text, targetIds: live.targetIds };
    } catch {
      return { requests: null, finalUrl: null, markers: {}, text: null, targetIds: [], collectionFailed: true };
    }
  };
}

function productionCleanup({ deps, fixtureServer, cdpPort }) {
  return async ({ targetIds, token }) => {
    if (cdpPort && Array.isArray(targetIds) && targetIds.length) await deps.closeTargets(cdpPort, targetIds);
    if (token && fixtureServer) fixtureServer.clear(token);
  };
}

function productionArms({ deps, client, options, providerKeyNames }) {
  return {
    autopilot: ({ task, startUrl, instruction, signal }) => runAutopilotArm({ deps, client, task, startUrl, instruction, signal }),
    claude: ({ task, instruction, signal, rawStreamPath }) => runHostArm({
      deps,
      client,
      launch: () => deps.runClaudeTask({
        repoRoot: deps.repoRoot,
        instruction,
        model: options.claudeModel,
        budgetMs: task.timeBudgetMs,
        rawStreamPath,
        toolSearch: options.claudeToolSearch,
        providerKeyNames,
        signal,
      }),
    }),
    cursor: ({ task, instruction, signal, rawStreamPath }) => runHostArm({
      deps,
      client,
      launch: () => deps.runCursorTask({
        repoRoot: deps.repoRoot,
        instruction,
        model: options.cursorModel || undefined,
        budgetMs: task.timeBudgetMs,
        rawStreamPath,
        providerKeyNames,
        signal,
      }),
    }),
  };
}

// --- Main --------------------------------------------------------------------------------

function selectTasks(options) {
  let tasks = loadTasks({ tasksRoot: options.tasksRoot, fixturesRoot: options.fixturesRoot, set: options.set });
  if (options.tasks) {
    const unknown = options.tasks.filter((id) => !tasks.some((task) => task.id === id));
    if (unknown.length) return { error: issue('tasks_unknown', `--tasks names ${unknown.length} task(s) that are not in the ${options.set} set`) };
    tasks = tasks.filter((task) => options.tasks.includes(task.id));
  }
  if (!tasks.length) return { error: issue('tasks_empty', `no ${options.set} tasks were found`) };
  return { tasks };
}

function defaultCampaignId(options, deps) {
  const day = new Date(deps.now()).toISOString().slice(0, 10).replace(/-/g, '');
  return `${options.set}-${day}-${deps.gitShortSha(deps.repoRoot)}`;
}

/**
 * CLI entry. Returns the exit code; never calls process.exit itself.
 * overrides replace any dependency (tests inject fakes; nothing live then).
 */
export async function main(argv = process.argv.slice(2), overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  const out = (text) => deps.stdout(`${text}\n`);
  const err = (text) => deps.stderr(`${text}\n`);
  const refuse = (heading, issues) => {
    err(`run-bench: ${heading}:`);
    for (const item of issues) err(`  - ${item.code}${item.detail ? `: ${item.detail}` : ''}`);
    return EXIT.REFUSED;
  };

  const parsed = parseArgs(argv);
  if (parsed.raw['--help'] === true || parsed.raw['-h'] === true) {
    out(USAGE);
    return EXIT.OK;
  }
  const { options, errors } = resolveOptions(parsed.raw);
  const allErrors = [...parsed.errors, ...errors];
  if (allErrors.length) {
    refuse('refusing to start', allErrors);
    if (parsed.unknown) err(USAGE);
    return EXIT.REFUSED;
  }
  const mode = options.mode;

  // Tasks, fixture hashes and the schedule (everything but --preflight).
  let tasks = [];
  let lock = null;
  let schedule = null;
  let campaignId = options.campaignId;
  if (mode !== 'preflight') {
    let selected;
    try {
      selected = selectTasks(options);
    } catch (error) {
      err(`run-bench: tasks could not be loaded: ${safeMessage(error)}`);
      return EXIT.ERROR;
    }
    if (selected.error) return refuse('refusing to start', [selected.error]);
    tasks = selected.tasks;
    try {
      lock = tasks.map((task) => ({ id: task.id, version: task.version, fixtureSha256: fixtureSha256(task, options.fixturesRoot) }));
    } catch (error) {
      err(`run-bench: fixtures could not be hashed: ${safeMessage(error)}`);
      return EXIT.ERROR;
    }
    if (!campaignId) campaignId = defaultCampaignId(options, deps);
    if (!CAMPAIGN_ID_PATTERN.test(campaignId)) return refuse('refusing to start', [issue('campaign_id_invalid', 'the campaign id is not valid')]);
    schedule = buildSchedule({ campaignId, taskIds: tasks.map((task) => task.id), rounds: options.rounds, arms: options.arms, seed: options.seed });
  }

  if (options.dryRun) {
    out(JSON.stringify({
      campaignId, mode, set: options.set, runs: schedule.length, arms: options.arms, rounds: options.rounds,
      seed: options.seed, tasks: lock,
    }));
    return EXIT.OK;
  }

  const runDir = campaignId ? path.join(deps.localRoot, campaignId) : null;
  const outDir = campaignId ? (mode === 'campaign' ? path.join(deps.resultsRoot, campaignId) : runDir) : null;
  const rawDir = runDir ? path.join(runDir, 'runs') : null;
  if (mode === 'smoke' || mode === 'campaign') {
    const existing = campaignHasRecords(rawDir, outDir);
    if (options.resume && !existing) return refuse('refusing to start', [issue('resume_not_found', `no saved runs for campaign ${campaignId}`)]);
    if (!options.resume && existing) {
      return refuse('refusing to start', [issue('campaign_exists', `campaign ${campaignId} already has saved runs; pass --resume ${campaignId} to continue it`)]);
    }
  }

  const stop = new AbortController();
  let receivedSignal = null;
  const handleSignal = (signalName) => {
    if (receivedSignal) return;
    receivedSignal = signalName;
    err(`run-bench: ${signalName} received; finishing the current run's cleanup`);
    stop.abort();
  };
  const onSigint = () => handleSignal('SIGINT');
  const onSigterm = () => handleSignal('SIGTERM');
  if (deps.installSignalHandlers) {
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  }
  const signalExit = () => (receivedSignal === 'SIGINT' ? EXIT.SIGINT : EXIT.SIGTERM);

  let runner = null;
  let fixtureServer = null;
  try {
    const serverLog = mode === 'preflight'
      ? path.join(deps.localRoot, 'preflight', 'mcp-server.stderr.log')
      : path.join(runDir, 'mcp-server.stderr.log');
    runner = await deps.openRunnerClient({ repoRoot: deps.repoRoot, stderrLogPath: serverLog });
    if (receivedSignal) return signalExit();

    if (options.pairViaCdp) {
      const paired = await pairViaCdp({ deps, options, client: runner.client });
      if (!paired.ok) return refuse('pairing refused', [issue('pairing_failed', paired.reason)]);
      err('run-bench: bench extension paired over CDP (the pairing code is never shown)');
    }

    const pre = await runPreflight({ deps, options, mode, client: runner.client, transport: runner.transport, sdkVersion: runner.sdkVersion });
    if (!pre.ok) return refuse('preflight refused', pre.refusals);
    if (receivedSignal) return signalExit();

    const hostArms = options.arms.filter((arm) => HOST_ARMS.includes(arm));
    const providerKeyNames = hostArms.length ? await deps.loadProviderKeyNames(deps.repoRoot) : [];
    let identity = await collectIdentity({ deps, options, mode, campaignId, schedule, lock, pre, providerKeyNames });

    if (mode === 'preflight') {
      out(JSON.stringify({
        ok: true,
        mode,
        hub: { listenerPid: pre.listenerPid, serverPid: pre.serverIdentity.serverPid, owned: true },
        identity,
      }, null, 2));
      return EXIT.OK;
    }

    // Smoke or campaign: identity first, then the schedule.
    const identityPath = path.join(outDir, 'identity.json');
    if (options.resume && fs.existsSync(identityPath)) {
      const prior = JSON.parse(fs.readFileSync(identityPath, 'utf8'));
      const mismatched = identityMismatches(prior, identity);
      if (mismatched.length) {
        return refuse('resume refused', [issue('resume_identity_mismatch', `these identity fields changed since the campaign started: ${mismatched.join(', ')}`)]);
      }
      const resumes = Array.isArray(prior.resumes) ? prior.resumes : [];
      prior.resumes = [...resumes, {
        at: identity.createdAt,
        claudeVersion: identity.hosts.claude ? identity.hosts.claude.version : null,
        chromeBrowser: identity.chrome.browser,
        launchFlags: identity.chrome.launchFlags,
      }];
      identity = prior;
    }
    if (options.set === 'core') fixtureServer = await deps.startFixtureServer({ root: options.fixturesRoot });
    writeJsonAtomic(identityPath, identity);
    err(`run-bench: identity written to ${path.relative(deps.repoRoot, identityPath)}`);

    const executeRun = createRunExecutor({
      campaignId,
      tasksById: new Map(tasks.map((task) => [task.id, task])),
      fixtureSha256ById: new Map(lock.map((entry) => [entry.id, entry.fixtureSha256])),
      fixtureServer,
      cdpPort: pre.cdpPort,
      arms: productionArms({ deps, client: runner.client, options, providerKeyNames }),
      collectEvidence: productionEvidence({ deps, fixtureServer, cdpPort: pre.cdpPort }),
      cleanup: productionCleanup({ deps, fixtureServer, cdpPort: pre.cdpPort }),
      streamsDir: path.join(runDir, 'streams'),
      now: deps.now,
      signal: stop.signal,
    });

    // The first observed tool-loading mode (init.tools) is added to identity.
    const onRow = (row) => {
      const claude = identity.hosts && identity.hosts.claude;
      const modeSeen = row.host && row.host.toolLoading;
      if (claude && typeof modeSeen === 'string') {
        const observed = Array.isArray(claude.toolLoadingObserved) ? claude.toolLoadingObserved : [];
        if (!observed.includes(modeSeen)) {
          claude.toolLoadingObserved = [...observed, modeSeen].sort();
          writeJsonAtomic(identityPath, identity);
        }
      }
    };

    const result = await runCampaignLoop({
      schedule,
      campaignId,
      rawDir,
      outDir,
      progressPath: path.join(runDir, 'progress.json'),
      executeRun,
      resumeCommand: buildResumeCommand(argv, campaignId),
      stdout: deps.stdout,
      stderr: deps.stderr,
      cooldownMs: options.cooldownMs,
      sleep: deps.sleep,
      isStopping: () => receivedSignal !== null,
      onRow,
    });
    if (result.interrupted) return signalExit();
    if (result.exitCode === EXIT.OK) {
      err(`run-bench: ${campaignId} finished (${result.ran} runs this session). Report: node scripts/bench/report.mjs ${path.relative(deps.repoRoot, outDir)}`);
    }
    return result.exitCode;
  } catch (error) {
    err(`run-bench: ERROR ${safeMessage(error)}`);
    return receivedSignal ? signalExit() : EXIT.ERROR;
  } finally {
    if (fixtureServer) {
      try { await fixtureServer.close(); } catch { /* already closed */ }
    }
    if (runner) {
      try { await runner.close(); } catch { /* already closed */ }
    }
    if (deps.installSignalHandlers) {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
    }
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
    setTimeout(() => process.exit(code), 5000).unref();
  }, (error) => {
    process.stderr.write(`run-bench: ERROR ${safeMessage(error)}\n`);
    process.exitCode = EXIT.ERROR;
  });
}
