#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), '..');
const packageJsonPath = resolve(repositoryRoot, 'mcp/package.json');
const artifactByRole = Object.freeze({
  bootstrap: Object.freeze({
    source: 'mcp/native-host/windows/fsb-native-host-bootstrap.c',
    resource: 'mcp/native-host/windows/fsb-native-host-bootstrap-version.rc.in',
    filename: 'fsb-native-host.exe',
    roleMarker: 'fsb-native-host-bootstrap-v1',
    libraries: Object.freeze([]),
  }),
  'registry-helper': Object.freeze({
    source: 'mcp/native-host/windows/fsb-native-host-registry.c',
    resource: 'mcp/native-host/windows/fsb-native-host-registry-version.rc.in',
    filename: 'fsb-native-host-registry.exe',
    roleMarker: 'fsb-native-host-registry-helper-v1',
    libraries: Object.freeze(['Advapi32.lib']),
  }),
});
const machineByArchitecture = Object.freeze({
  x64: 0x8664,
  arm64: 0xaa64,
});
const outputDirectoryByArchitecture = Object.freeze({
  x64: 'mcp/native-host/bin/win32-x64',
  arm64: 'mcp/native-host/bin/win32-arm64',
});

function parseArguments(argv) {
  const options = {
    architectures: [],
    metadataOut: null,
    verifyOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--arch') {
      const value = argv[index + 1];
      index += 1;
      if (value === 'all') options.architectures.push('x64', 'arm64');
      else if (Object.hasOwn(machineByArchitecture, value)) options.architectures.push(value);
      else throw new Error('--arch must be x64, arm64, or all');
      continue;
    }
    if (argument === '--metadata-out') {
      const value = argv[index + 1];
      index += 1;
      if (!value || value.includes('\0')) throw new Error('--metadata-out requires a path');
      options.metadataOut = resolve(repositoryRoot, value);
      continue;
    }
    if (argument === '--verify-only') {
      options.verifyOnly = true;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  options.architectures = [...new Set(options.architectures)];
  if (options.architectures.length === 0) throw new Error('at least one --arch is required');
  return Object.freeze(options);
}

function runExecutable(executable, argv, options = {}) {
  const result = spawnSync(executable, argv, {
    cwd: options.cwd || repositoryRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: options.capture === false ? 'inherit' : 'pipe',
  });
  if (result.error || result.signal || result.status !== 0) {
    const detail = options.capture === false
      ? ''
      : `\nstdout:\n${result.stdout || ''}\nstderr:\n${result.stderr || ''}`;
    throw new Error(`${executable} failed${detail}`);
  }
}

function versionParts(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package version must be numeric semver');
  return [...version.split('.').map(Number), 0];
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readPeMachine(bytes) {
  if (bytes.length < 0x40 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error('artifact is not a PE executable');
  }
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset + 6 > bytes.length || bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\0\0') {
    throw new Error('artifact has an invalid PE header');
  }
  return bytes.readUInt16LE(peOffset + 4);
}

function verifyArtifact(architecture, role, version) {
  const specification = artifactByRole[role];
  const outputPath = resolve(
    repositoryRoot,
    outputDirectoryByArchitecture[architecture],
    specification.filename,
  );
  if (!existsSync(outputPath)) throw new Error(`missing ${architecture} ${role} artifact`);
  const bytes = readFileSync(outputPath);
  const machine = readPeMachine(bytes);
  if (machine !== machineByArchitecture[architecture]) {
    throw new Error(`${architecture} ${role} has PE machine 0x${machine.toString(16)}`);
  }
  const encodedVersion = Buffer.from(`${version}\0`, 'utf16le');
  if (bytes.indexOf(encodedVersion) === -1) {
    throw new Error(`${architecture} ${role} is missing embedded package version`);
  }
  const encodedRole = Buffer.from(`${specification.roleMarker}\0`, 'utf16le');
  if (bytes.indexOf(encodedRole) === -1) {
    throw new Error(`${architecture} ${role} is missing embedded role marker`);
  }
  return Object.freeze({
    architecture,
    role,
    path: relative(resolve(repositoryRoot, 'mcp'), outputPath).replaceAll('\\', '/'),
    bytes: bytes.length,
    peMachine: `0x${machine.toString(16)}`,
    sha256: sha256(bytes),
    packageVersion: version,
    roleMarker: specification.roleMarker,
  });
}

function buildArtifact(architecture, role, version) {
  const specification = artifactByRole[role];
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), `fsb-native-host-${architecture}-`));
  try {
    const outputDirectory = resolve(
      repositoryRoot,
      outputDirectoryByArchitecture[architecture],
    );
    const outputPath = resolve(outputDirectory, specification.filename);
    const resourcePath = resolve(temporaryDirectory, `${role}-version.rc`);
    const resourceOutput = resolve(temporaryDirectory, `${role}-version.res`);
    const objectOutput = resolve(temporaryDirectory, `${role}.obj`);
    const template = readFileSync(resolve(repositoryRoot, specification.resource), 'utf8');
    const parts = versionParts(version);
    const resourceSource = template
      .replace('@FSB_VERSION_COMMA@', parts.join(','))
      .replaceAll('@FSB_VERSION_STRING@', version);
    writeFileSync(resourcePath, resourceSource);
    mkdirSync(outputDirectory, { recursive: true });
    runExecutable('rc.exe', ['/nologo', `/fo${resourceOutput}`, resourcePath]);
    runExecutable('cl.exe', [
      '/nologo',
      '/std:c17',
      '/W4',
      '/WX',
      '/O2',
      '/MT',
      '/guard:cf',
      '/DUNICODE',
      '/D_UNICODE',
      '/utf-8',
      `/Fo${objectOutput}`,
      resolve(repositoryRoot, specification.source),
      resourceOutput,
      ...specification.libraries,
      `/Fe:${outputPath}`,
      '/link',
      '/SUBSYSTEM:CONSOLE',
      '/DYNAMICBASE',
      '/NXCOMPAT',
      '/HIGHENTROPYVA',
      '/INCREMENTAL:NO',
    ]);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function main() {
  if (process.platform !== 'win32') {
    throw new Error('Windows bootstrap artifacts must be built and verified on Windows');
  }
  const options = parseArguments(process.argv.slice(2));
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson.version;
  const artifacts = [];
  for (const architecture of options.architectures) {
    for (const role of Object.keys(artifactByRole)) {
      if (!options.verifyOnly) buildArtifact(architecture, role, version);
      artifacts.push(verifyArtifact(architecture, role, version));
    }
  }
  const metadata = Object.freeze({
    schema: 2,
    package: packageJson.name,
    version,
    artifacts,
  });
  if (options.metadataOut) {
    mkdirSync(dirname(options.metadataOut), { recursive: true });
    writeFileSync(options.metadataOut, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`[native-host-windows-build] ${error instanceof Error ? error.message : 'failed'}`);
  process.exitCode = 1;
}
