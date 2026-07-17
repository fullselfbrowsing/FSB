import { posix, win32 } from 'node:path';
import {
  NATIVE_HOST_NAME,
  NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH,
  NATIVE_HOST_PRIVATE_FILE_MODE,
  NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH,
} from '../native-host/constants.js';
import type { NativeHostPlatform } from '../native-host/runtime-layout.js';
import type {
  NativeHostInstallPlatformAdapter,
  NativeHostInstallPlatformDependencies,
  NativeHostInstallPlatformLayout,
  NativeHostRegistrationReadFacts,
  NativeHostRegistryKeyFact,
  NativeHostRegistryRegistration,
  NativeHostRegistryValueFact,
} from './types.js';

const MAX_MANIFEST_BYTES = 16 * 1024;
const WINDOWS_REGISTRY_KEY =
  `Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;

export interface NativeHostPlatformLayoutInput {
  platform: NativeHostPlatform;
  homeDirectory: string;
  localAppData?: string;
}

function refuse(): never {
  throw new Error('FSBNH_INSTALL_PLATFORM');
}

function isBounded(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= 4096
    && !/[\0\r\n]/u.test(value);
}

function normalizedAbsolute(
  value: unknown,
  platform: NativeHostPlatform,
): string {
  const api = platform === 'win32' ? win32 : posix;
  if (!isBounded(value) || !api.isAbsolute(value)) refuse();
  const normalized = api.normalize(value);
  if (normalized !== value || normalized === api.parse(normalized).root) refuse();
  return normalized;
}

function assertSupportedPlatform(value: unknown): asserts value is NativeHostPlatform {
  if (!['darwin', 'linux', 'win32'].includes(String(value))) refuse();
}

export function resolveNativeHostPlatformLayout(
  input: NativeHostPlatformLayoutInput,
): NativeHostInstallPlatformLayout {
  if (!input || typeof input !== 'object') refuse();
  assertSupportedPlatform(input.platform);
  const platform = input.platform;
  const api = platform === 'win32' ? win32 : posix;
  const homeDirectory = normalizedAbsolute(input.homeDirectory, platform);
  const stableRoot = platform === 'win32'
    ? api.join(
      normalizedAbsolute(input.localAppData, platform),
      'FSB',
      'NativeMessagingHost',
    )
    : api.join(homeDirectory, '.fsb', 'native-host');
  const manifestPath = platform === 'darwin'
    ? api.join(
      homeDirectory,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      `${NATIVE_HOST_NAME}.json`,
    )
    : platform === 'linux'
      ? api.join(
        homeDirectory,
        '.config',
        'google-chrome',
        'NativeMessagingHosts',
        `${NATIVE_HOST_NAME}.json`,
      )
      : api.join(stableRoot, 'manifest.json');
  const launcherRelativePath = platform === 'win32'
    ? NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH
    : NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH;
  const registration = platform === 'win32'
    ? Object.freeze<NativeHostRegistryRegistration>({
      kind: 'registry',
      key: WINDOWS_REGISTRY_KEY,
      canonicalView: 'user/32',
      shadowView: 'user/64',
    })
    : Object.freeze({ kind: 'file' as const });

  return Object.freeze({
    platform,
    stableRoot,
    manifestPath,
    markerPath: api.join(stableRoot, 'owner.json'),
    launcherPath: api.join(
      stableRoot,
      ...launcherRelativePath.split(/[\\/]/u),
    ),
    registration,
  });
}

function unavailableRegistryFact(): NativeHostRegistryValueFact {
  return Object.freeze({ status: 'unavailable' });
}

function unavailableKeyFact(): NativeHostRegistryKeyFact {
  return Object.freeze({ status: 'unavailable' });
}

function validateManifestContents(contents: unknown): string {
  if (
    typeof contents !== 'string'
    || contents.length < 1
    || Buffer.byteLength(contents, 'utf8') > MAX_MANIFEST_BYTES
    || contents.includes('\0')
  ) {
    refuse();
  }
  return contents;
}

export function createNativeHostPlatformAdapter(
  layout: NativeHostInstallPlatformLayout,
  dependencies: NativeHostInstallPlatformDependencies,
): NativeHostInstallPlatformAdapter {
  if (!layout || !dependencies?.files) refuse();
  const registryRegistration = layout.registration.kind === 'registry'
    ? layout.registration
    : null;

  return Object.freeze({
    layout,
    readRegistrationFacts: async (): Promise<NativeHostRegistrationReadFacts> => {
      const manifest = await dependencies.files.inspectFile(
        layout.manifestPath,
        MAX_MANIFEST_BYTES,
      );
      if (!registryRegistration) return Object.freeze({ manifest });
      const registry32 = dependencies.registry
        ? await dependencies.registry.readDefault(
          registryRegistration.canonicalView,
          registryRegistration.key,
        )
        : unavailableRegistryFact();
      const registry64 = dependencies.registry
        ? await dependencies.registry.readDefault(
          registryRegistration.shadowView,
          registryRegistration.key,
        )
        : unavailableRegistryFact();
      return Object.freeze({ manifest, registry32, registry64 });
    },
    publishRegistration: async (contents: string): Promise<void> => {
      const exactContents = validateManifestContents(contents);
      await dependencies.files.writePrivateFileAtomic(
        layout.manifestPath,
        exactContents,
        NATIVE_HOST_PRIVATE_FILE_MODE,
      );
      if (registryRegistration) {
        if (!dependencies.registry) refuse();
        await dependencies.registry.writeDefault(
          registryRegistration.canonicalView,
          registryRegistration.key,
          Object.freeze({ type: 'REG_SZ', value: layout.manifestPath }),
        );
      }
    },
    removeCanonicalRegistration: async (): Promise<void> => {
      if (registryRegistration) {
        if (!dependencies.registry) refuse();
        await dependencies.registry.deleteDefault(
          registryRegistration.canonicalView,
          registryRegistration.key,
        );
        return;
      }
      await dependencies.files.removeFile(layout.manifestPath);
    },
    inspectCanonicalKey: async (): Promise<NativeHostRegistryKeyFact> => {
      if (!registryRegistration || !dependencies.registry) return unavailableKeyFact();
      return dependencies.registry.inspectKey(
        registryRegistration.canonicalView,
        registryRegistration.key,
      );
    },
    deleteCanonicalKeyIfEmpty: async (): Promise<void> => {
      if (!registryRegistration || !dependencies.registry) return;
      await dependencies.registry.deleteEmptyKey(
        registryRegistration.canonicalView,
        registryRegistration.key,
      );
    },
  });
}
