'use strict';

const assert = require('assert');
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

  const validFrames = [
    { id: 'request-1', type: 'ext:request', method: 'bridge.ping', payload: { value: 1 } },
    { id: 'response-1', type: 'ext:response', payload: { authorized: true } },
    { id: 'event-1', type: 'ext:event', event: 'agent.progress', payload: { progress: 50 } },
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

  console.log('mcp-reverse-channel-contract: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
