import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BENCH_ROOT, HARNESS_DIR, runCommand } from './proc.mjs';
import { startTaskGateway } from './task-gateway.mjs';
import { ManualRecordingProxy } from './manual-recording-proxy.mjs';
import { profileFor, toolsForProfile, actorPrompt, loadPublicCatalog } from './browser-manual-profile.mjs';
import { BrowserScheduler } from './browser-scheduler.mjs';
import { MODEL, EFFORT, CLIENT_LABEL, CLAUDE_CLI, QUOTA_HEADROOM } from './model-family.mjs';

export const MCP_SERVER_NAME = 'fsb';
export const TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`;
// Above this size Claude Code saves a tool result to a file and sends only a
// preview, dropping its screenshot; the actor has no file tools to read it.
export const MAX_MCP_OUTPUT_TOKENS = 100_000;
// The child must not inherit the operator's Claude Code session (messaging
// sockets, session IDs, effort overrides) or any API credentials.
const ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];

export function claudeEnvironment(env = process.env, { toolTimeoutMs = 300_000, extra = {} } = {}) {
  const clean = Object.fromEntries(ENV_ALLOWLIST.filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
  return { ...clean, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', ENABLE_TOOL_SEARCH: 'false', DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', MCP_TIMEOUT: '30000', MCP_TOOL_TIMEOUT: String(toolTimeoutMs),
    MAX_MCP_OUTPUT_TOKENS: String(MAX_MCP_OUTPUT_TOKENS), ...extra };
}

export function claudeMcpConfig(socketPath) {
  return { mcpServers: { [MCP_SERVER_NAME]: { type: 'stdio', command: process.execPath,
    args: [path.join(HARNESS_DIR, 'mcp-task-stdio.mjs'), socketPath] } } };
}

export function claudeArguments({ model, effort, mcpConfigPath, promptPath, allowed, maxTurns = 400 }) {
  return ['-p', '--model', model, '--effort', effort, '--tools', '',
    '--strict-mcp-config', '--mcp-config', mcpConfigPath,
    '--setting-sources', '', '--settings', JSON.stringify({ disableAllHooks: true }),
    '--disable-slash-commands', '--no-chrome', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose', '--permission-mode', 'dontAsk',
    '--allowedTools', allowed.map(name => TOOL_PREFIX + name).join(','),
    '--disallowedTools', 'ListMcpResourcesTool,ReadMcpResourceTool',
    '--max-turns', String(maxTurns), '--system-prompt-file', promptPath];
}

// Only these outcomes can carry a provider failure; the rest are scored task results.
const PROVIDER_OUTCOMES = new Set(['error', 'never_started', 'rig_failure']);
const allowedTool = (name, allowed) => typeof name === 'string' && name.startsWith(TOOL_PREFIX) && allowed.includes(name.slice(TOOL_PREFIX.length));

export function claudeToolViolation(event, allowed) {
  if (event.type === 'system' && event.subtype === 'init') {
    const unexpected = (event.tools ?? []).filter(name => !allowedTool(name, allowed));
    if (unexpected.length) return `Unexpected Claude tools: ${unexpected.join(', ')}`;
    const servers = (event.mcp_servers ?? []).filter(server => server.name !== MCP_SERVER_NAME);
    return servers.length ? `Unexpected MCP servers: ${servers.map(server => server.name).join(', ')}` : null;
  }
  if (event.type !== 'assistant') return null;
  // A requested name outside the profile cannot run: the init inventory above is
  // the only tool surface, and the CLI answers "No such tool available" itself.
  // Server-side tools would execute, so they always stop the actor.
  for (const block of event.message?.content ?? []) if (block.type === 'server_tool_use') return `Disallowed server tool: ${block.name}`;
  return null;
}
export const invalidToolRequests = (event, allowed) => event.type === 'assistant'
  ? (event.message?.content ?? []).filter(block => block.type === 'tool_use' && !allowedTool(block.name, allowed)).map(block => block.name) : [];

// Collection and judging read cached tokens under the same key for both families.
export function normalizeClaudeUsage(usage) {
  if (!usage) return null;
  const read = usage.cache_read_input_tokens ?? 0, created = usage.cache_creation_input_tokens ?? 0;
  return { input_tokens: (usage.input_tokens ?? 0) + read + created, cached_input_tokens: read,
    cache_creation_input_tokens: created, uncached_input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0,
    thinking_tokens: usage.output_tokens_details?.thinking_tokens ?? null };
}

// Only the window that actually rejected: the circuit takes the latest reset in
// the text, and the other windows (weekly, overage) reset days later.
export const rejectedLimit = info => info && { status: info.status, rateLimitType: info.rateLimitType ?? null, resetsAt: info.resetsAt ?? null };

export function claudeFailureDetails(result, rejected) {
  const parts = [typeof result?.result === 'string' ? result.result : '', ...(result?.errors ?? []).map(String)];
  if (result?.api_error_status) parts.push(`API error status ${result.api_error_status}`);
  if (result?.subtype && result.subtype !== 'success') parts.push(`Claude result subtype ${result.subtype}`);
  if (rejected) parts.push('Claude rate limit rejected: ' + JSON.stringify(rejectedLimit(rejected)));
  return parts.filter(Boolean).join('\n') || 'Claude returned an unsuccessful result';
}

/** Highest-pressure window at or above its admission headroom, from a stream rate_limit_event. */
export function quotaHeadroom(info, limits = QUOTA_HEADROOM, now = Date.now() / 1000) {
  const windows = info?.unifiedWindows ?? {};
  const over = Object.entries(limits).flatMap(([name, limit]) => {
    const row = windows[name], resetsAt = row?.resetsAt > 1e11 ? Math.floor(row.resetsAt / 1000) : row?.resetsAt;
    return row && row.utilization >= limit && resetsAt > now ? [{ window: name, utilization: row.utilization, limit, resetsAt }] : [];
  });
  return over.sort((a, b) => b.resetsAt - a.resetsAt)[0] ?? null;
}

export async function runManualClaudeTask({ task, rawDir, attemptId = 'attempt-1', serverCommand, model = MODEL, effort = EFFORT,
  maxActions = 120, timeoutMs = 1_200_000, scheduler = new BrowserScheduler(), env = process.env, command = CLAUDE_CLI, run = runCommand,
  signal, onFault, beforeSpawn, publicRelease = false, public_release = publicRelease, publicPins = null, publicCatalog, beforePublicDispatch,
  promptFile = path.join(BENCH_ROOT, 'config/browser-manual-v2-prompt.md'), closeTabs } = {}) {
  rawDir = path.resolve(rawDir); await mkdir(rawDir, { recursive: true });
  const work = await mkdtemp(path.join(tmpdir(), 'om2w-claude-manual-'));
  const started = Date.now(), deadline = started + timeoutMs, abort = new AbortController();
  const cancel = () => { abort.abort(); gateway?.cancelPending(); };
  signal?.addEventListener('abort', cancel, { once: true });
  let gateway, limited = false, violation = null, fault = null, result = null, init = null, rateLimit = null, rejected = null, final;
  let error = null, pending = '', stderr = '', calls = 0, eventIndex = 0, spawnRequested = false, localNativeCancellation = false;
  const invalidTools = [];
  const profile = profileFor(public_release), allowed = toolsForProfile(profile);
  try {
    if (public_release) publicCatalog = await loadPublicCatalog({ publicPins, publicCatalog });
    gateway = await startTaskGateway({ ProxyClass: ManualRecordingProxy, command: serverCommand, rawDir, startUrl: task.website,
      taskId: task.task_id, attemptId, scheduler, maxActions, deadline, env, clientLabel: CLIENT_LABEL,
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
    const promptPath = path.join(work, 'instructions.md'), mcpConfigPath = path.join(work, 'mcp.json');
    await writeFile(promptPath, actorPrompt(await readFile(promptFile, 'utf8'), public_release, 'claude'));
    await writeFile(mcpConfigPath, JSON.stringify(claudeMcpConfig(gateway.socketPath)));
    const args = claudeArguments({ model, effort, mcpConfigPath, promptPath, allowed });
    const childEnv = claudeEnvironment(env, { extra: public_release ? { FSB_BENCH_PUBLIC_RELEASE: '1' } : {} });
    const observe = line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      const toolUses = event.type === 'assistant' ? (event.message?.content ?? []).filter(block => block.type === 'tool_use').map(block => block.name) : [];
      appendFileSync(path.join(rawDir, 'stream-event-times.jsonl'), JSON.stringify({ index: eventIndex++, at: new Date().toISOString(),
        elapsed_ms: Date.now() - started, type: event.type, subtype: event.subtype ?? null, ...(toolUses.length ? { tools: toolUses } : {}) }) + '\n');
      if (event.type === 'system' && event.subtype === 'init') {
        init = { session_id: event.session_id, model: event.model, cli_version: event.claude_code_version ?? null, tools: event.tools,
          mcp_servers: event.mcp_servers, permission_mode: event.permissionMode, api_key_source: event.apiKeySource };
        const status = event.mcp_servers?.find(server => server.name === MCP_SERVER_NAME)?.status;
        if (status === 'failed') { error = 'The FSB task MCP server failed to connect'; cancel(); }
      }
      if (event.type === 'rate_limit_event') {
        rateLimit = { ...event.rate_limit_info, observed_at: new Date().toISOString() };
        if (event.rate_limit_info?.status === 'rejected') rejected = event.rate_limit_info;
      }
      if (event.type === 'user') calls += (event.message?.content ?? []).filter(block => block?.type === 'tool_result').length;
      if (event.type === 'result') result = event;
      invalidTools.push(...invalidToolRequests(event, allowed));
      const forbidden = claudeToolViolation(event, allowed);
      if (forbidden) { violation = forbidden; cancel(); }
    };
    const canAdmit = !signal?.aborted && !abort.signal.aborted && Date.now() < deadline;
    const admission = canAdmit ? (beforeSpawn ? await beforeSpawn() : { allowed: true }) : { allowed: false };
    if (!admission.allowed || signal?.aborted || abort.signal.aborted || Date.now() >= deadline) {
      final = { task_id: task.task_id, profile: profile.id, driver: 'claude', model, effort, outcome: 'provider_pending', final_answer: null,
        error: 'Actor was not dispatched: resource or browser gate is pending', tool_calls: 0, usage: null, total_cost_usd: null, session_id: null };
      return final;
    }
    // Open and capture the start page before the model runs, so even an actor
    // that answers without a tool call leaves a judgeable trajectory.
    await gateway.proxy.bootstrap();
    if (signal?.aborted || abort.signal.aborted) throw Object.assign(new Error('Task cancelled before model dispatch'), { code: 'CANCELLED_BEFORE_SPAWN' });
    spawnRequested = true;
    const execution = await run(command, args, { cwd: work, env: childEnv, capture: false, signal: abort.signal,
      input: `Starting website: ${task.website}\nTask: ${task.confirmed_task}\n`, timeoutMs: Math.max(1, deadline - Date.now()),
      onStdout: chunk => { appendFileSync(path.join(rawDir, 'stream.jsonl'), chunk); pending += chunk; const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(observe); },
      onStderr: chunk => { appendFileSync(path.join(rawDir, 'stderr.log'), chunk); stderr = (stderr + chunk).slice(-8000); } });
    if (pending.trim()) observe(pending);
    const succeeded = result?.subtype === 'success' && result.is_error !== true;
    if (result && !succeeded) error ??= claudeFailureDetails(result, rejected);
    if (!result && !error && execution.code !== 0 && !execution.timedOut && !(localNativeCancellation && execution.code === 128)
        && !violation && !limited && !fault)
      error = [stderr.trim() || `Claude CLI exited unexpectedly with code ${execution.code}`, rejected ? 'Claude rate limit rejected: ' + JSON.stringify(rejectedLimit(rejected)) : ''].filter(Boolean).join('\n');
    const answer = succeeded && typeof result.result === 'string' ? result.result.trim() : '';
    const outcome = violation ? 'tool_violation' : limited ? 'step_limit' : execution.timedOut ? 'timeout'
      : fault ? 'capture_failure' : result?.subtype === 'error_max_turns' ? 'step_limit'
      : succeeded && execution.code === 0 ? (answer ? 'complete' : 'no_answer')
      : !gateway.proxy.boot ? 'never_started' : 'error';
    final = { task_id: task.task_id, profile: profile.id, driver: 'claude', model, effort, outcome,
      final_answer: outcome === 'complete' ? answer : null, tool_calls: calls, num_turns: result?.num_turns ?? null,
      usage: normalizeClaudeUsage(result?.usage), claude_usage: result?.usage ?? null, model_usage: result?.modelUsage ?? null,
      total_cost_usd: result?.total_cost_usd ?? null, duration_api_ms: result?.duration_api_ms ?? null,
      session_id: init?.session_id ?? result?.session_id ?? null, init, rate_limit: rateLimit, permission_denials: result?.permission_denials ?? null,
      invalid_tool_requests: invalidTools,
      error: outcome === 'complete' ? null : violation ?? fault?.error ?? error
        ?? (outcome === 'no_answer' ? 'Claude finished without a final answer' : stderr.trim() || outcome) };
  } catch (caught) {
    if (public_release && spawnRequested) error ??= caught.message;
    final = { task_id: task.task_id, profile: profile.id, driver: 'claude', model, effort, outcome: 'rig_failure', final_answer: null,
      error: caught.message, error_code: caught.code ?? null, usage: normalizeClaudeUsage(result?.usage), tool_calls: calls,
      total_cost_usd: result?.total_cost_usd ?? null, session_id: init?.session_id ?? null, init, rate_limit: rateLimit };
  } finally {
    signal?.removeEventListener('abort', cancel);
    final.actor_duration_ms = Date.now() - started;
    final.model_spawn_requested = spawnRequested;
    if (public_release) {
      final.public_release = true; final.public_pins = publicPins;
      // Scored task outcomes (turn cap, timeout, no answer, ...) are not provider faults.
      final.provider_error = PROVIDER_OUTCOMES.has(final.outcome) ? error : null;
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
