import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, stat, lstat, writeFile, mkdtemp, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BENCH_ROOT, REPO_ROOT, RESULTS_DIR } from './proc.mjs';
import { loadTasks } from './dataset.mjs';
import { hashTree } from './fingerprint.mjs';
import { acquireRunLock, atomicJson } from './run-state.mjs';
import { PROFILE_ID, ALLOWED_TOOLS, profileFor, toolsForProfile } from './browser-manual-profile.mjs';
import { publicAttemptBlocker, verifyPublicDisposition } from './public-disposition.mjs';
import { manualLiveGate, inspectArtifacts, FIXTURE_PATH } from './manual-live-gate.mjs';
import { pairedPilot, fixedCanary, operationMetrics, concurrencyDecision } from './manual-pilot.mjs';
import { collectManual, circuit, DEFAULT_CIRCUIT, sourceFingerprint, assertDiskBudget } from './manual-runner.mjs';
import { runJudgeJobs, judgeMatrix } from './judge-jobs.mjs';
import { writeBlindedReviewBundle, writeManualReport, trajectoryFingerprint, verifyFinalizedManualReport } from './manual-report.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';
import { writePilotCheckpointBundle, verifyPilotReviewComplete } from './manual-pilot-review.mjs';
import { queueTimingEvidence } from './queue-timing.mjs';
import { waitForResource } from './readiness.mjs';
import { verifyClaudeImageContract } from './claude-image-contract.mjs';
import { MODEL, EFFORT, JUDGE_ENGINE, CLAUDE_CLI } from './model-family.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATASET_SHA256 = '7dedf381531d423dc0fc48d21dc1d425655dd75f38b10211a880fa09102f257f';
const DEFAULT_HISTORICAL = path.join(RESULTS_DIR, 'full-codex-20261016-capture-recovery');
const DIAGNOSTIC_SAMPLE = path.join(REPO_ROOT, '.context/om2w/postmortem-cases-sample.json');
const PROFILE_PATH = path.join(BENCH_ROOT, 'config/browser-manual-v2.json');
const now = () => new Date().toISOString();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => readFile(file, 'utf8').then(JSON.parse);
const canonical = value => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const same = (left, right) => canonical(left) === canonical(right);

async function optionalJson(file) {
  try { return await json(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function entries(directory) {
  try { return await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function descriptor(file) {
  const bytes = await readFile(file);
  return { path: path.resolve(file), bytes: bytes.length, sha256: hash(bytes) };
}
function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
async function assertDescriptor(saved) {
  if (!saved?.path || !same(await descriptor(saved.path), saved)) throw new Error('Saved pipeline evidence changed');
}
function commandArray(value) {
  if (!Array.isArray(value) || value.length !== 3 || value.some(arg => typeof arg !== 'string' || !arg)
      || value[2] !== 'stdio' || !path.isAbsolute(value[0]) || !path.isAbsolute(value[1])) {
    throw new Error('FSB server command must be [absolute-node, absolute-build/index.js, "stdio"]');
  }
  return value;
}

export async function resolveExecutable(name, searchPath = process.env.PATH ?? '') {
  const candidates = path.isAbsolute(name) ? [name] : searchPath.split(path.delimiter).map(directory => path.resolve(directory || '.', name));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return realpath(candidate);
    } catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error; }
  }
  throw new Error(`Required executable ${name} is not available on the controller child PATH`);
}

export async function capturePipelineSources({ serverCommand, extensionDir }) {
  const runtimeBuild = path.dirname(await realpath(serverCommand[1]));
  const runtimeAI = path.resolve(runtimeBuild, '../ai');
  const worktreeBuild = path.join(REPO_ROOT, 'mcp/build');
  const worktreeAI = path.join(REPO_ROOT, 'mcp/ai');
  const installedPackage = path.join(homedir(), '.fsb/native-host/runtime/package');
  const [fingerprints, stagedBuild, stagedAI, builtBuild, builtAI, nativeBuild, nativeAI] = await Promise.all([
    sourceFingerprint({ serverCommand, extensionDir }), hashTree(runtimeBuild, () => true), hashTree(runtimeAI, () => true),
    hashTree(worktreeBuild, () => true), hashTree(worktreeAI, () => true),
    hashTree(path.join(installedPackage, 'build'), () => true), hashTree(path.join(installedPackage, 'ai'), () => true),
  ]);
  if (stagedBuild !== builtBuild || stagedAI !== builtAI) throw new Error('Staged FSB client build/AI bytes differ from the repaired worktree build');
  const files = [fileURLToPath(import.meta.url), FIXTURE_PATH, PROFILE_PATH,
    path.resolve(runtimeBuild, '../server.json'), path.join(installedPackage, 'server.json'),
    path.join(BENCH_ROOT, 'config/browser-manual-v2-canary.json'), DIAGNOSTIC_SAMPLE,
    path.join(BENCH_ROOT, 'judge/upstream/src/methods/webjudge_online_mind2web.py'),
    path.join(BENCH_ROOT, 'judge/upstream/src/utils.py'), path.join(BENCH_ROOT, 'judge/requirements.lock.txt')];
  const manifest = await json(path.join(extensionDir, 'manifest.json'));
  const toolchain = { claude: await descriptor(CLAUDE_CLI),
    node: await descriptor(await realpath(process.execPath)), node_version: process.version,
    fsb_node: await descriptor(await realpath(serverCommand[0])) };
  return { fingerprints, toolchain, staged_client: { build_dir: runtimeBuild, build_sha256: stagedBuild, ai_sha256: stagedAI,
    matches_worktree_build: true }, installed_native_transport: { package_dir: installedPackage,
    build_sha256: nativeBuild, ai_sha256: nativeAI },
    extension_manifest: { manifest_version: manifest.manifest_version, name: manifest.name, version: manifest.version,
      key_sha256: manifest.key ? hash(manifest.key) : null }, files: await Promise.all(files.map(descriptor)) };
}

export async function assertResumeSafe(runDirs, { publicRelease = false } = {}) {
  const inspected = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return []; throw error;
    })) {
      if (entry.isSymbolicLink()) throw new Error('Pipeline run paths cannot contain artifact symlinks');
      if (!entry.isDirectory()) continue;
      const child = path.join(directory, entry.name);
      if (['raw', 'trajectories', 'judge'].includes(entry.name)) continue;
      await visit(child);
    }
    const manifest = await optionalJson(path.join(directory, 'manifest.json'));
    if (!manifest || !Array.isArray(manifest.attempts)) return;
    const lock = await optionalJson(path.join(directory, '.lock'));
    if (lock) {
      if (!Number.isInteger(lock.pid) || lock.pid < 1) throw new Error('Pipeline resume found an invalid run lock');
      try { process.kill(lock.pid, 0); throw new Error('Pipeline resume refused: another controller still owns a run lock'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    if (manifest.active_task_ids?.length || (await Promise.all(manifest.attempts.map(attempt => publicAttemptBlocker(attempt, { publicRelease })))).some(Boolean)) {
      throw new Error('Pipeline resume refused: an attempt is in flight or owned cleanup/health is unverified');
    }
    for (const attempt of manifest.attempts.filter(attempt => attempt.final?.queue_expiries)) {
      if (manifest.config?.pilot_queue_timing !== true || !attempt.pilot_timing_failure?.valid
          || !same(await queueTimingEvidence(attempt.raw_dir), attempt.pilot_timing_failure)) throw new Error('Pipeline resume refused: queue expiry lacks verified pilot-only timing evidence');
    }
    if (manifest.state === 'paused_health') throw new Error('Pipeline health fault requires repair and a new gated output; ordinary resume is refused');
    inspected.push(path.join(directory, 'manifest.json'));
  }
  for (const directory of runDirs) await visit(directory);
  return inspected;
}

export function localGateReceipt(summary, { summaryEvidence, fingerprints, receiptPath }) {
  const tested = summary.concurrency?.map(row => row.workers).sort((a, b) => a - b);
  const passed = summary.concurrency?.filter(row => row.ok === true && row.physical_tests_complete === true && row.queue_expiries === 0 && row.physical_frames > 0).map(row => row.workers).sort((a, b) => a - b);
  if (summary.ok !== true || summary.correctness_ok !== true || summary.cleanup_ok !== true || !same(tested, [1, 2, 5, 10]) || !passed?.length
      || summary.concurrency.some(row => row.ok && !passed.includes(row.workers) || !row.ok && row.failure_kind !== 'timing')
      || summary.hard_queue_ms !== 60_000
      || !summary.sessions?.length || summary.sessions.some(session => session.cleanup_ok !== true
        || session.queue_expiries && !(session.level_timing_failed && session.queue_timing_evidence?.valid)
        || !session.artifacts?.physical_frames && !(session.level_timing_failed && session.queue_timing_evidence?.can_explain_missing_export))) {
    const requirement = 'Installed local gate requires all four tested levels, at least one full physical pass, and verified correctness/cleanup';
    throw Object.assign(new Error(requirement + (summary.error ? ': ' + summary.error : '')),
      { code: summary.error_code ?? 'LOCAL_GATE_FAILED' });
  }
  return { ok: true, kind: 'installed_browser_manual_local_gate', tested_levels: tested, passed_levels: passed, highest_passing_level: Math.max(...passed), cleanup_ok: true,
    fingerprints, summary: summaryEvidence, receipt_path: receiptPath, synthetic: true, no_model_calls: true };
}

export async function verifyLocalGateEvidence(summary, { gateDir, serverCommand }) {
  const manifest = await json(path.join(gateDir, 'manifest.json'));
  if (manifest.command_sha256 !== hash(JSON.stringify(serverCommand)) || !same(manifest.sources, summary.sources)
      || !summary.sources?.length) throw new Error('Saved local gate command or source inventory differs');
  for (const source of summary.sources) await assertDescriptor(source);
  for (const session of summary.sessions) {
    if (!within(gateDir, path.resolve(session.raw_dir ?? '.')) || !session.marker) throw new Error('Saved local gate evidence paths are invalid');
    if (session.queue_expiries && (!session.level_timing_failed || !same(await queueTimingEvidence(session.raw_dir), session.queue_timing_evidence))) throw new Error('Saved local queue timing evidence changed');
    if (!session.artifacts) {
      const proof = await queueTimingEvidence(session.raw_dir);
      if (!session.level_timing_failed || !proof.can_explain_missing_export || !same(proof, session.queue_timing_evidence)) throw new Error('Saved failed local level lacks queue-only timing evidence');
      for (const frame of proof.frames) {
        const url = new URL(frame.source_url);
        if (url.pathname !== '/fixture' || ![session.marker, `${session.marker}-popup`].includes(url.searchParams.get('marker'))) throw new Error('Partial local timing evidence belongs to a foreign fixture');
      }
      continue;
    }
    if (!within(gateDir, path.resolve(session.export_dir ?? '.')) || !session.artifacts.frames?.length) throw new Error('Saved local gate export paths or frame inventory are invalid');
    const origin = new URL(session.artifacts.frames[0].source_url).origin;
    const actual = await inspectArtifacts({ rawDir: session.raw_dir, exportDir: session.export_dir,
      expectedOrigin: origin, allowedMarkers: [session.marker, `${session.marker}-popup`] });
    if (!same(actual, session.artifacts)) throw new Error('Saved local gate physical PNG, emission or export evidence changed');
  }
  return { ok: true };
}

export async function verifyPilotExport({ directory, row, attempt, task, profilePath = PROFILE_PATH }) {
  const exported = path.join(directory, 'trajectories', row.task_id);
  const checked = await validateTrajectoryDir(exported);
  if (!checked.ok || row.raw_dir !== attempt.raw_dir || row.outcome !== attempt.final.outcome) throw new Error('Accepted pilot selected trajectory is invalid or bound to a different raw outcome');
  const temporary = await mkdtemp(path.join(tmpdir(), 'om2w-pilot-evidence-'));
  try {
    const rendered = await writeV2({ task, rawDir: attempt.raw_dir, outDir: temporary, allowlistPath: profilePath });
    if (await trajectoryFingerprint(rendered.dir) !== await trajectoryFingerprint(exported)) throw new Error('Accepted pilot physical export differs from its selected raw observation evidence');
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function validateAcceptedPilot(receipt, { outputDir, localReceipt, fingerprints, allTasks, source, serverCommand, extensionDir,
  publicRelease = false, publicPins = null, profilePath = PROFILE_PATH, verifyExport = verifyPilotExport }) {
  const receiptPath = path.join(outputDir, 'accepted-gate.json');
  const candidate = receipt?.selected_concurrency;
  const comparisonPath = path.join(outputDir, `concurrency-${candidate}`, 'comparison.json');
  const selected = await fixedCanary(allTasks);
  if (receipt?.ok !== true || ![1, 2, 5, 10].includes(candidate) || !localReceipt.passed_levels?.includes(candidate) || !same(receipt.fingerprints, fingerprints)
      || !(receipt.artifact_forecast_bytes > 0) || path.resolve(receipt.receipt_path ?? '.') !== receiptPath
      || path.resolve(receipt.comparison ?? '.') !== comparisonPath || !same(receipt.local_receipt, localReceipt)
      || receipt.fixed_sample_sha256 !== selected.spec.task_ids_sha256
      || receipt.budget?.timeout_seconds !== 1200 || receipt.budget?.max_actions !== 120) {
    throw new Error('Pilot acceptance lacks the matching source, fixed sample, local gate, budget, concurrency or disk forecast');
  }
  const comparison = await json(comparisonPath);
  const phases = [['serial-a', selected.serialA, 1], ['concurrent', selected.tasks, candidate], ['serial-b', selected.serialB, 1]];
  const partition = { ...selected.spec, serial_a_ids: selected.serialA.map(task => task.task_id),
    serial_b_ids: selected.serialB.map(task => task.task_id), fingerprints };
  if (!same(await json(path.join(outputDir, 'pilot-selection.json')), partition)) throw new Error('Accepted pilot partition differs from its frozen sample');
  let previousEnd = -Infinity;
  for (const [name, tasks, concurrency] of phases) {
    const directory = path.join(outputDir, `concurrency-${candidate}`, name);
    const manifest = await json(path.join(directory, 'manifest.json')), config = manifest.config;
    const ids = tasks.map(task => task.task_id);
    if (!config || config.profile !== profileFor(publicRelease).id || config.model !== MODEL || config.effort !== EFFORT
        || config.timeout_seconds !== 1200 || config.max_actions !== 120 || config.execution_concurrency !== concurrency || config.pilot_queue_timing !== true
        || !same(config.task_ids, ids) || !same(config.fingerprints, fingerprints)
        || (source && !same(config.source, source)) || (serverCommand && !same(config.server_command, serverCommand))
        || (extensionDir && config.extension_dir !== extensionDir)
        || publicRelease && (config.public_release !== true || !same(config.public_pins, publicPins))
        || config.gate_receipt?.kind !== 'pilot' || config.gate_receipt.local_receipt !== localReceipt.receipt_path
        || config.gate_receipt.fixed_sample_sha256 !== selected.spec.task_ids_sha256
        || manifest.collection_complete !== true || !same(manifest.outcomes.map(row => row.task_id).sort(), [...ids].sort())) {
      throw new Error('Accepted pilot phase config/task partition/concurrency differs from the actual gated condition');
    }
    let firstStart = Infinity, lastEnd = -Infinity;
    for (const attempt of manifest.attempts) {
      if (!ids.includes(attempt.task_id) || await publicAttemptBlocker(attempt, { publicRelease }) || attempt.final?.queue_expiries
          || attempt.raw_dir !== path.join(directory, 'raw', attempt.task_id, `attempt-${attempt.index}`)
          || !same(await json(path.join(attempt.raw_dir, 'final.json')), attempt.final)) throw new Error('Accepted pilot raw-final or cleanup evidence differs');
      const start = Date.parse(attempt.started_at), end = Date.parse(attempt.ended_at);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error('Accepted pilot attempt timing is invalid');
      firstStart = Math.min(firstStart, start); lastEnd = Math.max(lastEnd, end);
    }
    if (firstStart < previousEnd || !Number.isFinite(lastEnd)) throw new Error('Accepted pilot phases did not execute in the frozen counterbalanced order');
    previousEnd = lastEnd;
    for (const row of manifest.outcomes) {
      const attempt = manifest.attempts.find(attempt => attempt.task_id === row.task_id && attempt.index === row.selected_attempt);
      if (!attempt) throw new Error('Accepted pilot lacks a selected attempt');
      const disposition = publicRelease ? await verifyPublicDisposition(attempt.raw_dir, attempt.final) : null;
      if (disposition) {
        if (row.exported !== false || row.outcome !== attempt.final.outcome || row.raw_dir !== attempt.raw_dir) throw new Error('Public native failure selection differs');
        if (await optionalJson(path.join(directory, 'trajectories', row.task_id, 'result.json'))) throw new Error('Missing public frame was replaced by a prefix export');
      } else {
        if (row.exported !== true || row.validation?.ok !== true) throw new Error('Accepted pilot lacks a selected valid export for every phase task');
        await verifyExport({ directory, row, attempt, task: tasks.find(task => task.task_id === row.task_id), profilePath });
      }
    }
  }
  const actual = { serial: await operationMetrics([path.join(outputDir, `concurrency-${candidate}`, 'serial-a'), path.join(outputDir, `concurrency-${candidate}`, 'serial-b')], { publicRelease }),
    concurrent: await operationMetrics([path.join(outputDir, `concurrency-${candidate}`, 'concurrent')], { publicRelease }) };
  if (!same(actual.serial, comparison.serial) || !same(actual.concurrent, comparison.concurrent)) throw new Error('Accepted pilot saved metrics differ from the actual raw phase observations');
  const decision = concurrencyDecision({ ...actual, publicRelease });
  const expected = selected.tasks.map(task => task.task_id).sort();
  for (const phase of ['serial', 'concurrent']) {
    const ids = comparison[phase]?.per_task?.filter(row => row.selected === true).map(row => row.task_id).sort();
    if (!same(ids, expected)) throw new Error('Accepted pilot comparison does not contain the same ten selected tasks in both conditions');
  }
  if (comparison.concurrency !== candidate || !decision.ok || !same(decision, comparison.decision) || !same(decision, receipt.decision)) {
    throw new Error('Accepted pilot receipt differs from the saved operational comparison');
  }
  return descriptor(comparisonPath);
}

export async function waitForModel({ state, signal, shouldStop = () => false, waitResources = true,
  status = () => circuit('status', {}, { state }), sleep = waitForResource, checkpoint = async () => {}, log = () => {} } = {}) {
  while (!signal?.aborted && !shouldStop()) {
    const value = await status();
    if (typeof value.ready !== 'boolean' || !['closed', 'open', 'half_open', 'blocked'].includes(value.state)) throw new Error('Invalid durable model circuit status');
    const saved = { state: value.state, generation: value.generation, ready: value.ready,
      not_before_epoch: value.not_before_epoch ?? null, reason_kind: value.reason?.kind ?? null,
      checked_at: now(), readiness_probe: 'the next actual pending task; no extra model calls' };
    await checkpoint(saved);
    if (value.ready) return { ready: true, circuit: saved };
    log({ state: 'waiting_for_model', circuit: saved });
    if (!waitResources || value.state === 'blocked') return { ready: false, blocked: value.state === 'blocked', circuit: saved };
    const future = typeof value.not_before_epoch === 'number' ? value.not_before_epoch * 1000 - Date.now() : null;
    const until = value.state === 'open' && future > 0 ? future : 60_000;
    await sleep(Math.min(60_000, Math.max(1000, until)), signal);
  }
  return { ready: false, interrupted: true };
}

export async function runRepairBenchmark({ extensionDir, outputDir, fullRunId, serverCommand,
  resume = false, waitResources = true, circuitState = DEFAULT_CIRCUIT, signal,
  shouldStop = () => false, log = value => console.log(JSON.stringify(value)), publicRelease = false, publicPins = null, dependencies = {} } = {}) {
  if (!extensionDir || !outputDir || !fullRunId || !/^[A-Za-z0-9_-]+$/.test(fullRunId)) throw new Error('--extension-dir, --output and a safe --full-run-id are required');
  const contextRoot = await realpath(dependencies.contextRoot ?? path.join(REPO_ROOT, '.context'));
  outputDir = path.resolve(outputDir);
  // Resolve the existing parent so symlinked parents cannot escape the context root.
  const parent = await realpath(path.dirname(outputDir));
  outputDir = path.join(parent, path.basename(outputDir));
  if (!within(contextRoot, outputDir)) throw new Error('Pipeline --output must be a fresh directory inside the workspace .context root');
  const outputStat = await lstat(outputDir).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (outputStat?.isSymbolicLink()) throw new Error('Pipeline output cannot be a symlink');
  extensionDir = await realpath(extensionDir);
  if (!(await stat(path.join(extensionDir, 'manifest.json'))).isFile()) throw new Error('A staged extension manifest is required');
  serverCommand = commandArray(serverCommand ?? [process.execPath, path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js'), 'stdio']);
  circuitState = path.resolve(circuitState);
  const resultsRoot = path.resolve(dependencies.resultsRoot ?? RESULTS_DIR);
  const fullRunDir = path.join(resultsRoot, fullRunId);
  const hadOutput = (await entries(outputDir)).length > 0;
  if (hadOutput && !resume) throw new Error('Pipeline output already exists; use --resume or a fresh output directory');
  if (!hadOutput && (await entries(fullRunDir)).length) throw new Error('The full run ID already contains data; choose a fresh full-run-id');
  await mkdir(outputDir, { recursive: true });
  const release = await acquireRunLock(outputDir);
  let state;
  const statePath = path.join(outputDir, 'pipeline.json');
  const checkpoint = async patch => {
    state = { ...state, ...patch, updated_at: now() };
    await atomicJson(statePath, state);
    log({ phase: state.phase, state: state.state, full_run_dir: fullRunDir,
      ...(state.terminal === undefined ? {} : { terminal: state.terminal }),
      ...(state.detail ? { detail_recorded: true } : {}), ...(state.error_code ? { error_code: state.error_code } : {}) });
  };
  const profile = profileFor(publicRelease), profilePath = path.join(BENCH_ROOT, 'config', `${profile.id}.json`);
  if (publicRelease && (!publicPins || !dependencies.captureSources || !dependencies.localGate || !dependencies.verifyLocalEvidence)) throw new Error('Public release requires explicit provenance and public gate implementations');
  const capture = () => (dependencies.captureSources ?? capturePipelineSources)({ serverCommand, extensionDir, publicRelease, publicPins });
  const controlCircuit = () => (dependencies.circuit ?? ((action, data) => circuit(action, data, { state: circuitState })))('status', {});
  let frozen;
  const ensureFrozen = async () => {
    if (!same(await capture(), frozen.sources)) throw new Error('Pipeline frozen source/runtime/extension bytes changed; start a fresh gated run');
    if (hash(await readFile(frozen.dataset.path)) !== frozen.dataset.sha256) throw new Error('Frozen dataset bytes changed');
  };
  const resourceWait = async phase => {
    await checkpoint({ phase, state: 'waiting_for_model', detail: null });
    const availability = await waitForModel({ state: circuitState, signal, shouldStop, waitResources, status: controlCircuit,
      sleep: dependencies.sleep ?? waitForResource, log,
      checkpoint: async circuitStatus => checkpoint({ circuit: circuitStatus }) });
    if (!availability.ready) {
      await checkpoint({ phase, state: availability.interrupted ? 'paused_drained' : 'waiting_for_model',
        detail: availability.blocked ? 'Authentication/configuration block requires recorded operator recovery' : null });
      return false;
    }
    await ensureFrozen();
    await checkpoint({ phase, state: 'running' });
    return true;
  };
  const interrupt = async phase => {
    if (!signal?.aborted && !shouldStop()) return false;
    await checkpoint({ phase, state: 'paused_drained', detail: 'Stop requested; no new task dispatch' });
    return true;
  };
  try {
    const dataset = await (dependencies.loadTasks ?? loadTasks)();
    if (dataset.tasks.length !== 300 || new Set(dataset.tasks.map(task => task.task_id)).size !== 300
        || dataset.source.sha256 !== DATASET_SHA256 || hash(await readFile(dataset.source.path)) !== DATASET_SHA256) {
      throw new Error('The pinned 300-task dataset is required');
    }
    const toolCount = toolsForProfile(profile).length;
    if (toolCount !== (publicRelease ? 44 : 46)) throw new Error('Browser manual profile tool count differs from its frozen definition');
    const sources = await capture();
    const config = { version: 2, profile: profile.id, model: MODEL, effort: EFFORT, browser: 'existing', shared_cookies: true,
      ...(publicRelease ? { public_release: true, public_pins: publicPins } : {}),
      timeout_seconds: 1200, max_actions: 120, tool_count: toolCount, judge_protocol: 'scorefield-v2', judge_jobs: judgeMatrix().map(job => job.id),
      gate_levels: [1, 2, 5, 10], pilot_candidates: [10, 5, 2, 1], full_run_id: fullRunId, full_run_dir: fullRunDir,
      image_contract: 'claude-mcp-image-v1',
      output_dir: outputDir, extension_dir: extensionDir, server_command: serverCommand, circuit_state: circuitState,
      dataset: { path: path.resolve(dataset.source.path), sha256: dataset.source.sha256, revision: dataset.source.revision ?? null },
      task_ids: dataset.tasks.map(task => task.task_id), sources,
      historical_run_dir: path.resolve(dependencies.historicalRunDir ?? DEFAULT_HISTORICAL),
      historical_review_dir: path.join(outputDir, 'blinded-human-review'), fresh_review_dir: path.join(outputDir, 'fresh-blinded-human-review'),
      fresh_review_seed: 'fsb-fresh-manual-v2-review-20261018', human_calibrated: false };
    const configPath = path.join(outputDir, 'frozen-config.json');
    const prior = await optionalJson(configPath);
    if (prior && !same(prior, config)) throw new Error('Pipeline resume configuration or source fingerprints differ from frozen bytes');
    if (hadOutput && !prior) throw new Error('Existing pipeline output lacks its frozen configuration');
    frozen = prior ?? config;
    if (!prior) await writeFile(configPath, JSON.stringify(frozen, null, 2) + '\n', { flag: 'wx' });
    const configEvidence = await descriptor(configPath);
    const previous = await optionalJson(statePath);
    if (previous && previous.frozen_config?.sha256 !== configEvidence.sha256) throw new Error('Pipeline checkpoint belongs to a different frozen configuration');
    state = previous ?? { version: 1, created_at: now(), phase: 'historical_review', state: 'configured', frozen_config: configEvidence, full_run_dir: fullRunDir };
    if (state.state === 'paused_health') throw new Error('A prior pipeline health fault requires repair and a new gated output');
    await assertResumeSafe([path.join(outputDir, 'pilot'), fullRunDir], { publicRelease });
    if (state.state === 'complete') {
      for (const evidence of [state.cli_image_contract, state.final_audit, state.final_report, state.final_manifest, state.final_judge_jobs]) await assertDescriptor(evidence);
      const verified = await (dependencies.verifyCompleted ?? verifyFinalizedManualReport)(fullRunDir, await json(path.join(fullRunDir, 'manifest.json')));
      if (verified.ok !== true) throw new Error('Completed pipeline publication provenance did not revalidate');
      return { ...state, already_complete: true };
    }
    await checkpoint({ state: 'running' });
    if (await interrupt('historical_review')) return state;
    const excluded = dependencies.excludedTaskIds ?? [
      ...(await json(DIAGNOSTIC_SAMPLE)).selected.map(row => row.task_id), '9829f3087ab1f9c8eba6b6dd2b831d25_112325',
    ];
    const bundle = await (dependencies.bundle ?? writeBlindedReviewBundle)({ historicalRunDir: frozen.historical_run_dir,
      outputDir: frozen.historical_review_dir, datasetPath: frozen.dataset.path, excludedTaskIds: excluded });
    if (bundle.count !== 60 || bundle.human_calibrated !== false) throw new Error('The distinct blinded60 saved-evidence bundle was not prepared');
    const reviewBundles = { historical: { output_dir: frozen.historical_review_dir,
      selection_sha256: bundle.selection_sha256, provenance_sha256: bundle.provenance_sha256 },
      fresh: { output_dir: frozen.fresh_review_dir, seed: frozen.fresh_review_seed } };
    await checkpoint({ historical_review: bundle });
    await ensureFrozen();
    if (await interrupt('image_contract')) return state;
    const imageContractDir = path.join(outputDir, 'claude-image-contract');
    const imageContractPath = path.join(imageContractDir, 'receipt.json');
    if (state.cli_image_contract) {
      if (path.resolve(state.cli_image_contract.path) !== imageContractPath) throw new Error('Saved Claude image contract points outside this run');
      await assertDescriptor(state.cli_image_contract);
      if ((await json(imageContractPath)).ok !== true) throw new Error('Saved Claude image contract did not pass');
    } else {
      if ((await entries(imageContractDir)).length) throw new Error('Incomplete Claude image contract evidence requires inspection');
      await checkpoint({ phase: 'image_contract', state: 'running' });
      const imageContract = await (dependencies.imageContract ?? verifyClaudeImageContract)({ outputDir: imageContractDir,
        command: frozen.sources.toolchain?.claude?.path ?? CLAUDE_CLI, model: frozen.model, effort: frozen.effort, signal, publicRelease, publicPins });
      if (imageContract.ok !== true || (await json(imageContractPath)).ok !== true) throw new Error('Claude MCP image delivery contract failed');
      await checkpoint({ cli_image_contract: await descriptor(imageContractPath) });
    }
    await ensureFrozen();
    if (await interrupt('local_gate')) return state;
    const localPath = path.join(outputDir, 'local-gate-receipt.json');
    let local = await optionalJson(localPath);
    if (local) {
      await assertDescriptor(local.summary);
      const verified = localGateReceipt(await json(local.summary.path), { summaryEvidence: local.summary,
        fingerprints: frozen.sources.fingerprints, receiptPath: localPath });
      if (!same(verified, local)) throw new Error('Saved local gate receipt differs from source-bound summary');
    } else {
      await checkpoint({ phase: 'local_gate', state: 'running' });
      const gateDir = path.join(outputDir, 'local-gate');
      if ((await entries(gateDir)).length) throw new Error('Incomplete local gate evidence requires inspection; no silent fixture replay');
      const summary = await (dependencies.localGate ?? manualLiveGate)({ liveAuthorized: true, outputDir: gateDir,
        command: serverCommand, profilePath, publicPins, concurrency: [1, 2, 5, 10] });
      local = localGateReceipt(summary, { summaryEvidence: await descriptor(path.join(gateDir, 'summary.json')),
        fingerprints: frozen.sources.fingerprints, receiptPath: localPath });
      await writeFile(localPath, JSON.stringify(local, null, 2) + '\n', { flag: 'wx' });
    }
    const localEvidence = await (dependencies.verifyLocalEvidence ?? verifyLocalGateEvidence)(await json(local.summary.path),
      { gateDir: path.join(outputDir, 'local-gate'), serverCommand, profilePath, publicPins });
    if (localEvidence.ok !== true) throw new Error('Saved local gate evidence did not revalidate');
    await checkpoint({ local_gate: await descriptor(localPath) });
    await ensureFrozen();
    if (await interrupt('paired_pilot')) return state;
    const acceptedPath = path.join(outputDir, 'pilot/accepted-gate.json');
    let accepted = await optionalJson(acceptedPath);
    if (state.accepted_gate) {
      if (path.resolve(state.accepted_gate.path) !== acceptedPath) throw new Error('Saved accepted gate points outside this pilot');
      await assertDescriptor(state.accepted_gate);
    }
    while (!accepted?.ok && !signal?.aborted && !shouldStop()) {
      if (!await resourceWait('paired_pilot')) return state;
      accepted = await (dependencies.pilot ?? pairedPilot)({ outputDir: path.join(outputDir, 'pilot'), allTasks: dataset.tasks,
        source: dataset.source, serverCommand, extensionDir, localReceipt: local, circuitState, signal, shouldStop, resume: true, publicRelease, publicPins,
        dependencies: { beforePublicDispatch: dependencies.beforePublicDispatch } });
      if (accepted.ok) break;
      if (accepted.state === 'waiting_for_model') {
        await checkpoint({ phase: 'paired_pilot', state: accepted.state, detail: accepted.detail ?? null });
        if (!waitResources) return state;
        continue;
      }
      await checkpoint({ phase: 'paired_pilot', state: accepted.state === 'paused_drained' ? 'paused_drained' : 'paused_health', detail: accepted.detail ?? 'Pilot did not pass', pilot_block: accepted });
      return state;
    }
    if (await interrupt('paired_pilot')) return state;
    const comparisonEvidence = await validateAcceptedPilot(accepted, { outputDir: path.join(outputDir, 'pilot'),
      localReceipt: local, fingerprints: frozen.sources.fingerprints, allTasks: dataset.tasks, source: dataset.source, serverCommand, extensionDir,
      publicRelease, publicPins, profilePath, verifyExport: dependencies.verifyPilotExport });
    if (state.accepted_comparison && !same(state.accepted_comparison, comparisonEvidence)) throw new Error('Accepted pilot comparison bytes changed');
    const acceptedEvidence = await descriptor(accepted.receipt_path);
    await checkpoint({ accepted_gate: acceptedEvidence, accepted_comparison: comparisonEvidence, execution_concurrency: accepted.selected_concurrency });
    await ensureFrozen();
    const reviewDirectory = path.join(outputDir, 'pilot/descriptive-checkpoints');
    const reviewBundle = await (dependencies.reviewBundle ?? writePilotCheckpointBundle)({ pilotOutputDir: path.join(outputDir, 'pilot'),
      outputDir: reviewDirectory, allTasks: dataset.tasks, gateReceipt: accepted, publicRelease });
    const verifyReview = () => (dependencies.verifyReview ?? verifyPilotReviewComplete)(reviewDirectory);
    const review = await verifyReview();
    if (!review.complete) {
      await checkpoint({ phase: 'pilot_review', state: 'paused_review', pilot_review_bundle: reviewBundle,
        detail: 'Twenty blinded native checkpoint images are ready for automated descriptive inspection; record completion notes, then resume' });
      return state;
    }
    const reviewReference = { path: review.receipt.path, sha256: review.receipt.sha256,
      public_manifest_sha256: review.public_manifest.sha256, notes_sha256: review.notes.sha256,
      descriptive_summary: review.descriptive_summary, human_calibrated: false, affects_operational_gate: false };
    if (state.descriptive_pilot_review && !same(state.descriptive_pilot_review, reviewReference)) throw new Error('Saved descriptive pilot review completion changed');
    await checkpoint({ pilot_review_bundle: reviewBundle, descriptive_pilot_review: reviewReference });
    const ensureReview = async () => {
      const current = await verifyReview();
      if (!current.complete || current.receipt.sha256 !== reviewReference.sha256) throw new Error('Descriptive pilot completion evidence changed');
    };
    await mkdir(fullRunDir, { recursive: true });
    const collectionGate = { path: acceptedEvidence.path, sha256: acceptedEvidence.sha256,
      descriptive_pilot_review: reviewReference, review_bundles: reviewBundles };
    const collectionConfig = { version: 3, profile: profile.id, model: frozen.model, effort: frozen.effort, browser: 'existing', shared_cookies: true,
      ...(publicRelease ? { public_release: true, public_pins: publicPins, profile_tool_count: toolCount, profile_path: profilePath } : {}),
      timeout_seconds: 1200, max_actions: 120, execution_concurrency: accepted.selected_concurrency, judge_protocol: 'scorefield-v2',
      circuit_state: circuitState, server_command: serverCommand, extension_dir: extensionDir,
      task_ids: frozen.task_ids, source: dataset.source, gate_receipt: collectionGate, fingerprints: frozen.sources.fingerprints };
    let manifest = await optionalJson(path.join(fullRunDir, 'manifest.json'));
    if (manifest?.collection_complete && (!same(manifest.config, collectionConfig) || manifest.state !== 'collected'
        || !same(manifest.outcomes.map(row => row.task_id).sort(), [...frozen.task_ids].sort()))) {
      throw new Error('Completed collection differs from the exact frozen300-task configuration');
    }
    let diskReady = manifest?.collection_complete === true;
    while (!diskReady && !signal?.aborted && !shouldStop()) {
      try {
        const disk = await (dependencies.disk ?? assertDiskBudget)(fullRunDir, accepted.artifact_forecast_bytes);
        await atomicJson(path.join(fullRunDir, 'disk-gate.json'), disk);
        diskReady = true;
        await checkpoint({ phase: 'disk_gate', state: 'running', disk_block: null, detail: null });
        break;
      } catch (error) {
        if (error.code !== 'DISK_BUDGET') throw error;
        await checkpoint({ phase: 'disk_gate', state: 'waiting_for_disk',
          disk_block: { code: error.code, error: error.message, checked_at: now() }, detail: 'Pilot forecast plus the unchanged reserve requires more free disk space' });
        if (!waitResources) return state;
        await (dependencies.sleep ?? waitForResource)(60_000, signal);
      }
    }
    if (!diskReady) { await interrupt('disk_gate'); return state; }
    while (!manifest?.collection_complete && !signal?.aborted && !shouldStop()) {
      if (!await resourceWait('full_collection')) return state;
      await assertResumeSafe([path.join(outputDir, 'pilot'), fullRunDir], { publicRelease });
      const result = await (dependencies.collect ?? collectManual)({ runDir: fullRunDir, tasks: dataset.tasks, source: dataset.source,
        serverCommand, extensionDir, concurrency: accepted.selected_concurrency, model: frozen.model, effort: frozen.effort,
        circuitState, gateReceipt: collectionGate, resume: true, signal, shouldStop, publicRelease, publicPins,
        beforePublicDispatch: dependencies.beforePublicDispatch });
      manifest = result.manifest;
      await checkpoint({ phase: 'full_collection', state: manifest.state, terminal: manifest.outcomes.length, detail: manifest.last_block ?? null });
      if (manifest.collection_complete) break;
      if (manifest.state === 'waiting_for_model') {
        if (!waitResources) return state;
        continue;
      }
      if (manifest.state === 'paused_drained' || signal?.aborted || shouldStop()) return state;
      await checkpoint({ state: 'paused_health' }); return state;
    }
    if (await interrupt('full_collection')) return state;
    if (!manifest?.collection_complete || manifest.outcomes.length !== 300) throw new Error('Full collection requires300 terminal tasks before judging');
    await ensureFrozen();
    await ensureReview();
    await assertResumeSafe([fullRunDir], { publicRelease });
    await checkpoint({ phase: 'fresh_review_bundle', state: 'running' });
    const freshReview = await (dependencies.bundle ?? writeBlindedReviewBundle)({ historicalRunDir: fullRunDir,
      outputDir: frozen.fresh_review_dir, datasetPath: frozen.dataset.path, excludedTaskIds: excluded, seed: frozen.fresh_review_seed, publicRelease });
    if (freshReview.count !== 60 || freshReview.human_calibrated !== false) throw new Error('The fresh blinded60 saved-evidence bundle was not prepared');
    await checkpoint({ fresh_review: freshReview });
    if (!await resourceWait('judging')) return state;
    const jobs = await (dependencies.judges ?? runJudgeJobs)({ runDir: fullRunDir, manifest, passes: 3, wait: waitResources,
      signal, shouldStop, circuitState, model: frozen.model, effort: frozen.effort });
    if (!jobs.complete) {
      await checkpoint({ phase: 'judging', state: signal?.aborted || shouldStop() ? 'paused_drained' : 'waiting_for_model', detail: `Six frozen ${JUDGE_ENGINE} judge jobs are not yet complete` });
      return state;
    }
    if (!same(jobs.jobs.map(job => job.id), frozen.judge_jobs) || jobs.jobs.some(job => job.status !== 'complete')) throw new Error('Judging did not complete the exact frozen six-job matrix');
    await ensureFrozen();
    await ensureReview();
    await checkpoint({ phase: 'report', state: 'running' });
    const report = await (dependencies.report ?? writeManualReport)(fullRunDir, manifest, { finalize: true });
    if (report.finalized !== true || report.expected !== 300 || report.jobs_complete !== 6) throw new Error('Final report did not verify300 tasks and six completed jobs');
    const finalManifest = await descriptor(path.join(fullRunDir, 'manifest.json'));
    const finalAudit = await json(path.join(fullRunDir, 'FINAL-AUDIT.json'));
    if (finalAudit.ok !== true || finalAudit.manifest_sha256 !== finalManifest.sha256) throw new Error('Final report receipt differs from the current collection manifest');
    await checkpoint({ phase: 'complete', state: 'complete', detail: null,
      final_audit: await descriptor(path.join(fullRunDir, 'FINAL-AUDIT.json')), final_report: await descriptor(path.join(fullRunDir, 'REPORT.md')),
      final_manifest: finalManifest, final_judge_jobs: await descriptor(path.join(fullRunDir, 'judge-jobs.json')) });
    return state;
  } catch (error) {
    if (state) await checkpoint({ state: 'paused_health', detail: error.message, error_code: error.code ?? error.name });
    throw error;
  } finally { await release(); }
}

export async function runRepairCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    'extension-dir': { type: 'string' }, output: { type: 'string' }, 'full-run-id': { type: 'string' },
    'fsb-server-cmd': { type: 'string' }, 'circuit-state': { type: 'string', default: DEFAULT_CIRCUIT },
    resume: { type: 'boolean', default: false }, 'wait-resources': { type: 'boolean', default: true },
    'no-wait-resources': { type: 'boolean', default: false },
  } });
  const controller = new AbortController();
  let drain = false;
  const stop = () => controller.abort();
  const stopNew = () => { drain = true; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop); process.once('SIGUSR2', stopNew);
  try {
    const state = await runRepairBenchmark({ extensionDir: values['extension-dir'], outputDir: values.output,
      fullRunId: values['full-run-id'], serverCommand: values['fsb-server-cmd'] ? JSON.parse(values['fsb-server-cmd']) : undefined,
      circuitState: values['circuit-state'], resume: values.resume, waitResources: values['wait-resources'] && !values['no-wait-resources'],
      signal: controller.signal, shouldStop: () => drain });
    if (state.state === 'paused_health') process.exitCode = 1;
    else if (state.state !== 'complete') process.exitCode = 75;
    return state;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); process.removeListener('SIGUSR2', stopNew); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRepairCLI().catch(error => { console.error(JSON.stringify({ state: 'stopped', error: error.message, code: error.code ?? error.name })); process.exitCode = 1; });
}
