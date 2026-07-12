'use strict';

/**
 * Phase 57 Plan 03 -- canonical MCP-client aliases and merged evidence view.
 *
 * Run: node tests/mcp-client-merged-view.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const aliasesPath = path.join(repoRoot, 'extension', 'utils', 'mcp-client-aliases.js');
const providersPath = path.join(repoRoot, 'extension', 'utils', 'mcp-agent-providers.js');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const aliasesSource = fs.readFileSync(aliasesPath, 'utf8');
const providersSource = fs.readFileSync(providersPath, 'utf8');
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function plain(value) {
  return clone(value);
}

function createStorage(initial) {
  let store = clone(initial || {});
  let reads = 0;
  return {
    area: {
      async get(keys) {
        reads++;
        const list = Array.isArray(keys) ? keys : [keys];
        const result = {};
        for (const key of list) {
          if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = clone(store[key]);
        }
        return result;
      },
      async set(values) {
        Object.assign(store, clone(values));
      }
    },
    replace(next) {
      store = clone(next || {});
    },
    get readCount() {
      return reads;
    }
  };
}

function createHarness(initial) {
  const storage = createStorage(initial);
  const context = {
    chrome: { storage: { local: storage.area } },
    console,
    Object,
    Array,
    String,
    Date,
    Promise
  };
  context.globalThis = context;
  vm.runInNewContext(`${aliasesSource}\n${providersSource}`, context, {
    filename: 'mcp-client-merged-view-harness.js'
  });
  return {
    aliases: context.FsbMcpClientAliases,
    providers: context.FsbMcpAgentProviders,
    storage
  };
}

function assertExactRow(row, expected, message) {
  assert.deepEqual(Object.keys(row), [
    'id',
    'raw',
    'displayName',
    'clicked',
    'installed',
    'connected',
    'live'
  ], `${message}: exact row keys`);
  assert.deepEqual(plain(row), expected, message);
}

async function main() {
  assert.equal(fs.existsSync(aliasesPath), true, 'alias helper exists');
  const emptyHarness = createHarness();
  const { aliases } = emptyHarness;

  const aliasesExpected = new Map([
    ['claude', 'claude-code'],
    ['claudecode', 'claude-code'],
    ['anthropicclaude', 'claude-code'],
    ['claudedesktop', 'claude-desktop'],
    ['cursor', 'cursor'],
    ['visualstudiocode', 'vscode'],
    ['vscode', 'vscode'],
    ['windsurf', 'windsurf'],
    ['codex', 'codex'],
    ['openaicodex', 'codex'],
    ['codexcli', 'codex'],
    ['opencode', 'opencode'],
    ['opencodecli', 'opencode'],
    ['openclaw', 'openclaw']
  ]);
  for (const [name, expected] of aliasesExpected) {
    assert.equal(aliases.resolveMcpClientAlias(name), expected, `${name} resolves explicitly`);
  }
  assert.equal(aliases.normalizeMcpClientName('  Open_Code-CLI  '), 'opencodecli',
    'normalization strips separator drift, case, and outer whitespace');
  assert.equal(aliases.resolveMcpClientAlias('  OPEN_Code-CLI  '), 'opencode',
    'separator and case drift still requires an explicit normalized alias');
  for (const lookalike of ['myclaude', 'cursor-beta', 'thecodexclient', 'gemini', 'gemini-cli']) {
    assert.equal(aliases.resolveMcpClientAlias(lookalike), null,
      `${lookalike} remains outside the closed alias vocabulary`);
  }
  assert.equal(Object.isFrozen(aliases), true, 'exported alias API is frozen');
  assert.match(aliasesSource, /Object\.freeze\(\{/, 'alias table is source-frozen');
  assert.doesNotMatch(aliasesSource, /gemini\s*:/, 'Gemini has no alias-table row');

  const clickedCursor = { count: 2, firstClickedAt: 10, lastClickedAt: 20, source: 'fan' };
  const installedVscode = { detected: true, configPath: '/tmp/code', checkedAt: 30 };
  const staleCodex = { detected: false, configPath: null, version: '0.142.5', checkedAt: 1 };
  const connectedClaude = { name: 'Anthropic Claude', version: '2.1.177', lastSeenAt: 40 };
  const connectedUnknown = { name: 'Novel_Agent', version: '9.0.0', lastSeenAt: 41 };
  const liveClaude = {
    agentId: 'agent_claude',
    tabIds: [4],
    clientInfo: { name: 'Claude-Code', version: '2.1.178' }
  };
  const liveOnly = {
    agentId: 'agent_openclaw',
    tabIds: [],
    clientInfo: { name: 'OpenClaw', version: '2026.7' }
  };
  const harness = createHarness({
    fsbAgentProviders: {
      clicked: { cursor: clickedCursor },
      installed: { vscode: installedVscode, codex: staleCodex },
      connected: {
        claude: connectedClaude,
        novel: connectedUnknown
      }
    }
  });
  const merged = await harness.providers.getMergedClients([liveClaude, liveOnly]);

  assert.deepEqual(Object.keys(merged), [
    'cursor',
    'codex',
    'vscode',
    'claude-code',
    'raw:novelagent',
    'openclaw'
  ], 'union keys are deterministic across clicked, installed, connected, and live evidence');
  assertExactRow(merged.cursor, {
    id: 'cursor',
    raw: false,
    displayName: 'cursor',
    clicked: clickedCursor,
    installed: null,
    connected: null,
    live: null
  }, 'clicked-only evidence remains separate');
  assertExactRow(merged.vscode, {
    id: 'vscode',
    raw: false,
    displayName: 'vscode',
    clicked: null,
    installed: installedVscode,
    connected: null,
    live: null
  }, 'installed-only evidence remains separate');
  assertExactRow(merged.codex, {
    id: 'codex',
    raw: false,
    displayName: 'codex',
    clicked: null,
    installed: staleCodex,
    connected: null,
    live: null
  }, 'stale installed checkedAt is preserved without interpretation');
  assertExactRow(merged['claude-code'], {
    id: 'claude-code',
    raw: false,
    displayName: 'Anthropic Claude',
    clicked: null,
    installed: null,
    connected: connectedClaude,
    live: liveClaude
  }, 'connected and live alias evidence joins without flattening');
  assertExactRow(merged['raw:novelagent'], {
    id: 'raw:novelagent',
    raw: true,
    displayName: 'Novel_Agent',
    clicked: null,
    installed: null,
    connected: connectedUnknown,
    live: null
  }, 'unknown identity remains visible and inherits no durable authority evidence');
  assertExactRow(merged.openclaw, {
    id: 'openclaw',
    raw: false,
    displayName: 'OpenClaw',
    clicked: null,
    installed: null,
    connected: null,
    live: liveOnly
  }, 'live-only evidence is represented');
  assert.equal(Object.prototype.hasOwnProperty.call(merged, 'gemini'), false,
    'Gemini is not synthesized into a canonical row');

  for (const row of Object.values(merged)) {
    for (const forbidden of ['tier', 'recommendation', 'recommended', 'selectedProvider', 'provider']) {
      assert.equal(Object.prototype.hasOwnProperty.call(row, forbidden), false,
        `merged rows do not derive ${forbidden}`);
    }
  }

  const reconnectHarness = createHarness({
    fsbAgentProviders: {
      clicked: { codex: { count: 1 } },
      installed: { codex: { detected: true, configPath: null, checkedAt: 50 } },
      connected: {
        codexcli: { name: 'Codex CLI', version: '0.2', lastSeenAt: 52 }
      }
    }
  });
  let reconnectMerged = await reconnectHarness.providers.getMergedClients([]);
  assert.deepEqual(Object.keys(reconnectMerged), ['codex'], 'reconnection evidence produces one canonical row');
  reconnectHarness.storage.replace({
    fsbAgentProviders: {
      clicked: { codex: { count: 1 } },
      installed: { codex: { detected: true, configPath: null, checkedAt: 50 } },
      connected: {
        codexcli: { name: 'OpenAI Codex', version: '0.3', lastSeenAt: 60 }
      }
    }
  });
  reconnectMerged = await reconnectHarness.providers.getMergedClients([]);
  assert.equal(reconnectMerged.codex.connected.version, '0.3', 'fresh query observes reconnect overwrite');
  assert.equal(reconnectMerged.codex.connected.lastSeenAt, 60, 'fresh query observes refreshed lastSeenAt');
  assert.equal(reconnectHarness.storage.readCount, 2, 'every merge performs a fresh durable storage read');

  reconnectHarness.storage.replace({
    fsbAgentProviders: {
      clicked: { opencode: { count: 3 } },
      installed: {},
      connected: {}
    }
  });
  const evictedHarness = createHarness();
  evictedHarness.storage.area.get = reconnectHarness.storage.area.get;
  const rehydrated = await evictedHarness.providers.getMergedClients([]);
  assert.equal(rehydrated.opencode.clicked.count, 3,
    'a fresh service-worker helper instance rehydrates current durable evidence');

  const rawHarness = createHarness({
    fsbAgentProviders: {
      clicked: { cursor: { count: 1 } },
      installed: { cursor: { detected: true, configPath: null, checkedAt: 70 } },
      connected: {
        empty: { name: '___', version: '1', lastSeenAt: 71 },
        gemini: { name: 'Gemini CLI', version: '2', lastSeenAt: 72 }
      }
    }
  });
  const rawMerged = await rawHarness.providers.getMergedClients([
    { agentId: 'unknown-live', clientInfo: { name: '---', version: '3' } },
    { agentId: 'gemini-live', clientInfo: { name: 'Gemini_CLI', version: '4' } },
    { agentId: 'legacy-no-identity' }
  ]);
  assert.deepEqual(Object.keys(rawMerged), [
    'cursor',
    'raw:unknown-0',
    'raw:geminicli',
    'raw:unknown-1'
  ], 'unknown empty identities receive stable unique keys and normalized unknown names join raw-only');
  assert.equal(rawMerged['raw:geminicli'].raw, true, 'Gemini identity remains raw');
  assert.equal(rawMerged['raw:geminicli'].connected.name, 'Gemini CLI');
  assert.equal(rawMerged['raw:geminicli'].live.clientInfo.name, 'Gemini_CLI');
  assert.equal(rawMerged['raw:geminicli'].clicked, null);
  assert.equal(rawMerged['raw:geminicli'].installed, null);

  const aliasesImport = backgroundSource.indexOf("importScripts('utils/mcp-client-aliases.js')");
  const providersImport = backgroundSource.indexOf("importScripts('utils/mcp-agent-providers.js')");
  assert.ok(aliasesImport >= 0 && aliasesImport < providersImport,
    'background loads aliases immediately before provider merge helper');
  const afterAliasesImport = aliasesImport + "importScripts('utils/mcp-client-aliases.js')".length;
  assert.equal(
    backgroundSource.slice(afterAliasesImport, providersImport).includes("importScripts('utils/"),
    false,
    'no utility import interrupts alias-before-provider load order'
  );

  console.log('mcp-client-merged-view.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-client-merged-view.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
