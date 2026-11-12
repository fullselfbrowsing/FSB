import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BENCH_ROOT, runCommand } from './proc.mjs';
import { atomicJson, acquireRunLock } from './run-state.mjs';
import { writeReport } from './report.mjs';
import { writeManualReport } from './manual-report.mjs';
import { waitForResource } from './readiness.mjs';
import { FAMILY, MODEL, EFFORT, JUDGE_ENGINE, CLAUDE_CLI } from './model-family.mjs';
import { PROFILE_ID, PUBLIC_PROFILE_ID } from './browser-manual-profile.mjs';

const manualProfile = manifest => [PROFILE_ID, PUBLIC_PROFILE_ID].includes(manifest.profile);

export const JUDGE_PROTOCOL = 'scorefield-v2';
export function judgeMatrix({ syntheticModels = false } = {}) {
  return (syntheticModels ? ['official'] : ['official', 'strict']).flatMap(variant =>
    (syntheticModels ? [1] : [1, 2, 3]).map(pass => ({ engine: syntheticModels ? 'fake' : JUDGE_ENGINE,
      variant, pass, id: `${syntheticModels ? 'fake' : JUDGE_ENGINE}-${variant}-pass${pass}`, status: 'pending' })));
}

async function circuitGate(file) {
  let document;
  try { document = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (document.format_version !== 1 || document.policy?.id !== 'codex-circuit-v2') throw new Error('Invalid shared model circuit');
  const state = document.families?.[FAMILY];
  if (!state || state.state === 'closed') return null;
  if (!['open', 'half_open', 'blocked'].includes(state.state)) throw new Error('Invalid shared circuit state');
  if (state.state === 'half_open') {
    try { process.kill(state.probe.pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return null; if (error.code !== 'EPERM') throw error; }
  }
  if (state.state === 'open' && state.not_before_epoch <= Date.now() / 1000) return null;
  return state;
}

export async function runJudgeJobs(options) {
  const { runDir, manifest } = options;
  const release = manualProfile(manifest) ? await acquireRunLock(runDir) : async () => {};
  try { return await runJudgeJobsLocked(options); } finally { await release(); }
}

async function runJudgeJobsLocked({ runDir, manifest, passes = 3, syntheticModels = false,
  wait = false, waitMs = 60_000, signal, run = runCommand, sleep = waitForResource,
  shouldStop = () => false, circuitState = manifest.circuit_state ?? path.join(runDir, 'model-circuit.json'),
  model = MODEL, effort = EFFORT, cli = CLAUDE_CLI }) {
  if (!syntheticModels && (passes !== 3 || manifest.judge_protocol !== JUDGE_PROTOCOL)) {
    throw new Error(`A new scorefield-v2 run with exactly six ${JUDGE_ENGINE} jobs is required`);
  }
  if (manualProfile(manifest) && (!manifest.collection_complete || manifest.state !== 'collected' || manifest.task_ids.length !== 300)) {
    throw new Error('Fresh judging requires all300 tasks collected before inputs are frozen');
  }
  const checkpoint = path.join(runDir, 'judge-jobs.json');
  let previous;
  try { previous = JSON.parse(await readFile(checkpoint, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const jobs = judgeMatrix({ syntheticModels });
  if (previous && (previous.judge_protocol !== JUDGE_PROTOCOL ||
      JSON.stringify(previous.jobs.map(job => job.id)) !== JSON.stringify(jobs.map(job => job.id)))) {
    throw new Error('Refusing to replace a different or historical judge matrix');
  }
  while (!signal?.aborted && !shouldStop()) {
    let blocked = null;
    for (const job of jobs) {
      if (signal?.aborted || shouldStop()) break;
      if (job.status === 'complete') continue;
      blocked = syntheticModels ? null : await circuitGate(circuitState);
      if (blocked) break;
      const summaryPath = path.join(runDir, 'judge', job.id, 'summary.json');
      // Every job enters run_pass at startup, including cached complete jobs, so
      // input and evaluator fingerprints are verified before accepting summaries.
      const result = await run(path.join(BENCH_ROOT, 'judge/.venv/bin/python'),
        ['-m', 'om2w_judge.runner', '--engine', job.engine, '--model', syntheticModels ? 'fake' : model,
          ...(syntheticModels ? [] : ['--cli', cli]),
          '--effort', effort, '--variant', job.variant, '--pass_number', String(job.pass),
          '--judge-protocol', JUDGE_PROTOCOL, '--retry_errors', '--num_workers', '10',
          '--engine-concurrency', '10', '--attempts', '3', '--transport-attempts', '2',
          '--circuit-state', path.resolve(circuitState),
          '--trajectories_dir', path.join(runDir, 'trajectories'), '--output_path', path.join(runDir, 'judge'),
          '--task_ids', path.join(runDir, 'task-ids.json')],
        { cwd: path.join(BENCH_ROOT, 'judge'), env: { ...process.env, PYTHONPATH: path.join(BENCH_ROOT, 'judge') },
          timeoutMs: 24 * 3600_000, signal });
      let summary = await readFile(summaryPath, 'utf8').then(JSON.parse).catch(() => null);
      const emittedSummary = result.stdout.split('\n').some(line => {
        try { const row = JSON.parse(line); return row.expected === manifest.task_ids.length &&
          row.judge_protocol === JUDGE_PROTOCOL && typeof row.pending_judgments === 'number'; }
        catch { return false; }
      });
      if (!summary || !emittedSummary || (result.code !== 0 && ![1, 75].includes(result.code))) {
        // A stale summary cannot turn a fingerprint refusal into completion.
        throw new Error(`Judge job ${job.id} failed configuration or worker validation`);
      }
      if (summary.judge_protocol !== JUDGE_PROTOCOL || summary.expected !== manifest.task_ids.length ||
          summary.workers !== 10 || summary.engine_concurrency !== 10 || summary.global_cli_limit !== 10) {
        throw new Error('Judge summary violates the pinned protocol or concurrency');
      }
      job.summary = summary;
      job.status = summary.pending_judgments === 0 ? 'complete' : 'pending';
      await atomicJson(checkpoint, { complete: jobs.every(j => j.status === 'complete'), jobs,
        judge_protocol: JUDGE_PROTOCOL, scope: syntheticModels ? 'synthetic' : `${JUDGE_ENGINE}_only`,
        active_jobs_limit: 1, task_workers: 10, engine_concurrency: 10, global_cli_limit: 10,
        circuit_state: path.resolve(circuitState), updated_at: new Date().toISOString() });
      await (manualProfile(manifest) ? writeManualReport : writeReport)(runDir, manifest);
      if (summary.pending_judgments) { blocked = summary.circuit ?? { state: 'open' }; break; }
    }
    if (jobs.every(job => job.status === 'complete')) return { complete: true, jobs, judge_protocol: JUDGE_PROTOCOL };
    if (!wait || signal?.aborted || shouldStop() || blocked?.state === 'blocked') break;
    await sleep(Math.min(60_000, Math.max(1000, waitMs)), signal);
  }
  return { complete: false, jobs, judge_protocol: JUDGE_PROTOCOL };
}
