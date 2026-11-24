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
  'doctor-browser-selection',
  'ensure-transaction',
  'browser-detection',
  'production-ensure',
]);
if (requestedSection && !knownSections.has(requestedSection)) {
  throw new Error(`unknown section: ${requestedSection}`);
}

const HOST_NAME = 'io.github.fullselfbrowsing.fsb_native_host';
const HOST_DESCRIPTION = 'FSB local agent service wake host';
const EXTENSION_ID = 'badgafnfchcihdfnjneklogedcdkmjfk';
const DEVELOPMENT_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${EXTENSION_ID}/`;
const PACKAGE_VERSION = require('../mcp/package.json').version;
const INSTALL_TOKEN = '0123456789abcdef0123456789abcdef';
const ARTIFACT_SHA256 = 'a'.repeat(64);
const REGISTRY_HELPER_SHA256 = 'e'.repeat(64);
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
  const registryReadCounts = new Map();
  function step(entry) {
    trace.push(entry);
    if (options.failAt === entry) throw new Error(`sensitive:${entry}:must-not-leak`);
  }
  function afterStep(entry) {
    if (options.failAfter === entry) throw new Error(`sensitive:${entry}:must-not-leak`);
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
        const count = registryReadCounts.get(view) || 0;
        registryReadCounts.set(view, count + 1);
        const current = registryFacts.get(view) || Object.freeze({ status: 'absent' });
        return typeof options.registryReadFact === 'function'
          ? options.registryReadFact({ view, key, count, current, trace })
          : current;
      },
      writeDefault: async (view, key, value) => {
        const entry = `registry:write:${view}:${key}:${value.type}`;
        step(entry);
        registryFacts.set(view, Object.freeze({ status: 'value', ...value }));
        afterStep(entry);
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
    schema: 2,
    package: manifest.name,
    version: manifest.version,
    artifacts: [
      {
        architecture: 'x64',
        role: 'bootstrap',
        path: 'native-host/bin/win32-x64/fsb-native-host.exe',
        bytes: 8192,
        peMachine: '0x8664',
        sha256: ARTIFACT_SHA256,
        packageVersion: manifest.version,
        roleMarker: 'fsb-native-host-bootstrap-v1',
      },
      {
        architecture: 'x64',
        role: 'registry-helper',
        path: 'native-host/bin/win32-x64/fsb-native-host-registry.exe',
        bytes: 8192,
        peMachine: '0x8664',
        sha256: REGISTRY_HELPER_SHA256,
        packageVersion: manifest.version,
        roleMarker: 'fsb-native-host-registry-helper-v1',
      },
      {
        architecture: 'arm64',
        role: 'bootstrap',
        path: 'native-host/bin/win32-arm64/fsb-native-host.exe',
        bytes: 8192,
        peMachine: '0xaa64',
        sha256: 'c'.repeat(64),
        packageVersion: manifest.version,
        roleMarker: 'fsb-native-host-bootstrap-v1',
      },
      {
        architecture: 'arm64',
        role: 'registry-helper',
        path: 'native-host/bin/win32-arm64/fsb-native-host-registry.exe',
        bytes: 8192,
        peMachine: '0xaa64',
        sha256: 'f'.repeat(64),
        packageVersion: manifest.version,
        roleMarker: 'fsb-native-host-registry-helper-v1',
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
      if (pathname.endsWith('fsb-native-host-registry.exe')) {
        return options.registryHelperHash ?? REGISTRY_HELPER_SHA256;
      }
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
    schema: 2,
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
    registryHelperPath: layout.registryHelperPath,
    registryHelperSha256: layout.platform === 'win32' ? REGISTRY_HELPER_SHA256 : null,
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
    registryFacts.set(
      'user/64',
      Object.freeze(options.registry64Fact || { status: 'absent' }),
    );
  }

  const platformHarness = fakePlatformDependencies({
    trace,
    manifestFacts,
    registryFacts,
    failAt: options.failAt,
    failAfter: options.failAfter,
    registryReadFact: options.registryReadFact,
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
    equal(value.browser, 'chrome', `${table.platform} defaults omitted browser selection to Chrome`);
    equal(value.stableRoot, table.stableRoot, `${table.platform} uses the one stable FSB runtime root`);
    equal(value.manifestPath, table.manifestPath, `${table.platform} resolves the exact Chrome user-scope manifest`);
    equal(value.launcherPath, table.launcherPath, `${table.platform} registers the stable owned launcher`);
    equal(value.registration.kind, table.kind, `${table.platform} uses the required registration kind`);
    check(Object.isFrozen(value), `${table.platform} layout is immutable`);
  }

  const browserLayouts = [
    {
      browser: 'chrome',
      darwin: 'Google/Chrome/NativeMessagingHosts',
      linux: 'google-chrome/NativeMessagingHosts',
      windows: 'Software\\Google\\Chrome\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host',
    },
    {
      browser: 'edge',
      darwin: 'Microsoft Edge/NativeMessagingHosts',
      linux: 'microsoft-edge/NativeMessagingHosts',
      windows: 'Software\\Microsoft\\Edge\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host',
    },
    {
      browser: 'brave',
      darwin: 'BraveSoftware/Brave-Browser/NativeMessagingHosts',
      linux: 'BraveSoftware/Brave-Browser/NativeMessagingHosts',
      windows: 'Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host',
    },
    {
      browser: 'chromium',
      darwin: 'Chromium/NativeMessagingHosts',
      linux: 'chromium/NativeMessagingHosts',
      windows: 'Software\\Chromium\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host',
    },
  ];
  for (const browserLayout of browserLayouts) {
    for (const table of layouts) {
      const value = platform.resolveNativeHostPlatformLayout({
        ...table.input,
        browser: browserLayout.browser,
      });
      equal(value.browser, browserLayout.browser, `${table.platform} retains ${browserLayout.browser} selection`);
      if (table.platform === 'darwin') {
        check(
          value.manifestPath.includes(`/Library/Application Support/${browserLayout.darwin}/`),
          `macOS resolves the exact ${browserLayout.browser} user manifest root`,
        );
      } else if (table.platform === 'linux') {
        check(
          value.manifestPath.includes(`/.config/${browserLayout.linux}/`),
          `Linux resolves the exact ${browserLayout.browser} user manifest root`,
        );
      } else {
        equal(
          value.registration.key,
          browserLayout.windows,
          `Windows resolves the exact ${browserLayout.browser} HKCU registration root`,
        );
      }
      check(Object.isFrozen(value), `${table.platform} ${browserLayout.browser} layout is immutable`);
    }
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
    { platform: 'linux', browser: 'firefox', homeDirectory: '/home/fsb' },
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
    [{ ...windowsExactInput, registry64: Object.freeze({ status: 'unavailable' }) }, 'unavailable'],
    [{ ...windowsExactInput, registry64: undefined }, 'unavailable'],
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
  for (const registry64 of [undefined, Object.freeze({ status: 'unavailable' })]) {
    equal(
      registration.inspectNativeHostRegistration({
        ...windowsExactInput,
        manifest: Object.freeze({ status: 'absent' }),
        marker: Object.freeze({ status: 'absent' }),
        registry32: Object.freeze({ status: 'absent' }),
        registry64,
      }).state,
      'unavailable',
      'Windows absence requires an explicit clear user/64 shadow fact',
    );
  }

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
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/browser.ts'), 'utf8'),
    readFileSync(path.join(repositoryRoot, 'mcp/src/native-host-install/platform.ts'), 'utf8'),
  ].join('\n').toLowerCase();
  for (const forbidden of [
    'hkey_local_machine',
    'hklm',
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
  equal(
    windowsResult.receipt.registryHelperPath,
    windowsLayout.registryHelperPath,
    'Windows receipt binds the stable registry helper path',
  );
  equal(
    windowsResult.receipt.registryHelperSha256,
    REGISTRY_HELPER_SHA256,
    'Windows receipt binds the selected registry helper checksum',
  );
  check(
    windowsHarness.trace.some((entry) => entry.includes('native-host\\bin\\win32-x64\\fsb-native-host.exe')),
    'Windows copies only the x64 artifact for an x64 install',
  );
  check(
    windowsHarness.trace.some((entry) => entry.includes(
      'native-host\\bin\\win32-x64\\fsb-native-host-registry.exe',
    )),
    'Windows copies the exact-architecture registry helper beside the bootstrap',
  );
  check(
    windowsHarness.trace.some((entry) => entry === `write:${windowsLayout.bootstrapConfigPath.replace(windowsLayout.stableRoot, windowsLayout.stageRoot)}:600`),
    'Windows writes one bounded sibling bootstrap config with private mode',
  );
  check(
    windowsHarness.trace.every((entry) => !entry.includes('win32-arm64') || entry.startsWith('snapshot:')),
    'Windows never publishes unselected arm64 executables',
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

  const exactWindowsArtifacts = runtimePackageSnapshot(
    windowsLayout,
    windowsLayout.invokingPackageRoot,
  ).windowsArtifacts;
  const windowsMetadataTamperCases = [
    (value) => { value.schema = 1; },
    (value) => { value.artifacts[1].path = value.artifacts[0].path; },
    (value) => { value.artifacts[1].role = 'bootstrap'; },
    (value) => { value.artifacts[1].peMachine = '0xaa64'; },
    (value) => { value.artifacts[1].packageVersion = '9.9.9'; },
    (value) => { value.artifacts[1].roleMarker = 'fsb-native-host-bootstrap-v1'; },
  ];
  for (const tamper of windowsMetadataTamperCases) {
    const windowsArtifacts = ordinaryClone(exactWindowsArtifacts);
    tamper(windowsArtifacts);
    const harness = fakeRuntimeDependencies(windowsLayout, {
      sourceSnapshotOverrides: { windowsArtifacts },
    });
    const result = await runtime.publishNativeHostRuntime(
      windowsLayout,
      harness.dependencies,
      { architecture: 'x64' },
    );
    equal(result.status, 'refused', 'tampered Windows helper metadata is refused');
    equal(result.reason, 'invalid-source-package', 'helper metadata refusal is content-free');
    check(
      harness.trace.every((entry) => !entry.startsWith('mkdir') && !entry.startsWith('process:')),
      'helper metadata tamper causes zero staging or process execution',
    );
  }

  const helperHashHarness = fakeRuntimeDependencies(windowsLayout, {
    registryHelperHash: '0'.repeat(64),
  });
  const helperHashResult = await runtime.publishNativeHostRuntime(
    windowsLayout,
    helperHashHarness.dependencies,
    { architecture: 'x64' },
  );
  equal(helperHashResult.status, 'refused', 'copied registry helper hash mismatch is refused');
  equal(helperHashResult.reason, 'publication-failed', 'helper hash refusal is content-free');
  check(
    helperHashHarness.trace.every((entry) => !entry.startsWith('rename:')),
    'helper hash mismatch never publishes the stage',
  );

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
  const cli = await importBuild('install.js');
  const platform = await importBuild('native-host-install/platform.js');
  const runtimeLayout = await importBuild('native-host/runtime-layout.js');

  function layouts(platformName, browser = 'chrome') {
    const input = runtimeLayoutInput(platformName);
    return {
      platformLayout: platform.resolveNativeHostPlatformLayout({
        platform: platformName,
        browser,
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

  for (const fixture of [
    { runtimeState: 'absent', registrationState: 'absent', label: 'initial absence' },
    { runtimeState: 'exact', registrationState: 'exact', label: 'idempotent ownership' },
  ]) {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        ...fixture,
        registry64Fact: { status: 'unavailable' },
      },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', `Windows ${fixture.label} refuses an unavailable user/64 proof`);
    equal(result.reason, 'unavailable', `Windows ${fixture.label} reports unavailable shadow evidence`);
    equal(
      transactionMutations(harness.trace).length,
      0,
      `Windows ${fixture.label} performs zero mutation without explicit user/64 absence`,
    );
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

  for (const invalidBrowser of ['firefox', true, ['chrome'], { toString: () => 'chrome' }]) {
    const resolved = layouts('darwin');
    const harness = fakeInstallTransaction(platform, resolved.platformLayout, resolved.runtimeLayout);
    const result = await installer.installNativeHost(
      { browser: invalidBrowser, extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'malformed install browser selector is refused');
    equal(result.reason, 'invalid-request', 'malformed browser selector has one stable refusal');
    equal(harness.trace.length, 0, 'malformed browser selector causes zero inspection or mutation');
  }

  for (const selectedBrowser of ['edge', 'brave', 'chromium']) {
    const resolved = layouts('linux');
    const harness = fakeInstallTransaction(platform, resolved.platformLayout, resolved.runtimeLayout);
    const result = await installer.installNativeHost(
      { browser: selectedBrowser, extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', `${selectedBrowser} install refuses a Chrome-targeted runtime composition`);
    equal(result.reason, 'invalid-request', `${selectedBrowser} cross-target refusal is stable`);
    equal(transactionMutations(harness.trace).length, 0, `${selectedBrowser} cross-target install performs zero mutation`);
  }

  {
    const resolved = layouts('linux');
    const harness = fakeInstallTransaction(platform, resolved.platformLayout, resolved.runtimeLayout, {
      runtimeState: 'exact',
      registrationState: 'exact',
    });
    const operations = cli.createNativeHostCliOperations(harness.dependencies);
    const result = await operations.uninstall({ browser: 'edge' });
    equal(result.status, 'refused', 'cross-target uninstall refuses a Chrome-targeted runtime composition');
    equal(result.reason, 'invalid-request', 'cross-target uninstall refusal is stable');
    equal(transactionMutations(harness.trace).length, 0, 'cross-target uninstall performs zero mutation');
  }

  for (const selectedBrowser of ['edge', 'brave', 'chromium']) {
    const resolved = layouts('linux', selectedBrowser);
    const harness = fakeInstallTransaction(platform, resolved.platformLayout, resolved.runtimeLayout);
    const result = await installer.installNativeHost(
      { browser: selectedBrowser, extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'installed', `${selectedBrowser} targeted transaction installs successfully`);
    equal(result.location, resolved.platformLayout.manifestPath, `${selectedBrowser} result identifies its selected registration`);
    const removed = await installer.uninstallNativeHost(harness.dependencies);
    equal(removed.status, 'removed', `${selectedBrowser} targeted transaction uninstalls successfully`);
    const absent = await installer.uninstallNativeHost(harness.dependencies);
    equal(absent.status, 'not-installed', `${selectedBrowser} targeted uninstall is idempotent`);
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

  {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        registryReadFact: ({ view, count, current }) => (
          view === 'user/64' && count >= 1
            ? Object.freeze({ status: 'unavailable' })
            : current
        ),
      },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'Windows publication boundary refuses a lost user/64 proof');
    equal(result.reason, 'boundary-changed', 'Windows lost publication proof is a stable boundary refusal');
    check(harness.trace.includes('runtime:remove'), 'Windows lost publication proof rolls back only the new runtime');
    check(
      harness.trace.every((entry) => !entry.startsWith('file:write:') && !entry.startsWith('registry:write:')),
      'Windows lost publication proof blocks all registration mutation',
    );
  }

  for (const unavailableAtRead of [2, 3]) {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        registryReadFact: ({ view, count, current }) => (
          view === 'user/64' && count >= unavailableAtRead
            ? Object.freeze({ status: 'unavailable' })
            : current
        ),
      },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', `Windows publication mutation ${unavailableAtRead - 1} refuses a lost shadow proof`);
    equal(result.reason, 'registration-publish-failed', 'Windows publication mutation refusal is contained');
    check(harness.trace.includes('runtime:remove'), 'Windows failed publication mutation rolls back the exact runtime');
    check(
      harness.trace.every((entry) => !entry.startsWith('registry:write:user/32:')),
      'Windows never publishes canonical registration after shadow proof is lost',
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

  {
    const resolved = layouts('win32');
    const writeEntry = `registry:write:user/32:${resolved.platformLayout.registration.key}:REG_SZ`;
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        failAfter: writeEntry,
        registryReadFact: ({ view, current, trace }) => (
          view === 'user/64' && trace.includes(writeEntry)
            ? Object.freeze({ status: 'unavailable' })
            : current
        ),
      },
    );
    const result = await installer.installNativeHost(
      { extensionId: EXTENSION_ID },
      harness.dependencies,
    );
    equal(result.status, 'refused', 'Windows post-write failure remains contained when shadow proof is lost');
    equal(result.reason, 'registration-publish-failed', 'Windows post-write rollback uses a stable refusal');
    check(
      harness.registryFacts.has('user/32'),
      'Windows rollback preserves canonical evidence when user/64 absence cannot be reproved',
    );
    check(
      harness.trace.every((entry) => !entry.startsWith('registry:delete:user/32:')),
      'Windows rollback never deletes canonical registration without fresh shadow proof',
    );
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
        registry64Fact: { status: 'unavailable' },
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'Windows uninstall refuses unavailable initial user/64 proof');
    equal(result.reason, 'unavailable', 'Windows unavailable initial shadow proof is explicit');
    equal(
      transactionMutations(harness.trace).length,
      0,
      'Windows uninstall performs zero deletion without initial user/64 absence',
    );
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
        registryReadFact: ({ view, count, current }) => (
          view === 'user/64' && count >= 1
            ? Object.freeze({ status: 'unavailable' })
            : current
        ),
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', 'Windows uninstall recheck refuses a lost user/64 proof');
    equal(result.reason, 'boundary-changed', 'Windows uninstall lost proof is a stable boundary refusal');
    equal(
      transactionMutations(harness.trace).length,
      0,
      'Windows uninstall recheck blocks every deletion after shadow proof is lost',
    );
  }

  for (const fixture of [
    {
      unavailableAtRead: 2,
      reason: 'registration-remove-failed',
      label: 'canonical removal',
    },
    {
      unavailableAtRead: 3,
      reason: 'registry-key-cleanup-failed',
      label: 'key cleanup',
    },
  ]) {
    const resolved = layouts('win32');
    const harness = fakeInstallTransaction(
      platform,
      resolved.platformLayout,
      resolved.runtimeLayout,
      {
        runtimeState: 'exact',
        registrationState: 'exact',
        registryReadFact: ({ view, count, current }) => (
          view === 'user/64' && count >= fixture.unavailableAtRead
            ? Object.freeze({ status: 'unavailable' })
            : current
        ),
      },
    );
    const result = await installer.uninstallNativeHost(harness.dependencies);
    equal(result.status, 'refused', `Windows ${fixture.label} refuses a lost user/64 proof`);
    equal(result.reason, fixture.reason, `Windows ${fixture.label} reports a stable refusal`);
    check(
      harness.trace.every((entry) => !entry.startsWith('registry:key-delete:user/32:')),
      `Windows ${fixture.label} never broad-deletes a key after shadow proof is lost`,
    );
    check(
      !harness.trace.includes('runtime:remove'),
      `Windows ${fixture.label} preserves runtime evidence after shadow proof is lost`,
    );
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
    uninstall: async (request = {}) => {
      calls.push(Object.freeze({ operation: 'uninstall', request: { ...request } }));
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
  deepEqual(calls[2], { operation: 'uninstall', request: {} }, 'default native uninstall passes no browser override');

  for (const browser of ['chrome', 'edge', 'brave', 'chromium']) {
    const installIndex = calls.length;
    await captureCliAction(() => cli.runInstall({ 'native-host': true, browser }, operations));
    deepEqual(
      calls[installIndex],
      { operation: 'install', request: { browser } },
      `${browser} install forwards the exact browser selector`,
    );
    const uninstallIndex = calls.length;
    await captureCliAction(() => cli.runUninstall({ 'native-host': true, browser }, operations));
    deepEqual(
      calls[uninstallIndex],
      { operation: 'uninstall', request: { browser } },
      `${browser} uninstall forwards the exact browser selector`,
    );
  }

  {
    const index = calls.length;
    await captureCliAction(() => cli.runInstall({
      'native-host': true,
      browser: 'edge',
      'extension-id': DEVELOPMENT_EXTENSION_ID,
    }, operations));
    deepEqual(
      calls[index],
      {
        operation: 'install',
        request: { browser: 'edge', extensionId: DEVELOPMENT_EXTENSION_ID },
      },
      'browser-targeted install forwards its exact browser-specific extension id',
    );
  }

  const invalidInstallFlags = [
    { 'native-host': false },
    { 'native-host': 'true' },
    { 'native-host': [] },
    { 'native-host': true, 'extension-id': true },
    { 'native-host': true, 'extension-id': [DEVELOPMENT_EXTENSION_ID] },
    { 'native-host': true, 'extension-id': 'abcdefghijklmnop' },
    { 'native-host': true, 'extension-id': `${DEVELOPMENT_EXTENSION_ID}a` },
    { 'native-host': true, 'extension-id': DEVELOPMENT_EXTENSION_ID.toUpperCase() },
    { 'native-host': true, browser: 'firefox' },
    { 'native-host': true, browser: true },
    { 'native-host': true, browser: ['chrome'] },
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
    { 'native-host': true, browser: 'firefox' },
    { 'native-host': true, browser: true },
    { 'native-host': true, browser: ['chrome'] },
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
      `Native messaging host was not changed: ${reason}\nExpected location: ${location}\nRun npx -y fsb-mcp-server@latest doctor for repair details.\n`,
      `${reason} native refusal prints only stable reason, location, and doctor guidance`,
    );
  }

  const sensitive = 'SENSITIVE_USERNAME_ENV_SECRET_CHILD_TASK';
  const taintedResult = await captureCliAction(() => cli.runInstall(
    { 'native-host': true },
    operationsWith({
      status: 'refused',
      reason: sensitive,
      location: `/home/${sensitive}\u001b[31m/manifest.json`,
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

  const inheritedReceipt = Object.create({
    status: 'installed',
    reason: 'installed',
    location: `/home/${sensitive}/manifest.json`,
    origin: ORIGIN,
    packageVersion: PACKAGE_VERSION,
  });
  const inherited = await captureCliAction(() => cli.runInstall(
    { 'native-host': true },
    operationsWith(inheritedReceipt),
  ));
  equal(inherited.exitCode, 1, 'prototype-backed native receipt fails closed');
  check(!`${inherited.stdout}${inherited.stderr}`.includes(sensitive), 'prototype-backed receipt fields never reach output');
  check(inherited.stderr.includes('not changed: unavailable'), 'prototype-backed native receipt collapses to unavailable');

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
  check(thrown.stderr.includes('Run npx -y fsb-mcp-server@latest doctor for repair details.'), 'native adapter exception retains exact doctor guidance');

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

async function runDoctorBrowserSelection() {
  const production = await importBuild('native-host-production.js');
  const absent = () => ({ exactOwned: false, absent: true });
  const states = (overrides = {}) => ({
    chrome: absent(),
    edge: absent(),
    brave: absent(),
    chromium: absent(),
    ...overrides,
  });

  equal(
    production.selectNativeHostDoctorBrowser(states()),
    'chrome',
    'doctor falls back to Chrome only when every registration is absent',
  );
  equal(
    production.selectNativeHostDoctorBrowser(states({
      edge: { exactOwned: false, absent: false },
      brave: { exactOwned: true, absent: false },
    })),
    'brave',
    'doctor prefers a later exact owned registration over an earlier non-absent registration',
  );
  equal(
    production.selectNativeHostDoctorBrowser(states({
      edge: { exactOwned: false, absent: false },
      brave: { exactOwned: false, absent: false },
      chromium: { exactOwned: false, absent: false },
    })),
    'edge',
    'doctor reports the first non-absent registration in browser priority order',
  );
  equal(
    production.selectNativeHostDoctorBrowser(states({
      chrome: { exactOwned: true, absent: false },
      edge: { exactOwned: true, absent: false },
    })),
    'chrome',
    'doctor reports the first exact registration in Chrome-to-Chromium priority order',
  );
}

const ENSURE_BROWSERS = Object.freeze(['chrome', 'edge', 'brave', 'chromium']);

function hexToken(value) {
  return value.toString(16).padStart(32, '0');
}

function manifestText(launcherPath, extensionId = EXTENSION_ID) {
  return `${JSON.stringify(expectedManifest(launcherPath, extensionId))}\n`;
}

function fakeEnsureHarness(modules, platformName, options = {}) {
  const trace = [];
  const invokingVersion = options.invokingVersion || PACKAGE_VERSION;
  const input = { ...runtimeLayoutInput(platformName), packageVersion: invokingVersion };
  const layouts = Object.fromEntries(ENSURE_BROWSERS.map((browser) => [
    browser,
    modules.platform.resolveNativeHostPlatformLayout({
      platform: platformName,
      browser,
      homeDirectory: input.homeDirectory,
      localAppData: input.localAppData,
    }),
  ]));
  const runtimeLayout = modules.runtimeLayout.resolveNativeHostRuntimeLayout(input);
  const inspectionLayout = Object.freeze({
    platform: runtimeLayout.platform,
    stableRoot: runtimeLayout.stableRoot,
    markerPath: runtimeLayout.markerPath,
    launcherPath: runtimeLayout.launcherPath,
    packageRoot: runtimeLayout.packageRoot,
    packageEntryPath: runtimeLayout.packageEntryPath,
    integrityReceiptPath: runtimeLayout.integrityReceiptPath,
    registryHelperPath: runtimeLayout.registryHelperPath,
  });
  const windowsManifestPath = platformName === 'win32' ? layouts.chrome.manifestPath : null;
  let tokenCounter = 0x100;
  let publishCount = 0;
  let clock = options.now ?? 1_000_000;
  let optOut = options.optOut || null;
  let stamp = options.stamp || null;
  let stopRequest = null;
  let lockHeld = Boolean(options.lockHeld);
  let daemonOnline = Boolean(options.daemonOnline);
  let rewrites = 0;
  const published = [];

  function makeTree(fields = {}) {
    const extensionId = fields.extensionId || EXTENSION_ID;
    const marker = expectedMarker(platformName, {
      origin: `chrome-extension://${extensionId}/`,
      packageVersion: fields.version || PACKAGE_VERSION,
      installToken: fields.token || INSTALL_TOKEN,
    });
    const receipt = Object.freeze({
      ...runtimeReceipt(runtimeLayout, marker),
      ...(fields.provenance ? { provenance: fields.provenance } : {}),
    });
    return {
      state: fields.state || 'exact',
      reason: fields.reason || (fields.state === 'invalid' ? 'launcher-integrity' : 'exact'),
      marker,
      receipt,
      manifest: null,
      label: fields.label || 'installed',
    };
  }

  let stable = options.installed ? makeTree(options.installed) : null;
  const siblings = new Map();
  for (const [name, entry] of options.siblings || []) {
    siblings.set(name, { tree: entry.tree ? makeTree(entry.tree) : makeTree(), ageMs: entry.ageMs ?? 0 });
  }
  const files = new Map();
  const registry = new Map();
  const registeredExtensionId = options.installed?.extensionId || EXTENSION_ID;

  function register(browser, extensionId = registeredExtensionId) {
    const text = manifestText(runtimeLayout.launcherPath, extensionId);
    if (platformName === 'win32') {
      if (stable) stable.manifest = text;
      registry.set(`user/32|${layouts[browser].registration.key}`, Object.freeze({
        status: 'value',
        type: 'REG_SZ',
        value: windowsManifestPath,
      }));
    } else {
      files.set(layouts[browser].manifestPath, Object.freeze({
        status: 'file',
        path: layouts[browser].manifestPath,
        realPath: layouts[browser].manifestPath,
        contents: text,
      }));
    }
  }
  for (const browser of options.registered || []) register(browser);
  for (const [browser, contents] of options.foreignManifests || []) {
    if (platformName === 'win32') {
      registry.set(`user/32|${layouts[browser].registration.key}`, Object.freeze({
        status: 'value',
        type: 'REG_SZ',
        value: 'C:\\foreign\\manifest.json',
      }));
    } else {
      files.set(layouts[browser].manifestPath, Object.freeze({
        status: 'file',
        path: layouts[browser].manifestPath,
        realPath: layouts[browser].manifestPath,
        contents,
      }));
    }
  }

  const platformDependencies = {
    files: {
      inspectFile: async (pathname) => {
        trace.push(`file:read:${pathname}`);
        if (windowsManifestPath && pathname === windowsManifestPath) {
          if (!stable || !stable.manifest) return Object.freeze({ status: 'absent' });
          return Object.freeze({
            status: 'file', path: pathname, realPath: pathname, contents: stable.manifest,
          });
        }
        return files.get(pathname) || Object.freeze({ status: 'absent' });
      },
      writePrivateFileAtomic: async (pathname, contents) => {
        trace.push(`file:write:${pathname}`);
        if (windowsManifestPath && pathname === windowsManifestPath) {
          if (!stable || stable.manifest) throw new Error('sensitive:EEXIST');
          stable.manifest = contents;
          return;
        }
        if (files.has(pathname)) throw new Error('sensitive:EEXIST');
        files.set(pathname, Object.freeze({ status: 'file', path: pathname, realPath: pathname, contents }));
      },
      removeFile: async (pathname) => {
        trace.push(`file:delete:${pathname}`);
        files.delete(pathname);
      },
    },
    registry: {
      readDefault: async (view, key) => registry.get(`${view}|${key}`) || Object.freeze({ status: 'absent' }),
      writeDefault: async (view, key, value) => {
        trace.push(`registry:write:${view}:${key}`);
        registry.set(`${view}|${key}`, Object.freeze({ status: 'value', ...value }));
      },
      deleteDefault: async (view, key) => {
        trace.push(`registry:delete:${view}:${key}`);
        registry.delete(`${view}|${key}`);
      },
      inspectKey: async (view, key) => (registry.has(`${view}|${key}`)
        ? Object.freeze({ status: 'exact-default-only' })
        : Object.freeze({ status: 'empty' })),
      deleteEmptyKey: async (view, key) => {
        trace.push(`registry:key-delete:${view}:${key}`);
      },
    },
  };
  const registrations = Object.freeze(Object.fromEntries(ENSURE_BROWSERS.map((browser) => [
    browser,
    modules.platform.createNativeHostPlatformAdapter(layouts[browser], platformDependencies),
  ])));

  function markerFact(tree) {
    return Object.freeze({
      status: 'file',
      path: runtimeLayout.markerPath,
      realPath: runtimeLayout.markerPath,
      contents: JSON.stringify(tree.marker),
    });
  }
  const runtime = Object.freeze({
    layout: inspectionLayout,
    inspectRuntime: async () => {
      trace.push('runtime:inspect');
      if (!stable) {
        return Object.freeze({
          state: 'absent', reason: 'absent', markerFact: Object.freeze({ status: 'absent' }),
          marker: null, receipt: null,
        });
      }
      if (stable.state === 'foreign') {
        return Object.freeze({
          state: 'foreign', reason: 'runtime-root-not-owned',
          markerFact: Object.freeze({ status: 'unavailable' }), marker: null, receipt: null,
        });
      }
      return Object.freeze({
        state: stable.state,
        reason: stable.reason,
        markerFact: markerFact(stable),
        marker: Object.freeze({ ...stable.marker }),
        receipt: stable.receipt,
      });
    },
    recheckExactRuntime: async (receipt) => {
      trace.push('runtime:recheck');
      return Boolean(stable && stable.state === 'exact' && stable.receipt === receipt);
    },
    removeExactRuntime: async (receipt) => {
      trace.push('runtime:remove');
      if (!stable || stable.receipt !== receipt) throw new Error('sensitive:runtime-changed');
      stable = null;
    },
  });

  const state = Object.freeze({
    acquireLock: async (waitMs) => {
      trace.push(`lock:acquire:${waitMs}`);
      if (lockHeld) return null;
      lockHeld = true;
      const token = hexToken(tokenCounter += 1);
      return Object.freeze({
        token,
        staleTokens: Object.freeze([...(options.staleTokens || [])]),
        lost: () => false,
        release: async () => {
          trace.push('lock:release');
          lockHeld = false;
        },
      });
    },
    readOptOut: async () => optOut,
    clearOptOut: async () => {
      trace.push('optout:clear');
      optOut = null;
    },
    readStamp: async () => stamp,
    writeStamp: async (value) => {
      trace.push(`stamp:write:${value.failures}`);
      stamp = value;
    },
    writeStopRequest: async (token, reason) => {
      trace.push(`stop:write:${reason}`);
      stopRequest = { token, reason };
    },
    removeStopRequest: async (token) => {
      trace.push('stop:remove');
      if (stopRequest?.token === token) stopRequest = null;
    },
    stableRootPresent: async () => Boolean(stable),
    listSiblings: async () => Object.freeze([...siblings].map(([name, entry]) => {
      const separator = name.indexOf('-');
      return Object.freeze({
        kind: name.slice(0, separator),
        token: name.slice(separator + 1),
        ageMs: entry.ageMs,
      });
    })),
    moveStableToSibling: async (kind, token) => {
      trace.push(`move:stable->${kind}`);
      if (options.failMove === `stable->${kind}`) throw new Error('sensitive:EBUSY');
      if (!stable || siblings.has(`${kind}-${token}`)) throw new Error('sensitive:move');
      siblings.set(`${kind}-${token}`, { tree: stable, ageMs: 0 });
      stable = null;
    },
    moveSiblingToStable: async (kind, token) => {
      trace.push(`move:${kind}->stable`);
      if (options.failMove === `${kind}->stable`) throw new Error('sensitive:EBUSY');
      const entry = siblings.get(`${kind}-${token}`);
      if (!entry || stable) throw new Error('sensitive:move');
      stable = entry.tree;
      siblings.delete(`${kind}-${token}`);
      if (typeof options.afterMoveToStable === 'function') {
        options.afterMoveToStable({ kind, files, registry, layouts });
      }
    },
    removeSibling: async (kind, token) => {
      trace.push(`remove:${kind}`);
      siblings.delete(`${kind}-${token}`);
    },
  });

  const daemon = Object.freeze({
    isOnline: async () => {
      trace.push('daemon:online');
      return daemonOnline;
    },
    waitForOffline: async (timeoutMs) => {
      trace.push(`daemon:wait:${timeoutMs}`);
      if (options.daemonHonorsStop && stopRequest) daemonOnline = false;
      return !daemonOnline;
    },
    identifyListener: async () => {
      trace.push('daemon:identify');
      if (!daemonOnline) return Object.freeze({ status: 'none' });
      return Object.freeze(options.listener || { status: 'stable-root', pid: 4242 });
    },
    terminate: async (pid) => {
      trace.push(`daemon:terminate:${pid}`);
      if (options.terminateWorks === false) return false;
      daemonOnline = false;
      return true;
    },
  });

  const dependencies = Object.freeze({
    platform: platformName,
    stableRoot: runtimeLayout.stableRoot,
    packageVersion: invokingVersion,
    nodePath: input.nodePath,
    runtime,
    registrations,
    state,
    daemon,
    timing: Object.freeze({ lockWaitMs: 1234, offlineTimeoutMs: 50 }),
    detectBrowsers: async (extensionId) => {
      trace.push(`detect:${extensionId}`);
      if (options.detectThrows) throw new Error('sensitive:detect');
      return options.detected ?? ['chrome'];
    },
    pinnedNodePresent: async () => options.nodePresent !== false,
    createPublisher: async (publisherOptions) => {
      trace.push(`publisher:${publisherOptions.destination}`);
      const layout = modules.runtimeLayout.resolveNativeHostRuntimeLayout({
        ...input,
        extensionId: publisherOptions.extensionId,
        installToken: publisherOptions.installToken,
      });
      return Object.freeze({
        layout,
        inspectRuntime: runtime.inspectRuntime,
        publishRuntime: async () => {
          trace.push(`publish:${publisherOptions.destination}`);
          publishCount += 1;
          if (options.publishGate) await options.publishGate;
          if (options.publishResult) return Object.freeze(options.publishResult);
          const tree = makeTree({
            version: invokingVersion,
            extensionId: publisherOptions.extensionId,
            token: publisherOptions.installToken,
            provenance: publisherOptions.provenance,
            label: 'published',
          });
          if (publisherOptions.windowsManifest) tree.manifest = publisherOptions.windowsManifest;
          published.push(Object.freeze({ options: publisherOptions, tree }));
          if (publisherOptions.destination === 'next') {
            siblings.set(`next-${publisherOptions.installToken}`, { tree, ageMs: 0 });
          } else {
            if (stable) return Object.freeze({ status: 'refused', reason: 'stable-root-not-absent', receipt: null });
            stable = tree;
          }
          return Object.freeze({
            status: 'published',
            reason: 'published',
            receipt: tree.receipt,
            trace: Object.freeze({ pack: Object.freeze({}), install: Object.freeze({}) }),
          });
        },
        recheckPublicationBoundary: async (receipt) => Boolean(
          stable && stable.state === 'exact' && stable.receipt === receipt,
        ),
        recheckExactRuntime: runtime.recheckExactRuntime,
        removeExactRuntime: runtime.removeExactRuntime,
      });
    },
    rewriteReceiptProvenance: async (receipt, provenance) => {
      trace.push(`provenance:${provenance}`);
      if (!stable || stable.receipt !== receipt) return false;
      stable.receipt = Object.freeze({ ...receipt, provenance });
      rewrites += 1;
      return true;
    },
    now: () => clock,
  });

  return {
    dependencies,
    trace,
    layouts,
    runtimeLayout,
    files,
    registry,
    published,
    siblings,
    stable: () => stable,
    stamp: () => stamp,
    optOut: () => optOut,
    stopRequest: () => stopRequest,
    publishCount: () => publishCount,
    rewrites: () => rewrites,
    advance: (milliseconds) => { clock += milliseconds; },
    setOnline: (value) => { daemonOnline = value; },
    holdLock: (value) => { lockHeld = value; },
    register,
    registeredBrowsers: () => ENSURE_BROWSERS.filter((browser) => (
      platformName === 'win32'
        ? registry.has(`user/32|${layouts[browser].registration.key}`)
        : files.has(layouts[browser].manifestPath)
    )),
  };
}

function ensureMutations(trace) {
  return trace.filter((entry) => (
    entry.startsWith('file:write:')
    || entry.startsWith('file:delete:')
    || entry.startsWith('registry:write:')
    || entry.startsWith('registry:delete:')
    || entry.startsWith('registry:key-delete:')
    || entry.startsWith('publish:')
    || entry.startsWith('move:')
    || entry.startsWith('remove:')
    || entry === 'runtime:remove'
    || entry.startsWith('stop:write')
    || entry.startsWith('daemon:terminate')
    || entry.startsWith('provenance:')
  ));
}

function traceOrder(trace, entries, message) {
  const positions = entries.map((entry) => trace.findIndex((candidate) => (
    typeof entry === 'string' ? candidate === entry : entry.test(candidate)
  )));
  check(
    positions.every((position) => position >= 0)
      && positions.every((position, index) => index === 0 || position > positions[index - 1]),
    message,
  );
}

const REFRESH_ONLY = Object.freeze({ mode: 'refresh-only', browsers: 'auto', provenance: 'auto' });

async function runEnsureTransaction() {
  const installer = await importBuild('native-host-install/index.js');
  const modules = {
    platform: await importBuild('native-host-install/platform.js'),
    runtimeLayout: await importBuild('native-host/runtime-layout.js'),
  };

  equal(installer.compareNativeHostVersions('0.11.5', '0.12.0'), -1, 'versions compare numerically by part');
  equal(installer.compareNativeHostVersions('0.12.0-rc.1', '0.12.0'), -1, 'a prerelease sorts before its release');
  equal(installer.compareNativeHostVersions('1.10.0', '1.9.9'), 1, 'minor parts compare as numbers, not text');
  equal(installer.compareNativeHostVersions('1.0.0', '1.0.0'), 0, 'equal versions compare equal');
  equal(installer.compareNativeHostVersions('1.0', '1.0.0'), null, 'an unparsable version never compares');

  for (const platformName of ['darwin', 'linux', 'win32']) {
    {
      const harness = fakeEnsureHarness(modules, platformName);
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'skipped-absent', `${platformName} automatic refresh never installs a missing helper`);
      equal(ensureMutations(harness.trace).length, 0, `${platformName} skipped-absent performs zero mutation`);
      check(!harness.trace.some((entry) => entry.startsWith('lock:')), `${platformName} skipped-absent never takes the lock`);
      equal(result.stableRoot, harness.runtimeLayout.stableRoot, `${platformName} ensure results name the stable root`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        optOut: { at: 1, reason: 'uninstall --native-host' },
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'skipped-opt-out', `${platformName} the opt-out marker stops automatic refreshes`);
      deepEqual(harness.trace, [], `${platformName} an opted-out refresh reads nothing else`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        detected: ['chrome', 'edge'],
        optOut: { at: 1, reason: 'install --no-native-host' },
      });
      const result = await installer.ensureNativeHost(
        { mode: 'install', browsers: 'auto', provenance: 'auto' },
        harness.dependencies,
      );
      equal(result.outcome, 'installed', `${platformName} an install-mode ensure creates a missing helper`);
      deepEqual(result.browsers, ['chrome', 'edge'], `${platformName} install registers every browser that has the extension`);
      deepEqual(result.addedBrowsers, ['chrome', 'edge'], `${platformName} install reports the added browsers`);
      deepEqual(harness.registeredBrowsers(), ['chrome', 'edge'], `${platformName} both registrations exist`);
      equal(harness.stable().receipt.provenance, 'auto', `${platformName} the receipt records automatic provenance`);
      equal(harness.optOut(), null, `${platformName} any install clears the opt-out marker`);
      equal(harness.stamp().failures, 0, `${platformName} a successful publish writes a clean stamp`);
      deepEqual(harness.stamp().browsers, ['chrome', 'edge'], `${platformName} the stamp is keyed on the browser set`);
      if (platformName === 'win32') {
        equal(
          harness.trace.filter((entry) => entry.startsWith('file:write:')).length,
          1,
          'Windows writes the shared manifest once and only a registry value for the second browser',
        );
      }
      const again = await installer.ensureNativeHost(REFRESH_ONLY, {
        ...harness.dependencies,
        detectBrowsers: async () => ['chrome', 'edge'],
      });
      equal(again.outcome, 'current', `${platformName} a second ensure finds the helper current`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, { detected: [] });
      const result = await installer.ensureNativeHost(
        { mode: 'install', browsers: 'auto', provenance: 'explicit' },
        harness.dependencies,
      );
      deepEqual(result.browsers, ['chrome'], `${platformName} install falls back to Chrome when no profile has the extension`);
      equal(harness.stable().receipt.provenance, 'explicit', `${platformName} explicit provenance is recorded`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: {},
        registered: ['chrome'],
        detected: ['chrome'],
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'current', `${platformName} an exact current helper is current`);
      equal(result.version, PACKAGE_VERSION, `${platformName} current reports the installed version`);
      equal(ensureMutations(harness.trace).length, 0, `${platformName} a current helper performs zero mutation`);
      check(!harness.trace.some((entry) => entry.startsWith('lock:')), `${platformName} the cheap current path never takes the lock`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: {},
        registered: ['chrome'],
        detected: ['chrome', 'edge'],
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'registered', `${platformName} a browser with the extension but no registration is registered`);
      deepEqual(result.addedBrowsers, ['edge'], `${platformName} registration reports only the added browser`);
      deepEqual(result.browsers, ['chrome', 'edge'], `${platformName} registration reports every registered browser`);
      equal(harness.publishCount(), 0, `${platformName} adding a registration never republishes the runtime`);
      if (platformName === 'win32') {
        check(
          harness.trace.every((entry) => !entry.startsWith('file:write:')),
          'Windows adds a browser with only its registry value',
        );
        check(
          harness.trace.some((entry) => entry === `registry:write:user/32:${harness.layouts.edge.registration.key}`),
          'Windows writes the Edge canonical value',
        );
      } else {
        equal(
          harness.files.get(harness.layouts.edge.manifestPath).contents,
          manifestText(harness.runtimeLayout.launcherPath),
          `${platformName} the added manifest names the same launcher and origin`,
        );
      }
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0', extensionId: DEVELOPMENT_EXTENSION_ID, provenance: 'auto' },
        registered: ['chrome'],
        detected: ['chrome'],
        daemonOnline: true,
        listener: { status: 'stable-root', pid: 4242 },
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refreshed', `${platformName} an exact older helper is refreshed`);
      equal(result.version, PACKAGE_VERSION, `${platformName} the refresh reports the new version`);
      equal(harness.stable().receipt.packageVersion, PACKAGE_VERSION, `${platformName} the stable root now holds the new runtime`);
      equal(
        harness.stable().marker.origin,
        `chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`,
        `${platformName} the refresh keeps the marker's extension id instead of the store default`,
      );
      equal(harness.published[0].options.destination, 'next', `${platformName} the refresh publishes beside the live root`);
      equal(harness.stable().receipt.provenance, 'auto', `${platformName} the refresh keeps automatic provenance`);
      traceOrder(harness.trace, [
        'publish:next',
        'stop:write:refresh',
        'daemon:identify',
        'daemon:terminate:4242',
        'move:stable->retired',
        'move:next->stable',
        'remove:retired',
        'stop:remove',
      ], `${platformName} refresh runs publish, stop, legacy fallback, swap, verify, delete, unstop in order`);
      equal(harness.siblings.size, 0, `${platformName} a refresh leaves no sibling directories`);
      equal(harness.stopRequest(), null, `${platformName} the stop request is removed afterwards`);
      if (platformName === 'win32') {
        equal(
          harness.stable().manifest,
          manifestText(harness.runtimeLayout.launcherPath, DEVELOPMENT_EXTENSION_ID),
          'Windows carries the shared manifest into the replacement tree',
        );
      }
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        daemonOnline: true,
        listener: { status: 'other' },
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refreshed', `${platformName} a port held by another program does not block the swap`);
      check(!harness.trace.some((entry) => entry.startsWith('daemon:terminate')), `${platformName} another program on the port is never signalled`);
      check(!harness.trace.some((entry) => entry.startsWith('daemon:wait')), `${platformName} another program on the port is not waited for`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        daemonOnline: true,
        listener: { status: 'unknown' },
      });
      const before = harness.stable();
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'deferred', `${platformName} an unidentified listener that stays up defers the refresh`);
      equal(result.reason, 'daemon-unidentified', `${platformName} the deferral names the unidentified daemon`);
      equal(harness.stable(), before, `${platformName} a deferred refresh leaves the old runtime serving`);
      equal(harness.siblings.size, 0, `${platformName} a deferred refresh deletes its unused replacement`);
      equal(harness.stopRequest(), null, `${platformName} a deferred refresh withdraws its stop request`);
      check(!harness.trace.some((entry) => entry.startsWith('daemon:terminate')), `${platformName} an unidentified listener is never signalled`);
      equal(harness.stamp().failures, 1, `${platformName} a deferred refresh records a failure for backoff`);
      check(harness.stamp().nextAttemptAt > 1_000_000, `${platformName} the backoff schedules the next attempt later`);

      const backoff = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(backoff.outcome, 'deferred', `${platformName} a refresh inside the backoff window waits`);
      equal(backoff.reason, 'backoff', `${platformName} the backoff deferral is explicit`);
      equal(harness.publishCount(), 1, `${platformName} the backoff window performs no publish`);

      harness.advance(60 * 60_000);
      harness.setOnline(false);
      const retried = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(retried.outcome, 'refreshed', `${platformName} the refresh is retried after the backoff`);
      equal(harness.stamp().failures, 0, `${platformName} success clears the failure count`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        lockHeld: true,
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'deferred', `${platformName} a live lock holder defers the automatic refresh`);
      equal(result.reason, 'locked', `${platformName} the lock deferral is explicit`);
      check(harness.trace.includes('lock:acquire:0'), `${platformName} the automatic refresh never waits for the lock`);
      equal(harness.publishCount(), 0, `${platformName} the loser of the lock publishes nothing`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: {},
        registered: ['chrome'],
        nodePresent: false,
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refreshed', `${platformName} a helper whose pinned interpreter is gone is refreshed`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '99.0.0' },
        registered: ['chrome'],
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'current', `${platformName} a newer installed helper is never downgraded`);
      equal(result.reason, 'installed-newer', `${platformName} the newer helper is reported`);
      equal(harness.publishCount(), 0, `${platformName} a newer helper is never republished`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { state: 'invalid', reason: 'launcher-integrity', extensionId: DEVELOPMENT_EXTENSION_ID },
        registered: ['chrome'],
      });
      const original = harness.stable();
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refreshed', `${platformName} a launcher-only integrity failure is rebuilt`);
      traceOrder(harness.trace, [
        'stop:write:refresh',
        'move:stable->quarantine',
        'publish:stable',
        'remove:quarantine',
        'stop:remove',
      ], `${platformName} the suspect tree is quarantined before the rebuild publishes`);
      check(harness.stable() !== original && harness.stable().state === 'exact', `${platformName} the rebuilt runtime is exact`);
      equal(
        harness.stable().marker.origin,
        `chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`,
        `${platformName} the rebuild keeps the marker's extension id`,
      );
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { state: 'invalid', reason: 'launcher-integrity' },
        registered: ['chrome'],
        publishResult: { status: 'refused', reason: 'pack-failed', receipt: null },
      });
      const original = harness.stable();
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refused', `${platformName} a failed rebuild is refused`);
      equal(result.reason, 'pack-failed', `${platformName} the failed rebuild keeps the publish reason`);
      equal(harness.stable(), original, `${platformName} a failed rebuild puts the quarantined tree back`);
      equal(harness.siblings.size, 0, `${platformName} a failed rebuild leaves no quarantine behind`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { state: 'invalid', reason: 'runtime-metadata-invalid' },
        registered: ['chrome'],
      });
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refused', `${platformName} any other invalid runtime is never touched`);
      equal(result.reason, 'invalid-state', `${platformName} invalid state is reported`);
      equal(ensureMutations(harness.trace).length, 0, `${platformName} an invalid runtime causes zero mutation`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        publishResult: { status: 'refused', reason: 'pack-failed', receipt: null },
      });
      const original = harness.stable();
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refused', `${platformName} a failed refresh publish is refused`);
      equal(harness.stable(), original, `${platformName} a failed refresh publish leaves the old runtime`);
      check(!harness.trace.some((entry) => entry.startsWith('stop:write')), `${platformName} a failed publish never asks the daemon to stop`);
      equal(harness.stamp().failures, 1, `${platformName} a failed publish backs off`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        failMove: 'next->stable',
      });
      const original = harness.stable();
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'deferred', `${platformName} a failed swap rename defers the refresh`);
      equal(result.reason, 'swap-failed', `${platformName} the swap failure is explicit`);
      equal(harness.stable(), original, `${platformName} a failed swap renames the old runtime back`);
      equal(harness.siblings.size, 0, `${platformName} a failed swap leaves no siblings`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { version: '0.9.0' },
        registered: ['chrome'],
        afterMoveToStable: ({ kind, files, registry, layouts }) => {
          if (kind !== 'next') return;
          files.delete(layouts.chrome.manifestPath);
          registry.delete(`user/32|${layouts.chrome.registration.key}`);
        },
      });
      const original = harness.stable();
      const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
      equal(result.outcome, 'refused', `${platformName} a registration that changes during the swap fails verification`);
      equal(result.reason, 'boundary-changed', `${platformName} the failed verification is reported`);
      equal(harness.stable(), original, `${platformName} a failed verification swaps the old runtime back`);
      equal(harness.siblings.size, 0, `${platformName} a failed verification deletes the replacement`);
    }
  }

  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.12.0' },
      invokingVersion: '1.0.0',
      registered: ['chrome'],
      daemonOnline: true,
    });
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'deferred', 'a busy daemon that understands stop requests defers the refresh');
    equal(result.reason, 'daemon-busy', 'the busy daemon is reported');
    check(!harness.trace.some((entry) => entry.startsWith('daemon:terminate')), 'a stop-aware daemon is never signalled');
    check(harness.trace.includes('daemon:wait:50'), 'a stop-aware daemon gets the configured wait');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.12.0' },
      invokingVersion: '1.0.0',
      registered: ['chrome'],
      daemonOnline: true,
      daemonHonorsStop: true,
    });
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'refreshed', 'a stop-aware daemon that drains lets the refresh swap');
    check(!harness.trace.some((entry) => entry.startsWith('daemon:terminate')), 'a draining daemon is never signalled');
  }
  {
    const harness = fakeEnsureHarness(modules, 'darwin', {
      installed: { version: '0.9.0' },
      registered: ['chrome'],
      daemonOnline: true,
      terminateWorks: false,
    });
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'deferred', 'an older daemon that cannot be stopped defers the refresh');
    equal(result.reason, 'daemon-busy', 'the unstoppable daemon is reported as busy');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.9.0' },
      registered: ['chrome'],
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const gated = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.9.0' },
      registered: ['chrome'],
      publishGate: gate,
    });
    const first = installer.ensureNativeHost(REFRESH_ONLY, gated.dependencies);
    const second = installer.ensureNativeHost(REFRESH_ONLY, gated.dependencies);
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const outcomes = (await Promise.all([first, second])).map((result) => result.outcome).sort();
    deepEqual(outcomes, ['current', 'refreshed'], 'two ensures in one process serialize to one refresh and one current');
    equal(gated.publishCount(), 1, 'two concurrent ensures publish exactly once');
    equal(gated.siblings.size, 0, 'two concurrent ensures leave no sibling directories');
    void harness;
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: {},
      registered: ['chrome'],
    });
    const result = await installer.ensureNativeHost(
      { mode: 'install', extensionId: DEVELOPMENT_EXTENSION_ID, provenance: 'explicit' },
      harness.dependencies,
    );
    equal(result.outcome, 'refused', 'an install for a different extension id than the marker is refused');
    equal(result.reason, 'ownership-mismatch', 'the extension id mismatch is reported');
    equal(ensureMutations(harness.trace).length, 0, 'an extension id mismatch causes zero mutation');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { provenance: 'auto' },
      registered: ['chrome'],
    });
    const result = await installer.ensureNativeHost(
      { mode: 'install', browsers: 'auto', provenance: 'explicit' },
      harness.dependencies,
    );
    equal(result.outcome, 'current', 'an explicit install of a current automatic helper stays current');
    equal(harness.stable().receipt.provenance, 'explicit', 'an explicit install promotes automatic provenance');
    const automatic = await installer.ensureNativeHost(
      { mode: 'install', browsers: 'auto', provenance: 'auto' },
      harness.dependencies,
    );
    equal(automatic.outcome, 'current', 'an automatic install of an explicit helper stays current');
    equal(harness.stable().receipt.provenance, 'explicit', 'an automatic install never demotes explicit provenance');
    equal(harness.rewrites(), 1, 'provenance is rewritten exactly once');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.9.0' },
      registered: ['chrome'],
      foreignManifests: [['edge', '{"foreign":"edge"}\n']],
      detected: ['chrome', 'edge'],
    });
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'refreshed', 'a foreign registration in another browser does not block a refresh');
    equal(
      harness.files.get(harness.layouts.edge.manifestPath).contents,
      '{"foreign":"edge"}\n',
      'a foreign registration is preserved byte for byte',
    );
    deepEqual(result.addedBrowsers, [], 'a browser with a foreign registration is never registered over');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', { installed: { state: 'foreign' } });
    const result = await installer.ensureNativeHost(
      { mode: 'install', provenance: 'explicit' },
      harness.dependencies,
    );
    equal(result.outcome, 'refused', 'a foreign stable root is refused');
    equal(result.reason, 'foreign-state', 'the foreign refusal is stable');
    equal(ensureMutations(harness.trace).length, 0, 'a foreign stable root causes zero mutation');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {});
    harness.register('chrome');
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'refused', 'a registration without a runtime is a quiet refusal');
    equal(result.reason, 'split-state', 'the orphan registration is a split state');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: {},
      registered: ['chrome'],
      detected: ['chrome'],
    });
    harness.siblings.set(`stage-${hexToken(7)}`, { tree: null, ageMs: 1000 });
    harness.siblings.set(`stage-${hexToken(8)}`, { tree: null, ageMs: 11 * 60_000 });
    harness.siblings.set(`next-${hexToken(9)}`, { tree: null, ageMs: 0 });
    harness.siblings.set(`remove-${hexToken(10)}`, { tree: null, ageMs: 0 });
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'current', 'leftovers do not change the outcome for a current helper');
    deepEqual(
      [...harness.siblings.keys()],
      [`stage-${hexToken(7)}`],
      'leftover next, remove and old stage directories are deleted; a young unowned stage is kept',
    );
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      registered: [],
      staleTokens: [hexToken(7)],
    });
    harness.siblings.set(`stage-${hexToken(7)}`, { tree: null, ageMs: 1000 });
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    equal(result.outcome, 'skipped-absent', 'a publish killed mid-way still reads as absent');
    equal(harness.siblings.size, 0, 'the stage of a dead lock holder is deleted at once');
  }
  for (const fixture of [
    { label: 'retired and next', siblings: ['retired', 'next'], expected: 'published' },
    { label: 'retired only', siblings: ['retired'], expected: 'retired' },
    { label: 'quarantine only', siblings: ['quarantine'], expected: 'quarantine' },
  ]) {
    const harness = fakeEnsureHarness(modules, 'linux', {});
    const token = hexToken(0x55);
    for (const kind of fixture.siblings) {
      harness.siblings.set(`${kind}-${token}`, {
        tree: null,
        ageMs: 0,
      });
    }
    for (const kind of fixture.siblings) {
      harness.siblings.get(`${kind}-${token}`).tree = {
        state: 'exact',
        reason: 'exact',
        marker: expectedMarker('linux'),
        receipt: runtimeReceipt(harness.runtimeLayout, expectedMarker('linux')),
        manifest: null,
        label: kind === 'next' ? 'published' : kind,
      };
    }
    harness.register('chrome');
    const result = await installer.ensureNativeHost(REFRESH_ONLY, harness.dependencies);
    check(harness.stable() !== null, `recovery restores a stable root left missing with ${fixture.label}`);
    equal(harness.stable().label, fixture.expected, `recovery with ${fixture.label} picks the right tree`);
    equal(harness.siblings.size, 0, `recovery with ${fixture.label} leaves no siblings`);
    equal(result.outcome, 'current', `recovery with ${fixture.label} leaves a current helper`);
  }

  for (const invalid of [
    { mode: 'everything', provenance: 'auto' },
    { mode: 'install', provenance: 'implicit' },
    { mode: 'install', provenance: 'auto', browsers: ['firefox'] },
    { mode: 'install', provenance: 'auto', browsers: [] },
    { mode: 'install', provenance: 'auto', browsers: ['chrome', 'chrome'] },
    { mode: 'install', provenance: 'auto', extensionId: 'q'.repeat(32) },
    { mode: 'install', provenance: 'auto', extra: true },
  ]) {
    const harness = fakeEnsureHarness(modules, 'linux');
    const result = await installer.ensureNativeHost(invalid, harness.dependencies);
    equal(result.reason, 'invalid-request', 'a malformed ensure request is refused');
    equal(harness.trace.length, 0, 'a malformed ensure request causes zero inspection');
  }

  for (const platformName of ['darwin', 'linux', 'win32']) {
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { provenance: 'auto' },
        registered: ['chrome', 'edge'],
      });
      const edge = await installer.uninstallNativeHostBrowser({ browser: 'edge' }, harness.dependencies);
      equal(edge.status, 'removed', `${platformName} one browser's registration is removed`);
      equal(edge.reason, 'registration-removed', `${platformName} the runtime stays while another browser uses it`);
      deepEqual(harness.registeredBrowsers(), ['chrome'], `${platformName} the other browser keeps its registration`);
      check(harness.stable() !== null, `${platformName} the runtime is kept for the remaining browser`);
      check(!harness.trace.some((entry) => entry.startsWith('stop:write')), `${platformName} removing one of two registrations never stops the daemon`);
      if (platformName === 'win32') {
        check(harness.stable().manifest !== null, 'Windows keeps the shared manifest while a browser still uses it');
        check(
          harness.trace.some((entry) => entry === `registry:key-delete:user/32:${harness.layouts.edge.registration.key}`),
          'Windows removes the emptied Edge key',
        );
      }
      const mark = harness.trace.length;
      const chrome = await installer.uninstallNativeHostBrowser({ browser: 'chrome' }, harness.dependencies);
      equal(chrome.status, 'removed', `${platformName} the last registration is removed`);
      equal(chrome.reason, 'removed', `${platformName} the runtime goes with the last registration`);
      equal(harness.stable(), null, `${platformName} the runtime is removed`);
      traceOrder(harness.trace.slice(mark), [
        'stop:write:uninstall',
        /^(?:file:delete:|registry:delete:)/u,
        'runtime:remove',
        'stop:remove',
      ], `${platformName} the last uninstall stops the daemon before mutating`);
      const again = await installer.uninstallNativeHostBrowser({ browser: 'chrome' }, harness.dependencies);
      equal(again.status, 'not-installed', `${platformName} per-browser uninstall is idempotent`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: {},
        registered: ['chrome'],
        foreignManifests: [['edge', '{"foreign":"edge"}\n']],
      });
      const result = await installer.uninstallNativeHostBrowser({ browser: 'chrome' }, harness.dependencies);
      equal(result.status, 'refused', `${platformName} a foreign registration in another browser refuses uninstall`);
      equal(result.reason, 'split-state', `${platformName} the foreign registration refusal is stable`);
      equal(ensureMutations(harness.trace).length, 0, `${platformName} the refused uninstall mutates nothing`);
    }
    {
      const harness = fakeEnsureHarness(modules, platformName, {
        installed: { provenance: 'auto' },
        registered: ['chrome', 'brave'],
      });
      const result = await installer.uninstallAllNativeHost({ onlyProvenance: 'auto' }, harness.dependencies);
      equal(result.outcome, 'removed', `${platformName} uninstall-all removes an automatic helper`);
      deepEqual(result.removedBrowsers, ['chrome', 'brave'], `${platformName} uninstall-all reports every removed browser`);
      equal(result.provenance, 'auto', `${platformName} uninstall-all reports the provenance`);
      equal(harness.stable(), null, `${platformName} uninstall-all removes the runtime`);
      deepEqual(harness.registeredBrowsers(), [], `${platformName} uninstall-all removes every registration`);
      const again = await installer.uninstallAllNativeHost({}, harness.dependencies);
      equal(again.outcome, 'absent', `${platformName} uninstall-all is idempotent`);
    }
  }
  for (const provenance of ['explicit', undefined]) {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: provenance ? { provenance } : {},
      registered: ['chrome'],
    });
    const result = await installer.uninstallAllNativeHost({ onlyProvenance: 'auto' }, harness.dependencies);
    equal(result.outcome, 'kept', `an ${provenance ? 'explicit' : 'older unmarked'} helper is kept when only automatic ones may go`);
    equal(result.provenance, 'explicit', 'a receipt without provenance counts as explicit');
    equal(ensureMutations(harness.trace).length, 0, 'a kept helper is not touched');
    const forced = await installer.uninstallAllNativeHost({}, harness.dependencies);
    equal(forced.outcome, 'removed', 'uninstall-all without a provenance filter removes it');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.12.0', provenance: 'auto' },
      invokingVersion: '1.0.0',
      registered: ['chrome'],
      daemonOnline: true,
    });
    const result = await installer.uninstallAllNativeHost({}, harness.dependencies);
    equal(result.outcome, 'refused', 'a busy daemon refuses uninstall-all');
    equal(result.reason, 'daemon-busy', 'the busy daemon is reported');
    deepEqual(harness.registeredBrowsers(), ['chrome'], 'a busy daemon keeps every registration');
    check(harness.stable() !== null, 'a busy daemon keeps the runtime');
    equal(harness.stopRequest(), null, 'the refused uninstall withdraws its stop request');
  }
  for (const platformName of ['darwin', 'linux', 'win32']) {
    const harness = fakeEnsureHarness(modules, platformName, {
      installed: {},
      registered: ['chrome'],
    });
    const result = await installer.installNativeHostBrowser({ browser: 'edge', extensionId: EXTENSION_ID }, harness.dependencies);
    equal(result.status, 'installed', `${platformName} an explicit install adds a second browser beside a current helper`);
    equal(result.location, harness.layouts.edge.manifestPath, `${platformName} the added install names the browser's location`);
    deepEqual(harness.registeredBrowsers(), ['chrome', 'edge'], `${platformName} both browsers are registered`);
    equal(harness.publishCount(), 0, `${platformName} the second browser shares the runtime`);
    const repeat = await installer.installNativeHostBrowser({ browser: 'edge' }, harness.dependencies);
    equal(repeat.status, 'already-installed', `${platformName} the added browser is idempotent`);
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: { version: '0.9.0' },
      registered: ['chrome'],
    });
    const result = await installer.installNativeHostBrowser({ browser: 'edge' }, harness.dependencies);
    equal(result.status, 'refused', 'a second browser is not added beside an older helper');
    equal(result.reason, 'version-mismatch', 'the older helper refusal matches the single-browser install');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      foreignManifests: [['edge', '{"foreign":"edge-registration"}\n']],
    });
    const result = await installer.installNativeHostBrowser({}, harness.dependencies);
    equal(result.status, 'refused', 'a foreign registration in another browser still refuses install');
    equal(result.reason, 'split-state', 'the foreign registration refusal is a split state');
    equal(harness.publishCount(), 0, 'the refused install publishes nothing');
  }
  {
    const harness = fakeEnsureHarness(modules, 'darwin', {});
    const result = await installer.installNativeHostBrowser({ extensionId: EXTENSION_ID }, harness.dependencies);
    equal(result.status, 'installed', 'an explicit install with nothing present runs the original install');
    equal(harness.stable().receipt.provenance, 'explicit', 'an explicit single-browser install records explicit provenance');
    const already = await installer.installNativeHostBrowser({ extensionId: EXTENSION_ID }, harness.dependencies);
    equal(already.status, 'already-installed', 'a repeated explicit install reports already installed');
  }
  {
    const harness = fakeEnsureHarness(modules, 'linux', {
      installed: {},
      registered: ['chrome'],
    });
    const result = await installer.addNativeHostRegistration('brave', harness.dependencies);
    equal(result.outcome, 'registered', 'addNativeHostRegistration registers one browser');
    deepEqual(result.addedBrowsers, ['brave'], 'addNativeHostRegistration reports the browser');
    const refused = await installer.addNativeHostRegistration('chromium', {
      ...harness.dependencies,
    });
    equal(refused.outcome, 'registered', 'addNativeHostRegistration works for each browser');
  }
}

async function runBrowserDetection() {
  const platform = await importBuild('native-host-install/platform.js');
  function fakeTree(directories) {
    const set = new Set(directories);
    return {
      listDirectory: async (pathname) => {
        const prefix = pathname.endsWith('/') || pathname.endsWith('\\') ? pathname : `${pathname}${pathname.includes('\\') ? '\\' : '/'}`;
        const names = new Set();
        for (const directory of set) {
          if (directory.startsWith(prefix)) names.add(directory.slice(prefix.length).split(/[\\/]/u)[0]);
        }
        return set.has(pathname) ? [...names] : null;
      },
      isDirectory: async (pathname) => set.has(pathname),
    };
  }
  {
    const home = '/Users/fsb';
    const chrome = `${home}/Library/Application Support/Google/Chrome`;
    const edge = `${home}/Library/Application Support/Microsoft Edge`;
    const brave = `${home}/Library/Application Support/BraveSoftware/Brave-Browser`;
    const files = fakeTree([
      chrome,
      `${chrome}/Default`,
      `${chrome}/Default/Extensions`,
      edge,
      `${edge}/Profile 3`,
      `${edge}/Profile 3/Extensions`,
      `${edge}/Profile 3/Extensions/${EXTENSION_ID}`,
      brave,
      `${brave}/Default`,
      `${brave}/Default/Extensions/${DEVELOPMENT_EXTENSION_ID}`,
    ]);
    deepEqual(
      await platform.detectFsbBrowsers({ platform: 'darwin', homeDirectory: home, extensionId: EXTENSION_ID }, files),
      ['edge'],
      'macOS detection counts a browser only when a profile holds the extension',
    );
    deepEqual(
      await platform.detectFsbBrowsers({ platform: 'darwin', homeDirectory: home, extensionId: DEVELOPMENT_EXTENSION_ID }, files),
      ['brave'],
      'detection follows the requested extension id',
    );
  }
  {
    const home = '/home/fsb';
    const files = fakeTree([
      `${home}/.config/chromium`,
      `${home}/.config/chromium/Default`,
      `${home}/.config/chromium/Default/Extensions/${EXTENSION_ID}`,
      `${home}/.config/google-chrome`,
      `${home}/.config/google-chrome/.hidden`,
      `${home}/.config/google-chrome/.hidden/Extensions/${EXTENSION_ID}`,
    ]);
    deepEqual(
      await platform.detectFsbBrowsers({ platform: 'linux', homeDirectory: home, extensionId: EXTENSION_ID }, files),
      ['chromium'],
      'Linux detection reads per-user profile roots and skips hidden entries',
    );
  }
  {
    const local = 'C:\\Users\\fsb\\AppData\\Local';
    const files = fakeTree([
      `${local}\\Google\\Chrome\\User Data`,
      `${local}\\Google\\Chrome\\User Data\\Default`,
      `${local}\\Google\\Chrome\\User Data\\Default\\Extensions\\${EXTENSION_ID}`,
      `${local}\\Microsoft\\Edge\\User Data`,
      `${local}\\Microsoft\\Edge\\User Data\\Default`,
      `${local}\\Microsoft\\Edge\\User Data\\Default\\Extensions\\${EXTENSION_ID}`,
    ]);
    deepEqual(
      await platform.detectFsbBrowsers({
        platform: 'win32',
        homeDirectory: 'C:\\Users\\fsb',
        localAppData: local,
        extensionId: EXTENSION_ID,
      }, files),
      ['chrome', 'edge'],
      'Windows detection reads only per-user profile roots under LOCALAPPDATA',
    );
  }
  deepEqual(
    await platform.detectFsbBrowsers(
      { platform: 'linux', homeDirectory: '/home/fsb', extensionId: EXTENSION_ID },
      { listDirectory: async () => { throw new Error('EACCES'); }, isDirectory: async () => true },
    ),
    [],
    'unreadable profile roots count as not installed',
  );
  deepEqual(
    platform.nativeHostBrowsersFromEnvironment({ FSB_NATIVE_HOST_BROWSERS: 'chrome,edge' }),
    null,
    'the browser override is ignored outside test mode',
  );
  deepEqual(
    platform.nativeHostBrowsersFromEnvironment({
      FSB_NATIVE_HOST_TEST_MODE: '1',
      FSB_NATIVE_HOST_BROWSERS: 'edge, firefox,chrome,edge',
    }),
    ['edge', 'chrome'],
    'the test-mode browser override keeps known browsers once each',
  );
}

// Runs production operations in a child process whose HOME is a temporary
// directory, with the local-service probes replaced, so nothing here can
// reach the real home, the real browsers or a real daemon port.
const PRODUCTION_DRIVER = `
const [href, stepsJson] = process.argv.slice(1);
const production = await import(href);
const ops = production.createProductionNativeHostCliOperations({
  timing: { lockWaitMs: 3000, offlineTimeoutMs: 100 },
  daemon: {
    isOnline: async () => false,
    waitForOffline: async () => true,
    identifyListener: async () => ({ status: 'none' }),
    terminate: async () => false,
  },
});
const results = [];
for (const step of JSON.parse(stepsJson)) {
  if (step.op === 'ensure') results.push(await ops.ensure(step.request));
  else if (step.op === 'install') results.push(await ops.install(step.request));
  else if (step.op === 'uninstall') results.push(await ops.uninstall(step.request));
  else if (step.op === 'uninstallAll') results.push(await ops.uninstallAll(step.request));
  else if (step.op === 'writeOptOut') { ops.writeOptOut(step.reason); results.push(ops.readOptOut()); }
  else if (step.op === 'clearOptOut') { ops.clearOptOut(); results.push(ops.readOptOut()); }
  else if (step.op === 'readOptOut') results.push(ops.readOptOut());
}
process.stdout.write(JSON.stringify(results));
`;

function productionDriverEnvironment(home, browsers) {
  const environment = { ...process.env };
  delete environment.npm_execpath;
  for (const key of Object.keys(environment)) {
    if (key.startsWith('FSB_')) delete environment[key];
  }
  return {
    ...environment,
    HOME: home,
    USERPROFILE: home,
    FSB_NATIVE_HOST_TEST_MODE: '1',
    FSB_NATIVE_HOST_BROWSERS: browsers,
  };
}

function productionDriverArgs(steps) {
  return [
    '--input-type=module',
    '-e',
    PRODUCTION_DRIVER,
    pathToFileURL(path.join(repositoryRoot, 'mcp', 'build', 'native-host-production.js')).href,
    JSON.stringify(steps),
  ];
}

function runProductionSteps(home, steps, browsers = 'chrome,edge') {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, productionDriverArgs(steps), {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: productionDriverEnvironment(home, browsers),
    shell: false,
    timeout: 240_000,
  });
  if (result.status !== 0) {
    throw new Error(`production driver failed (${result.status}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function startProductionSteps(home, steps, browsers = 'chrome,edge') {
  const { spawn } = require('node:child_process');
  // Its own process group, so a test can kill the driver together with the
  // package-manager children its publish starts.
  const child = spawn(process.execPath, productionDriverArgs(steps), {
    cwd: repositoryRoot,
    env: productionDriverEnvironment(home, browsers),
    shell: false,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => {
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
  return { child, done };
}

async function runProductionEnsure() {
  if (process.platform === 'win32') {
    console.log('  SKIP: the temporary-home production run covers macOS and Linux');
    return;
  }
  const fs = require('node:fs');
  const os = require('node:os');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-native-ensure-')));
  const home = path.join(root, 'home');
  fs.mkdirSync(home, { recursive: true });
  const fsbRoot = path.join(home, '.fsb');
  const stableRoot = path.join(fsbRoot, 'native-host');
  const receiptPath = path.join(stableRoot, 'install-receipt.json');
  const markerPath = path.join(stableRoot, 'owner.json');
  const manifestName = `${HOST_NAME}.json`;
  const manifestPath = (browser) => (process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support', ...({
      chrome: ['Google', 'Chrome'],
      edge: ['Microsoft Edge'],
    })[browser], 'NativeMessagingHosts', manifestName)
    : path.join(home, '.config', ({
      chrome: 'google-chrome',
      edge: 'microsoft-edge',
    })[browser], 'NativeMessagingHosts', manifestName));
  const siblings = () => (fs.existsSync(fsbRoot)
    ? fs.readdirSync(fsbRoot).filter((name) => /^native-host\.(?:stage|next|retired|quarantine|remove)-/u.test(name))
    : []);
  const lowerVersion = () => {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    marker.packageVersion = '0.0.1';
    receipt.packageVersion = '0.0.1';
    receipt.marker = { ...marker };
    fs.writeFileSync(markerPath, `${JSON.stringify(marker)}\n`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);
  };
  const ensureRefresh = { op: 'ensure', request: { mode: 'refresh-only', browsers: 'auto', provenance: 'auto' } };
  try {
    {
      const [result] = runProductionSteps(home, [ensureRefresh]);
      equal(result.outcome, 'skipped-absent', 'production refresh-only never installs into an empty home');
      check(!fs.existsSync(stableRoot), 'production refresh-only creates no helper');
      check(!fs.existsSync(`${stableRoot}.lock`), 'production refresh-only takes no lock when nothing is installed');
    }
    {
      const [installed, current] = runProductionSteps(home, [
        {
          op: 'ensure',
          request: {
            mode: 'install',
            browsers: 'auto',
            extensionId: DEVELOPMENT_EXTENSION_ID,
            provenance: 'auto',
          },
        },
        ensureRefresh,
      ]);
      equal(installed.outcome, 'installed', 'production install-mode ensure installs the helper');
      deepEqual(installed.browsers, ['chrome', 'edge'], 'production install registers each test-mode browser');
      check(fs.existsSync(manifestPath('chrome')) && fs.existsSync(manifestPath('edge')), 'production install writes both manifests');
      equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).provenance, 'auto', 'production receipt records automatic provenance');
      check(fs.existsSync(path.join(fsbRoot, 'native-host-ensure.json')), 'production install writes the ensure stamp');
      equal(current.outcome, 'current', 'a second production ensure finds the helper current');
      check(!fs.existsSync(`${stableRoot}.lock`), 'production ensure releases its lock');
      deepEqual(siblings(), [], 'production install leaves no sibling directories');
    }
    {
      lowerVersion();
      const [refreshed] = runProductionSteps(home, [ensureRefresh]);
      equal(refreshed.outcome, 'refreshed', 'production refresh-only replaces an older exact helper');
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      equal(receipt.packageVersion, PACKAGE_VERSION, 'the refreshed receipt carries the running version');
      equal(receipt.origin, `chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`, 'a development extension id survives refresh');
      equal(receipt.provenance, 'auto', 'refresh keeps automatic provenance');
      deepEqual(
        JSON.parse(fs.readFileSync(manifestPath('chrome'), 'utf8')).allowed_origins,
        [`chrome-extension://${DEVELOPMENT_EXTENSION_ID}/`],
        'the Chrome manifest still allows only the development origin',
      );
      deepEqual(siblings(), [], 'production refresh leaves no sibling directories');
      check(!fs.existsSync(`${stableRoot}.stop-requested`), 'production refresh removes its stop request');
      check(!fs.existsSync(`${stableRoot}.lock`), 'production refresh releases its lock');
    }
    {
      lowerVersion();
      const first = startProductionSteps(home, [ensureRefresh]);
      const second = startProductionSteps(home, [ensureRefresh]);
      const outcomes = (await Promise.all([first.done, second.done])).map((run) => {
        if (run.status !== 0) throw new Error(`concurrent driver failed: ${run.stderr}`);
        return JSON.parse(run.stdout)[0].outcome;
      });
      equal(outcomes.filter((outcome) => outcome === 'refreshed').length, 1, 'two concurrent production ensures publish exactly once');
      check(
        outcomes.every((outcome) => ['refreshed', 'deferred', 'current'].includes(outcome)),
        'the other concurrent ensure defers or finds the helper current',
      );
      deepEqual(siblings(), [], 'concurrent ensures leave no orphan directories');
    }
    {
      lowerVersion();
      const victim = startProductionSteps(home, [ensureRefresh]);
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline && siblings().length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      check(siblings().length > 0, 'the publish under test created its stage');
      // A package-manager child that outlived its parent could recreate the
      // stage after cleanup, so the whole publishing group goes at once.
      process.kill(-victim.child.pid, 'SIGKILL');
      const killed = await victim.done;
      equal(killed.signal, 'SIGKILL', 'the publishing child was killed mid-way');
      check(fs.existsSync(`${stableRoot}.lock`), 'the killed publisher left its lock behind');
      const [recovered] = runProductionSteps(home, [ensureRefresh]);
      equal(recovered.outcome, 'refreshed', 'the next ensure breaks the dead lock and refreshes');
      deepEqual(siblings(), [], 'the next ensure deletes what the killed publisher left');
      check(!fs.existsSync(`${stableRoot}.lock`), 'the recovered ensure releases its lock');
    }
    {
      const [edge, optOut, skipped, cleared] = runProductionSteps(home, [
        { op: 'uninstall', request: { browser: 'edge' } },
        { op: 'writeOptOut', reason: 'uninstall --native-host' },
        ensureRefresh,
        { op: 'clearOptOut' },
      ], 'chrome');
      equal(edge.status, 'removed', 'production per-browser uninstall removes Edge');
      equal(edge.reason, 'registration-removed', 'production per-browser uninstall keeps the runtime for Chrome');
      check(!fs.existsSync(manifestPath('edge')), 'the Edge manifest is gone');
      check(fs.existsSync(manifestPath('chrome')) && fs.existsSync(stableRoot), 'Chrome keeps its manifest and the runtime');
      equal(optOut.reason, 'uninstall --native-host', 'the opt-out marker round-trips its reason');
      equal(skipped.outcome, 'skipped-opt-out', 'production refresh honors the opt-out marker');
      equal(cleared, null, 'clearing the opt-out removes the marker');
    }
    {
      const [removed] = runProductionSteps(home, [
        { op: 'uninstallAll', request: { onlyProvenance: 'auto' } },
      ], 'chrome');
      equal(removed.outcome, 'removed', 'production uninstall-all removes an automatic helper');
      deepEqual(removed.removedBrowsers, ['chrome'], 'production uninstall-all reports Chrome');
      check(!fs.existsSync(stableRoot) && !fs.existsSync(manifestPath('chrome')), 'nothing of the helper is left');
      deepEqual(siblings(), [], 'production uninstall-all leaves no sibling directories');
    }
    {
      const [installed, kept, removed] = runProductionSteps(home, [
        { op: 'install', request: {} },
        { op: 'uninstallAll', request: { onlyProvenance: 'auto' } },
        { op: 'uninstallAll', request: {} },
      ], 'chrome');
      equal(installed.status, 'installed', 'production explicit install still installs');
      equal(kept.outcome, 'kept', 'an explicit helper survives an automatic-only uninstall');
      equal(kept.provenance, 'explicit', 'the explicit helper reports its provenance');
      equal(removed.outcome, 'removed', 'uninstall-all without a filter removes the explicit helper');
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const production = await importBuild('native-host-production.js');
  {
    // The real port and listener probes, pointed at a port this test owns.
    // Nothing here is ever signalled.
    const net = require('node:net');
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const probeHome = require('node:fs').realpathSync(require('node:os').tmpdir());
    const probes = production.createProductionNativeHostDaemonStopAdapter({
      homeDirectory: probeHome,
      environment: {
        PATH: process.env.PATH,
        FSB_NATIVE_HOST_TEST_MODE: '1',
        FSB_NATIVE_HOST_TEST_SERVICE_PORT: String(port),
      },
    });
    check(await probes.isOnline(), 'the port probe sees a listening test port');
    const listener = await probes.identifyListener();
    check(
      listener.status === 'other' || listener.status === 'unknown',
      'a listener that is not the stable-root serve is never identified as it',
    );
    if (process.platform === 'darwin' || process.platform === 'linux') {
      equal(listener.status, 'other', 'the listener lookup finds this test process and rules it out');
    }
    equal(await probes.waitForOffline(0), false, 'a listening port is not offline');
    await new Promise((resolve) => server.close(resolve));
    check(!await probes.isOnline(), 'the port probe sees the closed test port as offline');
    equal(await probes.waitForOffline(100), true, 'waiting for a closed port returns at once');
    deepEqual(await probes.identifyListener(), { status: 'none' }, 'a closed port has no listener');
  }
  if (process.platform === 'darwin' || process.platform === 'linux') {
    // A stand-in for an older daemon: a process this test starts from a
    // temporary stable root's serve path, so only it can match.
    const fs = require('node:fs');
    const os = require('node:os');
    const net = require('node:net');
    const { spawn } = require('node:child_process');
    const fakeRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fsb-native-legacy-')));
    const fakeHome = path.join(fakeRoot, 'home');
    const buildIndex = path.join(fakeHome, '.fsb', 'native-host', 'runtime', 'package', 'build', 'index.js');
    fs.mkdirSync(path.dirname(buildIndex), { recursive: true });
    fs.writeFileSync(buildIndex, [
      "const server = require('node:net').createServer();",
      "server.listen(Number(process.env.FSB_TEST_PORT), '127.0.0.1', () => process.stdout.write('ready\\n'));",
      "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
      '',
    ].join('\n'));
    const portProbe = net.createServer();
    await new Promise((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
    const { port } = portProbe.address();
    await new Promise((resolve) => portProbe.close(resolve));
    const daemon = spawn(process.execPath, [buildIndex, 'serve', '--port', String(port)], {
      env: { PATH: process.env.PATH, FSB_TEST_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const exited = new Promise((resolve) => daemon.once('exit', (code, signal) => resolve({ code, signal })));
    try {
      await new Promise((resolve, reject) => {
        daemon.stdout.once('data', resolve);
        daemon.once('error', reject);
      });
      const probes = production.createProductionNativeHostDaemonStopAdapter({
        homeDirectory: fakeHome,
        environment: {
          PATH: process.env.PATH,
          FSB_NATIVE_HOST_TEST_MODE: '1',
          FSB_NATIVE_HOST_TEST_SERVICE_PORT: String(port),
        },
      });
      const listener = await probes.identifyListener();
      equal(listener.status, 'stable-root', 'a serve started from the stable root is identified by its command line');
      equal(listener.pid, daemon.pid, 'the identified pid is the listening serve process');
      check(await probes.terminate(listener.pid), 'the confirmed stable-root serve is sent a terminate signal');
      equal(await probes.waitForOffline(5000), true, 'the terminated serve releases the port');
      equal((await exited).code, 0, 'the serve ran its own graceful shutdown');
    } finally {
      if (daemon.exitCode === null && daemon.signalCode === null) daemon.kill('SIGKILL');
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  }
  check(
    production.isStableRootServeCommand(
      'linux',
      ['/usr/bin/node', '/home/fsb/.fsb/native-host/runtime/package/build/index.js', 'serve', '--port', '7226'],
      '/home/fsb/.fsb/native-host',
    ),
    'a stable-root serve argv is recognized',
  );
  check(
    !production.isStableRootServeCommand(
      'linux',
      ['/usr/bin/node', '/home/fsb/project/mcp/build/index.js', 'serve'],
      '/home/fsb/.fsb/native-host',
    ),
    'a serve from any other checkout is never the stable-root daemon',
  );
  check(
    !production.isStableRootServeCommand(
      'darwin',
      '/opt/homebrew/bin/node /Users/fsb/.fsb/native-host/runtime/package/build/index.js stdio',
      '/Users/fsb/.fsb/native-host',
    ),
    'a stable-root process that is not serve is never targeted',
  );
  check(
    production.isStableRootServeCommand(
      'darwin',
      '/opt/homebrew/bin/node /Users/fsb/.fsb/native-host/runtime/package/build/index.js serve --host 127.0.0.1 --port 7226',
      '/Users/fsb/.fsb/native-host',
    ),
    'a macOS ps command line for the stable-root serve is recognized',
  );
  check(
    production.isStableRootServeCommand(
      'win32',
      '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\fsb\\AppData\\Local\\FSB\\NativeMessagingHost\\runtime\\package\\build\\index.js" serve --port 7226',
      'C:\\Users\\fsb\\AppData\\Local\\FSB\\NativeMessagingHost',
    ),
    'a quoted Windows command line for the stable-root serve is recognized',
  );
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
  if (!requestedSection || requestedSection === 'doctor-browser-selection') {
    console.log('\n=== Native doctor browser selection ===');
    await runDoctorBrowserSelection();
  }
  if (!requestedSection || requestedSection === 'ensure-transaction') {
    console.log('\n=== Ensure, refresh, per-browser registration and uninstall-all ===');
    await runEnsureTransaction();
  }
  if (!requestedSection || requestedSection === 'browser-detection') {
    console.log('\n=== Browser detection ===');
    await runBrowserDetection();
  }
  if (!requestedSection || requestedSection === 'production-ensure') {
    console.log('\n=== Production ensure in a temporary home ===');
    await runProductionEnsure();
  }
  console.log(`\nNative host install tests: ${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
