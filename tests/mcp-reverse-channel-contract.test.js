'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const repoRoot = path.resolve(__dirname, '..');

async function run() {
  const protocolUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'ext-protocol.js')).href;
  const {
    EXT_ERROR_CODES,
    EXT_FRAME_LIMITS,
    makeExtError,
    parseExtFrame,
  } = await import(protocolUrl);
  const bridgeUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge.js')).href;
  const { WebSocketBridge } = await import(bridgeUrl);

  const validFrames = [
    { id: 'request-1', type: 'ext:request', method: 'bridge.ping', payload: { value: 1 } },
    { id: 'delegate-start-1', type: 'ext:request', method: 'delegate.start', payload: { adapterId: 'claude-code', task: 'safe task' } },
    { id: 'delegate-cancel-1', type: 'ext:request', method: 'delegate.cancel', payload: { delegationId: 'delegation_server_0001' } },
    { id: 'delegate-hold-1', type: 'ext:request', method: 'delegate.hold', payload: { delegationId: 'delegation_server_0001' } },
    { id: 'delegate-resume-1', type: 'ext:request', method: 'delegate.resume', payload: { delegationId: 'delegation_server_0001' } },
    { id: 'delegate-status-1', type: 'ext:request', method: 'delegate.status', payload: {} },
    { id: 'adapter-compatibility-1', type: 'ext:request', method: 'adapter.compatibility', payload: {} },
    { id: 'response-1', type: 'ext:response', payload: { authorized: true } },
    {
      id: 'delegate-start-1',
      type: 'ext:event',
      event: 'delegation.started',
      payload: { delegationId: 'delegation_server_0001', adapterId: 'claude-code', profileVersion: '1' },
    },
    {
      id: 'delegate-start-1',
      type: 'ext:event',
      event: 'delegation.event',
      payload: { type: 'assistant', text: 'bounded progress' },
    },
  ];

  for (const frame of validFrames) {
    assert.deepStrictEqual(parseExtFrame(frame), frame, `${frame.type} should round-trip`);
  }

  const expectedErrorCodes = [
    'agent_provider_offline',
    'bridge_topology_changed',
    'ext_unauthorized',
    'invalid_ext_request',
    'ext_request_timeout',
  ];
  assert.deepStrictEqual([...EXT_ERROR_CODES], expectedErrorCodes, 'ext error codes remain the exact five-value set');

  const domainDriftResponse = {
    id: 'delegate-drift-1',
    type: 'ext:response',
    payload: {
      delegationId: 'delegation_server_drift',
      status: 'failed',
      terminal: {
        type: 'diagnostic',
        code: 'agent_protocol_drift',
        profileVersion: '2.1.177',
        detail: {
          adapterId: 'claude-code',
          expected: 'known_event_shape',
          observed: 'unknown_event_type',
        },
      },
    },
  };
  assert.deepStrictEqual(
    parseExtFrame(domainDriftResponse),
    domainDriftResponse,
    'agent protocol drift round-trips only as a domain terminal payload',
  );
  assert.strictEqual(domainDriftResponse.error, undefined, 'agent protocol drift is not a transport error');
  assert(!EXT_ERROR_CODES.includes('agent_protocol_drift'), 'domain drift does not expand the exact-five transport union');
  assert.deepStrictEqual(
    Object.keys(domainDriftResponse.payload.terminal.detail),
    ['adapterId', 'expected', 'observed'],
    'domain drift detail has only the exact safe three-field projection',
  );

  const adapterSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'adapter.ts'),
    'utf8',
  );
  const adapterInterface = adapterSource.match(/export interface AgentProviderAdapter \{([\s\S]*?)\n\}/);
  assert(adapterInterface, 'five-method adapter interface remains source-visible');
  const adapterMethods = [...adapterInterface[1].matchAll(/^\s{2}([A-Za-z]+)\(/gm)]
    .map((match) => match[1]);
  assert.deepStrictEqual(
    adapterMethods,
    ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
    'supervisor lifecycle methods never expand the five-method adapter',
  );
  for (const lifecycleMethod of ['hold', 'resume', 'status']) {
    assert(!adapterMethods.includes(lifecycleMethod), `${lifecycleMethod} remains supervisor-only`);
  }
  const serveDelegationSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'serve-delegation.ts'),
    'utf8',
  );
  assert(
    serveDelegationSource.includes('return supervisor.handleExtRequest(request, emit, context);'),
    'all five closed delegate methods route through the one serve-owned supervisor instance',
  );
  assert(
    serveDelegationSource.includes("request.method === 'adapter.compatibility'"),
    'compatibility uses one separately named additive request',
  );
  assert(
    serveDelegationSource.includes('createSafeCompatibilitySnapshot'),
    'the serve request returns only the canonical browser-safe snapshot projection',
  );
  assert(
    serveDelegationSource.indexOf("request.method === 'adapter.compatibility'")
      < serveDelegationSource.indexOf('return supervisor.handleExtRequest(request, emit, context);'),
    'the read-only compatibility branch stays separate from supervisor lifecycle authority',
  );
  for (const forbiddenCompatibilityField of [
    'sessionSecret',
    'sessionId',
    'realPath',
    'profileVersion',
    'detectedVersion',
  ]) {
    const compatibilityBranch = serveDelegationSource.slice(
      serveDelegationSource.indexOf("request.method === 'adapter.compatibility'"),
      serveDelegationSource.indexOf('return supervisor.handleExtRequest(request, emit, context);'),
    );
    assert(
      !compatibilityBranch.includes(forbiddenCompatibilityField),
      `compatibility branch cannot project ${forbiddenCompatibilityField}`,
    );
  }
  const indexSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'index.ts'), 'utf8');
  assert(indexSource.includes("import { startServeDelegation } from './agent-providers/serve-delegation.js';"));
  assert(
    /const lifecycle = await startServeDelegation\(\{\s*host,\s*port,\s*dependencies:\s*\{\s*prepareBridgeAuth: \(\) => \{\s*rotateBridgeSessionSecret\(\);\s*\},\s*\},\s*\}\);/.test(indexSource),
    'serve startup injects secret rotation only through the post-bind lifecycle hook',
  );
  const supervisorSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'spawn-supervisor.ts'),
    'utf8',
  );
  assert(
    /import\s*\{[^}]*\bAgentProtocolDriftError\b[^}]*\}\s*from '\.\/protocol-drift\.js';/.test(
      supervisorSource,
    ),
    'the supervisor recognizes shared production typed drift before generic error normalization',
  );
  assert(
    !supervisorSource.includes("from './claude-stream.js'"),
    'the supervisor does not import a provider-native parser',
  );
  for (const safeLabel of [
    'bounded_jsonl',
    'known_event_shape',
    'single_init_session',
    'single_terminal_result',
    'adapter_contract',
    'protocol_drift',
  ]) {
    assert(supervisorSource.includes(safeLabel), `supervisor pins closed drift label ${safeLabel}`);
  }
  const runtimeFilesSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'runtime-files.ts'),
    'utf8',
  );
  assert(
    runtimeFilesSource.includes('const recoveryRequired = entry.generation !== this.dependencies.generation;'),
    'restart loss requires a prior journal generation',
  );
  assert(
    runtimeFilesSource.includes('recordRestartLossAndRemoveRun'),
    'restart loss is persisted only through the atomic cleanup disposition mutation',
  );
  assert(
    supervisorSource.includes('mintGeneration: () => generation'),
    'startup recovery and live supervisor share one daemon-minted generation',
  );
  for (const source of [serveDelegationSource, indexSource]) {
    assert(
      !source.includes('daemon_restart_lost_run'),
      'transport and serve topology never infer daemon restart loss',
    );
  }
  for (const forbidden of ['adoptRun(', 'replayRun(']) {
    assert(!runtimeFilesSource.includes(forbidden), `${forbidden} is absent from runtime recovery`);
    assert(!supervisorSource.includes(forbidden), `${forbidden} is absent from supervisor recovery`);
  }

  const delegationSequence = validFrames.filter((frame) => frame.id === 'delegate-start-1');
  assert.deepStrictEqual(
    delegationSequence.map((frame) => frame.type === 'ext:event' ? frame.event : frame.method),
    ['delegate.start', 'delegation.started', 'delegation.event'],
    'delegation contract exposes its server id before normalized events',
  );

  for (const code of expectedErrorCodes) {
    const response = makeExtError('error-1', code, 'stable error', code !== 'ext_unauthorized');
    assert.deepStrictEqual(parseExtFrame(response), response, `${code} error response should round-trip`);
    assert.deepStrictEqual(Object.keys(response).sort(), ['error', 'id', 'type']);
    assert.deepStrictEqual(Object.keys(response.error).sort(), ['code', 'message', 'retryable']);
  }

  const tooManyPayloadKeys = Object.fromEntries(
    Array.from({ length: EXT_FRAME_LIMITS.payloadKeys + 1 }, (_, index) => [`key${index}`, index]),
  );
  const malformedFrames = [
    null,
    [],
    {},
    { id: '', type: 'ext:request', method: 'bridge.ping', payload: {} },
    { id: 'x'.repeat(EXT_FRAME_LIMITS.idLength + 1), type: 'ext:request', method: 'bridge.ping', payload: {} },
    { id: 'request-1', type: 'ext:unknown', method: 'bridge.ping', payload: {} },
    { id: 'request-1', type: 'ext:request', method: 'Bridge.Ping', payload: {} },
    { id: 'request-1', type: 'ext:request', method: `a${'b'.repeat(EXT_FRAME_LIMITS.methodLength)}`, payload: {} },
    { id: 'request-1', type: 'ext:request', method: 'bridge.ping', payload: [] },
    { id: 'request-1', type: 'ext:request', method: 'bridge.ping', payload: tooManyPayloadKeys },
    { id: 'request-1', type: 'ext:request', method: 'bridge.ping', payload: {}, extra: true },
    { id: 'response-1', type: 'ext:response' },
    { id: 'response-1', type: 'ext:response', payload: {}, error: { code: 'ext_unauthorized', message: 'no', retryable: false } },
    { id: 'response-1', type: 'ext:response', error: { code: 'unknown', message: 'no', retryable: false } },
    { id: 'response-1', type: 'ext:response', error: { code: 'ext_unauthorized', message: '', retryable: false } },
    { id: 'response-1', type: 'ext:response', error: { code: 'ext_unauthorized', message: 'x'.repeat(EXT_FRAME_LIMITS.errorMessageLength + 1), retryable: false } },
    { id: 'response-1', type: 'ext:response', error: { code: 'ext_unauthorized', message: 'no', retryable: 'false' } },
    { id: 'event-1', type: 'ext:event', event: 'agent progress', payload: {} },
  ];

  for (const frame of malformedFrames) {
    assert.strictEqual(parseExtFrame(frame), null, `malformed frame should reject: ${JSON.stringify(frame)?.slice(0, 160)}`);
  }

  for (const key of ['secret', 'token', 'flags', 'argv', 'command', 'cwd', 'env']) {
    const frame = { id: `control-${key}`, type: 'ext:request', method: 'bridge.ping', payload: {}, [key]: 'blocked' };
    assert.strictEqual(parseExtFrame(frame), null, `${key} control-plane field should reject`);
  }

  const relayHello = { type: 'relay:hello', instanceId: 'fixture-relay' };
  const relayWelcome = {
    type: 'relay:welcome',
    instanceId: 'fixture-relay',
    hubInstanceId: 'fixture-hub',
    extensionConnected: true,
    relayCount: 1,
    lastExtensionHeartbeatAt: 1234567890,
    lastDisconnectReason: null,
  };
  const relayState = {
    type: 'relay:state',
    hubInstanceId: 'fixture-hub',
    extensionConnected: true,
    relayCount: 1,
    lastExtensionHeartbeatAt: 1234567890,
    lastDisconnectReason: null,
  };

  assert.strictEqual(
    JSON.stringify(relayHello),
    '{"type":"relay:hello","instanceId":"fixture-relay"}',
    'legacy relay serialization for hello stays byte-identical',
  );
  assert.strictEqual(
    JSON.stringify(relayWelcome),
    '{"type":"relay:welcome","instanceId":"fixture-relay","hubInstanceId":"fixture-hub","extensionConnected":true,"relayCount":1,"lastExtensionHeartbeatAt":1234567890,"lastDisconnectReason":null}',
    'legacy relay serialization for welcome stays byte-identical',
  );
  assert.strictEqual(
    JSON.stringify(relayState),
    '{"type":"relay:state","hubInstanceId":"fixture-hub","extensionConnected":true,"relayCount":1,"lastExtensionHeartbeatAt":1234567890,"lastDisconnectReason":null}',
    'legacy relay serialization for state stays byte-identical',
  );

  const capableHello = { ...relayHello, capabilities: ['agent-spawn'] };
  assert.strictEqual(
    JSON.stringify(capableHello),
    '{"type":"relay:hello","instanceId":"fixture-relay","capabilities":["agent-spawn"]}',
    'agent-spawn capability is additive only when explicitly supplied',
  );
  assert.strictEqual((JSON.stringify(capableHello).match(/"capabilities":\["agent-spawn"\]/g) || []).length, 1);

  const normalizedCapabilities = [...new Set(
    ['unknown', 'agent-spawn', 'agent-spawn'].filter((capability) => capability === 'agent-spawn'),
  )];
  assert.deepStrictEqual(normalizedCapabilities, ['agent-spawn'], 'closed capability normalization drops unknown and duplicate values');

  const heartbeatBridge = new WebSocketBridge({ instanceId: 'heartbeat-contract' });
  const heartbeatSocket = {
    readyState: 1,
    sent: [],
    send(raw) { this.sent.push(raw); },
  };
  const sendHeartbeat = (frame) => {
    heartbeatSocket.sent.length = 0;
    heartbeatBridge._handleExtensionMessage(heartbeatSocket, JSON.stringify(frame));
    return heartbeatSocket.sent.map((raw) => JSON.parse(raw));
  };

  const legacyPongs = sendHeartbeat({ type: 'mcp:ping', ts: 1234567890 });
  assert.strictEqual(legacyPongs.length, 1, 'legacy nonce-absent ping still receives one pong');
  assert.deepStrictEqual(Object.keys(legacyPongs[0]).sort(), ['ts', 'type'], 'legacy pong shape remains nonce-free');
  assert.strictEqual(legacyPongs[0].type, 'mcp:pong');
  assert.ok(Number.isSafeInteger(legacyPongs[0].ts) && legacyPongs[0].ts >= 0, 'legacy pong uses a safe daemon timestamp');

  for (const nonce of ['a'.repeat(16), 'A0_-'.repeat(16)]) {
    const pongs = sendHeartbeat({ type: 'mcp:ping', ts: 1234567890, nonce });
    assert.strictEqual(pongs.length, 1, `bounded nonce length ${nonce.length} receives one pong`);
    assert.deepStrictEqual(Object.keys(pongs[0]).sort(), ['nonce', 'ts', 'type'], 'nonce pong has the exact three-key shape');
    assert.strictEqual(pongs[0].type, 'mcp:pong');
    assert.strictEqual(pongs[0].nonce, nonce, 'daemon echoes the validated heartbeat nonce byte-for-byte');
  }

  const malformedHeartbeats = [
    { type: 'mcp:ping' },
    { type: 'mcp:ping', ts: -1 },
    { type: 'mcp:ping', ts: 1.5 },
    { type: 'mcp:ping', ts: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'mcp:ping', ts: '123' },
    { type: 'mcp:ping', ts: 123, nonce: 'a'.repeat(15) },
    { type: 'mcp:ping', ts: 123, nonce: 'a'.repeat(65) },
    { type: 'mcp:ping', ts: 123, nonce: 'valid_length_but!' },
    { type: 'mcp:ping', ts: 123, nonce: null },
    { type: 'mcp:ping', ts: 123, extra: true },
    { type: 'mcp:ping', ts: 123, nonce: 'a'.repeat(16), extra: true },
  ];
  for (const frame of malformedHeartbeats) {
    assert.deepStrictEqual(sendHeartbeat(frame), [], `closed heartbeat parser drops malformed frame: ${JSON.stringify(frame)}`);
  }

  const authorityCanary = 'authority_canary_01';
  const canaryPong = sendHeartbeat({ type: 'mcp:ping', ts: 123, nonce: authorityCanary });
  assert.strictEqual(canaryPong[0].nonce, authorityCanary, 'nonce is used only as the echoed acknowledgement token');
  assert.ok(!JSON.stringify(heartbeatBridge).includes(authorityCanary), 'heartbeat nonce is never retained in daemon topology state');
  assert.strictEqual(heartbeatBridge.pendingRequests.has(authorityCanary), false, 'heartbeat nonce never becomes a request id');
  assert.strictEqual(heartbeatBridge.messageOrigin.has(authorityCanary), false, 'heartbeat nonce never acquires routing authority');

  console.log('mcp-reverse-channel-contract: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
