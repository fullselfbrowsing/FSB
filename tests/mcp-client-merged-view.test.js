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
  let rejected = false;
  return {
    area: {
      async get(keys) {
        if (rejected) throw new Error('sensitive storage failure');
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
    setRejected(value) {
      rejected = value === true;
    },
    get readCount() {
      return reads;
    }
  };
}

function extractBackgroundRouter() {
  const startMarker = 'const fsbHandleRuntimeMessage = (request, sender, sendResponse) => {';
  const endMarker = '\nchrome.runtime.onMessage.addListener(fsbHandleRuntimeMessage);';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'background router source can be extracted');
  return backgroundSource.slice(start, end);
}

function extractInternalDispatcher() {
  const startMarker = 'function fsbDispatchInternalMessage(request) {';
  const endMarker = '\n\nif (typeof globalThis !== \'undefined\') {';
  const start = backgroundSource.indexOf(startMarker);
  const end = backgroundSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'internal dispatcher source can be extracted');
  return backgroundSource.slice(start, end);
}

function createRuntimeHarness(initial, options = {}) {
  const storage = createStorage(initial);
  const context = {
    chrome: {
      runtime: { id: 'mcp-client-test-extension' },
      storage: { local: storage.area }
    },
    console,
    Object,
    Array,
    String,
    Date,
    Promise,
    setTimeout,
    clearTimeout,
    armMcpBridge() {},
    fsbHandleDelegationCommand() { return null; },
    automationLogger: { logComm() {} }
  };
  context.globalThis = context;
  if (Object.prototype.hasOwnProperty.call(options, 'registry')) {
    context.fsbAgentRegistryInstance = options.registry;
  }
  context.fsbReadCachedMcpClients = async () => {
    const registry = context.fsbAgentRegistryInstance;
    const liveRecords = registry && typeof registry.listAgents === 'function'
      ? await Promise.resolve(registry.listAgents())
      : [];
    const clients = await context.FsbMcpAgentProviders.getMergedClients(liveRecords);
    return { clients, refreshOutcome: 'unavailable', compatibilityExpiresAt: null };
  };
  vm.runInNewContext(
    `${aliasesSource}\n${providersSource}\n${extractBackgroundRouter()}\n` +
      `const FSB_INTERNAL_DISPATCH_TIMEOUT_MS = 20000;\n${extractInternalDispatcher()}\n` +
      'this.__runtimeHandler = fsbHandleRuntimeMessage;\n' +
      'this.__internalDispatch = fsbDispatchInternalMessage;',
    context,
    { filename: 'background.js#getMcpClients-harness' }
  );
  return {
    context,
    storage,
    handler: context.__runtimeHandler,
    dispatch: context.__internalDispatch
  };
}

function callRuntimeHandler(harness, sender) {
  let keepOpen;
  const response = new Promise((resolve) => {
    keepOpen = harness.handler({ action: 'getMcpClients' }, sender, resolve);
  });
  return { keepOpen, response };
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
  const expectedKeys = [
    'id',
    'raw',
    'displayName',
    'clicked',
    'installed',
    'connected',
    'live'
  ];
  if (Object.prototype.hasOwnProperty.call(expected, 'compatibility')) {
    expectedKeys.push('compatibility');
  }
  assert.deepEqual(Object.keys(row), expectedKeys, `${message}: exact row keys`);
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
    live: null,
    compatibility: {
      status: 'unsupported',
      reason: 'adapter_unshipped',
      checkedAt: null
    }
  }, 'stale installed checkedAt is preserved without interpretation');
  assertExactRow(merged['claude-code'], {
    id: 'claude-code',
    raw: false,
    displayName: 'Anthropic Claude',
    clicked: null,
    installed: null,
    connected: connectedClaude,
    live: liveClaude,
    compatibility: {
      status: 'unsupported',
      reason: 'matrix_invalid',
      checkedAt: null
    }
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

  const protoHarness = createHarness(JSON.parse(`{
    "fsbAgentProviders": {
      "clicked": {},
      "installed": {
        "__proto__": { "detected": true, "configPath": null, "checkedAt": 42 }
      },
      "connected": {
        "__proto__": { "name": "__proto__", "version": "1.0.0", "lastSeenAt": 43 }
      }
    }
  }`));
  const protoMerged = await protoHarness.providers.getMergedClients([]);
  assert.deepEqual(Object.keys(protoMerged), ['__proto__', 'raw:proto'],
    'special installed and connected identities both survive the merged output');
  assert.equal(Object.prototype.hasOwnProperty.call(protoMerged, '__proto__'), true,
    'merged output owns the __proto__ client id instead of invoking its inherited setter');
  assert.equal(Object.getOwnPropertyDescriptor(protoMerged, '__proto__').enumerable, true,
    'the special merged client id remains enumerable');
  assert.notEqual(Object.getPrototypeOf(protoMerged), protoMerged['__proto__'],
    'the special merged client row does not become the output map prototype');
  assertExactRow(protoMerged['__proto__'], {
    id: '__proto__',
    raw: false,
    displayName: '__proto__',
    clicked: null,
    installed: { detected: true, configPath: null, checkedAt: 42 },
    connected: null,
    live: null
  }, '__proto__ installed evidence remains a complete merged row');
  assert.equal(protoMerged['raw:proto'].connected.name, '__proto__',
    'the special connected name remains visible as raw evidence');

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
    'raw:geminicli',
    'raw:unknown-0',
    'raw:unknown-1'
  ], 'canonicalized durable keys keep unknown identities deterministic and raw-only');
  assert.equal(rawMerged['raw:geminicli'].raw, true, 'Gemini identity remains raw');
  assert.equal(rawMerged['raw:geminicli'].connected.name, 'Gemini CLI');
  assert.equal(rawMerged['raw:geminicli'].live.clientInfo.name, 'Gemini_CLI');
  assert.equal(rawMerged['raw:geminicli'].clicked, null);
  assert.equal(rawMerged['raw:geminicli'].installed, null);

  const runtimeClicked = { count: 1, firstClickedAt: 80, lastClickedAt: 80, source: 'base' };
  const runtimeLive = {
    agentId: 'agent_runtime_cursor',
    tabIds: [8],
    clientInfo: { name: 'Cursor', version: '1.0.0' }
  };
  const registryCalls = [];
  const runtimeHarness = createRuntimeHarness({
    fsbAgentProviders: {
      clicked: { cursor: runtimeClicked },
      installed: {},
      connected: {}
    }
  }, {
    registry: {
      listAgents() {
        registryCalls.push('listAgents');
        return [clone(runtimeLive)];
      }
    }
  });
  const crossContext = callRuntimeHandler(runtimeHarness, {
    id: 'mcp-client-test-extension',
    url: 'chrome-extension://mcp-client-test-extension/ui/onboarding.html'
  });
  assert.equal(crossContext.keepOpen, true, 'getMcpClients keeps the async runtime channel open');
  const crossContextResponse = plain(await crossContext.response);
  assert.deepEqual(crossContextResponse, {
    success: true,
    refreshOutcome: 'unavailable',
    compatibilityExpiresAt: null,
    clients: {
      cursor: {
        id: 'cursor',
        raw: false,
        displayName: 'Cursor',
        clicked: runtimeClicked,
        installed: null,
        connected: null,
        live: runtimeLive
      }
    }
  }, 'own-extension cross-context request receives the exact successful envelope');
  assert.deepEqual(registryCalls, ['listAgents'], 'live records come only from the registry clone API');

  let rejectedResponse;
  const rejectedReturn = runtimeHarness.handler(
    { action: 'getMcpClients' },
    { id: 'external-extension' },
    (value) => { rejectedResponse = value; }
  );
  assert.equal(rejectedReturn, undefined, 'external sender exits through the existing guard');
  assert.deepEqual(plain(rejectedResponse), { success: false, error: 'Unauthorized sender' },
    'external sender receives only the existing bounded rejection');
  assert.deepEqual(registryCalls, ['listAgents'], 'external request never reaches live registry evidence');

  const sameContextResponse = plain(await runtimeHarness.dispatch({ action: 'getMcpClients' }));
  assert.deepEqual(sameContextResponse, crossContextResponse,
    'same-service-worker dispatch reaches the same handler and exact envelope');
  assert.deepEqual(registryCalls, ['listAgents', 'listAgents'],
    'same-context dispatch performs one fresh live registry read');

  const emptyRegistryHarness = createRuntimeHarness({
    fsbAgentProviders: {
      clicked: {},
      installed: {},
      connected: {}
    }
  });
  const emptyRegistryCall = callRuntimeHandler(emptyRegistryHarness, { id: 'mcp-client-test-extension' });
  assert.equal(emptyRegistryCall.keepOpen, true, 'missing registry still uses the async response path');
  assert.deepEqual(plain(await emptyRegistryCall.response), {
    success: true,
    clients: {},
    refreshOutcome: 'unavailable',
    compatibilityExpiresAt: null
  },
    'missing registry is treated as an empty live clone set');

  emptyRegistryHarness.storage.setRejected(true);
  const storageFailureCall = callRuntimeHandler(emptyRegistryHarness, { id: 'mcp-client-test-extension' });
  assert.equal(storageFailureCall.keepOpen, true, 'storage rejection keeps the async channel contract');
  assert.deepEqual(plain(await storageFailureCall.response), {
    success: false,
    error: 'mcp_client_inventory_unavailable'
  }, 'storage exceptions collapse to the bounded inventory error code');

  const registryFailureHarness = createRuntimeHarness({}, {
    registry: {
      listAgents() {
        throw new Error('private registry failure');
      }
    }
  });
  const registryFailureCall = callRuntimeHandler(registryFailureHarness, { id: 'mcp-client-test-extension' });
  assert.deepEqual(plain(await registryFailureCall.response), {
    success: false,
    error: 'mcp_client_inventory_unavailable'
  }, 'registry exceptions do not leak through the runtime response');

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
  assert.equal((backgroundSource.match(/case 'getMcpClients'/g) || []).length, 1,
    'background contains exactly one getMcpClients runtime case');
  assert.doesNotMatch(
    backgroundSource,
    /chrome\.runtime\.sendMessage\s*\(\s*\{\s*action\s*:\s*['"]getMcpClients['"]/,
    'background never sends getMcpClients through same-context runtime messaging'
  );

  console.log('mcp-client-merged-view.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-client-merged-view.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
