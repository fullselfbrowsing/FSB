'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

function assertEqual(actual, expected, msg) {
  assert(actual === expected, `${msg} (expected: ${expected}, got: ${actual})`);
}

function assertDeepEqual(actual, expected, msg) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${msg} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`,
  );
}

const repoRoot = path.resolve(__dirname, '..');

function makeSnapshot(overrides = {}) {
  return {
    checkedAt: '2026-04-23T12:00:00.000Z',
    bridgeUrl: 'ws://localhost:7225',
    bridgeMode: 'hub',
    extensionConnected: true,
    bridgeTopology: {
      instanceId: 'diag-test',
      mode: 'hub',
      hubConnected: true,
      extensionConnected: true,
      relayCount: 0,
      pendingRequestCount: 0,
      activeHubInstanceId: 'diag-test',
      lastExtensionHeartbeatAt: Date.now() - 1500,
      lastDisconnectReason: null,
    },
    hubConnected: true,
    relayCount: 0,
    activeHubInstanceId: 'diag-test',
    lastExtensionHeartbeatAt: Date.now() - 1500,
    lastDisconnectReason: null,
    packageVersion: '0.6.0',
    serverJsonVersion: '0.6.0',
    versionParityOk: true,
    activeTab: {
      id: 42,
      url: 'https://example.com',
      title: 'Example',
      windowId: 1,
      restricted: false,
      pageType: 'Web page',
    },
    contentScript: {
      ready: true,
      portConnected: true,
      lastHeartbeatAgeMs: 1000,
      lastReadyAt: Date.now() - 1000,
      lastReadyUrl: 'https://example.com',
      readinessSource: 'port',
    },
    compatibilityMatrix: {
      schemaVersion: 1,
      adapters: [{
        adapterId: 'claude-code',
        displayLabel: 'Claude Code',
        profileVersion: '2.1.177',
        minimumVersion: '2.1.177',
        testedThroughVersion: '2.1.177',
        supportedMajor: 2,
        fixtureManifest: 'tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json',
        requiredInitFields: ['type', 'subtype', 'session_id', 'tools', 'mcp_servers'],
        requiredResultFields: ['type', 'subtype', 'session_id', 'is_error'],
        expectedNormalizedSequence: [
          'init',
          'assistant',
          'tool_use',
          'assistant_delta',
          'user',
          'tool_result',
          'retry',
          'result',
        ],
      }],
    },
    adapterDiagnostics: [{
      adapterId: 'claude-code',
      displayLabel: 'Claude Code',
      binaryPath: '/opt/claude',
      detectedVersion: '2.1.177',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'unknown',
      profileVersion: '2.1.177',
    }],
    bridgeAuthMetadata: {
      sharedSecretPresent: true,
      secretRotatedAt: 9000,
      secretRotationAgeMs: 1000,
    },
    extensionConfig: {
      modelProvider: 'openai',
      modelName: 'gpt-5.4',
    },
    tabsSummary: {
      totalTabs: 4,
      activeTabId: 42,
    },
    bridgeClient: {
      status: 'connected',
    },
    probeNotes: [],
    diagnosticLayer: 'healthy',
    diagnosticWhy: 'Bridge topology, extension attach, config, and content-script probes all look healthy.',
    nextAction: 'Retry the MCP command.',
    error: undefined,
    ...overrides,
  };
}

function assertOrdered(text, labels, msg) {
  let lastIndex = -1;
  for (const label of labels) {
    const index = text.indexOf(label);
    assert(index >= 0, `${msg}: includes ${label}`);
    assert(index > lastIndex, `${msg}: ${label} appears in order`);
    lastIndex = index;
  }
}

function makeOfflineTopology() {
  return {
    instanceId: 'doctor-offline-test',
    mode: 'disconnected',
    hubConnected: false,
    extensionConnected: false,
    relayCount: 0,
    pendingRequestCount: 0,
    activeHubInstanceId: null,
    lastExtensionHeartbeatAt: null,
    lastDisconnectReason: 'offline-test',
  };
}

function makeOfflineBridge() {
  return {
    topology: makeOfflineTopology(),
    isConnected: false,
    async connect() {
      throw new Error('offline-test');
    },
    disconnect() {},
    async sendAndWait() {
      throw new Error('offline-test');
    },
  };
}

function makeAdapterRegistry(detect) {
  const adapter = Object.freeze({ detect });
  return Object.freeze({
    ids() {
      return Object.freeze(['claude-code']);
    },
    require(id) {
      if (id !== 'claude-code') throw new Error('unknown adapter');
      return adapter;
    },
  });
}

function makeDetection(overrides = {}) {
  return {
    installed: true,
    version: '2.1.177',
    authState: 'authenticated',
    binary: {
      command: '/opt/claude',
      realPath: '/opt/claude',
      argvPrefix: [],
    },
    profileVersion: '2.1.177',
    ...overrides,
  };
}

async function run() {
  const diagnosticsUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'diagnostics.js')).href;
  const indexUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'index.js')).href;
  const diagnostics = await import(diagnosticsUrl);
  const indexModule = await import(indexUrl);
  const compatibilityUrl = pathToFileURL(
    path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'compatibility.js'),
  ).href;
  const compatibility = await import(compatibilityUrl);

  const cases = [
    ['package', makeSnapshot({ versionParityOk: false, packageVersion: '0.5.2', serverJsonVersion: '0.5.2' }), 'package'],
    ['config', makeSnapshot({ probeNotes: [{ scope: 'config', status: 'error', message: 'config probe failed' }] }), 'config'],
    ['bridge', makeSnapshot({
      bridgeMode: 'relay',
      hubConnected: false,
      bridgeTopology: { ...makeSnapshot().bridgeTopology, mode: 'relay', hubConnected: false },
    }), 'bridge'],
    ['extension', makeSnapshot({
      extensionConnected: false,
      bridgeTopology: { ...makeSnapshot().bridgeTopology, extensionConnected: false },
    }), 'extension'],
    ['content_script', makeSnapshot({
      contentScript: {
        ready: false,
        portConnected: false,
        lastHeartbeatAgeMs: null,
        lastReadyAt: null,
        lastReadyUrl: null,
        readinessSource: null,
      },
    }), 'content_script'],
    ['tool_routing', makeSnapshot({
      probeNotes: [{ scope: 'diagnostics', status: 'error', message: 'Missing direct MCP route', errorCode: 'mcp_route_unavailable' }],
      contentScript: {
        ready: true,
        portConnected: true,
        lastHeartbeatAgeMs: 1000,
        lastReadyAt: Date.now() - 1000,
        lastReadyUrl: 'https://example.com',
        readinessSource: 'port',
      },
    }), 'tool_routing'],
    ['healthy', makeSnapshot(), 'healthy'],
  ];

  console.log('\n--- doctor classification ---');
  for (const [label, snapshot, expected] of cases) {
    const actual = diagnostics.classifyDoctorLayer(snapshot);
    assertEqual(actual, expected, `doctor classification selects ${expected} for ${label} fixture`);
  }

  console.log('\n--- watch formatting ---');
  const watchText = indexModule.formatWatchSnapshot(makeSnapshot());
  assertOrdered(
    watchText,
    ['Mode', 'Ext', 'Heartbeat', 'Hub', 'Relays', 'Disconnect', 'Layer'],
    'watch formatter field order',
  );

  console.log('\n--- doctor formatting ---');
  const packageDoctor = indexModule.formatDoctor(diagnostics.applyDiagnosticClassification(cases[0][1]));
  assert(packageDoctor.includes('Detected:'), 'doctor output includes Detected:');
  assert(packageDoctor.includes('Why:'), 'doctor output includes Why:');
  assert(packageDoctor.includes('Next action:'), 'doctor output includes Next action:');
  assert(packageDoctor.includes('Package / version parity'), 'doctor output includes package label');

  const formattedSnapshot = makeSnapshot();
  const formattedDoctor = indexModule.formatDoctor(formattedSnapshot);
  const formattedJson = JSON.parse(JSON.stringify(formattedSnapshot));
  const formattedRow = formattedJson.adapterDiagnostics[0];
  const formattedContract = formattedJson.compatibilityMatrix.adapters[0];
  const expectedDoctorFacts = [
    `Adapter compatibility (matrix schema ${formattedJson.compatibilityMatrix.schemaVersion}):`,
    `- ${formattedRow.displayLabel} (${formattedRow.adapterId})`,
    `  Binary: ${formattedRow.binaryPath}`,
    `  Version: ${formattedRow.detectedVersion}`,
    '  Compatibility: Supported',
    `  Reason: ${formattedRow.compatibilityReason}`,
    `  Profile: ${formattedRow.profileVersion}`,
    `  Minimum version: ${formattedContract.minimumVersion}`,
    `  Tested through: ${formattedContract.testedThroughVersion}`,
    '  Auth: Not reported',
    'Bridge auth:',
    '  Shared secret: Present',
    '  Secret rotated at: 1970-01-01T00:00:09.000Z',
    `  Secret rotation age: ${formattedJson.bridgeAuthMetadata.secretRotationAgeMs} ms`,
  ];
  for (const fact of expectedDoctorFacts) {
    assert(formattedDoctor.includes(fact), `doctor text derives JSON snapshot fact: ${fact}`);
  }
  assertOrdered(
    formattedDoctor,
    ['Detected:', 'Mode:', 'Adapter compatibility', 'Bridge auth:', 'Install paths:'],
    'doctor preserves existing diagnostics before additive local facts',
  );

  const unavailableDoctor = indexModule.formatDoctor(makeSnapshot({
    adapterDiagnostics: [{
      ...makeSnapshot().adapterDiagnostics[0],
      binaryPath: null,
      detectedVersion: null,
      compatibilityStatus: 'unsupported',
      compatibilityReason: 'binary_not_found',
    }],
    bridgeAuthMetadata: {
      sharedSecretPresent: false,
      secretRotatedAt: null,
      secretRotationAgeMs: null,
    },
  }));
  for (const fallback of [
    '  Binary: Not found',
    '  Version: Not reported',
    '  Compatibility: Unsupported',
    '  Auth: Not reported',
    '  Shared secret: Not present',
    '  Secret rotated at: Not reported',
    '  Secret rotation age: Not reported',
  ]) {
    assert(unavailableDoctor.includes(fallback), `doctor uses exact unavailable label: ${fallback}`);
  }

  console.log('\n--- offline adapter and bridge-auth collection ---');
  const secretSentinel = 'DOCTOR_SHARED_SECRET_SENTINEL';
  const sessionSentinel = 'DOCTOR_SESSION_ID_SENTINEL';
  const envSentinel = 'DOCTOR_ENV_AUTH_SENTINEL';
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = envSentinel;
  let offlineSnapshot;
  try {
    offlineSnapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0, includeConfig: true, includeTabs: true },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(async () => makeDetection()),
        readBridgeAuthState: () => ({
          version: 1,
          allowedExtensionOrigin: 'chrome-extension://doctor-test',
          sessionSecret: secretSentinel,
          sessionId: sessionSentinel,
          rotatedAt: 9000,
        }),
        now: () => 10_000,
      },
    );
  } finally {
    if (previousAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
  }

  assertEqual(offlineSnapshot.diagnosticLayer, 'bridge', 'offline bridge keeps historical diagnostic-layer precedence');
  assertEqual(offlineSnapshot.checkedAt, '1970-01-01T00:00:10.000Z', 'injected clock controls the deterministic snapshot timestamp');
  assert(
    offlineSnapshot.compatibilityMatrix === compatibility.ADAPTER_COMPATIBILITY_MATRIX,
    'doctor snapshot reuses the canonical compatibility matrix object',
  );
  assertEqual(offlineSnapshot.adapterDiagnostics.length, 1, 'doctor emits one row for the shipped registry/matrix adapter');
  const doctorRow = offlineSnapshot.adapterDiagnostics[0];
  assertDeepEqual(
    Object.keys(doctorRow).sort(),
    [
      'adapterId',
      'authState',
      'binaryPath',
      'compatibilityReason',
      'compatibilityStatus',
      'detectedVersion',
      'displayLabel',
      'profileVersion',
    ],
    'adapter doctor row has exactly the eight allowed keys',
  );
  assertDeepEqual(
    doctorRow,
    {
      adapterId: 'claude-code',
      displayLabel: 'Claude Code',
      binaryPath: '/opt/claude',
      detectedVersion: '2.1.177',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'unknown',
      profileVersion: '2.1.177',
    },
    'doctor row reports canonical detector-backed facts without inferring Claude auth',
  );
  assertDeepEqual(
    offlineSnapshot.bridgeAuthMetadata,
    {
      sharedSecretPresent: true,
      secretRotatedAt: 9000,
      secretRotationAgeMs: 1000,
    },
    'bridge auth is immediately projected to the three allowed metadata fields',
  );
  assertDeepEqual(
    Object.keys(offlineSnapshot.bridgeAuthMetadata).sort(),
    ['secretRotatedAt', 'secretRotationAgeMs', 'sharedSecretPresent'],
    'bridge-auth doctor metadata has exactly three allowed keys',
  );
  const serializedOfflineSnapshot = JSON.stringify(offlineSnapshot);
  const formattedOfflineSnapshot = indexModule.formatDoctor(offlineSnapshot);
  assert(formattedOfflineSnapshot.includes('  Auth: Not reported'), 'offline doctor text keeps Claude auth explicitly unreported');
  for (const sentinel of [secretSentinel, sessionSentinel, envSentinel, 'allowedExtensionOrigin']) {
    assert(!serializedOfflineSnapshot.includes(sentinel), `serialized offline doctor snapshot omits ${sentinel}`);
    assert(!formattedOfflineSnapshot.includes(sentinel), `formatted offline doctor snapshot omits ${sentinel}`);
  }

  console.log('\n--- malformed injected authorities fail closed ---');
  const throwingSnapshot = await diagnostics.collectBridgeDiagnostics(
    { waitForExtensionMs: 0 },
    {
      bridgeFactory: makeOfflineBridge,
      adapterRegistry: makeAdapterRegistry(async () => {
        throw new Error('detector-secret-DO-NOT-LEAK');
      }),
      readBridgeAuthState: () => {
        throw new Error('auth-secret-DO-NOT-LEAK');
      },
      now: () => 10_000,
    },
  );
  assertDeepEqual(
    throwingSnapshot.adapterDiagnostics[0],
    {
      adapterId: 'claude-code',
      displayLabel: 'Claude Code',
      binaryPath: null,
      detectedVersion: null,
      compatibilityStatus: 'unsupported',
      compatibilityReason: 'binary_not_found',
      authState: 'unknown',
      profileVersion: '2.1.177',
    },
    'detector exceptions become deterministic unsupported facts',
  );
  assertDeepEqual(
    throwingSnapshot.bridgeAuthMetadata,
    {
      sharedSecretPresent: false,
      secretRotatedAt: null,
      secretRotationAgeMs: null,
    },
    'auth-reader exceptions become deterministic unavailable metadata',
  );
  assert(!JSON.stringify(throwingSnapshot).includes('DO-NOT-LEAK'), 'injected exception text never enters the snapshot');

  const unshippedRegistrySnapshot = await diagnostics.collectBridgeDiagnostics(
    { waitForExtensionMs: 0 },
    {
      bridgeFactory: makeOfflineBridge,
      adapterRegistry: Object.freeze({
        ids: () => Object.freeze(['future-adapter']),
        require: () => { throw new Error('must not resolve an unshipped row'); },
      }),
      readBridgeAuthState: () => null,
      now: () => 10_000,
    },
  );
  assertEqual(
    unshippedRegistrySnapshot.adapterDiagnostics.length,
    0,
    'doctor enumerates only adapter ids present in both the shipped registry and canonical matrix',
  );

  let accessorReads = 0;
  const accessorDetection = makeDetection();
  Object.defineProperty(accessorDetection, 'binary', {
    enumerable: true,
    get() {
      accessorReads++;
      return { realPath: '/poisoned/path' };
    },
  });
  const poisonedAuth = Object.create({ sessionSecret: 'INHERITED_SECRET' });
  poisonedAuth.rotatedAt = 9000;
  const poisonedSnapshot = await diagnostics.collectBridgeDiagnostics(
    { waitForExtensionMs: 0 },
    {
      bridgeFactory: makeOfflineBridge,
      adapterRegistry: makeAdapterRegistry(async () => accessorDetection),
      readBridgeAuthState: () => poisonedAuth,
      now: () => 10_000,
    },
  );
  assertEqual(accessorReads, 0, 'doctor never invokes an accessor on injected detector output');
  assertEqual(poisonedSnapshot.adapterDiagnostics[0].compatibilityStatus, 'unsupported', 'accessor-bearing detection fails closed');
  assertEqual(poisonedSnapshot.adapterDiagnostics[0].binaryPath, null, 'accessor-bearing path is discarded');
  assertDeepEqual(
    poisonedSnapshot.bridgeAuthMetadata,
    { sharedSecretPresent: false, secretRotatedAt: null, secretRotationAgeMs: null },
    'prototype-bearing auth state fails closed without inherited reads',
  );

  const futureAuthSnapshot = await diagnostics.collectBridgeDiagnostics(
    { waitForExtensionMs: 0 },
    {
      bridgeFactory: makeOfflineBridge,
      adapterRegistry: makeAdapterRegistry(async () => makeDetection({
        binary: { command: '/opt/claude', realPath: '/'.repeat(4097), argvPrefix: [] },
      })),
      readBridgeAuthState: () => ({ sessionSecret: secretSentinel, rotatedAt: 10_001 }),
      now: () => 10_000,
    },
  );
  assertEqual(futureAuthSnapshot.adapterDiagnostics[0].binaryPath, null, 'overlong detector path is discarded');
  assertEqual(futureAuthSnapshot.adapterDiagnostics[0].compatibilityStatus, 'unsupported', 'invalid retained path cannot assert compatibility');
  assertDeepEqual(
    futureAuthSnapshot.bridgeAuthMetadata,
    { sharedSecretPresent: true, secretRotatedAt: null, secretRotationAgeMs: null },
    'future rotation timestamp keeps presence but fails timestamp metadata closed',
  );

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
