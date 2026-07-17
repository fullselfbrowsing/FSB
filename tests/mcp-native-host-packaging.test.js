#!/usr/bin/env node

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
const wrapperPath = path.join(repositoryRoot, 'scripts/run-mcp-build-preserving-workspace.mjs');
const requestedSection = (() => {
  const index = process.argv.indexOf('--section');
  if (index === -1) return null;
  if (index + 1 >= process.argv.length) throw new Error('--section requires a value');
  return process.argv[index + 1];
})();

const knownSections = new Set([
  'windows-bootstrap',
  'runtime-layout',
  'workflow-and-pack',
  'workspace-preserving-build',
  'import-boundary',
]);

if (requestedSection && !knownSections.has(requestedSection)) {
  throw new Error(`unknown section: ${requestedSection}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repositoryRoot,
    env: options.env || process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (options.expectStatus !== undefined) {
    assert.equal(
      result.status,
      options.expectStatus,
      `${command} ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  return result;
}

function git(root, args) {
  const result = run('git', args, { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

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

function snapshotPath(target, root = target) {
  const stat = lstatSync(target);
  const relativePath = path.relative(root, target) || '.';
  if (stat.isSymbolicLink()) return hashFields([relativePath, 'symlink', readlinkSync(target)]);
  if (stat.isFile()) {
    return hashFields([relativePath, 'file', stat.mode & 0o7777, readFileSync(target)]);
  }
  assert.equal(stat.isDirectory(), true, `unsupported fixture entry: ${target}`);
  const children = readdirSync(target).sort().map((name) => snapshotPath(path.join(target, name), root));
  return hashFields([relativePath, 'directory', stat.mode & 0o7777, ...children]);
}

function snapshotFixture(root) {
  const buildPath = path.join(root, 'mcp/build');
  const indexPath = path.join(root, '.git/index');
  const status = git(root, ['status', '--short', '-z', '--untracked-files=all']);
  const staged = git(root, ['ls-files', '--stage', '-z']);
  return Object.freeze({
    build: existsSync(buildPath) ? snapshotPath(buildPath) : 'missing',
    index: hashFields([
      lstatSync(indexPath).mode & 0o7777,
      readFileSync(indexPath),
    ]),
    protected: hashFields([
      lstatSync(path.join(root, 'protected.txt')).mode & 0o7777,
      readFileSync(path.join(root, 'protected.txt')),
    ]),
    untracked: hashFields([
      lstatSync(path.join(root, 'untracked.txt')).mode & 0o7777,
      readFileSync(path.join(root, 'untracked.txt')),
    ]),
    status,
    staged,
  });
}

function assertFixtureIdentity(root, before) {
  assert.deepEqual(snapshotFixture(root), before);
}

function writeExecutable(pathname, source) {
  writeFileSync(pathname, source, { mode: 0o755 });
  chmodSync(pathname, 0o755);
}

function createFixture({ buildInitiallyAbsent = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'fsb-mcp-preserver-'));
  mkdirSync(path.join(root, 'mcp'), { recursive: true });
  writeFileSync(path.join(root, 'protected.txt'), 'tracked-clean\n');
  if (!buildInitiallyAbsent) {
    mkdirSync(path.join(root, 'mcp/build/sub'), { recursive: true });
    writeFileSync(path.join(root, 'mcp/build/index.js'), 'tracked-build\n');
    writeFileSync(path.join(root, 'mcp/build/sub/committed.txt'), 'committed\n');
  }
  git(root, ['init']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'FSB fixture']);
  git(root, ['add', 'protected.txt']);
  if (!buildInitiallyAbsent) git(root, ['add', 'mcp/build/index.js', 'mcp/build/sub/committed.txt']);
  git(root, ['commit', '-m', 'fixture baseline']);

  writeFileSync(path.join(root, 'protected.txt'), 'tracked-dirty\n');
  chmodSync(path.join(root, 'protected.txt'), 0o640);
  writeFileSync(path.join(root, 'untracked.txt'), 'untracked-owned\n');
  chmodSync(path.join(root, 'untracked.txt'), 0o600);
  if (!buildInitiallyAbsent) {
    writeFileSync(path.join(root, 'mcp/build/index.js'), 'protected-build-index\n');
    chmodSync(path.join(root, 'mcp/build/index.js'), 0o640);
    rmSync(path.join(root, 'mcp/build/sub/committed.txt'));
    writeFileSync(path.join(root, 'mcp/build/sub/dirty.txt'), 'dirty-build\n');
    symlinkSync('../index.js', path.join(root, 'mcp/build/sub/index-link'));
  }

  const bin = path.join(root, 'fixture-bin');
  mkdirSync(bin);
  writeExecutable(path.join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT;
const build = path.join(root, 'mcp/build');
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(path.join(build, 'fresh/deep'), { recursive: true });
fs.writeFileSync(path.join(build, 'index.js'), 'fresh-build\\n');
fs.writeFileSync(path.join(build, 'fresh/deep/generated.js'), 'generated\\n');
fs.symlinkSync('../index.js', path.join(build, 'fresh/generated-link'));
if (process.env.FSB_FIXTURE_BUILD_FAILURE === '1') process.exit(27);
`);

  return Object.freeze({ root, bin, before: snapshotFixture(root) });
}

function wrapperEnv(fixture, extra = {}) {
  return {
    ...process.env,
    ...extra,
    FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT: fixture.root,
    PATH: `${fixture.bin}${path.delimiter}${process.env.PATH || ''}`,
  };
}

function runWrapper(fixture, commands, extra = {}) {
  return run(process.execPath, [
    wrapperPath,
    '--commands-json',
    JSON.stringify(commands),
  ], {
    cwd: repositoryRoot,
    env: wrapperEnv(fixture, extra),
  });
}

function testWrapperSettlement(label, commands, options = {}) {
  const fixture = createFixture(options.fixtureOptions);
  try {
    const result = runWrapper(fixture, commands, options.env);
    assert.equal(
      options.expectedSuccess ? result.status : result.status !== 0,
      options.expectedSuccess ? 0 : true,
      `${label}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    if (options.stderrPattern) assert.match(result.stderr, options.stderrPattern);
    assertFixtureIdentity(fixture.root, fixture.before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

async function testSignalSettlement(signal) {
  const fixture = createFixture();
  const readyPath = path.join(fixture.root, 'mcp/build/signal-ready');
  try {
    const command = [
      process.execPath,
      '-e',
      `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(readyPath)},'ready');process.on(${JSON.stringify(signal)},()=>process.exit(0));setInterval(()=>{},1000)`,
    ];
    const child = spawn(process.execPath, [
      wrapperPath,
      '--commands-json',
      JSON.stringify([command]),
    ], {
      cwd: repositoryRoot,
      env: wrapperEnv(fixture),
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
    assert.equal(existsSync(readyPath), true, `${signal} fixture child never became ready`);
    child.kill(signal);
    const result = await new Promise((resolve) => {
      child.once('exit', (status, exitSignal) => resolve({ status, exitSignal }));
    });
    assert.equal(result.exitSignal, null, `${signal} wrapper was not allowed to clean up`);
    assert.notEqual(result.status, 0, `${signal} wrapper unexpectedly succeeded\n${stdout}\n${stderr}`);
    assert.match(stderr, new RegExp(`wrapper received ${signal}`));
    assertFixtureIdentity(fixture.root, fixture.before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

async function testWorkspacePreservingWrapper() {
  assert.equal(existsSync(wrapperPath), true, 'workspace-preserving build wrapper is missing');
  const wrapperSource = readFileSync(wrapperPath, 'utf8');
  assert.doesNotMatch(wrapperSource, /git\s+(?:add|checkout|restore|reset|stash|clean)\b/);
  assert.match(wrapperSource, /--commands-json/);
  assert.match(wrapperSource, /rev-parse', '--git-path', 'index/);

  testWrapperSettlement('success settlement', [[process.execPath, '-e', 'process.exit(0)']], {
    expectedSuccess: true,
  });
  testWrapperSettlement('initially absent build tree', [[process.execPath, '-e', 'process.exit(0)']], {
    expectedSuccess: true,
    fixtureOptions: { buildInitiallyAbsent: true },
  });
  testWrapperSettlement('build failure settlement', [[process.execPath, '-e', 'process.exit(0)']], {
    env: { FSB_FIXTURE_BUILD_FAILURE: '1' },
    stderrPattern: /MCP build exited 27/,
  });
  testWrapperSettlement('command failure settlement', [[process.execPath, '-e', 'process.exit(19)']], {
    stderrPattern: /command 1 exited 19/,
  });
  testWrapperSettlement('spawn exception settlement', [['fsb-command-that-does-not-exist']], {
    stderrPattern: /command 1 could not be spawned/,
  });
  testWrapperSettlement('index mutation settlement', [[
    process.execPath,
    '-e',
    "require('node:fs').appendFileSync('.git/index',Buffer.from([0]))",
  ]], {
    stderrPattern: /Git index bytes or mode changed/,
  });
  testWrapperSettlement('unrelated dirty mutation settlement', [[
    process.execPath,
    '-e',
    "require('node:fs').writeFileSync('protected.txt','child-mutated\\n')",
  ]], {
    stderrPattern: /pre-existing unrelated dirty or untracked bytes changed/,
  });
  await testSignalSettlement('SIGINT');
  await testSignalSettlement('SIGTERM');
}

function testWindowsBootstrapSources() {
  const cPath = path.join(repositoryRoot, 'mcp/native-host/windows/fsb-native-host-bootstrap.c');
  const resourcePath = path.join(
    repositoryRoot,
    'mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in',
  );
  const buildScriptPath = path.join(repositoryRoot, 'scripts/build-native-host-windows.mjs');
  for (const pathname of [cPath, resourcePath, buildScriptPath]) {
    assert.equal(existsSync(pathname), true, `missing Windows bootstrap artifact: ${pathname}`);
  }
  const cSource = readFileSync(cPath, 'utf8');
  const resourceSource = readFileSync(resourcePath, 'utf8');
  const buildSource = readFileSync(buildScriptPath, 'utf8');
  assert.match(cSource, /CreateProcessW/);
  assert.match(cSource, /STARTF_USESTDHANDLES/);
  assert.match(cSource, /FSBNH01/);
  assert.match(cSource, /65536/);
  assert.match(cSource, /chrome-extension:\/\//);
  assert.doesNotMatch(cSource, /\b(?:system|_popen|ShellExecuteW?)\s*\(/);
  assert.doesNotMatch(cSource, /cmd\.exe|powershell|\.bat\b|\.cmd\b|com\.fsb\.mcp|native-host-shim/i);
  assert.match(resourceSource, /FSB_MCP_VERSION/);
  assert.match(buildSource, /\bcl\.exe\b/);
  assert.match(buildSource, /\brc\.exe\b/);
  assert.match(buildSource, /win32-x64/);
  assert.match(buildSource, /win32-arm64/);
  assert.match(buildSource, /shell:\s*false/);
  assert.doesNotMatch(buildSource, /exec(?:Sync)?\s*\(|shell:\s*true|\.bat\b|\.cmd\b|single-executable|sea-config/i);
}

async function runWindowsBootstrapSection() {
  await testWorkspacePreservingWrapper();
  testWindowsBootstrapSources();
}

async function main() {
  const sections = requestedSection ? [requestedSection] : [...knownSections];
  for (const section of sections) {
    if (section === 'windows-bootstrap' || section === 'workspace-preserving-build') {
      await runWindowsBootstrapSection();
      continue;
    }
    throw new Error(`section ${section} has not been implemented yet`);
  }
  console.log(`[mcp-native-host-packaging] PASS: ${sections.join(', ')}`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
