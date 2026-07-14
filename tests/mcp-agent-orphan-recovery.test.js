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
    AGENT_ORPHAN_JOURNAL_LIMIT_BYTES,
    AGENT_RUNTIME_DIRECTORY_MODE,
    AGENT_RUNTIME_FILE_MODE,
    createAgentRuntimeFiles,
  } = runtimeModule;

  assert.equal(AGENT_RUNTIME_DIRECTORY_MODE, 0o700);
  assert.equal(AGENT_RUNTIME_FILE_MODE, 0o600);
  assert.equal(AGENT_ORPHAN_JOURNAL_LIMIT_BYTES, 256 * 1024);

  const state = tempRoot('runtime-state');
  try {
    const runtime = createAgentRuntimeFiles({ rootPath: state.root, platform: 'linux' });
    const empty = runtime.readJournal();
    assert.equal(empty.status, 'ok');
    assert.deepEqual(empty.journal, { version: 1, entries: [] });

    const prepared = await runtime.prepareRun(preparedInput());
    assert.deepEqual(Object.keys(prepared.entry).sort(), [
      'adapterId',
      'argvSignature',
      'binaryRealPath',
      'createdAt',
      'delegationId',
      'envFingerprint',
      'profileVersion',
      'state',
    ]);
    assert.equal(prepared.entry.state, 'prepared');
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
      version: 1,
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
      'pid',
      'processGroupId',
      'processStartIdentity',
      'profileVersion',
      'startedAt',
      'state',
    ]);
    assert.deepEqual(readJson(runtime.journalPath), { version: 1, entries: [active] });

    await runtime.removeRun(active.delegationId);
    assert.deepEqual(readJson(runtime.journalPath), { version: 1, entries: [] });
    assert.equal(fs.existsSync(prepared.runDirectory), false);
  } finally {
    state.cleanup();
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
    ['wrong-version', JSON.stringify({ version: 2, entries: [] })],
    ['unknown-top-key', JSON.stringify({ version: 1, entries: [], extra: true })],
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

async function main() {
  const runtimeModule = await import(pathToFileURL(runtimeBuildPath).href);
  await runRuntimeFilesTests(runtimeModule);
  console.log('mcp-agent-orphan-recovery.test.js: PASS');
}

main().catch((error) => {
  console.error('mcp-agent-orphan-recovery.test.js: FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
