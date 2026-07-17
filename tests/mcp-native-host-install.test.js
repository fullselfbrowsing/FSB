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
  const trace = [];
  const manifestFacts = new Map(options.manifestFacts || []);
  const registryFacts = new Map(options.registryFacts || []);
  const dependencies = {
    files: {
      inspectFile: async (pathname, maxBytes) => {
        trace.push(`file:read:${pathname}:${maxBytes}`);
        return manifestFacts.get(pathname) || Object.freeze({ status: 'absent' });
      },
      writePrivateFileAtomic: async (pathname, contents, mode) => {
        trace.push(`file:write:${pathname}:${mode.toString(8)}`);
        manifestFacts.set(pathname, Object.freeze({
          status: 'file',
          path: pathname,
          realPath: pathname,
          contents,
        }));
      },
      removeFile: async (pathname) => {
        trace.push(`file:delete:${pathname}`);
        manifestFacts.delete(pathname);
      },
    },
    registry: {
      readDefault: async (view, key) => {
        trace.push(`registry:read:${view}:${key}`);
        return registryFacts.get(view) || Object.freeze({ status: 'absent' });
      },
      writeDefault: async (view, key, value) => {
        trace.push(`registry:write:${view}:${key}:${value.type}`);
        registryFacts.set(view, Object.freeze({ status: 'value', ...value }));
      },
      deleteDefault: async (view, key) => {
        trace.push(`registry:delete:${view}:${key}`);
        registryFacts.delete(view);
      },
      inspectKey: async (view, key) => {
        trace.push(`registry:key:${view}:${key}`);
        return Object.freeze({ status: 'empty' });
      },
      deleteEmptyKey: async (view, key) => {
        trace.push(`registry:key-delete:${view}:${key}`);
      },
    },
  };
  return { dependencies, manifestFacts, registryFacts, trace };
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
        readTrace.filter((entry) => entry.startsWith('registry:read:')).map((entry) => entry.split(':').slice(2, 4).join('/')),
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

async function main() {
  if (!requestedSection || requestedSection === 'platform-and-registration') {
    console.log('\n=== Platform and registration ===');
    await runPlatformAndRegistration();
  }
  if (!requestedSection || requestedSection === 'runtime-transaction') {
    if (requestedSection) throw new Error('runtime-transaction section is not implemented yet');
  }
  if (!requestedSection || requestedSection === 'install-transaction') {
    if (requestedSection) throw new Error('install-transaction section is not implemented yet');
  }
  console.log(`\nNative host install tests: ${passed} passed, 0 failed`);
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
