#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const runnerPath = path.join(repositoryRoot, 'scripts/run-phase65-full-tests.mjs');
const wrapperPath = path.join(repositoryRoot, 'scripts/run-mcp-build-preserving-workspace.mjs');
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

const EXPECTED_COMMAND_TOKENS = Object.freeze([
  "['node', 'tests/mcp-codex-adapter.test.js', '--section', 'generic-probe']",
  "['node', 'tests/mcp-codex-adapter.test.js', '--section', 'generic-authority']",
  "['node', 'tests/mcp-codex-adapter.test.js']",
  "['node', 'tests/mcp-agent-orphan-recovery.test.js']",
  "['node', 'tests/mcp-spawn-supervisor.test.js']",
  "['node', 'tests/runtime-contracts.test.js']",
  "['node', 'tests/mcp-agent-stream-fixture.test.js']",
  "['node', 'tests/mcp-agent-drift-smoke.test.js']",
  "['node', 'tests/mcp-agent-provider-contract.test.js']",
  "['node', 'tests/mcp-adapter-compatibility.test.js']",
  "['node', 'tests/mcp-version-parity.test.js']",
  "['node', 'tests/mcp-diagnostics-status.test.js']",
  "['node', 'tests/mcp-client-inventory.test.js']",
  "['node', 'tests/mcp-bridge-topology.test.js']",
  "['node', 'tests/mcp-reverse-channel-contract.test.js']",
  "['node', 'tests/mcp-bridge-background-dispatch.test.js']",
  "['node', 'tests/mcp-agent-providers-storage.test.js']",
  "['node', 'tests/delegation-routing.test.js']",
  "['node', 'tests/delegation-consent.test.js']",
  "['node', 'tests/delegation-controller.test.js']",
  "['node', 'tests/delegation-event-store.test.js']",
  "['node', 'tests/providers-panel-logic.test.js']",
  "['node', 'tests/providers-panel-ui.test.js']",
  "['node', 'tests/delegation-sidepanel-ui.test.js']",
  "['node', 'tests/provider-parity.test.js']",
  "['node', 'tests/agent-protocol-drift-diagnostics.test.js']",
  "['node', 'tests/agent-provider-forbidden-flags.test.js']",
  "['node', 'tests/delegation-phase-contract.test.js', '--section', 'phase65-validation']",
  "['node', 'tests/delegation-phase-contract.test.js', '--section', 'phase65-uat-ledger']",
  "['node', 'scripts/verify-agent-provider-flags.mjs']",
  "['npm', 'run', 'validate:extension']",
  "['npm', 'test']",
]);

function hashFields(fields) {
  const hash = createHash('sha256');
  for (const field of fields) {
    const bytes = Buffer.isBuffer(field) ? field : Buffer.from(String(field));
    hash.update(String(bytes.length));
    hash.update(':');
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || repositoryRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: false,
  });
}

function git(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    maxBuffer: MAX_OUTPUT_BYTES,
    shell: false,
  });
  assert.equal(result.status, 0, Buffer.from(result.stderr || '').toString('utf8'));
  return Buffer.from(result.stdout || '');
}

function snapshotPath(target, root = target) {
  const stat = lstatSync(target);
  const relativePath = path.relative(root, target) || '.';
  if (stat.isSymbolicLink()) {
    return hashFields([relativePath, 'symlink', readlinkSync(target)]);
  }
  if (stat.isFile()) {
    return hashFields([relativePath, 'file', stat.mode & 0o7777, readFileSync(target)]);
  }
  assert.equal(stat.isDirectory(), true, `unsupported fixture entry: ${target}`);
  return hashFields([
    relativePath,
    'directory',
    stat.mode & 0o7777,
    ...readdirSync(target).sort().map((name) => snapshotPath(path.join(target, name), root)),
  ]);
}

function snapshotKnownEntry(root, relativePath) {
  const target = path.join(root, relativePath);
  return existsSync(target) ? snapshotPath(target, root) : 'missing';
}

function snapshotFixture(root) {
  const status = git(root, ['status', '--short', '-z', '--untracked-files=all']);
  const stagedEntries = git(root, ['ls-files', '--stage', '-z']);
  const stagedPatch = git(root, ['diff', '--cached', '--binary', '--no-ext-diff', '--no-textconv']);
  const unstagedPatch = git(root, ['diff', '--binary', '--no-ext-diff', '--no-textconv']);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  const indexPath = path.join(root, '.git/index');
  const indexStat = lstatSync(indexPath);
  return Object.freeze({
    status,
    stagedEntries,
    stagedPatch,
    unstagedPatch,
    untracked,
    index: hashFields([indexStat.mode & 0o7777, readFileSync(indexPath)]),
    build: snapshotKnownEntry(root, 'mcp/build'),
    protected: snapshotKnownEntry(root, 'protected.txt'),
    staged: snapshotKnownEntry(root, 'staged.txt'),
    untrackedEntry: snapshotKnownEntry(root, 'untracked.txt'),
  });
}

function writeExecutable(target, source) {
  writeFileSync(target, source, { mode: 0o755 });
  chmodSync(target, 0o755);
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fsb-phase65-runner-'));
  mkdirSync(path.join(root, 'mcp/build/sub'), { recursive: true });
  writeFileSync(path.join(root, 'protected.txt'), 'tracked-clean\n');
  writeFileSync(path.join(root, 'staged.txt'), 'staged-clean\n');
  writeFileSync(path.join(root, 'mcp/build/index.js'), 'tracked-build\n');
  writeFileSync(path.join(root, 'mcp/build/sub/committed.js'), 'committed-build\n');

  git(root, ['init']);
  git(root, ['config', 'user.email', 'phase65-fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Phase 65 fixture']);
  git(root, ['add', 'protected.txt', 'staged.txt', 'mcp/build/index.js', 'mcp/build/sub/committed.js']);
  git(root, ['commit', '-m', 'fixture baseline']);

  writeFileSync(path.join(root, 'staged.txt'), 'staged-user-bytes\n');
  chmodSync(path.join(root, 'staged.txt'), 0o640);
  git(root, ['add', 'staged.txt']);
  writeFileSync(path.join(root, 'protected.txt'), 'unstaged-user-bytes\n');
  chmodSync(path.join(root, 'protected.txt'), 0o600);
  writeFileSync(path.join(root, 'untracked.txt'), 'untracked-user-bytes\n');
  chmodSync(path.join(root, 'untracked.txt'), 0o640);
  writeFileSync(path.join(root, 'mcp/build/index.js'), 'dirty-build-index\n');
  chmodSync(path.join(root, 'mcp/build/index.js'), 0o640);
  rmSync(path.join(root, 'mcp/build/sub/committed.js'));
  writeFileSync(path.join(root, 'mcp/build/sub/generated.js'), 'dirty-generated\n');
  symlinkSync('../index.js', path.join(root, 'mcp/build/sub/index-link'));

  const bin = path.join(root, 'fixture-bin');
  mkdirSync(bin);
  const npmCli = path.join(bin, 'npm-cli.js');
  writeExecutable(npmCli, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT;
const build = path.join(root, 'mcp/build');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(path.join(build, 'fresh/deep'), { recursive: true });
fs.writeFileSync(path.join(build, 'index.js'), 'fresh-build\\n');
fs.writeFileSync(path.join(build, 'fresh/deep/generated.js'), 'fresh-generated\\n');
fs.symlinkSync('../index.js', path.join(build, 'fresh/generated-link'));
`);

  return Object.freeze({
    root,
    bin,
    npmCli,
    before: snapshotFixture(root),
  });
}

function fixtureEnvironment(fixture, commands, extra = {}) {
  return {
    ...process.env,
    ...extra,
    FSB_PHASE65_TEST_REPOSITORY_ROOT: fixture.root,
    FSB_PHASE65_TEST_COMMANDS_JSON: JSON.stringify(commands),
    FSB_PHASE65_TEST_SKIP_STATIC_CONTRACTS: '1',
    FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT: fixture.root,
    FSB_MCP_BUILD_PRESERVING_NPM_CLI: fixture.npmCli,
    PATH: `${fixture.bin}${path.delimiter}${process.env.PATH || ''}`,
  };
}

function assertFixtureIdentity(fixture) {
  const indexPath = path.join(fixture.root, '.git/index');
  const indexStat = lstatSync(indexPath);
  const immediateIndex = hashFields([indexStat.mode & 0o7777, readFileSync(indexPath)]);
  assert.equal(immediateIndex, fixture.before.index, 'raw Git index bytes/mode changed');
  const after = snapshotFixture(fixture.root);
  assert.deepEqual({ ...after, index: fixture.before.index }, fixture.before);
}

function runFixture(label, commands, options = {}) {
  const fixture = createFixture();
  try {
    const result = run(process.execPath, [runnerPath], {
      env: fixtureEnvironment(fixture, commands, options.env),
    });
    if (options.success) {
      assert.equal(result.status, 0, `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    } else {
      assert.notEqual(result.status, 0, `${label} unexpectedly succeeded`);
    }
    if (options.stderr) assert.match(result.stderr, options.stderr);
    assertFixtureIdentity(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

async function runSignalFixture(signal) {
  const fixture = createFixture();
  const readyPath = path.join(fixture.root, 'mcp/build/phase65-signal-ready');
  try {
    const holdCommand = [
      process.execPath,
      '-e',
      `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(readyPath)},'ready');process.on(${JSON.stringify(signal)},()=>process.exit(0));setInterval(()=>{},1000)`,
    ];
    const child = spawn(process.execPath, [runnerPath], {
      cwd: repositoryRoot,
      env: fixtureEnvironment(fixture, [holdCommand]),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    const deadline = Date.now() + 10_000;
    while (!existsSync(readyPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(existsSync(readyPath), true, `${signal} fixture never became ready`);
    child.kill(signal);
    const settled = await new Promise((resolve) => {
      child.once('exit', (status, exitSignal) => resolve({ status, exitSignal }));
    });
    assert.equal(settled.exitSignal, null, `${signal} runner did not retain cleanup authority`);
    assert.notEqual(settled.status, 0, `${signal} runner unexpectedly succeeded\n${stdout}\n${stderr}`);
    assert.match(stderr, new RegExp(`runner received ${signal}`));
    assertFixtureIdentity(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function assertRunnerSourceContract() {
  assert.equal(existsSync(runnerPath), true, 'Phase 65 focused runner is missing');
  const source = readFileSync(runnerPath, 'utf8');
  assert.match(source, /run-mcp-build-preserving-workspace\.mjs/);
  assert.equal((source.match(/'--commands-json'/g) || []).length, 1,
    'focused runner passes one commands-json payload to the preserving wrapper');
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /npm --prefix mcp run build/);
  assert.doesNotMatch(source, /git\s+(?:add|checkout|restore|reset|stash|clean)\b/);
  assert.match(source, /injected Phase 65 commands require an injected repository root/);
  assert.match(source, /test wrapper override requires an injected repository root/);
  assert.match(source, /root Phase 65 chain recursively invokes the guarded runner/);

  const commandBlock = (source.match(
    /const PHASE65_COMMANDS = Object\.freeze\(\[([\s\S]*?)\n\]\);/,
  ) || [null, ''])[1];
  assert.equal((commandBlock.match(/Object\.freeze\(\[/g) || []).length,
    EXPECTED_COMMAND_TOKENS.length, 'Phase 65 matrix command count is exact');
  let previousIndex = -1;
  for (const token of EXPECTED_COMMAND_TOKENS) {
    assert.equal(commandBlock.split(token).length - 1, 1,
      `runner command is not exact: ${token}`);
    const index = commandBlock.indexOf(token);
    assert(index > previousIndex, `runner command is out of order: ${token}`);
    previousIndex = index;
  }
}

async function main() {
  assert.equal(existsSync(wrapperPath), true, 'existing build-preserving wrapper is missing');
  assertRunnerSourceContract();
  runFixture('success settlement', [[process.execPath, '-e', 'process.exit(0)']], {
    success: true,
  });
  runFixture('temporary dirty rewrite settlement', [[
    process.execPath,
    '-e',
    "require('node:fs').writeFileSync('protected.txt','child-mutated\\n')",
  ]], {
    success: true,
  });
  runFixture('nonzero settlement', [[process.execPath, '-e', 'process.exit(29)']], {
    stderr: /guarded Phase 65 matrix exited 29/,
  });
  runFixture('command spawn-error settlement', [['fsb-phase65-command-does-not-exist']], {
    stderr: /command 1 could not be spawned/,
  });
  runFixture('wrapper spawn-error settlement', [[process.execPath, '-e', 'process.exit(0)']], {
    env: { FSB_PHASE65_TEST_EXECUTABLE: path.join(os.tmpdir(), 'absent-phase65-executable') },
    stderr: /guarded Phase 65 matrix could not be spawned/,
  });
  runFixture('oversized injected command roster', Array.from(
    { length: 33 }, () => [process.execPath, '-e', 'process.exit(0)'],
  ), {
    stderr: /injected Phase 65 commands must be a bounded non-empty array/,
  });
  if (process.platform !== 'win32') {
    await runSignalFixture('SIGINT');
    await runSignalFixture('SIGTERM');
  }
  console.log('phase65-full-tests-harness: all assertions passed');
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
