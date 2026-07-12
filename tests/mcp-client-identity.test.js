'use strict';

/**
 * Phase 57 Plan 01 -- MCP initialize client identity contract.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-client-identity.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const agentScopeBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-scope.js');
const runtimeBuildPath = path.join(repoRoot, 'mcp', 'build', 'runtime.js');

class MockBridge {
  constructor() {
    this.calls = [];
  }

  async sendAndWait(message) {
    this.calls.push(message);
    return {
      success: true,
      agentId: 'agent_identity_test_0001',
      agentIdShort: 'agent_identity',
    };
  }
}

function makeMockAgentScope() {
  return {
    ensure: async () => 'agent-test',
    ownershipTokenFor: () => null,
    currentOwnershipToken: () => null,
    currentConnectionId: () => null,
    captureOwnershipToken: () => {},
    reset: () => {},
  };
}

async function captureRegistration(AgentScope, supplier) {
  const scope = new AgentScope();
  const bridge = new MockBridge();
  if (supplier !== undefined) {
    scope.setClientInfoSupplier(supplier);
  }
  await scope.ensure(bridge);
  assert.equal(bridge.calls.length, 1, 'one scope sends exactly one registration');
  return { scope, bridge, message: bridge.calls[0] };
}

async function main() {
  assert.ok(fs.existsSync(agentScopeBuildPath), 'built AgentScope module exists');
  assert.ok(fs.existsSync(runtimeBuildPath), 'built runtime module exists');

  const { AgentScope } = await import(pathToFileURL(agentScopeBuildPath).href);
  const { createRuntime } = await import(pathToFileURL(runtimeBuildPath).href);

  {
    const { message } = await captureRegistration(
      AgentScope,
      () => ({ name: 'Claude Code', version: '2.1.177', ignored: 'drop-me' }),
    );
    assert.deepEqual(message, {
      type: 'agent:register',
      payload: { clientInfo: { name: 'Claude Code', version: '2.1.177' } },
    });
  }

  {
    const { message } = await captureRegistration(AgentScope, () => ({ name: 'Codex' }));
    assert.deepEqual(message.payload, { clientInfo: { name: 'Codex' } });
  }

  {
    const { message } = await captureRegistration(AgentScope, () => ({ version: '0.142.5' }));
    assert.deepEqual(message.payload, { clientInfo: { version: '0.142.5' } });
  }

  for (const supplier of [undefined, () => null, () => ({})]) {
    const { message } = await captureRegistration(AgentScope, supplier);
    assert.deepEqual(
      message,
      { type: 'agent:register', payload: {} },
      'absent, null, and empty suppliers preserve the exact legacy payload',
    );
  }

  {
    let clientInfo = null;
    const scope = new AgentScope();
    const bridge = new MockBridge();
    scope.setClientInfoSupplier(() => clientInfo);
    clientInfo = { name: 'OpenCode', version: '1.14.25' };

    await scope.ensure(bridge);
    assert.deepEqual(bridge.calls[0].payload, {
      clientInfo: { name: 'OpenCode', version: '1.14.25' },
    }, 'supplier is read lazily at registration time');

    await scope.ensure(bridge);
    assert.equal(bridge.calls.length, 1, 'cached scope identity prevents duplicate registration');
  }

  {
    const runtime = createRuntime();
    let initializedClient = null;
    runtime.server.server.getClientVersion = () => initializedClient;
    initializedClient = { name: 'Cursor', version: '1.2.3' };

    const bridge = new MockBridge();
    await runtime.agentScope.ensure(bridge);
    assert.deepEqual(bridge.calls[0].payload, {
      clientInfo: { name: 'Cursor', version: '1.2.3' },
    }, 'createRuntime injects a lazy SDK client-version supplier');
  }

  assert.doesNotThrow(
    () => createRuntime({ agentScope: makeMockAgentScope() }),
    'createRuntime tolerates structural AgentScope mocks without the additive setter',
  );

  const indexSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'index.ts'), 'utf8');
  const httpSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'http.ts'), 'utf8');
  assert.match(
    indexSource,
    /async function runStdioServer[\s\S]*?const runtime = createRuntime\(\);/,
    'stdio transport constructs its server through createRuntime',
  );
  assert.match(
    httpSource,
    /isInitializeRequest\(parsedBody\)[\s\S]*?const runtime = createRuntime\(\{ bridge: options\.bridge, queue: options\.queue \}\);/,
    'streamable-HTTP transport constructs each session through createRuntime',
  );

  const runtimeSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'runtime.ts'), 'utf8');
  assert.match(runtimeSource, /typeof agentScope\.setClientInfoSupplier === 'function'/);
  assert.match(runtimeSource, /server\.server\.getClientVersion\?\.\(\) \?\? null/);

  console.log('mcp-client-identity.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-client-identity.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
