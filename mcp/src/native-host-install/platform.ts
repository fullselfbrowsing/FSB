import { posix, win32 } from 'node:path';
import {
  NATIVE_HOST_NAME,
  NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH,
  NATIVE_HOST_PRIVATE_FILE_MODE,
  NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH,
} from '../native-host/constants.js';
import type { NativeHostPlatform } from '../native-host/runtime-layout.js';
import {
  NATIVE_HOST_BROWSERS,
  NATIVE_HOST_WINDOWS_REGISTRY_KEYS,
  isNativeHostBrowser,
} from './browser.js';
import type {
  NativeHostInstallPlatformAdapter,
  NativeHostInstallPlatformDependencies,
  NativeHostInstallPlatformLayout,
  NativeHostBrowser,
  NativeHostRegistrationReadFacts,
  NativeHostRegistryKeyFact,
  NativeHostRegistryRegistration,
  NativeHostRegistryValueFact,
} from './types.js';

const MAX_MANIFEST_BYTES = 16 * 1024;
export interface NativeHostPlatformLayoutInput {
  platform: NativeHostPlatform;
  browser?: NativeHostBrowser;
  homeDirectory: string;
  localAppData?: string;
}

const DARWIN_MANIFEST_ROOTS: Readonly<Record<NativeHostBrowser, readonly string[]>> =
  Object.freeze({
    chrome: Object.freeze(['Google', 'Chrome']),
    edge: Object.freeze(['Microsoft Edge']),
    brave: Object.freeze(['BraveSoftware', 'Brave-Browser']),
    chromium: Object.freeze(['Chromium']),
  });

const LINUX_MANIFEST_ROOTS: Readonly<Record<NativeHostBrowser, readonly string[]>> =
  Object.freeze({
    chrome: Object.freeze(['google-chrome']),
    edge: Object.freeze(['microsoft-edge']),
    brave: Object.freeze(['BraveSoftware', 'Brave-Browser']),
    chromium: Object.freeze(['chromium']),
  });

// Per-user profile roots on Windows, below %LOCALAPPDATA%. On macOS and Linux
// a browser's profile root is the directory that also holds its
// NativeMessagingHosts folder.
const WINDOWS_USER_DATA_ROOTS: Readonly<Record<NativeHostBrowser, readonly string[]>> =
  Object.freeze({
    chrome: Object.freeze(['Google', 'Chrome', 'User Data']),
    edge: Object.freeze(['Microsoft', 'Edge', 'User Data']),
    brave: Object.freeze(['BraveSoftware', 'Brave-Browser', 'User Data']),
    chromium: Object.freeze(['Chromium', 'User Data']),
  });

const MAX_PROFILE_ENTRIES = 256;

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

function nativeHostBrowser(value: unknown): NativeHostBrowser {
  if (value === undefined) return 'chrome';
  if (!isNativeHostBrowser(value)) refuse();
  return value;
}

export function resolveNativeHostPlatformLayout(
  input: NativeHostPlatformLayoutInput,
): NativeHostInstallPlatformLayout {
  if (!input || typeof input !== 'object') refuse();
  assertSupportedPlatform(input.platform);
  const platform = input.platform;
  const browser = nativeHostBrowser(input.browser);
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
      ...DARWIN_MANIFEST_ROOTS[browser],
      'NativeMessagingHosts',
      `${NATIVE_HOST_NAME}.json`,
    )
    : platform === 'linux'
      ? api.join(
        homeDirectory,
        '.config',
        ...LINUX_MANIFEST_ROOTS[browser],
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
      key: NATIVE_HOST_WINDOWS_REGISTRY_KEYS[browser],
      canonicalView: 'user/32',
      shadowView: 'user/64',
    })
    : Object.freeze({ kind: 'file' as const });

  return Object.freeze({
    platform,
    browser,
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
  const requireAbsentShadow = async (): Promise<void> => {
    if (!registryRegistration) return;
    if (!dependencies.registry) refuse();
    const shadow = await dependencies.registry.readDefault(
      registryRegistration.shadowView,
      registryRegistration.key,
    );
    if (shadow.status !== 'absent') refuse();
  };

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
      await requireAbsentShadow();
      await dependencies.files.writePrivateFileAtomic(
        layout.manifestPath,
        exactContents,
        NATIVE_HOST_PRIVATE_FILE_MODE,
      );
      if (registryRegistration) {
        if (!dependencies.registry) refuse();
        await requireAbsentShadow();
        await dependencies.registry.writeDefault(
          registryRegistration.canonicalView,
          registryRegistration.key,
          Object.freeze({ type: 'REG_SZ', value: layout.manifestPath }),
        );
      }
    },
    publishBrowserRegistration: async (contents: string): Promise<void> => {
      const exactContents = validateManifestContents(contents);
      if (!registryRegistration) {
        await dependencies.files.writePrivateFileAtomic(
          layout.manifestPath,
          exactContents,
          NATIVE_HOST_PRIVATE_FILE_MODE,
        );
        return;
      }
      if (!dependencies.registry) refuse();
      await requireAbsentShadow();
      const manifest = await dependencies.files.inspectFile(
        layout.manifestPath,
        MAX_MANIFEST_BYTES,
      );
      if (manifest.status === 'absent') {
        await dependencies.files.writePrivateFileAtomic(
          layout.manifestPath,
          exactContents,
          NATIVE_HOST_PRIVATE_FILE_MODE,
        );
      } else if (
        manifest.status !== 'file'
        || manifest.path !== layout.manifestPath
        || manifest.realPath !== layout.manifestPath
        || manifest.contents !== exactContents
      ) {
        refuse();
      }
      await requireAbsentShadow();
      await dependencies.registry.writeDefault(
        registryRegistration.canonicalView,
        registryRegistration.key,
        Object.freeze({ type: 'REG_SZ', value: layout.manifestPath }),
      );
    },
    removeCanonicalRegistration: async (): Promise<void> => {
      if (registryRegistration) {
        if (!dependencies.registry) refuse();
        await requireAbsentShadow();
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
      if (!registryRegistration) return;
      if (!dependencies.registry) refuse();
      await requireAbsentShadow();
      await dependencies.registry.deleteEmptyKey(
        registryRegistration.canonicalView,
        registryRegistration.key,
      );
    },
  });
}

export interface NativeHostBrowserDetectionInput {
  platform: NativeHostPlatform;
  homeDirectory: string;
  localAppData?: string;
  extensionId: string;
}

export interface NativeHostBrowserDetectionFiles {
  /** Entry names of a real directory, or null when it is absent or not a directory. */
  listDirectory(pathname: string): Promise<readonly string[] | null>;
  /** True only for a real directory, never for a link to one. */
  isDirectory(pathname: string): Promise<boolean>;
}

/** The per-user directory that holds a browser's profiles. */
export function resolveNativeHostBrowserUserDataRoot(
  input: Omit<NativeHostBrowserDetectionInput, 'extensionId'>,
  browser: NativeHostBrowser,
): string {
  if (!input || typeof input !== 'object') refuse();
  assertSupportedPlatform(input.platform);
  const platform = input.platform;
  const api = platform === 'win32' ? win32 : posix;
  const selected = nativeHostBrowser(browser);
  if (platform === 'win32') {
    return api.join(
      normalizedAbsolute(input.localAppData, platform),
      ...WINDOWS_USER_DATA_ROOTS[selected],
    );
  }
  const homeDirectory = normalizedAbsolute(input.homeDirectory, platform);
  return platform === 'darwin'
    ? api.join(homeDirectory, 'Library', 'Application Support', ...DARWIN_MANIFEST_ROOTS[selected])
    : api.join(homeDirectory, '.config', ...LINUX_MANIFEST_ROOTS[selected]);
}

/**
 * Browsers where this user has the extension installed: a browser counts when
 * any of its profiles holds `Extensions/<extension id>`. Only per-user
 * profile folders are read; nothing system-wide is consulted. Unreadable
 * folders count as "not installed". The list may be empty; callers decide
 * the fallback.
 */
export async function detectFsbBrowsers(
  input: NativeHostBrowserDetectionInput,
  files: NativeHostBrowserDetectionFiles,
): Promise<NativeHostBrowser[]> {
  if (!input || typeof input !== 'object' || !files) refuse();
  if (!/^[a-p]{32}$/u.test(String(input.extensionId))) refuse();
  const api = input.platform === 'win32' ? win32 : posix;
  const found: NativeHostBrowser[] = [];
  for (const browser of NATIVE_HOST_BROWSERS) {
    let userDataRoot: string;
    try {
      userDataRoot = resolveNativeHostBrowserUserDataRoot(input, browser);
    } catch {
      continue;
    }
    let entries: readonly string[] | null;
    try {
      entries = await files.listDirectory(userDataRoot);
    } catch {
      entries = null;
    }
    if (!entries) continue;
    for (const entry of entries.slice(0, MAX_PROFILE_ENTRIES)) {
      if (
        typeof entry !== 'string'
        || entry.length === 0
        || entry.startsWith('.')
        || entry.includes('/')
        || entry.includes('\\')
        || !isBounded(entry)
      ) {
        continue;
      }
      let present = false;
      try {
        present = await files.isDirectory(
          api.join(userDataRoot, entry, 'Extensions', input.extensionId),
        );
      } catch {
        present = false;
      }
      if (present) {
        found.push(browser);
        break;
      }
    }
  }
  return found;
}

/**
 * A fixed browser list for tests. It is honored only when
 * FSB_NATIVE_HOST_TEST_MODE=1, so an inherited variable can never steer a
 * real install.
 */
export function nativeHostBrowsersFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): NativeHostBrowser[] | null {
  if (environment.FSB_NATIVE_HOST_TEST_MODE !== '1') return null;
  const raw = environment.FSB_NATIVE_HOST_BROWSERS;
  if (typeof raw !== 'string') return null;
  const browsers: NativeHostBrowser[] = [];
  for (const candidate of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
    if (isNativeHostBrowser(candidate) && !browsers.includes(candidate)) browsers.push(candidate);
  }
  return browsers;
}
