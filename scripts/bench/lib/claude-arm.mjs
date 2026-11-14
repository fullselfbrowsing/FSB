/**
 * Phase 66 benchmark MCP arm: headless Claude Code (D-12, D-14, D-18, B3,
 * W7, W10, T-66-ARGV, T-66-01d).
 *
 * The argv is the pinned v0.9.91 task-mode profile plus an explicit --model
 * (host-stream.mjs buildClaudeArgv). No permission-bypass flag is ever
 * built. The task goes to Claude on stdin, never in argv, and Claude runs in
 * an empty temp workdir that holds only mcp.json, so no project skills or
 * settings load.
 *
 * The host never inherits the runner's environment (B3). buildBenchChildEnv
 * copies an allowlist only (HOME, PATH, USER, LOGNAME, SHELL, TMPDIR, LANG,
 * LC_* and the proxy variables in either case), then asserts that nothing
 * named CLAUDECODE, CLAUDE_* or any DELEGATION_PROVIDER_KEY_NAMES entry got
 * through. That list is imported read-only from mcp/build (D-01,
 * orchestrator decision 10). ENABLE_TOOL_SEARCH is set only when requested.
 * Identity records the key names and their SHA-256, never a value.
 *
 * The host runs in its own process group (detached) and is killed as a
 * group, so MCP relay children cannot outlive a run (W10). On budget expiry
 * the group gets SIGINT first (SIGTERM exits without a result event), then
 * SIGTERM after a grace, then SIGKILL. After any exit the group is reaped
 * the same way.
 *
 * Wall time is the runner's clock: t0 immediately before spawn, initAt at the
 * init event and t1 at the result event (D-06). The stdout stream is teed to
 * a raw file under the gitignored .local tree; the stderr tail stays in that
 * raw file only.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { sha256Hex } from './identity.mjs';
import {
  buildClaudeArgv,
  createNdjsonAccumulator,
  FORBIDDEN_HOST_FLAGS,
  readFsbAgentPolicy,
  serializeFsbAgents,
  summarizeClaudeStream,
} from './host-stream.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

export const BENCH_ENV_ALLOWLIST = Object.freeze([
  'HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
]);
export const TOOL_SEARCH_MODES = Object.freeze(['unset', 'auto', 'true', 'false']);
const LOCALE_PREFIX = 'LC_';
const RAW_STREAM_MAX_BYTES = 64 * 1024 * 1024;
const STDERR_TAIL_BYTES = 16 * 1024;
const VERSION_TIMEOUT_MS = 20000;
const REAP_POLL_MS = 25;
const SIGKILL_SETTLE_MS = 2000;
const SAFETY_SLACK_MS = 15000;
// Event types the summarizers read in full; every other type is kept as a
// { type } stub, which is all a summarizer counts (partial-message deltas
// would otherwise hold the whole stream in memory).
const FULL_EVENT_TYPES = new Set(['system', 'assistant', 'rate_limit_event', 'result', 'tool_call']);

/**
 * The host CLI environment (B3): allowlisted names only, plus
 * ENABLE_TOOL_SEARCH when toolSearch is 'auto', 'true' or 'false'.
 * Returns { env, keyNames, keyNamesSha256 }.
 */
export function buildBenchChildEnv(parentEnv, { toolSearch = 'unset', providerKeyNames = [] } = {}) {
  if (!TOOL_SEARCH_MODES.includes(toolSearch)) {
    throw new TypeError("toolSearch must be one of 'unset', 'auto', 'true', 'false'");
  }
  const source = parentEnv !== null && typeof parentEnv === 'object' ? parentEnv : {};
  const env = {};
  for (const name of Object.keys(source)) {
    if (!BENCH_ENV_ALLOWLIST.includes(name) && !name.startsWith(LOCALE_PREFIX)) continue;
    if (typeof source[name] !== 'string') continue;
    env[name] = source[name];
  }
  // Defense in depth: the allowlist already excludes these names.
  const forbidden = new Set();
  for (const name of Array.isArray(providerKeyNames) ? providerKeyNames : []) {
    if (typeof name === 'string') {
      forbidden.add(name);
      forbidden.add(name.toUpperCase());
    }
  }
  for (const name of Object.keys(env)) {
    if (name === 'CLAUDECODE' || name.startsWith('CLAUDE_') || forbidden.has(name) || forbidden.has(name.toUpperCase())) {
      throw new Error('bench child env allowlist admitted a forbidden variable name');
    }
  }
  if (toolSearch !== 'unset') env.ENABLE_TOOL_SEARCH = toolSearch;
  const keyNames = Object.keys(env).sort();
  return { env, keyNames, keyNamesSha256: sha256Hex(keyNames.join('\n')) };
}

/**
 * DELEGATION_PROVIDER_KEY_NAMES, imported read-only from the compiled MCP
 * server (mcp/build/agent-providers/spawn-environment.js).
 */
export async function loadProviderKeyNames(repoRoot = REPO_ROOT) {
  const file = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'spawn-environment.js');
  if (!fs.existsSync(file)) {
    throw new Error('mcp/build is missing the provider key list; run `npm --prefix mcp run build` first');
  }
  const mod = await import(pathToFileURL(file).href);
  const names = mod.DELEGATION_PROVIDER_KEY_NAMES;
  if (!Array.isArray(names) || names.length === 0 || !names.every((name) => typeof name === 'string' && name)) {
    throw new Error('mcp/build DELEGATION_PROVIDER_KEY_NAMES is not a list of names; rebuild with `npm --prefix mcp run build`');
  }
  return names.slice();
}

function versionLine(text) {
  if (typeof text !== 'string') return null;
  const line = text.split(/\r?\n/).map((part) => part.trim()).find(Boolean);
  if (!line) return null;
  const clean = line.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
  return clean && !clean.includes('://') ? clean : null;
}

/** `<command> --version` with the allowlisted env, shell off; null on failure. */
export function hostVersion({ command, commandArgsPrefix = [], providerKeyNames = [] } = {}) {
  const { env } = buildBenchChildEnv(process.env, { toolSearch: 'unset', providerKeyNames });
  const result = spawnSync(command, [...commandArgsPrefix, '--version'], {
    cwd: os.tmpdir(),
    env,
    shell: false,
    encoding: 'utf8',
    timeout: VERSION_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.error || result.status !== 0) return null;
  return versionLine(result.stdout);
}

/** `claude --version` (for example '2.1.283 (Claude Code)'), or null. */
export function claudeVersion({ command = 'claude', commandArgsPrefix = [], providerKeyNames = [] } = {}) {
  return hostVersion({ command, commandArgsPrefix, providerKeyNames });
}

function assertNoForbiddenHostFlags(argv) {
  for (const arg of argv) {
    for (const flag of FORBIDDEN_HOST_FLAGS) {
      if (arg === flag || String(arg).startsWith(`${flag}=`)) throw new Error('refusing to spawn a host with a permission-bypass flag');
    }
  }
}

function positiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer`);
  return value;
}

function nonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative integer`);
  return value;
}

/**
 * Shared host-CLI lifecycle for the Claude Code and Cursor drivers: spawn in
 * a new process group, feed stdin (or none), tee stdout to rawStreamPath and
 * parse it as NDJSON, enforce the budget with the SIGINT/SIGTERM/SIGKILL
 * ladder, and reap the whole group after any exit.
 * Resolves { t0, initAt, t1, exitedAt, exitCode, signal, timedOut, aborted,
 * spawnError, events, streamStats }.
 */
export function runHostCli({
  command, args, cwd, env, stdinText = null, budgetMs, rawStreamPath,
  sigintGraceMs = 10000, sigtermGraceMs = 5000, signal = null,
}) {
  positiveInteger(budgetMs, 'budgetMs');
  nonNegativeInteger(sigintGraceMs, 'sigintGraceMs');
  nonNegativeInteger(sigtermGraceMs, 'sigtermGraceMs');
  if (typeof rawStreamPath !== 'string' || !path.isAbsolute(rawStreamPath)) throw new TypeError('rawStreamPath must be an absolute path');
  assertNoForbiddenHostFlags(args);

  return new Promise((resolve) => {
    const events = [];
    let initAt = null;
    let t1 = null;
    const accumulator = createNdjsonAccumulator((event) => {
      const now = Date.now();
      if (event.type === 'system' && event.subtype === 'init' && initAt === null) initAt = now;
      if (event.type === 'result' && t1 === null) t1 = now;
      events.push(FULL_EVENT_TYPES.has(event.type) ? event : { type: event.type });
    });
    const rawFd = fs.openSync(rawStreamPath, 'w', 0o600);
    let rawBytes = 0;
    let rawDropped = 0;
    let stderrTail = Buffer.alloc(0);
    let stderrBytes = 0;
    let child = null;
    let t0 = null;
    let exitedAt = null;
    let exitCode = null;
    let exitSignal = null;
    let timedOut = false;
    let aborted = false;
    let spawnError = null;
    let ladderStarted = false;
    let settled = false;
    let reapPromise = null;
    let safety = null;
    const timers = [];

    const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

    function signalGroup(sig) {
      if (!child || !Number.isInteger(child.pid)) return false;
      try {
        process.kill(-child.pid, sig);
        return true;
      } catch {
        return false;
      }
    }

    function groupAlive() {
      if (!child || !Number.isInteger(child.pid)) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        return error && error.code === 'EPERM';
      }
    }

    async function waitGroupGone(ms) {
      const deadline = Date.now() + ms;
      while (groupAlive()) {
        if (Date.now() >= deadline) return false;
        await new Promise((r) => setTimeout(r, REAP_POLL_MS));
      }
      return true;
    }

    // After the direct child exits, no member of its group may survive.
    async function reapGroup() {
      if (!groupAlive()) return;
      signalGroup('SIGTERM');
      if (await waitGroupGone(sigtermGraceMs)) return;
      signalGroup('SIGKILL');
      await waitGroupGone(SIGKILL_SETTLE_MS);
    }

    function startLadder() {
      if (ladderStarted) return;
      ladderStarted = true;
      signalGroup('SIGINT');
      timers.push(setTimeout(() => {
        signalGroup('SIGTERM');
        timers.push(setTimeout(() => signalGroup('SIGKILL'), sigtermGraceMs));
      }, sigintGraceMs));
    }

    const onAbort = () => {
      if (exitedAt !== null) return;
      aborted = true;
      startLadder();
    };

    function writeRaw(chunk) {
      if (rawBytes + chunk.length > RAW_STREAM_MAX_BYTES) {
        rawDropped += chunk.length;
        return;
      }
      try {
        fs.writeSync(rawFd, chunk);
        rawBytes += chunk.length;
      } catch {
        rawDropped += chunk.length;
      }
    }

    async function finalize() {
      if (settled) return;
      settled = true;
      clearTimers();
      if (safety) clearTimeout(safety);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (reapPromise) await reapPromise;
      const stats = accumulator.end();
      if (stderrBytes > 0) {
        writeRaw(Buffer.from(`${JSON.stringify({ type: '_bench_stderr_tail', bytes: stderrBytes, tail: stderrTail.toString('utf8') })}\n`));
      }
      try { fs.closeSync(rawFd); } catch { /* already closed */ }
      resolve({
        t0, initAt, t1, exitedAt, exitCode, signal: exitSignal, timedOut, aborted, spawnError, events,
        streamStats: { ...stats, rawBytes, rawDropped, stderrBytes },
      });
    }

    t0 = Date.now();
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: [stdinText === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        shell: false,
        detached: true,
      });
    } catch {
      spawnError = 'spawn_failed';
      exitedAt = Date.now();
      finalize();
      return;
    }

    // 'error' without a pid means the spawn itself failed (for example ENOENT).
    child.once('error', () => {
      if (Number.isInteger(child.pid)) return;
      spawnError = 'spawn_failed';
      exitedAt = exitedAt || Date.now();
      finalize();
    });
    child.stdout.on('data', (chunk) => {
      if (settled) return;
      writeRaw(chunk);
      accumulator.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (settled) return;
      stderrBytes += chunk.length;
      stderrTail = Buffer.concat([stderrTail, chunk]);
      if (stderrTail.length > STDERR_TAIL_BYTES) stderrTail = stderrTail.subarray(stderrTail.length - STDERR_TAIL_BYTES);
    });
    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(stdinText);
    }
    child.once('exit', (code, sig) => {
      exitedAt = Date.now();
      exitCode = code;
      exitSignal = sig;
      clearTimers();
      reapPromise = reapGroup();
    });
    child.once('close', () => {
      finalize();
    });

    timers.push(setTimeout(() => {
      if (exitedAt !== null) return;
      timedOut = true;
      startLadder();
    }, budgetMs));
    // Absolute bound: the ladder always ends in SIGKILL, so this only guards
    // against a platform that never reports the exit.
    safety = setTimeout(() => {
      if (!settled) {
        signalGroup('SIGKILL');
        exitedAt = exitedAt || Date.now();
        finalize();
      }
    }, budgetMs + sigintGraceMs + sigtermGraceMs + SAFETY_SLACK_MS);
    safety.unref();
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Runs one benchmark task through headless Claude Code. The command, argv
 * prefix and grace times are injectable for the fake-based tests; the runner
 * uses the defaults. Resolves { t0, initAt, t1, exitedAt, exitCode, signal,
 * timedOut, aborted, spawnError, summary, envKeyNames, envKeyNamesSha256,
 * streamStats }.
 */
export async function runClaudeTask({
  repoRoot = REPO_ROOT, instruction, model, budgetMs, rawStreamPath, toolSearch = 'unset',
  command = 'claude', commandArgsPrefix = [], sigintGraceMs = 10000, sigtermGraceMs = 5000,
  providerKeyNames = null, signal = null,
} = {}) {
  if (typeof instruction !== 'string' || !instruction.trim()) throw new TypeError('instruction must be a non-empty string');
  const keyNames = Array.isArray(providerKeyNames) ? providerKeyNames : await loadProviderKeyNames(repoRoot);
  const childEnv = buildBenchChildEnv(process.env, { toolSearch, providerKeyNames: keyNames });
  const agentsJson = serializeFsbAgents(readFsbAgentPolicy(repoRoot));
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bench-claude-'));
  try {
    const mcpConfigPath = path.join(workdir, 'mcp.json');
    fs.writeFileSync(mcpConfigPath, JSON.stringify({
      mcpServers: {
        fsb: { type: 'stdio', command: process.execPath, args: [path.join(repoRoot, 'mcp', 'build', 'index.js')] },
      },
    }), { mode: 0o600 });
    const argv = buildClaudeArgv({ mcpConfigPath, agentsJson, model });
    const run = await runHostCli({
      command,
      args: [...commandArgsPrefix, ...argv],
      cwd: workdir,
      env: childEnv.env,
      stdinText: instruction,
      budgetMs,
      rawStreamPath,
      sigintGraceMs,
      sigtermGraceMs,
      signal,
    });
    const { events, ...rest } = run;
    return {
      ...rest,
      summary: summarizeClaudeStream(events, { toolSearchEnv: toolSearch }),
      envKeyNames: childEnv.keyNames,
      envKeyNamesSha256: childEnv.keyNamesSha256,
    };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}
