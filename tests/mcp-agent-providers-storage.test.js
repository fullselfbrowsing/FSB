'use strict';

/**
 * Phase 57 Plan 02 -- durable MCP-agent provider evidence contracts.
 *
 * Run: node tests/mcp-agent-providers-storage.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const aliasesPath = path.join(repoRoot, 'extension', 'utils', 'mcp-client-aliases.js');
const providersPath = path.join(repoRoot, 'extension', 'utils', 'mcp-agent-providers.js');
const registryPath = require.resolve('../extension/utils/agent-registry.js');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const dispatcherPath = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
const bridgePath = path.join(repoRoot, 'extension', 'ws', 'mcp-bridge-client.js');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createStorageArea(initial, options = {}) {
  const store = clone(initial || {});
  return {
    async get(keys) {
      if (options.rejectGet) throw new Error('storage get rejected');
      if (keys == null) return clone(store);
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const key of list) {
        if (Object.prototype.hasOwnProperty.call(store, key)) out[key] = clone(store[key]);
      }
      return out;
    },
    async set(values) {
      if (options.rejectSet) throw new Error('storage set rejected');
      Object.assign(store, clone(values));
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete store[key];
    },
    dump() {
      return clone(store);
    }
  };
}

function installChrome({ local, session, localOptions, sessionOptions, tabs } = {}) {
  const localArea = createStorageArea(local, localOptions);
  const sessionArea = createStorageArea(session, sessionOptions);
  globalThis.chrome = {
    storage: {
      local: localArea,
      session: sessionArea
    },
    tabs: {
      async query() { return clone(tabs || []); },
      async get(tabId) {
        const tab = (tabs || []).find((candidate) => candidate.id === tabId);
        if (!tab) throw new Error('tab not found');
        return clone(tab);
      }
    }
  };
  return { localArea, sessionArea };
}

function freshProviders() {
  delete globalThis.FsbMcpClientAliases;
  delete globalThis.FsbMcpAgentProviders;
  try { delete require.cache[require.resolve(aliasesPath)]; } catch (_e) { /* fresh */ }
  try { delete require.cache[require.resolve(providersPath)]; } catch (_e) { /* fresh */ }
  require(aliasesPath);
  require(providersPath);
  return globalThis.FsbMcpAgentProviders;
}

function freshRegistry() {
  delete require.cache[registryPath];
  return require(registryPath);
}

function freshDispatcher() {
  delete require.cache[dispatcherPath];
  return require(dispatcherPath);
}

function loadBridgeHarness() {
  class FakeWebSocket {}
  FakeWebSocket.OPEN = 1;
  FakeWebSocket.CONNECTING = 0;
  const context = {
    chrome: globalThis.chrome,
    WebSocket: FakeWebSocket,
    console,
    Math,
    Date,
    EventTarget,
    CustomEvent: globalThis.CustomEvent || class CustomEvent {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    dispatchMcpMessageRoute: async () => ({ success: true })
  };
  context.globalThis = context;
  const aliasesSource = fs.readFileSync(aliasesPath, 'utf8');
  const providersSource = fs.readFileSync(providersPath, 'utf8');
  const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
  vm.runInNewContext(
    `${aliasesSource}\n${providersSource}\n${bridgeSource}\nthis.__bridgeClient = mcpBridgeClient;`,
    context,
    { filename: 'mcp-agent-providers-bridge-harness.js' }
  );
  return { context, client: context.__bridgeClient };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  assert.equal(fs.existsSync(providersPath), true, 'provider storage helper exists');

  {
    installChrome();
    const providers = freshProviders();
    assert.deepEqual(await providers.read(), {
      clicked: {},
      connected: {},
      installed: {}
    }, 'missing storage normalizes to the default envelope');
    assert.deepEqual(Object.keys(providers).sort(), [
      'mutateSubmap',
      'read',
      'recordConnected',
      'replaceInstalled'
    ], 'classic script exposes only the four-method provider API');
  }

  {
    const initial = {
      fsbAgentProviders: {
        clicked: { cursor: { count: 1 } },
        connected: { claude: { name: 'Claude' } },
        installed: { codex: { detected: false } },
        schemaHint: { keep: true }
      }
    };
    const { localArea } = installChrome({ local: initial });
    const providers = freshProviders();
    await providers.mutateSubmap('clicked', (clicked) => {
      clicked.cursor = { count: 2 };
      clicked.vscode = { count: 1 };
    });
    assert.deepEqual(localArea.dump().fsbAgentProviders, {
      clicked: { cursor: { count: 2 }, vscode: { count: 1 } },
      connected: { 'claude-code': { name: 'Claude' } },
      installed: { codex: { detected: false } },
      schemaHint: { keep: true }
    }, 'a mutation preserves both sibling maps and unknown envelope keys');
    await assert.rejects(
      providers.mutateSubmap('other', () => {}),
      /Unknown MCP agent provider submap/,
      'unknown submaps reject'
    );
    await assert.rejects(
      providers.mutateSubmap('__proto__', () => {}),
      /Unknown MCP agent provider submap/,
      'inherited property names cannot bypass the submap allowlist'
    );
  }

  {
    const { localArea } = installChrome();
    const providers = freshProviders();
    let firstEntered = false;
    const first = providers.mutateSubmap('clicked', async (clicked) => {
      firstEntered = true;
      await new Promise((resolve) => setTimeout(resolve, 15));
      clicked.cursor = { count: 1 };
    });
    const second = providers.mutateSubmap('clicked', (clicked) => {
      assert.equal(firstEntered, true, 'second writer starts after the first entered');
      clicked.codex = { count: 1 };
    });
    await Promise.all([first, second]);
    assert.deepEqual(localArea.dump().fsbAgentProviders.clicked, {
      cursor: { count: 1 },
      codex: { count: 1 }
    }, 'the Promise-chain mutex serializes concurrent writers without lost updates');
  }

  {
    const { localArea } = installChrome();
    const providers = freshProviders();
    const originalNow = Date.now;
    try {
      Date.now = () => 100;
      await providers.recordConnected('agent_one', { name: 'Claude Code', version: '2.1.177' });
      Date.now = () => 200;
      await providers.recordConnected('agent_two', { name: 'Anthropic Claude', version: '2.1.178' });
      Date.now = () => 150;
      await providers.recordConnected('agent_stale', { name: 'Claude', version: '2.1.176' });
      Date.now = () => 250;
      await providers.recordConnected('agent_three', { version: ' 3.4.5 ' });
    } finally {
      Date.now = originalNow;
    }
    const connected = localArea.dump().fsbAgentProviders.connected;
    assert.deepEqual(Object.keys(connected).sort(), ['claude-code', 'raw:unknown:3.4.5']);
    assert.deepEqual(connected['claude-code'], {
      name: 'Anthropic Claude',
      version: '2.1.178',
      lastSeenAt: 200
    }, 'known aliases converge on one canonical row and retain the newest evidence');
    assert.deepEqual(connected['raw:unknown:3.4.5'], {
      name: '',
      version: ' 3.4.5 ',
      lastSeenAt: 250
    }, 'version-only identity uses a namespaced raw fallback key');
    assert.equal(Array.isArray(connected['claude-code']), false,
      'connected evidence is never an append-only array');
  }

  {
    installChrome({
      local: {
        fsbAgentProviders: {
          clicked: {},
          installed: {},
          connected: {
            claude: { name: 'Claude', version: 'old', lastSeenAt: 100 },
            claudecode: { name: 'Claude Code', version: 'newest', lastSeenAt: 300 },
            'claude-code': { name: 'Anthropic Claude', version: 'middle', lastSeenAt: 200 },
            invalidTime: { name: 'Claude', version: 'invalid', lastSeenAt: '400' }
          }
        }
      }
    });
    const providers = freshProviders();
    const connected = (await providers.read()).connected;
    assert.deepEqual(Object.keys(connected), ['claude-code'],
      'legacy alias keys coalesce into one canonical row on read');
    assert.deepEqual(connected['claude-code'], {
      name: 'Claude Code',
      version: 'newest',
      lastSeenAt: 300
    }, 'legacy coalescing retains the record with the greatest finite lastSeenAt');
  }

  {
    const { localArea } = installChrome();
    const providers = freshProviders();
    const installedInput = JSON.parse(
      '{"__proto__":{"detected":false,"configPath":null,"checkedAt":1}}'
    );
    const installedInputPrototype = Object.getPrototypeOf(installedInput);

    await providers.recordConnected('agent_proto', { name: '__proto__', version: '1.0.0' });
    await providers.replaceInstalled(installedInput);

    const stored = localArea.dump().fsbAgentProviders;
    const envelope = await providers.read();
    assert.equal(Object.prototype.hasOwnProperty.call(stored.connected, 'raw:proto'), true,
      'a special connected name survives under its safe raw namespace');
    assert.equal(Object.prototype.hasOwnProperty.call(stored.installed, '__proto__'), true,
      'a JSON-supplied __proto__ platform id survives as durable installed evidence');
    assert.deepEqual(stored.installed['__proto__'], {
      detected: false,
      configPath: null,
      checkedAt: 1
    }, 'the __proto__ installed record remains intact');
    assert.equal(Object.getOwnPropertyDescriptor(envelope.installed, '__proto__').enumerable, true,
      'the special installed id remains an enumerable own property after normalization');
    assert.equal(Object.getPrototypeOf(envelope.connected), Object.prototype,
      'connected evidence does not replace its map prototype');
    assert.equal(Object.getPrototypeOf(envelope.installed), Object.prototype,
      'installed evidence does not replace its map prototype');
    assert.equal(Object.getPrototypeOf(installedInput), installedInputPrototype,
      'normalizing untrusted platform ids does not mutate the caller map prototype');
  }

  {
    const initial = {
      fsbAgentProviders: {
        clicked: { cursor: { count: 4 } },
        connected: { claude: { name: 'Claude' } },
        installed: { stale: { detected: true } },
        futureField: 'preserve'
      }
    };
    const { localArea } = installChrome({ local: initial });
    const providers = freshProviders();
    await providers.replaceInstalled({
      cursor: {
        detected: true,
        configPath: '/tmp/cursor.json',
        version: '1.2.3',
        checkedAt: 300,
        ignored: 'drop'
      },
      codex: {
        detected: false,
        configPath: null,
        version: 123,
        checkedAt: 301
      },
      badDetected: { detected: 'yes', configPath: null, checkedAt: 302 },
      badPath: { detected: true, configPath: 42, checkedAt: 303 },
      badTime: { detected: true, configPath: null, checkedAt: Infinity },
      badRecord: []
    });
    assert.deepEqual(localArea.dump().fsbAgentProviders, {
      clicked: { cursor: { count: 4 } },
      connected: { 'claude-code': { name: 'Claude' } },
      installed: {
        cursor: {
          detected: true,
          configPath: '/tmp/cursor.json',
          checkedAt: 300,
          version: '1.2.3'
        },
        codex: {
          detected: false,
          configPath: null,
          checkedAt: 301
        }
      },
      futureField: 'preserve'
    }, 'installed replacement validates records, drops malformed fields, and preserves siblings');

    const reloaded = freshProviders();
    assert.deepEqual(await reloaded.read(), localArea.dump().fsbAgentProviders,
      'a fresh classic-script load re-reads the durable envelope');
  }

  {
    const { sessionArea } = installChrome();
    const { AgentRegistry } = freshRegistry();
    const registry = new AgentRegistry();
    const minted = await registry.registerAgent();
    assert.equal(registry.stampClientInfo(minted.agentId, {
      name: 'Claude Code',
      version: '2.1.177',
      unknown: 'drop'
    }), true);
    assert.equal(registry.stampClientInfo(minted.agentId, []), false);
    assert.equal(registry.stampClientInfo(minted.agentId, { unknown: 'drop' }), false);
    await tick();
    const persisted = sessionArea.dump().fsbAgentRegistry.records[minted.agentId];
    assert.deepEqual(persisted.clientInfo, {
      name: 'Claude Code',
      version: '2.1.177'
    }, 'clientInfo persistence copies only name/version strings');

    const { AgentRegistry: ReloadedRegistry } = freshRegistry();
    const reloaded = new ReloadedRegistry();
    await reloaded.hydrate();
    assert.deepEqual(reloaded.listAgents()[0].clientInfo, {
      name: 'Claude Code',
      version: '2.1.177'
    }, 'clientInfo survives a fresh registry hydration');
  }

  {
    installChrome({
      session: {
        fsbAgentRegistry: {
          v: 1,
          records: {
            agent_legacy: { agentId: 'agent_legacy', createdAt: 1, tabIds: [] }
          }
        }
      }
    });
    const { AgentRegistry } = freshRegistry();
    const registry = new AgentRegistry();
    await registry.hydrate();
    assert.equal(Object.prototype.hasOwnProperty.call(registry.listAgents()[0], 'clientInfo'), false,
      'legacy records hydrate without a synthetic clientInfo property');

    registry._persist = () => Promise.reject(new Error('persist failed'));
    assert.doesNotThrow(() => registry.stampClientInfo('agent_legacy', { name: 'Cursor' }),
      'stampClientInfo never throws on async persistence failure');
    registry._persist = () => { throw new Error('sync persist failed'); };
    assert.equal(registry.stampClientInfo('agent_legacy', { version: '1.0.0' }), true,
      'stampClientInfo never throws on synchronous persistence failure');
  }

  {
    const source = fs.readFileSync(backgroundPath, 'utf8');
    const registryImport = source.indexOf("importScripts('utils/agent-registry.js')");
    const providersImport = source.indexOf("importScripts('utils/mcp-agent-providers.js')");
    const dispatcherImport = source.indexOf("importScripts('ws/mcp-tool-dispatcher.js')");
    const bridgeImport = source.indexOf("importScripts('ws/mcp-bridge-client.js')");
    assert.ok(registryImport >= 0 && providersImport > registryImport,
      'provider helper imports after agent-registry');
    assert.ok(providersImport < dispatcherImport && providersImport < bridgeImport,
      'provider helper imports before dispatcher and bridge evaluation');
  }

  {
    const { localArea } = installChrome();
    const providers = freshProviders();
    const stampCalls = [];
    const forbiddenOwnershipCalls = [];
    const mintedIds = ['agent_identity_1', 'agent_identity_2', 'agent_identity_3'];
    const registry = {
      async registerAgent() {
        const agentId = mintedIds.shift();
        return { agentId, agentIdShort: agentId };
      },
      stampConnectionId() { return true; },
      stampClientInfo(agentId, clientInfo) {
        stampCalls.push({ agentId, clientInfo: clone(clientInfo) });
        return true;
      },
      isOwnedBy() { forbiddenOwnershipCalls.push('isOwnedBy'); throw new Error('identity reached ownership'); },
      getOwner() { forbiddenOwnershipCalls.push('getOwner'); throw new Error('identity reached ownership'); }
    };
    globalThis.fsbAgentRegistryInstance = registry;
    globalThis.FsbMcpAgentProviders = providers;
    const { handleAgentRegisterRoute } = freshDispatcher();

    const longName = 'N'.repeat(240);
    const longVersion = 'V'.repeat(240);
    const firstResponse = await handleAgentRegisterRoute({
      payload: {
        agentId: 'attacker-supplied',
        connectionId: 'connection-identity-1',
        clientInfo: { name: longName, version: longVersion, authority: 'admin' },
        platforms: {
          cursor: { detected: true, configPath: '/tmp/cursor.json', checkedAt: 400 }
        }
      }
    });
    assert.deepEqual(firstResponse, {
      success: true,
      agentId: 'agent_identity_1',
      agentIdShort: 'agent_identity_1',
      ownershipTokens: {},
      connectionId: 'connection-identity-1'
    }, 'registration response remains the exact legacy/additive connectionId shape');
    assert.deepEqual(stampCalls[0], {
      agentId: 'agent_identity_1',
      clientInfo: { name: 'N'.repeat(200), version: 'V'.repeat(200) }
    }, 'dispatcher caps both identity strings at 200 and drops unknown fields');

    await handleAgentRegisterRoute({ payload: { clientInfo: { name: 'Cursor', ignored: true } } });
    await handleAgentRegisterRoute({ payload: { clientInfo: { version: '0.142.5', ignored: true } } });
    await providers.mutateSubmap('clicked', (clicked) => clicked);
    assert.deepEqual(stampCalls.slice(1), [
      { agentId: 'agent_identity_2', clientInfo: { name: 'Cursor' } },
      { agentId: 'agent_identity_3', clientInfo: { version: '0.142.5' } }
    ], 'name-only and version-only identities remain valid sanitized evidence');
    assert.deepEqual(forbiddenOwnershipCalls, [], 'clientInfo never enters ownership checks');

    const envelope = localArea.dump().fsbAgentProviders;
    assert.deepEqual(envelope.installed, {
      cursor: { detected: true, configPath: '/tmp/cursor.json', checkedAt: 400 }
    }, 'agent:register platforms piggyback reaches the installed map');
    assert.equal(Object.keys(envelope.connected).includes('cursor'), true,
      'name-only connected identity is recorded');
    assert.equal(Object.keys(envelope.connected).includes('raw:unknown:0.142.5'), true,
      'version-only connected identity is recorded');
  }

  {
    installChrome({ localOptions: { rejectSet: true } });
    const providers = freshProviders();
    globalThis.FsbMcpAgentProviders = providers;
    globalThis.fsbAgentRegistryInstance = {
      async registerAgent() {
        return { agentId: 'agent_storage_failure', agentIdShort: 'agent_storage_failure' };
      },
      stampConnectionId() { return true; },
      stampClientInfo() { return true; }
    };
    const { handleAgentRegisterRoute } = freshDispatcher();
    const response = await handleAgentRegisterRoute({
      payload: {
        connectionId: 'connection-storage-failure',
        clientInfo: { name: 'Claude Code' },
        platforms: {
          codex: { detected: true, configPath: null, checkedAt: 500 }
        }
      }
    });
    assert.deepEqual(response, {
      success: true,
      agentId: 'agent_storage_failure',
      agentIdShort: 'agent_storage_failure',
      ownershipTokens: {},
      connectionId: 'connection-storage-failure'
    }, 'storage/helper rejection leaves successful registration byte-stable');
    await tick();
  }

  {
    const { localArea } = installChrome({
      local: {
        fsbAgentProviders: {
          clicked: { cursor: { count: 1 } },
          connected: { cursor: { name: 'Cursor' } },
          installed: { stale: { detected: true } },
          unknownSibling: 'keep'
        }
      }
    });
    const harness = loadBridgeHarness();
    const validPayload = vm.runInNewContext(`({ platforms: {
      codex: { detected: true, configPath: null, version: '0.142.5', checkedAt: 600 }
    } })`, harness.context);
    const accepted = await harness.client._routeMessage('system:client-inventory', validPayload, 'inventory-1');
    assert.deepEqual(clone(accepted), { accepted: true }, 'system inventory route returns accepted:true');
    assert.deepEqual(localArea.dump().fsbAgentProviders, {
      clicked: { cursor: { count: 1 } },
      connected: { cursor: { name: 'Cursor' } },
      installed: {
        codex: { detected: true, configPath: null, checkedAt: 600, version: '0.142.5' }
      },
      unknownSibling: 'keep'
    }, 'system frame converges through replaceInstalled without clobbering siblings');

    harness.client._ws = {
      readyState: 1,
      sent: [],
      send(value) { this.sent.push(value); }
    };
    await harness.client._handleMessage(JSON.stringify({
      id: 'inventory-bad',
      type: 'system:client-inventory',
      payload: { platforms: [] }
    }));
    const errorFrame = JSON.parse(harness.client._ws.sent[0]);
    assert.deepEqual(errorFrame, {
      id: 'inventory-bad',
      type: 'mcp:error',
      payload: { success: false, error: 'Invalid MCP client inventory payload' }
    }, 'malformed inventory becomes a bounded existing error response');

    vm.runInNewContext('delete globalThis.FsbMcpAgentProviders;', harness.context);
    const unavailablePayload = vm.runInNewContext('({ platforms: {} })', harness.context);
    await assert.rejects(
      harness.client._routeMessage('system:client-inventory', unavailablePayload, 'inventory-2'),
      /MCP client inventory storage unavailable/,
      'missing provider helper rejects with a bounded error'
    );
  }

  delete globalThis.FsbMcpAgentProviders;
  delete globalThis.fsbAgentRegistryInstance;
  delete globalThis.chrome;
  console.log('mcp-agent-providers-storage tests passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
