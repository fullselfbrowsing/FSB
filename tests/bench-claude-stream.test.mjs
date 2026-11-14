// Phase 66 host metrics from the driver stream (D-12, D-14, D-18): Claude Code
// and Cursor NDJSON summaries that keep counts, durations, token numbers and
// labels but never page or model text, plus a Claude argv that mirrors the
// pinned v0.9.91 task-mode profile (read from claude-profile.ts source text).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CLAUDE_DENIED_TOOLS,
  COST_LABEL_CLIENT_ESTIMATE,
  COST_LABEL_LIST_PRICE,
  FORBIDDEN_HOST_FLAGS,
  HOST_UNAVAILABLE_LABEL,
  buildClaudeArgv,
  buildCursorArgv,
  createNdjsonAccumulator,
  readFsbAgentPolicy,
  serializeFsbAgents,
  splitNdjson,
  summarizeClaudeStream,
  summarizeCursorStream,
} from '../scripts/bench/lib/host-stream.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BENCH_FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'bench');
const CLAUDE_FIXTURE = path.join(BENCH_FIXTURES, 'claude-stream-result.jsonl');
const CURSOR_FIXTURE = path.join(BENCH_FIXTURES, 'cursor-stream-result.jsonl');
const CAP_FIXTURE = path.join(BENCH_FIXTURES, 'claude-stream-usage-cap.jsonl');
const ERROR_CASES = JSON.parse(fs.readFileSync(path.join(BENCH_FIXTURES, 'claude-error-text-cases.json'), 'utf8'));
const PROFILE_SOURCE = fs.readFileSync(path.join(ROOT, 'mcp', 'src', 'agent-providers', 'claude-profile.ts'), 'utf8');
const FLAG_SCANNER_SOURCE = fs.readFileSync(path.join(ROOT, 'scripts', 'verify-agent-provider-flags.mjs'), 'utf8');
const MCP_CONFIG = '/tmp/x/mcp.json';
const MODEL = 'claude-model-fixture';
const CLAUDE_SENTINELS = [
  'CLAUDE_RESULT_TEXT_3b7e',
  'CLAUDE_ASSISTANT_TEXT_42d9',
  'CLAUDE_TOOL_INPUT_TEXT_19fe',
  'CLAUDE_TOOL_OUTPUT_TEXT_c03b',
  'CLAUDE_PARTIAL_TEXT_77c1',
  'µ',
];

function fixtureEvents(file) {
  const { events, parseErrors } = splitNdjson(fs.readFileSync(file, 'utf8'));
  assert.equal(parseErrors, 0, `${path.basename(file)} parses cleanly`);
  return events;
}

function agentsJson() {
  return serializeFsbAgents(readFsbAgentPolicy(ROOT));
}

// --- claude-profile.ts source-text parsing (read-only; D-01) ---------------

// Splits an array-literal body into its top-level elements, keeping quoted
// strings and bracketed calls such as DENIED_TOOLS.join(',') whole.
function splitTopLevel(body) {
  const out = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += body[i + 1];
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '/' && body[i + 1] === '/') {
      const newline = body.indexOf('\n', i);
      i = newline === -1 ? body.length : newline;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth -= 1;
    if (ch === ',' && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function taskModeElements() {
  const anchor = PROFILE_SOURCE.indexOf("const argv = ctx.purpose === 'connection_test'");
  assert.notEqual(anchor, -1, 'claude-profile.ts still builds argv from ctx.purpose');
  const open = PROFILE_SOURCE.indexOf('] : [', anchor);
  assert.notEqual(open, -1, 'claude-profile.ts still has a task-mode branch');
  const close = PROFILE_SOURCE.indexOf('];', open);
  assert.notEqual(close, -1);
  return splitTopLevel(PROFILE_SOURCE.slice(open + '] : ['.length, close));
}

function singleQuoted(element) {
  const match = /^'((?:[^'\\]|\\.)*)'$/.exec(element);
  return match ? match[1].replace(/\\(.)/g, '$1') : null;
}

function quotedListAfter(source, marker, terminator) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `source marker ${marker}`);
  const end = source.indexOf(terminator, start + marker.length);
  return [...source.slice(start + marker.length, end).matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

function profileDeniedTools() {
  return quotedListAfter(PROFILE_SOURCE, 'const DENIED_TOOLS = Object.freeze([', ']');
}

// The argv claude-profile.ts would build in task mode, with its identifier
// arguments mapped to the bench's values. An unknown identifier fails loudly.
function expectedTaskModeArgv({ mcpConfigPath, agents }) {
  const out = [];
  for (const element of taskModeElements()) {
    const literal = singleQuoted(element);
    if (literal !== null) {
      out.push(literal);
      continue;
    }
    switch (element) {
      case '...binary.argvPrefix':
        break; // the driver spawns the resolved claude binary itself
      case 'ctx.privateMcpConfigPath':
        out.push(mcpConfigPath);
        break;
      case 'SERIALIZED_FSB_AGENTS':
        out.push(agents);
        break;
      case "DENIED_TOOLS.join(',')":
        out.push(profileDeniedTools().join(','));
        break;
      default:
        throw new Error(`unmapped task-mode argv element in claude-profile.ts: ${element}`);
    }
  }
  return out;
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  assert.notEqual(index, -1, `${flag} present`);
  return argv[index + 1];
}

function minimalClaudeStream({ isError, text, subtype, extraResult = {}, extraEvents = [] }) {
  return [
    { type: 'system', subtype: 'init', session_id: 's-01', model: MODEL, tools: ['ToolSearch'], mcp_servers: [], apiKeySource: 'none' },
    ...extraEvents,
    {
      type: 'result',
      subtype: subtype || (isError ? 'error_during_execution' : 'success'),
      session_id: 's-01',
      is_error: isError,
      num_turns: 1,
      result: text,
      ...extraResult,
    },
  ];
}

function withTempRepo(policy, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-bench-agent-'));
  try {
    const file = path.join(dir, 'mcp', 'ai', 'agents', 'fsb.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(policy, null, 2));
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function shippedPolicy() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp', 'ai', 'agents', 'fsb.json'), 'utf8'));
}

// --- constants --------------------------------------------------------------

test('labels, denied tools and forbidden flags are pinned', () => {
  assert.equal(COST_LABEL_LIST_PRICE, 'list-price estimate, not billed');
  assert.equal(COST_LABEL_CLIENT_ESTIMATE, 'client-side estimate');
  assert.equal(HOST_UNAVAILABLE_LABEL, 'unavailable (host does not report)');
  assert.deepEqual([...CLAUDE_DENIED_TOOLS], ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch']);
  assert.deepEqual([...FORBIDDEN_HOST_FLAGS], ['--dangerously-skip-permissions', '--yolo', '--auto', '--force']);
});

test('FORBIDDEN_HOST_FLAGS covers every flag the agent-provider scanner forbids', () => {
  const scanned = quotedListAfter(FLAG_SCANNER_SOURCE, 'const FORBIDDEN_AGENT_PROVIDER_FLAGS = [', '];');
  assert.ok(scanned.length >= 3);
  for (const flag of scanned) assert.ok(FORBIDDEN_HOST_FLAGS.includes(flag), flag);
});

// --- argv parity with claude-profile.ts -------------------------------------

test('buildClaudeArgv mirrors the task-mode argv of claude-profile.ts, then adds --model', () => {
  const agents = agentsJson();
  const argv = buildClaudeArgv({ mcpConfigPath: MCP_CONFIG, agentsJson: agents, model: MODEL });
  const profile = expectedTaskModeArgv({ mcpConfigPath: MCP_CONFIG, agents });
  assert.deepEqual(argv, [...profile, '--model', MODEL]);

  // Every flag literal from the profile appears once, in the same order.
  const flags = taskModeElements().map(singleQuoted).filter((v) => v !== null && v.startsWith('-'));
  assert.ok(flags.length >= 15, 'the profile still has its task-mode flags');
  const positions = flags.map((flag) => argv.indexOf(flag));
  assert.ok(positions.every((p) => p >= 0), 'every profile flag is present');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'profile flags keep their order');

  assert.equal(valueAfter(argv, '--output-format'), 'stream-json');
  assert.equal(valueAfter(argv, '--setting-sources'), '');
  assert.equal(valueAfter(argv, '--mcp-config'), MCP_CONFIG);
  assert.equal(valueAfter(argv, '--agents'), agents);
  assert.equal(valueAfter(argv, '--agent'), 'fsb');
  assert.equal(valueAfter(argv, '--permission-mode'), 'dontAsk');
  assert.equal(valueAfter(argv, '--tools'), '');
  assert.equal(valueAfter(argv, '--allowedTools'), 'mcp__fsb');
  assert.equal(valueAfter(argv, '--disallowedTools'), 'Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch');
  assert.equal(valueAfter(argv, '--max-turns'), '40');
  assert.deepEqual(argv.slice(-2), ['--model', MODEL]);
  for (const taskOnly of ['--include-partial-messages', '--agents', '--agent', '--allowedTools']) {
    assert.ok(argv.includes(taskOnly), `${taskOnly} is a task-mode flag`);
  }
});

test('the denied tools, agent keys, value bounds and serialization order match claude-profile.ts', () => {
  assert.deepEqual(profileDeniedTools(), [...CLAUDE_DENIED_TOOLS]);
  const staticKeys = quotedListAfter(PROFILE_SOURCE, 'const STATIC_AGENT_KEYS = Object.freeze([', ']');
  assert.deepEqual(staticKeys, Object.keys(shippedPolicy()).sort());

  const start = PROFILE_SOURCE.indexOf('function serializeStaticAgentPolicy');
  const body = PROFILE_SOURCE.slice(start, PROFILE_SOURCE.indexOf('\n}', start));
  const order = [...body.matchAll(/^\s*(\w+): policy\.\1,$/gm)].map((m) => m[1]);
  assert.deepEqual(order, ['description', 'prompt', 'tools', 'disallowedTools', 'permissionMode', 'maxTurns']);
  assert.deepEqual(Object.keys(JSON.parse(agentsJson()).fsb), order);

  const descriptionMin = Number(/policy\.description\.length < (\d+)/.exec(PROFILE_SOURCE)[1]);
  const promptMin = Number(/policy\.prompt\.length < (\d+)/.exec(PROFILE_SOURCE)[1]);
  const maxTurns = Number(/policy\.maxTurns !== (\d+)/.exec(PROFILE_SOURCE)[1]);
  assert.deepEqual([descriptionMin, promptMin, maxTurns], [24, 200, 40]);
  const edge = { ...shippedPolicy(), description: 'd'.repeat(descriptionMin), prompt: 'p'.repeat(promptMin) };
  withTempRepo(edge, (dir) => assert.equal(readFsbAgentPolicy(dir).description.length, descriptionMin));
  const short = { ...shippedPolicy(), description: 'd'.repeat(descriptionMin - 1) };
  withTempRepo(short, (dir) => assert.throws(() => readFsbAgentPolicy(dir), /values/));
  const shortPrompt = { ...shippedPolicy(), prompt: 'p'.repeat(promptMin - 1) };
  withTempRepo(shortPrompt, (dir) => assert.throws(() => readFsbAgentPolicy(dir), /values/));
});

test('serializeFsbAgents gives one fsb key with the pinned key order and shipped values', () => {
  const policy = readFsbAgentPolicy(ROOT);
  const parsed = JSON.parse(serializeFsbAgents(policy));
  assert.deepEqual(Object.keys(parsed), ['fsb']);
  assert.deepEqual(Object.keys(parsed.fsb), ['description', 'prompt', 'tools', 'disallowedTools', 'permissionMode', 'maxTurns']);
  const shipped = shippedPolicy();
  assert.deepEqual(parsed.fsb, {
    description: shipped.description,
    prompt: shipped.prompt,
    tools: ['mcp__fsb'],
    disallowedTools: [...CLAUDE_DENIED_TOOLS],
    permissionMode: 'dontAsk',
    maxTurns: 40,
  });
  assert.equal(Object.isFrozen(policy), true);
});

test('readFsbAgentPolicy refuses an extra key or a widened value', () => {
  withTempRepo({ ...shippedPolicy(), model: 'opus' }, (dir) => {
    assert.throws(() => readFsbAgentPolicy(dir), /keys/);
  });
  const widened = [
    { permissionMode: 'bypassPermissions' },
    { maxTurns: 41 },
    { tools: ['mcp__fsb', 'Bash'] },
    { disallowedTools: ['Bash'] },
    { name: 'other' },
  ];
  for (const change of widened) {
    withTempRepo({ ...shippedPolicy(), ...change }, (dir) => {
      assert.throws(() => readFsbAgentPolicy(dir), /values/, JSON.stringify(change));
    });
  }
  assert.throws(() => readFsbAgentPolicy(path.join(os.tmpdir(), 'fsb-bench-no-such-repo')), /FSB agent policy/);
});

test('buildClaudeArgv refuses a missing or invalid model and a relative mcpConfigPath', () => {
  const agents = agentsJson();
  const build = (overrides) => buildClaudeArgv({ mcpConfigPath: MCP_CONFIG, agentsJson: agents, model: MODEL, ...overrides });
  for (const model of [undefined, null, '', 'bad model', 'x'.repeat(81), '--yolo', '-p', 'model;rm', 'mé']) {
    assert.throws(() => build({ model }), /model/, String(model));
  }
  for (const model of ['claude-opus-4-6[1m]', 'us.anthropic.claude-sonnet:0', 'x'.repeat(80)]) {
    assert.equal(build({ model }).at(-1), model);
  }
  for (const mcpConfigPath of [undefined, '', 'relative/mcp.json', './mcp.json']) {
    assert.throws(() => build({ mcpConfigPath }), /mcpConfigPath/, String(mcpConfigPath));
  }
});

test('buildClaudeArgv accepts only the canonical serialized fsb agent', () => {
  const agents = JSON.parse(agentsJson());
  const bad = [
    undefined,
    'not json',
    JSON.stringify({ ...agents, other: agents.fsb }),
    JSON.stringify({ fsb: { ...agents.fsb, permissionMode: 'bypassPermissions' } }),
    JSON.stringify({ fsb: { ...agents.fsb, tools: ['mcp__fsb', 'Bash'] } }),
    JSON.stringify(agents, null, 2),
  ];
  for (const agentsJsonValue of bad) {
    assert.throws(
      () => buildClaudeArgv({ mcpConfigPath: MCP_CONFIG, agentsJson: agentsJsonValue, model: MODEL }),
      /agentsJson/,
      String(agentsJsonValue).slice(0, 40),
    );
  }
});

test('buildCursorArgv is print-mode stream-json and adds --model only when given', () => {
  assert.deepEqual(buildCursorArgv(), ['-p', '--output-format', 'stream-json']);
  assert.deepEqual(buildCursorArgv({}), ['-p', '--output-format', 'stream-json']);
  assert.deepEqual(buildCursorArgv({ model: 'cursor-model-fixture' }),
    ['-p', '--output-format', 'stream-json', '--model', 'cursor-model-fixture']);
  assert.throws(() => buildCursorArgv({ model: '--force' }), /model/);
  assert.throws(() => buildCursorArgv({ model: 'bad model' }), /model/);
});

test('no built argv contains a forbidden host flag', () => {
  const outputs = [
    buildClaudeArgv({ mcpConfigPath: MCP_CONFIG, agentsJson: agentsJson(), model: MODEL }),
    buildCursorArgv(),
    buildCursorArgv({ model: 'cursor-model-fixture' }),
  ];
  for (const argv of outputs) {
    for (const flag of FORBIDDEN_HOST_FLAGS) {
      assert.ok(!argv.some((arg) => arg === flag || arg.startsWith(`${flag}=`)), `${flag} in ${argv.join(' ')}`);
    }
  }
});

// --- NDJSON -----------------------------------------------------------------

test('7-byte CRLF chunks give the same events as the whole text, and end() flushes the last line', () => {
  const text = fs.readFileSync(CLAUDE_FIXTURE, 'utf8');
  const whole = splitNdjson(text);
  assert.equal(whole.events.length, 15);
  const crlf = Buffer.from(text.replace(/\n/g, '\r\n').replace(/\r\n$/, ''), 'utf8');
  const seen = [];
  const accumulator = createNdjsonAccumulator((event) => seen.push(event));
  for (let offset = 0; offset < crlf.length; offset += 7) accumulator.push(crlf.subarray(offset, offset + 7));
  assert.equal(seen.length, whole.events.length - 1, 'the unterminated last line waits for end()');
  const stats = accumulator.end();
  assert.deepEqual(seen, whole.events);
  assert.equal(stats.parseErrors, 0);
  assert.equal(stats.events, whole.events.length);
  assert.throws(() => accumulator.push('{}\n'), /after end/);
});

test('invalid and non-object lines are counted, blank lines are skipped, nothing throws', () => {
  const text = '{"type":"a"}\nnot json\n\n   \r\n[1,2]\n"text"\n{"type":"b"}\n{"type":';
  const { events, parseErrors } = splitNdjson(text);
  assert.deepEqual(events, [{ type: 'a' }, { type: 'b' }]);
  assert.equal(parseErrors, 4);
  assert.deepEqual(splitNdjson(Buffer.from('﻿{"type":"bom"}\n')).events, [{ type: 'bom' }]);
  assert.throws(() => createNdjsonAccumulator(null), TypeError);
});

test('an over-long line is dropped and counted, and later lines still parse', () => {
  const seen = [];
  const accumulator = createNdjsonAccumulator((event) => seen.push(event), { maxLineBytes: 32 });
  accumulator.push(`{"type":"long","pad":"${'x'.repeat(40)}"}\n`);
  accumulator.push('{"type":"short"}\n');
  const stats = accumulator.end();
  assert.deepEqual(seen, [{ type: 'short' }]);
  assert.equal(stats.oversizeLines, 1);
  assert.equal(stats.parseErrors, 1);
});

// --- Claude summary ---------------------------------------------------------

test('summarizeClaudeStream reads tool loading, durations, turns, usage and a list-price cost', () => {
  const summary = summarizeClaudeStream(fixtureEvents(CLAUDE_FIXTURE));
  assert.equal(summary.host, 'claude-code');
  assert.equal(summary.init.present, true);
  assert.equal(summary.init.model, MODEL);
  assert.equal(summary.init.hostVersion, '2.1.283');
  assert.equal(summary.init.toolLoading, 'tool-search');
  assert.equal(summary.init.hasToolSearch, true);
  assert.equal(summary.init.hasWaitForMcpServers, false);
  assert.equal(summary.init.toolSearchEnv, 'unset');
  assert.equal(summary.init.apiKeySource, 'none');
  assert.equal(summary.init.toolCount, 4);
  assert.equal(summary.init.fsbToolCount, 3);
  assert.deepEqual(summary.init.mcpServers, [{ name: 'fsb', status: 'connected' }]);

  assert.equal(summary.result.present, true);
  assert.equal(summary.result.subtype, 'success');
  assert.equal(summary.result.isError, false);
  assert.equal(summary.result.durationMs, 91234);
  assert.equal(summary.result.durationApiMs, 70211);
  assert.equal(summary.result.numTurns, 14);
  assert.equal(summary.result.totalCostUsd, 0.4312);
  assert.equal(summary.result.costLabel, COST_LABEL_LIST_PRICE);
  assert.deepEqual(summary.result.usage, { input: 1200, output: 900, cacheRead: 88000, cacheCreation: 4000 });
  assert.deepEqual(summary.result.modelUsage, [
    { model: MODEL, input: 1200, output: 900, cacheRead: 88000, cacheCreation: 4000, costUsd: 0.4312 },
  ]);
  assert.equal(summary.result.permissionDenials, 0);
  assert.equal(summary.claimedComplete, true);
  assert.deepEqual(summary.rateLimit, { events: 0, limited: false, statuses: [] });
  assert.equal(summary.errorKind, null);
});

test('tool uses come from complete assistant messages only', () => {
  const summary = summarizeClaudeStream(fixtureEvents(CLAUDE_FIXTURE));
  assert.deepEqual(summary.toolUses, {
    total: 5,
    fsb: 5,
    toolSearch: 0,
    other: 0,
    byName: { mcp__fsb__click: 3, mcp__fsb__complete_task: 1, mcp__fsb__open_tab: 1 },
  });
  const partialOnly = summarizeClaudeStream([
    { type: 'system', subtype: 'init', session_id: 's', tools: [], mcp_servers: [] },
    { type: 'stream_event', session_id: 's', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'mcp__fsb__click', input: {} } } },
  ]);
  assert.equal(partialOnly.toolUses.total, 0);
  const assistant = { type: 'assistant', session_id: 's', message: { content: [{ type: 'tool_use', id: 't1', name: 'mcp__fsb__click', input: {} }] } };
  const repeated = summarizeClaudeStream([assistant, assistant, {
    type: 'assistant', session_id: 's', message: { content: [{ type: 'tool_use', id: 't2', name: 'ToolSearch', input: { query: 'x' } }, { type: 'tool_use', id: 't3', name: 'Some Tool!', input: {} }] },
  }]);
  assert.deepEqual(repeated.toolUses, {
    total: 3, fsb: 1, toolSearch: 1, other: 1, byName: { '[unrecognized]': 1, ToolSearch: 1, mcp__fsb__click: 1 },
  });
});

test('the Claude summary never carries result, assistant, tool or partial text', () => {
  const summary = summarizeClaudeStream(fixtureEvents(CLAUDE_FIXTURE), { toolSearchEnv: 'auto' });
  const json = JSON.stringify(summary);
  for (const sentinel of CLAUDE_SENTINELS) assert.ok(!json.includes(sentinel), sentinel);
  assert.equal(summary.init.toolSearchEnv, 'auto');
});

test('tool-loading mode: WaitForMcpServers is eager, both is ambiguous, neither is unknown', () => {
  const withTools = (tools) => summarizeClaudeStream([{ type: 'system', subtype: 'init', session_id: 's', tools, mcp_servers: [] }]);
  assert.equal(withTools(['WaitForMcpServers', 'mcp__fsb__click']).init.toolLoading, 'eager');
  assert.equal(withTools(['ToolSearch', 'WaitForMcpServers']).init.toolLoading, 'ambiguous');
  assert.equal(withTools(['mcp__fsb__click']).init.toolLoading, 'unknown');
  const empty = summarizeClaudeStream([]);
  assert.equal(empty.init.present, false);
  assert.equal(empty.init.toolLoading, 'unknown');
});

test('a stream with no result event reports result.present false and no invented numbers', () => {
  const summary = summarizeClaudeStream(fixtureEvents(CLAUDE_FIXTURE).filter((e) => e.type !== 'result'));
  assert.equal(summary.result.present, false);
  assert.equal(summary.result.durationMs, null);
  assert.equal(summary.result.numTurns, null);
  assert.equal(summary.result.usage, null);
  assert.equal(summary.result.totalCostUsd, null);
  assert.equal(summary.result.costLabel, HOST_UNAVAILABLE_LABEL);
  assert.equal(summary.claimedComplete, false);
  assert.equal(summary.errorKind, null);
});

test('cost labels follow apiKeySource and costBasis', () => {
  const stream = (apiKeySource, extraResult) => [
    { type: 'system', subtype: 'init', session_id: 's', tools: [], mcp_servers: [], apiKeySource },
    { type: 'result', subtype: 'success', session_id: 's', is_error: false, total_cost_usd: 0.12, ...extraResult },
  ];
  assert.equal(summarizeClaudeStream(stream('user', { costBasis: 'list' })).result.costLabel, COST_LABEL_LIST_PRICE);
  assert.equal(summarizeClaudeStream(stream('none', {})).result.costLabel, COST_LABEL_LIST_PRICE);
  assert.equal(summarizeClaudeStream(stream('user', {})).result.costLabel, COST_LABEL_CLIENT_ESTIMATE);
  assert.equal(summarizeClaudeStream(stream('ANTHROPIC_API_KEY', {})).result.costLabel, COST_LABEL_CLIENT_ESTIMATE);
  const noCost = summarizeClaudeStream(stream('user', { total_cost_usd: undefined })).result;
  assert.equal(noCost.totalCostUsd, null);
  assert.equal(noCost.costLabel, HOST_UNAVAILABLE_LABEL);
  for (const bad of [-1, Number.NaN, '0.5', null]) {
    assert.equal(summarizeClaudeStream(stream('none', { total_cost_usd: bad })).result.totalCostUsd, null, String(bad));
  }
  assert.equal(summarizeClaudeStream(stream('none', { duration_ms: -5 })).result.durationMs, null);
});

// --- usage caps and error kinds (W4, W-A) -----------------------------------

test('the usage-cap fixture is limited and classified usage_limit without its text', () => {
  const summary = summarizeClaudeStream(fixtureEvents(CAP_FIXTURE));
  assert.equal(summary.rateLimit.limited, true);
  assert.ok(summary.rateLimit.events >= 1);
  assert.deepEqual(summary.rateLimit.statuses, ['rejected']);
  assert.equal(summary.errorKind, 'usage_limit');
  assert.equal(summary.result.isError, true);
  assert.equal(summary.result.subtype, 'error_during_execution');
  assert.equal(summary.claimedComplete, false);
  assert.equal(summary.toolUses.fsb, 0);
  assert.ok(!JSON.stringify(summary).includes('CLAUDE_LIMIT_TEXT_5e0a'));
});

test('the normal fixture is not limited and has no error kind', () => {
  const summary = summarizeClaudeStream(fixtureEvents(CLAUDE_FIXTURE));
  assert.equal(summary.rateLimit.limited, false);
  assert.equal(summary.errorKind, null);
});

test('rate-limit statuses are bounded and never keep reset times or messages', () => {
  const event = (info) => ({ type: 'rate_limit_event', session_id: 's-01', rate_limit_info: info });
  const summary = summarizeClaudeStream(minimalClaudeStream({
    isError: false,
    text: 'ok',
    extraEvents: [
      event({ status: 'allowed_warning', resetsAt: 1790760123, message: 'RATE_MESSAGE_SENTINEL_aa01', utilization: 0.93 }),
      event({ status: 'allowed', resetsAt: 1790760456 }),
      event({ status: 'allowed' }),
      event({ status: 42 }),
      event({}),
    ],
  }));
  assert.deepEqual(summary.rateLimit, { events: 5, limited: false, statuses: ['allowed_warning', 'allowed'] });
  assert.equal(summary.errorKind, null);
  const json = JSON.stringify(summary);
  for (const hidden of ['RATE_MESSAGE_SENTINEL_aa01', '1790760123', '1790760456', '0.93']) assert.ok(!json.includes(hidden), hidden);

  const many = summarizeClaudeStream(minimalClaudeStream({
    isError: false,
    text: 'ok',
    extraEvents: ['s1', 's2', 's3', 's4', 's5', 's6', `long-${'z'.repeat(60)}`].map((status) => event({ status })),
  }));
  assert.equal(many.rateLimit.statuses.length, 5);
  assert.equal(many.rateLimit.limited, true);
  const long = summarizeClaudeStream(minimalClaudeStream({ isError: false, text: 'ok', extraEvents: [event({ status: `long-${'z'.repeat(60)}` })] }));
  assert.equal(long.rateLimit.statuses[0].length, 40);
});

test('a limited stream without an error result is usage_limit', () => {
  const rejected = { type: 'rate_limit_event', session_id: 's-01', rate_limit_info: { status: 'rejected' } };
  const success = summarizeClaudeStream(minimalClaudeStream({ isError: false, text: 'Done', extraEvents: [rejected] }));
  assert.equal(success.errorKind, 'usage_limit');
  const noResult = summarizeClaudeStream(minimalClaudeStream({ isError: false, text: 'x', extraEvents: [rejected] })
    .filter((e) => e.type !== 'result'));
  assert.equal(noResult.errorKind, 'usage_limit');
  const otherText = summarizeClaudeStream(minimalClaudeStream({ isError: true, text: 'Something broke', extraEvents: [rejected] }));
  assert.equal(otherText.errorKind, 'usage_limit', 'a rejected rate limit explains an otherwise unclassified error');
});

test('a structured api_error_status is classified as a status code', () => {
  const kind = (status, text = 'Request failed') => summarizeClaudeStream(minimalClaudeStream({
    isError: true, text, extraResult: { api_error_status: status },
  })).errorKind;
  assert.equal(kind(429), 'rate_limit');
  assert.equal(kind('401'), 'auth');
  assert.equal(kind(403), 'auth');
  assert.equal(kind(529), 'api_error');
  assert.equal(kind(400), 'api_error');
  assert.equal(kind(null), 'other');
  assert.equal(kind(undefined), 'other');
  assert.equal(kind(429, 'Claude AI usage limit reached'), 'usage_limit', 'usage-limit text wins over a 429');
  const errorsArray = summarizeClaudeStream(minimalClaudeStream({
    isError: true, text: undefined, extraResult: { errors: ['HTTP 503 Service Unavailable'] },
  }));
  assert.equal(errorsArray.errorKind, 'api_error');
});

test('the error-text table is labelled synthetic', () => {
  assert.match(ERROR_CASES._fixture, /synthetic/);
  assert.ok(Array.isArray(ERROR_CASES.cases) && ERROR_CASES.cases.length >= 10);
});

for (const { name, isError, text, expected } of ERROR_CASES.cases) {
  test(`errorKind for "${name}" is ${expected}`, () => {
    const summary = summarizeClaudeStream(minimalClaudeStream({ isError, text }));
    assert.equal(summary.errorKind, expected);
    assert.ok(!JSON.stringify(summary).includes(text), 'the classified text is never stored');
  });
}

// --- Cursor summary ---------------------------------------------------------

test('summarizeCursorStream reports duration only and labels tokens and cost unavailable', () => {
  const summary = summarizeCursorStream(fixtureEvents(CURSOR_FIXTURE));
  assert.equal(summary.host, 'cursor-agent');
  assert.equal(summary.init.present, true);
  assert.equal(summary.init.model, 'cursor-model-fixture');
  assert.equal(summary.result.present, true);
  assert.equal(summary.result.durationMs, 45678);
  assert.equal(summary.result.durationApiMs, 40111);
  assert.equal(summary.result.isError, false);
  assert.equal(summary.tokens, null);
  assert.equal(summary.costUsd, null);
  assert.equal(summary.label, HOST_UNAVAILABLE_LABEL);
  assert.equal(summary.claimedComplete, true);
  const json = JSON.stringify(summary);
  for (const hidden of ['CURSOR_RESULT_TEXT_91aa', 'CURSOR_ASSISTANT_TEXT_6d1e', '/tmp/bench-cwd-4f2e']) {
    assert.ok(!json.includes(hidden), hidden);
  }
});

test('a Cursor stream without a result has no duration', () => {
  const summary = summarizeCursorStream(fixtureEvents(CURSOR_FIXTURE).filter((e) => e.type !== 'result'));
  assert.equal(summary.result.present, false);
  assert.equal(summary.result.durationMs, null);
  assert.equal(summary.claimedComplete, false);
  assert.equal(summary.label, HOST_UNAVAILABLE_LABEL);
});

// --- fixtures ---------------------------------------------------------------

test('each stream fixture opens with a synthetic _fixture line and lives under tests/fixtures/bench', () => {
  for (const file of [CLAUDE_FIXTURE, CURSOR_FIXTURE, CAP_FIXTURE]) {
    const [first] = fixtureEvents(file);
    assert.equal(first.type, '_fixture');
    assert.match(first.note, /synthetic/);
    assert.equal(path.dirname(file), BENCH_FIXTURES);
    assert.ok(!file.includes(`${path.sep}agent-streams${path.sep}`));
  }
});
