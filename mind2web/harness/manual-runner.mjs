import { mkdir, readFile, readdir, writeFile, stat, statfs } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BENCH_ROOT, REPO_ROOT, RESULTS_DIR, runCommand } from './proc.mjs';
import { loadTasks } from './dataset.mjs';
import { hashTree } from './fingerprint.mjs';
import { atomicJson, acquireRunLock } from './run-state.mjs';
import { BrowserScheduler } from './browser-scheduler.mjs';
import { runManualClaudeTask, quotaHeadroom } from './driver-claude-manual.mjs';
import { FAMILY, MODEL, EFFORT, CLAUDE_CLI, DEFAULT_CIRCUIT, FAMILY_CONFIG_PATH } from './model-family.mjs';
import { writeV2 } from './v2-writer.mjs';
import { validateTrajectoryDir } from './validate-v2.mjs';
import { profileFor, toolsForProfile, actorPrompt, loadPublicCatalog } from './browser-manual-profile.mjs';
import { verifyPublicDisposition, publicAttemptBlocker } from './public-disposition.mjs';
import { StdioClient } from './mcp-client.mjs';
import { runJudgeJobs } from './judge-jobs.mjs';
import { queueTimingEvidence, MISSING_QUEUE_EXPORT_CODES } from './queue-timing.mjs';

const json = file => readFile(file, 'utf8').then(JSON.parse);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
export { DEFAULT_CIRCUIT };
// Provider availability failures may get one fresh rerun; others need an operator.
const AVAILABILITY_FAILURES = new Set(['quota', 'rate_limit', 'transport']);

export async function circuit(action, data = {}, { state = DEFAULT_CIRCUIT, run = runCommand } = {}) {
  const result = await run(path.join(BENCH_ROOT, 'judge/.venv/bin/python'), ['-m', 'om2w_judge.circuit', '--state', state,
    '--family', FAMILY, '--request-stdin', action], { cwd: path.join(BENCH_ROOT, 'judge'), input: JSON.stringify(data),
    env: { ...process.env, PYTHONPATH: path.join(BENCH_ROOT, 'judge') }, timeoutMs: 15_000 });
  let value; try { value = JSON.parse(result.stdout); } catch { throw new Error('Invalid model circuit response: ' + result.stderr.slice(-500)); }
  if (![0, 75].includes(result.code)) throw new Error('Model circuit failed: ' + result.stderr.slice(-500));
  return { allowed: result.code === 0, ...value };
}
export function providerFailure(text) {
  if (/not logged in|unauthori[sz]ed|authentication|invalid.*(?:token|credential)|login required/i.test(text)) return 'authentication';
  if (/usage.limit|quota|hit your.*limit|limit.*resets|session limit|credits exhausted/i.test(text)) return 'quota';
  if (/429|rate.limit|too many requests|retry.after/i.test(text)) return 'rate_limit';
  if (/network|connection|transport|socket|TLS|timed? out|timeout|502|503|504|overloaded|\b529\b|\b500\b|internal server error|fetch failed|ECONNRESET/i.test(text)) return 'transport';
  return null;
}
const cliDigests = new Map();
// The pinned CLI is ~270 MB; hash it once per process and size/mtime identity.
async function cliDigest(file) {
  const info = await stat(file), key = `${file}:${info.size}:${info.mtimeMs}`;
  if (!cliDigests.has(key)) cliDigests.set(key, digest(await readFile(file)));
  return cliDigests.get(key);
}
export async function sourceFingerprint({ serverCommand, extensionDir, publicRelease = false, public_release = publicRelease, publicPins = null } = {}) {
  if (public_release && (!extensionDir || !publicPins)) throw new Error('Public mode requires archived official extension bytes and pinned public provenance');
  if (public_release) await loadPublicCatalog({ publicPins });
  const fingerprints = {
    profile: digest(await readFile(path.join(BENCH_ROOT, public_release ? 'config/browser-manual-public-v1.json' : 'config/browser-manual-v2.json'))),
    prompt: digest(actorPrompt(await readFile(path.join(BENCH_ROOT, 'config/browser-manual-v2-prompt.md'), 'utf8'), public_release, FAMILY)),
    model_family: digest(await readFile(FAMILY_CONFIG_PATH)),
    actor_cli: await cliDigest(CLAUDE_CLI),
    harness: await hashTree(path.join(BENCH_ROOT, 'harness'), name => /\.(mjs|py)$/.test(name)),
    evaluator: await hashTree(path.join(BENCH_ROOT, 'judge/om2w_judge'), name => name.endsWith('.py')),
    runtime: await hashTree(path.dirname(serverCommand[1])),
    runtime_package: digest(await readFile(path.resolve(path.dirname(serverCommand[1]), '../package.json'))),
    runtime_dependencies: await hashTree(path.resolve(path.dirname(serverCommand[1]), '../node_modules'), () => true),
    tool_definitions: digest(await readFile(path.resolve(path.dirname(serverCommand[1]), '../ai/tool-definitions.cjs'))),
    extension: await hashTree(extensionDir ?? path.join(REPO_ROOT, 'extension'), name => /\.(js|json|css|html)$/.test(name)),
    ...(public_release ? { public_release: true, public_pins: digest(JSON.stringify(publicPins)) } : {}),
  };
  return fingerprints;
}
export async function artifactBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await artifactBytes(file);
    else if (entry.isFile()) total += (await stat(file)).size;
  }
  return total;
}
export async function assertDiskBudget(directory, expectedAdditionalBytes) {
  const info = await statfs(directory);
  const free = info.bavail * info.bsize;
  const needed = Math.ceil(expectedAdditionalBytes * 1.25 + 5_000_000_000);
  if (free < needed) throw Object.assign(new Error(`Disk gate: ${free} free bytes; ${needed} required by pilot forecast plus reserve`), { code: 'DISK_BUDGET' });
  return { checked_at: now(), free_bytes: free, required_bytes: needed, expected_additional_bytes: expectedAdditionalBytes, headroom: 1.25, reserve_bytes: 5_000_000_000 };
}

export async function collectManual({ runDir, tasks, concurrency, serverCommand, source, extensionDir,
  model = MODEL, effort = EFFORT, signal, circuitState = DEFAULT_CIRCUIT, gateReceipt = null, resume = false,
  shouldStop = () => false, pilotQueueTiming = false, publicRelease = false, public_release = publicRelease,
  publicPins = null, publicCatalog, beforePublicDispatch, dependencies = {} } = {}) {
  if (![1, 2, 5, 10].includes(concurrency)) throw new Error('Concurrency must be a gated level1/2/5/10');
  if (pilotQueueTiming && gateReceipt?.kind !== 'pilot') throw new Error('Queue timing continuation is restricted to paired pilot phases');
  await mkdir(runDir, { recursive: true });
  const release = await acquireRunLock(runDir);
  const scheduler = new BrowserScheduler();
  const drive = dependencies.drive ?? runManualClaudeTask, controlCircuit = dependencies.circuit ?? ((action, data) => circuit(action, data, { state: circuitState }));
  const fingerprint = dependencies.fingerprint ?? sourceFingerprint;
  const keeper = dependencies.keeper ?? new StdioClient(serverCommand, { stderr: null });
  const profile = profileFor(public_release);
  let manifest, stopped = null, checkpointQueue = Promise.resolve(), next = 0;
  const checkpoint = () => {
    checkpointQueue = checkpointQueue.catch(() => {}).then(async () => { manifest.updated_at = now(); manifest.active_task_ids = manifest.attempts.filter(x => x.state === 'running').map(x => x.task_id); await atomicJson(path.join(runDir, 'manifest.json'), manifest); });
    return checkpointQueue;
  };
  try {
    if (public_release) publicCatalog = await loadPublicCatalog({ publicPins, publicCatalog });
    const config = { version: 3, profile: profile.id, model, effort, browser: 'existing', shared_cookies: true,
      timeout_seconds: 1200, max_actions: 120, execution_concurrency: concurrency, judge_protocol: 'scorefield-v2',
      circuit_state: path.resolve(circuitState), server_command: serverCommand, extension_dir: extensionDir ?? null,
      task_ids: tasks.map(task => task.task_id), source, gate_receipt: gateReceipt,
      ...(pilotQueueTiming ? { pilot_queue_timing: true } : {}),
      ...(public_release ? { public_release: true, public_pins: publicPins, profile_tool_count: toolsForProfile(profile).length,
        profile_path: path.join(BENCH_ROOT, 'config/browser-manual-public-v1.json') } : {}),
      fingerprints: await fingerprint({ serverCommand, extensionDir, ...(public_release ? { publicRelease: true, publicPins } : {}) }) };
    const prior = await json(path.join(runDir, 'manifest.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (prior && !resume) throw new Error('Run already exists; use explicit resume or a new output directory');
    if (prior && JSON.stringify(prior.config) !== JSON.stringify(config)) throw new Error('Cannot resume a different frozen configuration');
    manifest = prior ?? { ...config, config, started_at: now(), state: 'running', expected: tasks.length, attempts: [], outcomes: [], collection_complete: false, active_task_ids: [] };
    if (manifest.attempts.some(attempt => attempt.requires_task_recovery
        || attempt.provider_interruption?.code === 'PROVIDER_INTERRUPTED_AFTER_MUTATION')) {
      throw new Error('PROVIDER_INTERRUPTED_AFTER_MUTATION: an unresolved mutated task requires explicit task recovery; ordinary resume cannot replay it');
    }
    if (manifest.attempts.some(x => x.state === 'running' || x.final?.cleanup_ok === false)) throw new Error('Unfinished attempt or unverified owned cleanup requires a recovery proof before resume');
    if (public_release) for (const attempt of manifest.attempts) {
      if (attempt.public_operational_recovery_required || await publicAttemptBlocker(attempt, { publicRelease: true }))
        throw new Error('Public operational failure requires explicit recovery; ordinary resume cannot replay this attempt');
    }
    for (const attempt of manifest.attempts.filter(attempt => attempt.final?.queue_expiries)) {
      if (!pilotQueueTiming || !attempt.pilot_timing_failure?.valid
          || JSON.stringify(await queueTimingEvidence(attempt.raw_dir)) !== JSON.stringify(attempt.pilot_timing_failure)) {
        throw new Error('A prior queue expiry requires verified pilot timing evidence or explicit health recovery');
      }
    }
    if (manifest.state === 'paused_health') throw new Error('Health gate requires repair and explicit revalidation; ordinary resume is refused');
    await atomicJson(path.join(runDir, 'task-ids.json'), config.task_ids); await checkpoint();
    await keeper.initialize();
    const selected = new Set(manifest.outcomes.map(row => row.task_id));
    async function worker() {
      while (!signal?.aborted && !shouldStop() && !stopped && !scheduler.halted) {
        const task = tasks[next++]; if (!task) return; if (selected.has(task.task_id)) continue;
        const availability = await controlCircuit('status', {});
        if (availability.ready === false) { stopped ??= { state: 'waiting_for_model', detail: availability }; return; }
        if (signal?.aborted || shouldStop() || stopped) return;
        const previous = manifest.attempts.filter(x => x.task_id === task.task_id);
        const index = previous.length + 1;
        const consumed = previous.filter(x => x.consumes_attempt !== false).length;
        if (consumed >= 2) { stopped = { state: 'paused_health', detail: 'Pre-mutation infrastructure retry exhausted', task_id: task.task_id }; return; }
        const rawDir = path.join(runDir, 'raw', task.task_id, `attempt-${index}`);
        const attempt = { task_id: task.task_id, index, logical_attempt: consumed + 1, raw_dir: rawDir, state: 'running', started_at: now() };
        manifest.attempts.push(attempt); await checkpoint();
        let permit;
        const final = await drive({ task, rawDir, attemptId: `attempt-${index}`, serverCommand, scheduler, model, effort, maxActions: 120, timeoutMs: 1_200_000, signal,
          ...(public_release ? { publicRelease: true, public_release: true, publicPins, publicCatalog, beforePublicDispatch } : {}),
          onFault: detail => { stopped ??= { state: 'paused_health', detail, task_id: task.task_id }; },
          beforeSpawn: async () => {
            if (signal?.aborted || shouldStop() || stopped || scheduler.halted) return { allowed: false };
            permit = await controlCircuit('admit', { scope: `actor:${task.task_id}`, owner_pid: process.pid, lease_seconds: 1260 });
            if (!permit.allowed) stopped ??= { state: 'waiting_for_model', detail: permit };
            if (signal?.aborted || shouldStop() || stopped || scheduler.halted) return { ...permit, allowed: false };
            return permit;
          } });
        attempt.final = final; attempt.state = 'finished'; attempt.ended_at = now();
        attempt.consumes_attempt = final.outcome !== 'provider_pending';
        let timingEvidence = null;
        if (pilotQueueTiming && final.queue_expiries && final.cleanup_ok === true && !final.uncertain_upstream && !final.fault && !scheduler.halted) {
          timingEvidence = await queueTimingEvidence(rawDir);
          if (timingEvidence.valid) attempt.pilot_timing_failure = timingEvidence;
        }
        const queueBlocks = final.queue_expiries && !(pilotQueueTiming && timingEvidence?.valid);
        let publicDisposition = null;
        if (public_release && final.public_disposition && !final.provider_error) {
          try { publicDisposition = await verifyPublicDisposition(rawDir, final); }
          catch (error) { attempt.public_disposition_verification_error = error.message; }
        }
        if (public_release && final.provider_error && final.public_disposition)
          attempt.public_disposition_verification_error = 'A genuine CLI/provider error prevents terminal native-failure disposition';
        if (final.cleanup_ok !== true || final.uncertain_upstream || (final.fault && !publicDisposition) || queueBlocks || scheduler.halted) {
          stopped = { state: 'paused_health', task_id: task.task_id, detail: final.cleanup_error ?? final.fault ?? scheduler.halted ?? 'Browser operational gate failed' };
        }
        if (permit?.allowed && final.model_spawn_requested === false) {
          await controlCircuit('abandon', { permit: permit.permit ?? permit });
          permit = null;
        }
        if (!attempt.consumes_attempt) { stopped ??= { state: 'waiting_for_model', detail: 'Actor not dispatched' }; await checkpoint(); return; }
        const browserHealthy = final.cleanup_ok === true && (!final.fault || publicDisposition) && !final.uncertain_upstream && !queueBlocks && !scheduler.halted;
        if (public_release && !browserHealthy) {
          attempt.infrastructure_pending = true; attempt.requires_task_recovery = true; attempt.public_operational_recovery_required = true;
          stopped = { state: 'paused_health', task_id: task.task_id, detail: attempt.public_disposition_verification_error ?? final.cleanup_error ?? final.fault ?? 'Unverified public operational failure' };
          await checkpoint(); return;
        }
        if (publicDisposition) {
          manifest.outcomes.push({ task_id: task.task_id, outcome: final.outcome, outcome_kind: 'public_native_failure', actor_outcome: final.outcome,
            selected_attempt: index, raw_dir: rawDir, exported: false, missing_frame: true,
            goal_state: 'unknown_without_terminal_evidence', model_task_failure_demonstrated: false,
            public_disposition: final.public_disposition, action_count: final.action_count,
            actor_mutations_dispatched: final.actor_mutations_dispatched, duration_ms: final.duration_ms,
            actor_duration_ms: final.actor_duration_ms, cleanup_duration_ms: final.cleanup_duration_ms,
            cleanup_ok: final.cleanup_ok, usage: final.usage, error: final.error, queue_expiries: 0 });
          selected.add(task.task_id);
          const nativeHeadroom = quotaHeadroom(final.rate_limit);
          if (permit?.allowed) await controlCircuit(nativeHeadroom ? 'failure' : 'success', { permit: permit.permit ?? permit,
            ...(nativeHeadroom ? { kind: 'headroom', error: 'Claude quota headroom reached: ' + JSON.stringify(nativeHeadroom) } : {}) });
          await checkpoint(); continue;
        }
        const queueActorError = pilotQueueTiming && timingEvidence?.valid
          && /BROWSER_QUEUE_TIMEOUT|GATEWAY_QUEUE_TIMEOUT|foreground queue/i.test(final.error ?? '');
        const providerCandidate = ['error', 'never_started', 'rig_failure'].includes(final.outcome)
          && browserHealthy && !queueActorError && final.model_spawn_requested !== false;
        const failure = providerCandidate ? providerFailure(final.error ?? '') ?? 'configuration' : null;
        const interruptedAfterMutation = failure && final.actor_mutations_dispatched > 0;
        const providerRetry = interruptedAfterMutation && AVAILABILITY_FAILURES.has(failure) && consumed === 0;
        if (providerRetry) {
          // The interrupted trace stays on disk and is never scored; the task
          // reruns from its start page once the shared model circuit admits it.
          attempt.provider_retry = { code: 'PROVIDER_INTERRUPTED_RETRY', kind: failure, error: final.error ?? '', raw_dir: rawDir,
            detected_at: now(), policy: 'One fresh rerun after a provider availability interruption; the interrupted attempt is retained and excluded from scoring' };
          stopped ??= { state: 'waiting_for_model', task_id: task.task_id, detail: attempt.provider_retry };
          if (permit?.allowed) await controlCircuit('failure', { permit: permit.permit ?? permit, kind: failure, error: final.error ?? '' });
          await checkpoint(); return;
        }
        if (interruptedAfterMutation) {
          attempt.infrastructure_pending = true;
          attempt.requires_task_recovery = true;
          attempt.retryable_before_mutation = false;
          attempt.provider_interruption = { code: 'PROVIDER_INTERRUPTED_AFTER_MUTATION', kind: failure,
            error: final.error ?? '', raw_dir: rawDir, detected_at: now() };
          stopped = { state: 'paused_health', code: 'PROVIDER_INTERRUPTED_AFTER_MUTATION',
            task_id: task.task_id, detail: attempt.provider_interruption };
          await checkpoint();
        }
        const headroom = !failure && quotaHeadroom(final.rate_limit);
        if (headroom) attempt.quota_headroom = headroom;
        if (permit?.allowed && browserHealthy) await controlCircuit(failure || headroom ? 'failure' : 'success', { permit: permit.permit ?? permit,
          kind: failure ?? (headroom ? 'headroom' : undefined),
          error: headroom ? 'Claude quota headroom reached: ' + JSON.stringify(headroom) : final.error ?? '' });
        if (interruptedAfterMutation) return;
        const retryable = !queueActorError && !final.actor_mutations_dispatched && ['never_started', 'rig_failure', 'error'].includes(final.outcome);
        if (retryable && !stopped) {
          attempt.retryable_before_mutation = true;
          stopped = { state: failure ? 'waiting_for_model' : 'paused_health', task_id: task.task_id, detail: final.error };
          await checkpoint(); return;
        }
        const row = { task_id: task.task_id, outcome: final.outcome, selected_attempt: index, raw_dir: rawDir, exported: false,
          action_count: final.action_count, actor_mutations_dispatched: final.actor_mutations_dispatched, duration_ms: final.duration_ms,
          actor_duration_ms: final.actor_duration_ms, cleanup_duration_ms: final.cleanup_duration_ms, cleanup_ok: final.cleanup_ok,
          usage: final.usage, error: final.error, queue_expiries: final.queue_expiries ?? 0 };
        try {
          const written = await (dependencies.writeV2 ?? writeV2)({ task, rawDir, outDir: path.join(runDir, 'trajectories'), allowlistPath: path.join(BENCH_ROOT, public_release ? 'config/browser-manual-public-v1.json' : 'config/browser-manual-v2.json') });
          row.validation = await (dependencies.validate ?? validateTrajectoryDir)(written.dir); row.exported = row.validation.ok; row.warnings = written.warnings;
          if (!row.exported) stopped ??= { state: 'paused_health', task_id: task.task_id, detail: row.validation.errors };
        } catch (error) {
          row.export_error = error.message; row.export_error_code = error.code ?? null;
          if (pilotQueueTiming && timingEvidence?.can_explain_missing_export && MISSING_QUEUE_EXPORT_CODES.has(error.code)) {
            row.pilot_timing_unavailable = true;
          } else stopped ??= { state: 'paused_health', task_id: task.task_id, detail: error.message };
        }
        manifest.outcomes.push(row); selected.add(task.task_id); await checkpoint();
      }
    }
    const workers = await Promise.allSettled(Array.from({ length: concurrency }, async () => {
      try { return await worker(); }
      catch (error) {
        stopped = { state: 'paused_health', detail: error.message, error_code: error.code ?? null };
        scheduler.halt('Unexpected controller failure: ' + error.message);
        throw error;
      }
    }));
    manifest.worker_errors = workers.filter(x => x.status === 'rejected').map(x => ({ error: x.reason.message, code: x.reason.code ?? null }));
    manifest.collection_complete = manifest.outcomes.length === tasks.length && !stopped && !signal?.aborted;
    manifest.state = manifest.collection_complete ? 'collected' : stopped?.state === 'paused_health' ? 'paused_health'
      : shouldStop() ? 'paused_drained' : stopped?.state ?? 'interrupted';
    manifest.last_block = stopped; manifest.completed_at = manifest.collection_complete ? now() : null;
    await checkpoint(); return { runDir, manifest };
  } finally {
    try { await checkpointQueue; }
    finally { try { await keeper.close(); } finally { await release(); } }
  }
}

export async function runManualCLI(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: { 'run-id': { type: 'string' }, concurrency: { type: 'string' },
    'gate-receipt': { type: 'string' }, 'extension-dir': { type: 'string' }, resume: { type: 'boolean' }, judge: { type: 'boolean' },
    'circuit-state': { type: 'string', default: DEFAULT_CIRCUIT } } });
  if (!values['run-id'] || !/^[A-Za-z0-9_-]+$/.test(values['run-id'])) throw new Error('A new safe --run-id is required');
  if (!values['gate-receipt']) throw new Error('Full collection requires a passing --gate-receipt');
  const gateBytes = await readFile(values['gate-receipt']), gate = JSON.parse(gateBytes);
  if (!gate.ok || !gate.fixed_sample_sha256 || !gate.fingerprints) throw new Error('Missing passing installed/pilot gate evidence');
  const concurrency = Number(values.concurrency ?? gate.selected_concurrency);
  if (concurrency !== gate.selected_concurrency) throw new Error('Concurrency differs from accepted gate');
  const serverCommand = [process.execPath, path.join(homedir(), '.fsb/native-host/runtime/package/build/index.js'), 'stdio'];
  if (JSON.stringify(await sourceFingerprint({ serverCommand, extensionDir: values['extension-dir'] })) !== JSON.stringify(gate.fingerprints)) throw new Error('Installed/runtime/source fingerprints changed after gating');
  const { tasks, source } = await loadTasks(); if (tasks.length !== 300) throw new Error('Exactly300 pinned tasks are required');
  const runDir = path.join(RESULTS_DIR, values['run-id']); await mkdir(runDir, { recursive: true });
  await atomicJson(path.join(runDir, 'disk-gate.json'), await assertDiskBudget(runDir, gate.artifact_forecast_bytes));
  const controller = new AbortController(); const stop = () => controller.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await collectManual({ runDir, tasks, source, serverCommand, concurrency, extensionDir: values['extension-dir'],
      gateReceipt: { path: path.resolve(values['gate-receipt']), sha256: digest(gateBytes) }, circuitState: values['circuit-state'], resume: values.resume, signal: controller.signal });
    console.log(JSON.stringify({ run_dir: runDir, state: result.manifest.state, terminal: result.manifest.outcomes.length, expected: 300 }));
    if (values.judge && result.manifest.collection_complete) await runJudgeJobs({ runDir, manifest: result.manifest, passes: 3, circuitState: values['circuit-state'], signal: controller.signal });
    return result;
  } finally { process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runManualCLI().catch(error => { console.error(error.stack); process.exitCode = 1; });
