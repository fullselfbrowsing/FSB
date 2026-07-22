'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const mcpBuildRoot = process.env.FSB_MCP_BUILD_ROOT
  ? path.resolve(process.env.FSB_MCP_BUILD_ROOT)
  : path.join(repoRoot, 'mcp', 'build');
const processProbeBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'process-probe.js',
);
const spawnEnvironmentBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'spawn-environment.js',
);
const adapterBuildPath = path.join(mcpBuildRoot, 'agent-providers', 'adapter.js');
const effectiveAuthorityBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'effective-authority.js',
);
const serveDelegationBuildPath = path.join(
  mcpBuildRoot,
  'agent-providers',
  'serve-delegation.js',
);

const SELECTED_SECTION = (() => {
  const offset = process.argv.indexOf('--section');
  return offset < 0 ? null : process.argv[offset + 1] || '';
})();

function ownedBuffersAreZero(result) {
  return result.stdout.every((byte) => byte === 0)
    && result.stderr.every((byte) => byte === 0);
}

async function runGenericProbeTests(processProbeModule, spawnEnvironmentModule) {
  const {
    ProcessProbeError,
    runBoundedProcessProbe,
  } = processProbeModule;
  const {
    buildSanitizedAgentEnvironment,
    freezeAgentEnvironmentPolicy,
  } = spawnEnvironmentModule;

  const policy = freezeAgentEnvironmentPolicy({
    inheritedAllowRules: ['allow_unlisted'],
    strippedKeys: ['GENERIC_PROBE_SECRET'],
    forcedValues: {},
  });
  const environment = buildSanitizedAgentEnvironment({
    PATH: process.env.PATH,
    GENERIC_PROBE_SECRET: 'AMBIENT_PROBE_SECRET_MUST_NOT_SURVIVE',
  }, {
    FSB_PROBE_FIXED: 'yes',
  }, policy);
  const descriptor = (argv, overrides = {}) => ({
    command: process.execPath,
    argv,
    cwd: repoRoot,
    environment,
    timeoutMs: 2_000,
    stdoutLimitBytes: 256,
    stderrLimitBytes: 256,
    ...overrides,
  });

  const stdoutCanary = Buffer.from('PROBE_STDOUT_CANARY');
  const stderrCanary = Buffer.from('PROBE_STDERR_CANARY');
  const success = await runBoundedProcessProbe(descriptor([
    '-e',
    [
      "if (process.env.GENERIC_PROBE_SECRET !== undefined) process.exit(91);",
      "if (process.env.FSB_PROBE_FIXED !== 'yes') process.exit(92);",
      `process.stdout.write(Buffer.from('${stdoutCanary.toString('ascii')}'));`,
      `process.stderr.write(Buffer.from('${stderrCanary.toString('ascii')}'));`,
    ].join(''),
  ]));
  assert(Buffer.isBuffer(success.stdout));
  assert(Buffer.isBuffer(success.stderr));
  assert.notStrictEqual(success.stdout, stdoutCanary);
  assert.notStrictEqual(success.stderr, stderrCanary);
  assert(success.stdout.equals(stdoutCanary));
  assert(success.stderr.equals(stderrCanary));
  assert.deepEqual(success.exit, { code: 0, signal: null });
  assert(Object.isFrozen(success));
  assert(Object.isFrozen(success.exit));
  success.zeroize();
  success.zeroize();
  assert.equal(ownedBuffersAreZero(success), true, 'success channels zero idempotently');

  const nonzero = await runBoundedProcessProbe(descriptor([
    '-e',
    'process.exitCode = 17;',
  ]));
  assert.deepEqual(nonzero.exit, { code: 17, signal: null });
  nonzero.zeroize();

  for (const [label, operation, code] of [
    [
      'stdout overflow',
      () => runBoundedProcessProbe(descriptor([
        '-e',
        "process.stdout.write(Buffer.alloc(512, 0x53)); setInterval(() => {}, 1000);",
      ], { stdoutLimitBytes: 32 })),
      'stdout_overflow',
    ],
    [
      'stderr overflow',
      () => runBoundedProcessProbe(descriptor([
        '-e',
        "process.stderr.write(Buffer.alloc(512, 0x45)); setInterval(() => {}, 1000);",
      ], { stderrLimitBytes: 32 })),
      'stderr_overflow',
    ],
    [
      'timeout',
      () => runBoundedProcessProbe(descriptor([
        '-e',
        'setInterval(() => {}, 1000);',
      ], { timeoutMs: 25 })),
      'timeout',
    ],
    [
      'spawn failure',
      () => runBoundedProcessProbe(descriptor([], {
        command: path.join(repoRoot, 'missing-generic-probe-binary'),
      })),
      'spawn_failed',
    ],
  ]) {
    await assert.rejects(
      operation,
      (error) => {
        assert(error instanceof ProcessProbeError, label);
        assert.equal(error.code, code, label);
        const serialized = JSON.stringify({ name: error.name, code: error.code, message: error.message });
        assert.equal(serialized.includes('AMBIENT_PROBE_SECRET_MUST_NOT_SURVIVE'), false);
        assert.equal(serialized.includes('PROBE_STDOUT_CANARY'), false);
        assert.equal(serialized.includes('PROBE_STDERR_CANARY'), false);
        return true;
      },
    );
  }

  const controller = new AbortController();
  const aborted = runBoundedProcessProbe(descriptor([
    '-e',
    'setInterval(() => {}, 1000);',
  ], { signal: controller.signal }));
  controller.abort();
  await assert.rejects(aborted, (error) => error.code === 'aborted');

  await assert.rejects(
    runBoundedProcessProbe({
      ...descriptor(['-e', 'process.exit(0);']),
      environment: { PATH: process.env.PATH },
    }),
    (error) => error.code === 'invalid_descriptor',
    'an unbranded environment cannot cross the probe boundary',
  );

  const probeSource = fs.readFileSync(
    path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'process-probe.ts'),
    'utf8',
  );
  assert.equal(probeSource.includes('.toString('), false);
  assert.equal(probeSource.includes('JSON.stringify'), false);
  assert.equal(probeSource.includes('console.'), false);

  const productionRoot = path.join(repoRoot, 'mcp', 'src', 'agent-providers');
  const productionSource = fs.readdirSync(productionRoot)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(productionRoot, name), 'utf8'))
    .join('\n');
  assert.equal(productionSource.includes('CODEX_ADAPTER_ID'), false);
  assert.equal(productionSource.includes('createCodexAdapter'), false);
}

function identityProbe(overrides = {}) {
  return {
    source: 'retained_binary',
    argv: ['identity', 'status'],
    timeoutMs: 1_000,
    stdoutLimitBytes: 64,
    stderrLimitBytes: 64,
    expectedAuthState: 'unknown',
    outcomes: [{
      authState: 'unknown',
      exitCode: 0,
      stdout: { kind: 'empty' },
      stderr: { kind: 'exact', bytes: Array.from(Buffer.from('SAFE_STATUS\n')) },
    }],
    ...overrides,
  };
}

function authorityAttestation(overrides = {}) {
  return {
    source: 'retained_binary',
    argv: ['authority', 'list', '--json'],
    timeoutMs: 1_000,
    stdoutLimitBytes: 8 * 1024,
    stderrLimitBytes: 64,
    classifier: 'effective_authority_json',
    expectedServerName: 'fsb',
    endpointRef: 'direct_runtime_endpoint',
    required: true,
    enabled: true,
    enabledTools: ['fsb_fetch', 'fsb_search'],
    defaultToolsApprovalMode: 'approve',
    headers: 'absent',
    env: 'absent',
    bearerToken: 'absent',
    ...overrides,
  };
}

function directSpawnSpec(preSpawnIdentityProbe, effectiveAuthorityAttestation) {
  return {
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    topology: {
      kind: 'direct',
      task: {
        role: 'direct_task',
        command: '/fixture/bin/agent',
        argv: ['--json'],
        cwd: '/fixture/runtime/scratch',
        privateFiles: [],
        fixedEnv: {},
        spawnSecretEnvBindings: [],
        stdin: 'task',
        stdout: 'agent_jsonl',
      },
    },
    attestations: [],
    preSpawnIdentityProbe,
    effectiveAuthorityAttestation,
  };
}

function authorityObservation(endpoint, overrides = {}) {
  return {
    servers: [{
      serverName: 'fsb',
      endpoint,
      required: true,
      enabled: true,
      enabledTools: ['fsb_fetch', 'fsb_search'],
      defaultToolsApprovalMode: 'approve',
      ...overrides,
    }],
  };
}

async function runGenericAuthorityTests(
  adapterModule,
  effectiveAuthorityModule,
  serveDelegationModule,
) {
  const {
    EffectiveAuthorityContractError,
    classifyEffectiveAuthority,
    classifyPreSpawnIdentityProbe,
    createDirectRuntimeReference,
    validateDirectRuntimeReference,
    validateEffectiveAuthorityAttestation,
    validatePreSpawnIdentityProbe,
  } = effectiveAuthorityModule;
  const endpoint = 'http://127.0.0.1:7225/mcp';
  const generation = 'generation_generic_authority_0001';
  const reference = createDirectRuntimeReference(endpoint, generation);
  assert(Object.isFrozen(reference));
  assert.deepEqual(Object.keys(reference).sort(), ['endpoint', 'generation']);
  assert.strictEqual(validateDirectRuntimeReference(reference, generation), reference);
  assert.throws(
    () => validateDirectRuntimeReference({ endpoint, generation }, generation),
    (error) => error instanceof EffectiveAuthorityContractError
      && error.code === 'invalid_direct_runtime',
    'structurally identical caller data has no serve-owned capability',
  );
  assert.throws(
    () => validateDirectRuntimeReference(reference, 'generation_other_authority_0001'),
    (error) => error.code === 'invalid_direct_runtime',
  );
  for (const invalidEndpoint of [
    'https://127.0.0.1:7225/mcp',
    'http://localhost:7225/mcp',
    'http://0.0.0.0:7225/mcp',
    'http://127.0.0.1/mcp',
    'http://127.0.0.1:7225',
    'http://127.0.0.1:7225/',
    'http://127.0.0.1:7225/other',
    'http://user@127.0.0.1:7225/mcp',
    'http://127.0.0.1:7225/mcp?endpoint=foreign',
    'http://127.0.0.1:7225/mcp#fragment',
  ]) {
    assert.throws(
      () => createDirectRuntimeReference(invalidEndpoint, generation),
      (error) => error.code === 'invalid_direct_runtime',
      invalidEndpoint,
    );
  }

  const frozenIdentity = validatePreSpawnIdentityProbe(identityProbe());
  const frozenAuthority = validateEffectiveAuthorityAttestation(authorityAttestation());
  assert(Object.isFrozen(frozenIdentity));
  assert(Object.isFrozen(frozenIdentity.argv));
  assert(Object.isFrozen(frozenIdentity.outcomes));
  assert(Object.isFrozen(frozenIdentity.outcomes[0].stderr));
  assert(Object.isFrozen(frozenAuthority));
  assert(Object.isFrozen(frozenAuthority.argv));
  assert(Object.isFrozen(frozenAuthority.enabledTools));

  const frozenSpec = adapterModule.freezeSpawnSpec(
    directSpawnSpec(identityProbe(), authorityAttestation()),
  );
  assert(Object.isFrozen(frozenSpec));
  assert(Object.isFrozen(frozenSpec.preSpawnIdentityProbe));
  assert(Object.isFrozen(frozenSpec.effectiveAuthorityAttestation));

  assert.deepEqual(
    classifyPreSpawnIdentityProbe({
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('SAFE_STATUS\n'),
      exit: { code: 0, signal: null },
    }, frozenIdentity),
    { matched: true, authState: 'unknown', reason: 'match' },
  );
  assert.deepEqual(
    classifyPreSpawnIdentityProbe({
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('DIFFERENT_STATUS\n'),
      exit: { code: 0, signal: null },
    }, frozenIdentity),
    { matched: false, authState: null, reason: 'byte_mismatch' },
  );

  const acceptedAuthority = classifyEffectiveAuthority(
    authorityObservation(endpoint),
    frozenAuthority,
    reference,
  );
  assert.equal(acceptedAuthority.pass, true);
  assert.equal(acceptedAuthority.reason, 'match');
  assert(Object.values(acceptedAuthority).every((value) => (
    typeof value === 'boolean' || value === 'match'
  )));

  const authorityNegatives = [
    [{ servers: [] }, 'server_count'],
    [{ servers: [
      authorityObservation(endpoint).servers[0],
      authorityObservation(endpoint).servers[0],
    ] }, 'server_count'],
    [authorityObservation(endpoint, { serverName: 'foreign' }), 'server_name'],
    [authorityObservation('http://127.0.0.1:7333/mcp'), 'endpoint'],
    [authorityObservation(endpoint, { required: false }), 'required'],
    [authorityObservation(endpoint, { enabled: false }), 'enabled'],
    [authorityObservation(endpoint, { enabledTools: ['fsb_fetch', 'fsb_fetch'] }), 'enabled_tools'],
    [authorityObservation(endpoint, { defaultToolsApprovalMode: 'prompt' }), 'approval_policy'],
    [authorityObservation(endpoint, { headers: { Authorization: 'RAW_HEADER_CANARY' } }), 'headers_present'],
    [authorityObservation(endpoint, { env: { RAW_SECRET: 'RAW_ENV_CANARY' } }), 'env_present'],
    [authorityObservation(endpoint, { bearerToken: 'RAW_BEARER_CANARY' }), 'bearer_present'],
  ];
  for (const [observed, reason] of authorityNegatives) {
    const classification = classifyEffectiveAuthority(observed, frozenAuthority, reference);
    assert.equal(classification.pass, false, reason);
    assert.equal(classification.reason, reason, reason);
    const safe = JSON.stringify(classification);
    for (const canary of ['RAW_HEADER_CANARY', 'RAW_ENV_CANARY', 'RAW_BEARER_CANARY']) {
      assert.equal(safe.includes(canary), false);
    }
  }

  for (const invalid of [
    { ...authorityAttestation(), endpoint: endpoint },
    { ...authorityAttestation(), enabledTools: ['fsb_fetch', 'fsb_fetch'] },
    { ...authorityAttestation(), headers: {} },
    { ...authorityAttestation(), env: 'present' },
    { ...authorityAttestation(), bearerToken: 'RAW_DESCRIPTOR_CANARY' },
    Object.assign(Object.create(null), authorityAttestation()),
  ]) {
    assert.throws(
      () => validateEffectiveAuthorityAttestation(invalid),
      (error) => error.code === 'invalid_authority_attestation'
        && !error.message.includes('RAW_DESCRIPTOR_CANARY'),
    );
  }

  let getterCalls = 0;
  const accessor = authorityAttestation();
  Object.defineProperty(accessor, 'enabledTools', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return ['fsb_fetch'];
    },
  });
  assert.throws(
    () => validateEffectiveAuthorityAttestation(accessor),
    (error) => error.code === 'invalid_authority_attestation',
  );
  assert.equal(getterCalls, 0);

  const order = [];
  let suppliedReference = null;
  const supervisor = {
    async recover() { order.push('recover'); return { spawnAvailable: true }; },
    async close() { order.push('close'); return { cancelled: 0, failed: 0, alreadySettled: 0 }; },
    journalEntryForChild() { return null; },
    async handleExtRequest() { throw new Error('unused'); },
  };
  const running = await serveDelegationModule.startServeDelegation({
    host: '127.0.0.1',
    port: 7225,
    dependencies: {
      createBridge: () => ({
        currentMode: 'hub',
        topology: {},
        async connect() { order.push('connect'); },
        disconnect() { order.push('disconnect'); },
      }),
      createQueue: () => ({}),
      startHttp: async () => {
        order.push('bind');
        return {
          endpoint,
          healthEndpoint: `${endpoint}/health`,
          markServeReady() { order.push('ready'); },
          async close() { order.push('http.close'); },
        };
      },
      createSupervisor(receivedEndpoint, _onDegraded, directRuntimeReference) {
        order.push('supervisor');
        assert.equal(receivedEndpoint, endpoint);
        suppliedReference = directRuntimeReference;
        return supervisor;
      },
      mintGeneration: () => generation,
      prepareBridgeAuth: () => undefined,
      pushInventory: async () => undefined,
      registerSignal: () => undefined,
      exit: () => undefined,
    },
  });
  assert.deepEqual(order.slice(0, 5), ['bind', 'supervisor', 'recover', 'connect', 'ready']);
  assert.strictEqual(validateDirectRuntimeReference(suppliedReference, generation), suppliedReference);
  await running.shutdown();
}

async function main() {
  const processProbeModule = await import(pathToFileURL(processProbeBuildPath).href);
  const spawnEnvironmentModule = await import(pathToFileURL(spawnEnvironmentBuildPath).href);
  if (SELECTED_SECTION === 'generic-probe') {
    await runGenericProbeTests(processProbeModule, spawnEnvironmentModule);
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === 'generic-authority') {
    const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
    const effectiveAuthorityModule = await import(pathToFileURL(effectiveAuthorityBuildPath).href);
    const serveDelegationModule = await import(pathToFileURL(serveDelegationBuildPath).href);
    await runGenericAuthorityTests(
      adapterModule,
      effectiveAuthorityModule,
      serveDelegationModule,
    );
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  if (SELECTED_SECTION === null) {
    await runGenericProbeTests(processProbeModule, spawnEnvironmentModule);
    const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
    const effectiveAuthorityModule = await import(pathToFileURL(effectiveAuthorityBuildPath).href);
    const serveDelegationModule = await import(pathToFileURL(serveDelegationBuildPath).href);
    await runGenericAuthorityTests(
      adapterModule,
      effectiveAuthorityModule,
      serveDelegationModule,
    );
    console.log('mcp-codex-adapter.test.js: PASS');
    return;
  }
  throw new Error(`Unknown mcp-codex-adapter section: ${SELECTED_SECTION}`);
}

main().catch((error) => {
  console.error('mcp-codex-adapter.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
