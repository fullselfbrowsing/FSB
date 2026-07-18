#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..');
const HOST_KEY =
  'Software\\Google\\Chrome\\NativeMessagingHosts\\io.github.fullselfbrowsing.fsb_native_host';
const PACKAGE_VERSION = require('../mcp/package.json').version;
const ROLE_MARKERS = Object.freeze({
  bootstrap: 'fsb-native-host-bootstrap-v1',
  'registry-helper': 'fsb-native-host-registry-helper-v1',
});
const MACHINE = Object.freeze({ x64: 0x8664, arm64: 0xaa64 });
let passed = 0;

function pass(message) {
  passed += 1;
  console.log('  PASS:', message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function syntheticPe(architecture, role) {
  const strings = [PACKAGE_VERSION, ROLE_MARKERS[role]]
    .map((value) => Buffer.from(`${value}\0`, 'utf16le'));
  const bytes = Buffer.alloc(0x100 + strings.reduce((sum, value) => sum + value.length, 0));
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(0x80, 0x3c);
  bytes.write('PE\0\0', 0x80, 'ascii');
  bytes.writeUInt16LE(MACHINE[architecture], 0x84);
  let offset = 0x100;
  for (const value of strings) {
    value.copy(bytes, offset);
    offset += value.length;
  }
  return bytes;
}

function writeArtifactSet(packageRoot) {
  const artifacts = [];
  for (const architecture of ['x64', 'arm64']) {
    for (const role of ['bootstrap', 'registry-helper']) {
      const filename = role === 'bootstrap'
        ? 'fsb-native-host.exe'
        : 'fsb-native-host-registry.exe';
      const relativePath = `native-host/bin/win32-${architecture}/${filename}`;
      const pathname = path.join(packageRoot, ...relativePath.split('/'));
      const bytes = syntheticPe(architecture, role);
      mkdirSync(path.dirname(pathname), { recursive: true });
      writeFileSync(pathname, bytes);
      artifacts.push({
        architecture,
        role,
        path: relativePath,
        bytes: bytes.length,
        peMachine: `0x${MACHINE[architecture].toString(16)}`,
        sha256: sha256(bytes),
        packageVersion: PACKAGE_VERSION,
        roleMarker: ROLE_MARKERS[role],
      });
    }
  }
  writeFileSync(path.join(packageRoot, 'native-host/windows-artifacts.json'), `${JSON.stringify({
    schema: 2,
    package: 'fsb-mcp-server',
    version: PACKAGE_VERSION,
    artifacts,
  }, null, 2)}\n`);
  return artifacts;
}

function response(operation, status, registryType = 0, value = '') {
  return `${JSON.stringify({
    schema: 1,
    operation,
    status,
    registryType,
    valueUtf8Hex: Buffer.from(value, 'utf8').toString('hex'),
  })}\n`;
}

async function importHelper() {
  const href = pathToFileURL(path.join(
    repositoryRoot,
    'mcp/build/native-host-registry-helper.js',
  )).href;
  return import(`${href}?security63=${Date.now()}-${Math.random()}`);
}

async function withFixture(action) {
  const createdRoot = mkdtempSync(path.join(os.tmpdir(), 'fsb-registry-helper-'));
  const packageRoot = realpathSync(createdRoot);
  try {
    const artifacts = writeArtifactSet(packageRoot);
    await action({ packageRoot, artifacts });
  } finally {
    rmSync(createdRoot, { recursive: true, force: true });
  }
}

async function testStructuredFacts(helper) {
  await withFixture(async ({ packageRoot }) => {
    const outputs = [
      response(1, 2, 1, 'C:\\FSB\\manifest.json'),
      response(2, 1),
      response(1, 2, 2),
      '    (Default)    REG_SZ    C:\\host.json\r\n',
      '    (Par defaut)    REG_SZ    C:\\host.json\r\n',
      '{"schema":1',
      'x'.repeat(16 * 1024 + 1),
    ];
    const invocations = [];
    const adapter = helper.createNativeHostRegistryHelperAdapter({
      packageRoot,
      packageVersion: PACKAGE_VERSION,
      architecture: 'x64',
      process: {
        run: async (invocation) => {
          invocations.push(invocation);
          return { status: 0, stdout: outputs.shift(), stderr: '', networkRequests: 0 };
        },
      },
    });
    assert.deepEqual(await adapter.readDefault('user/32', HOST_KEY), {
      status: 'value', type: 'REG_SZ', value: 'C:\\FSB\\manifest.json',
    });
    assert.deepEqual(await adapter.readDefault('user/64', HOST_KEY), { status: 'absent' });
    assert.deepEqual(await adapter.readDefault('user/32', HOST_KEY), {
      status: 'value', type: 'REG_TYPE_2', value: '',
    });
    for (const label of ['English label', 'localized label', 'truncated', 'oversize']) {
      assert.deepEqual(await adapter.readDefault('user/32', HOST_KEY), { status: 'unavailable' });
      pass(`${label} output is never classified absent`);
    }
    assert.equal(invocations.every((entry) => (
      path.isAbsolute(entry.executable)
      && entry.shell === false
      && entry.isolatedEnvironment === true
      && Object.keys(entry.environment).length === 0
    )), true);
    pass('valid helper calls use an absolute shell:false process with no inherited environment');
  });
}

async function testClosedMutationSurface(helper) {
  await withFixture(async ({ packageRoot }) => {
    const operations = [];
    const adapter = helper.createNativeHostRegistryHelperAdapter({
      packageRoot,
      packageVersion: PACKAGE_VERSION,
      architecture: 'x64',
      process: {
        run: async (invocation) => {
          operations.push(invocation.argv[1]);
          return {
            status: 0,
            stdout: response(Number(invocation.argv[1]), 6),
            stderr: '',
            networkRequests: 0,
          };
        },
      },
    });
    await assert.rejects(
      adapter.writeDefault('user/64', HOST_KEY, { type: 'REG_SZ', value: 'C:\\x.json' }),
      /registry-helper-refused/,
    );
    await assert.rejects(
      adapter.deleteDefault('user/64', HOST_KEY),
      /registry-helper-refused/,
    );
    await assert.rejects(
      adapter.deleteEmptyKey('user/64', HOST_KEY),
      /registry-helper-refused/,
    );
    await assert.rejects(
      adapter.writeDefault('user/32', `${HOST_KEY}\\foreign`, {
        type: 'REG_SZ', value: 'C:\\x.json',
      }),
      /registry-helper-refused/,
    );
    assert.deepEqual(operations, []);
    pass('user/64 and arbitrary-key mutations have zero spawn authority');
  });
}

async function testExactOperations(helper) {
  await withFixture(async ({ packageRoot }) => {
    const invocations = [];
    const adapter = helper.createNativeHostRegistryHelperAdapter({
      packageRoot,
      packageVersion: PACKAGE_VERSION,
      architecture: 'arm64',
      process: {
        run: async (invocation) => {
          invocations.push(invocation);
          const operation = Number(invocation.argv[1]);
          const status = operation === 3 ? 4 : 6;
          return {
            status: 0,
            stdout: response(operation, status),
            stderr: '',
            networkRequests: 0,
          };
        },
      },
    });
    assert.deepEqual(await adapter.inspectKey('user/32', HOST_KEY), {
      status: 'exact-default-only',
    });
    await adapter.writeDefault('user/32', HOST_KEY, {
      type: 'REG_SZ', value: 'C:\\FSB\\manifest.json',
    });
    await adapter.deleteDefault('user/32', HOST_KEY);
    await adapter.deleteEmptyKey('user/32', HOST_KEY);
    assert.deepEqual(invocations.map((entry) => Number(entry.argv[1])), [3, 4, 5, 6]);
    assert.equal(
      invocations.every((entry) => entry.executable.includes('win32-arm64')),
      true,
    );
    const write = invocations[1];
    assert.equal(write.argv.length, 2, 'manifest path escaped the closed argv protocol');
    assert.equal(JSON.stringify(write.environment).includes('manifest.json'), false);
    const stdin = Buffer.from(write.stdin);
    assert.equal(stdin.subarray(0, 8).toString('ascii'), 'FSBRGI1\0');
    assert.equal(stdin.readUInt32LE(8), 1);
    assert.equal(stdin.readUInt32LE(12), Buffer.byteLength('C:\\FSB\\manifest.json'));
    pass('only exact user/32 mutations use the selected architecture and framed stdin');
  });
}

async function testMalformedShadowBlocksMutation(helper, platform) {
  for (const malformed of [
    '    (Par defaut)    REG_SZ    C:\\host.json\r\n',
    '{"schema":1',
    'x'.repeat(16 * 1024 + 1),
  ]) {
    await withFixture(async ({ packageRoot }) => {
      const operations = [];
      let fileWrites = 0;
      const registry = helper.createNativeHostRegistryHelperAdapter({
        packageRoot,
        packageVersion: PACKAGE_VERSION,
        architecture: 'x64',
        process: {
          run: async (invocation) => {
            operations.push(Number(invocation.argv[1]));
            return { status: 0, stdout: malformed, stderr: '', networkRequests: 0 };
          },
        },
      });
      const layout = platform.resolveNativeHostPlatformLayout({
        platform: 'win32',
        homeDirectory: 'C:\\Users\\fsb',
        localAppData: 'C:\\Users\\fsb\\AppData\\Local',
      });
      const adapter = platform.createNativeHostPlatformAdapter(layout, {
        files: {
          inspectFile: async () => ({ status: 'absent' }),
          writePrivateFileAtomic: async () => { fileWrites += 1; },
          removeFile: async () => undefined,
        },
        registry,
      });
      await assert.rejects(adapter.publishRegistration('{}'), /FSBNH_INSTALL_PLATFORM/);
      assert.deepEqual(operations, [2]);
      assert.equal(fileWrites, 0);
    });
  }
  pass('malformed, truncated, and oversized shadow facts block all registration mutation');
}

async function testProcessFailuresAreContentFree(helper) {
  await withFixture(async ({ packageRoot }) => {
    const sensitive = 'C:\\Users\\victim\\secret-manifest.json';
    const adapter = helper.createNativeHostRegistryHelperAdapter({
      packageRoot,
      packageVersion: PACKAGE_VERSION,
      architecture: 'x64',
      process: { run: async () => { throw new Error(sensitive); } },
    });
    assert.deepEqual(await adapter.readDefault('user/64', HOST_KEY), { status: 'unavailable' });
    await assert.rejects(
      adapter.writeDefault('user/32', HOST_KEY, { type: 'REG_SZ', value: sensitive }),
      (error) => error.message === 'registry-helper-failed' && !error.message.includes(sensitive),
    );
    pass('process failures collapse to bounded content-free facts and errors');
  });
}

async function testTamperAndHostileEnvironment(helper) {
  const originalPath = process.env.PATH;
  const originalRoot = process.env.SystemRoot;
  process.env.PATH = 'C:\\hostile';
  process.env.SystemRoot = 'C:\\hostile-root';
  try {
    for (const tamper of ['path', 'hash', 'role', 'architecture', 'version', 'symlink']) {
      await withFixture(async ({ packageRoot, artifacts }) => {
        const metadataPath = path.join(packageRoot, 'native-host/windows-artifacts.json');
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
        const selected = metadata.artifacts.find((entry) => (
          entry.architecture === 'x64' && entry.role === 'registry-helper'
        ));
        if (tamper === 'path') selected.path = 'native-host/bin/win32-x64/elsewhere.exe';
        if (tamper === 'hash') selected.sha256 = '0'.repeat(64);
        if (tamper === 'role') selected.roleMarker = ROLE_MARKERS.bootstrap;
        if (tamper === 'architecture') selected.peMachine = '0xaa64';
        if (tamper === 'version') selected.packageVersion = '9.9.9';
        writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`);
        if (tamper === 'symlink') {
          const artifact = artifacts.find((entry) => (
            entry.architecture === 'x64' && entry.role === 'registry-helper'
          ));
          const target = path.join(packageRoot, ...artifact.path.split('/'));
          const moved = `${target}.real`;
          writeFileSync(moved, readFileSync(target));
          rmSync(target);
          symlinkSync(moved, target);
        }
        let spawnCount = 0;
        const adapter = helper.createNativeHostRegistryHelperAdapter({
          packageRoot,
          packageVersion: PACKAGE_VERSION,
          architecture: 'x64',
          process: {
            run: async () => {
              spawnCount += 1;
              return { status: 0, stdout: response(1, 1), stderr: '', networkRequests: 0 };
            },
          },
        });
        assert.deepEqual(await adapter.readDefault('user/32', HOST_KEY), {
          status: 'unavailable',
        });
        assert.equal(spawnCount, 0, `${tamper} tamper spawned a process`);
        pass(`${tamper} tamper fails closed before spawn`);
      });
    }
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = originalRoot;
  }
}

async function main() {
  const helper = await importHelper();
  const platform = await import(`${pathToFileURL(path.join(
    repositoryRoot,
    'mcp/build/native-host-install/platform.js',
  )).href}?security63platform=${Date.now()}`);
  await testStructuredFacts(helper);
  await testClosedMutationSurface(helper);
  await testExactOperations(helper);
  await testMalformedShadowBlocksMutation(helper, platform);
  await testProcessFailuresAreContentFree(helper);
  await testTamperAndHostileEnvironment(helper);
  console.log(`mcp-native-host-registry-helper: ${passed} assertions passed`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
