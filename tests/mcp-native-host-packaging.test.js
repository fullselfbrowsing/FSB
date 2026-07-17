#!/usr/bin/env node

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

const bundledProductionDependencies = Object.freeze([
  '@modelcontextprotocol/sdk',
  'smol-toml',
  'strip-json-comments',
  'ws',
  'yaml',
  'zod',
]);

const exactProductionDependencies = Object.freeze({
  '@modelcontextprotocol/sdk': '1.29.0',
  'smol-toml': '1.6.1',
  'strip-json-comments': '5.0.3',
  ws: '8.19.0',
  yaml: '2.8.3',
  zod: '3.25.76',
});

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

function testRawIndexStabilityAcrossWrapperGitReads() {
  const fixture = createFixture();
  try {
    const indexPath = path.join(fixture.root, '.git/index');
    const indexBytesBefore = readFileSync(indexPath);
    const indexModeBefore = lstatSync(indexPath).mode & 0o7777;
    writeFileSync(path.join(fixture.root, 'protected.txt'), 'tracked-dirty\n');
    const result = runWrapper(fixture, [[process.execPath, '-e', 'process.exit(0)']]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(readFileSync(indexPath), indexBytesBefore);
    assert.equal(lstatSync(indexPath).mode & 0o7777, indexModeBefore);
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
  assert.ok(
    wrapperSource.lastIndexOf('restoreSingleEntry(indexPath, indexBefore)')
      > wrapperSource.lastIndexOf("captureWorkspaceState('final')"),
    'the wrapper must restore raw index bytes after its final Git reads',
  );

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
  testRawIndexStabilityAcrossWrapperGitReads();
  await testSignalSettlement('SIGINT');
  await testSignalSettlement('SIGTERM');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(pathname) {
  return JSON.parse(readFileSync(pathname, 'utf8'));
}

function dependencyNameFromLockPath(lockPath) {
  const match = lockPath.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/);
  assert.ok(match, `cannot derive package name from lock path: ${lockPath}`);
  return match[1];
}

function resolveLockedDependencyPath(lock, fromPackagePath, dependencyName) {
  let current = fromPackagePath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (lock.packages[candidate]) return candidate;
    if (!current) break;
    const parentNodeModules = current.lastIndexOf('/node_modules/');
    current = parentNodeModules === -1 ? '' : current.slice(0, parentNodeModules);
  }
  throw new Error(`lock does not resolve ${dependencyName} from ${fromPackagePath || '<root>'}`);
}

function deriveProductionClosure(lock) {
  const root = lock.packages[''];
  const queue = Object.keys(root.dependencies || {})
    .sort()
    .map((name) => resolveLockedDependencyPath(lock, '', name));
  const seen = new Set();

  while (queue.length > 0) {
    const lockPath = queue.shift();
    if (seen.has(lockPath)) continue;
    seen.add(lockPath);
    const entry = lock.packages[lockPath];
    assert.notEqual(entry.dev, true, `dev-only package entered production closure: ${lockPath}`);
    const dependencies = new Set([
      ...Object.keys(entry.dependencies || {}),
      ...Object.keys(entry.optionalDependencies || {}),
    ]);
    for (const name of [...dependencies].sort()) {
      queue.push(resolveLockedDependencyPath(lock, lockPath, name));
    }
  }

  return [...seen].sort().map((lockPath) => {
    const entry = lock.packages[lockPath];
    assert.match(entry.version, /^\d+\.\d+\.\d+(?:[-+].+)?$/);
    assert.match(entry.integrity, /^sha512-/);
    return Object.freeze({
      path: lockPath,
      name: dependencyNameFromLockPath(lockPath),
      version: entry.version,
      integrity: entry.integrity,
    });
  });
}

function findNpmCliPath() {
  const result = run('npm', ['root', '--global']);
  assert.equal(result.status, 0, result.stderr);
  const candidate = path.join(result.stdout.trim(), 'npm/bin/npm-cli.js');
  assert.equal(existsSync(candidate), true, `npm-cli.js is missing at ${candidate}`);
  return realpathSync(candidate);
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repositoryRoot,
      env: options.env || process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', (status, signal) => {
      resolve({
        status,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

async function listenOnLoopbackSentinel() {
  let connections = 0;
  const server = net.createServer((socket) => {
    connections += 1;
    socket.destroy();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  return Object.freeze({
    url: `http://127.0.0.1:${address.port}`,
    connectionCount: () => connections,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  });
}

async function testOfflineBundledTarball(productionClosure) {
  if (process.platform === 'win32') return;

  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'fsb-native-runtime-pack-'));
  const sourceCopy = path.join(fixtureRoot, 'invoking-source');
  const tarballDirectory = path.join(fixtureRoot, 'tarball');
  const packCache = path.join(fixtureRoot, 'pack-cache');
  const installCache = path.join(fixtureRoot, 'new-empty-install-cache');
  const installRoot = path.join(fixtureRoot, 'installed');
  const npmCliPath = findNpmCliPath();
  let sentinel;
  try {
    cpSync(path.join(repositoryRoot, 'mcp'), sourceCopy, { recursive: true });
    mkdirSync(tarballDirectory);
    mkdirSync(packCache);
    const packed = run(process.execPath, [
      npmCliPath,
      'pack',
      sourceCopy,
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      tarballDirectory,
      '--cache',
      packCache,
    ]);
    assert.equal(packed.status, 0, packed.stderr);
    const packReceipt = JSON.parse(packed.stdout);
    assert.equal(packReceipt.length, 1);
    assert.match(packReceipt[0].filename, /^fsb-mcp-server-\d+\.\d+\.\d+\.tgz$/);
    assert.match(packReceipt[0].integrity, /^sha512-/);
    const tarballPath = path.resolve(tarballDirectory, packReceipt[0].filename);
    assert.equal(existsSync(tarballPath), true);

    const listing = run('tar', ['-tzf', tarballPath]);
    assert.equal(listing.status, 0, listing.stderr);
    const tarEntries = new Set(listing.stdout.trim().split('\n'));
    for (const dependency of productionClosure) {
      assert.equal(
        tarEntries.has(`package/${dependency.path}/package.json`),
        true,
        `packed production dependency is missing: ${dependency.path}`,
      );
    }

    rmSync(sourceCopy, { recursive: true, force: true });
    rmSync(packCache, { recursive: true, force: true });
    mkdirSync(installRoot);
    mkdirSync(installCache);
    assert.equal(readdirSync(installCache).length, 0, 'offline install cache did not start empty');

    sentinel = await listenOnLoopbackSentinel();
    const poisonedEnvironment = {
      ...process.env,
      HTTP_PROXY: sentinel.url,
      HTTPS_PROXY: sentinel.url,
      ALL_PROXY: sentinel.url,
      NO_PROXY: '',
      http_proxy: sentinel.url,
      https_proxy: sentinel.url,
      all_proxy: sentinel.url,
      no_proxy: '',
    };
    const installed = await runAsync(process.execPath, [
      npmCliPath,
      'install',
      '--offline',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      installCache,
      '--registry',
      sentinel.url,
      tarballPath,
    ], { cwd: installRoot, env: poisonedEnvironment });
    assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);
    assert.equal(installed.signal, null);
    assert.equal(sentinel.connectionCount(), 0, 'offline install attempted a registry/proxy connection');
    assert.equal(existsSync(sourceCopy), false, 'offline install retained invoking source');
    assert.equal(existsSync(packCache), false, 'offline install retained the original cache');

    const installedManifest = readJson(
      path.join(installRoot, 'node_modules/fsb-mcp-server/package.json'),
    );
    assert.equal(installedManifest.name, 'fsb-mcp-server');
    assert.deepEqual(installedManifest.dependencies, exactProductionDependencies);
    assert.deepEqual(installedManifest.bundleDependencies, bundledProductionDependencies);
  } finally {
    if (sentinel) await sentinel.close();
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function testRuntimeLayoutAndPackageContract() {
  const packagePath = path.join(repositoryRoot, 'mcp/package.json');
  const lockPath = path.join(repositoryRoot, 'mcp/package-lock.json');
  const integrityPath = path.join(repositoryRoot, 'mcp/native-host/runtime-integrity.json');
  const launcherTemplatePath = path.join(
    repositoryRoot,
    'mcp/native-host/posix/fsb-native-host-launcher.mjs.in',
  );
  const runtimeLayoutSourcePath = path.join(repositoryRoot, 'mcp/src/native-host/runtime-layout.ts');
  const builtRuntimeLayoutPath = path.join(repositoryRoot, 'mcp/build/native-host/runtime-layout.js');

  for (const pathname of [
    integrityPath,
    launcherTemplatePath,
    runtimeLayoutSourcePath,
    path.join(repositoryRoot, 'mcp/src/native-host/constants.ts'),
    builtRuntimeLayoutPath,
  ]) {
    assert.equal(existsSync(pathname), true, `missing runtime contract artifact: ${pathname}`);
  }

  const packageManifest = readJson(packagePath);
  const lockBytes = readFileSync(lockPath);
  const lock = JSON.parse(lockBytes.toString('utf8'));
  assert.equal(packageManifest.engines.node, '>=18.20.0');
  assert.deepEqual(packageManifest.dependencies, exactProductionDependencies);
  assert.deepEqual(packageManifest.bundleDependencies, bundledProductionDependencies);
  assert.deepEqual(lock.packages[''].dependencies, exactProductionDependencies);
  assert.deepEqual(lock.packages[''].bundleDependencies, bundledProductionDependencies);
  assert.equal(lock.packages[''].engines.node, '>=18.20.0');

  const productionClosure = deriveProductionClosure(lock);
  const expectedIntegrityReceipt = {
    schema: 1,
    packageName: packageManifest.name,
    packageVersion: packageManifest.version,
    lockSha256: sha256(lockBytes),
    directDependencies: bundledProductionDependencies.map((name) => ({
      name,
      version: exactProductionDependencies[name],
    })),
    bundleDependencies: [...bundledProductionDependencies],
    productionPackages: productionClosure,
  };
  assert.deepEqual(readJson(integrityPath), expectedIntegrityReceipt);

  const launcherTemplate = readFileSync(launcherTemplatePath, 'utf8');
  assert.equal(
    launcherTemplate,
    '#!__FSB_ABSOLUTE_NODE__\nimport \'../runtime/package/build/native-host/index.js\';\n',
  );
  assert.doesNotMatch(launcherTemplate, /(?:\/bin\/sh|cmd\.exe|powershell|spawn|exec|shell)/i);

  const runtimeLayoutSource = readFileSync(runtimeLayoutSourcePath, 'utf8');
  assert.doesNotMatch(
    runtimeLayoutSource,
    /node:(?:fs|child_process|http|https|net|tls)|(?:spawn|exec|writeFile|mkdir|rename|registry)/,
  );
  const runtimeLayout = await import(`${pathToFileURL(builtRuntimeLayoutPath).href}?t=${Date.now()}`);
  const common = {
    packageVersion: packageManifest.version,
    extensionId: 'badgafnfchcihdfnjneklogedcdkmjfk',
    installToken: '0123456789abcdef0123456789abcdef',
    nodePath: '/opt/homebrew/bin/node',
    nodeRealPath: '/opt/homebrew/bin/node',
    npmCliPath: '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
    npmCliRealPath: '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js',
    invokingPackageRoot: '/private/tmp/npm-cache/_npx/token/node_modules/fsb-mcp-server',
  };
  const darwin = runtimeLayout.resolveNativeHostRuntimeLayout({
    ...common,
    platform: 'darwin',
    homeDirectory: '/Users/fsb',
  });
  assert.equal(darwin.stableRoot, '/Users/fsb/.fsb/native-host');
  assert.equal(darwin.launcherPath, '/Users/fsb/.fsb/native-host/bin/fsb-native-host-launcher.mjs');
  assert.equal(darwin.packageRoot, '/Users/fsb/.fsb/native-host/runtime/package');
  assert.equal(darwin.markerPath, '/Users/fsb/.fsb/native-host/owner.json');
  assert.equal(darwin.launcherMode, 0o700);
  assert.equal(darwin.markerMode, 0o600);
  assert.deepEqual(runtimeLayout.validateNativeHostRuntimeLayout(darwin), { ok: true });

  const linux = runtimeLayout.resolveNativeHostRuntimeLayout({
    ...common,
    platform: 'linux',
    homeDirectory: '/home/fsb',
    nodePath: '/usr/bin/node',
    nodeRealPath: '/usr/bin/node',
    npmCliPath: '/usr/lib/node_modules/npm/bin/npm-cli.js',
    npmCliRealPath: '/usr/lib/node_modules/npm/bin/npm-cli.js',
  });
  assert.equal(linux.stableRoot, '/home/fsb/.fsb/native-host');
  assert.equal(linux.launcherRelativePath, 'bin/fsb-native-host-launcher.mjs');

  const win32 = runtimeLayout.resolveNativeHostRuntimeLayout({
    ...common,
    platform: 'win32',
    homeDirectory: 'C:\\Users\\fsb',
    localAppData: 'C:\\Users\\fsb\\AppData\\Local',
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    nodeRealPath: 'C:\\Program Files\\nodejs\\node.exe',
    npmCliPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    npmCliRealPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    invokingPackageRoot: 'C:\\Temp\\npm-cache\\_npx\\token\\node_modules\\fsb-mcp-server',
  });
  assert.equal(win32.stableRoot, 'C:\\Users\\fsb\\AppData\\Local\\FSB\\NativeMessagingHost');
  assert.equal(win32.launcherRelativePath, 'bin\\fsb-native-host.exe');
  assert.equal(win32.bootstrapConfigRelativePath, 'bin\\fsb-native-host-bootstrap.bin');

  const marker = runtimeLayout.createNativeHostOwnerMarker(
    darwin,
    'a'.repeat(64),
  );
  assert.deepEqual(Object.keys(marker), [
    'schema',
    'owner',
    'host',
    'origin',
    'platform',
    'packageVersion',
    'launcherRelativePath',
    'artifactSha256',
    'installToken',
  ]);
  assert.equal(marker.schema, 1);
  assert.equal(marker.owner, 'io.github.fullselfbrowsing.fsb');
  assert.equal(marker.host, 'io.github.fullselfbrowsing.fsb_native_host');

  assert.equal(
    runtimeLayout.renderPosixNativeHostLauncher('/usr/bin/node', '/usr/bin/node'),
    "#!/usr/bin/node\nimport '../runtime/package/build/native-host/index.js';\n",
  );
  for (const [nodePath, realNodePath] of [
    ['relative/node', 'relative/node'],
    ['/path with spaces/node', '/path with spaces/node'],
    ['/usr/bin/node\nmalicious', '/usr/bin/node\nmalicious'],
    ['/usr/bin/node', '/different/node'],
  ]) {
    assert.throws(
      () => runtimeLayout.renderPosixNativeHostLauncher(nodePath, realNodePath),
      /FSBNH_LAYOUT_UNSAFE_NODE/,
    );
  }

  const completeEvidence = {
    npmCli: true,
    runtimeIntegrity: true,
    bundleComplete: true,
    launcherArtifact: true,
  };
  assert.deepEqual(
    runtimeLayout.validateNativeHostRuntimeLayout(darwin, completeEvidence),
    { ok: true },
  );
  for (const field of Object.keys(completeEvidence)) {
    assert.deepEqual(
      runtimeLayout.validateNativeHostRuntimeLayout(darwin, {
        ...completeEvidence,
        [field]: false,
      }),
      { ok: false, reason: `missing-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}` },
    );
  }
  assert.throws(
    () => runtimeLayout.resolveNativeHostRuntimeLayout({ ...common, platform: 'darwin', homeDirectory: '/private/tmp/npm-cache/_npx/token' }),
    /FSBNH_LAYOUT_TRANSIENT_ROOT/,
  );
  assert.throws(
    () => runtimeLayout.resolveNativeHostRuntimeLayout({ ...common, platform: 'darwin', homeDirectory: '/Users/fsb', extensionId: 'invalid' }),
    /FSBNH_LAYOUT_EXTENSION_ID/,
  );

  await testOfflineBundledTarball(productionClosure);
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

function encodeBootstrapConfig(nodePath, entryPath, origin) {
  const fields = [nodePath, entryPath, origin].map((value) => Buffer.from(value, 'utf8'));
  const header = Buffer.alloc(24);
  header.write('FSBNH01\0', 0, 'ascii');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(fields[0].length, 12);
  header.writeUInt32LE(fields[1].length, 16);
  header.writeUInt32LE(fields[2].length, 20);
  return Buffer.concat([header, ...fields]);
}

function assertBoundedBootstrapFailure(result, expectedIdentifier) {
  assert.notEqual(result.status, 0, 'invalid bootstrap invocation unexpectedly succeeded');
  assert.equal(result.signal, null);
  assert.equal(result.stdout.length, 0, 'bootstrap failure wrote protocol-corrupting stdout');
  const stderr = result.stderr.toString('utf8');
  assert.equal(stderr, `${expectedIdentifier}\n`);
  assert.ok(stderr.length < 64, 'bootstrap error identifier is not bounded');
  assert.doesNotMatch(stderr, /[A-Z]:\\|Users|AppData|Program Files|node\.exe/i);
}

function testWindowsExecutableHarness() {
  if (process.platform !== 'win32') return;
  const buildScriptPath = path.join(repositoryRoot, 'scripts/build-native-host-windows.mjs');
  const x64Directory = path.join(repositoryRoot, 'mcp/native-host/bin/win32-x64');
  const x64Executable = path.join(x64Directory, 'fsb-native-host.exe');
  const arm64Executable = path.join(
    repositoryRoot,
    'mcp/native-host/bin/win32-arm64/fsb-native-host.exe',
  );
  assert.equal(existsSync(x64Executable), true, 'x64 bootstrap artifact is missing');
  assert.equal(existsSync(arm64Executable), true, 'arm64 bootstrap artifact is missing');

  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'fsb native bootstrap '));
  const metadataPath = path.join(fixtureRoot, 'metadata.json');
  const configPath = path.join(x64Directory, 'fsb-native-host-bootstrap.bin');
  const origin = 'chrome-extension://badgafnfchcihdfnjneklogedcdkmjfk/';
  const parentWindow = '--parent-window=123456';
  const childPath = path.join(fixtureRoot, 'fixture child.js');
  const payload = Buffer.from([8, 0, 0, 0, 0x7b, 0x22, 0x76, 0x22, 0x3a, 0x31, 0x7d, 0x0a]);
  try {
    const verify = run(process.execPath, [
      buildScriptPath,
      '--arch',
      'all',
      '--verify-only',
      '--metadata-out',
      metadataPath,
    ]);
    assert.equal(verify.status, 0, verify.stderr);
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.schema, 1);
    assert.equal(metadata.package, 'fsb-mcp-server');
    assert.equal(metadata.version, require('../mcp/package.json').version);
    assert.deepEqual(metadata.artifacts.map((artifact) => artifact.architecture), ['x64', 'arm64']);
    for (const artifact of metadata.artifacts) {
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
      assert.ok(artifact.bytes > 0);
    }

    writeFileSync(childPath, `
const expected = ${JSON.stringify([origin, parentWindow])};
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expected)) process.exit(91);
const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  process.stdout.write(Buffer.concat(chunks), () => process.exit(37));
});
`);
    writeFileSync(configPath, encodeBootstrapConfig(process.execPath, childPath, origin));
    const success = spawnSync(x64Executable, [origin, parentWindow], {
      input: payload,
      encoding: null,
      maxBuffer: 1024 * 1024,
      shell: false,
      windowsHide: true,
    });
    assert.equal(success.status, 37, success.stderr.toString('utf8'));
    assert.deepEqual(success.stdout, payload);
    assert.equal(success.stderr.length, 0);

    const wrongOrigin = spawnSync(
      x64Executable,
      ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/'],
      { encoding: null, shell: false, windowsHide: true },
    );
    assertBoundedBootstrapFailure(wrongOrigin, 'FSBNH_E_ORIGIN');

    const extraArgument = spawnSync(x64Executable, [origin, '--unexpected'], {
      encoding: null,
      shell: false,
      windowsHide: true,
    });
    assertBoundedBootstrapFailure(extraArgument, 'FSBNH_E_ARGS');

    for (const invalidConfig of [
      Buffer.from('invalid'),
      Buffer.alloc(65537),
      encodeBootstrapConfig('relative-node.exe', childPath, origin),
      encodeBootstrapConfig(process.execPath, childPath, 'chrome-extension://invalid/'),
      Buffer.concat([encodeBootstrapConfig(process.execPath, childPath, origin), Buffer.from([0])]),
    ]) {
      writeFileSync(configPath, invalidConfig);
      const failure = spawnSync(x64Executable, [origin], {
        encoding: null,
        shell: false,
        windowsHide: true,
      });
      assertBoundedBootstrapFailure(failure, 'FSBNH_E_CONFIG');
    }

    writeFileSync(configPath, encodeBootstrapConfig(childPath, childPath, origin));
    const createFailure = spawnSync(x64Executable, [origin], {
      encoding: null,
      shell: false,
      windowsHide: true,
    });
    assertBoundedBootstrapFailure(createFailure, 'FSBNH_E_CREATE_PROCESS');
  } finally {
    rmSync(configPath, { force: true });
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function runWindowsBootstrapSection() {
  await testWorkspacePreservingWrapper();
  testWindowsBootstrapSources();
  testWindowsExecutableHarness();
}

async function main() {
  const sections = requestedSection ? [requestedSection] : [...knownSections];
  for (const section of sections) {
    if (section === 'windows-bootstrap' || section === 'workspace-preserving-build') {
      await runWindowsBootstrapSection();
      continue;
    }
    if (section === 'runtime-layout') {
      await testRuntimeLayoutAndPackageContract();
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
