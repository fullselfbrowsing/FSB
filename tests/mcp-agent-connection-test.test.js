#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repositoryRoot, 'mcp', 'build', 'agent-providers');

function buildUrl(name) {
  return pathToFileURL(path.join(buildRoot, name)).href;
}

function detection(providerId, overrides = {}) {
  const versions = {
    'claude-code': '2.1.177',
    'grok-build': '1.0.4',
  };
  const version = versions[providerId];
  return Object.freeze({
    installed: true,
    version,
    authState: providerId === 'grok-build' ? 'oauth' : 'unknown',
    binary: Object.freeze({
      command: `/fixture/bin/${providerId}`,
      realPath: `/fixture/bin/${providerId}`,
      argvPrefix: Object.freeze([]),
    }),
    profileVersion: version,
    ...overrides,
  });
}

function successfulOutput(providerId) {
  if (providerId === 'claude-code') {
    return [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'connection-claude',
        tools: [],
        mcp_servers: [],
        plugins: [],
        hooks: [],
        model: 'fixture-model',
      },
      {
        type: 'assistant',
        session_id: 'connection-claude',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'ACK_CLAUDE_CONNECTION' }],
        },
      },
      {
        type: 'result',
        subtype: 'success',
        session_id: 'connection-claude',
        is_error: false,
        num_turns: 1,
      },
    ].map(JSON.stringify).join('\n') + '\n';
  }
  throw new Error(`No process probe fixture for ${providerId}`);
}

function ownedProbeResult(contents, exit = { code: 0, signal: null }) {
  const stdout = Buffer.from(contents, 'utf8');
  const stderr = Buffer.alloc(0);
  let zeroizeCalls = 0;
  return {
    value: {
      stdout,
      stderr,
      exit: Object.freeze(exit),
      zeroize() {
        zeroizeCalls += 1;
        stdout.fill(0);
        stderr.fill(0);
      },
    },
    get zeroizeCalls() {
      return zeroizeCalls;
    },
  };
}

function registryFor(providerId, adapter, calls) {
  return Object.freeze({
    require(requested) {
      calls.push(requested);
      assert.equal(requested, providerId);
      return adapter;
    },
  });
}

async function productionAdapters() {
  const claude = await import(buildUrl('claude-code.js'));
  return {
    'claude-code': claude.createClaudeCodeAdapter({
      detect: async () => detection('claude-code'),
      kill: async () => {},
    }),
  };
}

async function testSuccessfulProviderProbes(connection) {
  const adapters = await productionAdapters();
  for (const providerId of ['claude-code']) {
    const requireCalls = [];
    const probe = ownedProbeResult(successfulOutput(providerId));
    let descriptor;
    let writtenMcpConfig;
    let cleanupCalls = 0;
    const result = await connection.testAgentProviderConnection({
      providerId,
      registry: registryFor(providerId, adapters[providerId], requireCalls),
      dependencies: {
        environment: {
          PATH: '/usr/bin:/bin',
          OPENCODE_CONFIG_CONTENT: 'INHERITED_PROJECT_INSTRUCTIONS_CANARY',
        },
        writePrivateFile: async (pathname, contents) => {
          writtenMcpConfig = { pathname, contents };
          await fs.writeFile(pathname, contents, {
            encoding: 'utf8',
            mode: 0o600,
            flag: 'wx',
          });
        },
        runProbe: async (value) => {
          descriptor = value;
          return probe.value;
        },
        removeTempDirectory: async (pathname) => {
          cleanupCalls += 1;
          await fs.rm(pathname, { recursive: true, force: true });
        },
      },
    });

    assert.deepEqual(result, { ok: true, providerId });
    assert.deepEqual(requireCalls, [providerId], 'only the selected adapter is resolved');
    assert.equal(descriptor.command, `/fixture/bin/${providerId}`);
    assert.equal(descriptor.timeoutMs, 60_000);
    assert.equal(descriptor.stdoutLimitBytes, 1024 * 1024);
    assert.equal(descriptor.stderrLimitBytes, 1024 * 1024);
    assert.equal(path.dirname(descriptor.cwd), os.tmpdir());
    assert.deepEqual(writtenMcpConfig, {
      pathname: path.join(descriptor.cwd, 'empty-mcp.json'),
      contents: '{"mcpServers":{}}\n',
    });
    assert.equal(
      Buffer.from(descriptor.stdinBytes).toString('utf8'),
      'This is a connection validation. Do not use tools. Reply with a short acknowledgement.\n',
    );
    const surface = JSON.stringify({
      argv: descriptor.argv,
      environment: descriptor.environment,
    });
    assert.doesNotMatch(surface, /mcp__fsb|mcp_servers\.fsb|--agent["',: ]+fsb/i);
    assert.doesNotMatch(
      JSON.stringify(descriptor.environment),
      /INHERITED_PROJECT_INSTRUCTIONS_CANARY/,
    );
    assert.equal(probe.zeroizeCalls, 1);
    assert.equal(probe.value.stdout.every((byte) => byte === 0), true);
    assert.equal(cleanupCalls, 1);
    assert.doesNotMatch(JSON.stringify(result), /ACK_/);

    assert.equal(descriptor.argv.includes('--max-turns'), true);
    assert.equal(descriptor.argv[descriptor.argv.indexOf('--max-turns') + 1], '1');
    assert.equal(descriptor.argv.includes('--no-session-persistence'), true);
    assert.equal(descriptor.argv.includes('--no-chrome'), true);
    assert.equal(descriptor.argv.includes('--agents'), false);
  }
}

function staticAdapter(detected, output) {
  return Object.freeze({
    detect: async () => detected,
    buildSpawn: async (_task, context) => ({
      adapterId: context.adapterId,
      profileVersion: detected.profileVersion || 'fixture',
      topology: {
        kind: 'direct',
        task: {
          role: 'direct_task',
          command: detected.binary ? detected.binary.command : '/fixture/bin/missing',
          argv: [],
          cwd: context.cwd,
          privateFiles: [],
          fixedEnv: {},
          spawnSecretEnvBindings: [],
          stdin: 'task',
          stdout: 'agent_jsonl',
        },
      },
      attestations: [],
    }),
    async *parseEvents() {
      for (const event of output) yield Object.freeze(event);
    },
    kill: async () => {},
    caps: () => Object.freeze({
      taskMode: true,
      chatMode: false,
      resume: false,
      serverMode: false,
    }),
  });
}

async function testFailureMatrix(connection, processProbe) {
  {
    let spawnCalls = 0;
    const adapter = Object.freeze({
      ...staticAdapter(detection('grok-build'), []),
      buildSpawn: async () => {
        spawnCalls += 1;
        throw new Error('Grok connection checks must never create a prompt session');
      },
    });
    const result = await connection.testAgentProviderConnection({
      providerId: 'grok-build',
      registry: registryFor('grok-build', adapter, []),
    });
    assert.deepEqual(result, { ok: true, providerId: 'grok-build' });
    assert.equal(spawnCalls, 0, 'Grok connection validation stops after cached OAuth attestation');
  }

  {
    const controller = new AbortController();
    controller.abort();
    const adapter = staticAdapter(detection('grok-build'), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'grok-build',
      registry: registryFor('grok-build', adapter, []),
      signal: controller.signal,
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'grok-build',
      code: 'connection_test_cancelled',
    });
  }

  {
    const adapter = staticAdapter(detection('grok-build', {
      authState: 'unauthenticated',
    }), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'grok-build',
      registry: registryFor('grok-build', adapter, []),
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'grok-build',
      code: 'auth_unauthenticated',
    });
  }

  {
    const calls = [];
    const adapter = staticAdapter(detection('claude-code', {
      installed: false,
      version: null,
      binary: null,
      profileVersion: null,
    }), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, calls),
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'binary_not_found',
    });
  }

  {
    const adapter = staticAdapter(detection('claude-code', {
      installed: false,
      version: '3.0.0',
      profileVersion: null,
    }), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, []),
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'unsupported_version',
    });
  }

  {
    const adapter = staticAdapter(detection('grok-build', {
      installed: false,
      diagnostic: Object.freeze({
        code: 'acp_contract_failed',
        detail: 'fixture-only detail',
      }),
    }), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'grok-build',
      registry: registryFor('grok-build', adapter, []),
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'grok-build',
      code: 'adapter_unavailable',
    });
  }

  {
    // A private-profile failure reports no version at all -- creating or
    // attesting the isolation root never got far enough to read one. The
    // classifier calls that version_missing, which must not be mistaken for a
    // version failure and relabelled "update the CLI".
    const adapter = staticAdapter(detection('grok-build', {
      installed: false,
      version: null,
      profileVersion: null,
      diagnostic: Object.freeze({
        code: 'adapter_unavailable',
        message: 'fixture-only message',
      }),
    }), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'grok-build',
      registry: registryFor('grok-build', adapter, []),
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'grok-build',
      code: 'adapter_unavailable',
    });
  }

  {
    // The other version-less detection: the binary answered --version with
    // something that never parsed. That one is a version failure.
    const adapter = staticAdapter(detection('grok-build', {
      installed: false,
      version: null,
      profileVersion: null,
      diagnostic: Object.freeze({
        code: 'version_unparseable',
        message: 'fixture-only message',
      }),
    }), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'grok-build',
      registry: registryFor('grok-build', adapter, []),
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'grok-build',
      code: 'unsupported_version',
    });
  }

  {
    const adapter = staticAdapter(detection('claude-code'), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, []),
      dependencies: {
        environment: {},
        runProbe: async () => {
          throw new processProbe.ProcessProbeError('timeout');
        },
      },
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'connection_test_timeout',
    });
  }

  {
    const adapter = staticAdapter(detection('claude-code'), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, []),
      dependencies: {
        environment: {},
        runProbe: async () => {
          throw new processProbe.ProcessProbeError('tree_unsettled');
        },
      },
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'connection_test_cleanup_failed',
    });
  }

  {
    const controller = new AbortController();
    controller.abort();
    let probeCalls = 0;
    const adapter = staticAdapter(detection('claude-code'), []);
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, []),
      signal: controller.signal,
      dependencies: {
        runProbe: async () => {
          probeCalls += 1;
          return ownedProbeResult('').value;
        },
      },
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'connection_test_cancelled',
    });
    assert.equal(probeCalls, 0);
  }

  {
    const malformed = ownedProbeResult('{not-json\n');
    const adapters = await productionAdapters();
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapters['claude-code'], []),
      dependencies: {
        environment: {},
        runProbe: async () => malformed.value,
      },
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'connection_test_malformed',
    });
    assert.equal(malformed.zeroizeCalls, 1);
  }

  {
    const toolEvents = [
      {
        type: 'assistant',
        sessionId: 'connection-tool',
        payload: Object.freeze({ text: 'ACK_WITH_TOOL' }),
      },
      {
        type: 'tool_use',
        sessionId: 'connection-tool',
        payload: Object.freeze({ name: 'forbidden' }),
      },
      {
        type: 'result',
        sessionId: 'connection-tool',
        payload: Object.freeze({ is_error: false }),
      },
    ];
    const adapter = staticAdapter(detection('claude-code'), toolEvents);
    const probe = ownedProbeResult('{}\n');
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, []),
      dependencies: {
        environment: {},
        runProbe: async () => probe.value,
      },
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'connection_test_tools_used',
    });
  }
}

async function testCleanupFailureIsClosed(connection) {
  const adapter = staticAdapter(detection('claude-code'), [
    {
      type: 'assistant',
      sessionId: 'cleanup',
      payload: Object.freeze({ text: 'ACK' }),
    },
    {
      type: 'result',
      sessionId: 'cleanup',
      payload: Object.freeze({ is_error: false }),
    },
  ]);
  let directory = '';
  const probe = ownedProbeResult('{}\n');
  try {
    const result = await connection.testAgentProviderConnection({
      providerId: 'claude-code',
      registry: registryFor('claude-code', adapter, []),
      dependencies: {
        environment: {},
        createTempDirectory: async () => {
          directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fsb-agent-connection-'));
          return directory;
        },
        runProbe: async () => probe.value,
        removeTempDirectory: async () => {
          throw new Error('cleanup failure detail must stay private');
        },
      },
    });
    assert.deepEqual(result, {
      ok: false,
      providerId: 'claude-code',
      code: 'connection_test_cleanup_failed',
    });
    assert.doesNotMatch(JSON.stringify(result), /cleanup failure detail/);
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const [connection, processProbe, registryModule] = await Promise.all([
    import(buildUrl('connection-test.js')),
    import(buildUrl('process-probe.js')),
    import(buildUrl('registry.js')),
  ]);
  assert.equal(connection.AGENT_CONNECTION_TEST_TIMEOUT_MS, 60_000);
  const productionRegistry = registryModule.createProductionAdapterRegistry({ kill: async () => {} });
  assert.deepEqual(
    await connection.testAgentProviderConnection({
      providerId: 'opencode',
      registry: productionRegistry,
    }),
    { ok: false, providerId: 'opencode', code: 'connection_test_failed' },
    'retired OpenCode connection tests are rejected before detection or spawn',
  );
  await testSuccessfulProviderProbes(connection);
  await testFailureMatrix(connection, processProbe);
  await testCleanupFailureIsClosed(connection);
  console.log('mcp-agent-connection-test.test.js: PASS');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
