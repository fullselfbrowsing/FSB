import { createHash } from 'node:crypto';
import { constants as fsConstants, lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import {
  NATIVE_HOST_PACKAGE_NAME,
  NATIVE_HOST_WINDOWS_BOOTSTRAP_ROLE_MARKER,
  NATIVE_HOST_WINDOWS_REGISTRY_HELPER_ROLE_MARKER,
  NATIVE_HOST_WINDOWS_REGISTRY_KEY,
} from './native-host/constants.js';
import type {
  NativeHostInstallRegistryAdapter,
  NativeHostProcessInvocation,
  NativeHostProcessMaterializer,
  NativeHostProcessResult,
  NativeHostRegistryKeyFact,
  NativeHostRegistryView,
  NativeHostRegistryValueFact,
  NativeHostWindowsArchitecture,
} from './native-host-install/types.js';

const PROTOCOL = 'fsb-native-host-registry-v1';
const METADATA_RELATIVE_PATH = 'native-host/windows-artifacts.json';
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024;
const MAX_VALUE_BYTES = 4096;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

const OPERATION = Object.freeze({
  query32: 1,
  query64: 2,
  inspect32: 3,
  write32: 4,
  deleteValue32: 5,
  deleteEmptyKey32: 6,
});

type RegistryOperation = typeof OPERATION[keyof typeof OPERATION];
type ArtifactRole = 'bootstrap' | 'registry-helper';

type HelperOptions = Readonly<{
  packageRoot: string;
  packageVersion: string;
  architecture: NativeHostWindowsArchitecture | string;
  process: NativeHostProcessMaterializer;
}>;

type HelperResponse = Readonly<{
  schema: 1;
  operation: number;
  status: number;
  registryType: number;
  valueUtf8Hex: string;
}>;

function ordinaryRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const output: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    output[key] = descriptor.value;
  }
  return output;
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length
    && actual.every((key, index) => key === sorted[index]);
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

async function readBoundedRegular(pathname: string, maxBytes: number): Promise<Buffer> {
  const before = await lstat(pathname);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > maxBytes) {
    throw new Error('registry-helper-unavailable');
  }
  const resolved = await realpath(pathname);
  if (!samePath(resolved, resolve(pathname))) throw new Error('registry-helper-unavailable');
  const handle = await open(
    pathname,
    fsConstants.O_RDONLY | (process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW),
  );
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size !== before.size || current.size > maxBytes) {
      throw new Error('registry-helper-unavailable');
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function expectedArtifact(
  architecture: NativeHostWindowsArchitecture,
  role: ArtifactRole,
): Readonly<{ path: string; peMachine: string; roleMarker: string }> {
  const filename = role === 'bootstrap'
    ? 'fsb-native-host.exe'
    : 'fsb-native-host-registry.exe';
  return Object.freeze({
    path: `native-host/bin/win32-${architecture}/${filename}`,
    peMachine: architecture === 'x64' ? '0x8664' : '0xaa64',
    roleMarker: role === 'bootstrap'
      ? NATIVE_HOST_WINDOWS_BOOTSTRAP_ROLE_MARKER
      : NATIVE_HOST_WINDOWS_REGISTRY_HELPER_ROLE_MARKER,
  });
}

function embeddedUtf16(bytes: Buffer, value: string): boolean {
  return bytes.indexOf(Buffer.from(`${value}\0`, 'utf16le')) >= 0;
}

function peMachine(bytes: Buffer): string | null {
  if (bytes.length < 0x40 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return null;
  const offset = bytes.readUInt32LE(0x3c);
  if (offset + 6 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0') {
    return null;
  }
  return `0x${bytes.readUInt16LE(offset + 4).toString(16)}`;
}

async function validateHelper(options: HelperOptions): Promise<string> {
  if (
    !isAbsolute(options.packageRoot)
    || !VERSION_PATTERN.test(options.packageVersion)
    || (options.architecture !== 'x64' && options.architecture !== 'arm64')
  ) {
    throw new Error('registry-helper-unavailable');
  }
  const packageRealPath = await realpath(options.packageRoot);
  if (!samePath(packageRealPath, resolve(options.packageRoot))) {
    throw new Error('registry-helper-unavailable');
  }
  const metadataBytes = await readBoundedRegular(
    join(options.packageRoot, ...METADATA_RELATIVE_PATH.split('/')),
    MAX_METADATA_BYTES,
  );
  const fields = ordinaryRecord(JSON.parse(metadataBytes.toString('utf8')) as unknown);
  if (
    !fields
    || !exactKeys(fields, ['schema', 'package', 'version', 'artifacts'])
    || fields.schema !== 2
    || fields.package !== NATIVE_HOST_PACKAGE_NAME
    || fields.version !== options.packageVersion
    || !Array.isArray(fields.artifacts)
    || fields.artifacts.length !== 4
  ) {
    throw new Error('registry-helper-unavailable');
  }

  let selected: Readonly<Record<string, unknown>> | null = null;
  const roster: ReadonlyArray<readonly [NativeHostWindowsArchitecture, ArtifactRole]> = [
    ['x64', 'bootstrap'],
    ['x64', 'registry-helper'],
    ['arm64', 'bootstrap'],
    ['arm64', 'registry-helper'],
  ];
  for (let index = 0; index < roster.length; index += 1) {
    const [architecture, role] = roster[index];
    const artifact = ordinaryRecord(fields.artifacts[index]);
    const expected = expectedArtifact(architecture, role);
    if (
      !artifact
      || !exactKeys(artifact, [
        'architecture', 'role', 'path', 'bytes', 'peMachine', 'sha256',
        'packageVersion', 'roleMarker',
      ])
      || artifact.architecture !== architecture
      || artifact.role !== role
      || artifact.path !== expected.path
      || artifact.peMachine !== expected.peMachine
      || artifact.packageVersion !== options.packageVersion
      || artifact.roleMarker !== expected.roleMarker
      || !Number.isSafeInteger(artifact.bytes)
      || Number(artifact.bytes) < 64
      || Number(artifact.bytes) > MAX_ARTIFACT_BYTES
      || typeof artifact.sha256 !== 'string'
      || !SHA256_PATTERN.test(artifact.sha256)
    ) {
      throw new Error('registry-helper-unavailable');
    }
    if (architecture === options.architecture && role === 'registry-helper') selected = artifact;
  }
  if (!selected) throw new Error('registry-helper-unavailable');
  const pathname = join(options.packageRoot, ...String(selected.path).split('/'));
  const bytes = await readBoundedRegular(pathname, MAX_ARTIFACT_BYTES);
  if (
    bytes.length !== selected.bytes
    || createHash('sha256').update(bytes).digest('hex') !== selected.sha256
    || peMachine(bytes) !== selected.peMachine
    || !embeddedUtf16(bytes, options.packageVersion)
    || !embeddedUtf16(bytes, NATIVE_HOST_WINDOWS_REGISTRY_HELPER_ROLE_MARKER)
  ) {
    throw new Error('registry-helper-unavailable');
  }
  return pathname;
}

function parseResponse(
  operation: RegistryOperation,
  result: NativeHostProcessResult,
): HelperResponse | null {
  const resultFields = ordinaryRecord(result);
  if (
    !resultFields
    || resultFields.status !== 0
    || resultFields.networkRequests !== 0
    || typeof resultFields.stdout !== 'string'
    || typeof resultFields.stderr !== 'string'
    || resultFields.stderr !== ''
    || Buffer.byteLength(resultFields.stdout, 'utf8') > MAX_OUTPUT_BYTES
  ) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultFields.stdout);
  } catch {
    return null;
  }
  const fields = ordinaryRecord(parsed);
  if (
    !fields
    || !exactKeys(fields, ['schema', 'operation', 'status', 'registryType', 'valueUtf8Hex'])
    || fields.schema !== 1
    || fields.operation !== operation
    || !Number.isSafeInteger(fields.status)
    || !Number.isSafeInteger(fields.registryType)
    || Number(fields.registryType) < 0
    || Number(fields.registryType) > 0xffffffff
    || typeof fields.valueUtf8Hex !== 'string'
    || fields.valueUtf8Hex.length > MAX_VALUE_BYTES * 2
    || !/^(?:[0-9a-f]{2})*$/u.test(fields.valueUtf8Hex)
  ) return null;
  return Object.freeze({
    schema: 1,
    operation,
    status: Number(fields.status),
    registryType: Number(fields.registryType),
    valueUtf8Hex: fields.valueUtf8Hex,
  });
}

function decodedValue(hex: string): string | null {
  try {
    const bytes = Buffer.from(hex, 'hex');
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (Buffer.from(value, 'utf8').toString('hex') !== hex || value.includes('\0')) return null;
    return value;
  } catch {
    return null;
  }
}

function writeInput(value: string): Uint8Array {
  const bytes = Buffer.from(value, 'utf8');
  if (
    bytes.length < 1
    || bytes.length > MAX_VALUE_BYTES
    || value.includes('\0')
    || value.includes('\r')
    || value.includes('\n')
  ) throw new Error('registry-helper-refused');
  const header = Buffer.alloc(16);
  header.write('FSBRGI1\0', 0, 'ascii');
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(bytes.length, 12);
  return Buffer.concat([header, bytes]);
}

function safeReadKey(view: string, key: string): boolean {
  return (view === 'user/32' || view === 'user/64') && key === NATIVE_HOST_WINDOWS_REGISTRY_KEY;
}

function safeMutation(view: string, key: string): boolean {
  return view === 'user/32' && key === NATIVE_HOST_WINDOWS_REGISTRY_KEY;
}

export function createNativeHostRegistryHelperAdapter(
  options: HelperOptions,
): NativeHostInstallRegistryAdapter {
  const invoke = async (
    operation: RegistryOperation,
    stdin?: Uint8Array,
  ): Promise<HelperResponse | null> => {
    const executable = await validateHelper(options);
    const invocation: NativeHostProcessInvocation = Object.freeze({
      executable,
      argv: Object.freeze([PROTOCOL, String(operation)]),
      cwd: options.packageRoot,
      environment: Object.freeze({}),
      ...(stdin ? { stdin } : {}),
      isolatedEnvironment: true,
      shell: false,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });
    return parseResponse(operation, await options.process.run(invocation));
  };

  return Object.freeze({
    readDefault: async (
      view: NativeHostRegistryView,
      key: string,
    ): Promise<NativeHostRegistryValueFact> => {
      if (!safeReadKey(view, key)) return Object.freeze({ status: 'unavailable' });
      try {
        const operation = view === 'user/32' ? OPERATION.query32 : OPERATION.query64;
        const response = await invoke(operation);
        if (!response) return Object.freeze({ status: 'unavailable' });
        if (response.status === 1 && response.registryType === 0 && response.valueUtf8Hex === '') {
          return Object.freeze({ status: 'absent' });
        }
        if (response.status !== 2) return Object.freeze({ status: 'unavailable' });
        if (response.registryType !== 1) {
          return response.valueUtf8Hex === ''
            ? Object.freeze({ status: 'value', type: `REG_TYPE_${response.registryType}`, value: '' })
            : Object.freeze({ status: 'unavailable' });
        }
        const value = decodedValue(response.valueUtf8Hex);
        return value === null
          ? Object.freeze({ status: 'unavailable' })
          : Object.freeze({ status: 'value', type: 'REG_SZ', value });
      } catch {
        return Object.freeze({ status: 'unavailable' });
      }
    },
    writeDefault: async (
      view: NativeHostRegistryView,
      key: string,
      value: Readonly<{ type: 'REG_SZ'; value: string }>,
    ): Promise<void> => {
      if (!safeMutation(view, key) || value.type !== 'REG_SZ') {
        throw new Error('registry-helper-refused');
      }
      try {
        const response = await invoke(OPERATION.write32, writeInput(value.value));
        if (!response || response.status !== 6
          || response.registryType !== 0 || response.valueUtf8Hex !== '') {
          throw new Error('registry-helper-failed');
        }
      } catch {
        throw new Error('registry-helper-failed');
      }
    },
    deleteDefault: async (view: NativeHostRegistryView, key: string): Promise<void> => {
      if (!safeMutation(view, key)) throw new Error('registry-helper-refused');
      try {
        const response = await invoke(OPERATION.deleteValue32);
        if (!response || response.status !== 6
          || response.registryType !== 0 || response.valueUtf8Hex !== '') {
          throw new Error('registry-helper-failed');
        }
      } catch {
        throw new Error('registry-helper-failed');
      }
    },
    inspectKey: async (
      view: NativeHostRegistryView,
      key: string,
    ): Promise<NativeHostRegistryKeyFact> => {
      if (!safeMutation(view, key)) return Object.freeze({ status: 'unavailable' });
      try {
        const response = await invoke(OPERATION.inspect32);
        if (!response || response.registryType !== 0 || response.valueUtf8Hex !== '') {
          return Object.freeze({ status: 'unavailable' });
        }
        const status = ({
          1: 'absent', 3: 'empty', 4: 'exact-default-only', 5: 'nonempty',
        } as const)[response.status as 1 | 3 | 4 | 5];
        return status
          ? Object.freeze({ status })
          : Object.freeze({ status: 'unavailable' });
      } catch {
        return Object.freeze({ status: 'unavailable' });
      }
    },
    deleteEmptyKey: async (view: NativeHostRegistryView, key: string): Promise<void> => {
      if (!safeMutation(view, key)) throw new Error('registry-helper-refused');
      try {
        const response = await invoke(OPERATION.deleteEmptyKey32);
        if (!response || response.status !== 6
          || response.registryType !== 0 || response.valueUtf8Hex !== '') {
          throw new Error('registry-helper-failed');
        }
      } catch {
        throw new Error('registry-helper-failed');
      }
    },
  });
}

// Kept private to this module's process boundary; no command accepts a registry key or view.
export const nativeHostRegistryHelperProtocol = Object.freeze({
  name: PROTOCOL,
  operations: OPERATION,
});
