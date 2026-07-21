'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const runtimeBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'runtime-files.js',
);
const processTreeBuildPath = path.join(
  repoRoot,
  'mcp',
  'build',
  'agent-providers',
  'process-tree.js',
);

function tempRoot(label) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `fsb-agent-${label}-`));
  return {
    parent,
    root: path.join(parent, 'agent-runtime'),
    cleanup: () => fs.rmSync(parent, { recursive: true, force: true }),
  };
}

function preparedInput(overrides = {}) {
  return {
    delegationId: 'delegation_fixture_0001',
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    createdAt: 1000,
    binaryRealPath: '/fixture/bin/claude',
    argvSignature: 'argv_signature_fixture_0001',
    envFingerprint: 'env_fingerprint_fixture_0001',
    generation: 'generation_fixture_previous',
    endpoint: 'http://127.0.0.1:7226/mcp',
    ...overrides,
  };
}

function activeInput(overrides = {}) {
  return {
    delegationId: 'delegation_fixture_0001',
    pid: 41001,
    processGroupId: 41001,
    startedAt: 1100,
    processStartIdentity: 'start-ticks-90001',
    ...overrides,
  };
}

function opencodePrivateArtifacts(overrides = {}) {
  const config = {
    share: 'disabled',
    mcp: {
      fsb: {
        type: 'remote',
        url: 'http://127.0.0.1:7226/mcp',
        enabled: true,
        oauth: false,
      },
    },
  };
  return [
    { kind: 'opencode_config', contents: `${JSON.stringify(config)}\n` },
    { kind: 'opencode_test_home' },
    { kind: 'opencode_managed_config' },
  ].map((entry) => ({ ...entry, ...(overrides[entry.kind] ?? {}) }));
}

function rolePreparedInput(runtime, overrides = {}) {
  const delegationId = overrides.delegationId ?? 'provider_server_fixture_0001';
  const paths = runtime.pathsFor(delegationId);
  return {
    role: 'provider_server',
    delegationId,
    adapterId: 'opencode',
    profileVersion: '1.14.25',
    createdAt: 1000,
    binaryRealPath: '/fixture/bin/opencode',
    argvSignature: 'argv_signature_opencode_0001',
    fixedEnv: {
      XDG_CONFIG_HOME: paths.opencodeConfigRoot,
      OPENCODE_TEST_HOME: paths.opencodeTestHomePath,
      OPENCODE_TEST_MANAGED_CONFIG_DIR: paths.opencodeManagedConfigPath,
      OPENCODE_DISABLE_PROJECT_CONFIG: '1',
    },
    envFingerprint: 'env_fingerprint_opencode_0001',
    generation: 'generation_fixture_previous',
    privateArtifacts: opencodePrivateArtifacts(),
    ...overrides,
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function collectArtifactText(root) {
  if (!fs.existsSync(root)) return '';
  const values = [];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory)) {
      const target = path.join(directory, name);
      const stat = fs.lstatSync(target);
      values.push(name);
      if (stat.isDirectory()) visit(target);
      else if (stat.isFile()) values.push(fs.readFileSync(target, 'utf8'));
    }
  };
  visit(root);
  return values.join('\n');
}

async function expectRuntimeError(operation, code) {
  await assert.rejects(
    async () => operation(),
    (error) => {
      assert.equal(error.code, code);
      return true;
    },
  );
}

async function runRuntimeFilesTests(runtimeModule) {
  const {
    AGENT_RUNTIME_JOURNAL_VERSION,
    AGENT_RUNTIME_PRIVATE_ARTIFACT_KINDS,
    AGENT_RUNTIME_ROLES,
    AGENT_RECOVERY_DISPOSITION_LIMIT,
    AGENT_RECOVERY_DISPOSITION_LIMIT_BYTES,
    AGENT_ORPHAN_JOURNAL_LIMIT_BYTES,
    AGENT_RUNTIME_DIRECTORY_MODE,
    AGENT_RUNTIME_FILE_MODE,
    createAgentRuntimeFiles,
  } = runtimeModule;

  assert.equal(AGENT_RUNTIME_DIRECTORY_MODE, 0o700);
  assert.equal(AGENT_RUNTIME_FILE_MODE, 0o600);
  assert.equal(AGENT_RUNTIME_JOURNAL_VERSION, 2);
  assert.deepEqual(AGENT_RUNTIME_ROLES, [
    'delegation',
    'provider_server',
    'policy_preflight',
  ]);
  assert.deepEqual(AGENT_RUNTIME_PRIVATE_ARTIFACT_KINDS, [
    'mcp_config',
    'opencode_config',
    'opencode_test_home',
    'opencode_managed_config',
  ]);
  assert(Object.isFrozen(AGENT_RUNTIME_ROLES));
  assert(Object.isFrozen(AGENT_RUNTIME_PRIVATE_ARTIFACT_KINDS));
  assert.equal(AGENT_ORPHAN_JOURNAL_LIMIT_BYTES, 256 * 1024);
  assert.equal(AGENT_RECOVERY_DISPOSITION_LIMIT, 128);
  assert.equal(AGENT_RECOVERY_DISPOSITION_LIMIT_BYTES, 64 * 1024);

  const state = tempRoot('runtime-state');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: state.root, platform: 'linux' });
    const empty = runtime.readJournal();
    assert.equal(empty.status, 'ok');
    assert.deepEqual(empty.journal, { version: 2, entries: [] });

    const prepared = await runtime.prepareRun(preparedInput());
    assert.deepEqual(Object.keys(prepared.entry).sort(), [
      'adapterId',
      'argvSignature',
      'binaryRealPath',
      'createdAt',
      'delegationId',
      'envFingerprint',
      'fixedEnv',
      'generation',
      'profileVersion',
      'role',
      'state',
    ]);
    assert.equal(prepared.entry.state, 'prepared');
    assert.equal(prepared.entry.role, 'delegation');
    assert.deepEqual(prepared.entry.fixedEnv, {});
    assert(Object.isFrozen(prepared.entry.fixedEnv));
    assert.equal(fs.statSync(state.root).mode & 0o777, 0o700);
    assert.equal(fs.statSync(prepared.runDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(prepared.mcpConfigPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(runtime.journalPath).mode & 0o777, 0o600);
    assert.deepEqual(readJson(prepared.mcpConfigPath), {
      mcpServers: {
        fsb: {
          type: 'http',
          url: 'http://127.0.0.1:7226/mcp',
        },
      },
    });
    assert.deepEqual(readJson(runtime.journalPath), {
      version: 2,
      entries: [prepared.entry],
    });
    assert(Object.isFrozen(runtime.readJournal().journal));
    assert(Object.isFrozen(runtime.readJournal().journal.entries));

    const active = await runtime.activateRun(activeInput());
    assert.equal(active.state, 'active');
    assert.deepEqual(Object.keys(active).sort(), [
      'adapterId',
      'argvSignature',
      'binaryRealPath',
      'createdAt',
      'delegationId',
      'envFingerprint',
      'fixedEnv',
      'generation',
      'pid',
      'processGroupId',
      'processStartIdentity',
      'profileVersion',
      'role',
      'startedAt',
      'state',
    ]);
    assert.deepEqual(readJson(runtime.journalPath), { version: 2, entries: [active] });

    await runtime.removeRun(active.delegationId);
    assert.deepEqual(readJson(runtime.journalPath), { version: 2, entries: [] });
    assert.equal(fs.existsSync(prepared.runDirectory), false);
  } finally {
    state.cleanup();
  }

  const roleState = tempRoot('runtime-role-state');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: roleState.root, platform: 'linux' });
    const paths = runtime.pathsFor('provider_server_fixture_0001');
    assert.deepEqual(Object.keys(paths).sort(), [
      'mcpConfigPath',
      'opencodeConfigDirectory',
      'opencodeConfigPath',
      'opencodeConfigRoot',
      'opencodeManagedConfigPath',
      'opencodeTestHomePath',
      'runDirectory',
    ]);
    const prepared = await runtime.prepareRun(rolePreparedInput(runtime));
    assert.equal(prepared.entry.role, 'provider_server');
    assert.equal(prepared.entry.adapterId, 'opencode');
    assert.deepEqual(prepared.entry.fixedEnv, rolePreparedInput(runtime).fixedEnv);
    assert(Object.isFrozen(prepared.entry.fixedEnv));
    assert.equal('privateArtifacts' in prepared.entry, false);
    assert.equal('endpoint' in prepared.entry, false);
    assert.equal('resolvedEnv' in prepared.entry, false);
    assert.equal('spawnSecretEnvBindings' in prepared.entry, false);
    assert.equal(fs.statSync(paths.opencodeConfigRoot).mode & 0o777, 0o700);
    assert.equal(fs.statSync(paths.opencodeConfigDirectory).mode & 0o777, 0o700);
    assert.equal(fs.statSync(paths.opencodeTestHomePath).mode & 0o777, 0o700);
    assert.equal(fs.statSync(paths.opencodeManagedConfigPath).mode & 0o777, 0o700);
    assert.equal(fs.statSync(paths.opencodeConfigPath).mode & 0o777, 0o600);
    assert.deepEqual(readJson(paths.opencodeConfigPath), JSON.parse(
      opencodePrivateArtifacts()[0].contents,
    ));
    const active = await runtime.activateRun({
      ...activeInput({ delegationId: prepared.entry.delegationId }),
      role: 'provider_server',
    });
    assert.equal(active.role, 'provider_server');
    assert.deepEqual(readJson(runtime.journalPath), { version: 2, entries: [active] });
    await runtime.removeRecoveredRun(active);
    assert.deepEqual(readJson(runtime.journalPath), { version: 2, entries: [] });
    assert.equal(fs.existsSync(paths.runDirectory), false);
    assert.equal(fs.existsSync(runtime.recoveryPath), false);
  } finally {
    roleState.cleanup();
  }

  const legacyState = tempRoot('runtime-legacy-v1');
  try {
    fs.mkdirSync(legacyState.root, { recursive: true, mode: 0o700 });
    fs.chmodSync(legacyState.root, 0o700);
    const runtime = createAgentRuntimeFiles({ rootPath: legacyState.root, platform: 'linux' });
    const legacy = {
      state: 'active',
      delegationId: 'delegation_legacy_fixture_0001',
      adapterId: 'claude-code',
      profileVersion: '2.1.177',
      createdAt: 1000,
      binaryRealPath: '/fixture/bin/claude',
      argvSignature: 'argv_signature_legacy_fixture_0001',
      envFingerprint: 'env_fingerprint_legacy_fixture_0001',
      generation: 'generation_fixture_previous',
      pid: 41001,
      processGroupId: 41001,
      startedAt: 1100,
      processStartIdentity: 'start-ticks-90001',
    };
    const legacyBytes = `${JSON.stringify({ version: 1, entries: [legacy] })}\n`;
    fs.writeFileSync(runtime.journalPath, legacyBytes, { mode: 0o600 });
    fs.chmodSync(runtime.journalPath, 0o600);
    const parsed = runtime.readJournal();
    assert.equal(parsed.status, 'ok');
    assert.deepEqual(parsed.journal, {
      version: 2,
      entries: [{ ...legacy, role: 'delegation', fixedEnv: {} }],
    });
    assert.equal(fs.readFileSync(runtime.journalPath, 'utf8'), legacyBytes,
      'read-only legacy parsing preserves exact version-1 bytes');
    const result = await runtimeModule.createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector: { async inspect() { return { classification: 'stale' }; } },
      terminator: { async stop() { assert.fail('stale legacy entry is never signaled'); } },
      terminationGrace: 25,
      generation: 'generation_fixture_current',
      now: () => 1700000000000,
    }).recover();
    assert.equal(result.staleCleared, 1);
    assert.deepEqual(result.restartLosses, [{
      delegationId: legacy.delegationId,
      code: 'daemon_restart_lost_run',
      recoveredAt: 1700000000000,
    }]);
    assert.deepEqual(readJson(runtime.journalPath), { version: 2, entries: [] });
  } finally {
    legacyState.cleanup();
  }

  const recoveryState = tempRoot('runtime-recovery-state');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: recoveryState.root, platform: 'linux' });
    assert.deepEqual(runtime.readRecoveryDispositions(), {
      status: 'ok',
      journal: { version: 1, dispositions: [] },
    });
    const prepared = await runtime.prepareRun(preparedInput());
    const active = await runtime.activateRun(activeInput());
    const disposition = {
      delegationId: active.delegationId,
      code: 'daemon_restart_lost_run',
      recoveredAt: 1700000000000,
    };
    assert.equal(active.generation, 'generation_fixture_previous');
    assert.deepEqual(
      await runtime.recordRestartLossAndRemoveRun(active, disposition),
      [disposition],
    );
    assert.equal(fs.statSync(runtime.recoveryPath).mode & 0o777, 0o600);
    assert.deepEqual(readJson(runtime.recoveryPath), {
      version: 1,
      dispositions: [disposition],
    });
    assert.deepEqual(readJson(runtime.journalPath), { version: 2, entries: [] });
    assert.equal(fs.existsSync(prepared.runDirectory), false);
    const persisted = runtime.readRecoveryDispositions();
    assert.deepEqual(persisted, {
      status: 'ok',
      journal: { version: 1, dispositions: [disposition] },
    });
    assert(Object.isFrozen(persisted.journal));
    assert(Object.isFrozen(persisted.journal.dispositions));
    assert(Object.isFrozen(persisted.journal.dispositions[0]));
    assert.deepEqual(
      await runtime.recordRestartLossAndRemoveRun(active, {
        ...disposition,
        recoveredAt: disposition.recoveredAt + 1,
      }),
      [disposition],
      'retry after journal removal preserves the first durable disposition',
    );
    await expectRuntimeError(
      () => runtime.recordRestartLossAndRemoveRun(
        { ...active, delegationId: 'delegation_fixture_missing' },
        { ...disposition, delegationId: 'delegation_fixture_missing' },
      ),
      'journal_conflict',
    );
  } finally {
    recoveryState.cleanup();
  }

  const recoveryRetry = tempRoot('runtime-recovery-retry');
  try {
    const setup = createAgentRuntimeFiles({ rootPath: recoveryRetry.root, platform: 'linux' });
    await setup.prepareRun(preparedInput());
    const active = await setup.activateRun(activeInput());
    const disposition = {
      delegationId: active.delegationId,
      code: 'daemon_restart_lost_run',
      recoveredAt: 1700000000000,
    };
    let rejectJournalReplace = true;
    const interrupted = createAgentRuntimeFiles({
      rootPath: recoveryRetry.root,
      platform: 'linux',
      fs: {
        renameSync(from, to) {
          if (rejectJournalReplace && to === setup.journalPath) {
            rejectJournalReplace = false;
            throw new Error('injected journal replace interruption');
          }
          return fs.renameSync(from, to);
        },
      },
    });
    await expectRuntimeError(
      () => interrupted.recordRestartLossAndRemoveRun(active, disposition),
      'runtime_target_unavailable',
    );
    assert.deepEqual(
      interrupted.readRecoveryDispositions().journal.dispositions,
      [disposition],
      'crash window retains the durable disposition before journal removal',
    );
    assert.deepEqual(
      interrupted.readJournal().journal.entries,
      [active],
      'crash window retains the source journal entry for a retry',
    );
    const retried = createAgentRuntimeFiles({ rootPath: recoveryRetry.root, platform: 'linux' });
    assert.deepEqual(
      await retried.recordRestartLossAndRemoveRun(active, {
        ...disposition,
        recoveredAt: disposition.recoveredAt + 1,
      }),
      [disposition],
    );
    assert.deepEqual(retried.readJournal().journal.entries, []);
    assert.deepEqual(retried.readRecoveryDispositions().journal.dispositions, [disposition]);
  } finally {
    recoveryRetry.cleanup();
  }

  const recoveryBound = tempRoot('runtime-recovery-bound');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: recoveryBound.root, platform: 'linux' });
    const prepared = await runtime.prepareRun(preparedInput({
      delegationId: 'delegation_fixture_latest',
      argvSignature: 'argv_signature_fixture_latest',
      envFingerprint: 'env_fingerprint_fixture_latest',
    }));
    const active = await runtime.activateRun(activeInput({
      delegationId: prepared.entry.delegationId,
    }));
    const existing = Array.from({ length: 128 }, (_, index) => ({
      delegationId: `delegation_retained_${String(index).padStart(4, '0')}`,
      code: 'daemon_restart_lost_run',
      recoveredAt: 1600000000000 + index,
    }));
    fs.writeFileSync(
      runtime.recoveryPath,
      `${JSON.stringify({ version: 1, dispositions: existing })}\n`,
      { mode: 0o600 },
    );
    fs.chmodSync(runtime.recoveryPath, 0o600);
    await runtime.recordRestartLossAndRemoveRun(active, {
      delegationId: active.delegationId,
      code: 'daemon_restart_lost_run',
      recoveredAt: 1700000000000,
    });
    const retained = runtime.readRecoveryDispositions().journal.dispositions;
    assert.equal(retained.length, runtimeModule.AGENT_RECOVERY_DISPOSITION_LIMIT);
    assert.equal(
      retained.some((entry) => entry.delegationId === existing[0].delegationId),
      false,
      'bounded append prunes the oldest persisted disposition',
    );
    assert.equal(retained.at(-1).delegationId, active.delegationId);
    assert(
      fs.statSync(runtime.recoveryPath).size
        <= runtimeModule.AGENT_RECOVERY_DISPOSITION_LIMIT_BYTES,
      'bounded disposition file remains below its declared byte cap',
    );
  } finally {
    recoveryBound.cleanup();
  }

  const ipv6 = tempRoot('runtime-ipv6');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: ipv6.root, platform: 'linux' });
    const prepared = await runtime.prepareRun(preparedInput({
      endpoint: 'http://[::1]:7226/mcp',
    }));
    assert.equal(
      readJson(prepared.mcpConfigPath).mcpServers.fsb.url,
      'http://[::1]:7226/mcp',
    );
  } finally {
    ipv6.cleanup();
  }

  for (const endpoint of [
    'https://127.0.0.1:7226/mcp',
    'http://localhost:7226/mcp',
    'http://192.168.1.20:7226/mcp',
    'http://user:secret@127.0.0.1:7226/mcp',
    'http://127.0.0.1:7226/mcp?token=secret',
    'http://127.0.0.1:7226/mcp#fragment',
    'http://127.0.0.1:7226/other',
    'http://127.0.0.1/mcp',
  ]) {
    const target = tempRoot('runtime-bad-endpoint');
    try {
      const runtime = createAgentRuntimeFiles({ rootPath: target.root, platform: 'linux' });
      await expectRuntimeError(
        () => runtime.prepareRun(preparedInput({ endpoint })),
        'invalid_runtime_input',
      );
      assert.equal(fs.existsSync(runtime.journalPath), false);
    } finally {
      target.cleanup();
    }
  }

  const secretCanaries = [
    'PASSWORD_CANARY_runtime_64_03_0001',
    'RAW_SECRET_CANARY_runtime_64_03_0001',
    'AUTHORIZATION_CANARY_runtime_64_03_0001',
  ];
  const exactBoundary = tempRoot('runtime-role-exact-boundary');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: exactBoundary.root, platform: 'linux' });
    const clean = rolePreparedInput(runtime);
    const invalidInputs = [
      { ...clean, role: 'user_process' },
      { ...clean, adapterId: 'claude-code' },
      { ...clean, endpoint: 'http://127.0.0.1:7226/mcp' },
      { ...clean, resolvedEnv: { PATH: '/bin' } },
      {
        ...clean,
        spawnSecretEnvBindings: [{
          envKey: 'OPENCODE_SERVER_PASSWORD',
          secretRef: 'owned_server_basic_password',
        }],
      },
      { ...clean, rawSecretBytes: Buffer.from(secretCanaries[1]) },
      { ...clean, rawSecret: secretCanaries[1] },
      { ...clean, headers: { Authorization: `Basic ${secretCanaries[2]}` } },
      { ...clean, endpointCredentials: { password: secretCanaries[0] } },
      {
        ...clean,
        fixedEnv: { ...clean.fixedEnv, OPENCODE_SERVER_PASSWORD: secretCanaries[0] },
      },
      { ...clean, fixedEnv: { ...clean.fixedEnv, SAFE_VALUE: `Basic ${secretCanaries[0]}` } },
      {
        ...clean,
        privateArtifacts: opencodePrivateArtifacts({
          opencode_config: {
            contents: `${JSON.stringify({ headers: { Authorization: `Bearer ${secretCanaries[2]}` } })}\n`,
          },
        }),
      },
      {
        ...clean,
        privateArtifacts: opencodePrivateArtifacts({
          opencode_config: {
            contents: `${JSON.stringify({ endpoint: `http://user:${secretCanaries[0]}@127.0.0.1:7226` })}\n`,
          },
        }),
      },
      {
        ...clean,
        privateArtifacts: [
          ...opencodePrivateArtifacts(),
          { kind: 'arbitrary_file', path: '../../outside' },
        ],
      },
      {
        ...clean,
        privateArtifacts: opencodePrivateArtifacts().map((entry, index) => (
          index === 0 ? { ...entry, path: '../../outside' } : entry
        )),
      },
      { ...clean, privateArtifacts: opencodePrivateArtifacts().slice(0, 2) },
    ];
    for (const input of invalidInputs) {
      await expectRuntimeError(() => runtime.prepareRun(input), 'invalid_runtime_input');
    }

    let getterTouched = false;
    const accessorEnv = { ...clean.fixedEnv };
    Object.defineProperty(accessorEnv, 'SAFE_ACCESSOR', {
      enumerable: true,
      get() {
        getterTouched = true;
        return secretCanaries[0];
      },
    });
    await expectRuntimeError(
      () => runtime.prepareRun({ ...clean, fixedEnv: accessorEnv }),
      'invalid_runtime_input',
    );
    assert.equal(getterTouched, false, 'runtime input validation never invokes accessors');
    assert.equal(fs.existsSync(runtime.journalPath), false);
    const artifacts = collectArtifactText(exactBoundary.root);
    for (const canary of secretCanaries) {
      assert.equal(artifacts.includes(canary), false, `${canary} is absent from disk`);
    }
  } finally {
    exactBoundary.cleanup();
  }

  const unknownCanary = 'TASK_CANARY_DO_NOT_PERSIST_71b831c9';
  const canary = tempRoot('runtime-canary');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: canary.root, platform: 'linux' });
    await expectRuntimeError(
      () => runtime.prepareRun({ ...preparedInput(), task: unknownCanary }),
      'invalid_runtime_input',
    );
    await expectRuntimeError(
      () => runtime.prepareRun({ ...preparedInput(), stderr: unknownCanary }),
      'invalid_runtime_input',
    );
    await runtime.prepareRun(preparedInput());
    const artifacts = collectArtifactText(canary.root);
    for (const forbidden of [
      unknownCanary,
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'GEMINI_API_KEY',
      'raw provider output',
    ]) {
      assert.equal(artifacts.includes(forbidden), false, `${forbidden} is absent from artifacts`);
    }
  } finally {
    canary.cleanup();
  }

  for (const [label, mutate] of [
    ['foreign', (paths) => fs.writeFileSync(path.join(paths.runDirectory, 'foreign.txt'), 'foreign')],
    ['symlink', (paths, parent) => {
      const outside = path.join(parent, 'outside');
      fs.mkdirSync(outside, { mode: 0o700 });
      fs.rmdirSync(paths.opencodeTestHomePath);
      fs.symlinkSync(outside, paths.opencodeTestHomePath);
    }],
    ['unsafe-mode', (paths) => fs.chmodSync(paths.opencodeManagedConfigPath, 0o755)],
  ]) {
    const guardedCleanup = tempRoot(`runtime-opencode-cleanup-${label}`);
    try {
      const runtime = createAgentRuntimeFiles({
        rootPath: guardedCleanup.root,
        platform: 'linux',
      });
      const input = rolePreparedInput(runtime, {
        delegationId: `provider_server_cleanup_${label.replace('-', '_')}`,
      });
      const prepared = await runtime.prepareRun(input);
      const paths = runtime.pathsFor(prepared.entry.delegationId);
      mutate(paths, guardedCleanup.parent);
      await expectRuntimeError(
        () => runtime.removeRun({
          delegationId: prepared.entry.delegationId,
          role: 'provider_server',
        }),
        'runtime_target_unavailable',
      );
      assert.equal(
        fs.existsSync(paths.opencodeConfigPath),
        true,
        'cleanup prevalidates the complete graph before removing any owned file',
      );
      assert.deepEqual(runtime.readJournal().journal.entries, [prepared.entry]);
    } finally {
      guardedCleanup.cleanup();
    }
  }

  const unsafeCreation = tempRoot('runtime-opencode-unsafe-creation');
  try {
    const runtime = createAgentRuntimeFiles({
      rootPath: unsafeCreation.root,
      platform: 'linux',
    });
    const input = rolePreparedInput(runtime, {
      delegationId: 'provider_server_unsafe_creation',
    });
    fs.mkdirSync(runtime.pathsFor(input.delegationId).runDirectory, {
      recursive: true,
      mode: 0o755,
    });
    fs.chmodSync(unsafeCreation.root, 0o700);
    fs.chmodSync(runtime.pathsFor(input.delegationId).runDirectory, 0o755);
    await expectRuntimeError(() => runtime.prepareRun(input), 'runtime_target_unavailable');
    assert.equal(fs.existsSync(runtime.journalPath), false);
  } finally {
    unsafeCreation.cleanup();
  }

  const concurrent = tempRoot('runtime-concurrent');
  try {
    let counter = 0;
    const runtime = createAgentRuntimeFiles({
      rootPath: concurrent.root,
      platform: 'linux',
      randomToken: () => `token${String(counter += 1).padStart(20, '0')}`,
    });
    await Promise.all([
      runtime.prepareRun(preparedInput()),
      runtime.prepareRun(preparedInput({
        delegationId: 'delegation_fixture_0002',
        argvSignature: 'argv_signature_fixture_0002',
        envFingerprint: 'env_fingerprint_fixture_0002',
      })),
    ]);
    assert.deepEqual(
      runtime.readJournal().journal.entries.map((entry) => entry.delegationId),
      ['delegation_fixture_0001', 'delegation_fixture_0002'],
      'serialized mutations retain both concurrent entries',
    );
  } finally {
    concurrent.cleanup();
  }

  const trace = tempRoot('runtime-atomic-trace');
  try {
    const operations = [];
    let token = 0;
    const runtime = createAgentRuntimeFiles({
      rootPath: trace.root,
      platform: 'linux',
      randomToken: () => `trace${String(token += 1).padStart(20, '0')}`,
      fs: {
        openSync: (target, flags, mode) => {
          operations.push({ op: 'open', target, flags, mode });
          return fs.openSync(target, flags, mode);
        },
        writeFileSync: (...args) => {
          operations.push({ op: 'write' });
          return fs.writeFileSync(...args);
        },
        fsyncSync: (descriptor) => {
          operations.push({ op: 'fsync' });
          return fs.fsyncSync(descriptor);
        },
        closeSync: (descriptor) => {
          operations.push({ op: 'close' });
          return fs.closeSync(descriptor);
        },
        renameSync: (from, to) => {
          operations.push({ op: 'rename', from, to });
          return fs.renameSync(from, to);
        },
      },
    });
    await runtime.prepareRun(preparedInput());
    const opens = operations.filter((entry) => entry.op === 'open');
    const renames = operations.filter((entry) => entry.op === 'rename');
    assert.equal(opens.length, 2, 'config and journal each use an exclusive temporary file');
    assert.equal(new Set(opens.map((entry) => entry.target)).size, 2, 'temporary paths are unique');
    for (const entry of opens) {
      assert(entry.flags & fs.constants.O_CREAT);
      assert(entry.flags & fs.constants.O_EXCL);
      assert(entry.flags & fs.constants.O_WRONLY);
      assert(entry.flags & fs.constants.O_NOFOLLOW);
      assert.equal(entry.mode, 0o600);
    }
    for (const rename of renames) {
      const renameIndex = operations.indexOf(rename);
      const previousRenameIndex = Math.max(
        -1,
        ...operations.slice(0, renameIndex).map((entry, index) => (
          entry.op === 'rename' ? index : -1
        )),
      );
      assert(
        operations.slice(previousRenameIndex + 1, renameIndex).some((entry) => entry.op === 'fsync'),
        'fsync occurs before every atomic rename',
      );
    }
  } finally {
    trace.cleanup();
  }

  const failedWrite = tempRoot('runtime-write-failure');
  try {
    const runtime = createAgentRuntimeFiles({
      rootPath: failedWrite.root,
      platform: 'linux',
      randomToken: () => 'failuretoken000000000001',
      fs: {
        fsyncSync: () => { throw new Error('injected fsync failure'); },
      },
    });
    await expectRuntimeError(
      () => runtime.prepareRun(preparedInput()),
      'runtime_target_unavailable',
    );
    const leftovers = fs.existsSync(failedWrite.root)
      ? fs.readdirSync(failedWrite.root).filter((name) => name.includes('.tmp'))
      : [];
    assert.deepEqual(leftovers, [], 'failed atomic write removes its temporary file');
    assert.equal(fs.existsSync(runtime.journalPath), false);
  } finally {
    failedWrite.cleanup();
  }

  const rootSymlink = tempRoot('runtime-root-symlink');
  try {
    const realTarget = path.join(rootSymlink.parent, 'real-target');
    fs.mkdirSync(realTarget);
    fs.symlinkSync(realTarget, rootSymlink.root);
    const runtime = createAgentRuntimeFiles({ rootPath: rootSymlink.root, platform: 'linux' });
    await expectRuntimeError(
      () => runtime.prepareRun(preparedInput()),
      'journal_unavailable',
    );
  } finally {
    rootSymlink.cleanup();
  }

  const configSymlink = tempRoot('runtime-config-symlink');
  try {
    const runDirectory = path.join(configSymlink.root, 'delegation_fixture_0001');
    fs.mkdirSync(runDirectory, { recursive: true, mode: 0o700 });
    fs.chmodSync(configSymlink.root, 0o700);
    fs.chmodSync(runDirectory, 0o700);
    const outside = path.join(configSymlink.parent, 'outside.json');
    fs.writeFileSync(outside, 'outside');
    fs.symlinkSync(outside, path.join(runDirectory, 'mcp-config.json'));
    const runtime = createAgentRuntimeFiles({ rootPath: configSymlink.root, platform: 'linux' });
    await expectRuntimeError(
      () => runtime.prepareRun(preparedInput()),
      'runtime_target_unavailable',
    );
    assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');
  } finally {
    configSymlink.cleanup();
  }

  const journalSymlink = tempRoot('runtime-journal-symlink');
  try {
    fs.mkdirSync(journalSymlink.root, { recursive: true, mode: 0o700 });
    fs.chmodSync(journalSymlink.root, 0o700);
    const outside = path.join(journalSymlink.parent, 'outside.json');
    fs.writeFileSync(outside, '{"version":1,"entries":[]}');
    const runtime = createAgentRuntimeFiles({ rootPath: journalSymlink.root, platform: 'linux' });
    fs.symlinkSync(outside, runtime.journalPath);
    assert.deepEqual(runtime.readJournal(), { status: 'unavailable', reason: 'insecure' });
    await expectRuntimeError(
      () => runtime.prepareRun(preparedInput()),
      'journal_unavailable',
    );
    assert.equal(fs.readFileSync(outside, 'utf8'), '{"version":1,"entries":[]}');
  } finally {
    journalSymlink.cleanup();
  }

  const corruptCases = [
    ['invalid-json', '{'],
    ['wrong-version', JSON.stringify({ version: 3, entries: [] })],
    ['unknown-top-key', JSON.stringify({ version: 2, entries: [], extra: true })],
    ['unknown-role', JSON.stringify({
      version: 2,
      entries: [{
        state: 'prepared',
        role: 'user_process',
        delegationId: 'delegation_fixture_0001',
        adapterId: 'claude-code',
        profileVersion: '2.1.177',
        createdAt: 1000,
        binaryRealPath: '/fixture/bin/claude',
        argvSignature: 'argv_signature_fixture_0001',
        fixedEnv: {},
        envFingerprint: 'env_fingerprint_fixture_0001',
        generation: 'generation_fixture_previous',
      }],
    })],
    ['secret-bearing-field', JSON.stringify({
      version: 2,
      entries: [{
        state: 'prepared',
        role: 'provider_server',
        delegationId: 'provider_server_fixture_0001',
        adapterId: 'opencode',
        profileVersion: '1.14.25',
        createdAt: 1000,
        binaryRealPath: '/fixture/bin/opencode',
        argvSignature: 'argv_signature_opencode_0001',
        fixedEnv: {},
        envFingerprint: 'env_fingerprint_opencode_0001',
        generation: 'generation_fixture_previous',
        spawnSecretEnvBindings: [],
      }],
    })],
    ['missing-generation', JSON.stringify({
      version: 1,
      entries: [{
        state: 'prepared',
        delegationId: 'delegation_fixture_0001',
        adapterId: 'claude-code',
        profileVersion: '2.1.177',
        createdAt: 1000,
        binaryRealPath: '/fixture/bin/claude',
        argvSignature: 'argv_signature_fixture_0001',
        envFingerprint: 'env_fingerprint_fixture_0001',
      }],
    })],
    ['unknown-entry-key', JSON.stringify({
      version: 1,
      entries: [{
        state: 'prepared',
        delegationId: 'delegation_fixture_0001',
        adapterId: 'claude-code',
        profileVersion: '2.1.177',
        createdAt: 1000,
        binaryRealPath: '/fixture/bin/claude',
        argvSignature: 'argv_signature_fixture_0001',
        envFingerprint: 'env_fingerprint_fixture_0001',
        task: 'forbidden',
      }],
    })],
  ];
  for (const [label, contents] of corruptCases) {
    const corrupt = tempRoot(`runtime-corrupt-${label}`);
    try {
      fs.mkdirSync(corrupt.root, { recursive: true, mode: 0o700 });
      fs.chmodSync(corrupt.root, 0o700);
      const runtime = createAgentRuntimeFiles({ rootPath: corrupt.root, platform: 'linux' });
      fs.writeFileSync(runtime.journalPath, contents, { mode: 0o600 });
      fs.chmodSync(runtime.journalPath, 0o600);
      assert.equal(runtime.readJournal().status, 'unavailable', label);
    } finally {
      corrupt.cleanup();
    }
  }

  const corruptRecovery = tempRoot('runtime-corrupt-recovery');
  try {
    fs.mkdirSync(corruptRecovery.root, { recursive: true, mode: 0o700 });
    fs.chmodSync(corruptRecovery.root, 0o700);
    const runtime = createAgentRuntimeFiles({ rootPath: corruptRecovery.root, platform: 'linux' });
    fs.writeFileSync(runtime.recoveryPath, JSON.stringify({
      version: 1,
      dispositions: [{
        delegationId: 'delegation_fixture_0001',
        code: 'daemon_restart_lost_run',
        recoveredAt: 1700000000000,
        task: 'forbidden',
      }],
    }), { mode: 0o600 });
    fs.chmodSync(runtime.recoveryPath, 0o644);
    assert.deepEqual(
      runtime.readRecoveryDispositions(),
      { status: 'unavailable', reason: 'insecure' },
    );
    fs.chmodSync(runtime.recoveryPath, 0o600);
    assert.deepEqual(
      runtime.readRecoveryDispositions(),
      { status: 'unavailable', reason: 'corrupt' },
    );
  } finally {
    corruptRecovery.cleanup();
  }

  const oversize = tempRoot('runtime-oversize');
  try {
    fs.mkdirSync(oversize.root, { recursive: true, mode: 0o700 });
    fs.chmodSync(oversize.root, 0o700);
    const runtime = createAgentRuntimeFiles({ rootPath: oversize.root, platform: 'linux' });
    fs.writeFileSync(
      runtime.journalPath,
      Buffer.alloc(AGENT_ORPHAN_JOURNAL_LIMIT_BYTES + 1, 0x20),
      { mode: 0o600 },
    );
    fs.chmodSync(runtime.journalPath, 0o600);
    assert.deepEqual(runtime.readJournal(), { status: 'unavailable', reason: 'oversize' });
  } finally {
    oversize.cleanup();
  }
}

function journalEntry(processTreeModule, state = 'active', overrides = {}) {
  const binaryRealPath = '/fixture/bin/claude';
  const argv = ['--output-format', 'stream-json', '--print'];
  const common = {
    state,
    role: 'delegation',
    delegationId: 'delegation_fixture_0001',
    adapterId: 'claude-code',
    profileVersion: '2.1.177',
    createdAt: 1000,
    binaryRealPath,
    argvSignature: processTreeModule.createArgvSignature(binaryRealPath, argv),
    fixedEnv: {},
    envFingerprint: 'env_fingerprint_fixture_0001',
    generation: 'generation_fixture_previous',
  };
  return state === 'active'
    ? {
      ...common,
      pid: 41001,
      processGroupId: 41001,
      startedAt: 1100,
      processStartIdentity: '90001',
      ...overrides,
    }
    : { ...common, ...overrides };
}

function linuxStat(pid, parentPid, processGroupId, startTicks, name = 'claude worker') {
  const fields = Array(19).fill('0');
  fields[0] = String(parentPid);
  fields[1] = String(processGroupId);
  fields[18] = String(startTicks);
  return `${pid} (${name}) S ${fields.join(' ')}\n`;
}

function nullDelimited(values) {
  return Buffer.from(`${values.join('\0')}\0`, 'utf8');
}

function linuxFixture(processes, options = {}) {
  const processMap = new Map(processes.map((entry) => [String(entry.pid), entry]));
  const errorPaths = new Set(options.errorPaths ?? []);
  return {
    exists(target) {
      const match = target.match(/^\/proc\/(\d+)$/);
      return match ? processMap.has(match[1]) : target === '/proc';
    },
    readDirectory(target, maximumEntries) {
      assert.equal(target, '/proc');
      const names = [...processMap.keys()];
      return {
        names: names.slice(0, maximumEntries),
        truncated: options.truncated === true || names.length > maximumEntries,
      };
    },
    readBoundedFile(target, maximumBytes) {
      if (errorPaths.has(target)) throw Object.assign(new Error('fixture denied'), { code: 'EACCES' });
      const match = target.match(/^\/proc\/(\d+)\/(stat|cmdline|environ)$/);
      if (!match || !processMap.has(match[1])) {
        throw Object.assign(new Error('fixture missing'), { code: 'ENOENT' });
      }
      const record = processMap.get(match[1]);
      let value;
      if (match[2] === 'stat') {
        value = Buffer.from(linuxStat(
          record.pid,
          record.parentPid,
          record.processGroupId,
          record.startTicks,
          record.name,
        ));
      } else if (match[2] === 'cmdline') {
        value = nullDelimited(record.argv);
      } else {
        value = nullDelimited(record.environment ?? []);
      }
      assert(value.length <= maximumBytes, 'fixture obeys the requested production read cap');
      return value;
    },
  };
}

function linuxRecords(entry, overrides = {}) {
  const root = {
    pid: 41001,
    parentPid: 1,
    processGroupId: 41001,
    startTicks: '90001',
    argv: [entry.binaryRealPath, '--output-format', 'stream-json', '--print'],
    environment: [`FSB_AGENT_FINGERPRINT=${entry.envFingerprint}`],
    ...overrides.root,
  };
  const child = {
    pid: 41002,
    parentPid: 41001,
    processGroupId: 41001,
    startTicks: '90002',
    argv: ['/usr/bin/helper', '--worker'],
    environment: [],
    ...overrides.child,
  };
  const unrelated = {
    pid: 42001,
    parentPid: 1,
    processGroupId: 42001,
    startTicks: '91001',
    argv: [entry.binaryRealPath, '--interactive'],
    environment: ['FSB_AGENT_FINGERPRINT=unrelated_fingerprint_0001'],
    ...overrides.unrelated,
  };
  return [root, child, unrelated];
}

async function runConcreteInspectorTests(processTreeModule) {
  const {
    DARWIN_PROCESS_TABLE_ARGS,
    PROCESS_INSPECTION_MAX_OUTPUT_BYTES,
    PROCESS_NATIVE_EXEC_OPTIONS,
    WINDOWS_PROCESS_QUERY_ARGS,
    createProcessInspector,
    createProcessStartIdentity,
  } = processTreeModule;

  const active = journalEntry(processTreeModule);
  const linuxProcesses = linuxRecords(active);
  const linux = createProcessInspector({
    platform: 'linux',
    fs: linuxFixture(linuxProcesses),
  });
  const linuxConfirmed = await linux.inspect(active);
  assert.equal(linuxConfirmed.classification, 'confirmed');
  assert.equal(linuxConfirmed.process.pid, 41001);
  assert.equal(linuxConfirmed.process.processGroupId, 41001);
  assert.deepEqual(linuxConfirmed.process.descendants, [41002]);

  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(linuxProcesses),
    }).inspect({ ...active, processStartIdentity: 'reused-start-identity' })).classification,
    'ambiguous',
    'PID reuse is not stale or confirmed',
  );
  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(linuxRecords(active, {
        root: { argv: [active.binaryRealPath, '--different-fixed-argv'] },
      })),
    }).inspect(active)).classification,
    'ambiguous',
    'argv mismatch fails closed',
  );
  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(linuxRecords(active, {
        root: { environment: ['FSB_AGENT_FINGERPRINT=different_fingerprint'] },
      })),
    }).inspect(active)).classification,
    'ambiguous',
    'environment mismatch fails closed',
  );

  const absentProcesses = linuxProcesses.filter((record) => record.pid !== 41001 && record.pid !== 41002);
  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(absentProcesses),
    }).inspect(active)).classification,
    'stale',
    'complete table proves an absent active group stale',
  );
  assert.deepEqual(
    await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(linuxProcesses.filter((record) => record.pid !== 41001)),
    }).inspect(active),
    { classification: 'ambiguous', reason: 'group_still_present' },
    'leader absence is not success while its process group remains',
  );

  const prepared = journalEntry(processTreeModule, 'prepared');
  const preparedProcesses = linuxRecords(prepared);
  const preparedConfirmed = await createProcessInspector({
    platform: 'linux',
    fs: linuxFixture(preparedProcesses),
  }).inspect(prepared);
  assert.equal(preparedConfirmed.classification, 'confirmed');
  assert.equal(preparedConfirmed.process.pid, 41001);

  const secondMatch = {
    ...preparedProcesses[2],
    argv: [...preparedProcesses[0].argv],
    environment: [...preparedProcesses[0].environment],
  };
  assert.deepEqual(
    await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture([preparedProcesses[0], preparedProcesses[1], secondMatch]),
    }).inspect(prepared),
    { classification: 'ambiguous', reason: 'multiple_matches' },
  );
  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(preparedProcesses.map((record) => (
        record.pid === 41001
          ? { ...record, argv: [record.argv[0], '--other'] }
          : record
      ))),
    }).inspect(prepared)).classification,
    'stale',
    'a complete fingerprint-specific search can prove no prepared match',
  );
  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(preparedProcesses, {
        errorPaths: ['/proc/41001/environ'],
      }),
    }).inspect(prepared)).classification,
    'ambiguous',
    'permission loss cannot prove absence',
  );
  assert.equal(
    (await createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(preparedProcesses, { truncated: true }),
    }).inspect(prepared)).classification,
    'ambiguous',
    'truncated process enumeration cannot prove absence',
  );

  const darwinStart = 'Tue Jul 14 12:00:00 2026';
  const darwinActive = {
    ...active,
    processStartIdentity: createProcessStartIdentity(darwinStart),
  };
  const darwinTable = [
    `41001 1 41001 ${darwinStart} /fixture/bin/claude --output-format stream-json --print`,
    `41002 41001 41001 ${darwinStart} /usr/bin/helper --worker`,
    `42001 1 42001 ${darwinStart} /fixture/bin/claude --interactive`,
    '',
  ].join('\n');
  const darwinEvidence = [
    `41001 1 41001 ${darwinStart} /fixture/bin/claude --output-format stream-json --print`,
    `FSB_AGENT_ARGV_SIGNATURE=${darwinActive.argvSignature}`,
    `FSB_AGENT_FINGERPRINT=${darwinActive.envFingerprint}`,
  ].join(' ');
  const darwinCalls = [];
  const darwin = createProcessInspector({
    platform: 'darwin',
    exec: async (file, args, options) => {
      darwinCalls.push({ file, args: [...args], options });
      return {
        stdout: args[0] === '-axo' ? darwinTable : `${darwinEvidence}\n`,
        stderr: '',
      };
    },
  });
  const darwinConfirmed = await darwin.inspect(darwinActive);
  assert.equal(darwinConfirmed.classification, 'confirmed');
  assert.deepEqual(darwinConfirmed.process.descendants, [41002]);
  assert.deepEqual(darwinCalls[0], {
    file: '/bin/ps',
    args: [...DARWIN_PROCESS_TABLE_ARGS],
    options: PROCESS_NATIVE_EXEC_OPTIONS,
  });
  assert.deepEqual(darwinCalls[1], {
    file: '/bin/ps',
    args: [
      '-E',
      '-ww',
      '-p',
      '41001',
      '-o',
      'pid=,ppid=,pgid=,lstart=,command=',
    ],
    options: PROCESS_NATIVE_EXEC_OPTIONS,
  });
  assert.equal(PROCESS_NATIVE_EXEC_OPTIONS.shell, false);
  assert.equal(PROCESS_NATIVE_EXEC_OPTIONS.maxBuffer, PROCESS_INSPECTION_MAX_OUTPUT_BYTES);

  const darwinPartial = createProcessInspector({
    platform: 'darwin',
    exec: async () => ({ stdout: 'not a complete fixed table\n', stderr: '' }),
  });
  assert.equal((await darwinPartial.inspect(darwinActive)).classification, 'ambiguous');
  const darwinUnavailable = createProcessInspector({
    platform: 'darwin',
    exec: async () => { throw new Error('native probe unavailable'); },
  });
  assert.equal((await darwinUnavailable.inspect(darwinActive)).classification, 'ambiguous');

  const windowsCalls = [];
  const windowsLstat = [];
  const windows = createProcessInspector({
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    fs: {
      lstat: (target) => {
        windowsLstat.push(target);
        return { isFile: () => true, isSymbolicLink: () => false };
      },
    },
    exec: async (file, args, options) => {
      windowsCalls.push({ file, args: [...args], options });
      return {
        stdout: [
          'Node,CommandLine,CreationDate,ParentProcessId,ProcessId',
          'HOST,"claude --print",20260714120000.000000-300,1,41001',
          '',
        ].join('\r\n'),
        stderr: '',
      };
    },
  });
  assert.deepEqual(
    await windows.inspect(active),
    { classification: 'ambiguous', reason: 'evidence_partial' },
    'native Windows query remains ambiguous without exact environment evidence',
  );
  assert.deepEqual(windowsLstat, ['C:\\Windows\\System32\\wbem\\wmic.exe']);
  assert.deepEqual(windowsCalls[0], {
    file: 'C:\\Windows\\System32\\wbem\\wmic.exe',
    args: [...WINDOWS_PROCESS_QUERY_ARGS],
    options: PROCESS_NATIVE_EXEC_OPTIONS,
  });

  let unavailableWindowsExec = 0;
  const unavailableWindows = createProcessInspector({
    platform: 'win32',
    systemRoot: 'C:\\Windows',
    fs: {
      lstat: () => { throw new Error('missing'); },
    },
    exec: async () => {
      unavailableWindowsExec += 1;
      return { stdout: '', stderr: '' };
    },
  });
  assert.equal((await unavailableWindows.inspect(active)).classification, 'ambiguous');
  assert.equal(unavailableWindowsExec, 0, 'missing native facility sends no query or kill');

  let unsupportedExec = 0;
  const unsupported = createProcessInspector({
    platform: 'aix',
    exec: async () => {
      unsupportedExec += 1;
      return { stdout: '', stderr: '' };
    },
  });
  assert.deepEqual(
    await unsupported.inspect(active),
    { classification: 'ambiguous', reason: 'platform_unsupported' },
  );
  assert.equal(unsupportedExec, 0);
}

function confirmedInspection(overrides = {}) {
  return {
    classification: 'confirmed',
    process: {
      pid: 41001,
      parentPid: 1,
      processGroupId: 41001,
      processStartIdentity: '90001',
      descendants: [],
      ...overrides,
    },
  };
}

function queuedInspector(values) {
  let index = 0;
  const calls = [];
  return {
    calls,
    async inspect(entry) {
      calls.push(entry.delegationId);
      const value = values[Math.min(index, values.length - 1)];
      index += 1;
      return value;
    },
  };
}

function closedChild(overrides = {}) {
  return {
    pid: 41001,
    processGroupId: 41001,
    platform: 'linux',
    closed: Promise.resolve({ code: 0, signal: null }),
    ...overrides,
  };
}

async function expectTreeUnsettled(operation) {
  await assert.rejects(
    operation,
    (error) => {
      assert.equal(error.code, 'tree_unsettled');
      return true;
    },
  );
}

async function runTerminationTests(processTreeModule) {
  const { createProcessTreeTerminator, PROCESS_NATIVE_EXEC_OPTIONS } = processTreeModule;
  const active = journalEntry(processTreeModule);
  const staleInspection = { classification: 'stale' };
  const ambiguousInspection = { classification: 'ambiguous', reason: 'identity_mismatch' };

  {
    const inspector = queuedInspector([confirmedInspection(), staleInspection]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
      monotonicNow: () => 1,
    });
    await terminator.stop(active, closedChild(), { grace: 25 });
    assert.deepEqual(signals, [[-41001, 'SIGTERM']]);
  }

  {
    const inspector = queuedInspector([
      confirmedInspection(),
      confirmedInspection({ descendants: [41002] }),
      staleInspection,
    ]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
      monotonicNow: () => 1,
    });
    await terminator.stop(active, closedChild(), { grace: 25 });
    assert.deepEqual(signals, [
      [-41001, 'SIGTERM'],
      [-41001, 'SIGKILL'],
    ]);
  }

  {
    const inspector = queuedInspector([staleInspection, staleInspection]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
    });
    await terminator.stop(active, closedChild(), { grace: 25 });
    assert.deepEqual(signals, [], 'already stale sends no signal');
  }

  {
    const inspector = queuedInspector([confirmedInspection()]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => {
        signals.push([group, signal]);
        throw Object.assign(new Error('denied'), { code: 'EPERM' });
      },
      wait: async () => {},
    });
    await expectTreeUnsettled(() => terminator.stop(active, closedChild(), { grace: 25 }));
    assert.deepEqual(signals, [[-41001, 'SIGTERM']]);
  }

  {
    const inspector = queuedInspector([
      confirmedInspection(),
      staleInspection,
      staleInspection,
    ]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => {
        signals.push([group, signal]);
        throw Object.assign(new Error('gone'), { code: 'ESRCH' });
      },
      wait: async () => {},
      monotonicNow: () => 1,
    });
    await terminator.stop(active, closedChild(), { grace: 25 });
    assert.deepEqual(signals, [[-41001, 'SIGTERM']]);
  }

  {
    const inspector = queuedInspector([confirmedInspection(), ambiguousInspection]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
      monotonicNow: () => 1,
    });
    await expectTreeUnsettled(() => terminator.stop(active, closedChild(), { grace: 25 }));
    assert.deepEqual(signals, [[-41001, 'SIGTERM']], 'ambiguous reinspection receives no escalation');
  }

  {
    const inspector = queuedInspector([
      confirmedInspection(),
      confirmedInspection({ descendants: [41002] }),
      confirmedInspection({ descendants: [41002] }),
    ]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
      monotonicNow: () => 1,
    });
    await expectTreeUnsettled(() => terminator.stop(active, closedChild(), { grace: 25 }));
    assert.deepEqual(signals, [
      [-41001, 'SIGTERM'],
      [-41001, 'SIGKILL'],
    ]);
  }

  {
    const inspector = queuedInspector([ambiguousInspection]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
    });
    await expectTreeUnsettled(() => terminator.stop(active, closedChild(), { grace: 25 }));
    assert.deepEqual(signals, [], 'unrelated or mismatched identity receives no signal');
  }

  {
    const inspector = queuedInspector([confirmedInspection(), staleInspection]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: async () => {},
      monotonicNow: () => 1,
    });
    const first = terminator.stop(active, closedChild(), { grace: 25 });
    const second = terminator.stop(active, closedChild(), { grace: 25 });
    assert.strictEqual(first, second, 'duplicate stop returns the same in-flight operation');
    await Promise.all([first, second]);
    assert.deepEqual(signals, [[-41001, 'SIGTERM']]);
    assert.equal(inspector.calls.length, 2);

    const afterSettlement = terminator.stop(active, closedChild(), { grace: 25 });
    assert.notStrictEqual(
      afterSettlement,
      first,
      'a successful settled stop is evicted before a later inspection',
    );
    await afterSettlement;
    assert.equal(inspector.calls.length, 4, 'the later stop performs fresh inspection');
  }

  {
    const inspector = queuedInspector([
      ambiguousInspection,
      staleInspection,
      staleInspection,
    ]);
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: () => assert.fail('ambiguous or stale evidence must not be signaled'),
      wait: async () => {},
    });
    const failed = terminator.stop(active, closedChild(), { grace: 25 });
    await expectTreeUnsettled(() => failed);

    const afterRejection = terminator.stop(active, closedChild(), { grace: 25 });
    assert.notStrictEqual(
      afterRejection,
      failed,
      'a rejected settled stop is evicted before a later inspection',
    );
    await afterRejection;
    assert.equal(inspector.calls.length, 3, 'the later stop re-inspects after rejection');
  }

  {
    let resolveClose;
    const child = closedChild({
      closed: new Promise((resolve) => { resolveClose = resolve; }),
    });
    const inspector = queuedInspector([confirmedInspection(), staleInspection]);
    const signals = [];
    const terminator = createProcessTreeTerminator({
      platform: 'linux',
      inspector,
      signalGroup: (group, signal) => signals.push([group, signal]),
      wait: () => new Promise(() => {}),
      monotonicNow: () => 1,
    });
    let settled = false;
    const operation = terminator.stop(active, child, { grace: 25 }).then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, 'stop remains pending while child close is delayed');
    resolveClose({ code: 0, signal: 'SIGTERM' });
    await operation;
    assert.equal(settled, true);
  }

  {
    const inspector = queuedInspector([confirmedInspection(), staleInspection]);
    const calls = [];
    const terminator = createProcessTreeTerminator({
      platform: 'win32',
      inspector,
      systemRoot: 'C:\\Windows',
      fs: {
        lstat: (target) => {
          calls.push({ type: 'lstat', target });
          return { isFile: () => true, isSymbolicLink: () => false };
        },
      },
      exec: async (file, args, options) => {
        calls.push({ type: 'exec', file, args: [...args], options });
        return { stdout: '', stderr: '' };
      },
      wait: async () => {},
    });
    await terminator.stop(active, closedChild({ platform: 'win32' }), { grace: 25 });
    assert.deepEqual(calls, [
      { type: 'lstat', target: 'C:\\Windows\\System32\\taskkill.exe' },
      {
        type: 'exec',
        file: 'C:\\Windows\\System32\\taskkill.exe',
        args: ['/pid', '41001', '/T', '/F'],
        options: PROCESS_NATIVE_EXEC_OPTIONS,
      },
    ]);
    assert.equal(calls[1].options.shell, false);
    assert.equal(calls[1].options.windowsHide, true);
  }

  {
    const inspector = queuedInspector([confirmedInspection()]);
    let taskkillCalls = 0;
    const terminator = createProcessTreeTerminator({
      platform: 'win32',
      inspector,
      taskkill: async () => {
        taskkillCalls += 1;
        throw new Error('taskkill failed');
      },
      wait: async () => {},
    });
    await expectTreeUnsettled(() => terminator.stop(
      active,
      closedChild({ platform: 'win32' }),
      { grace: 25 },
    ));
    assert.equal(taskkillCalls, 1);
  }

  {
    const inspector = queuedInspector([ambiguousInspection]);
    let taskkillCalls = 0;
    const terminator = createProcessTreeTerminator({
      platform: 'win32',
      inspector,
      taskkill: async () => { taskkillCalls += 1; },
      wait: async () => {},
    });
    await expectTreeUnsettled(() => terminator.stop(
      active,
      closedChild({ platform: 'win32' }),
      { grace: 25 },
    ));
    assert.equal(taskkillCalls, 0, 'partial Windows evidence never reaches taskkill');
  }
}

function recoveryRuntime(entries, options = {}) {
  let remaining = [...entries];
  let dispositions = [...(options.dispositions ?? [])];
  const events = options.events ?? [];
  const removed = [];
  const recorded = [];
  return {
    events,
    removed,
    recorded,
    remaining: () => [...remaining],
    dispositions: () => [...dispositions],
    readJournal() {
      events.push('journal:read');
      if (options.unavailable) {
        return { status: 'unavailable', reason: options.unavailable };
      }
      return { status: 'ok', journal: { version: 2, entries: [...remaining] } };
    },
    readRecoveryDispositions() {
      events.push('recovery:read');
      if (options.unavailableRecovery) {
        return { status: 'unavailable', reason: options.unavailableRecovery };
      }
      return { status: 'ok', journal: { version: 1, dispositions: [...dispositions] } };
    },
    async recordRestartLossAndRemoveRun(entry, disposition) {
      events.push(`record:${entry.delegationId}`);
      if (options.failRemove?.has(entry.delegationId)) throw new Error('injected remove failure');
      if (!dispositions.some((candidate) => candidate.delegationId === entry.delegationId)) {
        dispositions = [...dispositions, disposition].slice(-128);
        recorded.push(disposition);
      }
      removed.push(entry.delegationId);
      remaining = remaining.filter((candidate) => candidate.delegationId !== entry.delegationId);
      return [...dispositions];
    },
    async removeRecoveredRun(entry) {
      events.push(`remove:${entry.delegationId}`);
      if (options.failRemove?.has(entry.delegationId)) throw new Error('injected remove failure');
      const stored = remaining.find((candidate) => (
        candidate.delegationId === entry.delegationId && candidate.role === entry.role
      ));
      if (!stored) throw new Error('injected journal conflict');
      removed.push(entry.delegationId);
      remaining = remaining.filter((candidate) => candidate !== stored);
    },
  };
}

function plannedRecoveryInspector(plans, events = []) {
  const calls = [];
  const offsets = new Map();
  return {
    calls,
    async inspect(entry) {
      calls.push(entry);
      events.push(`inspect:${entry.delegationId}`);
      const plan = plans.get(entry.delegationId);
      if (!plan) throw new Error('unexpected journal entry');
      const offset = offsets.get(entry.delegationId) ?? 0;
      offsets.set(entry.delegationId, offset + 1);
      const value = plan[Math.min(offset, plan.length - 1)];
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function recoveryTerminator(options = {}) {
  const calls = [];
  const events = options.events ?? [];
  return {
    calls,
    async stop(entry, child, stopOptions) {
      calls.push({ entry, child, options: stopOptions });
      events.push(`stop:${entry.delegationId}`);
      if (options.fail?.has(entry.delegationId)) {
        throw Object.assign(new Error('injected tree failure'), { code: 'tree_unsettled' });
      }
    },
  };
}

async function runRecoveryTests(runtimeModule, processTreeModule) {
  const { createAgentRuntimeFiles } = runtimeModule;
  const createAgentStartupRecovery = (dependencies) => runtimeModule.createAgentStartupRecovery({
    generation: 'generation_fixture_current',
    now: () => 1700000000000,
    ...dependencies,
  });
  const { createProcessInspector } = processTreeModule;
  const staleInspection = { classification: 'stale' };
  const ambiguousIdentity = { classification: 'ambiguous', reason: 'identity_mismatch' };

  {
    const events = [];
    const runtime = recoveryRuntime([], { events });
    const inspector = plannedRecoveryInspector(new Map(), events);
    const terminator = recoveryTerminator({ events });
    const recovery = createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    });
    const first = recovery.recoverBeforeAdvertise(async () => {
      events.push('advertise');
    });
    const second = recovery.recoverBeforeAdvertise(async () => {
      events.push('advertise:duplicate');
    });
    assert.strictEqual(first, second, 'startup recovery and advertisement are one-shot');
    const result = await first;
    assert.deepEqual(result, {
      confirmedKilled: 0,
      staleCleared: 0,
      ambiguousFailClosed: 0,
      spawnAvailable: true,
      profiles: [],
      restartLosses: [],
    });
    assert.deepEqual(events, ['recovery:read', 'journal:read', 'advertise']);
    assert(Object.isFrozen(result));
    assert(Object.isFrozen(result.profiles));
    assert.strictEqual(recovery.recover(), recovery.recover(), 'recovery itself is idempotent');
  }

  {
    const entry = journalEntry(processTreeModule, 'active', {
      generation: 'generation_fixture_current',
    });
    const events = [];
    const runtime = recoveryRuntime([entry], { events });
    const inspector = plannedRecoveryInspector(new Map(), events);
    const terminator = recoveryTerminator({ events });
    let advertised = false;
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    }).recoverBeforeAdvertise(() => { advertised = true; });
    assert.equal(result.confirmedKilled, 0);
    assert.equal(result.staleCleared, 0);
    assert.equal(result.ambiguousFailClosed, 1);
    assert.equal(result.spawnAvailable, false);
    assert.deepEqual(result.restartLosses, []);
    assert.equal(advertised, false);
    assert.deepEqual(inspector.calls, [], 'same-generation disk state is never adopted or inspected');
    assert.equal(terminator.calls.length, 0, 'same-generation disk state is never killed');
    assert.deepEqual(runtime.remaining(), [entry]);
    assert.deepEqual(runtime.recorded, []);
    assert.deepEqual(events, ['recovery:read', 'journal:read']);
  }

  {
    const entry = journalEntry(processTreeModule);
    const events = [];
    const runtime = recoveryRuntime([entry], {
      events,
      unavailableRecovery: 'corrupt',
    });
    const inspector = plannedRecoveryInspector(new Map(), events);
    const terminator = recoveryTerminator({ events });
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    }).recover();
    assert.equal(result.ambiguousFailClosed, 1);
    assert.equal(result.spawnAvailable, false);
    assert.deepEqual(result.restartLosses, []);
    assert.deepEqual(events, ['recovery:read']);
    assert.deepEqual(inspector.calls, [], 'corrupt disposition state blocks process mutation');
    assert.equal(terminator.calls.length, 0);
    assert.deepEqual(runtime.remaining(), [entry]);
  }

  {
    const entry = journalEntry(processTreeModule);
    const events = [];
    const runtime = recoveryRuntime([entry], { events });
    const inspector = plannedRecoveryInspector(new Map([
      [entry.delegationId, [confirmedInspection({ descendants: [41002] }), staleInspection]],
    ]), events);
    const terminator = recoveryTerminator({ events });
    const recovery = createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 250,
    });
    const result = await recovery.recover();
    assert.deepEqual(result, {
      confirmedKilled: 1,
      staleCleared: 0,
      ambiguousFailClosed: 0,
      spawnAvailable: true,
      profiles: [{
        role: 'delegation',
        adapterId: 'claude-code',
        profileVersion: '2.1.177',
        confirmedKilled: 1,
        staleCleared: 0,
        ambiguousFailClosed: 0,
      }],
      restartLosses: [{
        delegationId: entry.delegationId,
        code: 'daemon_restart_lost_run',
        recoveredAt: 1700000000000,
      }],
    });
    assert.deepEqual(events, [
      'recovery:read',
      'journal:read',
      `inspect:${entry.delegationId}`,
      `stop:${entry.delegationId}`,
      `inspect:${entry.delegationId}`,
      `record:${entry.delegationId}`,
    ]);
    assert.equal(terminator.calls.length, 1);
    assert.strictEqual(terminator.calls[0].entry, entry);
    assert.equal(terminator.calls[0].child, null);
    assert.deepEqual(terminator.calls[0].options, { grace: 250 });
    assert.deepEqual(runtime.remaining(), []);
    assert.equal(runtime.recorded.length, 1);
    assert(Object.isFrozen(result.profiles[0]));
    assert(Object.isFrozen(result.restartLosses));
    assert(Object.isFrozen(result.restartLosses[0]));
    assert.strictEqual(recovery.recover(), recovery.recover(), 'repeated startup recovery is non-destructive');
    assert.equal(runtime.recorded.length, 1, 'repeated recovery persists no duplicate disposition');
  }

  {
    const delegation = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_role_fixture_0001',
      envFingerprint: 'env_fingerprint_role_fixture_0001',
    });
    const providerServer = journalEntry(processTreeModule, 'active', {
      role: 'provider_server',
      delegationId: 'provider_server_role_fixture_0001',
      adapterId: 'opencode',
      profileVersion: '1.14.25',
      binaryRealPath: '/fixture/bin/opencode',
      argvSignature: 'argv_signature_provider_role_0001',
      fixedEnv: { OPENCODE_DISABLE_PROJECT_CONFIG: '1' },
      envFingerprint: 'env_fingerprint_provider_role_0001',
      pid: 44001,
      processGroupId: 44001,
      processStartIdentity: '94001',
    });
    const ambiguousServer = journalEntry(processTreeModule, 'prepared', {
      role: 'provider_server',
      delegationId: 'provider_server_role_fixture_0002',
      adapterId: 'opencode',
      profileVersion: '1.14.25',
      binaryRealPath: '/fixture/bin/opencode',
      argvSignature: 'argv_signature_provider_role_0002',
      fixedEnv: { OPENCODE_DISABLE_PROJECT_CONFIG: '1' },
      envFingerprint: 'env_fingerprint_provider_role_0002',
    });
    const entries = [delegation, providerServer, ambiguousServer];
    const events = [];
    const runtime = recoveryRuntime(entries, { events });
    const inspector = plannedRecoveryInspector(new Map([
      [delegation.delegationId, [staleInspection]],
      [providerServer.delegationId, [confirmedInspection({
        pid: 44001,
        processGroupId: 44001,
      }), staleInspection]],
      [ambiguousServer.delegationId, [ambiguousIdentity]],
    ]), events);
    const terminator = recoveryTerminator({ events });
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    }).recover();
    assert.deepEqual(result, {
      confirmedKilled: 1,
      staleCleared: 1,
      ambiguousFailClosed: 1,
      spawnAvailable: false,
      profiles: [{
        role: 'delegation',
        adapterId: 'claude-code',
        profileVersion: '2.1.177',
        confirmedKilled: 0,
        staleCleared: 1,
        ambiguousFailClosed: 0,
      }, {
        role: 'provider_server',
        adapterId: 'opencode',
        profileVersion: '1.14.25',
        confirmedKilled: 1,
        staleCleared: 0,
        ambiguousFailClosed: 1,
      }],
      restartLosses: [{
        delegationId: delegation.delegationId,
        code: 'daemon_restart_lost_run',
        recoveredAt: 1700000000000,
      }],
    });
    assert.deepEqual(events, [
      'recovery:read',
      'journal:read',
      `inspect:${delegation.delegationId}`,
      `record:${delegation.delegationId}`,
      `inspect:${providerServer.delegationId}`,
      `stop:${providerServer.delegationId}`,
      `inspect:${providerServer.delegationId}`,
      `remove:${providerServer.delegationId}`,
      `inspect:${ambiguousServer.delegationId}`,
    ]);
    assert.equal(terminator.calls.length, 1, 'only the identity-confirmed owned server is signaled');
    assert.strictEqual(terminator.calls[0].entry, providerServer);
    assert.deepEqual(runtime.recorded, [result.restartLosses[0]]);
    assert.deepEqual(runtime.remaining(), [ambiguousServer]);
  }

  {
    const prepared = journalEntry(processTreeModule, 'prepared', {
      delegationId: 'delegation_fixture_0002',
      envFingerprint: 'env_fingerprint_fixture_0002',
    });
    const staleActive = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_fixture_0003',
      envFingerprint: 'env_fingerprint_fixture_0003',
      pid: 43001,
      processGroupId: 43001,
      processStartIdentity: '93001',
    });
    const ambiguousPrepared = journalEntry(processTreeModule, 'prepared', {
      delegationId: 'delegation_fixture_0004',
      envFingerprint: 'env_fingerprint_fixture_0004',
    });
    const entries = [prepared, staleActive, ambiguousPrepared];
    const events = [];
    const runtime = recoveryRuntime(entries, { events });
    const inspector = plannedRecoveryInspector(new Map([
      [prepared.delegationId, [confirmedInspection({ pid: 42001 }), staleInspection]],
      [staleActive.delegationId, [staleInspection]],
      [ambiguousPrepared.delegationId, [{
        classification: 'ambiguous',
        reason: 'multiple_matches',
      }]],
    ]), events);
    const terminator = recoveryTerminator({ events });
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    }).recover();
    assert.deepEqual(result, {
      confirmedKilled: 1,
      staleCleared: 1,
      ambiguousFailClosed: 1,
      spawnAvailable: false,
      profiles: [{
        role: 'delegation',
        adapterId: 'claude-code',
        profileVersion: '2.1.177',
        confirmedKilled: 1,
        staleCleared: 1,
        ambiguousFailClosed: 1,
      }],
      restartLosses: [prepared, staleActive].map((entry) => ({
        delegationId: entry.delegationId,
        code: 'daemon_restart_lost_run',
        recoveredAt: 1700000000000,
      })),
    });
    assert.deepEqual(events, [
      'recovery:read',
      'journal:read',
      `inspect:${prepared.delegationId}`,
      `stop:${prepared.delegationId}`,
      `inspect:${prepared.delegationId}`,
      `record:${prepared.delegationId}`,
      `inspect:${staleActive.delegationId}`,
      `record:${staleActive.delegationId}`,
      `inspect:${ambiguousPrepared.delegationId}`,
    ], 'journal entries recover serially in journal order');
    assert.deepEqual(
      runtime.remaining().map((entry) => entry.delegationId),
      [ambiguousPrepared.delegationId],
      'ambiguous record remains durable',
    );
  }

  {
    const categories = [
      ['delegation_fixture_0011', 'identity_mismatch'],
      ['delegation_fixture_0012', 'multiple_matches'],
      ['delegation_fixture_0013', 'evidence_partial'],
      ['delegation_fixture_0014', 'evidence_unavailable'],
      ['delegation_fixture_0015', 'platform_unsupported'],
    ];
    const entries = categories.map(([delegationId], index) => journalEntry(
      processTreeModule,
      index % 2 === 0 ? 'active' : 'prepared',
      {
        delegationId,
        envFingerprint: `env_fingerprint_fixture_${String(index + 11).padStart(4, '0')}`,
        ...(index % 2 === 0 ? {
          pid: 50000 + index,
          processGroupId: 50000 + index,
          processStartIdentity: `start_${50000 + index}`,
        } : {}),
      },
    ));
    const plans = new Map(entries.map((entry, index) => [
      entry.delegationId,
      [{ classification: 'ambiguous', reason: categories[index][1] }],
    ]));
    const runtime = recoveryRuntime(entries);
    const inspector = plannedRecoveryInspector(plans);
    const terminator = recoveryTerminator();
    let advertised = false;
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    }).recoverBeforeAdvertise(() => { advertised = true; });
    assert.equal(result.ambiguousFailClosed, categories.length);
    assert.equal(result.spawnAvailable, false);
    assert.equal(advertised, false, 'ambiguous recovery withholds capability advertisement');
    assert.equal(terminator.calls.length, 0);
    assert.deepEqual(runtime.removed, []);
    assert.deepEqual(inspector.calls, entries, 'inspector receives only exact journal records');
  }

  {
    const killFailure = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_fixture_0021',
      envFingerprint: 'env_fingerprint_fixture_0021',
    });
    const unsettled = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_fixture_0022',
      envFingerprint: 'env_fingerprint_fixture_0022',
      pid: 42002,
      processGroupId: 42002,
      processStartIdentity: '92002',
    });
    const removeFailure = journalEntry(processTreeModule, 'prepared', {
      delegationId: 'delegation_fixture_0023',
      envFingerprint: 'env_fingerprint_fixture_0023',
    });
    const inspectorFailure = journalEntry(processTreeModule, 'prepared', {
      delegationId: 'delegation_fixture_0024',
      envFingerprint: 'env_fingerprint_fixture_0024',
    });
    const entries = [killFailure, unsettled, removeFailure, inspectorFailure];
    const runtime = recoveryRuntime(entries, {
      failRemove: new Set([removeFailure.delegationId]),
    });
    const inspector = plannedRecoveryInspector(new Map([
      [killFailure.delegationId, [confirmedInspection()]],
      [unsettled.delegationId, [confirmedInspection(), confirmedInspection({ descendants: [9] })]],
      [removeFailure.delegationId, [staleInspection]],
      [inspectorFailure.delegationId, [new Error('injected inspection failure')]],
    ]));
    const terminator = recoveryTerminator({
      fail: new Set([killFailure.delegationId]),
    });
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector,
      terminator,
      terminationGrace: 25,
    }).recover();
    assert.equal(result.confirmedKilled, 0);
    assert.equal(result.staleCleared, 0);
    assert.equal(result.ambiguousFailClosed, 4);
    assert.equal(result.spawnAvailable, false);
    assert.deepEqual(runtime.remaining(), entries, 'every failure preserves its journal record');
    assert.deepEqual(runtime.recorded, [], 'failed cleanup emits no restart-loss disposition');
  }

  {
    const state = tempRoot('recovery-corrupt');
    try {
      fs.mkdirSync(state.root, { recursive: true, mode: 0o700 });
      fs.chmodSync(state.root, 0o700);
      const runtime = createAgentRuntimeFiles({ rootPath: state.root, platform: 'linux' });
      fs.writeFileSync(runtime.journalPath, '{"version":1,"entries":[', { mode: 0o600 });
      fs.chmodSync(runtime.journalPath, 0o600);
      let inspectCalls = 0;
      let stopCalls = 0;
      let advertised = false;
      const result = await createAgentStartupRecovery({
        runtimeFiles: runtime,
        inspector: {
          async inspect() {
            inspectCalls += 1;
            return staleInspection;
          },
        },
        terminator: {
          async stop() { stopCalls += 1; },
        },
        terminationGrace: 25,
      }).recoverBeforeAdvertise(() => { advertised = true; });
      assert.deepEqual(result, {
        confirmedKilled: 0,
        staleCleared: 0,
        ambiguousFailClosed: 1,
        spawnAvailable: false,
        profiles: [],
        restartLosses: [],
      });
      assert.equal(inspectCalls, 0, 'corrupt journal supplies no inspection anchor');
      assert.equal(stopCalls, 0);
      assert.equal(advertised, false);
      assert.equal(fs.existsSync(runtime.journalPath), true, 'corrupt journal remains for diagnosis');
    } finally {
      state.cleanup();
    }
  }

  {
    const prepared = journalEntry(processTreeModule, 'prepared', {
      delegationId: 'delegation_fixture_0031',
      envFingerprint: 'env_fingerprint_fixture_0031',
    });
    const unrelatedOnly = linuxRecords(prepared).filter((record) => record.pid === 42001);
    const concreteInspector = createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(unrelatedOnly),
    });
    const runtime = recoveryRuntime([prepared]);
    const terminator = recoveryTerminator();
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector: concreteInspector,
      terminator,
      terminationGrace: 25,
    }).recover();
    assert.equal(result.staleCleared, 1);
    assert.equal(result.spawnAvailable, true);
    assert.equal(terminator.calls.length, 0, 'unrelated running CLI receives no termination call');
  }

  {
    const reused = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_fixture_0032',
      envFingerprint: 'env_fingerprint_fixture_0032',
      processStartIdentity: 'old_process_start',
    });
    const concreteInspector = createProcessInspector({
      platform: 'linux',
      fs: linuxFixture(linuxRecords(reused)),
    });
    const runtime = recoveryRuntime([reused]);
    const terminator = recoveryTerminator();
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector: concreteInspector,
      terminator,
      terminationGrace: 25,
    }).recover();
    assert.equal(result.ambiguousFailClosed, 1);
    assert.equal(result.spawnAvailable, false);
    assert.equal(terminator.calls.length, 0, 'PID-reused candidate receives no termination call');
    assert.deepEqual(runtime.remaining(), [reused]);
  }

  {
    const entry = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_fixture_0041',
      envFingerprint: 'env_fingerprint_fixture_0041',
    });
    for (const inspector of [
      createProcessInspector({ platform: 'aix' }),
      createProcessInspector({
        platform: 'win32',
        systemRoot: 'C:\\Windows',
        fs: { lstat: () => { throw new Error('missing'); } },
      }),
      createProcessInspector({
        platform: 'darwin',
        exec: async () => ({ stdout: 'partial native evidence\n', stderr: '' }),
      }),
    ]) {
      const runtime = recoveryRuntime([entry]);
      const terminator = recoveryTerminator();
      const result = await createAgentStartupRecovery({
        runtimeFiles: runtime,
        inspector,
        terminator,
        terminationGrace: 25,
      }).recover();
      assert.equal(result.ambiguousFailClosed, 1);
      assert.equal(result.spawnAvailable, false);
      assert.equal(terminator.calls.length, 0);
      assert.deepEqual(runtime.remaining(), [entry]);
    }
  }

  {
    const entry = journalEntry(processTreeModule, 'active', {
      delegationId: 'delegation_fixture_0051',
      envFingerprint: 'env_fingerprint_fixture_0051',
    });
    const runtime = recoveryRuntime([entry]);
    const result = await createAgentStartupRecovery({
      runtimeFiles: runtime,
      inspector: plannedRecoveryInspector(new Map([
        [entry.delegationId, [ambiguousIdentity]],
      ])),
      terminator: recoveryTerminator(),
      terminationGrace: 25,
    }).recover();
    const diagnostic = JSON.stringify(result);
    for (const forbidden of [
      entry.delegationId,
      entry.binaryRealPath,
      entry.argvSignature,
      entry.envFingerprint,
      'TASK_CANARY_DO_NOT_DIAGNOSE',
      'raw command line',
      'raw environment',
      'provider output',
    ]) {
      assert.equal(diagnostic.includes(forbidden), false, `${forbidden} is absent from recovery diagnostics`);
    }
    assert(diagnostic.includes(entry.adapterId));
    assert(diagnostic.includes(entry.profileVersion));
  }
}

async function main() {
  const runtimeModule = await import(pathToFileURL(runtimeBuildPath).href);
  const processTreeModule = await import(pathToFileURL(processTreeBuildPath).href);
  await runRuntimeFilesTests(runtimeModule);
  await runConcreteInspectorTests(processTreeModule);
  await runTerminationTests(processTreeModule);
  await runRecoveryTests(runtimeModule, processTreeModule);
  console.log('mcp-agent-orphan-recovery.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-agent-orphan-recovery.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
