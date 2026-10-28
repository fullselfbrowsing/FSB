import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BENCH_ROOT, runCommand } from './proc.mjs';
import { codexArguments, codexToolViolation } from './driver-codex.mjs';
import { startTaskGateway } from './task-gateway.mjs';
import { ManualRecordingProxy } from './manual-recording-proxy.mjs';
import { profileFor, toolsForProfile, actorPrompt, loadPublicCatalog } from './browser-manual-profile.mjs';
import { BrowserScheduler } from './browser-scheduler.mjs';

export function codexFailureDetails(event) {
  const message = event.error?.message ?? event.message;
  const context = JSON.stringify(event);
  return typeof message === 'string' ? `${message}\nCodex error context: ${context}` : context;
}

export async function runManualCodexTask({ task, rawDir, attemptId = 'attempt-1', serverCommand, model = 'gpt-6.1-sol', effort = 'medium',
  maxActions = 120, timeoutMs = 1_200_000, scheduler = new BrowserScheduler(), env = process.env, command = 'codex', run = runCommand,
  signal, onFault, beforeSpawn, publicRelease = false, public_release = publicRelease, publicPins = null, publicCatalog, beforePublicDispatch,
  promptFile = path.join(BENCH_ROOT, 'config/browser-manual-v2-prompt.md'), closeTabs } = {}) {
  rawDir = path.resolve(rawDir); await mkdir(rawDir, { recursive: true });
  const work = await mkdtemp(path.join(tmpdir(), 'om2w-manual-'));
  const started = Date.now(), deadline = started + timeoutMs, abort = new AbortController();
  const cancel = () => { abort.abort(); gateway?.cancelPending(); };
  signal?.addEventListener('abort', cancel, { once: true });
  let gateway, limited = false, violation = null, fault = null, completed = false, usage = null, sessionId = null, final;
  let error = null, pending = '', stderr = '', calls = 0, eventIndex = 0, spawnRequested = false, localNativeCancellation = false;
  const profile = profileFor(public_release), allowed = toolsForProfile(profile);
  try {
    if (public_release) publicCatalog = await loadPublicCatalog({ publicPins, publicCatalog });
    gateway = await startTaskGateway({ ProxyClass: ManualRecordingProxy, command: serverCommand, rawDir, startUrl: task.website,
      taskId: task.task_id, attemptId, scheduler, maxActions, deadline, env, clientLabel: 'Codex',
      public_release, publicCatalog, beforePublicDispatch, ...(closeTabs ? { closeTabs } : {}),
      onLimit: () => { limited = true; cancel(); }, onDenied: name => { violation = `Disallowed FSB tool: ${name}`; cancel(); },
      onFault: detail => {
        fault = detail;
        if (public_release && detail.local_public_native_failure) localNativeCancellation = true;
        else onFault?.(detail);
        cancel();
      } });
    await gateway.initialize();
    if (public_release) await gateway.proxy.preparePublicRelease();
    if (signal?.aborted) cancel();
    const promptPath = path.join(work, 'instructions.md'), answerPath = path.join(work, 'answer.txt');
    await writeFile(promptPath, actorPrompt(await readFile(promptFile, 'utf8'), public_release, 'codex'));
    const args = codexArguments({ model, effort, socketPath: gateway.socketPath, promptPath, answerPath, allowed, toolTimeoutSeconds: 300 });
    const cleanEnv = { ...env }; delete cleanEnv.HF_TOKEN; delete cleanEnv.HUGGING_FACE_HUB_TOKEN;
    if (public_release) cleanEnv.FSB_BENCH_PUBLIC_RELEASE = '1';
    const observe = line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      appendFileSync(path.join(rawDir, 'stream-event-times.jsonl'), JSON.stringify({ index: eventIndex++, at: new Date().toISOString(),
        elapsed_ms: Date.now() - started, type: event.type, item_id: event.item?.id, item_type: event.item?.type, tool: event.item?.tool }) + '\n');
      if (event.type === 'thread.started') sessionId = event.thread_id;
      if (event.type === 'turn.completed') { completed = true; usage = event.usage; }
      if (event.type === 'error' || event.type === 'turn.failed') {
        const detail = codexFailureDetails(event);
        error = error ? error + '\n' + detail : detail;
      }
      const forbidden = codexToolViolation(event, allowed);
      if (forbidden) { violation = forbidden; cancel(); }
      if (event.type === 'item.completed' && event.item?.type === 'mcp_tool_call') calls++;
    };
    const canAdmit = !signal?.aborted && !abort.signal.aborted && Date.now() < deadline;
    const admission = canAdmit ? (beforeSpawn ? await beforeSpawn() : { allowed: true }) : { allowed: false };
    if (!admission.allowed || signal?.aborted || abort.signal.aborted || Date.now() >= deadline) {
      final = { task_id: task.task_id, profile: profile.id, driver: 'codex', model, effort, outcome: 'provider_pending', final_answer: null,
        error: 'Actor was not dispatched: resource or browser gate is pending', tool_calls: 0, usage: null, total_cost_usd: null, session_id: null };
      return final;
    }
    spawnRequested = true;
    const execution = await run(command, args, { cwd: work, env: cleanEnv, capture: false, signal: abort.signal,
      input: `Starting website: ${task.website}\nTask: ${task.confirmed_task}\n`, timeoutMs: Math.max(1, deadline - Date.now()),
      onStdout: chunk => { appendFileSync(path.join(rawDir, 'stream.jsonl'), chunk); pending += chunk; const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(observe); },
      onStderr: chunk => { appendFileSync(path.join(rawDir, 'stderr.log'), chunk); stderr = (stderr + chunk).slice(-8000); } });
    if (pending.trim()) observe(pending);
    if (public_release && !error && execution.code !== 0 && !execution.timedOut
        && !(localNativeCancellation && execution.code === 128))
      error = stderr.trim() || `Codex CLI exited unexpectedly with code ${execution.code}`;
    const answer = await readFile(answerPath, 'utf8').catch(() => null);
    const outcome = violation ? 'tool_violation' : limited ? 'step_limit' : execution.timedOut ? 'timeout'
      : fault ? 'capture_failure' : completed && execution.code === 0 && answer?.trim() ? 'complete'
      : !gateway.proxy.boot ? 'never_started' : 'error';
    final = { task_id: task.task_id, profile: profile.id, driver: 'codex', model, effort, outcome,
      final_answer: outcome === 'complete' ? answer.trim() : null, tool_calls: calls, usage, total_cost_usd: null,
      session_id: sessionId, error: outcome === 'complete' ? null : violation ?? fault?.error ?? error ?? (stderr.trim() || outcome) };
  } catch (caught) {
    if (public_release && spawnRequested) error ??= caught.message;
    final = { task_id: task.task_id, profile: profile.id, driver: 'codex', model, effort, outcome: 'rig_failure', final_answer: null,
      error: caught.message, error_code: caught.code ?? null, usage, tool_calls: calls, total_cost_usd: null, session_id: sessionId };
  } finally {
    signal?.removeEventListener('abort', cancel);
    final.actor_duration_ms = Date.now() - started;
    final.model_spawn_requested = spawnRequested;
    if (public_release) {
      final.public_release = true; final.public_pins = publicPins;
      final.provider_error = error;
    }
    gateway?.cancelPending();
    const cleanupStarted = Date.now();
    if (gateway) {
      try { await gateway.close(); }
      catch (caught) { gateway.proxy.meta.cleanup_ok = false; gateway.proxy.meta.cleanup_error = caught.message; scheduler.halt(caught.message); }
      final.cleanup_ok = gateway.proxy.meta.cleanup_ok;
      final.cleanup_error = gateway.proxy.meta.cleanup_error ?? null;
      final.action_count = gateway.proxy.meta.counts.actions;
      final.actor_mutations_dispatched = gateway.proxy.meta.counts.actor_mutations_dispatched;
      final.screenshot_errors = gateway.proxy.meta.counts.screenshot_errors;
      final.queue_expiries = gateway.proxy.meta.queue_expiries ?? 0;
      final.fault = gateway.proxy.meta.fault ?? null;
      final.uncertain_upstream = gateway.proxy.meta.uncertain_upstream ?? false;
      if (public_release) {
        final.public_catalog = gateway.proxy.meta.public_catalog ?? null;
        final.public_disposition = gateway.proxy.meta.public_disposition ?? null;
      }
    }
    final.cleanup_duration_ms = Date.now() - cleanupStarted;
    final.duration_ms = Date.now() - started;
    final.completed_at = new Date().toISOString();
    await writeFile(path.join(rawDir, 'final.json'), JSON.stringify(final, null, 2) + '\n');
    await rm(work, { recursive: true, force: true });
  }
  return final;
}
