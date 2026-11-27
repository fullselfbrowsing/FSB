// Phase 66 benchmark drivers (D-06, D-12, D-14, D-17, B-TIMEOUT, B2, B3, W7,
// W10, W-B, I-1): the runner's MCP client helpers, the CDP evidence and
// pairing client, and the Claude Code and Cursor host drivers.
//
// Fakes only: no real claude or cursor-agent, no Chrome, no MCP server and
// nothing on port 7225. The CDP endpoint is a loopback stub built on the ws
// package from mcp/node_modules (Node 20 has no global WebSocket); the host
// CLIs are small CommonJS scripts written to a temp dir at test time.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256Hex } from '../scripts/bench/lib/identity.mjs';
import {
  BENCH_ENV_ALLOWLIST,
  buildBenchChildEnv,
  claudeVersion,
  loadProviderKeyNames,
  runClaudeTask,
} from '../scripts/bench/lib/claude-arm.mjs';
import { cursorVersion, runCursorTask } from '../scripts/bench/lib/cursor-arm.mjs';
import {
  browserVersion,
  closeTargets,
  collectCoreEvidence,
  collectLiveEvidence,
  evaluate,
  listPageTargets,
  pairExtensionViaCdp,
  readDevToolsPort,
  readExtensionStorageFlag,
} from '../scripts/bench/lib/cdp.mjs';
import {
  callToolJson,
  collectServerIdentity,
  getSessionDetailWithRetry,
  listSessions,
  openTab,
  readFsbConfig,
  runTaskTimed,
} from '../scripts/bench/lib/mcp-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcpRequire = createRequire(path.join(ROOT, 'mcp', 'package.json'));
const { WebSocketServer } = mcpRequire('ws');

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const PAIRING_CODE = `fsb-auth.PAIRCODE_SENTINEL_${'q'.repeat(25)}`;
const MODEL = 'claude-model-fixture';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `fsb-bench-drivers-${label}-`));
}

function jsonContent(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function processGone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === 'ESRCH';
  }
}

// --- B3: environment allowlist -------------------------------------------------

test('buildBenchChildEnv copies only the allowlist and drops CLAUDE_* and every provider key', async () => {
  const providerKeyNames = await loadProviderKeyNames(ROOT);
  assert.ok(Array.isArray(providerKeyNames) && providerKeyNames.length > 50, 'DELEGATION_PROVIDER_KEY_NAMES loaded from mcp/build');
  const parent = {
    HOME: '/home/bench',
    PATH: '/usr/bin:/bin',
    USER: 'bench',
    LOGNAME: 'bench',
    SHELL: '/bin/zsh',
    TMPDIR: '/tmp/bench',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    LC_CTYPE: 'UTF-8',
    HTTP_PROXY: 'proxy-upper-value',
    https_proxy: 'proxy-lower-value',
    NO_PROXY: 'localhost',
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_CONFIG_DIR: '/secret/claude-config',
    ANTHROPIC_API_KEY: 'ANTHROPIC_VALUE_SENTINEL',
    XAI_API_KEY: 'XAI_VALUE_SENTINEL',
    OPENAI_API_KEY: 'OPENAI_VALUE_SENTINEL',
    NODE_OPTIONS: '--inspect',
    RANDOM_VAR: 'random',
    ENABLE_TOOL_SEARCH: 'true',
  };
  for (const name of providerKeyNames) parent[name] = `PROVIDER_VALUE_${name}`;

  const expected = ['HOME', 'HTTP_PROXY', 'LANG', 'LC_ALL', 'LC_CTYPE', 'LOGNAME', 'NO_PROXY', 'PATH', 'SHELL', 'TMPDIR', 'USER', 'https_proxy'];
  const unset = buildBenchChildEnv(parent, { toolSearch: 'unset', providerKeyNames });
  assert.deepEqual(Object.keys(unset.env).sort(), expected);
  for (const name of expected) assert.equal(unset.env[name], parent[name]);
  for (const name of providerKeyNames) assert.equal(Object.hasOwn(unset.env, name), false, `${name} must not survive`);
  assert.equal(Object.hasOwn(unset.env, 'ENABLE_TOOL_SEARCH'), false, "'unset' never forwards the parent's ENABLE_TOOL_SEARCH");
  assert.deepEqual(unset.keyNames, expected);
  assert.equal(unset.keyNamesSha256, sha256Hex(expected.join('\n')));

  // Metadata carries names and a digest only, never a value.
  const metadata = JSON.stringify({ keyNames: unset.keyNames, keyNamesSha256: unset.keyNamesSha256 });
  for (const valueText of ['/home/bench', '/usr/bin:/bin', 'en_US.UTF-8', 'proxy-upper-value', 'proxy-lower-value',
    '/secret/claude-config', 'ANTHROPIC_VALUE_SENTINEL', 'XAI_VALUE_SENTINEL', 'OPENAI_VALUE_SENTINEL', 'PROVIDER_VALUE_']) {
    assert.equal(metadata.includes(valueText), false, `no env value in the metadata (${valueText})`);
  }

  const withSearch = buildBenchChildEnv(parent, { toolSearch: 'true', providerKeyNames });
  assert.equal(withSearch.env.ENABLE_TOOL_SEARCH, 'true');
  assert.deepEqual(withSearch.keyNames, [...expected, 'ENABLE_TOOL_SEARCH'].sort());
  assert.equal(buildBenchChildEnv(parent, { toolSearch: 'auto', providerKeyNames }).env.ENABLE_TOOL_SEARCH, 'auto');
  assert.equal(buildBenchChildEnv(parent, { toolSearch: 'false', providerKeyNames }).env.ENABLE_TOOL_SEARCH, 'false');
  assert.throws(() => buildBenchChildEnv(parent, { toolSearch: 'yes', providerKeyNames }), /toolSearch/);

  assert.ok(BENCH_ENV_ALLOWLIST.includes('HOME') && !BENCH_ENV_ALLOWLIST.includes('NODE_OPTIONS'));
});

test('buildBenchChildEnv refuses an allowlisted name that is also a forbidden name (defense in depth)', () => {
  const parent = { HOME: '/h', HTTP_PROXY: 'PROXY_VALUE_SENTINEL' };
  assert.throws(
    () => buildBenchChildEnv(parent, { toolSearch: 'unset', providerKeyNames: ['HTTP_PROXY'] }),
    (error) => /forbidden/.test(error.message) && !error.message.includes('PROXY_VALUE_SENTINEL'),
  );
});

test('loadProviderKeyNames explains how to build mcp when the build is missing', async () => {
  const emptyRoot = tempDir('no-build');
  try {
    await assert.rejects(loadProviderKeyNames(emptyRoot), /npm --prefix mcp run build/);
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }
});

// --- Host CLI fakes --------------------------------------------------------------

const FAKE_CLAUDE = String.raw`'use strict';
const logPath = process.argv[2];
const mode = process.argv[3];
const extra = process.argv[4];
const fs = require('fs');
const path = require('path');
const log = (line) => fs.appendFileSync(logPath, line + '\n');
const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n');
const INIT = { type: 'system', subtype: 'init', session_id: 'fake-1', model: 'claude-model-fixture',
  tools: ['mcp__fsb__open_tab', 'mcp__fsb__click', 'WaitForMcpServers'], mcp_servers: [{ name: 'fsb', status: 'connected' }],
  permissionMode: 'dontAsk', apiKeySource: 'none', claude_code_version: '2.1.283' };
if (mode === 'hang') {
  process.on('SIGINT', () => log('SIGINT'));
  process.on('SIGTERM', () => { log('SIGTERM'); process.exit(143); });
  const { spawn } = require('child_process');
  const grandchild = spawn(process.execPath, ['-e',
    'process.on("SIGINT",()=>{});process.on("SIGTERM",()=>{});setInterval(()=>{},1000);'], { stdio: 'ignore' });
  fs.writeFileSync(extra, String(grandchild.pid));
  emit(INIT);
  setInterval(() => {}, 1000);
} else if (mode === 'version') {
  process.stdout.write('2.1.283 (Claude Code)\n');
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    log(JSON.stringify({
      stdin: input,
      cwd: process.cwd(),
      cwdEntries: fs.readdirSync(process.cwd()).sort(),
      mcpConfig: JSON.parse(fs.readFileSync(path.join(process.cwd(), 'mcp.json'), 'utf8')),
      argv: process.argv.slice(5),
      envKeys: Object.keys(process.env).sort(),
    }));
    emit(INIT);
    emit({ type: 'assistant', message: { id: 'm1', content: [
      { type: 'tool_use', id: 'tu-1', name: 'mcp__fsb__open_tab', input: { url: 'x' } },
      { type: 'tool_use', id: 'tu-2', name: 'mcp__fsb__click', input: { selector: 'y' } },
    ] } });
    process.stderr.write('fake claude diagnostics\n');
    emit({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1200, duration_api_ms: 700, num_turns: 3,
      usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 }, total_cost_usd: 0.01, result: 'done' });
    process.exit(0);
  });
}
`;

const FAKE_CURSOR = String.raw`'use strict';
const fs = require('fs');
const path = require('path');
const logPath = process.argv[2];
if (process.argv[3] === '--version') { process.stdout.write('2026.09.08-6caf4ff\n'); process.exit(0); }
const argv = process.argv.slice(3);
fs.appendFileSync(logPath, JSON.stringify({
  argv,
  cwd: process.cwd(),
  mcpConfig: JSON.parse(fs.readFileSync(path.join(process.cwd(), '.cursor', 'mcp.json'), 'utf8')),
  envKeys: Object.keys(process.env).sort(),
}) + '\n');
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init', model: 'cursor-model', apiKeySource: 'login', permissionMode: 'default' }) + '\n');
process.stdout.write(JSON.stringify({ type: 'tool_call', subtype: 'started' }) + '\n');
process.stdout.write(JSON.stringify({ type: 'tool_call', subtype: 'completed' }) + '\n');
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, duration_ms: 900, duration_api_ms: 400, result: 'ok' }) + '\n');
`;

function writeFake(dir, name, source) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, source);
  return file;
}

test('runClaudeTask: SIGINT then SIGTERM on budget expiry, and the whole process group is killed (W7, W10)', async () => {
  const dir = tempDir('ladder');
  let grandchildPid = null;
  try {
    const fake = writeFake(dir, 'fake-claude.cjs', FAKE_CLAUDE);
    const logPath = path.join(dir, 'signals.log');
    const pidPath = path.join(dir, 'grandchild.pid');
    const rawStreamPath = path.join(dir, 'stream.jsonl');
    const result = await runClaudeTask({
      repoRoot: ROOT,
      instruction: 'Open the page and do nothing useful.',
      model: MODEL,
      budgetMs: 200,
      rawStreamPath,
      command: process.execPath,
      commandArgsPrefix: [fake, logPath, 'hang', pidPath],
      sigintGraceMs: 200,
      sigtermGraceMs: 200,
    });
    grandchildPid = Number(fs.readFileSync(pidPath, 'utf8'));
    assert.equal(result.timedOut, true);
    assert.equal(result.aborted, false);
    assert.equal(typeof result.initAt, 'number');
    assert.equal(result.t1, null, 'no result event was emitted');
    assert.equal(result.summary.result.present, false);
    const signals = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    assert.deepEqual(signals, ['SIGINT', 'SIGTERM'], 'SIGINT first, then SIGTERM after the grace');
    assert.ok(Number.isInteger(grandchildPid) && grandchildPid > 0);
    assert.equal(processGone(grandchildPid), true, 'the grandchild died with its process group');
  } finally {
    if (grandchildPid && !processGone(grandchildPid)) {
      try { process.kill(grandchildPid, 'SIGKILL'); } catch { /* already gone */ }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runClaudeTask: a normal run records init and result times, tees the stream, and removes its workdir', async () => {
  const dir = tempDir('normal');
  try {
    const fake = writeFake(dir, 'fake-claude.cjs', FAKE_CLAUDE);
    const logPath = path.join(dir, 'run.log');
    const rawStreamPath = path.join(dir, 'stream.jsonl');
    const instruction = 'Open http://127.0.0.1:9/r/tok/fixtures/x/index.html and press Save.';
    const result = await runClaudeTask({
      repoRoot: ROOT,
      instruction,
      model: MODEL,
      budgetMs: 20000,
      rawStreamPath,
      toolSearch: 'unset',
      command: process.execPath,
      commandArgsPrefix: [fake, logPath, 'normal', '-'],
    });
    assert.equal(result.timedOut, false);
    assert.equal(result.exitCode, 0);
    assert.ok(result.initAt >= result.t0 && result.t1 >= result.initAt, 't0 <= initAt <= t1');
    assert.equal(result.summary.result.present, true);
    assert.equal(result.summary.toolUses.fsb, 2);
    assert.equal(result.summary.init.toolLoading, 'eager');
    assert.equal(result.summary.init.toolSearchEnv, 'unset');
    assert.equal(result.summary.result.costLabel, 'list-price estimate, not billed');

    const seen = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    assert.equal(seen.stdin, instruction, 'the task goes on stdin');
    assert.equal(seen.argv.includes(instruction), false, 'the task is never in argv');
    assert.deepEqual(seen.argv.slice(-2), ['--model', MODEL]);
    assert.ok(seen.argv.includes('--strict-mcp-config') && seen.argv.includes('--mcp-config'));
    assert.deepEqual(seen.cwdEntries, ['mcp.json'], 'the workdir holds only mcp.json');
    assert.deepEqual(seen.mcpConfig, {
      mcpServers: { fsb: { type: 'stdio', command: process.execPath, args: [path.join(ROOT, 'mcp', 'build', 'index.js')] } },
    });
    assert.equal(fs.existsSync(seen.cwd), false, 'the temp workdir was removed');
    for (const key of seen.envKeys) {
      assert.ok(BENCH_ENV_ALLOWLIST.includes(key) || key.startsWith('LC_') || key === '__CF_USER_TEXT_ENCODING',
        `unexpected child env key ${key}`);
      assert.equal(key === 'CLAUDECODE' || key.startsWith('CLAUDE_'), false);
    }
    assert.deepEqual(result.envKeyNames, [...result.envKeyNames].sort());
    assert.equal(result.envKeyNamesSha256, sha256Hex(result.envKeyNames.join('\n')));

    const raw = fs.readFileSync(rawStreamPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(raw.slice(0, 3).map((event) => event.type), ['system', 'assistant', 'result']);
    const tail = raw.find((event) => event.type === '_bench_stderr_tail');
    assert.ok(tail && tail.tail.includes('fake claude diagnostics'), 'the stderr tail stays in the raw file only');
    assert.equal(JSON.stringify(result).includes('fake claude diagnostics'), false, 'stderr never reaches the result');
    assert.equal((fs.statSync(rawStreamPath).mode & 0o777).toString(8), '600');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runClaudeTask: an abort signal starts the same ladder and marks the run aborted', async () => {
  const dir = tempDir('abort');
  let grandchildPid = null;
  try {
    const fake = writeFake(dir, 'fake-claude.cjs', FAKE_CLAUDE);
    const logPath = path.join(dir, 'signals.log');
    const pidPath = path.join(dir, 'grandchild.pid');
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 250);
    const result = await runClaudeTask({
      repoRoot: ROOT,
      instruction: 'Open the page and wait.',
      model: MODEL,
      budgetMs: 60000,
      rawStreamPath: path.join(dir, 'stream.jsonl'),
      command: process.execPath,
      commandArgsPrefix: [fake, logPath, 'hang', pidPath],
      sigintGraceMs: 150,
      sigtermGraceMs: 150,
      signal: controller.signal,
    });
    grandchildPid = Number(fs.readFileSync(pidPath, 'utf8'));
    assert.equal(result.aborted, true);
    assert.equal(result.timedOut, false);
    assert.equal(processGone(grandchildPid), true);
  } finally {
    if (grandchildPid && !processGone(grandchildPid)) {
      try { process.kill(grandchildPid, 'SIGKILL'); } catch { /* already gone */ }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runClaudeTask reports a missing host binary as a spawn error, not a hang', async () => {
  const dir = tempDir('enoent');
  try {
    const result = await runClaudeTask({
      repoRoot: ROOT,
      instruction: 'Open the page.',
      model: MODEL,
      budgetMs: 5000,
      rawStreamPath: path.join(dir, 'stream.jsonl'),
      command: path.join(dir, 'no-such-claude'),
    });
    assert.equal(result.spawnError, 'spawn_failed');
    assert.equal(result.summary.init.present, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('claudeVersion and cursorVersion read a bounded version line with the allowlisted env', () => {
  const dir = tempDir('version');
  try {
    const fake = writeFake(dir, 'fake-claude.cjs', FAKE_CLAUDE);
    const fakeCursor = writeFake(dir, 'fake-cursor.cjs', FAKE_CURSOR);
    assert.equal(claudeVersion({ command: process.execPath, commandArgsPrefix: [fake, path.join(dir, 'v.log'), 'version', '-'] }), '2.1.283 (Claude Code)');
    assert.equal(cursorVersion({ command: process.execPath, commandArgsPrefix: [fakeCursor, path.join(dir, 'c.log')] }), '2026.09.08-6caf4ff');
    assert.equal(claudeVersion({ command: path.join(dir, 'missing') }), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runCursorTask: instruction as the last argument, .cursor/mcp.json in an empty workdir, durations only', async () => {
  const dir = tempDir('cursor');
  try {
    const fake = writeFake(dir, 'fake-cursor.cjs', FAKE_CURSOR);
    const logPath = path.join(dir, 'cursor.log');
    const instruction = 'Open the fixture page and press Save.';
    const result = await runCursorTask({
      repoRoot: ROOT,
      instruction,
      model: 'cursor-model',
      budgetMs: 20000,
      rawStreamPath: path.join(dir, 'cursor.jsonl'),
      command: process.execPath,
      commandArgsPrefix: [fake, logPath],
    });
    const seen = JSON.parse(fs.readFileSync(logPath, 'utf8').trim());
    assert.equal(seen.argv[seen.argv.length - 1], instruction);
    assert.deepEqual(seen.argv.slice(0, -1), ['-p', '--output-format', 'stream-json', '--model', 'cursor-model']);
    assert.equal(seen.argv.some((arg) => /yolo|dangerously|--force|--auto\b/.test(arg)), false);
    assert.deepEqual(seen.mcpConfig, { mcpServers: { fsb: { command: process.execPath, args: [path.join(ROOT, 'mcp', 'build', 'index.js')] } } });
    assert.equal(fs.existsSync(seen.cwd), false);
    assert.equal(seen.envKeys.some((key) => key === 'CLAUDECODE' || key.startsWith('CLAUDE_')), false);
    assert.equal(result.timedOut, false);
    assert.equal(result.summary.host, 'cursor-agent');
    assert.equal(result.summary.result.durationMs, 900);
    assert.equal(result.summary.tokens, null);
    assert.equal(result.summary.costUsd, null);
    assert.equal(result.summary.label, 'unavailable (host does not report)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- MCP client helpers (fake client; never a real server) -------------------------

function timeoutError() {
  return Object.assign(new Error('MCP error -32001: Request timed out'), { code: -32001 });
}

function fakeClient(handlers) {
  const calls = [];
  const options = {};
  return {
    calls,
    options,
    async callTool(params, schema, opts) {
      calls.push(params.name);
      options[params.name] = opts;
      const handler = handlers[params.name];
      if (!handler) throw new Error(`unexpected tool ${params.name}`);
      return handler(params.arguments, opts);
    },
  };
}

test('runTaskTimed: a completed run returns its session id and passes the progress-reset timeout options (Pitfall 7)', async () => {
  const client = fakeClient({
    run_task: async () => jsonContent({ success: true, sessionId: 'session_ok', status: 'completed' }),
  });
  const result = await runTaskTimed(client, 'Open the page.', 300000);
  assert.deepEqual(client.calls, ['run_task']);
  assert.equal(result.timedOut, false);
  assert.equal(result.sessionId, 'session_ok');
  assert.ok(result.t1 >= result.t0);
  const opts = client.options.run_task;
  assert.equal(typeof opts.onprogress, 'function');
  assert.equal(opts.resetTimeoutOnProgress, true);
  assert.equal(opts.timeout, 60000);
  assert.equal(opts.maxTotalTimeout, 300000);
});

test('runTaskTimed keeps a completed run\'s error text in memory for classification', async () => {
  const client = fakeClient({
    run_task: async () => jsonContent({ success: true, sessionId: 's2', status: 'error', error: 'API call failed: Failed to fetch' }),
  });
  const result = await runTaskTimed(client, 'Open the page.', 300000);
  assert.equal(result.errorText, 'API call failed: Failed to fetch');
  assert.equal(result.sessionId, 's2');
  const failing = fakeClient({
    run_task: async () => ({ isError: true, content: [{ type: 'text', text: 'Detected: agent cap\n\nRaw error: AGENT_CAP_REACHED' }] }),
    get_task_status: async () => jsonContent({ success: true, currentSessionId: null }),
    stop_task: async () => jsonContent({ success: false }),
    list_sessions: async () => jsonContent({ success: true, sessions: [] }),
  });
  const failed = await runTaskTimed(failing, 'Open the page.', 300000, { listAttempts: 1, delayMs: 0 });
  assert.match(failed.errorText, /AGENT_CAP_REACHED/);
  assert.equal(failed.timedOut, false);
});

test('runTaskTimed on timeout: get_task_status before a single stop_task, and the status session id wins (B-TIMEOUT)', async () => {
  const client = fakeClient({
    run_task: async () => { await delay(20); throw timeoutError(); },
    get_task_status: async () => jsonContent({ success: true, status: 'ready', currentSessionId: 'session_live_1' }),
    stop_task: async () => jsonContent({ success: true, message: 'stopped' }),
    list_sessions: async () => { throw new Error('list_sessions must not be needed'); },
  });
  const result = await runTaskTimed(client, 'Open the page.', 1000, { listAttempts: 2, delayMs: 0 });
  assert.deepEqual(client.calls, ['run_task', 'get_task_status', 'stop_task']);
  assert.equal(result.timedOut, true);
  assert.equal(result.sessionId, 'session_live_1');
  assert.equal(result.errorText, null, 'a timeout carries no error text');
});

for (const variant of ['rejects', 'isError']) {
  test(`runTaskTimed on timeout: stop_task still runs exactly once when get_task_status ${variant}`, async () => {
    const client = fakeClient({
      run_task: async () => { await delay(5); throw timeoutError(); },
      get_task_status: async () => {
        if (variant === 'rejects') throw new Error('status failed');
        return { isError: true, content: [{ type: 'text', text: 'Detected: failure' }] };
      },
      stop_task: async () => jsonContent({ success: true }),
      list_sessions: async () => jsonContent({ success: true, sessions: [] }),
    });
    const result = await runTaskTimed(client, 'Open the page.', 1000, { listAttempts: 2, delayMs: 0 });
    assert.equal(client.calls.filter((name) => name === 'stop_task').length, 1);
    assert.ok(client.calls.indexOf('get_task_status') < client.calls.indexOf('stop_task'));
    assert.equal(result.timedOut, true);
  });
}

test('runTaskTimed on timeout without a status id: list_sessions fallback after stop_task, latest non-MCP session in the window', async () => {
  let runStartedAt = 0;
  let windowEnd = 0;
  const client = fakeClient({
    run_task: async () => { runStartedAt = Date.now(); await delay(60); windowEnd = Date.now(); throw timeoutError(); },
    get_task_status: async () => jsonContent({ success: true, currentSessionId: null }),
    stop_task: async () => jsonContent({ success: true }),
    list_sessions: async () => jsonContent({
      success: true,
      sessions: [
        { id: 'too-early', mode: 'autopilot', startTime: runStartedAt - 60000 },
        { id: 'mcp-in-window', mode: 'mcp-agent', startTime: runStartedAt + 30 },
        { id: 'autopilot-first', mode: 'autopilot', startTime: runStartedAt + 5 },
        { id: 'autopilot-latest', mode: 'autopilot', startTime: runStartedAt + 20 },
        { id: 'too-late', mode: 'autopilot', startTime: windowEnd + 60000 },
      ],
    }),
  });
  const result = await runTaskTimed(client, 'Open the page.', 1000, { listAttempts: 2, delayMs: 0 });
  assert.deepEqual(client.calls, ['run_task', 'get_task_status', 'stop_task', 'list_sessions']);
  assert.equal(result.sessionId, 'autopilot-latest');

  const none = fakeClient({
    run_task: async () => { await delay(5); throw timeoutError(); },
    get_task_status: async () => jsonContent({ success: true }),
    stop_task: async () => jsonContent({ success: true }),
    list_sessions: async () => jsonContent({ success: true, sessions: [{ id: 'mcp', mode: 'mcp-agent', startTime: Date.now() }] }),
  });
  const missing = await runTaskTimed(none, 'Open the page.', 1000, { listAttempts: 2, delayMs: 0 });
  assert.equal(none.calls.filter((name) => name === 'list_sessions').length, 2, 'at most listAttempts calls');
  assert.equal(missing.sessionId, null);
});

test('runTaskTimed enforces the budget itself when no progress event arrives', async () => {
  const client = fakeClient({
    run_task: (_args, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(timeoutError()), { once: true });
    }),
    get_task_status: async () => jsonContent({ success: true, currentSessionId: 'late' }),
    stop_task: async () => jsonContent({ success: true }),
  });
  const started = Date.now();
  const result = await runTaskTimed(client, 'Open the page.', 120, { listAttempts: 1, delayMs: 0 });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 2000, 'the budget timer fired');
  assert.equal(result.sessionId, 'late');
});

test('getSessionDetailWithRetry returns the first detail that passes, else the last fetched one, else null', async () => {
  let n = 0;
  const client = fakeClient({
    get_session_detail: async () => {
      n += 1;
      if (n === 1) throw new Error('not saved yet');
      return jsonContent({ success: true, session: { id: 's', measurement: { kind: 'autopilot', recorded: n >= 3 } } });
    },
  });
  const until = (detail) => detail.session.measurement.recorded === true;
  const found = await getSessionDetailWithRetry(client, 's', { attempts: 5, delayMs: 0, until });
  assert.equal(found.session.measurement.recorded, true);
  assert.equal(n, 3);

  const never = fakeClient({
    get_session_detail: async () => jsonContent({ success: true, session: { id: 's', measurement: { recorded: false } } }),
  });
  const last = await getSessionDetailWithRetry(never, 's', { attempts: 3, delayMs: 0, until });
  assert.equal(last.session.measurement.recorded, false, 'a present detail reaches the classifier');
  assert.equal(never.calls.length, 3);

  const failing = fakeClient({ get_session_detail: async () => ({ isError: true, content: [{ type: 'text', text: 'Detected: not found' }] }) });
  assert.equal(await getSessionDetailWithRetry(failing, 's', { attempts: 2, delayMs: 0, until }), null);
  assert.equal(await getSessionDetailWithRetry(failing, null, { attempts: 2, delayMs: 0 }), null);
});

test('callToolJson, openTab, listSessions, readFsbConfig and collectServerIdentity shapes', async () => {
  const client = fakeClient({
    open_tab: async (args) => jsonContent({ success: true, tabId: 7, echo: args }),
    list_sessions: async (args) => jsonContent({ success: true, sessions: [{ id: 'a', limit: args.limit }] }),
    plain: async () => ({ content: [{ type: 'text', text: 'not json' }] }),
  });
  const opened = await openTab(client, 'http://127.0.0.1:9/r/tok/fixtures/a/index.html');
  assert.deepEqual(opened.json.echo, { url: 'http://127.0.0.1:9/r/tok/fixtures/a/index.html', active: true });
  assert.deepEqual(await listSessions(client, 7), [{ id: 'a', limit: 7 }]);
  assert.deepEqual(await callToolJson(client, 'plain', {}), { isError: false, json: null, text: 'not json' });

  const configClient = {
    async readResource({ uri }) {
      assert.equal(uri, 'fsb://config');
      return { contents: [{ uri, text: JSON.stringify({ success: true, config: { providerKind: 'api' } }) }] };
    },
  };
  assert.deepEqual(await readFsbConfig(configClient), { ok: true, payload: { success: true, config: { providerKind: 'api' } } });
  const offline = { async readResource() { return { contents: [{ text: 'FSB extension not connected' }] }; } };
  assert.equal((await readFsbConfig(offline)).ok, false);
  const broken = { async readResource() { throw new Error('boom'); } };
  assert.equal((await readFsbConfig(broken)).ok, false);

  const identityClient = {
    async listTools(params) {
      if (params && params.cursor === 'page-2') return { tools: [{ name: 'b_tool', description: 'B', inputSchema: { type: 'object' } }] };
      return { tools: [{ name: 'a_tool', description: 'A', inputSchema: { type: 'object' } }], nextCursor: 'page-2' };
    },
    getServerVersion() { return { name: 'fsb-mcp-server', version: '0.11.0' }; },
  };
  const identity = await collectServerIdentity(identityClient, { pid: 4242 }, '1.29.0');
  assert.equal(identity.serverPid, 4242);
  assert.equal(identity.sdkVersion, '1.29.0');
  assert.deepEqual(identity.serverVersion, { name: 'fsb-mcp-server', version: '0.11.0' });
  assert.equal(identity.toolsList.count, 2, 'tools across every page');
  assert.match(identity.toolsList.sha256, /^[0-9a-f]{64}$/);
});

// --- CDP stub ------------------------------------------------------------------

async function startCdpStub({ onEvaluate, onNew } = {}) {
  const state = { targets: [], requests: [], evaluations: [], closed: [], newCalls: [] };
  let port = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    state.requests.push({ method: req.method, path: req.url });
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    if (url.pathname === '/json/list' || url.pathname === '/json') return send(200, state.targets);
    if (url.pathname === '/json/version') {
      return send(200, {
        Browser: 'Chrome/146.0.7680.0',
        'Protocol-Version': '1.3',
        'User-Agent': 'Mozilla/5.0 test',
        webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/abc`,
      });
    }
    if (url.pathname.startsWith('/json/close/')) {
      const id = url.pathname.slice('/json/close/'.length);
      state.closed.push(id);
      state.targets = state.targets.filter((target) => target.id !== id);
      return send(200, 'Target is closing');
    }
    if (url.pathname === '/json/new') {
      if (req.method !== 'PUT') return send(405, { error: 'use PUT' });
      const target = req.url.slice(req.url.indexOf('?') + 1);
      state.newCalls.push(target);
      const created = stub.page(`wake-${state.newCalls.length}`, target);
      if (onNew) onNew(stub, target);
      return send(200, created);
    }
    return send(404, { error: 'not found' });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    const targetId = String(req.url).split('/').pop();
    socket.on('message', async (data) => {
      const message = JSON.parse(String(data));
      state.evaluations.push({ targetId, method: message.method, params: message.params });
      const answer = onEvaluate ? await onEvaluate(targetId, message.params, stub) : { result: { type: 'undefined' } };
      socket.send(JSON.stringify({ id: message.id, result: answer }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  const stub = {
    port,
    state,
    page(id, url) {
      const target = { id, type: 'page', title: id, url, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${id}` };
      state.targets.push(target);
      return target;
    },
    worker(id, url) {
      const target = { id, type: 'service_worker', title: id, url, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/${id}` };
      state.targets.push(target);
      return target;
    },
    async close() {
      for (const client of wss.clients) client.terminate();
      await new Promise((resolve) => wss.close(resolve));
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
  return stub;
}

function value(v) {
  return { result: { type: typeof v, value: v } };
}

function captureOutput() {
  const captured = [];
  const originals = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    originals[method] = console[method];
    console[method] = (...args) => { captured.push(args.map(String).join(' ')); };
  }
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  process.stdout.write = function patched(chunk, ...rest) { captured.push(String(chunk)); return stdoutWrite.call(this, chunk, ...rest); };
  process.stderr.write = function patched(chunk, ...rest) { captured.push(String(chunk)); return stderrWrite.call(this, chunk, ...rest); };
  return {
    text: () => captured.join('\n'),
    restore() {
      for (const method of Object.keys(originals)) console[method] = originals[method];
      process.stdout.write = stdoutWrite;
      process.stderr.write = stderrWrite;
    },
  };
}

test('pairExtensionViaCdp evaluates one pairing expression in the worker and prints nothing (B2, I-1)', async () => {
  const stub = await startCdpStub({ onEvaluate: () => value({ stored: true, pairingStatus: 'paired' }) });
  const output = captureOutput();
  try {
    stub.worker('sw-1', `chrome-extension://${EXTENSION_ID}/background.js`);
    stub.page('page-1', 'about:blank');
    const result = await pairExtensionViaCdp(stub.port, EXTENSION_ID, PAIRING_CODE);
    output.restore();
    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
    assert.equal(stub.state.evaluations.length, 1);
    const [evaluation] = stub.state.evaluations;
    assert.equal(evaluation.targetId, 'sw-1');
    assert.equal(evaluation.method, 'Runtime.evaluate');
    assert.equal(evaluation.params.awaitPromise, true);
    assert.equal(evaluation.params.returnByValue, true);
    assert.match(evaluation.params.expression, /fsbMcpBridgePairing/);
    assert.match(evaluation.params.expression, /reloadPairingAndReconnect/);
    assert.match(evaluation.params.expression, /storedAt: Date\.now\(\)/);
    assert.ok(evaluation.params.expression.includes(JSON.stringify(PAIRING_CODE)));
    assert.equal(output.text().includes('PAIRCODE_SENTINEL'), false, 'the pairing code was never printed');
    assert.equal(JSON.stringify(result).includes('PAIRCODE_SENTINEL'), false);
    assert.deepEqual(stub.state.newCalls, [], 'an awake worker needs no wake tab');
  } finally {
    output.restore();
    await stub.close();
  }
});

test('pairExtensionViaCdp wakes a sleeping worker through PUT /json/new on the control panel, then retries', async () => {
  const stub = await startCdpStub({
    onEvaluate: () => value({ stored: true, pairingStatus: 'configured' }),
    onNew: (s) => { setTimeout(() => s.worker('sw-woken', `chrome-extension://${EXTENSION_ID}/background.js`), 30); },
  });
  try {
    const result = await pairExtensionViaCdp(stub.port, EXTENSION_ID, PAIRING_CODE, { wakeTimeoutMs: 2000, pollMs: 20 });
    assert.equal(result.ok, true);
    assert.deepEqual(stub.state.newCalls, [`chrome-extension://${EXTENSION_ID}/ui/control_panel.html`]);
    assert.ok(stub.state.requests.some((r) => r.method === 'PUT' && r.path.startsWith('/json/new?')));
    assert.equal(stub.state.evaluations[0].targetId, 'sw-woken');
    assert.ok(stub.state.closed.includes('wake-1'), 'the wake tab is closed afterwards');
  } finally {
    await stub.close();
  }
});

test('pairExtensionViaCdp maps an evaluation exception to a fixed reason that never carries the code', async () => {
  const stub = await startCdpStub({
    onEvaluate: () => ({ result: { type: 'object', subtype: 'error' }, exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: mcpBridgeClient' } } }),
  });
  try {
    stub.worker('sw-1', `chrome-extension://${EXTENSION_ID}/background.js`);
    const result = await pairExtensionViaCdp(stub.port, EXTENSION_ID, PAIRING_CODE);
    assert.deepEqual(result, { ok: false, reason: 'cdp_evaluate_exception' });
    await assert.rejects(evaluate(stub.state.targets[0], `(${JSON.stringify(PAIRING_CODE)}, missing())`), (error) => {
      assert.equal(error.message, 'cdp_evaluate_exception');
      return true;
    });
    const noWorker = await pairExtensionViaCdp(stub.port, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', PAIRING_CODE, { wakeTimeoutMs: 100, pollMs: 20 });
    assert.deepEqual(noWorker, { ok: false, reason: 'service_worker_unreachable' });
    assert.deepEqual(await pairExtensionViaCdp(stub.port, 'not-an-id', PAIRING_CODE), { ok: false, reason: 'extension_id_invalid' });
    assert.deepEqual(await pairExtensionViaCdp(stub.port, EXTENSION_ID, 'not-a-code'), { ok: false, reason: 'pairing_code_invalid' });
  } finally {
    await stub.close();
  }
});

test('readExtensionStorageFlag: strict true only, one key, awaitPromise and returnByValue (W-B, I-1)', async () => {
  let answer = true;
  const stub = await startCdpStub({ onEvaluate: () => (answer === undefined ? { result: { type: 'undefined' } } : value(answer)) });
  try {
    stub.worker('sw-1', `chrome-extension://${EXTENSION_ID}/background.js`);
    assert.equal(await readExtensionStorageFlag(stub.port, EXTENSION_ID, 'fsbTelemetryOptOut'), true);
    answer = false;
    assert.equal(await readExtensionStorageFlag(stub.port, EXTENSION_ID, 'fsbTelemetryOptOut'), false);
    answer = undefined;
    assert.equal(await readExtensionStorageFlag(stub.port, EXTENSION_ID, 'fsbTelemetryOptOut'), false);
    answer = 'true';
    assert.equal(await readExtensionStorageFlag(stub.port, EXTENSION_ID, 'fsbTelemetryOptOut'), false);
    for (const evaluation of stub.state.evaluations) {
      assert.equal(evaluation.params.awaitPromise, true);
      assert.equal(evaluation.params.returnByValue, true);
      assert.match(evaluation.params.expression, /^chrome\.storage\.local\.get\(\["fsbTelemetryOptOut"\]\)/);
      const keys = evaluation.params.expression.match(/"[A-Za-z0-9_]+"/g);
      assert.deepEqual([...new Set(keys)], ['"fsbTelemetryOptOut"'], 'exactly one storage key is named');
    }
    assert.equal(await readExtensionStorageFlag(stub.port, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'fsbTelemetryOptOut', { wakeTimeoutMs: 100, pollMs: 20 }), null,
      'no worker after the wake-and-retry window is unverifiable');
    assert.equal(await readExtensionStorageFlag(stub.port, EXTENSION_ID, 'a"; chrome.storage.local.clear(); "'), null, 'unsafe keys are refused');
  } finally {
    await stub.close();
  }
});

test('collectCoreEvidence reads the run token\'s targets and prefers the most markers, then the last', async () => {
  const token = 'tokenABC123';
  const markersById = {
    'page-a': { href: `http://127.0.0.1:5000/r/${token}/fixtures/app/index.html`, markers: { 'saved-count': '4' } },
    'page-b': { href: `http://127.0.0.1:5000/r/${token}/fixtures/app/index.html?view=saved`, markers: { 'saved-count': '4', 'saved-value': 'alpha' } },
    'page-c': { href: `http://127.0.0.1:5000/r/${token}/fixtures/app/index.html?view=tie`, markers: { one: '1', two: '2' } },
  };
  const stub = await startCdpStub({ onEvaluate: (id) => value(markersById[id] || { href: 'about:blank', markers: {} }) });
  try {
    stub.page('page-a', markersById['page-a'].href);
    stub.page('page-other', 'http://127.0.0.1:5000/r/otherTOKEN99/fixtures/app/index.html');
    stub.page('page-b', markersById['page-b'].href);
    const evidence = await collectCoreEvidence(stub.port, token);
    assert.equal(evidence.finalUrl, markersById['page-b'].href);
    assert.deepEqual(evidence.markers, markersById['page-b'].markers);
    assert.deepEqual(evidence.targetIds, ['page-a', 'page-b']);
    assert.equal(stub.state.evaluations.some((e) => e.targetId === 'page-other'), false, 'other runs are never read');
    for (const evaluation of stub.state.evaluations) assert.equal(evaluation.params.awaitPromise, true);

    stub.page('page-c', markersById['page-c'].href);
    const tie = await collectCoreEvidence(stub.port, token);
    assert.equal(tie.finalUrl, markersById['page-c'].href, 'a tie goes to the last target');

    const empty = await collectCoreEvidence(stub.port, 'noSuchToken1');
    assert.deepEqual(empty, { finalUrl: null, markers: {}, targetIds: [] });
  } finally {
    await stub.close();
  }
});

test('collectLiveEvidence matches the start URL host and keeps the page text in memory', async () => {
  const stub = await startCdpStub({
    onEvaluate: (id) => value(id === 'jira'
      ? { href: 'https://issues.apache.org/jira/browse/HADOOP-1', text: 'HADOOP-1 Fixed summary' }
      : { href: 'https://example.org/', text: 'other' }),
  });
  try {
    stub.page('jira', 'https://issues.apache.org/jira/browse/HADOOP-1');
    stub.page('other', 'https://example.org/');
    const evidence = await collectLiveEvidence(stub.port, { set: 'live', startUrl: 'https://issues.apache.org/jira/browse/HADOOP-1' });
    assert.equal(evidence.finalUrl, 'https://issues.apache.org/jira/browse/HADOOP-1');
    assert.equal(evidence.text, 'HADOOP-1 Fixed summary');
    assert.deepEqual(evidence.targetIds, ['jira']);
  } finally {
    await stub.close();
  }
});

test('closeTargets hits /json/close/<id> for each id; listPageTargets and browserVersion stay URL-free', async () => {
  const stub = await startCdpStub();
  try {
    stub.page('p1', 'about:blank');
    stub.page('p2', 'about:blank');
    stub.worker('w1', `chrome-extension://${EXTENSION_ID}/background.js`);
    assert.deepEqual((await listPageTargets(stub.port)).map((t) => t.id), ['p1', 'p2']);
    const closed = await closeTargets(stub.port, ['p1', 'p2']);
    assert.equal(closed.closed, 2);
    assert.deepEqual(stub.state.closed, ['p1', 'p2']);
    assert.ok(stub.state.requests.some((r) => r.path === '/json/close/p1'));
    const version = await browserVersion(stub.port);
    assert.deepEqual(version, { browser: 'Chrome/146.0.7680.0', protocolVersion: '1.3' });
    assert.equal(JSON.stringify(version).includes('://'), false);
  } finally {
    await stub.close();
  }
});

test('readDevToolsPort reads the first line of <profile>/DevToolsActivePort', async () => {
  const dir = tempDir('devtools');
  try {
    setTimeout(() => fs.writeFileSync(path.join(dir, 'DevToolsActivePort'), '53211\n/devtools/browser/abc\n'), 50);
    assert.equal(await readDevToolsPort(dir, 2000), 53211);
    await assert.rejects(readDevToolsPort(path.join(dir, 'missing'), 100), /DevToolsActivePort/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cdp.mjs takes ws from mcp/node_modules and never relies on a global WebSocket', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'bench', 'lib', 'cdp.mjs'), 'utf8');
  assert.match(source, /createRequire/);
  assert.equal(/globalThis\.WebSocket|typeof WebSocket/.test(source), false);
  assert.equal(/console\.(log|error|warn|info)\([^)]*pairingCode/.test(source), false);
});
