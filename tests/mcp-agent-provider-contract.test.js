'use strict';

/**
 * Phase 60 Plan 01 -- provider-neutral adapter/registry contract.
 *
 * Run: npm --prefix mcp run build && node tests/mcp-agent-provider-contract.test.js
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const adapterSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'adapter.ts');
const policySourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'policy-attestation.ts');
const runtimeSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'runtime-files.ts');
const supervisorSourcePath = path.join(repoRoot, 'mcp', 'src', 'agent-providers', 'spawn-supervisor.ts');
const adapterBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'adapter.js');
const policyBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'policy-attestation.js');
const registryBuildPath = path.join(repoRoot, 'mcp', 'build', 'agent-providers', 'registry.js');
const platformsBuildPath = path.join(repoRoot, 'mcp', 'build', 'platforms.js');
const mcpRoot = path.join(repoRoot, 'mcp');
const mcpPackagePath = path.join(mcpRoot, 'package.json');
const shippedAgentPath = path.join(mcpRoot, 'ai', 'agents', 'fsb.json');

function expectRegistryError(fn, ErrorType, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof ErrorType);
    assert.equal(error.code, code);
    return true;
  });
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertRecursivelyFrozen(value, label, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), `${label} is recursively frozen`);
  for (const child of Object.values(value)) assertRecursivelyFrozen(child, label, seen);
}

function processSpec(role, overrides = {}) {
  const defaults = {
    role,
    command: '/fixture/opencode',
    argv: ['--pure'],
    cwd: '/fixture/work',
    privateFiles: ['/fixture/run/opencode.json'],
    fixedEnv: { XDG_CONFIG_HOME: '/fixture/run/config' },
    spawnSecretEnvBindings: [],
    stdin: role.endsWith('_task') ? 'task' : 'none',
    stdout: role.endsWith('_task') ? 'agent_jsonl' : 'bounded_json',
  };
  return { ...defaults, ...overrides };
}

function directSpawn(overrides = {}) {
  return {
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    topology: {
      kind: 'direct',
      task: processSpec('direct_task', {
        command: '/fixture/claude',
        argv: ['-p'],
        privateFiles: ['/fixture/run/mcp-config.json'],
        fixedEnv: { FSB_AGENT_PROFILE: '2.1.177' },
      }),
    },
    attestations: [],
    ...overrides,
  };
}

function ownedServerSpawn(overrides = {}) {
  const binding = {
    envKey: 'OPENCODE_SERVER_PASSWORD',
    secretRef: 'owned_server_basic_password',
  };
  const processAttestation = {
    source: 'process_json',
    process: processSpec('policy_preflight', {
      argv: ['--pure', 'debug', 'config'],
    }),
    maxBytes: 16 * 1024,
    timeoutMs: 2_000,
    assertions: [
      { kind: 'exact_keys', path: [], keys: ['enabled', 'model', 'prompt', 'tools'] },
      { kind: 'exact_scalar', path: ['enabled'], value: true },
      { kind: 'absent', path: ['providerCredential'] },
      { kind: 'string_sha256', path: ['prompt'], sha256: sha256('static prompt') },
      {
        kind: 'document_sha256',
        path: ['model'],
        sha256: sha256(JSON.stringify({ resolved: true, name: 'provider/model' })),
      },
      { kind: 'nonempty_string', path: ['model', 'name'] },
      { kind: 'all_strings_prefix', path: ['tools'], prefixRef: 'fsb_mcp_tool_prefix' },
    ],
  };
  const serverAttestation = {
    source: 'owned_server_json',
    method: 'GET',
    path: '/config',
    secretRef: 'owned_server_basic_password',
    maxBytes: 16 * 1024,
    timeoutMs: 2_000,
    assertions: [
      { kind: 'exact_scalar', path: ['healthy'], value: true },
    ],
  };
  return {
    adapterId: 'opencode',
    profileVersion: '1.14.25',
    topology: {
      kind: 'owned_server',
      server: processSpec('owned_server', {
        argv: ['--pure', 'serve'],
        spawnSecretEnvBindings: [binding],
        stdout: 'bounded_readiness',
      }),
      coldTask: processSpec('cold_task', {
        argv: ['--pure', 'run'],
      }),
      attachTask: processSpec('attach_task', {
        argv: ['--pure', 'run', { runtimeRef: 'owned_server_endpoint' }],
        spawnSecretEnvBindings: [binding],
      }),
      readiness: {
        linePrefix: 'opencode server listening on http://127.0.0.1:',
        maxBytes: 4 * 1024,
        timeoutMs: 5_000,
      },
      idle: { timeoutMs: 5 * 60 * 1_000 },
      runtimeRefs: {
        endpoint: 'owned_server_endpoint',
        generation: 'daemon_generation',
      },
    },
    attestations: [processAttestation, serverAttestation],
    ...overrides,
  };
}

async function main() {
  assert.ok(fs.existsSync(adapterBuildPath), 'compiled adapter contract exists');
  assert.ok(fs.existsSync(policyBuildPath), 'compiled policy attestation verifier exists');
  assert.ok(fs.existsSync(registryBuildPath), 'compiled adapter registry exists');

  const adapterModule = await import(pathToFileURL(adapterBuildPath).href);
  const policyModule = await import(pathToFileURL(policyBuildPath).href);
  const registryModule = await import(pathToFileURL(registryBuildPath).href);
  const { PLATFORMS } = await import(pathToFileURL(platformsBuildPath).href);

  const {
    CLAUDE_CODE_ADAPTER_ID,
    CODEX_ADAPTER_ID,
    OPENCODE_ADAPTER_ID,
    OPENCODE_SERVER_PASSWORD_ENV_KEY,
    OWNED_SERVER_BASIC_PASSWORD_SECRET_REF,
    TASK_ONLY_CAPABILITIES,
    freezeSpawnSpec,
  } = adapterModule;
  const { verifyPolicyAttestation } = policyModule;
  const {
    AdapterRegistryError,
    createAdapterRegistry,
    createProductionAdapterRegistry,
  } = registryModule;

  assert.equal(CLAUDE_CODE_ADAPTER_ID, 'claude-code');
  assert.equal(OPENCODE_ADAPTER_ID, 'opencode');
  assert.equal(CODEX_ADAPTER_ID, 'codex');
  assert.equal(OPENCODE_SERVER_PASSWORD_ENV_KEY, 'OPENCODE_SERVER_PASSWORD');
  assert.equal(OWNED_SERVER_BASIC_PASSWORD_SECRET_REF, 'owned_server_basic_password');
  assert.equal(PLATFORMS['claude-code'].flag, 'claude-code', 'platform id remains canonical');
  assert.equal(PLATFORMS.codex.flag, 'codex', 'Codex platform id remains canonical');

  const detection = Object.freeze({
    installed: true,
    version: '2.1.177',
    authState: 'unknown',
    binary: Object.freeze({
      command: '/fixture/claude',
      realPath: '/fixture/claude',
      argvPrefix: Object.freeze([]),
    }),
    profileVersion: '2.1.177',
  });
  const task = Object.freeze({ text: 'fixture task' });
  const context = Object.freeze({
    adapterId: 'claude-code',
    detection,
    delegationId: 'delegation_fixture_0001',
    runtimeFingerprint: 'fingerprint_fixture_0001',
    cwd: '/fixture/work',
    privateMcpConfigPath: '/fixture/run/mcp-config.json',
    runtimeFiles: Object.freeze(['/fixture/run/mcp-config.json']),
  });
  const immutableSpec = freezeSpawnSpec({
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    command: '/fixture/claude',
    argv: ['-p'],
    cwd: '/fixture/work',
    privateFiles: ['/fixture/run/mcp-config.json'],
    fixedEnv: { FSB_AGENT_PROFILE: '2.1.177' },
  });

  const fakeAdapter = Object.freeze({
    detect: async () => detection,
    buildSpawn: async (_task, _context) => immutableSpec,
    parseEvents: async function* () {},
    kill: async () => {},
    caps: () => TASK_ONLY_CAPABILITIES,
  });
  const openCodeCapabilities = Object.freeze({
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: true,
  });
  const fakeOpenCodeAdapter = Object.freeze({
    detect: async () => detection,
    buildSpawn: async (_task, _context) => immutableSpec,
    parseEvents: async function* () {},
    kill: async () => {},
    caps: () => openCodeCapabilities,
  });
  const fakeCodexAdapter = Object.freeze({
    detect: async () => detection,
    buildSpawn: async (_task, _context) => immutableSpec,
    parseEvents: async function* () {},
    kill: async () => {},
    caps: () => TASK_ONLY_CAPABILITIES,
  });

  assert.deepEqual(
    Object.keys(fakeAdapter).sort(),
    ['buildSpawn', 'caps', 'detect', 'kill', 'parseEvents'],
    'a conforming adapter exposes exactly five callable methods',
  );
  assert.ok(Object.values(fakeAdapter).every((value) => typeof value === 'function'));
  assert.strictEqual(await fakeAdapter.buildSpawn(task, context), immutableSpec);

  assert.deepEqual(TASK_ONLY_CAPABILITIES, {
    taskMode: true,
    chatMode: false,
    resume: false,
    serverMode: false,
  });
  assert.ok(Object.isFrozen(TASK_ONLY_CAPABILITIES), 'capabilities are immutable');
  assert.throws(() => {
    TASK_ONLY_CAPABILITIES.taskMode = false;
  }, TypeError);

  assert.ok(Object.isFrozen(immutableSpec), 'spawn spec is immutable');
  assert.equal(immutableSpec.topology.kind, 'direct', 'legacy Claude data projects to direct topology');
  assert.deepEqual(immutableSpec.topology.task.argv, ['-p']);
  assert.deepEqual(immutableSpec.topology.task.fixedEnv, { FSB_AGENT_PROFILE: '2.1.177' });
  assert.deepEqual(immutableSpec.topology.task.spawnSecretEnvBindings, []);
  assert.deepEqual(immutableSpec.attestations, []);
  assertRecursivelyFrozen(immutableSpec, 'Claude direct spawn spec');
  assert.throws(() => immutableSpec.topology.task.argv.push('--unexpected'), TypeError);
  assert.equal(JSON.stringify(immutableSpec).includes(task.text), false, 'task text is absent from spec');

  const mutableOwned = ownedServerSpawn();
  const immutableOwned = freezeSpawnSpec(mutableOwned);
  assert.equal(immutableOwned.topology.kind, 'owned_server');
  assert.deepEqual(immutableOwned.topology.server.spawnSecretEnvBindings, [{
    envKey: 'OPENCODE_SERVER_PASSWORD',
    secretRef: 'owned_server_basic_password',
  }]);
  assert.deepEqual(immutableOwned.topology.coldTask.spawnSecretEnvBindings, []);
  assert.deepEqual(immutableOwned.topology.attachTask.spawnSecretEnvBindings, [{
    envKey: 'OPENCODE_SERVER_PASSWORD',
    secretRef: 'owned_server_basic_password',
  }]);
  assert.equal(immutableOwned.attestations[0].source, 'process_json');
  assert.equal(immutableOwned.attestations[1].source, 'owned_server_json');
  assertRecursivelyFrozen(immutableOwned, 'owned-server spawn spec');
  mutableOwned.topology.server.argv.push('--mutated');
  mutableOwned.topology.readiness.linePrefix = 'mutated';
  mutableOwned.attestations[0].assertions[0].keys.push('mutated');
  assert.deepEqual(immutableOwned.topology.server.argv, ['--pure', 'serve']);
  assert.match(immutableOwned.topology.readiness.linePrefix, /^opencode server listening/);
  assert.deepEqual(immutableOwned.attestations[0].assertions[0].keys, [
    'enabled', 'model', 'prompt', 'tools',
  ]);

  const taskCanary = 'TASK_CANARY_contract_boundary_0001';
  const passwordCanary = 'PASSWORD_CANARY_contract_boundary_0001';
  assert.equal(JSON.stringify(immutableOwned).includes(taskCanary), false);
  assert.equal(JSON.stringify(immutableOwned).includes(passwordCanary), false);
  const invalidSpawnSpecs = [
    directSpawn({ extra: taskCanary }),
    directSpawn({
      topology: {
        kind: 'direct',
        task: processSpec('direct_task', {
          spawnSecretEnvBindings: [{
            envKey: 'OPENCODE_SERVER_PASSWORD',
            secretRef: 'owned_server_basic_password',
          }],
        }),
      },
    }),
    ownedServerSpawn({
      topology: {
        ...ownedServerSpawn().topology,
        coldTask: processSpec('cold_task', {
          spawnSecretEnvBindings: [{
            envKey: 'OPENCODE_SERVER_PASSWORD',
            secretRef: 'owned_server_basic_password',
          }],
        }),
      },
    }),
    ownedServerSpawn({
      topology: {
        ...ownedServerSpawn().topology,
        server: processSpec('owned_server', {
          fixedEnv: { OPENCODE_SERVER_PASSWORD: passwordCanary },
          spawnSecretEnvBindings: [{
            envKey: 'OPENCODE_SERVER_PASSWORD',
            secretRef: 'owned_server_basic_password',
          }],
          stdout: 'bounded_readiness',
        }),
      },
    }),
    ownedServerSpawn({
      topology: {
        ...ownedServerSpawn().topology,
        server: processSpec('owned_server', {
          fixedEnv: { SAFE_VALUE: `Basic ${passwordCanary}` },
          spawnSecretEnvBindings: [{
            envKey: 'OPENCODE_SERVER_PASSWORD',
            secretRef: 'owned_server_basic_password',
          }],
          stdout: 'bounded_readiness',
        }),
      },
    }),
    ownedServerSpawn({
      topology: {
        ...ownedServerSpawn().topology,
        attachTask: processSpec('attach_task', {
          argv: ['--pure', 'run', { runtimeRef: 'owned_server_endpoint' }],
          spawnSecretEnvBindings: [{ envKey: 'ARBITRARY_PASSWORD', secretRef: 'arbitrary' }],
        }),
      },
    }),
    ownedServerSpawn({
      topology: {
        ...ownedServerSpawn().topology,
        attachTask: processSpec('attach_task', {
          argv: ['--pure', 'run', { runtimeRef: 'owned_server_endpoint' }],
          spawnSecretEnvBindings: [{
            envKey: 'OPENCODE_SERVER_PASSWORD',
            secretRef: 'owned_server_basic_password',
            secretValue: passwordCanary,
          }],
        }),
      },
    }),
    ownedServerSpawn({
      attestations: [{
        ...ownedServerSpawn().attestations[0],
        process: processSpec('policy_preflight', {
          spawnSecretEnvBindings: [{
            envKey: 'OPENCODE_SERVER_PASSWORD',
            secretRef: 'owned_server_basic_password',
          }],
        }),
      }],
    }),
    ownedServerSpawn({
      attestations: [{
        ...ownedServerSpawn().attestations[1],
        path: 'http://127.0.0.1/unsafe',
      }],
    }),
    ownedServerSpawn({
      attestations: [{
        ...ownedServerSpawn().attestations[0],
        assertions: [{ kind: 'exact_scalar', path: ['model'], value: 'string forbidden' }],
      }],
    }),
    ownedServerSpawn({
      attestations: [{
        ...ownedServerSpawn().attestations[0],
        assertions: [{ kind: 'all_strings_prefix', path: ['tools'], prefix: 'arbitrary_' }],
      }],
    }),
    ownedServerSpawn({
      attestations: [{
        ...ownedServerSpawn().attestations[0],
        assertions: [{ kind: 'custom', path: [], check: () => true }],
      }],
    }),
  ];
  for (const invalid of invalidSpawnSpecs) {
    assert.throws(() => freezeSpawnSpec(invalid), TypeError, 'closed spawn grammar rejects invalid data');
  }

  let getterTouched = false;
  const accessorSpec = directSpawn();
  Object.defineProperty(accessorSpec.topology.task.fixedEnv, 'ACCESSOR', {
    enumerable: true,
    get() {
      getterTouched = true;
      return taskCanary;
    },
  });
  assert.throws(() => freezeSpawnSpec(accessorSpec), TypeError);
  assert.equal(getterTouched, false, 'spawn validation never invokes accessors');
  const inheritedSpec = Object.create({ resolver: () => passwordCanary });
  Object.assign(inheritedSpec, directSpawn());
  assert.throws(() => freezeSpawnSpec(inheritedSpec), TypeError);

  const cleanDocument = {
    enabled: true,
    model: { resolved: true, name: 'provider/model' },
    prompt: 'static prompt',
    tools: ['fsb_click', 'fsb_read'],
  };
  const assertions = immutableOwned.attestations[0].assertions;
  const passed = verifyPolicyAttestation(cleanDocument, assertions);
  assert.deepEqual(passed, { pass: true, reason: 'passed' });
  assertRecursivelyFrozen(passed, 'passing attestation verdict');
  const failed = verifyPolicyAttestation({ ...cleanDocument, tools: ['fsb_read', 'shell'] }, assertions);
  assert.deepEqual(failed, { pass: false, reason: 'assertion_failed', assertionIndex: 6 });
  assertRecursivelyFrozen(failed, 'failing attestation verdict');
  const malformed = Object.create({ enabled: true });
  Object.assign(malformed, cleanDocument);
  assert.deepEqual(
    verifyPolicyAttestation(malformed, assertions),
    { pass: false, reason: 'invalid_document' },
  );
  let documentGetterTouched = false;
  const accessorDocument = { ...cleanDocument };
  Object.defineProperty(accessorDocument, 'prompt', {
    enumerable: true,
    get() {
      documentGetterTouched = true;
      return passwordCanary;
    },
  });
  assert.deepEqual(
    verifyPolicyAttestation(accessorDocument, assertions),
    { pass: false, reason: 'invalid_document' },
  );
  assert.equal(documentGetterTouched, false, 'attestation verifier never invokes accessors');
  const sparseDocument = [];
  sparseDocument.length = 1;
  assert.deepEqual(
    verifyPolicyAttestation(sparseDocument, []),
    { pass: false, reason: 'invalid_document' },
  );
  let assertionGetterTouched = false;
  const accessorAssertion = { kind: 'absent' };
  Object.defineProperty(accessorAssertion, 'path', {
    enumerable: true,
    get() {
      assertionGetterTouched = true;
      return [passwordCanary];
    },
  });
  assert.deepEqual(
    verifyPolicyAttestation(cleanDocument, [accessorAssertion]),
    { pass: false, reason: 'invalid_descriptor' },
  );
  assert.equal(assertionGetterTouched, false, 'attestation descriptor validation never invokes accessors');
  assert.equal(JSON.stringify(passed).includes(passwordCanary), false);
  assert.equal(JSON.stringify(failed).includes(passwordCanary), false);

  const registry = createAdapterRegistry([
    { id: 'claude-code', adapter: fakeAdapter },
    { id: 'opencode', adapter: fakeOpenCodeAdapter },
    { id: 'codex', adapter: fakeCodexAdapter },
  ]);
  assert.strictEqual(registry.require('claude-code'), fakeAdapter, 'exact canonical lookup succeeds');
  assert.strictEqual(registry.require('opencode'), fakeOpenCodeAdapter, 'second canonical lookup succeeds');
  assert.strictEqual(registry.require('codex'), fakeCodexAdapter, 'third canonical lookup succeeds');
  assert.deepEqual(registry.ids(), ['claude-code', 'opencode', 'codex']);
  assert.ok(Object.isFrozen(registry));
  assert.ok(Object.isFrozen(registry.ids()));
  assert.throws(() => registry.ids().push('foreign'), TypeError);
  assert.throws(() => { registry.require = () => fakeAdapter; }, TypeError);

  expectRegistryError(
    () => registry.require('Claude-Code'),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => registry.require(''),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => registry.require('foreign'),
    AdapterRegistryError,
    'unknown_adapter_id',
  );
  expectRegistryError(
    () => createAdapterRegistry([]),
    AdapterRegistryError,
    'missing_adapter',
  );
  expectRegistryError(
    () => createAdapterRegistry([
      { id: 'claude-code', adapter: fakeAdapter },
      { id: 'claude-code', adapter: fakeAdapter },
    ]),
    AdapterRegistryError,
    'duplicate_adapter',
  );
  expectRegistryError(
    () => createAdapterRegistry([
      { id: 'Claude-Code', adapter: fakeAdapter },
      { id: 'opencode', adapter: fakeOpenCodeAdapter },
    ]),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => createAdapterRegistry([
      { id: 'claude-code', adapter: fakeAdapter },
      { id: 'foreign', adapter: fakeOpenCodeAdapter },
    ]),
    AdapterRegistryError,
    'unknown_adapter_id',
  );
  expectRegistryError(
    () => createAdapterRegistry([{ id: 'claude-code', adapter: fakeAdapter }]),
    AdapterRegistryError,
    'missing_adapter',
  );
  expectRegistryError(
    () => createAdapterRegistry([{ id: 'opencode', adapter: fakeOpenCodeAdapter }]),
    AdapterRegistryError,
    'missing_adapter',
  );
  expectRegistryError(
    () => createAdapterRegistry([
      { id: 'claude-code', adapter: fakeAdapter },
      { id: 'OpenCode', adapter: fakeOpenCodeAdapter },
    ]),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  expectRegistryError(
    () => createAdapterRegistry([
      { id: 'opencode', adapter: fakeOpenCodeAdapter },
      { id: 'claude-code', adapter: fakeAdapter },
      { id: 'codex', adapter: fakeCodexAdapter },
    ]),
    AdapterRegistryError,
    'invalid_adapter_id',
  );
  assert.throws(
    () => createAdapterRegistry([
      { id: 'claude-code', adapter: { ...fakeAdapter } },
      { id: 'opencode', adapter: fakeOpenCodeAdapter },
      { id: 'codex', adapter: fakeCodexAdapter },
    ]),
    /immutable/i,
  );

  const productionRegistry = createProductionAdapterRegistry({
    codexDetect: async () => ({
      installed: false,
      version: null,
      authState: 'unknown',
      binary: null,
      profileVersion: null,
    }),
    kill: async () => {},
  });
  assert.deepEqual(productionRegistry.ids(), ['claude-code', 'opencode', 'codex']);
  for (const id of productionRegistry.ids()) {
    const productionAdapter = productionRegistry.require(id);
    assert.ok(Object.isFrozen(productionAdapter), `${id} production adapter is immutable`);
    assert.deepEqual(
      Object.keys(productionAdapter),
      ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
      `${id} production adapter has exactly five methods in contract order`,
    );
  }
  assert.deepEqual(await productionRegistry.require('codex').detect(), {
    installed: false,
    version: null,
    authState: 'unknown',
    binary: null,
    profileVersion: null,
  }, 'production-registry contract uses only its injected synthetic Codex detector');

  const adapterSource = fs.readFileSync(adapterSourcePath, 'utf8');
  const policySource = fs.readFileSync(policySourcePath, 'utf8');
  const runtimeSource = fs.readFileSync(runtimeSourcePath, 'utf8');
  const supervisorSource = fs.readFileSync(supervisorSourcePath, 'utf8');
  const interfaceMatch = adapterSource.match(
    /export interface AgentProviderAdapter\s*\{([\s\S]*?)\n\}/,
  );
  assert.ok(interfaceMatch, 'AgentProviderAdapter interface exists');
  const signatures = [...interfaceMatch[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*\(/gm)]
    .map((match) => match[1]);
  assert.deepEqual(
    signatures,
    ['detect', 'buildSpawn', 'parseEvents', 'kill', 'caps'],
    'interface has exactly the five required method signatures in order',
  );
  for (const forbidden of ['start', 'stop', 'close', 'init', 'dispose', 'spawn']) {
    assert.equal(signatures.includes(forbidden), false, `interface excludes ${forbidden}`);
  }
  assert.match(supervisorSource, /from ['"]\.\/protocol-drift\.js['"]/, 'supervisor imports shared drift contract');
  assert.doesNotMatch(supervisorSource, /from ['"]\.\/claude-stream\.js['"]/, 'supervisor does not import a provider parser');
  assert.doesNotMatch(supervisorSource, /from ['"][^'"]*opencode[^'"]*['"]/, 'supervisor has no OpenCode import');
  assert.doesNotMatch(supervisorSource, /from ['"][^'"]*codex[^'"]*['"]/, 'supervisor has no Codex import');
  assert.doesNotMatch(supervisorSource, /adapterId\s*===\s*['"]opencode['"]/, 'supervisor has no OpenCode id branch');
  assert.doesNotMatch(supervisorSource, /adapterId\s*===\s*['"]codex['"]/, 'supervisor has no Codex id branch');
  const prepareIndex = supervisorSource.indexOf('runtimeFiles.prepareRun({');
  const spawnIndex = supervisorSource.indexOf('this.spawnChild(', prepareIndex);
  const activateIndex = supervisorSource.indexOf('runtimeFiles.activateRun({', spawnIndex);
  const startedIndex = supervisorSource.indexOf('this.emitStarted(', activateIndex);
  const taskWriteIndex = supervisorSource.indexOf('this.writeTask(', startedIndex);
  assert(prepareIndex >= 0 && spawnIndex > prepareIndex,
    'runtime identity is journaled before the supervised process spawn');
  assert(activateIndex > spawnIndex && startedIndex > activateIndex && taskWriteIndex > startedIndex,
    'retained process identity is activated before authority and task delivery');
  assert.match(runtimeSource, /JOURNAL_VERSION\s*=\s*2\s+as const/);
  assert.match(runtimeSource, /['"]delegation['"]\s*,\s*['"]provider_server['"]/);
  for (const artifactKind of [
    'mcp_config',
    'opencode_config',
    'opencode_test_home',
    'opencode_managed_config',
  ]) {
    assert(runtimeSource.includes(`'${artifactKind}'`), `${artifactKind} is a closed runtime artifact kind`);
  }
  assert.doesNotMatch(runtimeSource, /rmSync\([^)]*recursive\s*:\s*true/,
    'runtime cleanup does not gain arbitrary recursive deletion authority');
  assert.doesNotMatch(policySource, /claude|opencode|codex/i, 'shared verifier is provider-neutral');
  assert.doesNotMatch(policySource, /callback|resolver|template/i, 'shared verifier has no executable extension seam');

  const shippedAgent = JSON.parse(fs.readFileSync(shippedAgentPath, 'utf8'));
  assert.deepEqual(Object.keys(shippedAgent).sort(), [
    'description',
    'disallowedTools',
    'maxTurns',
    'name',
    'permissionMode',
    'prompt',
    'tools',
  ], 'shipped policy has the exact reviewed key set');
  assert.equal(shippedAgent.name, 'fsb');
  assert.equal(typeof shippedAgent.description, 'string');
  assert.ok(shippedAgent.description.length >= 24 && shippedAgent.description.length <= 300);
  assert.equal(typeof shippedAgent.prompt, 'string');
  assert.ok(shippedAgent.prompt.length >= 200 && shippedAgent.prompt.length <= 4000);
  assert.deepEqual(shippedAgent.tools, ['mcp__fsb']);
  assert.deepEqual(shippedAgent.disallowedTools, [
    'Bash',
    'Edit',
    'Write',
    'NotebookEdit',
    'WebFetch',
    'WebSearch',
  ]);
  assert.equal(shippedAgent.permissionMode, 'dontAsk');
  assert.equal(shippedAgent.maxTurns, 40);

  const policyText = `${shippedAgent.description}\n${shippedAgent.prompt}`;
  assert.match(policyText, /server mints your agent identity/i);
  assert.match(policyText, /tabs owned by this agent/i);
  assert.match(policyText, /vault-reference operations/i);
  assert.match(policyText, /human handoff is required/i);
  assert.match(policyText, /irreversible or consent-required/i);
  assert.match(policyText, /fail closed/i);
  for (const dynamicMarker of ['${', '{{', '}}', '<task>', '%TASK%', 'TASK_CANARY']) {
    assert.equal(policyText.includes(dynamicMarker), false, `policy excludes ${dynamicMarker}`);
  }
  for (const credentialShape of [
    /\bsk-[A-Za-z0-9_-]{8,}/,
    /\bAKIA[A-Z0-9]{12,}/,
    /\bBearer\s+[A-Za-z0-9._-]{8,}/i,
    /\b(?:api[_-]?key|password|cvv)\s*[:=]\s*\S+/i,
  ]) {
    assert.equal(credentialShape.test(policyText), false, 'policy contains no credential value');
  }
  assert.deepEqual(
    shippedAgent.tools.filter((tool) => ['Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch'].includes(tool)),
    [],
    'policy grants no shell, filesystem-edit, or general web authority',
  );

  const mcpPackage = JSON.parse(fs.readFileSync(mcpPackagePath, 'utf8'));
  assert.ok(mcpPackage.files.includes('ai/'), 'package manifest publishes the ai directory');

  const packageArchivesBefore = fs.readdirSync(mcpRoot).filter((name) => name.endsWith('.tgz'));
  const packDestination = fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-pack-dry-run-'));
  try {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const packed = spawnSync(
      npmCommand,
      ['pack', '--dry-run', '--json', '--pack-destination', packDestination],
      {
        cwd: mcpRoot,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(packed.status, 0, packed.stderr || 'npm pack dry-run failed');
    const listing = JSON.parse(packed.stdout);
    assert.ok(Array.isArray(listing) && listing.length === 1, 'npm emits one dry-run package listing');
    const packagedPaths = listing[0].files.map((entry) => entry.path);
    assert.ok(packagedPaths.includes('ai/agents/fsb.json'), 'dry-run package includes static FSB agent');
  } finally {
    fs.rmSync(packDestination, { recursive: true, force: true });
  }
  assert.deepEqual(
    fs.readdirSync(mcpRoot).filter((name) => name.endsWith('.tgz')),
    packageArchivesBefore,
    'dry-run package validation leaves no workspace archive',
  );

  console.log('mcp-agent-provider-contract.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-agent-provider-contract.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
