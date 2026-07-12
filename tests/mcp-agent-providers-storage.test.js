'use strict';

/**
 * Phase 57 Plan 02 -- durable MCP-agent provider evidence contracts.
 *
 * Run: node tests/mcp-agent-providers-storage.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const providersPath = path.join(repoRoot, 'extension', 'utils', 'mcp-agent-providers.js');
const registryPath = require.resolve('../extension/utils/agent-registry.js');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');

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
  delete globalThis.FsbMcpAgentProviders;
  try { delete require.cache[require.resolve(providersPath)]; } catch (_e) { /* fresh */ }
  require(providersPath);
  return globalThis.FsbMcpAgentProviders;
}

function freshRegistry() {
  delete require.cache[registryPath];
  return require(registryPath);
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
      connected: { claude: { name: 'Claude' } },
      installed: { codex: { detected: false } },
      schemaHint: { keep: true }
    }, 'a mutation preserves both sibling maps and unknown envelope keys');
    await assert.rejects(
      providers.mutateSubmap('other', () => {}),
      /Unknown MCP agent provider submap/,
      'unknown submaps reject'
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
      await providers.recordConnected('agent_two', { name: 'Claude Code', version: '2.1.178' });
      await providers.recordConnected('agent_three', { version: ' 3.4.5 ' });
    } finally {
      Date.now = originalNow;
    }
    const connected = localArea.dump().fsbAgentProviders.connected;
    assert.deepEqual(Object.keys(connected).sort(), ['claudecode', 'unknown:3.4.5']);
    assert.deepEqual(connected.claudecode, {
      name: 'Claude Code',
      version: '2.1.178',
      lastSeenAt: 200
    }, 'reconnect overwrites one stable name key and refreshes lastSeenAt');
    assert.deepEqual(connected['unknown:3.4.5'], {
      name: '',
      version: ' 3.4.5 ',
      lastSeenAt: 200
    }, 'version-only identity uses the normalized unknown fallback key');
    assert.equal(Array.isArray(connected.claudecode), false, 'connected evidence is never an append-only array');
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
      connected: { claude: { name: 'Claude' } },
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

  delete globalThis.FsbMcpAgentProviders;
  delete globalThis.chrome;
  console.log('mcp-agent-providers-storage tests passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
