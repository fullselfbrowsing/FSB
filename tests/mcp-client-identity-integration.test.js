'use strict';

/**
 * Phase 57 Plan 03 -- cross-stack MCP client identity and evidence contract.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-client-identity-integration.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const agentScopeBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-scope.js');
const runtimeBuildPath = path.join(repoRoot, 'mcp', 'build', 'runtime.js');
const inventoryBuildPath = path.join(repoRoot, 'mcp', 'build', 'client-inventory.js');
const aliasesPath = path.join(repoRoot, 'extension', 'utils', 'mcp-client-aliases.js');
const providersPath = path.join(repoRoot, 'extension', 'utils', 'mcp-agent-providers.js');
const registryPath = path.join(repoRoot, 'extension', 'utils', 'agent-registry.js');
const dispatcherPath = path.join(repoRoot, 'extension', 'ws', 'mcp-tool-dispatcher.js');
const bridgeClientPath = path.join(repoRoot, 'extension', 'ws', 'mcp-bridge-client.js');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createStorageArea(initial = {}) {
  const store = clone(initial);
  let rejectGet = false;
  return {
    get(keys, callback) {
      const read = async () => {
        if (rejectGet) throw new Error('private storage failure');
        if (keys == null) return clone(store);
        const defaults = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : null;
        const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(defaults || {}));
        const result = {};
        for (const key of list) {
          if (Object.prototype.hasOwnProperty.call(store, key)) result[key] = clone(store[key]);
          else if (defaults) result[key] = clone(defaults[key]);
        }
        return result;
      };
      const promise = read();
      if (typeof callback === 'function') promise.then(callback, () => callback({}));
      return promise;
    },
    set(values, callback) {
      Object.assign(store, clone(values));
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    remove(keys, callback) {
      for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    },
    dump() {
      return clone(store);
    },
    rejectReads(value) {
      rejectGet = value === true;
    }
  };
}

function installChrome() {
  const local = createStorageArea();
  const session = createStorageArea();
  globalThis.chrome = {
    runtime: { id: 'phase57-integration-extension' },
    storage: {
      local,
      session,
      onChanged: { addListener() {} }
    },
    tabs: {
      async query() { return []; },
      async get(tabId) { throw new Error('tab unavailable: ' + tabId); }
    }
  };
  return { local, session };
}

function freshClassicModule(filePath, globalName) {
  delete globalThis[globalName];
  delete require.cache[require.resolve(filePath)];
  require(filePath);
  return globalThis[globalName];
}

function freshProviders() {
  freshClassicModule(aliasesPath, 'FsbMcpClientAliases');
  return freshClassicModule(providersPath, 'FsbMcpAgentProviders');
}

function freshRegistryModule() {
  delete require.cache[require.resolve(registryPath)];
  return require(registryPath);
}

function freshDispatcher() {
  delete require.cache[require.resolve(dispatcherPath)];
  return require(dispatcherPath);
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function settleWrites() {
  await tick();
  await tick();
  await tick();
}

class CaptureBridge {
  constructor(response = {}) {
    this.calls = [];
    this.response = {
      success: true,
      agentId: 'agent_daemon_capture',
      agentIdShort: 'agent_daemon',
      ...response
    };
  }

  async sendAndWait(message, options) {
    this.calls.push({ message: clone(message), options: clone(options) });
    return clone(this.response);
  }
}

function fakePlatform() {
  return {
    displayName: 'Claude Code',
    flag: 'claude-code',
    format: 'cli',
    serverMapKey: null,
    configPath: null,
    installMode: 'cli',
    mergeStrategy: 'object-map'
  };
}

function loadInventoryBridge(providers) {
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
    dispatchMcpMessageRoute: async () => ({ success: true }),
    FsbMcpAgentProviders: providers
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${fs.readFileSync(bridgeClientPath, 'utf8')}\nthis.__bridgeClient = mcpBridgeClient;`,
    context,
    { filename: 'mcp-bridge-client.js#phase57-integration' }
  );
  return context.__bridgeClient;
}

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'runtime source extraction markers remain present');
  return source.slice(start, end);
}

async function readCachedMcpClientsOffline(providers, registry) {
  let refreshOutcome = 'unavailable';
  try {
    const envelope = await providers.read();
    const cached = envelope && Object.prototype.hasOwnProperty.call(envelope, 'compatibility')
      ? providers.validateCompatibilitySnapshot(envelope.compatibility)
      : null;
    refreshOutcome = cached ? 'stale' : 'unavailable';
  } catch (_error) {
    refreshOutcome = 'unavailable';
  }

  const liveRecords = registry && typeof registry.listAgents === 'function'
    ? await Promise.resolve(registry.listAgents())
    : [];
  const clients = await providers.getMergedClients(liveRecords);
  return { clients, refreshOutcome, compatibilityExpiresAt: null };
}

function loadRuntimeQueryHarness(providers, registry) {
  const source = fs.readFileSync(backgroundPath, 'utf8');
  const handler = extractBetween(
    source,
    'const fsbHandleRuntimeMessage = (request, sender, sendResponse) => {',
    '\nchrome.runtime.onMessage.addListener(fsbHandleRuntimeMessage);'
  );
  const dispatcher = extractBetween(
    source,
    'function fsbDispatchInternalMessage(request) {',
    "\n\nif (typeof globalThis !== 'undefined') {"
  );
  const context = {
    chrome: globalThis.chrome,
    console,
    Promise,
    setTimeout,
    clearTimeout,
    armMcpBridge() {},
    fsbHandleDelegationCommand() { return null; },
    automationLogger: { logComm() {} },
    FsbMcpAgentProviders: providers,
    fsbAgentRegistryInstance: registry,
    fsbReadCachedMcpClients: () => readCachedMcpClientsOffline(providers, registry)
  };
  context.globalThis = context;
  vm.runInNewContext(
    `${handler}\nconst FSB_INTERNAL_DISPATCH_TIMEOUT_MS = 20000;\n${dispatcher}\n` +
      'this.__dispatch = fsbDispatchInternalMessage;',
    context,
    { filename: 'background.js#phase57-integration' }
  );
  return context.__dispatch;
}

function assertRegisterResponse(response, connectionId) {
  assert.deepEqual(Object.keys(response), [
    'success', 'agentId', 'agentIdShort', 'ownershipTokens', 'connectionId'
  ], 'register response has the exact established field set');
  assert.equal(response.success, true);
  assert.equal(typeof response.agentId, 'string');
  assert.equal(typeof response.agentIdShort, 'string');
  assert.deepEqual(response.ownershipTokens, {});
  assert.equal(response.connectionId, connectionId);
}

async function main() {
  for (const builtPath of [agentScopeBuildPath, runtimeBuildPath, inventoryBuildPath]) {
    assert.equal(fs.existsSync(builtPath), true, `${path.basename(builtPath)} exists after MCP build`);
  }

  const { AgentScope } = await import(pathToFileURL(agentScopeBuildPath).href);
  const { createRuntime } = await import(pathToFileURL(runtimeBuildPath).href);
  const inventoryModule = await import(pathToFileURL(inventoryBuildPath).href);
  const { __configureClientInventoryForTests, pushMcpClientInventory } = inventoryModule;

  __configureClientInventoryForTests({
    platform: 'linux',
    platforms: { 'claude-code': fakePlatform(), opencode: fakePlatform() },
    now: () => 1_783_900_000_000,
    execFile: (_file, _args, _options, callback) => callback(null, 'Claude Code 2.1.177', ''),
    detectOpenCode: async () => ({
      installed: false,
      version: null,
      authState: 'unknown',
      binary: null,
      profileVersion: null
    })
  });

  let registerPayload;
  try {
    const runtime = createRuntime();
    runtime.server.server.getClientVersion = () => ({ name: 'Claude Code', version: '2.1.177' });
    const bridge = new CaptureBridge();
    await runtime.agentScope.ensure(bridge);
    assert.equal(bridge.calls.length, 1, 'initialized runtime emits one lazy registration');
    registerPayload = bridge.calls[0].message.payload;
    assert.deepEqual(registerPayload, {
      clientInfo: { name: 'Claude Code', version: '2.1.177' },
      platforms: {
        'claude-code': {
          detected: true,
          checkedAt: 1_783_900_000_000
        },
        opencode: {
          detected: false,
          checkedAt: 1_783_900_000_000
        }
      }
    }, 'one register payload carries both optional initialize identity and installed inventory');

    const indexSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'index.ts'), 'utf8');
    const httpSource = fs.readFileSync(path.join(repoRoot, 'mcp', 'src', 'http.ts'), 'utf8');
    assert.match(indexSource, /async function runStdioServer[\s\S]*?const runtime = createRuntime\(\);/,
      'stdio uses the common identity-aware runtime');
    assert.match(httpSource, /isInitializeRequest\(parsedBody\)[\s\S]*?const runtime = createRuntime\(\{ bridge: options\.bridge, queue: options\.queue \}\);/,
      'HTTP initialize uses the common identity-aware runtime');

    const legacyScope = new AgentScope();
    const legacyBridge = new CaptureBridge();
    await legacyScope.ensure(legacyBridge);
    assert.deepEqual(legacyBridge.calls[0].message, { type: 'agent:register', payload: {} },
      'legacy AgentScope preserves payload:{} exactly');

    for (const malformed of [() => [], () => ({ authority: 'admin' })]) {
      const scope = new AgentScope();
      const malformedBridge = new CaptureBridge();
      scope.setClientInfoSupplier(malformed);
      await scope.ensure(malformedBridge);
      assert.deepEqual(malformedBridge.calls[0].message.payload, {},
        'malformed or unsupported initialize identity remains absent');
    }

    const diagnostics = [];
    const originalError = console.error;
    console.error = (...args) => diagnostics.push(args.join(' '));
    try {
      await pushMcpClientInventory({
        sendAndWait: async () => { throw new Error('offline private detail'); }
      });
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(diagnostics, ['[FSB MCP] Client inventory push skipped (extension offline or incompatible)'],
      'offline inventory delivery is tolerated without leaking transport detail');
  } finally {
    __configureClientInventoryForTests(null);
  }

  const storage = installChrome();
  let providers = freshProviders();
  const { AgentRegistry } = freshRegistryModule();
  const registry = new AgentRegistry();
  globalThis.fsbAgentRegistryInstance = registry;
  globalThis.FsbMcpAgentProviders = providers;
  const { handleAgentRegisterRoute } = freshDispatcher();
  const connectionClient = { getConnectionId: () => 'connection-phase57' };

  const first = await handleAgentRegisterRoute({ payload: registerPayload, client: connectionClient });
  assertRegisterResponse(first, 'connection-phase57');
  await settleWrites();
  let durable = storage.local.dump().fsbAgentProviders;
  assert.deepEqual(durable.installed['claude-code'], registerPayload.platforms['claude-code'],
    'agent:register piggyback persists installed evidence');
  assert.equal(durable.connected['claude-code'].version, '2.1.177',
    'dispatcher persists sanitized connected identity');
  assert.deepEqual(registry.listAgents().find((record) => record.agentId === first.agentId).clientInfo, {
    name: 'Claude Code', version: '2.1.177'
  }, 'dispatcher stamps live registry identity');

  const reconnect = await handleAgentRegisterRoute({
    payload: { clientInfo: { name: 'Claude Code', version: '2.1.178' } },
    client: connectionClient
  });
  assertRegisterResponse(reconnect, 'connection-phase57');
  await settleWrites();
  durable = storage.local.dump().fsbAgentProviders;
  assert.deepEqual(Object.keys(durable.connected).filter((key) => key === 'claude-code'), ['claude-code'],
    'reconnect updates one durable connected key rather than appending');
  assert.equal(durable.connected['claude-code'].version, '2.1.178',
    'reconnect refreshes connected evidence');

  const longName = 'N'.repeat(240);
  const longVersion = 'V'.repeat(240);
  const oversized = await handleAgentRegisterRoute({
    payload: { clientInfo: { name: longName, version: longVersion, authority: 'admin' } },
    client: connectionClient
  });
  await settleWrites();
  const oversizedLive = registry.listAgents().find((record) => record.agentId === oversized.agentId);
  assert.equal(oversizedLive.clientInfo.name.length, 200, 'dispatcher caps oversized identity names');
  assert.equal(oversizedLive.clientInfo.version.length, 200, 'dispatcher caps oversized identity versions');
  assert.equal(Object.hasOwn(oversizedLive.clientInfo, 'authority'), false, 'dispatcher drops unrecognized identity fields');
  assert.deepEqual(registry.getAgentTabs(oversized.agentId), [], 'descriptive identity grants no tab authority');

  const unknown = await handleAgentRegisterRoute({
    payload: { clientInfo: { name: 'Future MCP', version: '9.0.0' } },
    client: connectionClient
  });
  await settleWrites();
  const legacy = await handleAgentRegisterRoute({ payload: {}, client: connectionClient });
  assertRegisterResponse(legacy, 'connection-phase57');
  assert.equal(Object.hasOwn(registry.listAgents().find((record) => record.agentId === legacy.agentId), 'clientInfo'), false,
    'legacy payload creates no synthetic identity');

  const systemInventory = {
    'claude-code': { detected: true, checkedAt: 1_783_900_001_000 },
    opencode: { detected: false, checkedAt: 1_783_900_001_000 },
    cursor: { detected: false, checkedAt: 1_783_900_001_000 }
  };
  const inventoryBridge = loadInventoryBridge(providers);
  assert.deepEqual(clone(await inventoryBridge._routeMessage(
    'system:client-inventory', { platforms: systemInventory }, 'inventory-phase57'
  )), { accepted: true }, 'system inventory frame follows the second installed-evidence path');
  assert.deepEqual(storage.local.dump().fsbAgentProviders.installed, systemInventory,
    'system inventory converges to the latest snapshot');

  await providers.mutateSubmap('clicked', (clicked) => {
    clicked['claude-code'] = {
      count: 2,
      firstClickedAt: 1_783_899_999_000,
      lastClickedAt: 1_783_900_002_000,
      source: 'fan'
    };
  });
  assert.match(fs.readFileSync(path.join(repoRoot, 'extension', 'ui', 'onboarding.js'), 'utf8'),
    /persistCopyClick\(clientId, source\)/,
    'onboarding remains the durable clicked-evidence producer');

  await settleWrites();
  assert.ok(storage.session.dump().fsbAgentRegistry, 'live registry snapshot is durable before eviction');

  providers = freshProviders();
  const { AgentRegistry: RehydratedAgentRegistry } = freshRegistryModule();
  const rehydratedRegistry = new RehydratedAgentRegistry();
  await rehydratedRegistry.hydrate();
  assert.ok(rehydratedRegistry.listAgents().some((record) => record.agentId === reconnect.agentId),
    'fresh service-worker registry rehydrates live clientInfo clones');

  const dispatchInventoryQuery = loadRuntimeQueryHarness(providers, rehydratedRegistry);
  const queryResponse = clone(await dispatchInventoryQuery({ action: 'getMcpClients' }));
  assert.equal(queryResponse.success, true, 'fresh same-context getMcpClients query succeeds');
  assert.equal(queryResponse.refreshOutcome, 'unavailable',
    'offline cache-only inventory reports the bounded unavailable outcome');
  assert.equal(queryResponse.compatibilityExpiresAt, null,
    'cache-only inventory preserves the current closed expiry envelope');
  const claude = queryResponse.clients['claude-code'];
  assert.equal(claude.clicked.source, 'fan');
  assert.equal(claude.installed.detected, true);
  assert.deepEqual(Object.keys(claude.installed), ['detected', 'checkedAt']);
  assert.equal(claude.connected.version, '2.1.178');
  assert.equal(claude.live.agentId, reconnect.agentId);
  assert.deepEqual(claude.compatibility, {
    status: 'unsupported',
    reason: 'matrix_invalid',
    checkedAt: null
  }, 'absent offline compatibility evidence remains an explicit fail-closed projection');
  assert.deepEqual(Object.keys(claude), [
    'id', 'raw', 'displayName', 'clicked', 'installed', 'connected', 'live', 'compatibility'
  ], 'final canonical row preserves all bounded evidence objects and exact shape');

  const rawUnknown = queryResponse.clients['raw:futuremcp'];
  assert.equal(rawUnknown.raw, true, 'unknown client stays visible as raw evidence');
  assert.equal(rawUnknown.connected.name, 'Future MCP');
  assert.equal(rawUnknown.live.agentId, unknown.agentId);
  assert.equal(rawUnknown.clicked, null);
  assert.equal(rawUnknown.installed, null);
  for (const field of ['tier', 'recommendation', 'selectedProvider', 'authority']) {
    assert.equal(Object.hasOwn(rawUnknown, field), false, `raw identity derives no ${field}`);
    assert.equal(Object.hasOwn(claude, field), false, `canonical identity derives no ${field}`);
  }

  storage.local.rejectReads(true);
  const rejected = clone(await dispatchInventoryQuery({ action: 'getMcpClients' }));
  assert.deepEqual(rejected, { success: false, error: 'mcp_client_inventory_unavailable' },
    'fresh-query storage rejection returns only the bounded failure code');
  storage.local.rejectReads(false);

  const testScript = require(path.join(repoRoot, 'package.json')).scripts.test;
  const phase57Commands = [
    'mcp-client-identity.test.js',
    'mcp-client-inventory.test.js',
    'mcp-agent-providers-storage.test.js',
    'onboarding-agent-provider-clicks.test.js',
    'mcp-client-merged-view.test.js',
    'mcp-client-identity-integration.test.js'
  ];
  let previousIndex = testScript.indexOf('mcp-setup-guidance.test.js');
  for (const file of phase57Commands) {
    const index = testScript.indexOf(file);
    assert.ok(index > previousIndex, `${file} is permanently ordered in the Phase 57 root-suite cluster`);
    assert.equal(testScript.split(file).length - 1, 1, `${file} runs exactly once`);
    previousIndex = index;
  }
  assert.ok(previousIndex < testScript.indexOf('turn-result.test.js'),
    'the Phase 57 cluster is inserted without reordering later tests');

  console.log('mcp-client-identity-integration.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-client-identity-integration.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
