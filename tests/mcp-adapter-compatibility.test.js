'use strict';

/**
 * Phase 62 Plan 01 -- daemon-owned adapter compatibility policy.
 *
 * No provider binary, network, browser, or authentication source is used.
 * Run: npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const compatibilityBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'compatibility.js',
);
const serveDelegationBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'serve-delegation.js',
);

const ROW_KEYS = Object.freeze([
  'adapterId',
  'capabilities',
  'displayLabel',
  'expectedNormalizedSequence',
  'fixtureManifest',
  'minimumVersion',
  'profileVersion',
  'requiredInitFields',
  'requiredResultFields',
  'supportedMajor',
  'testedThroughVersion',
]);

const ALL_REASONS = Object.freeze([
  'within_tested_range',
  'newer_than_tested_range',
  'evidence_stale',
  'binary_not_found',
  'version_missing',
  'version_malformed',
  'below_minimum',
  'wrong_major',
  'adapter_unshipped',
  'matrix_invalid',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), 'every matrix/projection object is recursively frozen');
  for (const item of Object.values(value)) assertDeepFrozen(item, seen);
}

function assertClassification(actual, status, reason, adapterId = 'claude-code') {
  assert.deepEqual(Object.keys(actual).sort(), [
    'adapterId',
    'displayLabel',
    'reason',
    'status',
  ]);
  assert.equal(actual.adapterId, adapterId);
  assert.equal(actual.status, status);
  assert.equal(actual.reason, reason);
  assert.equal(typeof actual.displayLabel, 'string');
  assert.ok(actual.displayLabel.length > 0 && actual.displayLabel.length <= 64);
  assertDeepFrozen(actual);
}

function retainedDetection(version, binaryPath, overrides = {}) {
  return {
    installed: version !== null && binaryPath !== null,
    version,
    authState: 'unknown',
    binary: binaryPath === null ? null : {
      command: binaryPath,
      realPath: binaryPath,
      argvPrefix: [],
    },
    profileVersion: version,
    ...overrides,
  };
}

function compatibilityRegistry(ids, detections, tracker = { requireCalls: 0 }) {
  return Object.freeze({
    ids() {
      return Object.freeze([...ids]);
    },
    require(adapterId) {
      tracker.requireCalls += 1;
      if (!Object.hasOwn(detections, adapterId)) throw new Error('unknown fixture adapter');
      return Object.freeze({ detect: async () => detections[adapterId] });
    },
  });
}

async function requestServeCompatibility(serveDelegation, registry, checkedAt = 1_784_222_000_000) {
  let handleExtRequest = null;
  const bridge = {
    currentMode: 'hub',
    topology: {
      instanceId: 'compatibility-test',
      mode: 'hub',
      hubConnected: true,
      extensionConnected: true,
      relayCount: 0,
      pendingRequestCount: 0,
      activeHubInstanceId: 'compatibility-test',
      lastExtensionHeartbeatAt: checkedAt,
      lastDisconnectReason: null,
    },
    async connect() {},
    disconnect() {},
  };
  const supervisor = {
    async recover() { return { spawnAvailable: true }; },
    async close() { return { cancelled: 0, failed: 0, alreadySettled: 0 }; },
    async handleExtRequest() { throw new Error('compatibility request reached spawn routing'); },
  };
  const running = await serveDelegation.startServeDelegation({
    host: '127.0.0.1',
    port: 7225,
    dependencies: {
      createBridge(options) {
        handleExtRequest = options.handleExtRequest;
        return bridge;
      },
      createQueue: () => ({}),
      startHttp: async () => ({
        endpoint: 'http://127.0.0.1:7225',
        healthEndpoint: 'http://127.0.0.1:7225/health',
        markServeReady() {},
        async close() {},
      }),
      createSupervisor: () => supervisor,
      createCompatibilityRegistry: () => registry,
      now: () => checkedAt,
      prepareBridgeAuth: () => undefined,
      pushInventory: async () => undefined,
      registerSignal: () => undefined,
      exit: () => undefined,
    },
  });
  try {
    assert.equal(typeof handleExtRequest, 'function', 'serve harness captures the extension request handler');
    return await handleExtRequest(
      { method: 'adapter.compatibility', payload: {} },
      () => undefined,
      { connectionId: 'compatibility-test' },
    );
  } finally {
    await running.shutdown();
  }
}

async function main() {
  const compatibility = await import(pathToFileURL(compatibilityBuildPath).href);
  const serveDelegation = await import(pathToFileURL(serveDelegationBuildPath).href);
  const {
    ADAPTER_COMPATIBILITY_MATRIX,
    COMPATIBILITY_REASONS,
    COMPATIBILITY_STATUSES,
    classifyAdapterCompatibility,
    createSafeCompatibilitySnapshot,
    extractAdapterVersion,
    getAdapterCompatibilityContract,
    parseAdapterCompatibilityMatrix,
  } = compatibility;

  assert.deepEqual(COMPATIBILITY_STATUSES, ['supported', 'degraded', 'unsupported']);
  assert.deepEqual(COMPATIBILITY_REASONS, ALL_REASONS);
  assertDeepFrozen(COMPATIBILITY_STATUSES);
  assertDeepFrozen(COMPATIBILITY_REASONS);

  assert.deepEqual(Object.keys(ADAPTER_COMPATIBILITY_MATRIX).sort(), ['adapters', 'schemaVersion']);
  assert.equal(ADAPTER_COMPATIBILITY_MATRIX.schemaVersion, 1);
  assert.equal(ADAPTER_COMPATIBILITY_MATRIX.adapters.length, 2);
  assert.deepEqual(
    ADAPTER_COMPATIBILITY_MATRIX.adapters.map((candidate) => candidate.adapterId),
    ['claude-code', 'opencode'],
  );
  const row = ADAPTER_COMPATIBILITY_MATRIX.adapters[0];
  assert.deepEqual(Object.keys(row).sort(), ROW_KEYS);
  assert.deepEqual(row, {
    adapterId: 'claude-code',
    capabilities: {
      taskMode: true,
      chatMode: false,
      resume: false,
      serverMode: false,
    },
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
  });
  const openCodeRow = ADAPTER_COMPATIBILITY_MATRIX.adapters[1];
  assert.deepEqual(Object.keys(openCodeRow).sort(), ROW_KEYS);
  assert.deepEqual(openCodeRow, {
    adapterId: 'opencode',
    capabilities: {
      taskMode: true,
      chatMode: false,
      resume: false,
      serverMode: true,
    },
    displayLabel: 'OpenCode',
    profileVersion: '1.14.25',
    minimumVersion: '1.14.25',
    testedThroughVersion: '1.14.25',
    supportedMajor: 1,
    fixtureManifest: 'tests/fixtures/agent-streams/opencode-1.14.25/manifest.json',
    requiredInitFields: [
      'type',
      'timestamp',
      'sessionID',
      'part.id',
      'part.sessionID',
      'part.messageID',
      'part.type',
    ],
    requiredResultFields: [
      'type',
      'timestamp',
      'sessionID',
      'part.id',
      'part.sessionID',
      'part.messageID',
      'part.type',
      'part.reason',
      'part.cost',
      'part.tokens',
    ],
    expectedNormalizedSequence: [
      'init',
      'assistant_delta',
      'assistant',
      'tool_use',
      'tool_result',
      'tool_use',
      'tool_result',
      'assistant',
      'result',
    ],
  });
  assertDeepFrozen(ADAPTER_COMPATIBILITY_MATRIX);
  assert.strictEqual(getAdapterCompatibilityContract('claude-code'), row);
  assert.strictEqual(getAdapterCompatibilityContract('opencode'), openCodeRow);
  assert.equal(getAdapterCompatibilityContract('codex'), null);
  assert.equal(getAdapterCompatibilityContract('OpenCode'), null);

  assert.equal(extractAdapterVersion('Claude Code 2.1.177'), '2.1.177');
  assert.equal(extractAdapterVersion('2.1.178\n'), '2.1.178');
  assert.equal(extractAdapterVersion('2.1.177-rc.1'), null);
  assert.equal(extractAdapterVersion('02.1.177'), null);
  assert.equal(extractAdapterVersion('version 2.1'), null);
  assert.equal(extractAdapterVersion(''), null);
  assert.equal(extractAdapterVersion('x'.repeat(65_537)), null);

  assertClassification(
    classifyAdapterCompatibility('claude-code', '2.1.177'),
    'supported',
    'within_tested_range',
  );
  assertClassification(
    classifyAdapterCompatibility('claude-code', '2.1.178'),
    'degraded',
    'newer_than_tested_range',
  );
  assertClassification(
    classifyAdapterCompatibility('claude-code', '2.1.176'),
    'unsupported',
    'below_minimum',
  );
  assertClassification(
    classifyAdapterCompatibility('claude-code', '3.0.0'),
    'unsupported',
    'wrong_major',
  );
  assertClassification(
    classifyAdapterCompatibility('claude-code', null),
    'unsupported',
    'version_missing',
  );
  assertClassification(
    classifyAdapterCompatibility('claude-code', ''),
    'unsupported',
    'version_missing',
  );
  for (const malformed of [
    '2.1',
    '2.1.177-rc.1',
    'v2.1.177',
    '02.1.177',
    '2.1.177.0',
    '999999999999999999999.1.1',
    21177,
    { version: '2.1.177' },
  ]) {
    assertClassification(
      classifyAdapterCompatibility('claude-code', malformed),
      'unsupported',
      'version_malformed',
    );
  }
  assertClassification(
    classifyAdapterCompatibility('claude-code', { binaryFound: false, version: null }),
    'unsupported',
    'binary_not_found',
  );
  assertClassification(
    classifyAdapterCompatibility('claude-code', { binaryFound: true, version: null }),
    'unsupported',
    'version_missing',
  );
  assertClassification(
    classifyAdapterCompatibility('opencode', '1.14.25'),
    'supported',
    'within_tested_range',
    'opencode',
  );
  assertClassification(
    classifyAdapterCompatibility('opencode', '1.14.26'),
    'degraded',
    'newer_than_tested_range',
    'opencode',
  );
  assertClassification(
    classifyAdapterCompatibility('opencode', '1.14.24'),
    'unsupported',
    'below_minimum',
    'opencode',
  );
  assertClassification(
    classifyAdapterCompatibility('opencode', '2.0.0'),
    'unsupported',
    'wrong_major',
    'opencode',
  );
  assertClassification(
    classifyAdapterCompatibility('codex', '1.14.25'),
    'unsupported',
    'adapter_unshipped',
    'codex',
  );

  const invalidMatrix = clone(ADAPTER_COMPATIBILITY_MATRIX);
  invalidMatrix.adapters[0].minimumVersion = '2.1.178';
  assert.equal(parseAdapterCompatibilityMatrix(invalidMatrix), null);
  assertClassification(
    classifyAdapterCompatibility('claude-code', '2.1.177', invalidMatrix),
    'unsupported',
    'matrix_invalid',
  );

  const supported = classifyAdapterCompatibility('claude-code', '2.1.177');
  const openCodeSupported = classifyAdapterCompatibility('opencode', '1.14.25');
  const snapshot = createSafeCompatibilitySnapshot(
    1_784_222_000_000,
    [supported, openCodeSupported],
  );
  assert.deepEqual(snapshot, {
    schemaVersion: 1,
    checkedAt: 1_784_222_000_000,
    adapters: [{
      adapterId: 'claude-code',
      displayLabel: 'Claude Code',
      status: 'supported',
      reason: 'within_tested_range',
    }, {
      adapterId: 'opencode',
      displayLabel: 'OpenCode',
      status: 'supported',
      reason: 'within_tested_range',
    }],
  });
  assert.deepEqual(Object.keys(snapshot).sort(), ['adapters', 'checkedAt', 'schemaVersion']);
  assert.deepEqual(Object.keys(snapshot.adapters[0]).sort(), [
    'adapterId',
    'displayLabel',
    'reason',
    'status',
  ]);
  assertDeepFrozen(snapshot);
  const serializedSnapshot = JSON.stringify(snapshot);
  for (const forbidden of [
    '2.1.177',
    'manifest.json',
    '/fixture/bin/claude',
    'session-secret-canary',
    'provider-prompt-canary',
    'ANTHROPIC_API_KEY',
  ]) {
    assert.equal(serializedSnapshot.includes(forbidden), false, `safe projection excludes ${forbidden}`);
  }

  const canonicalClosedRows = ADAPTER_COMPATIBILITY_MATRIX.adapters.map((contract) => ({
    adapterId: contract.adapterId,
    displayLabel: contract.displayLabel,
    status: 'unsupported',
    reason: 'matrix_invalid',
  }));
  const daemonSentinels = [
    '/private/CLAUDE_EXECUTABLE_SENTINEL',
    '/private/OPENCODE_EXECUTABLE_SENTINEL',
    'DAEMON_RAW_VERSION_SENTINEL',
    'DAEMON_AUTH_SENTINEL',
    'DAEMON_BILLING_SENTINEL',
    'DAEMON_MODEL_SENTINEL',
    'DAEMON_CONFIG_SENTINEL',
    'DAEMON_NATIVE_BODY_SENTINEL',
    'DAEMON_DIAGNOSTIC_SENTINEL',
    'DAEMON_TOPOLOGY_SENTINEL',
    'DAEMON_ENDPOINT_SENTINEL',
    'DAEMON_PORT_SENTINEL',
    'DAEMON_SECRET_SENTINEL',
  ];
  const daemonSnapshot = await requestServeCompatibility(
    serveDelegation,
    compatibilityRegistry(
      ['claude-code', 'opencode'],
      {
        'claude-code': retainedDetection('2.1.177', daemonSentinels[0]),
        opencode: retainedDetection('1.14.25', daemonSentinels[1], {
          rawVersion: daemonSentinels[2],
          auth: daemonSentinels[3],
          billing: daemonSentinels[4],
          model: daemonSentinels[5],
          config: daemonSentinels[6],
          nativeBody: daemonSentinels[7],
          diagnostic: { code: 'agent_protocol_drift', message: daemonSentinels[8] },
          topology: daemonSentinels[9],
          endpoint: daemonSentinels[10],
          port: daemonSentinels[11],
          secret: daemonSentinels[12],
        }),
      },
    ),
  );
  assert.deepEqual(daemonSnapshot, snapshot,
    'serve compatibility returns the exact two-row browser-safe canonical snapshot');
  assertDeepFrozen(daemonSnapshot);
  const serializedDaemonSnapshot = JSON.stringify(daemonSnapshot);
  for (const sentinel of daemonSentinels) {
    assert.equal(serializedDaemonSnapshot.includes(sentinel), false,
      `daemon safe projection excludes ${sentinel}`);
  }

  const daemonEvidenceCases = [
    ['exact profile', retainedDetection('1.14.25', '/opt/opencode'), 'supported', 'within_tested_range'],
    ['newer retained profile', retainedDetection('1.14.26', '/opt/opencode', {
      installed: false,
      profileVersion: null,
      diagnostic: { code: 'version_unsupported', message: 'NEWER_MESSAGE_SENTINEL' },
    }), 'degraded', 'newer_than_tested_range'],
    ['missing binary', retainedDetection(null, null, {
      installed: false,
      profileVersion: null,
      diagnostic: { code: 'binary_missing', message: 'MISSING_MESSAGE_SENTINEL' },
    }), 'unsupported', 'binary_not_found'],
    ['malformed version', retainedDetection(null, '/opt/opencode', {
      installed: false,
      profileVersion: null,
      diagnostic: { code: 'version_unparseable', message: 'MALFORMED_MESSAGE_SENTINEL' },
    }), 'unsupported', 'version_malformed'],
    ['changed binary identity', retainedDetection(null, null, {
      installed: false,
      profileVersion: null,
      diagnostic: { code: 'binary_changed', message: 'CHANGED_MESSAGE_SENTINEL' },
    }), 'unsupported', 'binary_not_found'],
  ];
  for (const [label, openCodeDetection, expectedStatus, expectedReason] of daemonEvidenceCases) {
    const projected = await requestServeCompatibility(
      serveDelegation,
      compatibilityRegistry(
        ['claude-code', 'opencode'],
        {
          'claude-code': retainedDetection('2.1.177', '/opt/claude'),
          opencode: openCodeDetection,
        },
      ),
      1_784_222_000_001,
    );
    assert.deepEqual(projected.adapters[1], {
      adapterId: 'opencode',
      displayLabel: 'OpenCode',
      status: expectedStatus,
      reason: expectedReason,
    }, `${label} produces one deterministic OpenCode safe row without omission`);
    assert.equal(projected.adapters.length, 2, `${label} preserves the exact two-provider roster`);
    for (const sentinel of [
      'NEWER_MESSAGE_SENTINEL',
      'MISSING_MESSAGE_SENTINEL',
      'MALFORMED_MESSAGE_SENTINEL',
      'CHANGED_MESSAGE_SENTINEL',
    ]) {
      assert.equal(JSON.stringify(projected).includes(sentinel), false,
        `${label} omits raw diagnostic text`);
    }
  }

  let detectionAccessorReads = 0;
  const accessorDetection = {};
  for (const key of ['binary', 'version']) {
    Object.defineProperty(accessorDetection, key, {
      enumerable: true,
      get() {
        detectionAccessorReads += 1;
        return key === 'binary'
          ? retainedDetection('1.14.25', '/opt/opencode').binary
          : '1.14.25';
      },
    });
  }
  for (const [label, unsafeDetection] of [
    ['accessor', accessorDetection],
    ['prototype', Object.create(retainedDetection('1.14.25', '/opt/opencode'))],
  ]) {
    const projected = await requestServeCompatibility(
      serveDelegation,
      compatibilityRegistry(
        ['claude-code', 'opencode'],
        {
          'claude-code': retainedDetection('2.1.177', '/opt/claude'),
          opencode: unsafeDetection,
        },
      ),
    );
    assert.deepEqual(projected.adapters[1], {
      adapterId: 'opencode',
      displayLabel: 'OpenCode',
      status: 'unsupported',
      reason: 'binary_not_found',
    }, `${label} detector evidence fails closed`);
  }
  assert.equal(detectionAccessorReads, 0, 'daemon projection never invokes detector accessors');

  let mismatchRequireCalls = 0;
  let rosterAccessorReads = 0;
  const accessorRegistry = {};
  Object.defineProperty(accessorRegistry, 'ids', {
    enumerable: true,
    get() {
      rosterAccessorReads += 1;
      return () => ['claude-code', 'opencode'];
    },
  });
  accessorRegistry.require = () => {
    mismatchRequireCalls += 1;
    return Object.freeze({ detect: async () => retainedDetection('2.1.177', '/opt/claude') });
  };
  const prototypeRegistry = Object.create({
    ids: () => Object.freeze(['claude-code', 'opencode']),
    require: () => Object.freeze({ detect: async () => retainedDetection('2.1.177', '/opt/claude') }),
  });
  const mismatchRegistries = [
    ['missing', ['claude-code']],
    ['duplicate', ['claude-code', 'opencode', 'opencode']],
    ['orphan', ['claude-code', 'opencode', 'codex']],
    ['case variant', ['claude-code', 'OpenCode']],
    ['reordered', ['opencode', 'claude-code']],
  ].map(([label, ids]) => [label, Object.freeze({
    ids: () => Object.freeze([...ids]),
    require: () => {
      mismatchRequireCalls += 1;
      return Object.freeze({ detect: async () => retainedDetection('2.1.177', '/opt/claude') });
    },
  })]);
  mismatchRegistries.push(['accessor', accessorRegistry], ['prototype', prototypeRegistry]);
  for (const [label, registry] of mismatchRegistries) {
    const projected = await requestServeCompatibility(serveDelegation, registry);
    assert.deepEqual(projected.adapters, canonicalClosedRows,
      `${label} daemon registry mismatch returns the exact closed canonical roster`);
  }
  assert.equal(mismatchRequireCalls, 0, 'daemon roster mismatch never resolves or detects adapters');
  assert.equal(rosterAccessorReads, 0, 'daemon roster validation never invokes an ids accessor');

  const serveSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'serve-delegation.ts'),
    'utf8',
  );
  const collectorSource = serveSource.slice(
    serveSource.indexOf('async function collectCompatibilitySnapshot'),
    serveSource.indexOf('async function closeStartupResources'),
  );
  assert.doesNotMatch(
    collectorSource,
    /\b(?:selectProvider|recommendProvider|saveSettings|markDirty|grantSpawn|spawnAgent)\b/,
    'compatibility collection has no provider selection, recommendation, settings, dirty, or spawn authority',
  );

  for (const badRow of [
    { ...supported, extra: true },
    { ...supported, adapterId: 'A'.repeat(65) },
    { ...supported, displayLabel: 'L'.repeat(65) },
    { ...supported, status: 'supported', reason: 'evidence_stale' },
    { ...supported, status: 'degraded', reason: 'within_tested_range' },
    { ...supported, status: 'unsupported', reason: 'newer_than_tested_range' },
  ]) {
    assert.throws(
      () => createSafeCompatibilitySnapshot(1, [badRow]),
      /Invalid safe compatibility snapshot/,
    );
  }
  assert.throws(() => createSafeCompatibilitySnapshot(-1, [supported]), /Invalid safe/);
  assert.throws(() => createSafeCompatibilitySnapshot(Number.NaN, [supported]), /Invalid safe/);
  assert.throws(
    () => createSafeCompatibilitySnapshot(1, Array.from({ length: 17 }, (_, index) => ({
      ...supported,
      adapterId: `adapter-${index}`,
    }))),
    /Invalid safe/,
  );
  assert.throws(
    () => createSafeCompatibilitySnapshot(1, [supported, supported]),
    /Invalid safe/,
  );
  const sparseRows = [];
  sparseRows.length = 1;
  assert.throws(() => createSafeCompatibilitySnapshot(1, sparseRows), /Invalid safe/);

  const invalidMatrices = [];
  const unknownTopLevel = clone(ADAPTER_COMPATIBILITY_MATRIX);
  unknownTopLevel.extra = true;
  invalidMatrices.push(unknownTopLevel);
  const unknownRow = clone(ADAPTER_COMPATIBILITY_MATRIX);
  unknownRow.adapters[0].extra = true;
  invalidMatrices.push(unknownRow);
  const wrongSchema = clone(ADAPTER_COMPATIBILITY_MATRIX);
  wrongSchema.schemaVersion = 2;
  invalidMatrices.push(wrongSchema);
  const oversizedRows = clone(ADAPTER_COMPATIBILITY_MATRIX);
  oversizedRows.adapters = Array.from({ length: 17 }, (_, index) => ({
    ...clone(row),
    adapterId: `adapter-${index}`,
  }));
  invalidMatrices.push(oversizedRows);
  const oversizedFields = clone(ADAPTER_COMPATIBILITY_MATRIX);
  oversizedFields.adapters[0].requiredInitFields = Array.from(
    { length: 33 },
    (_, index) => `field_${index}`,
  );
  invalidMatrices.push(oversizedFields);
  const oversizedEvents = clone(ADAPTER_COMPATIBILITY_MATRIX);
  oversizedEvents.adapters[0].expectedNormalizedSequence = Array.from(
    { length: 65 },
    () => 'assistant',
  );
  invalidMatrices.push(oversizedEvents);
  const oversizedId = clone(ADAPTER_COMPATIBILITY_MATRIX);
  oversizedId.adapters[0].adapterId = 'a'.repeat(65);
  invalidMatrices.push(oversizedId);
  const oversizedLabel = clone(ADAPTER_COMPATIBILITY_MATRIX);
  oversizedLabel.adapters[0].displayLabel = 'L'.repeat(65);
  invalidMatrices.push(oversizedLabel);
  const oversizedVersion = clone(ADAPTER_COMPATIBILITY_MATRIX);
  oversizedVersion.adapters[0].profileVersion = `${'1'.repeat(30)}.1.1`;
  invalidMatrices.push(oversizedVersion);
  const absoluteFixture = clone(ADAPTER_COMPATIBILITY_MATRIX);
  absoluteFixture.adapters[0].fixtureManifest = '/tmp/private/manifest.json';
  invalidMatrices.push(absoluteFixture);
  const traversalFixture = clone(ADAPTER_COMPATIBILITY_MATRIX);
  traversalFixture.adapters[0].fixtureManifest = 'tests/fixtures/agent-streams/../secret/manifest.json';
  invalidMatrices.push(traversalFixture);
  const duplicateAdapter = clone(ADAPTER_COMPATIBILITY_MATRIX);
  duplicateAdapter.adapters.push(clone(row));
  invalidMatrices.push(duplicateAdapter);
  const sparseAdapters = clone(ADAPTER_COMPATIBILITY_MATRIX);
  sparseAdapters.adapters.length = 3;
  invalidMatrices.push(sparseAdapters);
  const missingOpenCode = clone(ADAPTER_COMPATIBILITY_MATRIX);
  missingOpenCode.adapters.pop();
  invalidMatrices.push(missingOpenCode);
  const reversedAdapters = clone(ADAPTER_COMPATIBILITY_MATRIX);
  reversedAdapters.adapters.reverse();
  invalidMatrices.push(reversedAdapters);
  const caseVariedAdapter = clone(ADAPTER_COMPATIBILITY_MATRIX);
  caseVariedAdapter.adapters[1].adapterId = 'OpenCode';
  invalidMatrices.push(caseVariedAdapter);
  const codexOrphan = clone(ADAPTER_COMPATIBILITY_MATRIX);
  codexOrphan.adapters[1].adapterId = 'codex';
  codexOrphan.adapters[1].fixtureManifest = 'tests/fixtures/agent-streams/codex-1.14.25/manifest.json';
  invalidMatrices.push(codexOrphan);
  const wrongCapabilities = clone(ADAPTER_COMPATIBILITY_MATRIX);
  wrongCapabilities.adapters[1].capabilities.serverMode = false;
  invalidMatrices.push(wrongCapabilities);
  const extraCapability = clone(ADAPTER_COMPATIBILITY_MATRIX);
  extraCapability.adapters[1].capabilities.shellMode = true;
  invalidMatrices.push(extraCapability);
  const forbiddenPrototypeKey = JSON.parse(JSON.stringify(ADAPTER_COMPATIBILITY_MATRIX));
  Object.defineProperty(forbiddenPrototypeKey.adapters[0], 'prototype', {
    value: 'poison',
    enumerable: true,
  });
  invalidMatrices.push(forbiddenPrototypeKey);
  const explicitProtoKey = JSON.parse(
    `{"schemaVersion":1,"adapters":${JSON.stringify(ADAPTER_COMPATIBILITY_MATRIX.adapters)},"__proto__":{}}`,
  );
  invalidMatrices.push(explicitProtoKey);
  const nonPlain = Object.create({ inherited: true });
  nonPlain.schemaVersion = 1;
  nonPlain.adapters = clone(ADAPTER_COMPATIBILITY_MATRIX.adapters);
  invalidMatrices.push(nonPlain);
  const symbolMatrix = clone(ADAPTER_COMPATIBILITY_MATRIX);
  symbolMatrix[Symbol('poison')] = true;
  invalidMatrices.push(symbolMatrix);

  let getterCalls = 0;
  const accessorMatrix = clone(ADAPTER_COMPATIBILITY_MATRIX);
  Object.defineProperty(accessorMatrix.adapters[0], 'displayLabel', {
    get() {
      getterCalls += 1;
      return 'Claude Code';
    },
    enumerable: true,
  });
  invalidMatrices.push(accessorMatrix);

  for (const matrix of invalidMatrices) {
    assert.equal(parseAdapterCompatibilityMatrix(matrix), null);
  }
  assert.equal(getterCalls, 0, 'matrix validation rejects accessors without invoking them');

  const parsed = parseAdapterCompatibilityMatrix(clone(ADAPTER_COMPATIBILITY_MATRIX));
  assert.deepEqual(parsed, ADAPTER_COMPATIBILITY_MATRIX);
  assert.notStrictEqual(parsed, ADAPTER_COMPATIBILITY_MATRIX);
  assertDeepFrozen(parsed);

  const matrixJson = JSON.stringify(ADAPTER_COMPATIBILITY_MATRIX);
  for (const canary of [
    'bridge-secret-canary',
    'session-value-canary',
    'prompt-value-canary',
    'provider-payload-canary',
    '/Users/example/private/claude',
  ]) {
    assert.equal(matrixJson.includes(canary), false);
  }

  console.log('mcp-adapter-compatibility.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-adapter-compatibility.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
