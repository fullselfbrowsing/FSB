#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..');
const requestedSection = (() => {
  const index = process.argv.indexOf('--section');
  if (index === -1) return null;
  if (index + 1 >= process.argv.length) throw new Error('--section requires a value');
  return process.argv[index + 1];
})();
const knownSections = new Set([
  'platform-and-registration',
  'runtime-transaction',
  'install-transaction',
  'cli-routing',
  'cli-output',
]);
if (requestedSection && !knownSections.has(requestedSection)) {
  throw new Error(`unknown section: ${requestedSection}`);
}

const HOST_NAME = 'io.github.fullselfbrowsing.fsb_native_host';
const HOST_DESCRIPTION = 'FSB local agent service wake host';
const EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
const DEVELOPMENT_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
const PACKAGE_VERSION = '0.10.0';
const INSTALL_TOKEN = '0123456789abcdef0123456789abcdef';
const ARTIFACT_SHA256 = 'a'.repeat(64);
const BUILD_ENTRY_SHA256 = 'b'.repeat(64);
const TARBALL_SHA512 = `sha512-${Buffer.alloc(64, 7).toString('base64')}`;
const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;

let passed = 0;

function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log('  PASS:', message);
}

function equal(actual, expected, message) {
  assert.equal(actual, expected, message);
  passed += 1;
  console.log('  PASS:', message);
}

function deepEqual(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  passed += 1;
  console.log('  PASS:', message);
}

async function importBuild(relativePath) {
  const href = pathToFileURL(path.join(repositoryRoot, 'mcp', 'build', relativePath)).href;
  return import(`${href}?phase63install=${Date.now()}-${Math.random()}`);
}

async function captureCliAction(action) {
  const stdout = [];
  const stderr = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  console.log = (...values) => stdout.push(values.join(' '));
  console.error = (...values) => stderr.push(values.join(' '));
  process.exitCode = 0;
  try {
    await action();
    return Object.freeze({
      stdout: `${stdout.join('\n')}${stdout.length > 0 ? '\n' : ''}`,
      stderr: `${stderr.join('\n')}${stderr.length > 0 ? '\n' : ''}`,
      exitCode: process.exitCode ?? 0,
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
  }
}

function ordinaryClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectedManifest(launcherPath, extensionId = EXTENSION_ID) {
  return {
    name: HOST_NAME,
    description: HOST_DESCRIPTION,
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

function expectedMarker(platform, overrides = {}) {
  return {
    schema: 1,
    owner: 'io.github.fullselfbrowsing.fsb',
    host: HOST_NAME,
    origin: ORIGIN,
    platform,
    packageVersion: PACKAGE_VERSION,
    launcherRelativePath: platform === 'win32'
      ? 'bin\\fsb-native-host.exe'
      : 'bin/fsb-native-host-launcher.mjs',
    artifactSha256: ARTIFACT_SHA256,
    installToken: INSTALL_TOKEN,
    ...overrides,
  };
}

function fileFact(pathname, value) {
  return Object.freeze({
    status: 'file',
    path: pathname,
    realPath: pathname,
    contents: JSON.stringify(value),
  });
}

function fakePlatformDependencies(options = {}) {
  const trace = options.trace || [];
  const manifestFacts = options.manifestFacts instanceof Map
    ? options.manifestFacts
    : new Map(options.manifestFacts || []);
  const registryFacts = options.registryFacts instanceof Map
    ? options.registryFacts
    : new Map(options.registryFacts || []);
  let keyInspectionCount = 0;
  function step(entry) {
    trace.push(entry);
    if (options.failAt === entry) throw new Error(`sensitive:${entry}:must-not-leak`);
  }
  const dependencies = {
    files: {
      inspectFile: async (pathname, maxBytes) => {
        step(`file:read:${pathname}:${maxBytes}`);
        return manifestFacts.get(pathname) || Object.freeze({ status: 'absent' });
      },
      writePrivateFileAtomic: async (pathname, contents, mode) => {
        step(`file:write:${pathname}:${mode.toString(8)}`);
        manifestFacts.set(pathname, Object.freeze({
          status: 'file',
          path: pathname,
          realPath: pathname,
          contents,
        }));
      },
      removeFile: async (pathname) => {
        step(`file:delete:${pathname}`);
        manifestFacts.delete(pathname);
      },
    },
    registry: {
      readDefault: async (view, key) => {
        step(`registry:read:${view}:${key}`);
        return registryFacts.get(view) || Object.freeze({ status: 'absent' });
      },
      writeDefault: async (view, key, value) => {
        step(`registry:write:${view}:${key}:${value.type}`);
        registryFacts.set(view, Object.freeze({ status: 'value', ...value }));
      },
      deleteDefault: async (view, key) => {
        step(`registry:delete:${view}:${key}`);
        registryFacts.delete(view);
      },
      inspectKey: async (view, key) => {
        step(`registry:key:${view}:${key}`);
        const configured = Array.isArray(options.keyFacts)
          ? options.keyFacts[Math.min(keyInspectionCount, options.keyFacts.length - 1)]
          : options.keyFact;
        keyInspectionCount += 1;
        if (configured) return Object.freeze(configured);
        return registryFacts.has(view)
          ? Object.freeze({ status: 'exact-default-only' })
          : Object.freeze({ status: 'empty' });
      },
      deleteEmptyKey: async (view, key) => {
        step(`registry:key-delete:${view}:${key}`);
      },
    },
  };
  return { dependencies, manifestFacts, registryFacts, trace };
}

function platformPath(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function readRuntimeContract() {
  return {
    manifest: JSON.parse(readFileSync(path.join(repositoryRoot, 'mcp/package.json'), 'utf8')),
    integrity: JSON.parse(readFileSync(
      path.join(repositoryRoot, 'mcp/native-host/runtime-integrity.json'),
      'utf8',
    )),
  };
}

function runtimePackageSnapshot(layout, packageRoot, overrides = {}) {
  const { manifest, integrity } = readRuntimeContract();
  const api = platformPath(layout.platform);
  const productionPackages = integrity.productionPackages.map((entry) => ({
    ...entry,
    dev: false,
  }));
  const windowsArtifacts = {
    schema: 1,
    package: manifest.name,
    version: manifest.version,
    artifacts: [
      {
        architecture: 'x64',
        path: 'native-host/bin/win32-x64/fsb-native-host.exe',
        bytes: 8192,
        peMachine: '0x8664',
        sha256: ARTIFACT_SHA256,
        packageVersion: manifest.version,
      },
      {
        architecture: 'arm64',
        path: 'native-host/bin/win32-arm64/fsb-native-host.exe',
        bytes: 8192,
        peMachine: '0xaa64',
        sha256: 'c'.repeat(64),
        packageVersion: manifest.version,
      },
    ],
  };
  return {
    schema: 1,
    packageRoot,
    packageRealPath: packageRoot,
    packageName: manifest.name,
    packageVersion: manifest.version,
    dependencies: ordinaryClone(manifest.dependencies),
    bundleDependencies: [...manifest.bundleDependencies],
    integrityReceipt: ordinaryClone(integrity),
    productionPackages,
    buildEntry: {
      status: 'file',
      path: api.join(packageRoot, 'build', 'native-host', 'index.js'),
      realPath: api.join(packageRoot, 'build', 'native-host', 'index.js'),
      sha256: BUILD_ENTRY_SHA256,
      bytes: 4096,
    },
    posixLauncherTemplate: layout.platform === 'win32' ? null : {
      status: 'file',
      path: api.join(packageRoot, 'native-host', 'posix', 'fsb-native-host-launcher.mjs.in'),
      realPath: api.join(packageRoot, 'native-host', 'posix', 'fsb-native-host-launcher.mjs.in'),
      contents: "#!__FSB_ABSOLUTE_NODE__\nimport '../runtime/package/build/native-host/index.js';\n",
      sha256: 'd'.repeat(64),
      bytes: 93,
    },
    windowsArtifacts: layout.platform === 'win32' ? windowsArtifacts : null,
    ...overrides,
  };
}

function runtimeLayoutInput(platform) {
  const common = {
    packageVersion: PACKAGE_VERSION,
    extensionId: EXTENSION_ID,
    installToken: INSTALL_TOKEN,
  };
  if (platform === 'win32') {
    return {
      ...common,
      platform,
      homeDirectory: 'C:\\Users\\fsb',
      localAppData: 'C:\\Users\\fsb\\AppData\\Local',
      nodePath: 'C:\\Program Files\\nodejs\\node.exe',
      nodeRealPath: 'C:\\Program Files\\nodejs\\node.exe',
      npmCliPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
      npmCliRealPath: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
      invokingPackageRoot: 'C:\\Temp\\npm-cache\\_npx\\token\\node_modules\\fsb-mcp-server',
    };
  }
  const homeDirectory = platform === 'darwin' ? '/Users/fsb' : '/home/fsb';
  return {
    ...common,
    platform,
    homeDirectory,
    nodePath: platform === 'darwin' ? '/opt/homebrew/bin/node' : '/usr/bin/node',
    nodeRealPath: platform === 'darwin' ? '/opt/homebrew/bin/node' : '/usr/bin/node',
    npmCliPath: platform === 'darwin'
      ? '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js'
      : '/usr/lib/node_modules/npm/bin/npm-cli.js',
    npmCliRealPath: platform === 'darwin'
      ? '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js'
      : '/usr/lib/node_modules/npm/bin/npm-cli.js',
    invokingPackageRoot: `${homeDirectory}/.npm/_npx/token/node_modules/fsb-mcp-server`,
  };
}

function fakeRuntimeDependencies(layout, options = {}) {
  const trace = [];
  const api = platformPath(layout.platform);
  const materializedPackageRoot = api.join(
    layout.install.cwd,
    'node_modules',
    'fsb-mcp-server',
  );
  const stagedPackageRoot = api.join(layout.stageRoot, 'runtime', 'package');
  const sourceSnapshot = runtimePackageSnapshot(
    layout,
    layout.invokingPackageRoot,
    options.sourceSnapshotOverrides,
  );
  const installedSnapshot = runtimePackageSnapshot(
    layout,
    materializedPackageRoot,
    options.installedSnapshotOverrides,
  );
  let sourceAvailable = true;
  let originalCacheAvailable = true;
  let launcherReachable = false;
  let priorRuntimeUntouched = true;

  function step(entry) {
    trace.push(entry);
    if (options.failAt === entry) throw new Error(`sensitive:${entry}:must-not-leak`);
  }

  const files = {
    inspectSecurePath: async (pathname, expectedKind) => {
      step(`inspect:${pathname}:${expectedKind}`);
      if (pathname === layout.stableRoot) {
        return options.stableRootFact || Object.freeze({ status: 'absent' });
      }
      return Object.freeze({
        status: expectedKind,
        path: pathname,
        realPath: pathname,
        mode: expectedKind === 'file' ? 0o700 : 0o700,
      });
    },
    readPackageSnapshot: async (packageRoot) => {
      step(`snapshot:${packageRoot}`);
      if (packageRoot === layout.invokingPackageRoot) return sourceSnapshot;
      if (packageRoot === materializedPackageRoot) return installedSnapshot;
      if (packageRoot === stagedPackageRoot) {
        return runtimePackageSnapshot(layout, stagedPackageRoot, options.installedSnapshotOverrides);
      }
      throw new Error('unexpected-package-root');
    },
    createDirectoryExclusive: async (pathname, mode) => {
      step(`mkdir-exclusive:${pathname}:${mode.toString(8)}`);
    },
    createDirectory: async (pathname, mode) => {
      step(`mkdir:${pathname}:${mode.toString(8)}`);
    },
    assertEmptyDirectory: async (pathname) => {
      step(`empty:${pathname}`);
    },
    hashFile: async (pathname, algorithm) => {
      step(`hash:${pathname}:${algorithm}`);
      if (algorithm === 'sha512') return TARBALL_SHA512;
      if (pathname.endsWith('fsb-native-host.exe')) return ARTIFACT_SHA256;
      return BUILD_ENTRY_SHA256;
    },
    moveDirectoryExact: async (source, destination) => {
      step(`move:${source}:${destination}`);
    },
    writeFileExclusiveNoFollow: async (pathname, contents, mode) => {
      step(`write:${pathname}:${mode.toString(8)}`);
      check(Buffer.byteLength(contents) <= 65536, 'runtime writes only bounded launcher/config/marker content');
    },
    copyFileExclusiveNoFollow: async (source, destination, mode) => {
      step(`copy:${source}:${destination}:${mode.toString(8)}`);
    },
    restrictOwnedTree: async (pathname, directoryMode, fileMode) => {
      step(`restrict:${pathname}:${directoryMode.toString(8)}:${fileMode.toString(8)}`);
    },
    fsyncFile: async (pathname) => {
      step(`fsync-file:${pathname}`);
    },
    fsyncDirectory: async (pathname) => {
      step(`fsync-dir:${pathname}`);
    },
    renameDirectoryAtomic: async (source, destination) => {
      step(`rename:${source}:${destination}`);
      launcherReachable = true;
    },
    removeStage: async (pathname) => {
      trace.push(`cleanup:${pathname}`);
    },
  };

  const processMaterializer = {
    run: async (invocation) => {
      const operation = invocation.argv.includes('pack') ? 'pack' : 'install';
      step(`process:${operation}`);
      if (operation === 'pack') {
        sourceAvailable = false;
        originalCacheAvailable = false;
        const bundled = [...new Set(
          sourceSnapshot.integrityReceipt.productionPackages.map((entry) => entry.name),
        )].sort();
        return Object.freeze({
          status: options.packStatus ?? 0,
          stdout: options.packStdout ?? JSON.stringify([{
            name: 'fsb-mcp-server',
            version: PACKAGE_VERSION,
            filename: api.basename(layout.tarballPath),
            integrity: TARBALL_SHA512,
            bundled,
          }]),
          stderr: options.packStderr ?? '',
          networkRequests: options.packNetworkRequests ?? 0,
        });
      }
      check(!sourceAvailable, 'offline install fixture removes access to the invoking source after pack');
      check(!originalCacheAvailable, 'offline install fixture removes access to the original cache after pack');
      return Object.freeze({
        status: options.installStatus ?? 0,
        stdout: options.installStdout ?? '',
        stderr: options.installStderr ?? '',
        networkRequests: options.installNetworkRequests ?? 0,
      });
    },
  };

  return {
    dependencies: { files, process: processMaterializer },
    trace,
    materializedPackageRoot,
    stagedPackageRoot,
    sourceAvailable: () => sourceAvailable,
    originalCacheAvailable: () => originalCacheAvailable,
    launcherReachable: () => launcherReachable,
    priorRuntimeUntouched: () => priorRuntimeUntouched,
  };
}

function runtimeReceipt(layout, marker) {
  return Object.freeze({
    schema: 1,
    platform: layout.platform,
    packageName: 'fsb-mcp-server',
    packageVersion: marker.packageVersion,
    stableRoot: layout.stableRoot,
    launcherPath: layout.launcherPath,
    packageRoot: layout.packageRoot,
    markerPath: layout.markerPath,
    origin: marker.origin,
    installToken: marker.installToken,
    tarballIntegrity: TARBALL_SHA512,
    artifactSha256: marker.artifactSha256,
    marker,
  });
}

function extensionIdFromOrigin(origin) {
  return origin.slice('chrome-extension://'.length, -1);
}

function fakeInstallTransaction(platformModule, platformLayout, runtimeLayout, options = {}) {
  const trace = [];
  const adjacentPath = platformLayout.platform === 'win32'
    ? `${platformLayout.stableRoot}\\adjacent-owned-by-user.txt`
    : `${path.posix.dirname(platformLayout.manifestPath)}/adjacent.host.json`;
  let runtimeState = options.runtimeState || 'absent';
  let runtimeVersion = options.runtimeVersion || PACKAGE_VERSION;
  let runtimeOrigin = options.runtimeOrigin || runtimeLayout.origin;
  let currentMarker = null;
  let currentReceipt = null;
  let activePublishers = 0;
  let maximumActivePublishers = 0;
  let publishCount = 0;

  function rebuildExactRuntime() {
    currentMarker = expectedMarker(platformLayout.platform, {
      origin: runtimeOrigin,
      packageVersion: runtimeVersion,
      installToken: options.runtimeInstallToken || INSTALL_TOKEN,
      artifactSha256: options.runtimeArtifactSha256 || ARTIFACT_SHA256,
    });
    currentReceipt = runtimeReceipt(runtimeLayout, currentMarker);
  }
  if (runtimeState === 'exact') rebuildExactRuntime();

  const registrationState = options.registrationState
    || (runtimeState === 'exact' ? 'exact' : 'absent');
  const manifestFacts = new Map([[adjacentPath, Object.freeze({
    status: 'file',
    path: adjacentPath,
    realPath: adjacentPath,
    contents: 'adjacent-user-content',
  })]]);
  const registryFacts = new Map();
  if (registrationState !== 'absent') {
    const registrationOrigin = options.registrationOrigin || runtimeOrigin;
    const extensionId = extensionIdFromOrigin(registrationOrigin);
    let manifest = expectedManifest(platformLayout.launcherPath, extensionId);
    if (registrationState === 'foreign') manifest = { ...manifest, name: 'foreign.host' };
    manifestFacts.set(
      platformLayout.manifestPath,
      registrationState === 'unavailable'
        ? Object.freeze({ status: 'unavailable' })
        : fileFact(platformLayout.manifestPath, manifest),
    );
    if (platformLayout.platform === 'win32') {
      registryFacts.set('user/32', registrationState === 'unavailable'
        ? Object.freeze({ status: 'unavailable' })
        : Object.freeze({
          status: 'value',
          type: registrationState === 'invalid' ? 'REG_BINARY' : 'REG_SZ',
          value: registrationState === 'mismatched'
            ? 'C:\\foreign\\manifest.json'
            : platformLayout.manifestPath,
        }));
    }
  }
  if (registrationState === 'shadow' && platformLayout.platform === 'win32') {
    registryFacts.set('user/32', Object.freeze({
      status: 'value',
      type: 'REG_SZ',
      value: platformLayout.manifestPath,
    }));
    registryFacts.set('user/64', Object.freeze({
      status: 'value',
      type: 'REG_SZ',
      value: platformLayout.manifestPath,
    }));
  } else if (platformLayout.platform === 'win32') {
    registryFacts.set('user/64', Object.freeze({ status: 'absent' }));
  }

  const platformHarness = fakePlatformDependencies({
    trace,
    manifestFacts,
    registryFacts,
    failAt: options.failAt,
    keyFact: options.keyFact,
    keyFacts: options.keyFacts,
  });
  const platformAdapter = platformModule.createNativeHostPlatformAdapter(
    platformLayout,
    platformHarness.dependencies,
  );

  function runtimeStep(entry) {
    trace.push(entry);
    if (options.failAt === entry) throw new Error(`sensitive:${entry}:must-not-leak`);
  }

  const runtimeAdapter = Object.freeze({
    layout: runtimeLayout,
    inspectRuntime: async () => {
      runtimeStep('runtime:inspect');
      if (runtimeState === 'absent') {
        return Object.freeze({
          state: 'absent',
          reason: 'absent',
          markerFact: Object.freeze({ status: 'absent' }),
          marker: null,
          receipt: null,
        });
      }
      if (runtimeState === 'exact') {
        return Object.freeze({
          state: 'exact',
          reason: 'exact',
          markerFact: fileFact(platformLayout.markerPath, currentMarker),
          marker: Object.freeze({ ...currentMarker }),
          receipt: currentReceipt,
        });
      }
      return Object.freeze({
        state: runtimeState,
        reason: `runtime-${runtimeState}`,
        markerFact: options.runtimeMarkerFact || Object.freeze({
          status: runtimeState === 'unavailable' ? 'unavailable' : 'symlink',
        }),
        marker: null,
        receipt: null,
      });
    },
    publishRuntime: async () => {
      runtimeStep('runtime:publish');
      publishCount += 1;
      activePublishers += 1;
      maximumActivePublishers = Math.max(maximumActivePublishers, activePublishers);
      try {
        if (options.publishGate) await options.publishGate;
        if (options.publishResult) return Object.freeze(options.publishResult);
        runtimeState = 'exact';
        runtimeVersion = PACKAGE_VERSION;
        runtimeOrigin = runtimeLayout.origin;
        rebuildExactRuntime();
        return Object.freeze({
          status: 'published',
          reason: 'published',
          receipt: currentReceipt,
          trace: Object.freeze({
            pack: Object.freeze({}),
            install: Object.freeze({}),
          }),
        });
      } finally {
        activePublishers -= 1;
      }
    },
    recheckPublicationBoundary: async (receipt) => {
      runtimeStep('runtime:recheck-publication');
      return options.publicationBoundaryExact !== false
        && runtimeState === 'exact'
        && receipt === currentReceipt;
    },
    recheckExactRuntime: async (receipt) => {
      runtimeStep('runtime:recheck-exact');
      return options.runtimeBoundaryExact !== false
        && runtimeState === 'exact'
        && receipt === currentReceipt;
    },
    removeExactRuntime: async (receipt) => {
      runtimeStep('runtime:remove');
      if (runtimeState !== 'exact' || receipt !== currentReceipt) {
        throw new Error('sensitive:runtime-ownership-mismatch');
      }
      runtimeState = 'absent';
      currentMarker = null;
      currentReceipt = null;
      if (platformLayout.platform === 'win32') {
        manifestFacts.delete(platformLayout.manifestPath);
      }
    },
  });

  return {
    dependencies: Object.freeze({ platform: platformAdapter, runtime: runtimeAdapter }),
    trace,
    manifestFacts,
    registryFacts,
    adjacentPath,
    runtimeState: () => runtimeState,
    publishCount: () => publishCount,
    maximumActivePublishers: () => maximumActivePublishers,
  };
}

async function runPlatformAndRegistration() {
  const registration = await importBuild('native-host-registration.js');
  const platform = await importBuild('native-host-install/platform.js');

  const layouts = [
    {
      platform: 'darwin',
      input: { platform: 'darwin', homeDirectory: '/Users/fsb' },
      stableRoot: '/Users/fsb/.fsb/native-host',
      manifestPath: '/Users/fsb/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json',
      launcherPath: '/Users/fsb/.fsb/native-host/bin/fsb-native-host-launcher.mjs',
      kind: 'file',
    },
    {
      platform: 'linux',
      input: { platform: 'linux', homeDirectory: '/home/fsb' },
      stableRoot: '/home/fsb/.fsb/native-host',
      manifestPath: '/home/fsb/.config/google-chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json',
      launcherPath: '/home/fsb/.fsb/native-host/bin/fsb-native-host-launcher.mjs',
      kind: 'file',
    },
    {
      platform: 'win32',
      input: {
        platform: 'win32',
        homeDirectory: 'C:\\Users\\fsb',
        localAppData: 'C:\\Users\\fsb\\AppData\\Local',
      },
      stableRoot: 'C:\\Users\\fsb\\AppData\\Local\\FSB\\NativeMessagingHost',
      manifestPath: 'C:\\Users\\fsb\\AppData\\Local\\FSB\\NativeMessagingHost\\manifest.json',
      launcherPath: 'C:\\Users\\fsb\\AppData\\Local\\FSB\\NativeMessagingHost\\bin\\fsb-native-host.exe',
      kind: 'registry',
    },
  ];

  for (const table of layouts) {
    const value = platform.resolveNativeHostPlatformLayout(table.input);
    equal(value.platform, table.platform, `${table.platform} layout retains the exact platform`);
    equal(value.stableRoot, table.stableRoot, `${table.platform} uses the one stable FSB runtime root`);
    equal(value.manifestPath, table.manifestPath, `${table.platform} resolves the exact Chrome user-scope manifest`);
    equal(value.launcherPath, table.launcherPath, `${table.platform} registers the stable owned launcher`);
    equal(value.registration.kind, table.kind, `${table.platform} uses the required registration kind`);
    check(Object.isFrozen(value), `${table.platform} layout is immutable`);
  }

  const windows = platform.resolveNativeHostPlatformLayout(layouts[2].input);
  equal(
    windows.registration.key,
    'Software\\Google\\Chrome\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host',
    'Windows uses only the exact Chrome HKCU host-name subkey',
  );
  equal(windows.registration.canonicalView, 'user/32', 'Windows canonical mutation view is user/32');
  equal(windows.registration.shadowView, 'user/64', 'Windows shadow inspection view is user/64');

  for (const invalid of [
    { platform: 'linux', homeDirectory: 'relative' },
    { platform: 'darwin', homeDirectory: '/Users/fsb/../other' },
    { platform: 'win32', homeDirectory: 'C:\\Users\\fsb' },
    { platform: 'freebsd', homeDirectory: '/home/fsb' },
  ]) {
    assert.throws(
      () => platform.resolveNativeHostPlatformLayout(invalid),
      /FSBNH_INSTALL_PLATFORM/u,
    );
    passed += 1;
    console.log('  PASS: invalid or noncanonical platform layout fails closed');
  }

  for (const table of layouts) {
    const layout = platform.resolveNativeHostPlatformLayout(table.input);
    const manifest = registration.createNativeHostManifest({
      platform: table.platform,
      launcherPath: table.launcherPath,
    });
    deepEqual(
      Reflect.ownKeys(manifest),
      ['name', 'description', 'path', 'type', 'allowed_origins'],
      `${table.platform} manifest has exactly five ordered own keys`,
    );
    deepEqual(manifest, expectedManifest(table.launcherPath), `${table.platform} manifest is exact`);
    check(Object.isFrozen(manifest), `${table.platform} manifest is immutable`);
    check(
      registration.validateNativeHostManifest(manifest, {
        platform: table.platform,
        launcherPath: table.launcherPath,
        extensionId: EXTENSION_ID,
      }) !== null,
      `${table.platform} exact manifest validates`,
    );
    const marker = registration.validateNativeHostMarker(
      expectedMarker(table.platform),
      { platform: table.platform, origin: ORIGIN },
    );
    check(marker !== null, `${table.platform} exact owner marker validates`);
    check(Object.isFrozen(marker), `${table.platform} canonical marker is immutable`);

    const exactInspection = registration.inspectNativeHostRegistration({
      layout,
      extensionId: EXTENSION_ID,
      manifest: fileFact(table.manifestPath, manifest),
      marker: fileFact(`${table.stableRoot}${table.platform === 'win32' ? '\\' : '/'}owner.json`, expectedMarker(table.platform)),
      registry32: table.platform === 'win32'
        ? Object.freeze({ status: 'value', type: 'REG_SZ', value: table.manifestPath })
        : undefined,
      registry64: table.platform === 'win32'
        ? Object.freeze({ status: 'absent' })
        : undefined,
    });
    equal(exactInspection.state, 'exact', `${table.platform} exact registration and marker classify exact`);
    equal(exactInspection.reason, 'exact', `${table.platform} exact fact uses a stable content-free reason`);
    check(Object.isFrozen(exactInspection), `${table.platform} inspection result is immutable`);
  }

  const developmentManifest = registration.createNativeHostManifest({
    platform: 'linux',
    launcherPath: layouts[1].launcherPath,
    extensionId: DEVELOPMENT_EXTENSION_ID,
  });
  deepEqual(
    developmentManifest.allowed_origins,
    [`chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`],
    'one explicit validated development extension id replaces the default origin',
  );

  for (const extensionId of [
    '',
    'a'.repeat(31),
    'a'.repeat(33),
    'q'.repeat(32),
    '../profile',
  ]) {
    assert.throws(
      () => registration.createNativeHostManifest({
        platform: 'linux',
        launcherPath: layouts[1].launcherPath,
        extensionId,
      }),
      /FSBNH_REGISTRATION_MANIFEST/u,
    );
    passed += 1;
    console.log('  PASS: malformed development extension id is rejected');
  }

  const exactLinuxManifest = expectedManifest(layouts[1].launcherPath);
  const hostileManifests = [
    { ...exactLinuxManifest, extra: true },
    { ...exactLinuxManifest, name: 'foreign.host' },
    { ...exactLinuxManifest, description: 'foreign' },
    { ...exactLinuxManifest, path: 'relative/launcher' },
    { ...exactLinuxManifest, type: 'other' },
    { ...exactLinuxManifest, allowed_origins: [] },
    { ...exactLinuxManifest, allowed_origins: [ORIGIN, ORIGIN] },
    { ...exactLinuxManifest, allowed_origins: ['chrome-extension://*/'] },
    { ...exactLinuxManifest, allowed_origins: ['https://example.test/'] },
    Object.assign(Object.create(null), exactLinuxManifest),
    Object.defineProperty(ordinaryClone(exactLinuxManifest), 'name', {
      enumerable: true,
      get() { return HOST_NAME; },
    }),
    Object.assign(ordinaryClone(exactLinuxManifest), { [Symbol('hostile')]: true }),
    [exactLinuxManifest],
  ];
  for (const hostile of hostileManifests) {
    equal(
      registration.validateNativeHostManifest(hostile, {
        platform: 'linux',
        launcherPath: layouts[1].launcherPath,
        extensionId: EXTENSION_ID,
      }),
      null,
      'foreign, widened, prototype-bearing, accessor, or malformed manifest is rejected',
    );
  }

  const hostileMarkers = [
    { ...expectedMarker('linux'), extra: true },
    { ...expectedMarker('linux'), owner: 'foreign' },
    { ...expectedMarker('linux'), origin: 'chrome-extension://*/' },
    { ...expectedMarker('linux'), launcherRelativePath: '../outside' },
    { ...expectedMarker('linux'), packageVersion: 'unbounded' },
    { ...expectedMarker('linux'), installToken: 'a'.repeat(31) },
    Object.assign(Object.create(null), expectedMarker('linux')),
    Object.defineProperty(ordinaryClone(expectedMarker('linux')), 'schema', {
      enumerable: true,
      get() { return 1; },
    }),
  ];
  for (const hostile of hostileMarkers) {
    equal(
      registration.validateNativeHostMarker(hostile, { platform: 'linux', origin: ORIGIN }),
      null,
      'foreign, widened, or non-data owner marker is rejected',
    );
  }

  const linuxLayout = platform.resolveNativeHostPlatformLayout(layouts[1].input);
  const linuxExactInput = {
    layout: linuxLayout,
    extensionId: EXTENSION_ID,
    manifest: fileFact(linuxLayout.manifestPath, expectedManifest(linuxLayout.launcherPath)),
    marker: fileFact(linuxLayout.markerPath, expectedMarker('linux')),
  };
  const linuxClassifications = [
    [{ ...linuxExactInput, manifest: Object.freeze({ status: 'absent' }) }, 'mismatched'],
    [{ ...linuxExactInput, marker: Object.freeze({ status: 'absent' }) }, 'mismatched'],
    [{ ...linuxExactInput, manifest: Object.freeze({ status: 'symlink' }) }, 'invalid'],
    [{ ...linuxExactInput, marker: Object.freeze({ status: 'other' }) }, 'invalid'],
    [{ ...linuxExactInput, manifest: Object.freeze({ status: 'unavailable' }) }, 'unavailable'],
    [{ ...linuxExactInput, marker: Object.freeze({ status: 'unavailable' }) }, 'unavailable'],
    [{
      ...linuxExactInput,
      manifest: fileFact(linuxLayout.manifestPath, { ...expectedManifest(linuxLayout.launcherPath), name: 'foreign' }),
    }, 'foreign'],
    [{
      ...linuxExactInput,
      manifest: Object.freeze({
        ...fileFact(linuxLayout.manifestPath, expectedManifest(linuxLayout.launcherPath)),
        realPath: '/outside/manifest.json',
      }),
    }, 'invalid'],
  ];
  for (const [input, expectedState] of linuxClassifications) {
    equal(
      registration.inspectNativeHostRegistration(input).state,
      expectedState,
      `POSIX registration classification fails closed as ${expectedState}`,
    );
  }
  equal(
    registration.inspectNativeHostRegistration({
      ...linuxExactInput,
      manifest: Object.freeze({ status: 'absent' }),
      marker: Object.freeze({ status: 'absent' }),
    }).state,
    'absent',
    'both absent POSIX facts classify absent',
  );

  const windowsExactInput = {
    layout: windows,
    extensionId: EXTENSION_ID,
    manifest: fileFact(windows.manifestPath, expectedManifest(windows.launcherPath)),
    marker: fileFact(windows.markerPath, expectedMarker('win32')),
    registry32: Object.freeze({ status: 'value', type: 'REG_SZ', value: windows.manifestPath }),
    registry64: Object.freeze({ status: 'absent' }),
  };
  const windowsClassifications = [
    [{ ...windowsExactInput, registry64: Object.freeze({ status: 'value', type: 'REG_SZ', value: windows.manifestPath }) }, 'mismatched'],
    [{ ...windowsExactInput, registry64: Object.freeze({ status: 'value', type: 'REG_SZ', value: 'C:\\foreign.json' }) }, 'mismatched'],
    [{ ...windowsExactInput, registry64: Object.freeze({ status: 'unavailable' }) }, 'exact'],
    [{ ...windowsExactInput, registry32: Object.freeze({ status: 'unavailable' }) }, 'unavailable'],
    [{ ...windowsExactInput, registry32: Object.freeze({ status: 'value', type: 'REG_BINARY', value: windows.manifestPath }) }, 'invalid'],
    [{ ...windowsExactInput, registry32: Object.freeze({ status: 'value', type: 'REG_SZ', value: 'C:\\foreign.json' }) }, 'mismatched'],
  ];
  for (const [input, expectedState] of windowsClassifications) {
    equal(
      registration.inspectNativeHostRegistration(input).state,
      expectedState,
      `Windows registry view matrix classifies ${expectedState}`,
    );
  }
  equal(
    registration.inspectNativeHostRegistration({
      ...windowsExactInput,
      manifest: Object.freeze({ status: 'absent' }),
      marker: Object.freeze({ status: 'absent' }),
      registry32: Object.freeze({ status: 'absent' }),
    }).state,
    'absent',
    'Windows absent marker, manifest, and both views classify absent',
  );

  for (const table of layouts) {
    const layout = platform.resolveNativeHostPlatformLayout(table.input);
    const manifest = expectedManifest(layout.launcherPath);
    const harness = fakePlatformDependencies({
      manifestFacts: [[layout.manifestPath, fileFact(layout.manifestPath, manifest)]],
      registryFacts: table.platform === 'win32'
        ? [
          ['user/32', Object.freeze({ status: 'value', type: 'REG_SZ', value: layout.manifestPath })],
          ['user/64', Object.freeze({ status: 'absent' })],
        ]
        : [],
    });
    const adapter = platform.createNativeHostPlatformAdapter(layout, harness.dependencies);
    const facts = await adapter.readRegistrationFacts();
    const readTrace = [...harness.trace];
    equal(facts.manifest.status, 'file', `${table.platform} adapter returns structured manifest facts`);
    check(
      readTrace.every((entry) => entry.startsWith('file:read:') || entry.startsWith('registry:read:')),
      `${table.platform} read-only adapter inspection performs zero mutation`,
    );
    if (table.platform === 'win32') {
      deepEqual(
        readTrace.filter((entry) => entry.startsWith('registry:read:')).map((entry) => entry.split(':')[2]),
        ['user/32', 'user/64'],
        'Windows adapter reads the canonical 32-bit view before the 64-bit shadow view',
      );
    } else {
      equal(
        readTrace.filter((entry) => entry.startsWith('registry:')).length,
        0,
        `${table.platform} adapter has no registry analog`,
      );
    }

    await adapter.publishRegistration(`${JSON.stringify(manifest)}\n`);
    await adapter.removeCanonicalRegistration();
    if (table.platform === 'win32') {
      check(
        harness.trace.some((entry) => entry.startsWith('registry:write:user/32:')),
        'Windows publishes only the canonical user/32 default REG_SZ',
      );
      check(
        harness.trace.some((entry) => entry.startsWith('registry:delete:user/32:')),
        'Windows deletes only the canonical user/32 default value',
      );
      check(
        harness.trace.every((entry) => !entry.startsWith('registry:write:user/64:') && !entry.startsWith('registry:delete:user/64:')),
        'Windows never mutates the user/64 shadow view',
      );
    } else {
      check(
        harness.trace.some((entry) => entry === `file:write:${layout.manifestPath}:600`),
        `${table.platform} publishes only the exact 0600 Chrome manifest`,
      );
      check(
        harness.trace.includes(`file:delete:${layout.manifestPath}`),
        `${table.platform} removes only the exact Chrome manifest`,
      );
    }
  }

  const source = [
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-registration.ts'), 'utf8'),
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/types.ts'), 'utf8'),
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/platform.ts'), 'utf8'),
  ].join('\n').toLowerCase();
  for (const forbidden of [
    'hkey_local_machine',
    'hklm',
    'microsoft\\edge',
    'bravesoftware',
    'chromium/native',
    'user data/default',
    'profile 1',
    'execsync',
    'shell: true',
  ]) {
    check(!source.includes(forbidden), `installer boundary excludes forbidden scope/authority token ${forbidden}`);
  }
  check(source.includes("'user/32'"), 'typed installer boundary names the canonical Windows view');
  check(source.includes("'user/64'"), 'typed installer boundary names the Windows shadow view');
}

async function runRuntimeTransaction() {
  const runtime = await importBuild('native-host-install/runtime.js');
  const runtimeLayout = await importBuild('native-host/runtime-layout.js');

  for (const platformName of ['darwin', 'linux']) {
    const layout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput(platformName));
    const harness = fakeRuntimeDependencies(layout);
    const result = await runtime.publishNativeHostRuntime(layout, harness.dependencies);
    equal(result.status, 'published', `${platformName} exact runtime publishes from one tokened stage`);
    equal(result.reason, 'published', `${platformName} runtime success uses a stable content-free reason`);
    equal(result.receipt.stableRoot, layout.stableRoot, `${platformName} receipt names only the stable owned root`);
    equal(result.receipt.launcherPath, layout.launcherPath, `${platformName} receipt keeps the stable launcher path`);
    equal(result.receipt.tarballIntegrity, TARBALL_SHA512, `${platformName} receipt records the verified tarball SHA-512`);
    equal(result.receipt.artifactSha256, BUILD_ENTRY_SHA256, `${platformName} POSIX launcher binds the installed build entry checksum`);
    check(Object.isFrozen(result), `${platformName} publication result is immutable`);
    check(Object.isFrozen(result.receipt), `${platformName} runtime receipt is immutable`);

    const packInvocation = result.trace.pack;
    equal(packInvocation.executable, layout.nodePath, `${platformName} pack uses the exact absolute Node executable`);
    deepEqual(packInvocation.argv.slice(0, 3), [layout.npmCliPath, 'pack', '.'], `${platformName} packs only the invoking package root`);
    equal(packInvocation.cwd, layout.invokingPackageRoot, `${platformName} pack cwd is the exact invoking package`);
    equal(packInvocation.shell, false, `${platformName} pack never uses a shell`);
    equal(packInvocation.maxOutputBytes, MAX_PROCESS_OUTPUT_BYTES, `${platformName} pack output is bounded`);

    const installInvocation = result.trace.install;
    equal(installInvocation.executable, layout.nodePath, `${platformName} offline install uses the exact absolute Node`);
    equal(installInvocation.cwd, layout.install.cwd, `${platformName} install is isolated to the staged materializer prefix`);
    equal(installInvocation.shell, false, `${platformName} offline install never uses a shell`);
    equal(installInvocation.maxOutputBytes, MAX_PROCESS_OUTPUT_BYTES, `${platformName} install output is bounded`);
    for (const required of [
      '--offline',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      '--registry',
    ]) {
      check(installInvocation.argv.includes(required), `${platformName} offline install pins ${required}`);
    }
    equal(installInvocation.argv.at(-1), layout.tarballPath, `${platformName} installs only the absolute staged tarball`);
    equal(installInvocation.environment.npm_config_offline, 'true', `${platformName} environment forces npm offline mode`);
    equal(installInvocation.environment.NO_PROXY, '', `${platformName} environment disables proxy bypass`);
    check(
      installInvocation.environment.HTTP_PROXY.startsWith('http://127.0.0.1:'),
      `${platformName} HTTP proxy is poisoned with an unreachable loopback sentinel`,
    );
    check(
      installInvocation.environment.HTTPS_PROXY.startsWith('http://127.0.0.1:'),
      `${platformName} HTTPS proxy is poisoned with an unreachable loopback sentinel`,
    );
    check(!harness.sourceAvailable(), `${platformName} stable runtime survives invoking source removal`);
    check(!harness.originalCacheAvailable(), `${platformName} stable runtime survives original cache removal`);
    check(harness.launcherReachable(), `${platformName} launcher remains reachable after atomic publication`);

    const stageIndex = harness.trace.indexOf(`mkdir-exclusive:${layout.stageRoot}:700`);
    const packIndex = harness.trace.indexOf('process:pack');
    const installIndex = harness.trace.indexOf('process:install');
    const validationIndex = harness.trace.indexOf(`snapshot:${harness.materializedPackageRoot}`);
    const markerIndex = harness.trace.indexOf(`write:${platformPath(platformName).join(layout.stageRoot, 'owner.json')}:600`);
    const renameIndex = harness.trace.indexOf(`rename:${layout.stageRoot}:${layout.stableRoot}`);
    check(stageIndex >= 0 && stageIndex < packIndex, `${platformName} creates the tokened stage before package materialization`);
    check(packIndex < installIndex, `${platformName} completes exact pack before offline install`);
    check(installIndex < validationIndex, `${platformName} validates the materialized package only after install`);
    check(validationIndex < markerIndex, `${platformName} validates package closure before writing the owner marker`);
    check(markerIndex < renameIndex, `${platformName} writes and syncs ownership before atomic rename`);
    equal(renameIndex, harness.trace.length - 1, `${platformName} atomic rename is the final runtime mutation`);
    check(
      harness.trace.includes(`restrict:${harness.stagedPackageRoot}:700:600`),
      `${platformName} restricts only the owned staged package tree`,
    );
    check(
      harness.trace.includes(`write:${platformPath(platformName).join(layout.stageRoot, ...layout.launcherRelativePath.split('/'))}:700`),
      `${platformName} writes the absolute-Node launcher with mode 0700`,
    );
    check(
      harness.trace.every((entry) => !entry.includes('NativeMessagingHosts')),
      `${platformName} runtime publisher has no registration mutation authority`,
    );
    equal(
      harness.trace.filter((entry) => entry.startsWith('process:')).length,
      2,
      `${platformName} has no online retry or package-manager fallback`,
    );
  }

  const windowsLayout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput('win32'));
  const windowsHarness = fakeRuntimeDependencies(windowsLayout);
  const windowsResult = await runtime.publishNativeHostRuntime(
    windowsLayout,
    windowsHarness.dependencies,
    { architecture: 'x64' },
  );
  equal(windowsResult.status, 'published', 'Windows selects and publishes one version-bound PE artifact');
  equal(windowsResult.receipt.artifactSha256, ARTIFACT_SHA256, 'Windows receipt binds the selected PE checksum');
  check(
    windowsHarness.trace.some((entry) => entry.includes('native-host\\bin\\win32-x64\\fsb-native-host.exe')),
    'Windows copies only the x64 artifact for an x64 install',
  );
  check(
    windowsHarness.trace.some((entry) => entry === `write:${windowsLayout.bootstrapConfigPath.replace(windowsLayout.stableRoot, windowsLayout.stageRoot)}:600`),
    'Windows writes one bounded sibling bootstrap config with private mode',
  );
  check(
    windowsHarness.trace.every((entry) => !entry.includes('win32-arm64') || entry.startsWith('snapshot:')),
    'Windows never publishes the unselected arm64 executable',
  );

  for (const architecture of ['ia32', 'universal', '../x64']) {
    const harness = fakeRuntimeDependencies(windowsLayout);
    const result = await runtime.publishNativeHostRuntime(
      windowsLayout,
      harness.dependencies,
      { architecture },
    );
    equal(result.status, 'refused', 'unsupported Windows architecture is refused');
    equal(result.reason, 'unsupported-architecture', 'architecture refusal is stable and content-free');
    equal(harness.trace.length, 0, 'unsupported Windows architecture causes zero filesystem/process mutation');
  }

  const sourceMismatchCases = [
    { packageName: 'foreign-package' },
    { packageVersion: '9.9.9' },
    { dependencies: { ws: '8.19.0' } },
    { bundleDependencies: ['ws'] },
    { integrityReceipt: { ...readRuntimeContract().integrity, lockSha256: '0'.repeat(64) } },
    {
      productionPackages: readRuntimeContract().integrity.productionPackages.slice(1).map((entry) => ({
        ...entry,
        dev: false,
      })),
    },
    { buildEntry: { status: 'symlink' } },
    { posixLauncherTemplate: { status: 'file', contents: '#!/bin/sh\n' } },
  ];
  for (const sourceSnapshotOverrides of sourceMismatchCases) {
    const layout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput('linux'));
    const harness = fakeRuntimeDependencies(layout, { sourceSnapshotOverrides });
    const result = await runtime.publishNativeHostRuntime(layout, harness.dependencies);
    equal(result.status, 'refused', 'invalid source package contract is refused before staging');
    equal(result.reason, 'invalid-source-package', 'source package refusal does not expose package content');
    check(
      harness.trace.every((entry) => !entry.startsWith('mkdir') && !entry.startsWith('process:')),
      'invalid source package causes zero staging or process execution',
    );
  }

  const installedMismatchCases = [
    { packageName: 'foreign-package' },
    { packageVersion: '9.9.9' },
    { bundleDependencies: ['ws'] },
    {
      productionPackages: readRuntimeContract().integrity.productionPackages.slice(0, -1).map((entry) => ({
        ...entry,
        dev: false,
      })),
    },
    {
      productionPackages: readRuntimeContract().integrity.productionPackages.map((entry, index) => ({
        ...entry,
        dev: index === 0,
      })),
    },
    { buildEntry: { status: 'symlink' } },
  ];
  for (const installedSnapshotOverrides of installedMismatchCases) {
    const layout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput('darwin'));
    const harness = fakeRuntimeDependencies(layout, { installedSnapshotOverrides });
    const result = await runtime.publishNativeHostRuntime(layout, harness.dependencies);
    equal(result.status, 'refused', 'missing, extra, dev, or altered materialized package is refused');
    equal(result.reason, 'invalid-materialized-package', 'materialized package refusal is stable and content-free');
    check(harness.trace.includes(`cleanup:${layout.stageRoot}`), 'invalid materialization removes only its tokened stage');
    check(!harness.trace.some((entry) => entry.startsWith('rename:')), 'invalid materialization never publishes the stage');
    check(harness.priorRuntimeUntouched(), 'invalid materialization leaves any prior runtime untouched');
  }

  const processFailures = [
    [{ packStatus: 1, packStderr: 'secret-pack-error' }, 'pack-failed'],
    [{ packNetworkRequests: 1 }, 'network-attempted'],
    [{ packStdout: 'x'.repeat(MAX_PROCESS_OUTPUT_BYTES + 1) }, 'process-output-exceeded'],
    [{ installStatus: 1, installStderr: 'secret-install-error' }, 'install-failed'],
    [{ installNetworkRequests: 1 }, 'network-attempted'],
    [{ installStderr: 'x'.repeat(MAX_PROCESS_OUTPUT_BYTES + 1) }, 'process-output-exceeded'],
  ];
  for (const [options, expectedReason] of processFailures) {
    const layout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput('linux'));
    const harness = fakeRuntimeDependencies(layout, options);
    const result = await runtime.publishNativeHostRuntime(layout, harness.dependencies);
    equal(result.status, 'refused', 'package-manager failure returns a refusal');
    equal(result.reason, expectedReason, 'package-manager refusal collapses to a stable content-free reason');
    check(!JSON.stringify(result).includes('secret-'), 'package-manager output is never forwarded or serialized');
    check(harness.trace.includes(`cleanup:${layout.stageRoot}`), 'package-manager failure removes only its tokened stage');
    check(!harness.trace.some((entry) => entry.startsWith('rename:')), 'package-manager failure cannot publish runtime');
  }

  for (const failAtFactory of [
    (layout) => `move:${platformPath(layout.platform).join(layout.install.cwd, 'node_modules', 'fsb-mcp-server')}:${platformPath(layout.platform).join(layout.stageRoot, 'runtime', 'package')}`,
    (layout) => `write:${platformPath(layout.platform).join(layout.stageRoot, 'owner.json')}:600`,
    (layout) => `fsync-dir:${layout.stageRoot}`,
    (layout) => `rename:${layout.stageRoot}:${layout.stableRoot}`,
  ]) {
    const layout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput('darwin'));
    const failAt = failAtFactory(layout);
    const harness = fakeRuntimeDependencies(layout, { failAt });
    const result = await runtime.publishNativeHostRuntime(layout, harness.dependencies);
    equal(result.status, 'refused', 'operation-boundary failure is collapsed to a runtime refusal');
    equal(result.reason, 'publication-failed', 'operation-boundary error content never escapes');
    check(harness.trace.includes(`cleanup:${layout.stageRoot}`), 'operation-boundary failure removes the exact stage');
    check(harness.priorRuntimeUntouched(), 'operation-boundary failure leaves prior runtime and registration untouched');
  }

  const occupiedLayout = runtimeLayout.resolveNativeHostRuntimeLayout(runtimeLayoutInput('linux'));
  for (const stableRootFact of [
    { status: 'directory', path: occupiedLayout.stableRoot, realPath: occupiedLayout.stableRoot },
    { status: 'symlink' },
    { status: 'unavailable' },
  ]) {
    const harness = fakeRuntimeDependencies(occupiedLayout, { stableRootFact });
    const result = await runtime.publishNativeHostRuntime(occupiedLayout, harness.dependencies);
    equal(result.status, 'refused', 'publisher never replaces occupied, symlink, or unavailable stable state');
    equal(result.reason, 'stable-root-not-absent', 'occupied stable root uses one stable refusal');
    check(
      harness.trace.every((entry) => !entry.startsWith('mkdir') && !entry.startsWith('process:')),
      'occupied stable root is read-only and mutation-free',
    );
  }

  const source = [
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/runtime.ts'), 'utf8'),
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/types.ts'), 'utf8'),
  ].join('\n').toLowerCase();
  for (const forbidden of [
    'shell: true',
    'execsync',
    'spawnsync',
    'npm install -g',
    '--prefer-online',
    '--force',
    'cp -r',
    'copyfilesync',
    'npx ',
    'nativeMessagingHosts'.toLowerCase(),
  ]) {
    check(!source.includes(forbidden), `runtime publisher excludes unsafe fallback or registration token ${forbidden}`);
  }
}

function transactionMutations(trace) {
  return trace.filter((entry) => (
    entry.startsWith('file:write:')
    || entry.startsWith('file:delete:')
    || entry.startsWith('registry:write:')
    || entry.startsWith('registry:delete:')
    || entry.startsWith('registry:key-delete:')
    || entry === 'runtime:publish'
    || entry === 'runtime:remove'
  ));
}

async function runInstallTransaction() {
  const installer = await importBuild('native-host-install/index.js');
  const platform = await importBuild('native-host-install/platform.js');
  const runtimeLayout = await importBuild('native-host/runtime-layout.js');

  function layouts(platformName) {
    const input = runtimeLayoutInput(platformName);
    return {
      platformLayout: platform.resolveNativeHostPlatformLayout({
        platform: platformName,
        homeDirectory: input.homeDirectory,
        localAppData: input.localAppData,
      }),
      runtimeLayout: runtimeLayout.resolveNativeHostRuntimeLayout(input),
    };
  }

  for (const platformName of ['darwin', 'linux', 'win32']) {
    const resolved = layouts(platformName);
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
    );
    const installed = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(installed.status, 'installed', `${platformName} absent exact state installs`);
    equal(installed.reason, 'installed', `${platformName} install result is stable and content-free`);
    equal(installed.location, resolved.platformLayout.manifestPath, `${platformName} result names the bounded expected location`);
    equal(installed.origin, ORIGIN, `${platformName} result records the sole exact origin`);
    equal(installed.packageVersion, PACKAGE_VERSION, `${platformName} result records the installed package version`);
    equal(harness.runtimeState(), 'exact', `${platformName} runtime is exact after install`);
    equal(harness.publishCount(), 1, `${platformName} runtime is materialized exactly once`);

    const runtimePublish = harness.trace.indexOf('runtime:publish');
    const runtimeRecheck = harness.trace.indexOf('runtime:recheck-publication');
    const registrationWrite = harness.trace.findIndex((entry) => (
      platformName === 'win32'
        ? entry.startsWith('registry:write:user/32:')
        : entry.startsWith(`file:write:${resolved.platformLayout.manifestPath}:`)
    ));
    check(runtimePublish >= 0 && runtimePublish < runtimeRecheck, `${platformName} validates runtime before publication recheck`);
    check(runtimeRecheck < registrationWrite, `${platformName} publishes Chrome registration last`);
    if (platformName === 'win32') {
      const manifestWrite = harness.trace.findIndex((entry) => (
        entry === `file:write:${resolved.platformLayout.manifestPath}:600`
      ));
      check(manifestWrite < registrationWrite, 'Windows writes the exact manifest before canonical HKCU publication');
      check(
        harness.trace.every((entry) => !entry.startsWith('registry:write:user/64:')),
        'Windows install never mutates the 64-bit shadow view',
      );
    }

    const mutationCount = transactionMutations(harness.trace).length;
    const already = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(already.status, 'already-installed', `${platformName} exact current state is idempotent`);
    equal(already.reason, 'exact', `${platformName} idempotent result reports exact state`);
    equal(transactionMutations(harness.trace).length, mutationCount, `${platformName} repeat install performs zero writes or deletes`);
    equal(harness.publishCount(), 1, `${platformName} repeat install never rematerializes runtime`);
  }

  {
    const resolved = layouts('linux');
    let releasePublish;
    const publishGate = new Promise((resolve) => { releasePublish = resolve; });
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      { publishGate },
    );
    const first = installer.installNativeHost({ extensionId: EXTENSION_ID }, harness.dependencies);
    await new Promise((resolve) => setImmediate(resolve));
    const second = installer.installNativeHost({ extensionId: EXTENSION_ID }, harness.dependencies);
    await new Promise((resolve) => setImmediate(resolve));
    equal(
      harness.trace.filter((entry) => entry === 'runtime:inspect').length,
      1,
      'same-root concurrent install waits behind the active transaction before inspection',
    );
    releasePublish();
    const results = await Promise.all([first, second]);
    deepEqual(
      results.map((result) => result.status),
      ['installed', 'already-installed'],
      'same-root concurrent calls serialize to one install and one idempotent receipt',
    );
    equal(harness.publishCount(), 1, 'same-root serialization publishes one runtime');
    equal(harness.maximumActivePublishers(), 1, 'same-root serialization never overlaps runtime publishers');
  }

  for (const platformName of ['darwin', 'linux', 'win32']) {
    const resolved = layouts(platformName);
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        runtimeVersion: '0.9.0',
        registrationState: 'exact',
      },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', `${platformName} exact older install is not an implicit upgrade`);
    equal(result.reason, 'version-mismatch', `${platformName} old-version refusal is stable`);
    equal(transactionMutations(harness.trace).length, 0, `${platformName} old-version install refusal performs zero mutation`);
  }

  const refusalMatrix = [
    { runtimeState: 'absent', registrationState: 'exact', reason: 'split-state' },
    { runtimeState: 'exact', registrationState: 'absent', reason: 'split-state' },
    { runtimeState: 'foreign', registrationState: 'foreign', reason: 'foreign-state' },
    { runtimeState: 'invalid', registrationState: 'exact', reason: 'invalid-state' },
    { runtimeState: 'unavailable', registrationState: 'unavailable', reason: 'unavailable' },
  ];
  for (const fixture of refusalMatrix) {
    const resolved = layouts('linux');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      fixture,
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'split, foreign, invalid, or unavailable install state is refused');
    equal(result.reason, fixture.reason, 'install refusal uses a stable ownership reason');
    equal(transactionMutations(harness.trace).length, 0, 'install ownership refusal performs zero writes or deletes');
  }

  {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      { runtimeState: 'exact', registrationState: 'shadow' },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'Windows 64-bit shadow blocks install');
    equal(result.reason, 'registry-shadow', 'Windows shadow refusal is explicit and content-free');
    equal(transactionMutations(harness.trace).length, 0, 'Windows shadow refusal performs zero mutation in either view');
  }

  for (const invalidExtensionId of ['', 'a'.repeat(31), 'q'.repeat(32), '../profile']) {
    const resolved = layouts('darwin');
    const harness = fakeInstallTransaction(platform, resolved.platformLayout, resolved.runtimeLayout);
    const result = await installer.installNativeHost(
      { extensionId: invalidExtensionId },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'malformed install extension id is refused');
    equal(result.reason, 'invalid-request', 'malformed extension id has one stable refusal');
    equal(harness.trace.length, 0, 'malformed extension id causes zero inspection or mutation');
  }

  {
    const resolved = layouts('linux');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        publishResult: { status: 'refused', reason: 'pack-failed', receipt: null },
      },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'runtime publication refusal blocks registration');
    equal(result.reason, 'pack-failed', 'runtime refusal reason remains stable');
    check(
      harness.trace.every((entry) => !entry.startsWith('file:write:') && !entry.startsWith('registry:write:')),
      'runtime publication refusal performs zero registration write',
    );
  }

  {
    const resolved = layouts('darwin');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      { publicationBoundaryExact: false },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'changed parent/runtime boundary blocks registration publication');
    equal(result.reason, 'boundary-changed', 'publication recheck failure is stable');
    check(harness.trace.includes('runtime:remove'), 'boundary-change rollback removes only the just-published exact runtime');
    check(
      harness.trace.every((entry) => !entry.startsWith('file:write:')),
      'boundary-change rollback happens before registration publication',
    );
  }

  for (const platformName of ['darwin', 'win32']) {
    const resolved = layouts(platformName);
    const failAt = platformName === 'win32'
      ? `registry:write:user/32:${resolved.platformLayout.registration.key}:REG_SZ`
      : `file:write:${resolved.platformLayout.manifestPath}:600`;
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      { failAt },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', `${platformName} registration publication failure is contained`);
    equal(result.reason, 'registration-publish-failed', `${platformName} registration error content is collapsed`);
    check(harness.trace.includes('runtime:remove'), `${platformName} publication failure rolls back the exact new runtime`);
    equal(harness.runtimeState(), 'absent', `${platformName} publication failure leaves no runtime split`);
    check(!harness.manifestFacts.has(resolved.platformLayout.manifestPath), `${platformName} publication failure leaves no owned manifest`);
    check(!harness.registryFacts.has('user/32'), `${platformName} publication failure leaves no canonical registry value`);
    check(!JSON.stringify(result).includes('sensitive:'), `${platformName} publication failure never exposes raw error content`);
  }

  for (const platformName of ['darwin', 'linux', 'win32']) {
    const resolved = layouts(platformName);
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      { runtimeState: 'exact', registrationState: 'exact' },
    );
    const removed = await installer.uninstallNativeHost(harness.dependencies);
    equal(removed.status, 'removed', `${platformName} exact current owned install uninstalls`);
    equal(removed.reason, 'removed', `${platformName} uninstall result is stable`);
    equal(removed.origin, ORIGIN, `${platformName} uninstall receipt retains the exact removed origin`);
    equal(removed.packageVersion, PACKAGE_VERSION, `${platformName} uninstall receipt retains the removed version`);
    const registrationDelete = harness.trace.findIndex((entry) => (
      platformName === 'win32'
        ? entry.startsWith('registry:delete:user/32:')
        : entry === `file:delete:${resolved.platformLayout.manifestPath}`
    ));
    const runtimeDelete = harness.trace.indexOf('runtime:remove');
    check(registrationDelete >= 0 && registrationDelete < runtimeDelete, `${platformName} uninstall removes registration before runtime`);
    check(harness.manifestFacts.has(harness.adjacentPath), `${platformName} uninstall preserves adjacent user/host files`);
    equal(harness.runtimeState(), 'absent', `${platformName} uninstall removes only the exact owned runtime`);
    if (platformName === 'win32') {
      const keyDelete = harness.trace.findIndex((entry) => entry.startsWith('registry:key-delete:user/32:'));
      check(registrationDelete < keyDelete && keyDelete < runtimeDelete, 'Windows removes only the proved-empty exact host subkey before runtime');
      check(
        harness.trace.every((entry) => !entry.startsWith('registry:delete:user/64:') && !entry.startsWith('registry:key-delete:user/64:')),
        'Windows uninstall never mutates the 64-bit shadow view',
      );
    }

    const repeatMutationCount = transactionMutations(harness.trace).length;
    const repeated = await installer.uninstallNativeHost(harness.dependencies);
    equal(repeated.status, 'not-installed', `${platformName} repeat uninstall is idempotent`);
    equal(repeated.reason, 'absent', `${platformName} absent uninstall result is stable`);
    equal(transactionMutations(harness.trace).length, repeatMutationCount, `${platformName} repeat uninstall performs zero deletes`);
  }

  for (const platformName of ['darwin', 'linux', 'win32']) {
    const resolved = layouts(platformName);
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        runtimeVersion: '0.8.7',
        registrationState: 'exact',
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'removed', `${platformName} internally consistent older owned runtime remains removable`);
    equal(result.packageVersion, '0.8.7', `${platformName} older uninstall reports the installed version, not invoking version`);
    equal(harness.runtimeState(), 'absent', `${platformName} older exact runtime is removed safely`);
  }

  const uninstallRefusals = [
    { runtimeState: 'absent', registrationState: 'exact', reason: 'split-state' },
    { runtimeState: 'exact', registrationState: 'absent', reason: 'split-state' },
    { runtimeState: 'foreign', registrationState: 'foreign', reason: 'foreign-state' },
    { runtimeState: 'invalid', registrationState: 'exact', reason: 'invalid-state' },
    { runtimeState: 'unavailable', registrationState: 'unavailable', reason: 'unavailable' },
  ];
  for (const fixture of uninstallRefusals) {
    const resolved = layouts('linux');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      fixture,
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'uninstall refuses split, foreign, symlink, or unavailable ownership');
    equal(result.reason, fixture.reason, 'uninstall ownership refusal is stable');
    equal(transactionMutations(harness.trace).length, 0, 'uninstall ownership refusal performs zero deletes');
  }

  {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      { runtimeState: 'exact', registrationState: 'shadow' },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'Windows shadow blocks uninstall without deleting either view');
    equal(result.reason, 'registry-shadow', 'Windows shadow uninstall refusal is stable');
    equal(transactionMutations(harness.trace).length, 0, 'Windows shadow uninstall refusal performs zero deletes');
  }

  {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        registrationState: 'exact',
        keyFact: { status: 'nonempty' },
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'Windows extra value/subkey blocks uninstall before canonical deletion');
    equal(result.reason, 'registry-key-not-exact', 'Windows nonempty subkey refusal is stable');
    equal(transactionMutations(harness.trace).length, 0, 'Windows nonempty key causes zero deletion');
  }

  {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        registrationState: 'exact',
        keyFacts: [{ status: 'exact-default-only' }, { status: 'nonempty' }],
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'Windows key change after default deletion stops broad cleanup');
    equal(result.reason, 'registry-key-cleanup-failed', 'Windows changed-key refusal is stable');
    check(
      harness.trace.every((entry) => !entry.startsWith('registry:key-delete:')),
      'Windows changed key is never deleted',
    );
    check(!harness.trace.includes('runtime:remove'), 'Windows changed key preserves runtime for doctor evidence');
  }

  {
    const resolved = layouts('darwin');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        registrationState: 'exact',
        runtimeBoundaryExact: false,
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'runtime ownership change blocks uninstall before registration removal');
    equal(result.reason, 'boundary-changed', 'uninstall recheck failure is stable');
    equal(transactionMutations(harness.trace).length, 0, 'uninstall recheck failure performs zero deletion');
  }

  for (const fixture of [
    { failAtFactory: (layout) => `file:delete:${layout.manifestPath}`, reason: 'registration-remove-failed', runtimeRemoved: false },
    { failAtFactory: () => 'runtime:remove', reason: 'runtime-remove-failed', runtimeRemoved: false },
  ]) {
    const resolved = layouts('linux');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        registrationState: 'exact',
        failAt: fixture.failAtFactory(resolved.platformLayout),
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'uninstall operation failure is contained');
    equal(result.reason, fixture.reason, 'uninstall operation failure is content-free');
    equal(harness.runtimeState(), 'exact', 'failed uninstall never broad-deletes the runtime');
    check(!JSON.stringify(result).includes('sensitive:'), 'uninstall never serializes raw adapter errors');
  }

  const source = [
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/index.ts'), 'utf8'),
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/types.ts'), 'utf8'),
  ].join('\n').toLowerCase();
  for (const forbidden of [
    'hkey_local_machine',
    'hklm',
    'microsoft\\edge',
    'bravesoftware',
    'profile 1',
    'rm -rf',
    'rmsync',
    'recursive: true',
    'shell: true',
    'implicit repair',
    'implicit upgrade',
  ]) {
    check(!source.includes(forbidden), `closed install transaction excludes broad or implicit authority token ${forbidden}`);
  }
}

async function runCliRouting() {
  const cli = await importBuild('install.js');
  const platforms = await importBuild('platforms.js');
  const calls = [];
  const operations = Object.freeze({
    install: async (request) => {
      calls.push(Object.freeze({ operation: 'install', request: { ...request } }));
      const extensionId = request.extensionId || EXTENSION_ID;
      return Object.freeze({
        status: 'installed',
        reason: 'installed',
        location: '/home/fsb/.config/google-chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json',
        origin: `chrome-extension://${extensionId}/`,
        packageVersion: PACKAGE_VERSION,
      });
    },
    uninstall: async () => {
      calls.push(Object.freeze({ operation: 'uninstall' }));
      return Object.freeze({
        status: 'removed',
        reason: 'removed',
        location: '/home/fsb/.config/google-chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json',
        origin: ORIGIN,
        packageVersion: PACKAGE_VERSION,
      });
    },
  });

  await captureCliAction(() => cli.runInstall({ 'native-host': true }, operations));
  equal(calls.length, 1, 'exact native install calls the injected install operation once');
  deepEqual(calls[0], { operation: 'install', request: {} }, 'default native install passes no extension override');

  await captureCliAction(() => cli.runInstall({
    'native-host': true,
    'extension-id': DEVELOPMENT_EXTENSION_ID,
  }, operations));
  equal(calls.length, 2, 'development native install calls the injected install operation once');
  deepEqual(
    calls[1],
    { operation: 'install', request: { extensionId: DEVELOPMENT_EXTENSION_ID } },
    'development native install passes only the validated exact extension id',
  );

  await captureCliAction(() => cli.runUninstall({ 'native-host': true }, operations));
  equal(calls.length, 3, 'exact native uninstall calls the injected uninstall operation once');
  deepEqual(calls[2], { operation: 'uninstall' }, 'native uninstall passes no extra authority');

  const invalidInstallFlags = [
    { 'native-host': false },
    { 'native-host': 'true' },
    { 'native-host': [] },
    { 'native-host': true, 'extension-id': true },
    { 'native-host': true, 'extension-id': [DEVELOPMENT_EXTENSION_ID] },
    { 'native-host': true, 'extension-id': 'abcdefghijklmnop' },
    { 'native-host': true, 'extension-id': `${DEVELOPMENT_EXTENSION_ID}a` },
    { 'native-host': true, 'extension-id': DEVELOPMENT_EXTENSION_ID.toUpperCase() },
    { 'native-host': true, all: true },
    { 'native-host': true, list: true },
    { 'native-host': true, 'dry-run': true },
    { 'native-host': true, unknown: true },
  ];
  for (const flags of invalidInstallFlags) {
    const before = calls.length;
    const result = await captureCliAction(() => cli.runInstall(flags, operations));
    equal(result.exitCode, 1, 'invalid native install syntax exits nonzero');
    equal(calls.length, before, 'invalid native install syntax performs zero native mutation');
    check(
      result.stderr.includes('fsb-mcp-server install --native-host'),
      'invalid native install prints stable native usage',
    );
  }

  const invalidUninstallFlags = [
    { 'native-host': false },
    { 'native-host': 'true' },
    { 'native-host': [] },
    { 'native-host': true, 'extension-id': DEVELOPMENT_EXTENSION_ID },
    { 'native-host': true, all: true },
    { 'native-host': true, list: true },
    { 'native-host': true, 'dry-run': true },
    { 'native-host': true, unknown: true },
  ];
  for (const flags of invalidUninstallFlags) {
    const before = calls.length;
    const result = await captureCliAction(() => cli.runUninstall(flags, operations));
    equal(result.exitCode, 1, 'invalid native uninstall syntax exits nonzero');
    equal(calls.length, before, 'invalid native uninstall syntax performs zero native mutation');
    check(
      result.stderr.includes('fsb-mcp-server uninstall --native-host'),
      'invalid native uninstall prints stable native usage',
    );
  }

  for (const key of Object.keys(platforms.PLATFORMS)) {
    const before = calls.length;
    await captureCliAction(() => cli.runInstall({ [key]: true, 'dry-run': true }, operations));
    await captureCliAction(() => cli.runUninstall({ [key]: true, 'dry-run': true }, operations));
    equal(calls.length, before, `${key} legacy install/uninstall never calls native operations`);

    const mixedInstall = await captureCliAction(() => cli.runInstall({
      'native-host': true,
      [key]: true,
    }, operations));
    const mixedUninstall = await captureCliAction(() => cli.runUninstall({
      'native-host': true,
      [key]: true,
    }, operations));
    equal(mixedInstall.exitCode, 1, `${key} mixed native install is rejected`);
    equal(mixedUninstall.exitCode, 1, `${key} mixed native uninstall is rejected`);
    equal(calls.length, before, `${key} mixed native/client syntax performs zero native mutation`);
  }

  const beforeOrdinary = calls.length;
  await captureCliAction(() => cli.runInstall({}, operations));
  await captureCliAction(() => cli.runUninstall({}, operations));
  await captureCliAction(() => cli.runInstall({ list: true }, operations));
  await captureCliAction(() => cli.runInstall({ all: true, 'dry-run': true }, operations));
  await captureCliAction(() => cli.runUninstall({ all: true, 'dry-run': true }, operations));
  equal(calls.length, beforeOrdinary, 'ordinary/list/all routes never call native operations');
  equal(Object.keys(platforms.PLATFORMS).length, 21, 'native host does not change the 21-client platform registry');
}

async function runCliOutput() {
  const cli = await importBuild('install.js');
  const location = '/home/fsb/.config/google-chrome/NativeMessagingHosts/io.github.fullselfbrowsing.fsb_native_host.json';

  function operationsWith(installResult, uninstallResult = null) {
    return Object.freeze({
      install: async () => Object.freeze(installResult),
      uninstall: async () => Object.freeze(uninstallResult || installResult),
    });
  }

  const installed = await captureCliAction(() => cli.runInstall(
    { 'native-host': true },
    operationsWith({
      status: 'installed',
      reason: 'installed',
      location,
      origin: ORIGIN,
      packageVersion: PACKAGE_VERSION,
    }),
  ));
  equal(installed.exitCode, 0, 'installed native result exits cleanly');
  equal(
    installed.stdout,
    `Native messaging host installed.\nExpected location: ${location}\nAllowed origin: ${ORIGIN}\n`,
    'installed native result prints only factual location and sole origin',
  );
  equal(installed.stderr, '', 'installed native result writes no error output');

  const alreadyInstalled = await captureCliAction(() => cli.runInstall(
    { 'native-host': true },
    operationsWith({
      status: 'already-installed',
      reason: 'exact',
      location,
      origin: ORIGIN,
      packageVersion: PACKAGE_VERSION,
    }),
  ));
  equal(alreadyInstalled.exitCode, 0, 'already-installed native result exits cleanly');
  equal(
    alreadyInstalled.stdout,
    `Native messaging host is already installed.\nExpected location: ${location}\nAllowed origin: ${ORIGIN}\n`,
    'already-installed native result remains factual',
  );

  const removed = await captureCliAction(() => cli.runUninstall(
    { 'native-host': true },
    operationsWith(null, {
      status: 'removed',
      reason: 'removed',
      location,
      origin: ORIGIN,
      packageVersion: PACKAGE_VERSION,
    }),
  ));
  equal(removed.exitCode, 0, 'removed native result exits cleanly');
  equal(
    removed.stdout,
    `Native messaging host removed.\nRemoved: 1\nExpected location: ${location}\n`,
    'removed native result reports one exact host removal and location',
  );

  const notInstalled = await captureCliAction(() => cli.runUninstall(
    { 'native-host': true },
    operationsWith(null, {
      status: 'not-installed',
      reason: 'absent',
      location,
      origin: null,
      packageVersion: null,
    }),
  ));
  equal(notInstalled.exitCode, 0, 'not-installed native result exits cleanly');
  equal(
    notInstalled.stdout,
    `Native messaging host is not installed.\nRemoved: 0\nExpected location: ${location}\n`,
    'not-installed native result reports zero removals and location',
  );

  const stableRefusals = [
    'foreign-state',
    'split-state',
    'invalid-state',
    'registry-shadow',
    'unavailable',
  ];
  for (const reason of stableRefusals) {
    const refused = await captureCliAction(() => cli.runInstall(
      { 'native-host': true },
      operationsWith({
        status: 'refused',
        reason,
        location,
        origin: null,
        packageVersion: null,
      }),
    ));
    equal(refused.exitCode, 1, `${reason} native refusal exits nonzero`);
    equal(refused.stdout, '', `${reason} native refusal emits no optimistic stdout`);
    equal(
      refused.stderr,
      `Native messaging host was not changed: ${reason}\nExpected location: ${location}\nRun fsb-mcp-server doctor for repair details.\n`,
      `${reason} native refusal prints only stable reason, location, and doctor guidance`,
    );
  }

  const sensitive = 'SENSITIVE_USERNAME_ENV_SECRET_CHILD_TASK';
  const taintedResult = await captureCliAction(() => cli.runInstall(
    { 'native-host': true },
    operationsWith({
      status: 'refused',
      reason: sensitive,
      location: `/home/${sensitive}\nmanifest.json`,
      origin: `chrome-extension://${sensitive}/`,
      packageVersion: sensitive,
      manifest: sensitive,
      registryValue: sensitive,
      childOutput: sensitive,
      task: sensitive,
    }),
  ));
  equal(taintedResult.exitCode, 1, 'unknown tainted refusal exits nonzero');
  check(!`${taintedResult.stdout}${taintedResult.stderr}`.includes(sensitive), 'tainted receipt fields never reach terminal output');
  check(taintedResult.stderr.includes('not changed: unavailable'), 'unknown refusal reason collapses to unavailable');
  check(taintedResult.stderr.includes('Expected location: Unavailable'), 'invalid location collapses to bounded unavailable');

  const thrown = await captureCliAction(() => cli.runUninstall(
    { 'native-host': true },
    Object.freeze({
      install: async () => { throw new Error(sensitive); },
      uninstall: async () => { throw new Error(sensitive); },
    }),
  ));
  equal(thrown.exitCode, 1, 'native adapter exception becomes a refusal without throwing');
  check(!`${thrown.stdout}${thrown.stderr}`.includes(sensitive), 'native adapter exception text is never serialized');
  check(thrown.stderr.includes('not changed: unavailable'), 'native adapter exception collapses to unavailable');
  check(thrown.stderr.includes('Run fsb-mcp-server doctor for repair details.'), 'native adapter exception retains exact doctor guidance');

  for (const result of [installed, alreadyInstalled, removed, notInstalled]) {
    const output = `${result.stdout}${result.stderr}`.toLowerCase();
    for (const optimistic of ['paired', 'provider', 'delegation', 'agent started']) {
      check(!output.includes(optimistic), `successful native output never claims ${optimistic}`);
    }
  }

  const indexSource = readFileSync(path.join(repositoryRoot, 'mcp/src/index.ts'), 'utf8');
  const beforeInstallCase = indexSource.slice(0, indexSource.indexOf("case 'install':"));
  check(!/case 'serve':[\s\S]*runInstall\(/u.test(beforeInstallCase), 'serve router never calls installer code');
  check(!/case 'doctor':[\s\S]*runInstall\(/u.test(beforeInstallCase), 'doctor router never calls installer code');
  check(/let command = 'stdio'/u.test(indexSource), 'no-argument startup remains the stdio server route');
}

async function main() {
  if (!requestedSection || requestedSection === 'platform-and-registration') {
    console.log('\n=== Platform and registration ===');
    await runPlatformAndRegistration();
  }
  if (!requestedSection || requestedSection === 'runtime-transaction') {
    console.log('\n=== Runtime transaction ===');
    await runRuntimeTransaction();
  }
  if (!requestedSection || requestedSection === 'install-transaction') {
    console.log('\n=== Install and uninstall transaction ===');
    await runInstallTransaction();
  }
  if (!requestedSection || requestedSection === 'cli-routing') {
    console.log('\n=== Native CLI routing ===');
    await runCliRouting();
  }
  if (!requestedSection || requestedSection === 'cli-output') {
    console.log('\n=== Native CLI output ===');
    await runCliOutput();
  }
  console.log(`\nNative host install tests: ${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
