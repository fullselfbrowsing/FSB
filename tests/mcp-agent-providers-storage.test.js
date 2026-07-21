'use strict';

/**
 * Phase 57 Plan 02 / Phase 62 Plan 03 -- durable MCP-agent provider evidence contracts.
 *
 * Run: node tests/mcp-agent-providers-storage.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const aliasesPath = path.join(repoRoot, 'extension', 'utils', 'mcp-client-aliases.js');
const delegationProvidersPath = path.join(repoRoot, 'extension', 'utils', 'delegation-providers.js');
const providersPath = path.join(repoRoot, 'extension', 'utils', 'mcp-agent-providers.js');
const registryPath = require.resolve('../extension/utils/agent-registry.js');
const backgroundPath = path.join(repoRoot, 'extension', 'background.js');
const dispatcherPath = require.resolve('../extension/ws/mcp-tool-dispatcher.js');
const bridgePath = path.join(repoRoot, 'extension', 'ws', 'mcp-bridge-client.js');
const providersPanel = require('../extension/ui/providers-panel.js');
const COMPATIBILITY_MAX_AGE_MS = 15 * 60 * 1000;

function compatibilityRow(overrides = {}) {
  return {
    adapterId: 'claude-code',
    displayLabel: 'Claude Code',
    status: 'supported',
    reason: 'within_tested_range',
    ...overrides
  };
}

function openCodeCompatibilityRow(overrides = {}) {
  return {
    adapterId: 'opencode',
    displayLabel: 'OpenCode',
    status: 'supported',
    reason: 'within_tested_range',
    ...overrides
  };
}

function compatibilitySnapshot(
  checkedAt,
  adapters = [compatibilityRow(), openCodeCompatibilityRow()]
) {
  return { schemaVersion: 1, checkedAt, adapters };
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createStorageArea(initial, options = {}) {
  const store = clone(initial || {});
  let setCount = 0;
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
      setCount++;
      if (typeof options.beforeSet === 'function') await options.beforeSet(values, setCount);
      if (options.rejectSet) throw new Error('storage set rejected');
      Object.assign(store, clone(values));
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete store[key];
    },
    dump() {
      return clone(store);
    },
    get setCount() {
      return setCount;
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
  delete globalThis.FsbDelegationProviders;
  delete globalThis.FsbMcpClientAliases;
  delete globalThis.FsbMcpAgentProviders;
  try { delete require.cache[require.resolve(delegationProvidersPath)]; } catch (_e) { /* fresh */ }
  try { delete require.cache[require.resolve(aliasesPath)]; } catch (_e) { /* fresh */ }
  try { delete require.cache[require.resolve(providersPath)]; } catch (_e) { /* fresh */ }
  require(delegationProvidersPath);
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
  const delegationProvidersSource = fs.readFileSync(delegationProvidersPath, 'utf8');
  const aliasesSource = fs.readFileSync(aliasesPath, 'utf8');
  const providersSource = fs.readFileSync(providersPath, 'utf8');
  const bridgeSource = fs.readFileSync(bridgePath, 'utf8');
  vm.runInNewContext(
    `${delegationProvidersSource}\n${aliasesSource}\n${providersSource}\n${bridgeSource}\nthis.__bridgeClient = mcpBridgeClient;`,
    context,
    { filename: 'mcp-agent-providers-bridge-harness.js' }
  );
  return { context, client: context.__bridgeClient };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  assert.equal(fs.existsSync(delegationProvidersPath), true,
    'canonical delegation provider helper exists');
  {
    delete globalThis.FsbDelegationProviders;
    delete require.cache[require.resolve(delegationProvidersPath)];
    const canonical = require(delegationProvidersPath);
    assert.equal(canonical, globalThis.FsbDelegationProviders,
      'UMD and CommonJS expose one canonical helper');
    assert.equal(Object.isFrozen(canonical), true, 'canonical helper API is frozen');
    assert.deepEqual(Object.keys(canonical).sort(), [
      'get', 'ids', 'isShippedId', 'list', 'validate'
    ], 'canonical helper exposes only closed lookup/copy/roster validators');
    assert.deepEqual(canonical.ids(), ['claude-code', 'opencode']);
    assert.deepEqual(canonical.list(), [
      { id: 'claude-code', label: 'Claude Code', billingKind: 'subscription' },
      { id: 'opencode', label: 'OpenCode', billingKind: 'unknown' }
    ]);
    const firstRoster = canonical.list();
    const secondRoster = canonical.list();
    assert.notEqual(firstRoster, secondRoster, 'provider roster is defensively copied');
    assert.equal(Object.isFrozen(firstRoster), true, 'provider roster is frozen');
    assert.equal(Object.isFrozen(firstRoster[0]), true, 'provider metadata is deeply frozen');
    assert.notEqual(canonical.get('opencode'), canonical.get('opencode'),
      'individual provider metadata is defensively copied');
    assert.deepEqual(canonical.validate({
      id: 'opencode', label: 'OpenCode', billingKind: 'unknown'
    }), { id: 'opencode', label: 'OpenCode', billingKind: 'unknown' });

    let getterReads = 0;
    const accessorRecord = {};
    Object.defineProperty(accessorRecord, 'id', {
      enumerable: true,
      get() { getterReads++; return 'opencode'; }
    });
    Object.defineProperties(accessorRecord, {
      label: { enumerable: true, value: 'OpenCode' },
      billingKind: { enumerable: true, value: 'unknown' }
    });
    for (const invalid of [
      { id: 'codex', label: 'Codex', billingKind: 'unknown' },
      { id: 'OpenCode', label: 'OpenCode', billingKind: 'unknown' },
      { id: 'opencode', label: 'Claude Code', billingKind: 'unknown' },
      { id: 'opencode', label: 'OpenCode', billingKind: 'subscription' },
      { id: 'opencode', label: 'OpenCode', billingKind: 'unknown', extra: true },
      Object.assign(Object.create({ inherited: true }), {
        id: 'opencode', label: 'OpenCode', billingKind: 'unknown'
      }),
      accessorRecord
    ]) {
      assert.equal(canonical.validate(invalid), null,
        'non-canonical metadata fails closed');
    }
    assert.equal(getterReads, 0, 'metadata validation never invokes accessors');
    assert.equal(canonical.get('codex'), null, 'Codex remains outside the shipped roster');
    assert.equal(canonical.isShippedId('OpenCode'), false, 'provider ids are case exact');
  }

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
      'replaceCompatibility',
      'replaceInstalled'
    ], 'classic script exposes the additive five-method provider API');
    assert.equal(providers.COMPATIBILITY_MAX_AGE_MS, COMPATIBILITY_MAX_AGE_MS,
      'the single exported compatibility freshness bound is fifteen minutes');
  }

  {
    const initial = {
      fsbAgentProviders: {
        clicked: { cursor: { count: 1 } },
        connected: { claude: { name: 'Claude' } },
        installed: { codex: { detected: false, checkedAt: 1 } },
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
      installed: { codex: { detected: false, checkedAt: 1 } },
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
      await providers.recordConnected('agent_two', { name: 'Anthropic Claude', version: '2.1.178' });
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
      lastSeenAt: 100
    }, 'same-millisecond aliases converge canonically and the later operation wins');
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
      '{"__proto__":{"detected":false,"checkedAt":1}}'
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
        checkedAt: 300
      },
      codex: {
        detected: false,
        checkedAt: 301
      },
      opencode: {
        detected: true,
        checkedAt: 302,
        configPath: '/private/INVENTORY_PATH_SENTINEL',
        version: 'INVENTORY_VERSION_SENTINEL',
        auth: 'INVENTORY_AUTH_SENTINEL',
        billing: 'INVENTORY_BILLING_SENTINEL',
        model: 'INVENTORY_MODEL_SENTINEL',
        config: 'INVENTORY_CONFIG_SENTINEL',
        nativeBody: 'INVENTORY_NATIVE_SENTINEL',
        diagnostic: 'INVENTORY_DIAGNOSTIC_SENTINEL'
      },
      badDetected: { detected: 'yes', checkedAt: 303 },
      badTime: { detected: true, checkedAt: Infinity },
      badRecord: []
    });
    assert.deepEqual(localArea.dump().fsbAgentProviders, {
      clicked: { cursor: { count: 4 } },
      connected: { 'claude-code': { name: 'Claude' } },
      installed: {
        cursor: {
          detected: true,
          checkedAt: 300
        },
        codex: {
          detected: false,
          checkedAt: 301
        }
      },
      futureField: 'preserve'
    }, 'installed replacement accepts only exact availability records and preserves siblings');
    const serializedInstalled = JSON.stringify(localArea.dump().fsbAgentProviders.installed);
    for (const sentinel of [
      'INVENTORY_PATH_SENTINEL',
      'INVENTORY_VERSION_SENTINEL',
      'INVENTORY_AUTH_SENTINEL',
      'INVENTORY_BILLING_SENTINEL',
      'INVENTORY_MODEL_SENTINEL',
      'INVENTORY_CONFIG_SENTINEL',
      'INVENTORY_NATIVE_SENTINEL',
      'INVENTORY_DIAGNOSTIC_SENTINEL'
    ]) {
      assert.equal(serializedInstalled.includes(sentinel), false,
        `installed storage excludes ${sentinel}`);
    }

    const reloaded = freshProviders();
    assert.deepEqual(await reloaded.read(), localArea.dump().fsbAgentProviders,
      'a fresh classic-script load re-reads the durable envelope');
  }

  {
    const checkedAt = 1_000_000;
    const input = compatibilitySnapshot(checkedAt);
    const inputBefore = clone(input);
    const initial = {
      fsbAgentProviders: {
        clicked: { cursor: { count: 7 } },
        connected: { claude: { name: 'Claude', lastSeenAt: 8 } },
        installed: { cursor: { detected: true, checkedAt: 9 } },
        futureEnvelope: { nested: ['preserve', 1] }
      }
    };
    const { localArea } = installChrome({ local: initial });
    const providers = freshProviders();
    const written = await providers.replaceCompatibility(input);

    assert.deepEqual(input, inputBefore, 'compatibility replacement never mutates caller data');
    assert.deepEqual(written.compatibility, inputBefore,
      'replacement resolves with the exact validated safe snapshot');
    assert.deepEqual(localArea.dump().fsbAgentProviders, {
      clicked: { cursor: { count: 7 } },
      connected: { 'claude-code': { name: 'Claude', lastSeenAt: 8 } },
      installed: { cursor: { detected: true, checkedAt: 9 } },
      futureEnvelope: { nested: ['preserve', 1] },
      compatibility: inputBefore
    }, 'compatibility replacement preserves all sibling and forward-compatible envelope data');
    assert.deepEqual((await freshProviders().read()).compatibility, inputBefore,
      'fresh hydration validates and restores the durable compatibility snapshot');
  }

  {
    const durable = compatibilitySnapshot(2_000_000, [
      compatibilityRow({ status: 'unsupported', reason: 'binary_not_found' }),
      openCodeCompatibilityRow({ status: 'unsupported', reason: 'binary_not_found' })
    ]);
    const { localArea } = installChrome({
      local: { fsbAgentProviders: { clicked: {}, connected: {}, installed: {}, compatibility: durable } }
    });
    const providers = freshProviders();
    let accessorCalls = 0;
    const accessorRow = compatibilityRow();
    Object.defineProperty(accessorRow, 'reason', {
      enumerable: true,
      configurable: true,
      get() {
        accessorCalls++;
        return 'within_tested_range';
      }
    });
    const poisonedRow = Object.assign(Object.create({ inherited: true }), compatibilityRow());
    const sparseAdapters = new Array(2);
    const inheritedSnapshot = Object.assign(Object.create({ inherited: true }),
      compatibilitySnapshot(2_000_001));
    const compatibilitySentinels = [
      '/private/COMPAT_EXECUTABLE_SENTINEL',
      'COMPAT_VERSION_SENTINEL',
      'COMPAT_AUTH_SENTINEL',
      'COMPAT_BILLING_SENTINEL',
      'COMPAT_MODEL_SENTINEL',
      'COMPAT_CONFIG_SENTINEL',
      'COMPAT_NATIVE_SENTINEL',
      'COMPAT_DIAGNOSTIC_SENTINEL',
      'COMPAT_TOPOLOGY_SENTINEL',
      'COMPAT_ENDPOINT_SENTINEL',
      'COMPAT_PORT_SENTINEL',
      'COMPAT_SECRET_SENTINEL'
    ];
    const invalidSnapshots = [
      { ...compatibilitySnapshot(2_000_001), extra: true },
      compatibilitySnapshot(2_000_001, [
        { ...compatibilityRow(), extra: true }, openCodeCompatibilityRow()
      ]),
      compatibilitySnapshot(2_000_001, [
        compatibilityRow({ reason: 'arbitrary_reason' }), openCodeCompatibilityRow()
      ]),
      compatibilitySnapshot(2_000_001, [compatibilityRow({
        status: 'supported',
        reason: 'evidence_stale'
      }), openCodeCompatibilityRow()]),
      compatibilitySnapshot(2_000_001, [compatibilityRow()]),
      compatibilitySnapshot(2_000_001, [compatibilityRow(), compatibilityRow()]),
      compatibilitySnapshot(2_000_001, [openCodeCompatibilityRow(), compatibilityRow()]),
      compatibilitySnapshot(2_000_001, [compatibilityRow(), openCodeCompatibilityRow({
        adapterId: 'codex', displayLabel: 'Codex'
      })]),
      compatibilitySnapshot(2_000_001, [compatibilityRow(), openCodeCompatibilityRow({
        adapterId: 'OpenCode'
      })]),
      compatibilitySnapshot(2_000_001, [compatibilityRow(), openCodeCompatibilityRow({
        displayLabel: 'Open Code'
      })]),
      compatibilitySnapshot(2_000_001, [compatibilityRow(), {
        ...openCodeCompatibilityRow(),
        executablePath: compatibilitySentinels[0],
        version: compatibilitySentinels[1],
        auth: compatibilitySentinels[2],
        billing: compatibilitySentinels[3],
        model: compatibilitySentinels[4],
        config: compatibilitySentinels[5],
        nativeBody: compatibilitySentinels[6],
        diagnostic: compatibilitySentinels[7],
        topology: compatibilitySentinels[8],
        endpoint: compatibilitySentinels[9],
        port: compatibilitySentinels[10],
        secret: compatibilitySentinels[11]
      }]),
      compatibilitySnapshot(2_000_001, sparseAdapters),
      compatibilitySnapshot(2_000_001, [accessorRow, openCodeCompatibilityRow()]),
      compatibilitySnapshot(2_000_001, [poisonedRow, openCodeCompatibilityRow()]),
      inheritedSnapshot,
      compatibilitySnapshot(Number.NaN),
      compatibilitySnapshot(2_000_001, [
        compatibilityRow({ adapterId: 'x'.repeat(65) }), openCodeCompatibilityRow()
      ])
    ];

    for (const candidate of invalidSnapshots) {
      await assert.rejects(
        providers.replaceCompatibility(candidate),
        /Invalid MCP agent compatibility snapshot/,
        'malformed, open-vocabulary, accessor, and prototype snapshots reject before storage'
      );
    }
    assert.equal(accessorCalls, 0, 'validation rejects accessor fields without invoking them');
    assert.equal(localArea.setCount, 0, 'invalid snapshots never enter the durable mutation path');
    assert.deepEqual(localArea.dump().fsbAgentProviders.compatibility, durable,
      'invalid replacements preserve the last durably validated snapshot');
    const serializedEnvelope = JSON.stringify(localArea.dump().fsbAgentProviders);
    for (const sentinel of compatibilitySentinels) {
      assert.equal(serializedEnvelope.includes(sentinel), false,
        `durable provider storage excludes ${sentinel}`);
    }
  }

  {
    let enterSet;
    let releaseSet;
    const setEntered = new Promise((resolve) => { enterSet = resolve; });
    const setGate = new Promise((resolve) => { releaseSet = resolve; });
    const { localArea } = installChrome({
      localOptions: {
        async beforeSet() {
          enterSet();
          await setGate;
        }
      }
    });
    const providers = freshProviders();
    let resolved = false;
    const replacement = providers.replaceCompatibility(compatibilitySnapshot(3_000_000));
    replacement.then(() => { resolved = true; });
    await setEntered;
    await tick();
    assert.equal(resolved, false, 'replacement cannot resolve before the durable write settles');
    assert.equal(localArea.dump().fsbAgentProviders, undefined,
      'the new supported view is not observable before durable storage accepts it');
    releaseSet();
    await replacement;
    assert.equal(resolved, true, 'replacement resolves after durable storage accepts the snapshot');
  }

  {
    const { localArea } = installChrome();
    const providers = freshProviders();
    let enterMutation;
    let releaseMutation;
    const mutationEntered = new Promise((resolve) => { enterMutation = resolve; });
    const mutationGate = new Promise((resolve) => { releaseMutation = resolve; });
    const clickedWrite = providers.mutateSubmap('clicked', async (clicked) => {
      enterMutation();
      await mutationGate;
      clicked.cursor = { count: 1 };
    });
    await mutationEntered;
    const compatibilityWrite = providers.replaceCompatibility(compatibilitySnapshot(4_000_000));
    await tick();
    assert.equal(localArea.setCount, 0,
      'compatibility replacement waits behind an existing provider-envelope mutation');
    releaseMutation();
    await Promise.all([clickedWrite, compatibilityWrite]);
    assert.deepEqual(localArea.dump().fsbAgentProviders.clicked, { cursor: { count: 1 } });
    assert.deepEqual(localArea.dump().fsbAgentProviders.compatibility,
      compatibilitySnapshot(4_000_000),
      'compatibility replacement shares the existing mutation chain without losing siblings');
  }

  {
    const checkedAt = 4_500_000;
    installChrome({
      local: {
        fsbAgentProviders: {
          clicked: {},
          connected: {},
          installed: {},
          compatibility: compatibilitySnapshot(checkedAt)
        }
      }
    });
    const providers = freshProviders();
    const merged = await providers.getMergedClients([], () => checkedAt);
    assert.deepEqual(Object.keys(merged).sort(), ['claude-code', 'codex', 'opencode'],
      'a valid compatibility snapshot seeds exactly the three canonical agent rows');
    assert.deepEqual(merged['claude-code'].compatibility, {
      status: 'supported',
      reason: 'within_tested_range',
      checkedAt
    }, 'snapshot-only Claude compatibility remains visible without unrelated evidence maps');
    assert.deepEqual(merged.opencode.compatibility, {
      status: 'supported',
      reason: 'within_tested_range',
      checkedAt
    }, 'snapshot-only OpenCode compatibility ships from its validated daemon row');
    assert.deepEqual(merged.codex.compatibility, {
      status: 'unsupported',
      reason: 'adapter_unshipped',
      checkedAt
    }, 'snapshot-only Codex compatibility remains closed until its adapter ships');
    for (const providerId of providersPanel.AGENT_PROVIDER_IDS) {
      assert.deepEqual({
        clicked: merged[providerId].clicked,
        installed: merged[providerId].installed,
        connected: merged[providerId].connected,
        live: merged[providerId].live
      }, { clicked: null, installed: null, connected: null, live: null },
      `compatibility cannot manufacture ${providerId} recommendation or setup evidence`);
    }
    for (const providerId of providersPanel.API_PROVIDER_IDS) {
      assert.equal(Object.prototype.hasOwnProperty.call(merged, providerId), false,
        `snapshot-only compatibility does not create the ${providerId} API row`);
    }
    assert.deepEqual(providersPanel.getRecommendation(merged), {
      providerKind: 'api', providerId: 'xai', reason: 'fallback'
    }, 'compatibility-only rows do not influence the provider recommendation');
    assert.equal(
      merged['claude-code'].compatibility.checkedAt + providers.COMPATIBILITY_MAX_AGE_MS,
      checkedAt + COMPATIBILITY_MAX_AGE_MS,
      'snapshot-only Claude support exposes the exact background expiry deadline'
    );
  }

  {
    const checkedAt = 5_000_000;
    const clicked = {
      'claude-code': { count: 1 },
      opencode: { count: 1 },
      codex: { count: 1 },
      cursor: { count: 1 }
    };
    installChrome({
      local: {
        fsbAgentProviders: {
          clicked,
          connected: {},
          installed: {},
          compatibility: compatibilitySnapshot(checkedAt)
        }
      }
    });
    const providers = freshProviders();
    const beforeBoundary = await providers.getMergedClients(
      [],
      () => checkedAt + COMPATIBILITY_MAX_AGE_MS - 1
    );
    assert.deepEqual(beforeBoundary['claude-code'].compatibility, {
      status: 'supported',
      reason: 'within_tested_range',
      checkedAt
    }, 'supported evidence remains supported one millisecond before expiry');
    const atBoundary = await providers.getMergedClients([], () => checkedAt + COMPATIBILITY_MAX_AGE_MS);
    assert.deepEqual(atBoundary['claude-code'].compatibility, {
      status: 'degraded',
      reason: 'evidence_stale',
      checkedAt
    }, 'supported evidence becomes stale at the exact fifteen-minute boundary');
    assert.deepEqual(atBoundary.opencode.compatibility, {
      status: 'degraded',
      reason: 'evidence_stale',
      checkedAt
    }, 'OpenCode support follows the same closed freshness boundary as Claude');
    assert.deepEqual(atBoundary.codex.compatibility, {
      status: 'unsupported',
      reason: 'adapter_unshipped',
      checkedAt
    }, 'Codex remains visibly unsupported until its adapter ships');
    assert.equal(Object.prototype.hasOwnProperty.call(atBoundary.cursor, 'compatibility'), false,
      'API rows receive no compatibility projection');

    const stale = await providers.getMergedClients([], () => checkedAt + COMPATIBILITY_MAX_AGE_MS + 1);
    assert.deepEqual(stale['claude-code'].compatibility, {
      status: 'degraded',
      reason: 'evidence_stale',
      checkedAt
    }, 'supported evidence older than fifteen minutes downgrades one way to evidence_stale');

    const rollback = await providers.getMergedClients([], () => checkedAt - 1);
    assert.deepEqual(rollback['claude-code'].compatibility, {
      status: 'unsupported',
      reason: 'matrix_invalid',
      checkedAt: null
    }, 'clock rollback/future-dated evidence fails closed instead of manufacturing freshness');

    await providers.replaceCompatibility(compatibilitySnapshot(checkedAt, [
      compatibilityRow({ status: 'degraded', reason: 'newer_than_tested_range' }),
      openCodeCompatibilityRow()
    ]));
    const oldDegraded = await providers.getMergedClients([], () => checkedAt + COMPATIBILITY_MAX_AGE_MS + 1);
    assert.deepEqual(oldDegraded['claude-code'].compatibility, {
      status: 'degraded',
      reason: 'newer_than_tested_range',
      checkedAt
    }, 'already degraded evidence is never rewritten into a more permissive state');

    await providers.replaceCompatibility(compatibilitySnapshot(checkedAt, [
      compatibilityRow({ status: 'unsupported', reason: 'wrong_major' }),
      openCodeCompatibilityRow()
    ]));
    const oldUnsupported = await providers.getMergedClients([], () => checkedAt + COMPATIBILITY_MAX_AGE_MS + 1);
    assert.deepEqual(oldUnsupported['claude-code'].compatibility, {
      status: 'unsupported',
      reason: 'wrong_major',
      checkedAt
    }, 'already unsupported evidence retains its canonical fail-closed reason');

    await assert.rejects(
      providers.replaceCompatibility(compatibilitySnapshot(checkedAt, [
        compatibilityRow({ displayLabel: 'Matrix Mismatch' }),
        openCodeCompatibilityRow()
      ])),
      /Invalid MCP agent compatibility snapshot/,
      'a canonical-id row with a mismatched display label rejects before storage'
    );
    const mismatched = await providers.getMergedClients([], () => checkedAt);
    assert.deepEqual(mismatched['claude-code'].compatibility, {
      status: 'unsupported',
      reason: 'wrong_major',
      checkedAt
    }, 'a rejected label mismatch preserves the last durably validated closed row');
  }

  {
    const corrupt = compatibilitySnapshot(6_000_000, [compatibilityRow({ reason: 'not_canonical' })]);
    installChrome({
      local: {
        fsbAgentProviders: {
          clicked: { 'claude-code': { count: 1 }, cursor: { count: 1 } },
          connected: {},
          installed: {},
          compatibility: corrupt
        }
      }
    });
    const providers = freshProviders();
    assert.equal((await providers.read()).compatibility, null,
      'corrupt hydrated compatibility is retained only as a fail-closed null view');
    const merged = await providers.getMergedClients([], () => 6_000_000);
    assert.deepEqual(merged['claude-code'].compatibility, {
      status: 'unsupported',
      reason: 'matrix_invalid',
      checkedAt: null
    }, 'corrupt/absent evidence projects unsupported');
    assert.equal(Object.prototype.hasOwnProperty.call(merged.cursor, 'compatibility'), false,
      'corrupt evidence cannot leak a compatibility property onto API rows');
  }

  {
    const oldSnapshot = compatibilitySnapshot(7_000_000, [
      compatibilityRow({ status: 'unsupported', reason: 'binary_not_found' }),
      openCodeCompatibilityRow({ status: 'unsupported', reason: 'binary_not_found' })
    ]);
    const { localArea } = installChrome({
      local: {
        fsbAgentProviders: {
          clicked: { 'claude-code': { count: 1 } },
          connected: {},
          installed: {},
          compatibility: oldSnapshot
        }
      },
      localOptions: { rejectSet: true }
    });
    const providers = freshProviders();
    await assert.rejects(
      providers.replaceCompatibility(compatibilitySnapshot(7_000_001)),
      /storage set rejected/,
      'durable write rejection reaches the refresh owner'
    );
    assert.deepEqual(localArea.dump().fsbAgentProviders.compatibility, oldSnapshot,
      'write rejection preserves the last durable compatibility evidence');
    const merged = await providers.getMergedClients([], () => 7_000_001);
    assert.deepEqual(merged['claude-code'].compatibility, {
      status: 'unsupported',
      reason: 'binary_not_found',
      checkedAt: 7_000_000
    }, 'a rejected newly-supported write cannot leak support through the merged view');
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
    const source = fs.readFileSync(providersPath, 'utf8');
    const installedSource = source.slice(
      source.indexOf('function normalizeInstalled'),
      source.indexOf('async function replaceInstalled')
    );
    assert.doesNotMatch(installedSource, /\b(?:configPath|version|auth|billing|model|nativeBody|diagnostic)\b/,
      'installed storage normalization has no local path/version/provider/native fields');
    const compatibilityParserSource = source.slice(
      source.indexOf('function parseCompatibilityRow'),
      source.indexOf('function cloneMap')
    );
    assert.doesNotMatch(
      compatibilityParserSource,
      /\b(?:executablePath|version|semver|auth|billing|model|config|nativeBody|diagnostic|topology|endpoint|port|secret)\b/,
      'browser compatibility parsing contains only the approved safe status grammar'
    );
    const compatibilityProjectionSource = source.slice(
      source.indexOf('function projectedCompatibility'),
      source.indexOf('function resolveProjectionTime')
    );
    assert.doesNotMatch(
      compatibilityProjectionSource,
      /\b(?:selectProvider|recommendProvider|saveSettings|markDirty|grantSpawn|spawnAgent)\b/,
      'browser compatibility projection has no selection, recommendation, settings, dirty, or spawn authority'
    );
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
          cursor: { detected: true, checkedAt: 400 }
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
      cursor: { detected: true, checkedAt: 400 }
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
          codex: { detected: true, checkedAt: 500 }
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
      codex: { detected: true, checkedAt: 600 }
    } })`, harness.context);
    const accepted = await harness.client._routeMessage('system:client-inventory', validPayload, 'inventory-1');
    assert.deepEqual(clone(accepted), { accepted: true }, 'system inventory route returns accepted:true');
    assert.deepEqual(localArea.dump().fsbAgentProviders, {
      clicked: { cursor: { count: 1 } },
      connected: { cursor: { name: 'Cursor' } },
      installed: {
        codex: { detected: true, checkedAt: 600 }
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
