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
    nativeHost: {
      installState: 'installed',
      expectedLocation: '/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json',
      registration: 'valid',
      allowlist: 'matches',
      launcher: 'reachable',
      daemon: 'reachable',
      reason: 'ok',
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

function extractSection(text, heading, nextHeading) {
  const start = text.indexOf(heading);
  const end = text.indexOf(nextHeading, start + heading.length);
  if (start < 0 || end < 0) return '';
  return text.slice(start, end).trimEnd();
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

function makeAdapterRegistry(
  claudeDetect,
  openCodeDetect = async () => makeOpenCodeDetection(),
  codexDetect = async () => makeCodexDetection(),
) {
  const adapters = Object.freeze({
    'claude-code': Object.freeze({ detect: claudeDetect }),
    opencode: Object.freeze({ detect: openCodeDetect }),
    codex: Object.freeze({ detect: codexDetect }),
  });
  return Object.freeze({
    ids() {
      return Object.freeze(['claude-code', 'opencode', 'codex']);
    },
    require(id) {
      if (!Object.hasOwn(adapters, id)) throw new Error('unknown adapter');
      return adapters[id];
    },
  });
}

function makeDetection(overrides = {}) {
  return {
    installed: true,
    version: '2.1.177',
    authState: 'unknown',
    binary: {
      command: '/opt/claude',
      realPath: '/opt/claude',
      argvPrefix: [],
    },
    profileVersion: '2.1.177',
    ...overrides,
  };
}

function makeOpenCodeDetection(overrides = {}) {
  return {
    installed: true,
    version: '1.14.25',
    authState: 'unknown',
    binary: {
      command: '/opt/opencode',
      realPath: '/opt/opencode',
      argvPrefix: [],
    },
    profileVersion: '1.14.25',
    ...overrides,
  };
}

function makeCodexDetection(overrides = {}) {
  return {
    installed: true,
    version: '0.142.5',
    authState: 'chatgpt',
    binary: {
      command: '/opt/codex',
      realPath: '/opt/codex',
      argvPrefix: [],
    },
    profileVersion: '0.142.5',
    ...overrides,
  };
}

function makeNativeHostInspection(overrides = {}) {
  return {
    platform: 'supported',
    expectedLocation: '/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json',
    registration: 'valid',
    registrationShadow: 'clear',
    allowlist: 'matches',
    runtime: 'valid',
    launcher: 'reachable',
    daemon: 'reachable',
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

  console.log('\n--- native host snapshot and browser-safe projection ---');
  const nativeReasonCases = [
    ['ok', {}, 'installed'],
    ['platform_unsupported', { platform: 'unsupported' }, 'unavailable'],
    ['inspection_unavailable', { daemon: 'unavailable' }, 'unavailable'],
    ['not_installed', {
      registration: 'missing',
      registrationShadow: 'not_reported',
      allowlist: 'not_reported',
      runtime: 'missing',
      launcher: 'missing',
      daemon: 'offline',
    }, 'not_installed'],
    ['registration_missing', {
      registration: 'missing',
      allowlist: 'not_reported',
      runtime: 'invalid',
      launcher: 'invalid',
      daemon: 'offline',
    }, 'invalid'],
    ['registration_invalid', {
      registration: 'invalid',
      allowlist: 'mismatch',
      runtime: 'invalid',
      launcher: 'invalid',
      daemon: 'offline',
    }, 'invalid'],
    ['registration_shadowed', {
      registrationShadow: 'shadowed',
      allowlist: 'mismatch',
      runtime: 'invalid',
      launcher: 'invalid',
      daemon: 'offline',
    }, 'invalid'],
    ['allowlist_mismatch', {
      allowlist: 'mismatch',
      runtime: 'invalid',
      launcher: 'invalid',
      daemon: 'offline',
    }, 'invalid'],
    ['runtime_missing', {
      runtime: 'missing',
      launcher: 'invalid',
      daemon: 'offline',
    }, 'invalid'],
    ['runtime_invalid', {
      runtime: 'invalid',
      launcher: 'invalid',
      daemon: 'offline',
    }, 'invalid'],
    ['launcher_missing', {
      launcher: 'missing',
      daemon: 'identity_mismatch',
    }, 'invalid'],
    ['launcher_invalid', {
      launcher: 'invalid',
      daemon: 'identity_mismatch',
    }, 'invalid'],
    ['daemon_identity_mismatch', { daemon: 'identity_mismatch' }, 'installed'],
    ['daemon_protocol_mismatch', { daemon: 'protocol_mismatch' }, 'installed'],
    ['daemon_offline', { daemon: 'offline' }, 'installed'],
  ];
  for (const [expectedReason, overrides, expectedInstallState] of nativeReasonCases) {
    let inspectorCalls = 0;
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(async () => makeDetection()),
        readBridgeAuthState: () => null,
        inspectNativeHost: async () => {
          inspectorCalls++;
          return makeNativeHostInspection(overrides);
        },
        now: () => 10_000,
      },
    );
    assertEqual(inspectorCalls, 1, `${expectedReason} calls the native inspector exactly once`);
    assertEqual(snapshot.nativeHost?.reason, expectedReason,
      `${expectedReason} follows the frozen first-failure precedence`);
    assertEqual(snapshot.nativeHost?.installState, expectedInstallState,
      `${expectedReason} derives the bounded install state`);
    assertEqual(snapshot.diagnosticLayer, 'bridge',
      `${expectedReason} does not alter the historical doctor layer`);
  }

  let nativeInspectorCalls = 0;
  let mutationCalls = 0;
  const collectionOrder = [];
  const nativeSentinels = [
    'NATIVE_MANIFEST_CONTENTS_SENTINEL',
    'NATIVE_REGISTRY_VALUE_SENTINEL',
    'NATIVE_REGISTRY_VIEW_SENTINEL',
    'NATIVE_LAUNCHER_PATH_SENTINEL',
    'NATIVE_RAW_ERROR_SENTINEL',
    'NATIVE_USERNAME_SENTINEL',
    'NATIVE_ENVIRONMENT_SENTINEL',
    'NATIVE_SECRET_SENTINEL',
    'NATIVE_SESSION_SENTINEL',
    'NATIVE_CHILD_OUTPUT_SENTINEL',
    'NATIVE_TASK_SENTINEL',
  ];
  const mutationSpy = async () => { mutationCalls++; };
  const safeExpectedLocation = '/Users/test/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json';
  const nativeSnapshot = await diagnostics.collectBridgeDiagnostics(
    { waitForExtensionMs: 0, includeConfig: true, includeTabs: true },
    {
      bridgeFactory: () => {
        const bridge = makeOfflineBridge();
        return {
          ...bridge,
          async connect() {
            collectionOrder.push('bridge');
            return bridge.connect();
          },
        };
      },
      adapterRegistry: makeAdapterRegistry(async () => makeDetection()),
      readBridgeAuthState: () => null,
      inspectNativeHost: async () => {
        nativeInspectorCalls++;
        collectionOrder.push('native');
        return makeNativeHostInspection({
          manifestContents: nativeSentinels[0],
          registryValue: nativeSentinels[1],
          registryView: nativeSentinels[2],
          launcherPath: nativeSentinels[3],
          rawError: nativeSentinels[4],
          username: nativeSentinels[5],
          environment: nativeSentinels[6],
          secret: nativeSentinels[7],
          session: nativeSentinels[8],
          childOutput: nativeSentinels[9],
          task: nativeSentinels[10],
        });
      },
      installNativeHost: mutationSpy,
      uninstallNativeHost: mutationSpy,
      wakeNativeHost: mutationSpy,
      startNativeHost: mutationSpy,
      repairNativeHost: mutationSpy,
      pairNativeHost: mutationSpy,
      rotateBridgeSessionSecret: mutationSpy,
      spawn: mutationSpy,
      now: () => 10_000,
    },
  );
  assertEqual(nativeInspectorCalls, 1, 'collector calls the native inspector once for one snapshot');
  assertEqual(mutationCalls, 0, 'doctor never calls any injected mutation, wake, pair, rotation, or spawn spy');
  assertDeepEqual(collectionOrder, ['native', 'bridge'], 'native inspection runs once before bridge probes');
  assert(Object.isFrozen(nativeSnapshot.nativeHost), 'native-host local snapshot is immutable');
  assertDeepEqual(
    Object.keys(nativeSnapshot.nativeHost || {}),
    ['installState', 'expectedLocation', 'registration', 'allowlist', 'launcher', 'daemon', 'reason'],
    'native-host local snapshot has exactly seven ordered keys',
  );
  assertEqual(nativeSnapshot.nativeHost?.expectedLocation, safeExpectedLocation,
    'local JSON retains only the bounded expected repair location');
  const projectNativeHostBrowserStatus = diagnostics.projectNativeHostBrowserStatus;
  assertEqual(typeof projectNativeHostBrowserStatus, 'function',
    'diagnostics exports an explicit browser-safe native-host projector');
  const browserNativeHost = typeof projectNativeHostBrowserStatus === 'function'
    ? projectNativeHostBrowserStatus(nativeSnapshot.nativeHost)
    : null;
  assertDeepEqual(
    Object.keys(browserNativeHost || {}),
    ['installState', 'registration', 'allowlist', 'launcher', 'daemon'],
    'browser-safe native projection reconstructs exactly five ordered enum keys',
  );
  assert(Object.isFrozen(browserNativeHost), 'browser-safe native projection is immutable');
  const serializedNativeSnapshot = JSON.stringify(nativeSnapshot);
  const serializedBrowserNativeHost = JSON.stringify(browserNativeHost);
  const formattedNativeSnapshot = indexModule.formatDoctor(nativeSnapshot);
  assert(!serializedBrowserNativeHost.includes(safeExpectedLocation),
    'browser-safe native projection omits the expected local location');
  assert(!serializedBrowserNativeHost.includes('reason'),
    'browser-safe native projection omits the local stable reason');
  for (const sentinel of nativeSentinels) {
    assert(!serializedNativeSnapshot.includes(sentinel), `local JSON omits raw native sentinel ${sentinel}`);
    assert(!formattedNativeSnapshot.includes(sentinel), `doctor text omits raw native sentinel ${sentinel}`);
    assert(!serializedBrowserNativeHost.includes(sentinel), `browser projection omits raw native sentinel ${sentinel}`);
  }

  const malformedNativeCases = [
    ['prototype', Object.assign(Object.create({ inherited: 'NATIVE_INHERITED_SENTINEL' }), makeNativeHostInspection())],
    ['overlong location', makeNativeHostInspection({ expectedLocation: `/${'x'.repeat(4097)}` })],
    ['unknown enum', makeNativeHostInspection({ launcher: 'NATIVE_UNKNOWN_LAUNCHER_SENTINEL' })],
    ['contradictory facts', makeNativeHostInspection({ registration: 'valid', allowlist: 'not_reported' })],
  ];
  for (const [label, inspection] of malformedNativeCases) {
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(async () => makeDetection()),
        readBridgeAuthState: () => null,
        inspectNativeHost: async () => inspection,
        now: () => 10_000,
      },
    );
    assertDeepEqual(
      snapshot.nativeHost,
      {
        installState: 'unavailable',
        expectedLocation: 'Not reported',
        registration: 'unavailable',
        allowlist: 'not_reported',
        launcher: 'unavailable',
        daemon: 'unavailable',
        reason: 'inspection_unavailable',
      },
      `${label} native inspection fails closed to one bounded unavailable snapshot`,
    );
  }

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
    'Native messaging host:',
    '  Install state: Installed',
    `  Expected location: ${formattedJson.nativeHost.expectedLocation}`,
    '  Manifest/registry: Valid',
    '  Chrome allowlist: Matches',
    '  Launcher: Reachable',
    '  Daemon: Reachable',
    '  Reason: ok',
  ];
  for (const fact of expectedDoctorFacts) {
    assert(formattedDoctor.includes(fact), `doctor text derives JSON snapshot fact: ${fact}`);
  }
  assertOrdered(
    formattedDoctor,
    [
      'Detected:',
      'Mode:',
      'Adapter compatibility',
      'Bridge auth:',
      'Native messaging host:',
      'Install paths:',
    ],
    'doctor preserves existing diagnostics before additive local facts',
  );
  assertEqual(
    extractSection(formattedDoctor, 'Native messaging host:', 'Install paths:'),
    [
      'Native messaging host:',
      '  Install state: Installed',
      `  Expected location: ${formattedJson.nativeHost.expectedLocation}`,
      '  Manifest/registry: Valid',
      '  Chrome allowlist: Matches',
      '  Launcher: Reachable',
      '  Daemon: Reachable',
      '  Reason: ok',
    ].join('\n'),
    'doctor renders the exact approved seven-line native-host fact block',
  );

  const nativeLabelCases = [
    [{
      installState: 'not_installed',
      expectedLocation: 'Not reported',
      registration: 'missing',
      allowlist: 'not_reported',
      launcher: 'missing',
      daemon: 'offline',
      reason: 'not_installed',
    }, [
      '  Install state: Not installed',
      '  Manifest/registry: Missing',
      '  Chrome allowlist: Not reported',
      '  Launcher: Missing',
      '  Daemon: Offline',
    ]],
    [{
      installState: 'invalid',
      expectedLocation: '/bounded/invalid/location',
      registration: 'invalid',
      allowlist: 'mismatch',
      launcher: 'invalid',
      daemon: 'unavailable',
      reason: 'registration_invalid',
    }, [
      '  Install state: Invalid',
      '  Manifest/registry: Invalid',
      '  Chrome allowlist: Mismatch',
      '  Launcher: Invalid',
      '  Daemon: Unavailable',
    ]],
    [{
      installState: 'unavailable',
      expectedLocation: 'Not reported',
      registration: 'unavailable',
      allowlist: 'not_reported',
      launcher: 'unavailable',
      daemon: 'unavailable',
      reason: 'inspection_unavailable',
    }, [
      '  Install state: Unavailable',
      '  Manifest/registry: Unavailable',
      '  Chrome allowlist: Not reported',
      '  Launcher: Unavailable',
      '  Daemon: Unavailable',
    ]],
  ];
  for (const [nativeHost, expectedLabels] of nativeLabelCases) {
    const doctorText = indexModule.formatDoctor(makeSnapshot({ nativeHost }));
    for (const label of expectedLabels) {
      assert(doctorText.includes(label), `doctor title-cases closed native value: ${label}`);
    }
    assert(doctorText.includes(`  Expected location: ${nativeHost.expectedLocation}`),
      'doctor prints only the normalized local expected location');
    assert(doctorText.includes(`  Reason: ${nativeHost.reason}`),
      'doctor prints the stable normalized reason code unchanged');
  }

  const healthyWithoutNativeHost = makeSnapshot({
    nativeHost: {
      installState: 'not_installed',
      expectedLocation: 'Not reported',
      registration: 'missing',
      allowlist: 'not_reported',
      launcher: 'missing',
      daemon: 'offline',
      reason: 'not_installed',
    },
  });
  assertEqual(
    diagnostics.classifyDoctorLayer(healthyWithoutNativeHost),
    'healthy',
    'optional native-host absence leaves a historically healthy doctor snapshot healthy',
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
        adapterRegistry: makeAdapterRegistry(
          async () => makeDetection(),
          async () => makeOpenCodeDetection({
            authState: 'DOCTOR_OPENCODE_AUTH_SENTINEL',
            billing: 'DOCTOR_OPENCODE_BILLING_SENTINEL',
            model: 'DOCTOR_OPENCODE_MODEL_SENTINEL',
            config: 'DOCTOR_OPENCODE_CONFIG_SENTINEL',
            nativeBody: 'DOCTOR_OPENCODE_NATIVE_BODY_SENTINEL',
            diagnostic: {
              code: 'version_unsupported',
              message: 'DOCTOR_OPENCODE_DIAGNOSTIC_SENTINEL',
            },
          }),
          async () => makeCodexDetection({
            billing: 'DOCTOR_CODEX_BILLING_SENTINEL',
            model: 'DOCTOR_CODEX_MODEL_SENTINEL',
            config: 'DOCTOR_CODEX_CONFIG_SENTINEL',
            nativeBody: 'DOCTOR_CODEX_NATIVE_BODY_SENTINEL',
          }),
        ),
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
  assertEqual(offlineSnapshot.adapterDiagnostics.length, 3, 'doctor emits the exact three-row registry/matrix roster');
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
    offlineSnapshot.adapterDiagnostics[1],
    {
      adapterId: 'opencode',
      displayLabel: 'OpenCode',
      binaryPath: '/opt/opencode',
      detectedVersion: '1.14.25',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'unknown',
      profileVersion: '1.14.25',
    },
    'OpenCode doctor row retains bounded local path/version facts but never infers auth',
  );
  assertDeepEqual(
    offlineSnapshot.adapterDiagnostics[2],
    {
      adapterId: 'codex',
      displayLabel: 'Codex',
      binaryPath: '/opt/codex',
      detectedVersion: '0.142.5',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'chatgpt',
      profileVersion: '0.142.5',
    },
    'Codex doctor row publishes only retained local facts and its safe auth enum',
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
  for (const sentinel of [
    secretSentinel,
    sessionSentinel,
    envSentinel,
    'allowedExtensionOrigin',
    'DOCTOR_OPENCODE_AUTH_SENTINEL',
    'DOCTOR_OPENCODE_BILLING_SENTINEL',
    'DOCTOR_OPENCODE_MODEL_SENTINEL',
    'DOCTOR_OPENCODE_CONFIG_SENTINEL',
    'DOCTOR_OPENCODE_NATIVE_BODY_SENTINEL',
    'DOCTOR_OPENCODE_DIAGNOSTIC_SENTINEL',
    'DOCTOR_CODEX_BILLING_SENTINEL',
    'DOCTOR_CODEX_MODEL_SENTINEL',
    'DOCTOR_CODEX_CONFIG_SENTINEL',
    'DOCTOR_CODEX_NATIVE_BODY_SENTINEL',
  ]) {
    assert(!serializedOfflineSnapshot.includes(sentinel), `serialized offline doctor snapshot omits ${sentinel}`);
    assert(!formattedOfflineSnapshot.includes(sentinel), `formatted offline doctor snapshot omits ${sentinel}`);
  }

  console.log('\n--- deterministic OpenCode doctor evidence ---');
  const openCodeDoctorCases = [
    ['exact profile', makeOpenCodeDetection(), {
      binaryPath: '/opt/opencode',
      detectedVersion: '1.14.25',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
    }],
    ['newer retained profile', makeOpenCodeDetection({
      installed: false,
      version: '1.14.26',
      profileVersion: null,
      diagnostic: { code: 'version_unsupported', message: 'NEWER_DIAGNOSTIC_SENTINEL' },
    }), {
      binaryPath: '/opt/opencode',
      detectedVersion: '1.14.26',
      compatibilityStatus: 'degraded',
      compatibilityReason: 'newer_than_tested_range',
    }],
    ['missing binary', makeOpenCodeDetection({
      installed: false,
      version: null,
      binary: null,
      profileVersion: null,
      diagnostic: { code: 'binary_missing', message: 'MISSING_DIAGNOSTIC_SENTINEL' },
    }), {
      binaryPath: null,
      detectedVersion: null,
      compatibilityStatus: 'unsupported',
      compatibilityReason: 'binary_not_found',
    }],
    ['malformed version', makeOpenCodeDetection({
      installed: false,
      version: null,
      profileVersion: null,
      diagnostic: { code: 'version_unparseable', message: 'MALFORMED_DIAGNOSTIC_SENTINEL' },
    }), {
      binaryPath: '/opt/opencode',
      detectedVersion: null,
      compatibilityStatus: 'unsupported',
      compatibilityReason: 'version_malformed',
    }],
    ['changed binary identity', makeOpenCodeDetection({
      installed: false,
      version: null,
      binary: null,
      profileVersion: null,
      diagnostic: { code: 'binary_changed', message: 'CHANGED_DIAGNOSTIC_SENTINEL' },
    }), {
      binaryPath: null,
      detectedVersion: null,
      compatibilityStatus: 'unsupported',
      compatibilityReason: 'binary_not_found',
    }],
  ];
  for (const [label, detection, expected] of openCodeDoctorCases) {
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(async () => makeDetection(), async () => detection),
        readBridgeAuthState: () => null,
        now: () => 10_000,
      },
    );
    assertDeepEqual(
      snapshot.adapterDiagnostics[1],
      {
        adapterId: 'opencode',
        displayLabel: 'OpenCode',
        ...expected,
        authState: 'unknown',
        profileVersion: '1.14.25',
      },
      `${label} maps to the canonical local-only OpenCode doctor row`,
    );
    const serialized = JSON.stringify(snapshot);
    const formatted = indexModule.formatDoctor(snapshot);
    for (const sentinel of [
      'NEWER_DIAGNOSTIC_SENTINEL',
      'MISSING_DIAGNOSTIC_SENTINEL',
      'MALFORMED_DIAGNOSTIC_SENTINEL',
      'CHANGED_DIAGNOSTIC_SENTINEL',
    ]) {
      assert(!serialized.includes(sentinel), `${label} JSON omits raw detector diagnostic text`);
      assert(!formatted.includes(sentinel), `${label} text omits raw detector diagnostic text`);
    }
  }

  console.log('\n--- deterministic Codex doctor evidence ---');
  for (const [label, detection, expected] of [
    ['supported ChatGPT', makeCodexDetection(), {
      binaryPath: '/opt/codex',
      detectedVersion: '0.142.5',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'chatgpt',
    }],
    ['degraded stored API key', makeCodexDetection({
      version: '0.144.6',
      authState: 'api_key',
      profileVersion: '0.142.5',
    }), {
      binaryPath: '/opt/codex',
      detectedVersion: '0.144.6',
      compatibilityStatus: 'degraded',
      compatibilityReason: 'newer_than_tested_range',
      authState: 'api_key',
    }],
    ['unauthenticated', makeCodexDetection({ authState: 'unauthenticated' }), {
      binaryPath: '/opt/codex',
      detectedVersion: '0.142.5',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'unauthenticated',
    }],
    ['unknown native state', makeCodexDetection({ authState: 'authenticated' }), {
      binaryPath: '/opt/codex',
      detectedVersion: '0.142.5',
      compatibilityStatus: 'supported',
      compatibilityReason: 'within_tested_range',
      authState: 'unknown',
    }],
  ]) {
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(
          async () => makeDetection(),
          async () => makeOpenCodeDetection(),
          async () => detection,
        ),
        readBridgeAuthState: () => null,
        now: () => 10_000,
      },
    );
    assertDeepEqual(snapshot.adapterDiagnostics[2], {
      adapterId: 'codex',
      displayLabel: 'Codex',
      ...expected,
      profileVersion: '0.142.5',
    }, `${label} maps to the canonical safe Codex doctor row`);
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

  let oversizedClockSnapshot = null;
  let oversizedClockError = null;
  try {
    oversizedClockSnapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(async () => makeDetection()),
        readBridgeAuthState: () => null,
        now: () => 8_640_000_000_000_001,
      },
    );
  } catch (error) {
    oversizedClockError = error;
  }
  assertEqual(oversizedClockError, null,
    'a safe integer outside the ECMAScript Date range cannot throw from doctor collection');
  if (oversizedClockSnapshot) {
    assertEqual(oversizedClockSnapshot.checkedAt, '1970-01-01T00:00:00.000Z',
      'an out-of-range injected clock fails closed to the epoch timestamp');
    const serializedOversizedClock = JSON.stringify(oversizedClockSnapshot);
    assert(serializedOversizedClock.length < 100_000,
      'the out-of-range clock still returns one bounded diagnostics snapshot');
    assert(!serializedOversizedClock.includes('Invalid time value'),
      'Date exception text never enters the bounded diagnostics snapshot');
  }

  console.log('\n--- doctor roster mismatch fails closed ---');
  let mismatchedRequireCalls = 0;
  let rosterAccessorReads = 0;
  const accessorRegistry = {};
  Object.defineProperty(accessorRegistry, 'ids', {
    enumerable: true,
    get() {
      rosterAccessorReads++;
      return () => ['claude-code', 'opencode', 'codex'];
    },
  });
  accessorRegistry.require = () => {
    mismatchedRequireCalls++;
    return Object.freeze({ detect: async () => makeDetection() });
  };
  const prototypeRegistry = Object.create({
    ids: () => Object.freeze(['claude-code', 'opencode', 'codex']),
    require: () => Object.freeze({ detect: async () => makeDetection() }),
  });
  const rosterCases = [
    ['missing', ['claude-code', 'opencode']],
    ['duplicate', ['claude-code', 'opencode', 'codex', 'codex']],
    ['orphan', ['claude-code', 'opencode', 'codex', 'foreign']],
    ['case variant', ['claude-code', 'OpenCode', 'codex']],
    ['reordered', ['opencode', 'claude-code', 'codex']],
  ].map(([label, ids]) => [label, Object.freeze({
    ids: () => Object.freeze([...ids]),
    require: () => {
      mismatchedRequireCalls++;
      return Object.freeze({ detect: async () => makeDetection() });
    },
  })]);
  rosterCases.push(['accessor', accessorRegistry], ['prototype', prototypeRegistry]);
  const closedRosterRows = compatibility.ADAPTER_COMPATIBILITY_MATRIX.adapters.map((contract) => ({
    adapterId: contract.adapterId,
    displayLabel: contract.displayLabel,
    binaryPath: null,
    detectedVersion: null,
    compatibilityStatus: 'unsupported',
    compatibilityReason: 'matrix_invalid',
    authState: 'unknown',
    profileVersion: contract.profileVersion,
  }));
  for (const [label, adapterRegistry] of rosterCases) {
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry,
        readBridgeAuthState: () => null,
        now: () => 10_000,
      },
    );
    assertDeepEqual(snapshot.adapterDiagnostics, closedRosterRows,
      `${label} doctor registry mismatch returns the exact closed canonical roster`);
  }
  assertEqual(mismatchedRequireCalls, 0, 'roster mismatch never resolves or detects an adapter');
  assertEqual(rosterAccessorReads, 0, 'roster validation never invokes an ids accessor');

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

  let openCodeAccessorReads = 0;
  const openCodeAccessorDetection = {};
  for (const key of ['binary', 'version']) {
    Object.defineProperty(openCodeAccessorDetection, key, {
      enumerable: true,
      get() {
        openCodeAccessorReads++;
        return key === 'binary' ? makeOpenCodeDetection().binary : '1.14.25';
      },
    });
  }
  const openCodePrototypeDetection = Object.create(makeOpenCodeDetection());
  for (const [label, unsafeDetection] of [
    ['accessor', openCodeAccessorDetection],
    ['prototype', openCodePrototypeDetection],
  ]) {
    const snapshot = await diagnostics.collectBridgeDiagnostics(
      { waitForExtensionMs: 0 },
      {
        bridgeFactory: makeOfflineBridge,
        adapterRegistry: makeAdapterRegistry(
          async () => makeDetection(),
          async () => unsafeDetection,
        ),
        readBridgeAuthState: () => null,
        now: () => 10_000,
      },
    );
    assertDeepEqual(snapshot.adapterDiagnostics[1], {
      ...closedRosterRows[1],
      compatibilityReason: 'binary_not_found',
    },
      `${label} OpenCode detector evidence fails closed without inherited or computed reads`);
  }
  assertEqual(openCodeAccessorReads, 0, 'doctor never invokes OpenCode detector accessors');

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
