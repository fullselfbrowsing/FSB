/**
 * Phase 66 benchmark runner MCP client (D-13, D-14, D-18, Pitfall 7,
 * B-TIMEOUT).
 *
 * The runner drives FSB through its own SDK stdio client: it spawns
 * `node <repo>/mcp/build/index.js`, which becomes the hub on 7225, and uses
 * the MCP SDK 1.29.0 from mcp/node_modules. Nothing under mcp/ is edited
 * (D-01); the SDK is resolved lazily, inside openRunnerClient, so importing
 * this module (tests, --dry-run) never needs mcp/node_modules.
 *
 * run_task gets the progress-reset timeout options (the SDK default is 60 s)
 * plus its own budget timer: SDK 1.29 checks maxTotalTimeout only when a
 * progress event arrives, and the extension's heartbeat ticks every 30 s.
 *
 * On a timeout the client limit (300-360 s task budgets) fires before the
 * server's 600 s safety net, so run_task returns nothing and stop_task
 * returns only {success, message}. The session id therefore comes from
 * get_task_status, called BEFORE stop_task (it is read-only and bypasses the
 * server's task queue), with a list_sessions fallback that covers the save
 * stop_task triggers.
 *
 * Error text from run_task is kept in memory for infra classification and
 * never logged or stored by this module.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toolsListDigest } from './identity.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

export const RUN_TASK_REQUEST_TIMEOUT_MS = 60000;
export const REQUEST_TIMEOUT_CODE = -32001;
const SDK_PACKAGE_NAME = '@modelcontextprotocol/sdk';
const CLIENT_INFO = Object.freeze({ name: 'fsb-bench', version: '1' });
const MAX_TOOL_PAGES = 50;
const MAX_ERROR_TEXT = 16384;
const LIST_SESSIONS_LIMIT = 50;
const SHORT_TOOL_TIMEOUT_MS = 15000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function boundedText(value) {
  return typeof value === 'string' && value ? value.slice(0, MAX_ERROR_TEXT) : null;
}

// The SDK's exports map sends '<pkg>/package.json' to dist/cjs/package.json,
// which has no version, so the version is read from the real package root.
function sdkPackageVersion(entryFile) {
  let dir = path.dirname(entryFile);
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (pkg && pkg.name === SDK_PACKAGE_NAME && typeof pkg.version === 'string') return pkg.version;
    } catch {
      // keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Resolves the MCP SDK client classes and version from <repoRoot>/mcp/node_modules. */
export function resolveSdk(repoRoot = REPO_ROOT) {
  const mcpRequire = createRequire(path.join(repoRoot, 'mcp', 'package.json'));
  const clientEntry = mcpRequire.resolve(`${SDK_PACKAGE_NAME}/client/index.js`);
  const { Client } = mcpRequire(clientEntry);
  const { StdioClientTransport } = mcpRequire(`${SDK_PACKAGE_NAME}/client/stdio.js`);
  return { Client, StdioClientTransport, sdkVersion: sdkPackageVersion(clientEntry) };
}

/**
 * Spawns the worktree MCP server over stdio and connects the runner's client.
 * The server's stderr is drained into stderrLogPath (under the gitignored
 * .local tree) or discarded, so a full pipe can never stall the server.
 * Returns { client, transport, sdkVersion, close() }.
 */
export async function openRunnerClient({ repoRoot = REPO_ROOT, stderrLogPath = null } = {}) {
  const { Client, StdioClientTransport, sdkVersion } = resolveSdk(repoRoot);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, 'mcp', 'build', 'index.js')],
    stderr: 'pipe',
  });
  const stderr = transport.stderr;
  let sink = null;
  if (stderr) {
    if (stderrLogPath) {
      fs.mkdirSync(path.dirname(stderrLogPath), { recursive: true });
      sink = fs.createWriteStream(stderrLogPath, { flags: 'a', mode: 0o600 });
      sink.on('error', () => {});
      stderr.pipe(sink);
    } else {
      stderr.resume();
    }
  }
  const client = new Client({ ...CLIENT_INFO });
  try {
    await client.connect(transport);
  } catch (error) {
    try { await transport.close(); } catch { /* already closed */ }
    if (sink) sink.end();
    throw new Error('runner MCP server did not start; is mcp/build built (npm --prefix mcp run build)?');
  }
  let closing = null;
  return {
    client,
    transport,
    sdkVersion,
    close() {
      if (!closing) {
        closing = (async () => {
          try { await client.close(); } catch { /* best effort */ }
          if (sink) await new Promise((resolve) => sink.end(resolve));
        })();
      }
      return closing;
    },
  };
}

function boundedName(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : null;
}

/**
 * { serverVersion: {name, version}, sdkVersion, serverPid, toolsList: {count, sha256} }.
 * tools/list is read across every page before it is digested.
 */
export async function collectServerIdentity(client, transport, sdkVersion) {
  const tools = [];
  let cursor;
  for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
    const result = await client.listTools(cursor ? { cursor } : undefined);
    if (result && Array.isArray(result.tools)) tools.push(...result.tools);
    cursor = result && typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
    if (!cursor) break;
  }
  const version = typeof client.getServerVersion === 'function' ? client.getServerVersion() : null;
  return {
    serverVersion: isPlainObject(version)
      ? { name: boundedName(version.name), version: boundedName(version.version) }
      : { name: null, version: null },
    sdkVersion: typeof sdkVersion === 'string' ? sdkVersion : null,
    serverPid: transport && Number.isInteger(transport.pid) ? transport.pid : null,
    toolsList: toolsListDigest(tools),
  };
}

/** { ok: true, payload } or { ok: false, reason } for the fsb://config resource. */
export async function readFsbConfig(client) {
  let result;
  try {
    result = await client.readResource({ uri: 'fsb://config' });
  } catch {
    return { ok: false, reason: 'read_failed' };
  }
  const text = result && Array.isArray(result.contents) && result.contents[0] ? result.contents[0].text : undefined;
  if (typeof text !== 'string') return { ok: false, reason: 'no_text' };
  const payload = tryParseJson(text);
  if (!isPlainObject(payload)) return { ok: false, reason: 'not_json' };
  return { ok: true, payload };
}

/**
 * Calls a tool and returns { isError, json, text }: json is content[0].text
 * parsed when it is JSON, else null. Rejections (timeouts, transport loss)
 * propagate to the caller.
 */
export async function callToolJson(client, name, args, opts) {
  const result = await client.callTool({ name, arguments: args || {} }, undefined, opts);
  const first = result && Array.isArray(result.content) ? result.content[0] : null;
  const text = first && typeof first.text === 'string' ? first.text : null;
  return { isError: !!(result && result.isError === true), json: tryParseJson(text), text };
}

/**
 * Opens the autopilot start tab outside the timed window (Pitfall 7). The tab
 * is foregrounded (active: true) so background-tab timer throttling cannot
 * slow the run; identity records startTabActive: true.
 */
export function openTab(client, url) {
  return callToolJson(client, 'open_tab', { url, active: true }, { timeout: 30000 });
}

/** list_sessions index entries (id, startTime, mode, mcpClient, ...), or [] on failure. */
export async function listSessions(client, limit = LIST_SESSIONS_LIMIT) {
  const result = await callToolJson(client, 'list_sessions', { limit }, { timeout: SHORT_TOOL_TIMEOUT_MS });
  if (result.isError || !isPlainObject(result.json) || !Array.isArray(result.json.sessions)) return [];
  return result.json.sessions;
}

export function isRequestTimeoutError(error) {
  if (!error) return false;
  if (error.code === REQUEST_TIMEOUT_CODE) return true;
  return /request timed out|maximum total timeout exceeded/i.test(String(error.message || ''));
}

// Error text for classification (memory only): the isError text, or the
// error/message fields of a completed run_task JSON.
function runTaskErrorText(result) {
  if (result.isError) return boundedText(result.text);
  if (!isPlainObject(result.json)) return null;
  const parts = [result.json.error, result.json.message].filter((part) => typeof part === 'string' && part);
  return parts.length ? boundedText(parts.join('\n')) : null;
}

async function findAutopilotSessionInWindow(client, t0, t1, { listAttempts, delayMs }) {
  for (let attempt = 0; attempt < listAttempts; attempt += 1) {
    if (attempt > 0 && delayMs > 0) await sleep(delayMs);
    let sessions;
    try {
      sessions = await listSessions(client, LIST_SESSIONS_LIMIT);
    } catch {
      continue;
    }
    const match = sessions
      .filter((entry) => isPlainObject(entry) && typeof entry.id === 'string' && entry.id
        && entry.mode !== 'mcp-agent' && Number.isFinite(entry.startTime)
        && entry.startTime >= t0 && entry.startTime <= t1)
      .sort((a, b) => b.startTime - a.startTime)[0];
    if (match) return match.id;
  }
  return null;
}

/**
 * Runs one autopilot task on the runner's clock: t0 immediately before the
 * run_task call, t1 when it settles. Returns
 * { t0, t1, timedOut, aborted, isError, json, errorText, sessionId, sessionIdSource }.
 * options.signal aborts the call (runner SIGINT/SIGTERM); an aborted or
 * timed-out call runs get_task_status, then stop_task exactly once, then the
 * list_sessions fallback when no id is known yet.
 */
export async function runTaskTimed(client, instruction, budgetMs, { listAttempts = 5, delayMs = 1000, signal } = {}) {
  const budget = new AbortController();
  const combined = new AbortController();
  const abortCombined = () => combined.abort();
  budget.signal.addEventListener('abort', abortCombined, { once: true });
  if (signal) {
    if (signal.aborted) combined.abort();
    else signal.addEventListener('abort', abortCombined, { once: true });
  }
  const t0 = Date.now();
  const budgetTimer = setTimeout(() => budget.abort(), budgetMs);
  let result = null;
  let failure = null;
  try {
    result = await callToolJson(client, 'run_task', { task: instruction }, {
      onprogress: () => {},
      resetTimeoutOnProgress: true,
      timeout: RUN_TASK_REQUEST_TIMEOUT_MS,
      maxTotalTimeout: budgetMs,
      signal: combined.signal,
    });
  } catch (error) {
    failure = error || new Error('run_task failed');
  } finally {
    clearTimeout(budgetTimer);
    if (signal) signal.removeEventListener('abort', abortCombined);
  }
  const t1 = Date.now();
  if (!failure) {
    const sessionId = isPlainObject(result.json) && typeof result.json.sessionId === 'string' && result.json.sessionId
      ? result.json.sessionId
      : null;
    return {
      t0, t1, timedOut: false, aborted: false, isError: result.isError, json: result.json,
      errorText: runTaskErrorText(result), sessionId, sessionIdSource: sessionId ? 'run_task' : null,
    };
  }

  const aborted = !!(signal && signal.aborted);
  const timedOut = !aborted && (budget.signal.aborted || isRequestTimeoutError(failure));
  // B-TIMEOUT: the read-only status call first; a failure never skips stop_task.
  let sessionId = null;
  let sessionIdSource = null;
  try {
    const status = await callToolJson(client, 'get_task_status', {}, { timeout: SHORT_TOOL_TIMEOUT_MS });
    if (!status.isError && isPlainObject(status.json) && typeof status.json.currentSessionId === 'string'
      && status.json.currentSessionId) {
      sessionId = status.json.currentSessionId;
      sessionIdSource = 'get_task_status';
    }
  } catch {
    // fall through to stop_task
  }
  try {
    await callToolJson(client, 'stop_task', {}, { timeout: SHORT_TOOL_TIMEOUT_MS });
  } catch {
    // best effort; the session lookup below still runs
  }
  if (!sessionId) {
    sessionId = await findAutopilotSessionInWindow(client, t0, t1, { listAttempts, delayMs });
    if (sessionId) sessionIdSource = 'list_sessions';
  }
  return {
    t0, t1, timedOut, aborted, isError: null, json: null,
    errorText: timedOut || aborted ? null : boundedText(String(failure.message || '')),
    sessionId, sessionIdSource,
  };
}

/**
 * get_session_detail with a short retry for the asynchronous session save.
 * Returns the first detail for which until(detail) passes; when it never
 * passes, the last successfully fetched detail (so a present detail with
 * measurement.recorded false still reaches the classifier); null only when
 * sessionId is null or every fetch failed.
 */
export async function getSessionDetailWithRetry(client, sessionId, { attempts = 10, delayMs = 1000, until = null } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0 && delayMs > 0) await sleep(delayMs);
    let result;
    try {
      result = await callToolJson(client, 'get_session_detail', { sessionId }, { timeout: SHORT_TOOL_TIMEOUT_MS });
    } catch {
      continue;
    }
    if (result.isError || !isPlainObject(result.json) || result.json.success === false
      || !isPlainObject(result.json.session)) {
      continue;
    }
    last = result.json;
    if (typeof until !== 'function' || until(last)) return last;
  }
  return last;
}
