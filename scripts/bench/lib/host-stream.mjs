/**
 * Phase 66 host metrics from the benchmark driver's own stream (D-12, D-14,
 * D-18).
 *
 * FSB cannot see a calling host's model time, tokens or cost, so they come
 * only from the host CLI's NDJSON stream. Claude Code's init and result give
 * the tool-loading mode, durations, turns, usage and cost. That cost is a
 * client-side figure: it is labelled "list-price estimate, not billed" when
 * apiKeySource is none or costBasis is list. Cursor reports durations only,
 * so its tokens and cost are "unavailable (host does not report)".
 *
 * Summaries hold counts, durations, token numbers, bounded identifiers and
 * labels. They never copy result text, assistant text, or tool inputs or
 * outputs, which can carry page content (T-66-02). Error text is classified
 * in memory and dropped.
 *
 * The Claude argv mirrors the pinned v0.9.91 task-mode profile in
 * mcp/src/agent-providers/claude-profile.ts (read, never edited; D-01) plus an
 * explicit --model with no default (orchestrator decision 3). No permission
 * bypass flag is ever built (T-66-ARGV).
 *
 * rate_limit_event and result are passthrough shapes in claude-stream.ts; the
 * exact rate-limit status strings are confirmed in the 66-10 smoke.
 */

import fs from 'node:fs';
import path from 'node:path';

export const CLAUDE_DENIED_TOOLS = Object.freeze([
  'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch',
]);
export const FORBIDDEN_HOST_FLAGS = Object.freeze([
  '--dangerously-skip-permissions', '--yolo', '--auto', '--force',
]);
export const COST_LABEL_LIST_PRICE = 'list-price estimate, not billed';
export const COST_LABEL_CLIENT_ESTIMATE = 'client-side estimate';
export const HOST_UNAVAILABLE_LABEL = 'unavailable (host does not report)';
export const CLAUDE_ERROR_KINDS = Object.freeze(['usage_limit', 'rate_limit', 'auth', 'api_error', 'other']);
export const NDJSON_MAX_LINE_BYTES = 4 * 1024 * 1024;

const MODEL_PATTERN = /^[A-Za-z0-9._:[\]-]{1,80}$/;
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;
const UNRECOGNIZED = '[unrecognized]';
const FSB_AGENT_KEYS = Object.freeze([
  'description', 'disallowedTools', 'maxTurns', 'name', 'permissionMode', 'prompt', 'tools',
]);
const SERIALIZED_AGENT_KEYS = Object.freeze([
  'description', 'prompt', 'tools', 'disallowedTools', 'permissionMode', 'maxTurns',
]);
const FSB_AGENT_BOUNDS = Object.freeze({ descriptionMin: 24, promptMin: 200, maxTurns: 40 });
const CLAUDE_EVENT_TYPES = Object.freeze(['system', 'assistant', 'user', 'stream_event', 'rate_limit_event', 'result']);
const CURSOR_EVENT_TYPES = Object.freeze(['system', 'user', 'assistant', 'tool_call', 'result']);
const ALLOWED_RATE_STATUSES = Object.freeze(['allowed', 'allowed_warning']);
const MAX_STATUSES = 5;
const MAX_STATUS_CHARS = 40;
const MAX_LABEL_CHARS = 80;
const MAX_SHORT_LABEL_CHARS = 40;
const MAX_TOOL_NAMES = 64;
const MAX_MODEL_USAGE = 8;
const MAX_MCP_SERVERS = 16;
const MAX_ERROR_PARTS = 16;
const MAX_CLASSIFY_CHARS = 16384;

// Error rules (W-A), tried in order. A status number counts only after
// "HTTP" or "status", so "500 ms" or a bare "429 rows" never pauses a run.
const USAGE_LIMIT_RULE = /usage limit|limit reached|out of (?:extra )?usage/i;
const RATE_LIMIT_RULE = /\b(?:HTTP|status)[ :]*429\b|rate.?limit|too many requests|overloaded/i;
const AUTH_RULE = /\b(?:HTTP|status)[ :]*40[13]\b|unauthori[sz]ed|forbidden|authentication|invalid (?:x-)?api[ -]?key|not logged in|log ?in required|please run \/login/i;
const API_ERROR_RULE = /\b(?:HTTP|status)[ :]*5\d\d\b|api error/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

// A host-supplied identifier (model, status, key source): control characters
// removed and length bounded. Never used for free text.
function label(value, max = MAX_LABEL_CHARS) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function sortedCounts(counts) {
  return Object.fromEntries(Object.keys(counts).sort().map((key) => [key, counts[key]]));
}

// --- NDJSON -----------------------------------------------------------------

function toBuffer(chunk) {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  throw new TypeError('NDJSON input must be a Buffer, Uint8Array or string');
}

/**
 * Incremental NDJSON reader, as in claude-stream.ts: lines split on the LF
 * byte (so a UTF-8 character split across chunks survives), a trailing CR
 * stripped, blank lines skipped, and a final unterminated line flushed by
 * end(). A line that is not a JSON object is counted in parseErrors, and a
 * line over maxLineBytes is dropped and counted in both parseErrors and
 * oversizeLines. Nothing throws on bad input.
 * Returns { push(chunk), end() }; end() returns { events, parseErrors, oversizeLines }.
 */
export function createNdjsonAccumulator(onEvent, options = {}) {
  if (typeof onEvent !== 'function') throw new TypeError('createNdjsonAccumulator needs an onEvent function');
  const maxLineBytes = isPlainObject(options) && options.maxLineBytes !== undefined
    ? options.maxLineBytes
    : NDJSON_MAX_LINE_BYTES;
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) throw new RangeError('maxLineBytes must be a positive integer');
  const stats = { events: 0, parseErrors: 0, oversizeLines: 0 };
  let pieces = [];
  let pendingBytes = 0;
  let oversize = false;
  let ended = false;

  function emit(bytes) {
    let end = bytes.length;
    if (end > 0 && bytes[end - 1] === 0x0d) end -= 1;
    let text = bytes.toString('utf8', 0, end);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.trim() === '') return;
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      stats.parseErrors += 1;
      return;
    }
    if (!isPlainObject(value)) {
      stats.parseErrors += 1;
      return;
    }
    stats.events += 1;
    onEvent(value);
  }

  function finishLine() {
    if (oversize) {
      stats.oversizeLines += 1;
      stats.parseErrors += 1;
    } else if (pendingBytes > 0) {
      emit(Buffer.concat(pieces, pendingBytes));
    }
    pieces = [];
    pendingBytes = 0;
    oversize = false;
  }

  return {
    push(chunk) {
      if (ended) throw new Error('NDJSON push after end()');
      const bytes = toBuffer(chunk);
      let offset = 0;
      while (offset < bytes.length) {
        const newline = bytes.indexOf(0x0a, offset);
        const stop = newline === -1 ? bytes.length : newline;
        if (!oversize && stop > offset) {
          if (pendingBytes + (stop - offset) > maxLineBytes) {
            oversize = true;
            pieces = [];
            pendingBytes = 0;
          } else {
            pieces.push(Buffer.from(bytes.subarray(offset, stop)));
            pendingBytes += stop - offset;
          }
        }
        if (newline === -1) break;
        finishLine();
        offset = newline + 1;
      }
    },
    end() {
      if (!ended) {
        ended = true;
        finishLine();
      }
      return { ...stats };
    },
  };
}

/** Whole-text NDJSON parse: { events, parseErrors, oversizeLines }. */
export function splitNdjson(text, options) {
  const events = [];
  const accumulator = createNdjsonAccumulator((event) => events.push(event), options);
  accumulator.push(text);
  const { parseErrors, oversizeLines } = accumulator.end();
  return { events, parseErrors, oversizeLines };
}

// --- FSB agent policy and argv ------------------------------------------------

// The same key set and values loadStaticAgentPolicy (claude-profile.ts) accepts.
function assertFsbAgentPolicy(policy) {
  if (!isPlainObject(policy)) throw new Error('Invalid shipped FSB agent policy');
  if (JSON.stringify(Object.keys(policy).sort()) !== JSON.stringify(FSB_AGENT_KEYS)) {
    throw new Error('Invalid shipped FSB agent policy keys');
  }
  if (
    policy.name !== 'fsb'
    || typeof policy.description !== 'string'
    || policy.description.length < FSB_AGENT_BOUNDS.descriptionMin
    || typeof policy.prompt !== 'string'
    || policy.prompt.length < FSB_AGENT_BOUNDS.promptMin
    || !Array.isArray(policy.tools)
    || policy.tools.length !== 1
    || policy.tools[0] !== 'mcp__fsb'
    || !Array.isArray(policy.disallowedTools)
    || JSON.stringify(policy.disallowedTools) !== JSON.stringify(CLAUDE_DENIED_TOOLS)
    || policy.permissionMode !== 'dontAsk'
    || policy.maxTurns !== FSB_AGENT_BOUNDS.maxTurns
  ) {
    throw new Error('Invalid shipped FSB agent policy values');
  }
  return Object.freeze({
    name: 'fsb',
    description: policy.description,
    prompt: policy.prompt,
    tools: Object.freeze(['mcp__fsb']),
    disallowedTools: CLAUDE_DENIED_TOOLS,
    permissionMode: 'dontAsk',
    maxTurns: FSB_AGENT_BOUNDS.maxTurns,
  });
}

/** Reads and validates <repoRoot>/mcp/ai/agents/fsb.json; returns a frozen policy. */
export function readFsbAgentPolicy(repoRoot) {
  if (typeof repoRoot !== 'string' || !repoRoot) throw new TypeError('readFsbAgentPolicy needs the repository root');
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(repoRoot, 'mcp', 'ai', 'agents', 'fsb.json'), 'utf8'));
  } catch {
    throw new Error('Invalid shipped FSB agent policy: mcp/ai/agents/fsb.json is missing or not JSON');
  }
  return assertFsbAgentPolicy(parsed);
}

/**
 * The --agents value, serialized like serializeStaticAgentPolicy: one "fsb"
 * key whose value has keys description, prompt, tools, disallowedTools,
 * permissionMode, maxTurns in that order.
 */
export function serializeFsbAgents(policy) {
  const p = assertFsbAgentPolicy(policy);
  return JSON.stringify({
    [p.name]: {
      description: p.description,
      prompt: p.prompt,
      tools: p.tools,
      disallowedTools: p.disallowedTools,
      permissionMode: p.permissionMode,
      maxTurns: p.maxTurns,
    },
  });
}

function assertModel(model) {
  if (typeof model !== 'string' || !MODEL_PATTERN.test(model) || model.startsWith('-')) {
    throw new TypeError("model must be 1..80 characters of letters, digits, '.', '_', ':', '[', ']' or '-', not starting with '-'");
  }
}

function assertAgentsJson(agentsJson) {
  if (typeof agentsJson !== 'string') throw new TypeError('agentsJson must be the serializeFsbAgents output');
  let parsed;
  try {
    parsed = JSON.parse(agentsJson);
  } catch {
    throw new TypeError('agentsJson must be the serializeFsbAgents output');
  }
  if (!isPlainObject(parsed) || JSON.stringify(Object.keys(parsed)) !== '["fsb"]' || !isPlainObject(parsed.fsb)
    || JSON.stringify(Object.keys(parsed.fsb)) !== JSON.stringify(SERIALIZED_AGENT_KEYS)) {
    throw new TypeError('agentsJson must define exactly the fsb agent');
  }
  let canonical;
  try {
    canonical = serializeFsbAgents({ name: 'fsb', ...parsed.fsb });
  } catch {
    throw new TypeError('agentsJson must hold the shipped fsb agent policy');
  }
  if (canonical !== agentsJson) throw new TypeError('agentsJson must be exactly the serializeFsbAgents output');
}

function assertNoForbiddenFlags(argv) {
  for (const arg of argv) {
    for (const flag of FORBIDDEN_HOST_FLAGS) {
      if (arg === flag || arg.startsWith(`${flag}=`)) throw new Error('refusing to build a permission-bypass host argv');
    }
  }
}

/**
 * Claude Code task-mode argv: the claude-profile.ts task-mode flags in the
 * same order, then --model <model>. The task goes on stdin, never in argv.
 */
export function buildClaudeArgv({ mcpConfigPath, agentsJson, model } = {}) {
  assertModel(model);
  if (typeof mcpConfigPath !== 'string' || !path.isAbsolute(mcpConfigPath)) {
    throw new TypeError('mcpConfigPath must be an absolute path');
  }
  assertAgentsJson(agentsJson);
  const argv = [
    '-p',
    '--verbose',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-chrome',
    '--strict-mcp-config',
    '--mcp-config', mcpConfigPath,
    '--agents', agentsJson,
    '--agent', 'fsb',
    '--permission-mode', 'dontAsk',
    '--tools', '',
    '--allowedTools', 'mcp__fsb',
    '--disallowedTools', CLAUDE_DENIED_TOOLS.join(','),
    '--max-turns', '40',
    '--no-session-persistence',
    '--model', model,
  ];
  assertNoForbiddenFlags(argv);
  return argv;
}

/**
 * cursor-agent print-mode argv; the driver appends the prompt as the final
 * positional argument. --model is added only when a model is given.
 */
export function buildCursorArgv({ model } = {}) {
  const argv = ['-p', '--output-format', 'stream-json'];
  if (model !== undefined && model !== null) {
    assertModel(model);
    argv.push('--model', model);
  }
  assertNoForbiddenFlags(argv);
  return argv;
}

// --- Claude summary -----------------------------------------------------------

function isFsbTool(name) {
  return name === 'mcp__fsb' || name.startsWith('mcp__fsb__');
}

function countToolUses(event, seenIds, counts, byName) {
  const message = isPlainObject(event.message) ? event.message : null;
  const content = message && Array.isArray(message.content) ? message.content : [];
  for (const block of content) {
    if (!isPlainObject(block) || block.type !== 'tool_use') continue;
    if (typeof block.id === 'string' && block.id) {
      if (seenIds.has(block.id)) continue;
      seenIds.add(block.id);
    }
    let name = typeof block.name === 'string' && TOOL_NAME_PATTERN.test(block.name) ? block.name : UNRECOGNIZED;
    counts.total += 1;
    if (name !== UNRECOGNIZED && isFsbTool(name)) counts.fsb += 1;
    else if (name === 'ToolSearch') counts.toolSearch += 1;
    else counts.other += 1;
    if (!Object.prototype.hasOwnProperty.call(byName, name) && Object.keys(byName).length >= MAX_TOOL_NAMES) {
      name = UNRECOGNIZED;
    }
    byName[name] = (byName[name] || 0) + 1;
  }
}

function countRateLimit(event, rate) {
  rate.events += 1;
  const info = isPlainObject(event.rate_limit_info) ? event.rate_limit_info : null;
  if (!info || typeof info.status !== 'string') return;
  if (!ALLOWED_RATE_STATUSES.includes(info.status)) rate.limited = true;
  const status = label(info.status, MAX_STATUS_CHARS);
  if (status && rate.statuses.length < MAX_STATUSES && !rate.statuses.includes(status)) rate.statuses.push(status);
}

function mcpServerList(servers) {
  if (!Array.isArray(servers)) return [];
  return servers.slice(0, MAX_MCP_SERVERS).map((server) => (typeof server === 'string'
    ? { name: label(server), status: null }
    : { name: isPlainObject(server) ? label(server.name) : null, status: isPlainObject(server) ? label(server.status, MAX_SHORT_LABEL_CHARS) : null }));
}

function claudeInitSummary(init, toolSearchEnv) {
  if (!init) {
    return {
      present: false, model: null, hostVersion: null, toolCount: null, fsbToolCount: null,
      hasToolSearch: false, hasWaitForMcpServers: false, toolLoading: 'unknown', toolSearchEnv,
      apiKeySource: null, permissionMode: null, mcpServers: [], mcpServerErrors: null,
    };
  }
  const tools = Array.isArray(init.tools) ? init.tools.filter((tool) => typeof tool === 'string') : null;
  const hasToolSearch = !!tools && tools.includes('ToolSearch');
  const hasWait = !!tools && tools.includes('WaitForMcpServers');
  let toolLoading = 'unknown';
  if (hasToolSearch && hasWait) toolLoading = 'ambiguous';
  else if (hasToolSearch) toolLoading = 'tool-search';
  else if (hasWait) toolLoading = 'eager';
  return {
    present: true,
    model: label(init.model),
    hostVersion: label(init.claude_code_version, MAX_SHORT_LABEL_CHARS),
    toolCount: tools ? tools.length : null,
    fsbToolCount: tools ? tools.filter(isFsbTool).length : null,
    hasToolSearch,
    hasWaitForMcpServers: hasWait,
    toolLoading,
    toolSearchEnv,
    apiKeySource: label(init.apiKeySource, MAX_SHORT_LABEL_CHARS),
    permissionMode: label(init.permissionMode, MAX_SHORT_LABEL_CHARS),
    mcpServers: mcpServerList(init.mcp_servers),
    mcpServerErrors: Array.isArray(init.mcp_server_errors) ? init.mcp_server_errors.length : null,
  };
}

function usageSummary(usage) {
  if (!isPlainObject(usage)) return null;
  return {
    input: nonNegativeInteger(usage.input_tokens),
    output: nonNegativeInteger(usage.output_tokens),
    cacheRead: nonNegativeInteger(usage.cache_read_input_tokens),
    cacheCreation: nonNegativeInteger(usage.cache_creation_input_tokens),
  };
}

function modelUsageSummary(modelUsage) {
  if (!isPlainObject(modelUsage)) return [];
  return Object.keys(modelUsage).sort().filter((model) => isPlainObject(modelUsage[model])).slice(0, MAX_MODEL_USAGE)
    .map((model) => {
      const row = modelUsage[model];
      return {
        model: label(model),
        input: nonNegativeInteger(row.inputTokens),
        output: nonNegativeInteger(row.outputTokens),
        cacheRead: nonNegativeInteger(row.cacheReadInputTokens),
        cacheCreation: nonNegativeInteger(row.cacheCreationInputTokens),
        costUsd: finiteNonNegative(row.costUSD),
      };
    });
}

function claudeResultSummary(result, count, init) {
  if (!result) {
    return {
      present: false, count: 0, subtype: null, isError: null, durationMs: null, durationApiMs: null,
      numTurns: null, usage: null, modelUsage: [], totalCostUsd: null, costBasis: null,
      costLabel: HOST_UNAVAILABLE_LABEL, permissionDenials: null,
    };
  }
  const totalCostUsd = finiteNonNegative(result.total_cost_usd);
  const costBasis = label(typeof result.costBasis === 'string' ? result.costBasis : result.cost_basis, MAX_SHORT_LABEL_CHARS);
  const listPrice = (!!init && init.apiKeySource === 'none') || costBasis === 'list';
  let costLabel = HOST_UNAVAILABLE_LABEL;
  if (totalCostUsd !== null) costLabel = listPrice ? COST_LABEL_LIST_PRICE : COST_LABEL_CLIENT_ESTIMATE;
  return {
    present: true,
    count,
    subtype: label(result.subtype, MAX_SHORT_LABEL_CHARS),
    isError: typeof result.is_error === 'boolean' ? result.is_error : null,
    durationMs: finiteNonNegative(result.duration_ms),
    durationApiMs: finiteNonNegative(result.duration_api_ms),
    numTurns: nonNegativeInteger(result.num_turns),
    usage: usageSummary(result.usage),
    modelUsage: modelUsageSummary(result.modelUsage),
    totalCostUsd,
    costBasis,
    costLabel,
    permissionDenials: Array.isArray(result.permission_denials) ? result.permission_denials.length : null,
  };
}

// The error text to classify, kept in memory only. A structured
// api_error_status is read as "status <code>", so 429 is a rate limit and
// 401/403 an auth failure rather than a generic API error.
function errorEvidence(result) {
  const parts = [];
  const status = result.api_error_status;
  let code = null;
  if (Number.isInteger(status)) code = status;
  else if (typeof status === 'string' && /^\d{3}$/.test(status)) code = Number(status);
  if (code !== null) parts.push(`status ${code}`);
  const add = (value) => {
    if (typeof value === 'string') parts.push(value);
    else if (isPlainObject(value) && typeof value.message === 'string') parts.push(value.message);
  };
  add(result.result);
  add(result.error);
  if (Array.isArray(result.errors)) result.errors.slice(0, MAX_ERROR_PARTS).forEach(add);
  return {
    text: parts.join('\n').slice(0, MAX_CLASSIFY_CHARS),
    hasStatusField: status !== undefined && status !== null,
  };
}

function classifyError({ text, hasStatusField }) {
  if (USAGE_LIMIT_RULE.test(text)) return 'usage_limit';
  if (RATE_LIMIT_RULE.test(text)) return 'rate_limit';
  if (AUTH_RULE.test(text)) return 'auth';
  if (hasStatusField || API_ERROR_RULE.test(text)) return 'api_error';
  return 'other';
}

/**
 * errorKind is null unless the result is an error or a rate limit was
 * refused. A refused rate limit with no error result, or with an error the
 * rules leave as 'other', is 'usage_limit', so the runner pauses instead of
 * counting a failed run.
 */
function claudeErrorKind(result, limited) {
  if (!result || result.is_error !== true) return limited ? 'usage_limit' : null;
  const kind = classifyError(errorEvidence(result));
  return kind === 'other' && limited ? 'usage_limit' : kind;
}

/**
 * Summarizes parsed Claude Code stream-json events. options.toolSearchEnv is
 * the ENABLE_TOOL_SEARCH value the driver launched with ('unset' when absent).
 */
export function summarizeClaudeStream(events, options = {}) {
  const list = Array.isArray(events) ? events : [];
  const toolSearchEnv = isPlainObject(options) && typeof options.toolSearchEnv === 'string'
    ? label(options.toolSearchEnv, MAX_SHORT_LABEL_CHARS)
    : 'unset';
  const eventCounts = { total: 0, system: 0, assistant: 0, user: 0, stream_event: 0, rate_limit_event: 0, result: 0, other: 0 };
  const toolCounts = { total: 0, fsb: 0, toolSearch: 0, other: 0 };
  const byName = Object.create(null);
  const seenToolIds = new Set();
  const rateLimit = { events: 0, limited: false, statuses: [] };
  let init = null;
  let result = null;
  let resultCount = 0;

  for (const event of list) {
    if (!isPlainObject(event)) continue;
    eventCounts.total += 1;
    const type = CLAUDE_EVENT_TYPES.includes(event.type) ? event.type : 'other';
    eventCounts[type] += 1;
    if (type === 'system' && event.subtype === 'init') {
      if (!init) init = event;
    } else if (type === 'assistant') {
      countToolUses(event, seenToolIds, toolCounts, byName);
    } else if (type === 'rate_limit_event') {
      countRateLimit(event, rateLimit);
    } else if (type === 'result') {
      resultCount += 1;
      if (!result) result = event;
    }
  }

  return {
    host: 'claude-code',
    eventCounts,
    init: claudeInitSummary(init, toolSearchEnv),
    toolUses: { ...toolCounts, byName: sortedCounts(byName) },
    rateLimit,
    result: claudeResultSummary(result, resultCount, init),
    claimedComplete: !!result && result.subtype === 'success' && result.is_error === false,
    errorKind: claudeErrorKind(result, rateLimit.limited),
  };
}

// --- Cursor summary -----------------------------------------------------------

/**
 * Summarizes parsed cursor-agent stream-json events. Cursor's result has
 * durations only, so tokens and cost are null and labelled unavailable.
 */
export function summarizeCursorStream(events) {
  const list = Array.isArray(events) ? events : [];
  const eventCounts = { total: 0, system: 0, user: 0, assistant: 0, tool_call: 0, result: 0, other: 0 };
  const toolCalls = { started: 0, completed: 0 };
  let init = null;
  let result = null;
  let resultCount = 0;

  for (const event of list) {
    if (!isPlainObject(event)) continue;
    eventCounts.total += 1;
    const type = CURSOR_EVENT_TYPES.includes(event.type) ? event.type : 'other';
    eventCounts[type] += 1;
    if (type === 'system' && event.subtype === 'init') {
      if (!init) init = event;
    } else if (type === 'tool_call') {
      if (event.subtype === 'started') toolCalls.started += 1;
      else if (event.subtype === 'completed') toolCalls.completed += 1;
    } else if (type === 'result') {
      resultCount += 1;
      if (!result) result = event;
    }
  }

  return {
    host: 'cursor-agent',
    eventCounts,
    init: init
      ? {
        present: true,
        model: label(init.model),
        apiKeySource: label(init.apiKeySource, MAX_SHORT_LABEL_CHARS),
        permissionMode: label(init.permissionMode, MAX_SHORT_LABEL_CHARS),
      }
      : { present: false, model: null, apiKeySource: null, permissionMode: null },
    toolCalls,
    result: result
      ? {
        present: true,
        count: resultCount,
        subtype: label(result.subtype, MAX_SHORT_LABEL_CHARS),
        isError: typeof result.is_error === 'boolean' ? result.is_error : null,
        durationMs: finiteNonNegative(result.duration_ms),
        durationApiMs: finiteNonNegative(result.duration_api_ms),
      }
      : { present: false, count: 0, subtype: null, isError: null, durationMs: null, durationApiMs: null },
    tokens: null,
    costUsd: null,
    label: HOST_UNAVAILABLE_LABEL,
    claimedComplete: !!result && result.subtype === 'success' && result.is_error === false,
  };
}
