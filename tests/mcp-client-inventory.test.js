'use strict';

/**
 * Phase 57 Plan 01 -- installed MCP-client inventory contract.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-client-inventory.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const inventoryBuildPath = path.join(repoRoot, 'mcp', 'build', 'client-inventory.js');
const platformsBuildPath = path.join(repoRoot, 'mcp', 'build', 'platforms.js');
const agentScopeBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-scope.js');

function fakePlatform(displayName = 'Fixture') {
  return {
    displayName,
    flag: displayName.toLowerCase(),
    format: 'json',
    serverMapKey: 'mcpServers',
    configPath: null,
    installMode: 'file',
    mergeStrategy: 'object-map',
  };
}

function successfulExec(output, calls) {
  return (file, args, options, callback) => {
    calls.push({ file, args, options });
    callback(null, output, '');
  };
}

function failingError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

class MockRegisterBridge {
  constructor() {
    this.calls = [];
  }

  async sendAndWait(message, options) {
    this.calls.push({ message, options });
    return {
      success: true,
      agentId: 'agent_inventory_test_0001',
      agentIdShort: 'agent_inventory',
    };
  }
}

async function main() {
  assert.ok(fs.existsSync(inventoryBuildPath), 'built inventory module exists');
  const inventoryModule = await import(pathToFileURL(inventoryBuildPath).href);
  const { PLATFORMS } = await import(pathToFileURL(platformsBuildPath).href);
  const { AgentScope } = await import(pathToFileURL(agentScopeBuildPath).href);
  const {
    __configureClientInventoryForTests,
    detectMcpClientInventory,
    pushMcpClientInventory,
  } = inventoryModule;

  try {
    {
      const resolvedKeys = [];
      const execCalls = [];
      __configureClientInventoryForTests({
        platform: 'linux',
        now: () => 1_783_858_833_000,
        execFile: successfulExec('Claude Code 2.1.177', execCalls),
        resolvePlatformTarget: (key) => {
          resolvedKeys.push(key);
          return {
            platformKey: key,
            platform: PLATFORMS[key],
            configPath: key === 'cursor' ? '/fixture/cursor.json' : null,
            targetLabel: PLATFORMS[key].displayName,
            variant: null,
            detected: key === 'cursor',
          };
        },
      });

      const inventory = await detectMcpClientInventory();
      assert.deepEqual(Object.keys(inventory), Object.keys(PLATFORMS), 'every registry key appears');
      assert.deepEqual(
        resolvedKeys,
        Object.keys(PLATFORMS).filter((key) => key !== 'claude-code'),
        'every non-Claude entry delegates unchanged to resolvePlatformTarget',
      );
      assert.deepEqual(inventory.cursor, {
        detected: true,
        configPath: '/fixture/cursor.json',
        checkedAt: 1_783_858_833_000,
      }, 'file-mode detection is copied from the platform target');
      assert.deepEqual(inventory.jetbrains, {
        detected: false,
        configPath: null,
        checkedAt: 1_783_858_833_000,
      }, 'instructions-mode entries remain honestly undetected');
      assert.deepEqual(inventory['claude-code'], {
        detected: true,
        configPath: null,
        checkedAt: 1_783_858_833_000,
        version: '2.1.177',
      });
      assert.ok(
        Object.values(inventory).every((record) => record.checkedAt === 1_783_858_833_000),
        'one checkedAt value is shared across the sweep',
      );
    }

    {
      const calls = [];
      const failures = ['ENOENT', 'EACCES'];
      __configureClientInventoryForTests({
        platform: 'win32',
        platforms: { 'claude-code': fakePlatform('Claude Code') },
        now: () => 200,
        execFile: (file, args, options, callback) => {
          calls.push({ file, args, options });
          const failure = failures.shift();
          if (failure) callback(failingError(failure), '', '');
          else callback(null, 'claude 3.4.5', '');
        },
      });

      const inventory = await detectMcpClientInventory();
      assert.deepEqual(calls.map((call) => call.file), ['claude.cmd', 'claude.exe', 'claude']);
      for (const call of calls) {
        assert.deepEqual(call.args, ['--version'], 'probe argv is fixed');
        assert.deepEqual(call.options, {
          timeout: 3000,
          windowsHide: true,
          maxBuffer: 65536,
        }, 'probe options are fixed and contain no shell option');
        assert.equal(Object.hasOwn(call.options, 'shell'), false, 'shell escalation is absent');
      }
      assert.equal(inventory['claude-code'].version, '3.4.5');
    }

    {
      const calls = [];
      __configureClientInventoryForTests({
        platform: 'darwin',
        platforms: { 'claude-code': fakePlatform('Claude Code') },
        execFile: successfulExec('Claude development build', calls),
      });
      const inventory = await detectMcpClientInventory();
      assert.deepEqual(calls.map((call) => call.file), ['claude'], 'POSIX probes only bare claude');
      assert.deepEqual(inventory['claude-code'], {
        detected: true,
        configPath: null,
        checkedAt: inventory['claude-code'].checkedAt,
      }, 'successful unparseable output remains detected without a version');
    }

    for (const code of ['EINVAL', 'ETIMEDOUT', 'NON_ZERO_EXIT']) {
      __configureClientInventoryForTests({
        platform: 'linux',
        platforms: { 'claude-code': fakePlatform('Claude Code') },
        now: () => 400,
        execFile: (_file, _args, _options, callback) => {
          callback(failingError(code), '', '');
        },
      });
      const inventory = await detectMcpClientInventory();
      assert.deepEqual(inventory['claude-code'], {
        detected: false,
        configPath: null,
        checkedAt: 400,
      }, `${code} falls through to an honest not-detected record`);
    }

    {
      let execCount = 0;
      __configureClientInventoryForTests({
        platform: 'linux',
        platforms: { 'claude-code': fakePlatform('Claude Code') },
        execFile: (_file, _args, _options, callback) => {
          execCount += 1;
          callback(null, '1.2.3', '');
        },
      });
      const first = detectMcpClientInventory();
      const second = detectMcpClientInventory();
      assert.strictEqual(first, second, 'the process-lifetime inventory Promise is memoized');
      await Promise.all([first, second]);
      assert.equal(execCount, 1, 'memoization performs one probe sweep');
    }

    {
      const platforms = {
        cursor: { detected: true, configPath: '/fixture/cursor.json', checkedAt: 500 },
      };
      __configureClientInventoryForTests({
        platforms: { cursor: fakePlatform('Cursor') },
        now: () => 500,
        resolvePlatformTarget: (key) => ({
          platformKey: key,
          platform: fakePlatform('Cursor'),
          configPath: '/fixture/cursor.json',
          targetLabel: 'Cursor',
          variant: null,
          detected: true,
        }),
      });

      const bridgeCalls = [];
      const diagnosticCalls = [];
      const originalConsoleError = console.error;
      console.error = (...args) => diagnosticCalls.push(args.join(' '));
      try {
        await pushMcpClientInventory({
          sendAndWait: async (message, options) => {
            bridgeCalls.push({ message, options });
            throw new Error('Unknown MCP message type secret_should_not_be_logged');
          },
        });
      } finally {
        console.error = originalConsoleError;
      }

      assert.deepEqual(bridgeCalls, [{
        message: { type: 'system:client-inventory', payload: { platforms } },
        options: { timeout: 3000 },
      }], 'the tolerant system frame uses the fixed payload and timeout');
      assert.equal(diagnosticCalls.length, 1, 'push failure emits one diagnostic');
      assert.equal(diagnosticCalls[0].includes('secret_should_not_be_logged'), false, 'diagnostic is redacted');
    }

    {
      const scope = new AgentScope();
      const bridge = new MockRegisterBridge();
      const platforms = {
        codex: { detected: true, configPath: '/fixture/config.toml', checkedAt: 600 },
      };
      scope.setClientInventorySupplier(async () => platforms);
      await scope.ensure(bridge);
      assert.deepEqual(bridge.calls[0].message, {
        type: 'agent:register',
        payload: { platforms },
      }, 'agent registration piggybacks the resolved non-empty inventory');

      const legacyScope = new AgentScope();
      const legacyBridge = new MockRegisterBridge();
      await legacyScope.ensure(legacyBridge);
      assert.deepEqual(legacyBridge.calls[0].message, {
        type: 'agent:register',
        payload: {},
      }, 'a bare AgentScope keeps the exact legacy payload');
    }

    const typesSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'types.ts'), 'utf8');
    assert.match(typesSource, /\| 'system:client-inventory'/);
    assert.match(typesSource, /type: 'mcp:result' \| 'mcp:progress' \| 'mcp:error';/);

    const indexSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'index.ts'), 'utf8');
    assert.match(
      indexSource,
      /await runtime\.bridge\.connect\(\);\s*void pushMcpClientInventory\(runtime\.bridge\);/,
      'stdio pushes inventory immediately after bridge connect',
    );
    assert.match(
      indexSource,
      /await bridge\.connect\(\);\s*void pushMcpClientInventory\(bridge\);/,
      'serve mode pushes inventory immediately after bridge connect',
    );

    console.log('mcp-client-inventory.test.js: PASS');
  } finally {
    __configureClientInventoryForTests(null);
  }
}

main().catch((error) => {
  console.error('mcp-client-inventory.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
