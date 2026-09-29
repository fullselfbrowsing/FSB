import { posix, win32 } from 'node:path';
import {
  NATIVE_HOST_DEFAULT_EXTENSION_ID,
  NATIVE_HOST_DESCRIPTION,
  NATIVE_HOST_NAME,
  NATIVE_HOST_OWNER,
  NATIVE_HOST_OWNER_MARKER_SCHEMA,
  NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH,
  NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH,
  isNativeHostExtensionId,
  nativeHostOrigin,
} from './native-host/constants.js';
import type {
  NativeHostOwnerMarker,
  NativeHostPlatform,
} from './native-host/runtime-layout.js';
import type {
  NativeHostFileFact,
  NativeHostOwnedState,
  NativeHostRegistrationInspection,
  NativeHostRegistrationInspectionInput,
  NativeHostRegistryValueFact,
} from './native-host-install/types.js';

const MAX_REGISTRATION_BYTES = 16 * 1024;
const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const INSTALL_TOKEN_PATTERN = /^[a-f0-9]{32}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export interface NativeHostManifest {
  name: typeof NATIVE_HOST_NAME;
  description: typeof NATIVE_HOST_DESCRIPTION;
  path: string;
  type: 'stdio';
  allowed_origins: readonly [string];
}

export interface NativeHostManifestExpectation {
  platform: NativeHostPlatform;
  launcherPath: string;
  extensionId?: string;
}

export interface NativeHostMarkerExpectation {
  platform: NativeHostPlatform;
  origin: string;
}

function refuse(): never {
  throw new Error('FSBNH_REGISTRATION_MANIFEST');
}

function exactDataValues(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.length) return null;
    const fields: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const key = expectedKeys[index];
      if (keys[index] !== key) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return null;
      }
      fields[key] = descriptor.value;
    }
    return fields;
  } catch {
    return null;
  }
}

function isBoundedString(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 4096
    && !/[\0\r\n]/u.test(value);
}

function exactAbsolutePath(
  value: unknown,
  platform: NativeHostPlatform,
): string | null {
  const api = platform === 'win32' ? win32 : posix;
  if (!isBoundedString(value) || !api.isAbsolute(value)) return null;
  return api.normalize(value) === value && value !== api.parse(value).root
    ? value
    : null;
}

function extensionIdFor(expectation: NativeHostManifestExpectation): string | null {
  const extensionId = expectation.extensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
  return isNativeHostExtensionId(extensionId) ? extensionId : null;
}

export function createNativeHostManifest(
  expectation: NativeHostManifestExpectation,
): NativeHostManifest {
  const extensionId = extensionIdFor(expectation);
  const launcherPath = exactAbsolutePath(expectation?.launcherPath, expectation?.platform);
  if (!extensionId || !launcherPath) refuse();
  return Object.freeze({
    name: NATIVE_HOST_NAME,
    description: NATIVE_HOST_DESCRIPTION,
    path: launcherPath,
    type: 'stdio',
    allowed_origins: Object.freeze([nativeHostOrigin(extensionId)]) as readonly [string],
  });
}

export function validateNativeHostManifest(
  value: unknown,
  expectation: NativeHostManifestExpectation,
): NativeHostManifest | null {
  const extensionId = extensionIdFor(expectation);
  const launcherPath = exactAbsolutePath(expectation?.launcherPath, expectation?.platform);
  if (!extensionId || !launcherPath) return null;
  const fields = exactDataValues(
    value,
    ['name', 'description', 'path', 'type', 'allowed_origins'],
  );
  if (
    !fields
    || fields.name !== NATIVE_HOST_NAME
    || fields.description !== NATIVE_HOST_DESCRIPTION
    || fields.path !== launcherPath
    || fields.type !== 'stdio'
    || !Array.isArray(fields.allowed_origins)
    || fields.allowed_origins.length !== 1
    || fields.allowed_origins[0] !== nativeHostOrigin(extensionId)
  ) {
    return null;
  }
  return createNativeHostManifest({ ...expectation, extensionId });
}

export function validateNativeHostMarker(
  value: unknown,
  expectation: NativeHostMarkerExpectation,
): NativeHostOwnerMarker | null {
  const fields = exactDataValues(
    value,
    [
      'schema',
      'owner',
      'host',
      'origin',
      'platform',
      'packageVersion',
      'launcherRelativePath',
      'artifactSha256',
      'installToken',
    ],
  );
  const expectedLauncherRelativePath = expectation.platform === 'win32'
    ? NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH
    : NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH;
  if (
    !fields
    || !['darwin', 'linux', 'win32'].includes(expectation.platform)
    || !isBoundedString(expectation.origin)
    || !expectation.origin.startsWith('chrome-extension://')
    || !expectation.origin.endsWith('/')
    || !isNativeHostExtensionId(expectation.origin.slice(19, -1))
    || fields.schema !== NATIVE_HOST_OWNER_MARKER_SCHEMA
    || fields.owner !== NATIVE_HOST_OWNER
    || fields.host !== NATIVE_HOST_NAME
    || fields.origin !== expectation.origin
    || fields.platform !== expectation.platform
    || typeof fields.packageVersion !== 'string'
    || !PACKAGE_VERSION_PATTERN.test(fields.packageVersion)
    || fields.launcherRelativePath !== expectedLauncherRelativePath
    || typeof fields.artifactSha256 !== 'string'
    || !SHA256_PATTERN.test(fields.artifactSha256)
    || typeof fields.installToken !== 'string'
    || !INSTALL_TOKEN_PATTERN.test(fields.installToken)
  ) {
    return null;
  }
  return Object.freeze({
    schema: NATIVE_HOST_OWNER_MARKER_SCHEMA,
    owner: NATIVE_HOST_OWNER,
    host: NATIVE_HOST_NAME,
    origin: expectation.origin,
    platform: expectation.platform,
    packageVersion: fields.packageVersion,
    launcherRelativePath: expectedLauncherRelativePath,
    artifactSha256: fields.artifactSha256,
    installToken: fields.installToken,
  });
}

type ParsedFile<T> =
  | Readonly<{ state: 'absent' | 'unavailable' | 'invalid' | 'foreign'; value: null }>
  | Readonly<{ state: 'exact'; value: T }>;

function parseFileFact<T>(
  fact: NativeHostFileFact,
  expectedPath: string,
  validator: (value: unknown) => T | null,
): ParsedFile<T> {
  if (!fact || fact.status === 'unavailable') {
    return Object.freeze({ state: 'unavailable', value: null });
  }
  if (fact.status === 'absent') return Object.freeze({ state: 'absent', value: null });
  if (fact.status !== 'file') return Object.freeze({ state: 'invalid', value: null });
  if (
    fact.path !== expectedPath
    || fact.realPath !== expectedPath
    || typeof fact.contents !== 'string'
    || fact.contents.length < 1
    || Buffer.byteLength(fact.contents, 'utf8') > MAX_REGISTRATION_BYTES
  ) {
    return Object.freeze({ state: 'invalid', value: null });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fact.contents);
  } catch {
    return Object.freeze({ state: 'invalid', value: null });
  }
  const validated = validator(parsed);
  return validated
    ? Object.freeze({ state: 'exact', value: validated })
    : Object.freeze({ state: 'foreign', value: null });
}

function result<Manifest, Marker>(
  state: NativeHostOwnedState,
  reason: string,
  manifest: Manifest | null = null,
  marker: Marker | null = null,
): NativeHostRegistrationInspection<Manifest, Marker> {
  return Object.freeze({ state, reason, manifest, marker });
}

function registryState(
  fact: NativeHostRegistryValueFact | undefined,
  expectedValue: string,
): NativeHostOwnedState {
  if (!fact || fact.status === 'unavailable') return 'unavailable';
  if (fact.status === 'absent') return 'absent';
  if (fact.type !== 'REG_SZ') return 'invalid';
  return fact.value === expectedValue ? 'exact' : 'mismatched';
}

export function inspectNativeHostRegistration(
  input: NativeHostRegistrationInspectionInput,
): NativeHostRegistrationInspection<NativeHostManifest, NativeHostOwnerMarker> {
  if (!input?.layout || !isNativeHostExtensionId(input.extensionId)) {
    return result('invalid', 'invalid-input');
  }
  const manifest = parseFileFact(
    input.manifest,
    input.layout.manifestPath,
    (value) => validateNativeHostManifest(value, {
      platform: input.layout.platform,
      launcherPath: input.layout.launcherPath,
      extensionId: input.extensionId,
    }),
  );
  const marker = parseFileFact(
    input.marker,
    input.layout.markerPath,
    (value) => validateNativeHostMarker(value, {
      platform: input.layout.platform,
      origin: nativeHostOrigin(input.extensionId),
    }),
  );

  if (input.layout.registration.kind === 'registry') {
    const shadow = input.registry64;
    if (!shadow || shadow.status === 'unavailable') {
      return result('unavailable', 'registry-unavailable');
    }
    if (shadow.status === 'value') return result('mismatched', 'registry-shadow');
    const canonicalState = registryState(input.registry32, input.layout.manifestPath);
    if (canonicalState === 'unavailable') return result('unavailable', 'registry-unavailable');
    if (canonicalState === 'invalid') return result('invalid', 'registry-invalid');
    if (canonicalState === 'mismatched') return result('mismatched', 'registry-mismatch');
    if (
      canonicalState === 'absent'
      && manifest.state === 'absent'
      && marker.state === 'absent'
    ) {
      return result('absent', 'absent');
    }
    if (canonicalState !== 'exact') return result('mismatched', 'registration-split');
  } else if (manifest.state === 'absent' && marker.state === 'absent') {
    return result('absent', 'absent');
  }

  if (manifest.state === 'unavailable' || marker.state === 'unavailable') {
    return result('unavailable', 'registration-unavailable');
  }
  if (manifest.state === 'invalid' || marker.state === 'invalid') {
    return result('invalid', 'registration-invalid');
  }
  if (manifest.state === 'foreign' || marker.state === 'foreign') {
    return result('foreign', 'registration-foreign');
  }
  if (manifest.state !== 'exact' || marker.state !== 'exact') {
    return result('mismatched', 'registration-split');
  }
  return result('exact', 'exact', manifest.value, marker.value);
}
