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
  const fixtureNpmCliPath = path.join(bin, 'npm-cli.js');
  writeExecutable(fixtureNpmCliPath, `#!/usr/bin/env node
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

  return Object.freeze({ root, bin, fixtureNpmCliPath, before: snapshotFixture(root) });
}

function wrapperEnv(fixture, extra = {}) {
  return {
    ...process.env,
    ...extra,
    FSB_MCP_BUILD_PRESERVING_REPOSITORY_ROOT: fixture.root,
    FSB_MCP_BUILD_PRESERVING_NPM_CLI: fixture.fixtureNpmCliPath,
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
  assert.match(wrapperSource, /process\.execPath, npmCliPath/);
  assert.doesNotMatch(wrapperSource, /npm\.cmd/);
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
  if (process.platform !== 'win32') {
    await testSignalSettlement('SIGINT');
    await testSignalSettlement('SIGTERM');
  }
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
      '.',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      tarballDirectory,
      '--cache',
      packCache,
    ], { cwd: sourceCopy });
    assert.equal(packed.status, 0, packed.stderr);
    const packReceipt = JSON.parse(packed.stdout);
    assert.equal(packReceipt.length, 1);
    assert.match(packReceipt[0].filename, /^fsb-mcp-server-\d+\.\d+\.\d+\.tgz$/);
    assert.match(packReceipt[0].integrity, /^sha512-/);
    assert.deepEqual(
      [...packReceipt[0].bundled].sort(),
      [...new Set(productionClosure.map((dependency) => dependency.name))].sort(),
      'packed bundle contains missing, extra, or dev-only packages',
    );
    const tarballPath = path.resolve(tarballDirectory, packReceipt[0].filename);
    assert.equal(existsSync(tarballPath), true);

    const unpackedTarball = path.join(fixtureRoot, 'unpacked-tarball');
    mkdirSync(unpackedTarball);
    const extracted = run('tar', ['-xzf', tarballPath, '-C', unpackedTarball]);
    assert.equal(extracted.status, 0, extracted.stderr);
    for (const dependency of productionClosure) {
      const bundledManifestPath = path.join(
        unpackedTarball,
        'package',
        ...dependency.path.split('/'),
        'package.json',
      );
      assert.equal(existsSync(bundledManifestPath), true,
        `packed production dependency is missing: ${dependency.path}`);
      const bundledManifest = readJson(bundledManifestPath);
      assert.equal(bundledManifest.name, dependency.name, dependency.path);
      assert.equal(bundledManifest.version, dependency.version, dependency.path);
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
      CI: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_offline: 'true',
      npm_config_update_notifier: 'false',
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
  const builtConstantsPath = path.join(repositoryRoot, 'mcp/build/native-host/constants.js');

  for (const pathname of [
    integrityPath,
    launcherTemplatePath,
    runtimeLayoutSourcePath,
    path.join(repositoryRoot, 'mcp/src/native-host/constants.ts'),
    builtRuntimeLayoutPath,
    builtConstantsPath,
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
    /from\s+['"]node:(?:fs|child_process|http|https|net|tls)|from\s+['"][^'"]*(?:registry|install)|\b(?:spawn|exec|writeFile|mkdir|rename)\w*\s*\(/,
  );
  const runtimeLayout = await import(`${pathToFileURL(builtRuntimeLayoutPath).href}?t=${Date.now()}`);
  const constants = await import(`${pathToFileURL(builtConstantsPath).href}?t=${Date.now()}`);
  assert.equal(constants.NATIVE_HOST_NAME, 'io.github.fullselfbrowsing.fsb_native_host');
  assert.equal(constants.NATIVE_HOST_DEFAULT_EXTENSION_ID, 'badgafnfchcihdfnjneklogedcdkmjfk');
  assert.equal(constants.NATIVE_HOST_PROTOCOL_VERSION, 1);
  assert.equal(constants.NATIVE_HOST_MAX_FRAME_BYTES, 4096);
  assert.equal(constants.NATIVE_HOST_HEALTH_PRODUCT, 'fsb-mcp-server');
  assert.equal(constants.NATIVE_HOST_HEALTH_PROTOCOL, 'fsb-native-host-health-v1');
  assert.equal(constants.NATIVE_HOST_OWNER_MARKER_SCHEMA, 1);
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
  assert.equal(darwin.pack.executable, common.nodePath);
  assert.equal(darwin.pack.cwd, common.invokingPackageRoot);
  assert.deepEqual(darwin.pack.argv.slice(0, 3), [common.npmCliPath, 'pack', '.']);
  assert.equal(darwin.pack.shell, false);
  assert.equal(darwin.install.executable, common.nodePath);
  assert.equal(darwin.install.shell, false);
  for (const requiredArgument of [
    '--offline',
    '--ignore-scripts',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    '--cache',
    '--registry',
  ]) {
    assert.equal(darwin.install.argv.includes(requiredArgument), true, requiredArgument);
  }
  assert.equal(darwin.install.argv.at(-1), darwin.tarballPath);
  assert.equal(darwin.install.environment.npm_config_offline, 'true');

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
  assert.deepEqual(
    runtimeLayout.validateNativeHostRuntimeLayout({
      ...darwin,
      launcherPath: path.join(common.invokingPackageRoot, 'launcher'),
    }),
    { ok: false, reason: 'invalid-layout' },
  );

  await testOfflineBundledTarball(productionClosure);
}

function createSyntheticPe(machine, version, roleMarker) {
  const embedded = [version, roleMarker].map((value) => Buffer.from(`${value}\0`, 'utf16le'));
  const bytes = Buffer.alloc(0x100 + embedded.reduce((sum, value) => sum + value.length, 0), 0);
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80, 'ascii');
  bytes.writeUInt16LE(machine, 0x84);
  let offset = 0x100;
  for (const value of embedded) {
    value.copy(bytes, offset);
    offset += value.length;
  }
  return bytes;
}

function readPeMachine(bytes) {
  assert.ok(bytes.length >= 0x86, 'PE artifact is too short');
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  const peOffset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.toString('ascii', peOffset, peOffset + 4), 'PE\0\0');
  return bytes.readUInt16LE(peOffset + 4);
}

function writeSyntheticWindowsArtifacts(packageRoot) {
  const packageManifest = readJson(path.join(packageRoot, 'package.json'));
  const artifacts = [
    { architecture: 'x64', machine: 0x8664, role: 'bootstrap' },
    { architecture: 'x64', machine: 0x8664, role: 'registry-helper' },
    { architecture: 'arm64', machine: 0xaa64, role: 'bootstrap' },
    { architecture: 'arm64', machine: 0xaa64, role: 'registry-helper' },
  ].map(({ architecture, machine, role }) => {
    const filename = role === 'bootstrap'
      ? 'fsb-native-host.exe'
      : 'fsb-native-host-registry.exe';
    const roleMarker = role === 'bootstrap'
      ? 'fsb-native-host-bootstrap-v1'
      : 'fsb-native-host-registry-helper-v1';
    const relativePath = `native-host/bin/win32-${architecture}/${filename}`;
    const artifactPath = path.join(packageRoot, ...relativePath.split('/'));
    mkdirSync(path.dirname(artifactPath), { recursive: true });
    const bytes = createSyntheticPe(machine, packageManifest.version, roleMarker);
    writeFileSync(artifactPath, bytes);
    return {
      architecture,
      role,
      path: relativePath,
      bytes: bytes.length,
      peMachine: `0x${machine.toString(16)}`,
      sha256: sha256(bytes),
      packageVersion: packageManifest.version,
      roleMarker,
    };
  });
  writeFileSync(
    path.join(packageRoot, 'native-host/windows-artifacts.json'),
    `${JSON.stringify({
      schema: 2,
      package: packageManifest.name,
      version: packageManifest.version,
      artifacts,
    }, null, 2)}\n`,
  );
}

function verifyWindowsArtifactSet(packageRoot) {
  const packageManifest = readJson(path.join(packageRoot, 'package.json'));
  const metadata = readJson(path.join(packageRoot, 'native-host/windows-artifacts.json'));
  assert.deepEqual(
    { schema: metadata.schema, package: metadata.package, version: metadata.version },
    { schema: 2, package: packageManifest.name, version: packageManifest.version },
  );
  assert.deepEqual(
    metadata.artifacts.map((artifact) => `${artifact.architecture}/${artifact.role}`),
    ['x64/bootstrap', 'x64/registry-helper', 'arm64/bootstrap', 'arm64/registry-helper'],
  );
  const machineByArchitecture = { x64: 0x8664, arm64: 0xaa64 };
  for (const artifact of metadata.artifacts) {
    const filename = artifact.role === 'bootstrap'
      ? 'fsb-native-host.exe'
      : 'fsb-native-host-registry.exe';
    const expectedRoleMarker = artifact.role === 'bootstrap'
      ? 'fsb-native-host-bootstrap-v1'
      : 'fsb-native-host-registry-helper-v1';
    const expectedPath = `native-host/bin/win32-${artifact.architecture}/${filename}`;
    assert.equal(artifact.path, expectedPath);
    const artifactPath = path.join(packageRoot, ...artifact.path.split('/'));
    const bytes = readFileSync(artifactPath);
    assert.equal(readPeMachine(bytes), machineByArchitecture[artifact.architecture]);
    assert.notEqual(
      bytes.indexOf(Buffer.from(`${packageManifest.version}\0`, 'utf16le')),
      -1,
      `${artifact.architecture} artifact is not version-bound`,
    );
    assert.notEqual(
      bytes.indexOf(Buffer.from(`${expectedRoleMarker}\0`, 'utf16le')),
      -1,
      `${artifact.architecture}/${artifact.role} artifact is not role-bound`,
    );
    assert.equal(artifact.packageVersion, packageManifest.version);
    assert.equal(artifact.roleMarker, expectedRoleMarker);
    assert.equal(artifact.bytes, bytes.length);
    assert.equal(artifact.sha256, sha256(bytes));
  }
  return metadata;
}

function expectedRuntimeIntegrityReceipt(packageManifest, lockBytes, productionClosure) {
  return {
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
}

function recursivelyListFiles(root) {
  const files = [];
  function visit(directory, relativeDirectory) {
    for (const name of readdirSync(directory).sort()) {
      const pathname = path.join(directory, name);
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const stat = lstatSync(pathname);
      if (stat.isDirectory()) visit(pathname, relativePath);
      else files.push(relativePath);
    }
  }
  visit(root, '');
  return files;
}

function verifyExtractedRuntimePayload(packageRoot, lockBytes, productionClosure) {
  const packageManifest = readJson(path.join(packageRoot, 'package.json'));
  assert.equal(packageManifest.name, 'fsb-mcp-server');
  assert.deepEqual(packageManifest.dependencies, exactProductionDependencies);
  assert.deepEqual(packageManifest.bundleDependencies, bundledProductionDependencies);
  assert.deepEqual(
    readJson(path.join(packageRoot, 'native-host/runtime-integrity.json')),
    expectedRuntimeIntegrityReceipt(packageManifest, lockBytes, productionClosure),
  );
  for (const dependency of productionClosure) {
    const bundledManifest = readJson(path.join(
      packageRoot,
      ...dependency.path.split('/'),
      'package.json',
    ));
    assert.equal(bundledManifest.name, dependency.name, dependency.path);
    assert.equal(bundledManifest.version, dependency.version, dependency.path);
  }
  for (const requiredPath of [
    'native-host/windows/fsb-native-host-bootstrap.c',
    'native-host/windows/fsb-native-host-bootstrap-version.rc.in',
    'native-host/windows/fsb-native-host-registry.c',
    'native-host/windows/fsb-native-host-registry-version.rc.in',
    'native-host/posix/fsb-native-host-launcher.mjs.in',
    'native-host/runtime-integrity.json',
    'native-host/windows-artifacts.json',
    'native-host/bin/win32-x64/fsb-native-host.exe',
    'native-host/bin/win32-x64/fsb-native-host-registry.exe',
    'native-host/bin/win32-arm64/fsb-native-host.exe',
    'native-host/bin/win32-arm64/fsb-native-host-registry.exe',
  ]) {
    assert.equal(existsSync(path.join(packageRoot, ...requiredPath.split('/'))), true, requiredPath);
  }
  const packedFiles = recursivelyListFiles(packageRoot);
  assert.equal(
    packedFiles.some((relativePath) => /(?:^|\/)(?:[^/]+\.(?:bat|cmd)|native-host-shim|com\.fsb\.mcp|sea-config)(?:$|\/)/iu.test(relativePath)),
    false,
    'packed payload contains a forbidden launcher or historical shim',
  );
  verifyWindowsArtifactSet(packageRoot);
}

function poisonedOfflineEnvironment(sentinelUrl) {
  return {
    ...process.env,
    HTTP_PROXY: sentinelUrl,
    HTTPS_PROXY: sentinelUrl,
    ALL_PROXY: sentinelUrl,
    NO_PROXY: '',
    http_proxy: sentinelUrl,
    https_proxy: sentinelUrl,
    all_proxy: sentinelUrl,
    no_proxy: '',
    CI: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  };
}

async function installTarballOffline(tarballPath, destinationRoot) {
  const installRoot = path.join(destinationRoot, 'prefix');
  const cacheRoot = path.join(destinationRoot, 'new-empty-cache');
  mkdirSync(installRoot, { recursive: true });
  mkdirSync(cacheRoot);
  assert.equal(readdirSync(cacheRoot).length, 0);
  const npmCliPath = findNpmCliPath();
  const sentinel = await listenOnLoopbackSentinel();
  try {
    const result = await runAsync(process.execPath, [
      npmCliPath,
      'install',
      '--offline',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      cacheRoot,
      '--registry',
      sentinel.url,
      tarballPath,
    ], {
      cwd: installRoot,
      env: poisonedOfflineEnvironment(sentinel.url),
    });
    return {
      ...result,
      installRoot,
      registryConnections: sentinel.connectionCount(),
    };
  } finally {
    await sentinel.close();
  }
}

function testWorkflowContracts() {
  const packageManifest = readJson(path.join(repositoryRoot, 'mcp/package.json'));
  assert.equal(packageManifest.files.includes('native-host/'), true);
  assert.equal(packageManifest.engines.node, '>=18.20.0');
  const ciSource = readFileSync(path.join(repositoryRoot, '.github/workflows/ci.yml'), 'utf8');
  const publishSource = readFileSync(
    path.join(repositoryRoot, '.github/workflows/npm-publish.yml'),
    'utf8',
  );

  for (const pattern of [
    /native-host-windows:/,
    /runs-on: windows-latest/,
    /VsDevCmd\.bat.*-arch=x64/,
    /VsDevCmd\.bat.*-arch=arm64/,
    /build-native-host-windows\.mjs --arch x64/,
    /build-native-host-windows\.mjs --arch arm64/,
    /mcp-native-host-packaging\.test\.js --section windows-bootstrap/,
    /npm pack --dry-run --ignore-scripts --json/,
    /actions\/upload-artifact@v4/,
    /runtime-payload:/,
    /ubuntu-latest, macos-latest/,
    /mcp-native-host-packaging\.test\.js --section workflow-and-pack/,
    /needs: \[extension, mcp-smoke, website, native-host-windows, runtime-payload\]/,
  ]) {
    assert.match(ciSource, pattern);
  }

  for (const pattern of [
    /windows-bootstrap:/,
    /runs-on: windows-latest/,
    /actions\/upload-artifact@v4/,
    /publish:\s+needs: windows-bootstrap/s,
    /actions\/download-artifact@v4/,
    /FSB_REQUIRE_REAL_WINDOWS_ARTIFACTS: '1'/,
    /mcp-native-host-packaging\.test\.js --section workflow-and-pack/,
    /npm publish "\$\{\{ steps\.pack\.outputs\.tarball \}\}" --access public/,
    /lockSha256/,
    /integrityReceiptSha256/,
    /tarballSha512/,
    /peArtifacts/,
  ]) {
    assert.match(publishSource, pattern);
  }
  assert.doesNotMatch(publishSource, /npm publish --access public/);
}

function writeBoundaryGraph(fixtureRoot, mode) {
  const extension = mode === 'source' ? 'ts' : 'js';
  const graphRoot = path.join(
    fixtureRoot,
    'mcp',
    mode === 'source' ? 'src' : 'build',
    'native-host',
  );
  mkdirSync(graphRoot, { recursive: true });
  writeFileSync(
    path.join(graphRoot, `index.${extension}`),
    "import { runProductionNativeHostEntry } from './entry.js';\nimport { productionEnvironment } from './platform.js';\nrunProductionNativeHostEntry(productionEnvironment);\n",
  );
  writeFileSync(
    path.join(graphRoot, `entry.${extension}`),
    "import { wakeServeDaemon } from './daemon.js';\nimport { protocolValue } from './protocol.js';\nimport { runtimeValue } from './runtime-layout.js';\nexport function runProductionNativeHostEntry(value) { return wakeServeDaemon(value, protocolValue, runtimeValue); }\n",
  );
  writeFileSync(
    path.join(graphRoot, `protocol.${extension}`),
    "import { endianness } from 'node:os';\nimport { constantValue } from './constants.js';\nexport const protocolValue = `${endianness()}:${constantValue}`;\n",
  );
  writeFileSync(
    path.join(graphRoot, `constants.${extension}`),
    "export const constantValue = 'leaf';\n",
  );
  writeFileSync(
    path.join(graphRoot, `daemon.${extension}`),
    "import { join } from 'node:path';\nimport { constantValue } from './constants.js';\nconst runtime = { absoluteStableBuildIndex: join('/', constantValue), absoluteNode: '/node' };\nconst dependencies = { spawn() {} };\nconst argv = [runtime.absoluteStableBuildIndex, 'serve', '--host', '127.0.0.1', '--port', '7226'];\nconst options = { shell: false, detached: true, stdio: 'ignore', windowsHide: true };\nexport function wakeServeDaemon() { return dependencies.spawn(runtime.absoluteNode, argv, options); }\n",
  );
  writeFileSync(
    path.join(graphRoot, `platform.${extension}`),
    "import { spawn as spawnChild } from 'node:child_process';\nconst command = '/node';\nconst argv = [];\nconst options = {};\nexport const productionEnvironment = spawnChild(command, [...argv], options);\n",
  );
  writeFileSync(
    path.join(graphRoot, `runtime-layout.${extension}`),
    "import { posix } from 'node:path';\nimport { constantValue } from './constants.js';\nexport const runtimeValue = posix.join('/', constantValue);\n",
  );
  return graphRoot;
}

function testNativeHostImportBoundary() {
  const verifierPath = path.join(repositoryRoot, 'scripts/verify-native-host-boundary.mjs');
  const packageRoot = path.join(repositoryRoot, 'mcp');
  const packageManifest = readJson(path.join(packageRoot, 'package.json'));

  for (const args of [['--source'], ['--compiled'], ['--all'], []]) {
    const result = run(process.execPath, [verifierPath, ...args]);
    assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
  }
  assert.match(packageManifest.scripts.prebuild, /verify-agent-provider-flags\.mjs/);
  assert.match(packageManifest.scripts.prebuild, /verify-native-host-boundary\.mjs --source/);
  assert.match(
    packageManifest.scripts.build,
    /tsc && node \.\.\/scripts\/verify-native-host-boundary\.mjs --compiled && cp/,
  );
  assert.match(packageManifest.scripts.prepublishOnly, /npm run build/);
  assert.match(packageManifest.scripts.prepublishOnly, /verify-native-host-boundary\.mjs --all/);

  const packResult = run(process.execPath, [
    findNpmCliPath(),
    'pack',
    '--dry-run',
    '--ignore-scripts',
    '--json',
    '.',
  ], { cwd: packageRoot });
  assert.equal(packResult.status, 0, packResult.stderr);
  const packJson = JSON.parse(packResult.stdout);
  assert.equal(Array.isArray(packJson), true);
  const packedPaths = packJson.flatMap((entry) => entry.files || []).map((entry) => entry.path);
  assert.equal(packedPaths.includes('build/native-host/index.js'), true);
  assert.equal(packedPaths.includes('build/native-host/entry.js'), true);
  assert.equal(packedPaths.includes('build/native-host/daemon.js'), true);
  assert.equal(packedPaths.includes('build/native-host/platform.js'), true);
  assert.equal(packedPaths.includes('build/native-host/protocol.js'), true);
  assert.equal(packedPaths.includes('build/native-host/runtime-layout.js'), true);
  assert.equal(
    packedPaths.some((entry) => /com\.fsb\.mcp|native-host-shim|mcp-to-ext|ext-to-mcp/iu.test(entry)),
    false,
  );

  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'fsb-native-boundary-'));
  try {
    const fixtureScriptDirectory = path.join(fixtureRoot, 'scripts');
    mkdirSync(fixtureScriptDirectory, { recursive: true });
    const fixtureVerifier = path.join(fixtureScriptDirectory, 'verify-native-host-boundary.mjs');
    cpSync(verifierPath, fixtureVerifier);
    const sourceRoot = writeBoundaryGraph(fixtureRoot, 'source');
    const compiledRoot = writeBoundaryGraph(fixtureRoot, 'compiled');
    const invoke = (args) => run(process.execPath, [fixtureVerifier, ...args], { cwd: fixtureRoot });

    assert.equal(invoke(['--source']).status, 0);
    assert.equal(invoke(['--compiled']).status, 0);
    assert.equal(invoke([]).status, 0);
    assert.equal(invoke(['--all']).status, 0);
    assert.notEqual(invoke(['source']).status, 0);

    writeFileSync(
      path.join(compiledRoot, 'entry.js'),
      "import '../../agent-providers/spawn-supervisor.js';\n",
    );
    assert.equal(invoke(['--source']).status, 0, 'stale compiled output cannot block prebuild');
    assert.notEqual(invoke(['--compiled']).status, 0);
    assert.notEqual(invoke([]).status, 0, 'no argument aliases --all');
    assert.notEqual(invoke(['--all']).status, 0);
    writeBoundaryGraph(fixtureRoot, 'compiled');

    for (const specifier of [
      '../../agent-providers/spawn-supervisor.js',
      '../../delegation-task.js',
      '../../browser-tab-state.js',
      '../../bridge-auth.js',
      '../../native-host-install.js',
      '../../diagnostics.js',
      '../../index.js',
    ]) {
      writeFileSync(path.join(sourceRoot, 'entry.ts'), `import '${specifier}';\n`);
      assert.notEqual(invoke(['--source']).status, 0, specifier);
    }
    writeBoundaryGraph(fixtureRoot, 'source');
    assert.equal(invoke(['--compiled']).status, 0, 'source drift cannot satisfy compiled mode');

    writeFileSync(
      path.join(sourceRoot, 'entry.ts'),
      "export const load = () => import('./protocol.js');\n",
    );
    assert.notEqual(invoke(['--source']).status, 0, 'dynamic local import fails closed');
    writeBoundaryGraph(fixtureRoot, 'source');

    writeFileSync(
      path.join(sourceRoot, 'entry.ts'),
      "import './missing.js';\n",
    );
    assert.notEqual(invoke(['--source']).status, 0, 'unresolved local import fails closed');
    writeBoundaryGraph(fixtureRoot, 'source');

    writeFileSync(
      path.join(sourceRoot, 'protocol.ts'),
      "import { spawn } from 'node:child_process';\nexport const protocolValue = spawn;\n",
    );
    assert.notEqual(invoke(['--source']).status, 0, 'production process spawn edge is forbidden');
    writeBoundaryGraph(fixtureRoot, 'source');

    const platformFixture = path.join(sourceRoot, 'platform.ts');
    writeFileSync(
      platformFixture,
      `${readFileSync(platformFixture, 'utf8')}\nspawnChild('/other', [], {});\n`,
    );
    assert.notEqual(invoke(['--source']).status, 0, 'a second child-process edge is forbidden');
    writeBoundaryGraph(fixtureRoot, 'source');

    writeFileSync(
      path.join(sourceRoot, 'constants.ts'),
      "export const historical = 'com.fsb.mcp/native-host-shim/mcp-to-ext/ext-to-mcp';\n",
    );
    assert.notEqual(invoke(['--source']).status, 0, 'historical IPC names are forbidden');
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

async function testWorkflowAndPackedArtifactContract() {
  if (process.platform === 'win32') {
    testWorkflowContracts();
    return;
  }
  testWorkflowContracts();
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'fsb-native-workflow-pack-'));
  const sourceCopy = path.join(fixtureRoot, 'invoking-source');
  const tarballDirectory = path.join(fixtureRoot, 'tarball');
  const packCache = path.join(fixtureRoot, 'pack-cache');
  const unpacked = path.join(fixtureRoot, 'unpacked');
  const lockBytes = readFileSync(path.join(repositoryRoot, 'mcp/package-lock.json'));
  const productionClosure = deriveProductionClosure(JSON.parse(lockBytes));
  const npmCliPath = findNpmCliPath();
  try {
    if (process.env.FSB_PACKED_TARBALL) {
      assert.equal(path.isAbsolute(process.env.FSB_PACKED_TARBALL), true);
      const finalTarballRoot = path.join(fixtureRoot, 'final-release-tarball');
      mkdirSync(finalTarballRoot);
      const finalExtracted = run('tar', [
        '-xzf',
        process.env.FSB_PACKED_TARBALL,
        '-C',
        finalTarballRoot,
      ]);
      assert.equal(finalExtracted.status, 0, finalExtracted.stderr);
      verifyExtractedRuntimePayload(
        path.join(finalTarballRoot, 'package'),
        lockBytes,
        productionClosure,
      );
    }
    cpSync(path.join(repositoryRoot, 'mcp'), sourceCopy, { recursive: true });
    const requireRealArtifacts = process.env.FSB_REQUIRE_REAL_WINDOWS_ARTIFACTS === '1';
    if (requireRealArtifacts) verifyWindowsArtifactSet(sourceCopy);
    else writeSyntheticWindowsArtifacts(sourceCopy);

    mkdirSync(tarballDirectory);
    mkdirSync(packCache);
    const packed = run(process.execPath, [
      npmCliPath,
      'pack',
      '.',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      tarballDirectory,
      '--cache',
      packCache,
    ], { cwd: sourceCopy });
    assert.equal(packed.status, 0, packed.stderr);
    const packReceipt = JSON.parse(packed.stdout)[0];
    assert.deepEqual(
      [...packReceipt.bundled].sort(),
      [...new Set(productionClosure.map((dependency) => dependency.name))].sort(),
    );
    const tarballPath = path.join(tarballDirectory, packReceipt.filename);
    mkdirSync(unpacked);
    const extracted = run('tar', ['-xzf', tarballPath, '-C', unpacked]);
    assert.equal(extracted.status, 0, extracted.stderr);
    const extractedPackageRoot = path.join(unpacked, 'package');
    verifyExtractedRuntimePayload(extractedPackageRoot, lockBytes, productionClosure);

    const receiptPath = path.join(extractedPackageRoot, 'native-host/runtime-integrity.json');
    const receiptBytes = readFileSync(receiptPath);
    const alteredReceipt = JSON.parse(receiptBytes);
    alteredReceipt.lockSha256 = '0'.repeat(64);
    writeFileSync(receiptPath, `${JSON.stringify(alteredReceipt, null, 2)}\n`);
    assert.throws(
      () => verifyExtractedRuntimePayload(extractedPackageRoot, lockBytes, productionClosure),
      /Expected values to be strictly deep-equal/,
    );
    writeFileSync(receiptPath, receiptBytes);

    rmSync(sourceCopy, { recursive: true, force: true });
    rmSync(packCache, { recursive: true, force: true });
    const positiveInstall = await installTarballOffline(
      process.env.FSB_PACKED_TARBALL || tarballPath,
      path.join(fixtureRoot, 'positive-install'),
    );
    assert.equal(positiveInstall.status, 0, positiveInstall.stderr);
    assert.equal(positiveInstall.registryConnections, 0);
    assert.equal(existsSync(sourceCopy), false);
    assert.equal(existsSync(packCache), false);
    verifyExtractedRuntimePayload(
      path.join(positiveInstall.installRoot, 'node_modules/fsb-mcp-server'),
      lockBytes,
      productionClosure,
    );

    rmSync(path.join(extractedPackageRoot, 'node_modules/zod'), { recursive: true, force: true });
    assert.throws(
      () => verifyExtractedRuntimePayload(extractedPackageRoot, lockBytes, productionClosure),
      /ENOENT/,
    );
    const missingBundleTarball = path.join(fixtureRoot, 'missing-bundle.tgz');
    const repacked = run('tar', [
      '-czf',
      missingBundleTarball,
      '-C',
      unpacked,
      'package',
    ]);
    assert.equal(repacked.status, 0, repacked.stderr);
    const missingBundleInstall = await installTarballOffline(
      missingBundleTarball,
      path.join(fixtureRoot, 'missing-bundle-install'),
    );
    assert.equal(missingBundleInstall.registryConnections, 0);
    if (missingBundleInstall.status === 0) {
      assert.throws(
        () => verifyExtractedRuntimePayload(
          path.join(missingBundleInstall.installRoot, 'node_modules/fsb-mcp-server'),
          lockBytes,
          productionClosure,
        ),
        /ENOENT/,
        'post-install validation accepted a missing bundled package',
      );
    }

    const plainSource = path.join(fixtureRoot, 'plain-source');
    const plainTarballDirectory = path.join(fixtureRoot, 'plain-tarball');
    mkdirSync(plainSource);
    mkdirSync(plainTarballDirectory);
    writeFileSync(path.join(plainSource, 'package.json'), `${JSON.stringify({
      name: 'fsb-registry-needed-fixture',
      version: '1.0.0',
      dependencies: { zod: exactProductionDependencies.zod },
    }, null, 2)}\n`);
    const plainPacked = run(process.execPath, [
      npmCliPath,
      'pack',
      '.',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      plainTarballDirectory,
    ], { cwd: plainSource });
    assert.equal(plainPacked.status, 0, plainPacked.stderr);
    const plainTarballPath = path.join(
      plainTarballDirectory,
      JSON.parse(plainPacked.stdout)[0].filename,
    );
    const plainInstall = await installTarballOffline(
      plainTarballPath,
      path.join(fixtureRoot, 'plain-install'),
    );
    assert.notEqual(plainInstall.status, 0, 'registry-needed tarball unexpectedly installed offline');
    assert.equal(plainInstall.registryConnections, 0);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

function testWindowsBootstrapSources() {
  const cPath = path.join(repositoryRoot, 'mcp/native-host/windows/fsb-native-host-bootstrap.c');
  const resourcePath = path.join(
    repositoryRoot,
    'mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in',
  );
  const buildScriptPath = path.join(repositoryRoot, 'scripts/build-native-host-windows.mjs');
  const registryCPath = path.join(
    repositoryRoot,
    'mcp/native-host/windows/fsb-native-host-registry.c',
  );
  const registryResourcePath = path.join(
    repositoryRoot,
    'mcp/native-host/windows/fsb-native-host-registry-version.rc.in',
  );
  for (const pathname of [
    cPath, resourcePath, registryCPath, registryResourcePath, buildScriptPath,
  ]) {
    assert.equal(existsSync(pathname), true, `missing Windows bootstrap artifact: ${pathname}`);
  }
  const cSource = readFileSync(cPath, 'utf8');
  const resourceSource = readFileSync(resourcePath, 'utf8');
  const buildSource = readFileSync(buildScriptPath, 'utf8');
  const registrySource = readFileSync(registryCPath, 'utf8');
  const registryResource = readFileSync(registryResourcePath, 'utf8');
  assert.match(cSource, /CreateProcessW/);
  assert.match(cSource, /STARTF_USESTDHANDLES/);
  assert.match(cSource, /FSBNH01/);
  assert.match(cSource, /65536/);
  assert.match(cSource, /chrome-extension:\/\//);
  assert.doesNotMatch(cSource, /\b(?:system|_popen|ShellExecuteW?)\s*\(/);
  assert.doesNotMatch(cSource, /cmd\.exe|powershell|\.bat\b|\.cmd\b|com\.fsb\.mcp|native-host-shim/i);
  assert.match(resourceSource, /FSB_MCP_VERSION/);
  assert.match(resourceSource, /fsb-native-host-bootstrap-v1/);
  assert.match(registrySource, /RegQueryValueExW/);
  assert.match(registrySource, /RegSetValueExW/);
  assert.match(registrySource, /RegDeleteValueW/);
  assert.match(registrySource, /RegDeleteKeyExW/);
  assert.match(registrySource, /KEY_WOW64_32KEY/);
  assert.match(registrySource, /KEY_WOW64_64KEY/);
  assert.match(registrySource, /fsb-native-host-registry-v1/);
  assert.match(registrySource, /Software\\\\Google\\\\Chrome\\\\NativeMessagingHosts/);
  assert.doesNotMatch(registrySource, /reg\.exe|SystemRoot|SYSTEMROOT|\b(?:system|_popen|ShellExecuteW?)\s*\(/i);
  assert.equal(
    (registrySource.match(/KEY_WOW64_64KEY/g) || []).length,
    1,
    '64-bit registry view appears only in the read-only query dispatch',
  );
  assert.match(registryResource, /fsb-native-host-registry-helper-v1/);
  assert.match(buildSource, /\bcl\.exe\b/);
  assert.match(buildSource, /\brc\.exe\b/);
  assert.match(buildSource, /win32-x64/);
  assert.match(buildSource, /win32-arm64/);
  assert.match(buildSource, /registry-helper/);
  assert.match(buildSource, /schema:\s*2/);
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
  const x64RegistryHelper = path.join(
    x64Directory,
    'fsb-native-host-registry.exe',
  );
  const arm64RegistryHelper = path.join(
    repositoryRoot,
    'mcp/native-host/bin/win32-arm64/fsb-native-host-registry.exe',
  );
  assert.equal(existsSync(x64Executable), true, 'x64 bootstrap artifact is missing');
  assert.equal(existsSync(arm64Executable), true, 'arm64 bootstrap artifact is missing');
  assert.equal(existsSync(x64RegistryHelper), true, 'x64 registry helper artifact is missing');
  assert.equal(existsSync(arm64RegistryHelper), true, 'arm64 registry helper artifact is missing');

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
    assert.equal(metadata.schema, 2);
    assert.equal(metadata.package, 'fsb-mcp-server');
    assert.equal(metadata.version, require('../mcp/package.json').version);
    assert.deepEqual(
      metadata.artifacts.map((artifact) => `${artifact.architecture}/${artifact.role}`),
      ['x64/bootstrap', 'x64/registry-helper', 'arm64/bootstrap', 'arm64/registry-helper'],
    );
    for (const artifact of metadata.artifacts) {
      assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
      assert.ok(artifact.bytes > 0);
    }

    for (const operation of ['1', '2']) {
      const query = spawnSync(
        x64RegistryHelper,
        ['fsb-native-host-registry-v1', operation],
        { encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 32 * 1024 },
      );
      assert.equal(query.status, 0, query.stderr);
      assert.equal(query.stderr, '');
      const fact = JSON.parse(query.stdout);
      assert.deepEqual(Object.keys(fact).sort(), [
        'operation', 'registryType', 'schema', 'status', 'valueUtf8Hex',
      ]);
      assert.equal(fact.schema, 1);
      assert.equal(fact.operation, Number(operation));
      assert.ok(fact.status === 1 || fact.status === 2);
      assert.match(fact.valueUtf8Hex, /^(?:[0-9a-f]{2})*$/);
    }
    const closedCommand = spawnSync(
      x64RegistryHelper,
      ['fsb-native-host-registry-v1', '7'],
      { encoding: 'utf8', shell: false, windowsHide: true },
    );
    assert.notEqual(closedCommand.status, 0);
    assert.equal(closedCommand.stdout, '');
    assert.equal(closedCommand.stderr, 'FSBRG_E_ARGS\n');
    const rejectedWrite = spawnSync(
      x64RegistryHelper,
      ['fsb-native-host-registry-v1', '4'],
      { input: Buffer.from('invalid'), encoding: 'utf8', shell: false, windowsHide: true },
    );
    assert.notEqual(rejectedWrite.status, 0);
    assert.equal(rejectedWrite.stdout, '');
    assert.equal(rejectedWrite.stderr, 'FSBRG_E_INPUT\n');

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
    if (section === 'workflow-and-pack') {
      await testWorkflowAndPackedArtifactContract();
      continue;
    }
    if (section === 'import-boundary') {
      testNativeHostImportBoundary();
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
