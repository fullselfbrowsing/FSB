'use strict';

const secretCanary = 'DELEGATION_SECRET_CANARY_61_02';
const pidCanary = 424242;
const argvCanary = '--delegation-argv-canary';
const envCanary = 'DELEGATION_ENV_CANARY_61_02';
const taskCanary = 'DELEGATION_TASK_CANARY_61_02';
const versionCanary = 'DELEGATION_VERSION_CANARY_64_10';
const pathCanary = '/tmp/DELEGATION_PATH_CANARY_64_10';
const endpointCanary = 'http://127.0.0.1:65535/DELEGATION_ENDPOINT_CANARY_64_10';
const modelCanary = 'DELEGATION_MODEL_CANARY_64_10';
const authCanary = 'DELEGATION_AUTH_CANARY_64_10';
const rawNativeCanary = 'DELEGATION_RAW_NATIVE_CANARY_64_10';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const canonicalClients = deepFreeze({
  claudeCode: { id: 'claude-code', label: 'Claude Code' },
  openCode: { id: 'opencode', label: 'OpenCode' },
});

const baseContext = deepFreeze({
  delegationId: 'delegation_fixture_01',
  sequence: 1,
  timestamp: 1700000000000,
  state: 'running',
  client: canonicalClients.claudeCode,
  profileVersion: '2.1.177',
  model: null,
  sessionId: 'synthetic-session-01',
  allowedTools: [
    'mcp__fsb__search_capabilities',
    'mcp__fsb__invoke_capability',
  ],
});

const initEvent = deepFreeze({
  type: 'init',
  sessionId: 'synthetic-session-01',
  payload: {
    type: 'system',
    subtype: 'init',
    model: modelCanary,
    tools: [
      'mcp__fsb__search_capabilities',
      'mcp__fsb__invoke_capability',
    ],
    providerNativeExtra: secretCanary,
  },
});

const toolUseEvent = deepFreeze({
  type: 'tool_use',
  sessionId: 'synthetic-session-01',
  payload: {
    type: 'tool_use',
    id: 'synthetic-tool-01',
    name: 'mcp__fsb__search_capabilities',
    input: {
      query: taskCanary,
      credential: secretCanary,
      nested: { pid: pidCanary, argv: [argvCanary], env: envCanary },
    },
    argsSummary: 'Search capabilities',
    tabId: 42,
  },
});

const toolResultEvent = deepFreeze({
  type: 'tool_result',
  sessionId: 'synthetic-session-01',
  payload: {
    type: 'tool_result',
    tool_use_id: 'synthetic-tool-01',
    name: 'mcp__fsb__search_capabilities',
    status: 'succeeded',
    duration_ms: 125,
    content: { raw: secretCanary, task: taskCanary },
  },
});

const failedToolResultEvent = deepFreeze({
  type: 'tool_result',
  sessionId: 'synthetic-session-01',
  payload: {
    type: 'tool_result',
    tool_use_id: 'synthetic-tool-02',
    name: 'mcp__fsb__invoke_capability',
    is_error: true,
    result: secretCanary,
  },
});

const retryEvent = deepFreeze({
  type: 'retry',
  sessionId: 'synthetic-session-01',
  payload: {
    type: 'system',
    subtype: 'api_retry',
    attempt: 1,
    max_retries: 3,
    retry_delay_ms: 250,
    error: secretCanary,
  },
});

const unknownRetryEvent = deepFreeze({
  type: 'retry',
  sessionId: 'synthetic-session-01',
  payload: {
    class: 'provider_private_retry_class',
    attempt: 2,
  },
});

const resultEvent = deepFreeze({
  type: 'result',
  sessionId: 'synthetic-session-01',
  payload: {
    subtype: 'success',
    is_error: false,
    num_turns: 2,
    duration_ms: 3210,
    usage: { input_tokens: 10, output_tokens: 20 },
    cost_usd: 999,
    rawResult: secretCanary,
  },
});

const hostileOpenCodeResultEvent = deepFreeze({
  type: 'result',
  sessionId: 'synthetic-opencode-session-01',
  payload: {
    subtype: 'success',
    is_error: false,
    turns: 3,
    durationMs: 4321,
    tokens: {
      total: 70,
      input: 30,
      output: 40,
      reasoning: 5,
      cache: { read: 2, write: 1 },
    },
    billingKind: 'api',
    billing_kind: 'subscription',
    usd: 987.65,
    cost_usd: 123.45,
    model: modelCanary,
    auth: authCanary,
    endpoint: endpointCanary,
    server: { port: 65535, secret: secretCanary },
    topology: { kind: 'owned_server', path: pathCanary },
    version: versionCanary,
    rawNativeEvent: { jsonl: rawNativeCanary },
    task: taskCanary,
    argv: [argvCanary],
    env: { SECRET: envCanary },
  },
});

const failedResultEvent = deepFreeze({
  type: 'result',
  sessionId: 'synthetic-session-01',
  payload: {
    subtype: 'error',
    is_error: true,
    num_turns: 1,
    usage: {},
    diagnostic: secretCanary,
  },
});

const stateEvent = deepFreeze({
  type: 'state',
  sessionId: 'synthetic-session-01',
  payload: {
    providerState: 'provider-private-state',
    task: taskCanary,
  },
});

const terminalEvent = deepFreeze({
  type: 'terminal',
  sessionId: 'synthetic-session-01',
  payload: {
    providerCode: 'provider-private-terminal-code',
    diagnostic: secretCanary,
  },
});

const maliciousEvent = deepFreeze({
  type: 'assistant',
  sessionId: 'synthetic-session-01',
  payload: {
    html: '<img src=x onerror=alert(1)>',
    prompt: taskCanary,
    task: taskCanary,
    credentials: secretCanary,
    pid: pidCanary,
    argv: [argvCanary],
    env: { SECRET: envCanary },
    providerEvent: { raw: secretCanary },
    nested: [{ deeper: { rawResult: secretCanary } }],
  },
});

const hugeUnicode = '🪐'.repeat(257);
const boundary = deepFreeze({
  presentationMinusOne: 'p'.repeat(255),
  presentation: 'p'.repeat(256),
  presentationPlusOne: 'p'.repeat(257),
  idMinusOne: 'i'.repeat(127),
  id: 'i'.repeat(128),
  idPlusOne: 'i'.repeat(129),
  allowedToolMinusOne: 't'.repeat(95),
  allowedTool: 't'.repeat(96),
  allowedToolPlusOne: 't'.repeat(97),
});

function makePersistedEnvelope(entries, overrides = {}) {
  return {
    v: 1,
    delegationId: 'delegation_fixture_01',
    terminal: false,
    terminalCode: null,
    entries,
    ...overrides,
  };
}

function makeDuplicateSequenceEntries(entry) {
  return [entry, { ...entry }];
}

function makeConflictingSequenceEntries(entry) {
  return [entry, { ...entry, title: 'conflicting persisted title' }];
}

module.exports = deepFreeze({
  secretCanary,
  pidCanary,
  argvCanary,
  envCanary,
  taskCanary,
  versionCanary,
  pathCanary,
  endpointCanary,
  modelCanary,
  authCanary,
  rawNativeCanary,
  canonicalClients,
  baseContext,
  initEvent,
  toolUseEvent,
  toolResultEvent,
  failedToolResultEvent,
  retryEvent,
  unknownRetryEvent,
  resultEvent,
  hostileOpenCodeResultEvent,
  failedResultEvent,
  stateEvent,
  terminalEvent,
  maliciousEvent,
  hugeUnicode,
  boundary,
  makePersistedEnvelope,
  makeDuplicateSequenceEntries,
  makeConflictingSequenceEntries,
});
