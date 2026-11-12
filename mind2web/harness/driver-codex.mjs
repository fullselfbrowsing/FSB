import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BENCH_ROOT, HARNESS_DIR, runCommand } from './proc.mjs';
import { startTaskGateway } from './task-gateway.mjs';

export const CODEX_TOOL_ISOLATION = Object.freeze(JSON.parse(readFileSync(new URL('../config/codex-tool-isolation.json', import.meta.url), 'utf8')));
export const CODEX_MODEL_CATALOG = path.join(BENCH_ROOT, 'config/codex-gpt61sol-browser-policy.json');

export function tomlValue(value) {
  if (Array.isArray(value)) return '[' + value.map(tomlValue).join(', ') + ']';
  if (value && typeof value === 'object') return '{ ' + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ' = ' + tomlValue(item)).join(', ') + ' }';
  if (value === null || !['string', 'boolean', 'number'].includes(typeof value)) throw new TypeError('Unsupported Codex TOML config value');
  return JSON.stringify(value);
}

export function codexToolViolation(event, allowed) {
  const item = event.item;
  if (!item) return null;
  if (item.type === 'mcp_tool_call') return item.server === 'fsb' && allowed.includes(item.tool) ? null : `Disallowed MCP tool: ${item.server}/${item.tool}`;
  if (['agent_message', 'reasoning', 'todo_list', 'plan', 'error', 'user_message', 'compaction', 'context_compaction'].includes(item.type)) return null;
  return `Disallowed tool event: ${item.type}`;
}

export function codexArguments({ model, effort, socketPath, promptPath, answerPath, allowed, toolTimeoutSeconds = 120 }) {
  const config = {
    ...CODEX_TOOL_ISOLATION,
    model_catalog_json: CODEX_MODEL_CATALOG,
    model_reasoning_effort: effort, model_instructions_file: promptPath, project_doc_max_bytes: 0,
    approval_policy: 'never', web_search: 'disabled',
    'features.shell_tool': false, 'features.apply_patch_freeform': false, 'features.multi_agent': false,
    'mcp_servers.fsb.command': process.execPath,
    'mcp_servers.fsb.args': [path.join(HARNESS_DIR, 'mcp-task-stdio.mjs'), socketPath],
    'mcp_servers.fsb.enabled_tools': allowed, 'mcp_servers.fsb.default_tools_approval_mode': 'approve',
    'mcp_servers.fsb.startup_timeout_sec': 30, 'mcp_servers.fsb.tool_timeout_sec': toolTimeoutSeconds, 'mcp_servers.fsb.required': true,
  };
  return ['exec', '-m', model, '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-s', 'read-only',
    '--json', '-o', answerPath, ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${tomlValue(value)}`]), '-'];
}

export async function runCodexTask({ task, rawDir, serverCommand, model = 'gpt-6.1-sol', effort = 'medium', maxActions = 60, timeoutMs = 600_000,
  env = process.env, command = 'codex', run = runCommand, signal } = {}) {
  rawDir = path.resolve(rawDir);
  await mkdir(rawDir, { recursive: true });
  const work = await mkdtemp(path.join(tmpdir(), 'om2w-agent-'));
  const started = Date.now();
  const abort = new AbortController();
  const forwardAbort = () => abort.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) abort.abort();
  let gateway;
  let final;
  let violation = null;
  let limited = false;
  let sessionId = null;
  let usage = null;
  let completed = false;
  let error = null;
  let pending = '';
  const counters = { tool_calls: 0, turns: 0 };
  try {
    const allowlist = JSON.parse(await readFile(path.join(BENCH_ROOT, 'config/tool-allowlist.json'), 'utf8'));
    const allowed = [...Object.keys(allowlist.actions), ...allowlist.reads];
    gateway = await startTaskGateway({ command: serverCommand, rawDir, startUrl: task.website, allowlist, env, clientLabel: 'Codex', maxActions,
      onLimit: () => { limited = true; abort.abort(); },
      onDenied: name => { violation = `Disallowed FSB tool: ${name}`; abort.abort(); },
    });
    const promptPath = path.join(work, 'instructions.md');
    const answerPath = path.join(work, 'answer.txt');
    await writeFile(promptPath, await readFile(path.join(BENCH_ROOT, 'config/agent-prompt.md')));
    const args = codexArguments({ model, effort, socketPath: gateway.socketPath, promptPath, answerPath, allowed });
    const cleanEnv = { ...env };
    delete cleanEnv.HF_TOKEN;
    delete cleanEnv.HUGGING_FACE_HUB_TOKEN;
    const eventLine = line => {
      let event;
      try { event = JSON.parse(line); } catch { return; }
      if (event.type === 'thread.started') sessionId = event.thread_id;
      if (event.type === 'turn.completed') { completed = true; usage = event.usage; counters.turns++; }
      if (event.type === 'turn.failed' || event.type === 'error') error = event.error?.message ?? event.message ?? JSON.stringify(event);
      const denied = codexToolViolation(event, allowed);
      if (denied) { violation = denied; abort.abort(); }
      if (event.type === 'item.completed' && event.item?.type === 'mcp_tool_call') counters.tool_calls++;
    };
    let stderr = '';
    const execution = await run(command, args, { cwd: work, env: cleanEnv,
      input: `Starting website: ${task.website}\nTask: ${task.confirmed_task}\n`, timeoutMs, capture: false, signal: abort.signal,
      onStdout: chunk => {
        appendFileSync(path.join(rawDir, 'stream.jsonl'), chunk);
        pending += chunk;
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) eventLine(line);
      },
      onStderr: chunk => { appendFileSync(path.join(rawDir, 'stderr.log'), chunk); stderr = (stderr + chunk).slice(-4000); },
    });
    if (pending.trim()) eventLine(pending);
    let answer = null;
    try { answer = await readFile(answerPath, 'utf8'); } catch {}
    let outcome = violation ? 'tool_violation' : limited ? 'step_limit' : execution.timedOut ? 'timeout' :
      completed && execution.code === 0 && answer?.trim() ? 'complete' : 'error';
    error = violation ?? (limited ? 'Benchmark action limit reached' : error) ?? stderr.trim() ?? null;
    if (outcome === 'error' && !gateway.proxy.boot) outcome = 'never_started';
    if (outcome === 'complete' && !gateway.proxy.tabId) { outcome = 'error'; error = 'Agent returned an answer without opening a benchmark tab'; }
    const steps = await readFile(path.join(rawDir, 'steps.jsonl'), 'utf8').catch(() => '');
    if (['error', 'never_started'].includes(outcome) && /extension_not_connected|extension disconnected|TAB_NOT_FOREGROUND|MCP .*timed out|Upstream MCP server exited|bootstrap failed/i.test(steps + error)) outcome = 'rig_failure';
    if (outcome !== 'tool_violation' && gateway.proxy.meta.counts.screenshot_errors) {
      outcome = 'rig_failure'; error = 'FSB screenshot capture failed; the attempt cannot be exported faithfully';
    }
    final = { task_id: task.task_id, driver: 'codex', model, effort, final_answer: outcome === 'complete' ? answer.trim() : null,
      outcome, num_turns: counters.turns, tool_calls: counters.tool_calls, action_count: gateway.proxy.meta.counts.actions,
      screenshot_retries: gateway.proxy.meta.counts.screenshot_retries,
      duration_ms: Date.now() - started, usage, total_cost_usd: null, session_id: sessionId,
      error: outcome === 'complete' ? null : error || outcome };
  } catch (err) {
    final = { task_id: task.task_id, driver: 'codex', model, effort, final_answer: null, outcome: 'rig_failure', error: err.message,
      duration_ms: Date.now() - started, num_turns: counters.turns, usage, total_cost_usd: null, session_id: sessionId };
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
    if (gateway) {
      try { await gateway.close(); }
      catch (err) { gateway.proxy.meta.cleanup_ok = false; gateway.proxy.meta.cleanup_error = err.message; }
      final.cleanup_ok = gateway.proxy.meta.cleanup_ok ?? null;
      if (gateway.proxy.meta.cleanup_ok === false) final.cleanup_error = gateway.proxy.meta.cleanup_error;
    }
    await writeFile(path.join(rawDir, 'final.json'), JSON.stringify(final, null, 2) + '\n');
    await rm(work, { recursive: true, force: true });
  }
  return final;
}
