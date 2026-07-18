import { posix, win32 } from 'node:path';
import {
  NATIVE_HOST_DEFAULT_EXTENSION_ID,
  NATIVE_HOST_ENTRY_RELATIVE_PATH,
  NATIVE_HOST_INTEGRITY_RELATIVE_PATH,
  NATIVE_HOST_LAUNCHER_MODE,
  NATIVE_HOST_NAME,
  NATIVE_HOST_OWNER,
  NATIVE_HOST_OWNER_MARKER_SCHEMA,
  NATIVE_HOST_PACKAGE_NAME,
  NATIVE_HOST_PACKAGE_RELATIVE_PATH,
  NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH,
  NATIVE_HOST_PRIVATE_FILE_MODE,
  NATIVE_HOST_RUNTIME_DIRECTORY_MODE,
  NATIVE_HOST_WINDOWS_CONFIG_RELATIVE_PATH,
  NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH,
  NATIVE_HOST_WINDOWS_REGISTRY_HELPER_RELATIVE_PATH,
  isNativeHostExtensionId,
  nativeHostOrigin,
} from './constants.js';

export type NativeHostPlatform = 'darwin' | 'linux' | 'win32';

export interface NativeHostRuntimeLayoutInput {
  platform: NativeHostPlatform;
  homeDirectory: string;
  localAppData?: string;
  packageVersion: string;
  extensionId?: string;
  installToken: string;
  nodePath: string;
  nodeRealPath: string;
  npmCliPath: string;
  npmCliRealPath: string;
  invokingPackageRoot: string;
}

export interface NativeHostRuntimeEvidence {
  npmCli: boolean;
  runtimeIntegrity: boolean;
  bundleComplete: boolean;
  launcherArtifact: boolean;
}

export interface NativeHostCommandRecipe {
  executable: string;
  argv: readonly string[];
  cwd: string;
  environment?: Readonly<Record<string, string>>;
  shell: false;
}

export interface NativeHostRuntimeLayout {
  schema: 1;
  platform: NativeHostPlatform;
  packageName: typeof NATIVE_HOST_PACKAGE_NAME;
  packageVersion: string;
  extensionId: string;
  origin: string;
  installToken: string;
  stableRoot: string;
  stageRoot: string;
  runtimeRoot: string;
  packageRoot: string;
  packageEntryPath: string;
  integrityReceiptPath: string;
  markerPath: string;
  launcherPath: string;
  launcherRelativePath: string;
  bootstrapConfigPath: string | null;
  bootstrapConfigRelativePath: string | null;
  registryHelperPath: string | null;
  registryHelperRelativePath: string | null;
  invokingPackageRoot: string;
  nodePath: string;
  npmCliPath: string;
  tarballPath: string;
  offlineCacheRoot: string;
  launcherMode: typeof NATIVE_HOST_LAUNCHER_MODE;
  markerMode: typeof NATIVE_HOST_PRIVATE_FILE_MODE;
  directoryMode: typeof NATIVE_HOST_RUNTIME_DIRECTORY_MODE;
  pack: NativeHostCommandRecipe;
  install: NativeHostCommandRecipe;
}

export interface NativeHostOwnerMarker {
  schema: 1;
  owner: typeof NATIVE_HOST_OWNER;
  host: typeof NATIVE_HOST_NAME;
  origin: string;
  platform: NativeHostPlatform;
  packageVersion: string;
  launcherRelativePath: string;
  artifactSha256: string;
  installToken: string;
}

export interface NativeHostWakeRuntimeLayoutInput {
  platform: NativeHostPlatform;
  absoluteEntryPath: string;
  absoluteNode: string;
}

export interface NativeHostWakeRuntimeLayout {
  platform: NativeHostPlatform;
  markerPath: string;
  stableRuntimeRoot: string;
  absoluteNode: string;
  absoluteStableBuildIndex: string;
}

export type NativeHostRuntimeLayoutValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>;

const PACKAGE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const INSTALL_TOKEN_PATTERN = /^[a-f0-9]{32}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_PATH_BYTES = 4096;
const MAX_POSIX_SHEBANG_BYTES = 127;
const OFFLINE_SENTINEL = 'http://127.0.0.1:9';
const POSIX_ENTRY_IMPORT = "import '../runtime/package/build/native-host/index.js';\n";

function refuse(code: string): never {
  throw new Error(code);
}

function boundedString(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= MAX_PATH_BYTES
    && !value.includes('\0')
    && !value.includes('\r')
    && !value.includes('\n');
}

function exactDataValues(
  value: unknown,
  expectedKeys: readonly string[],
  code: string,
): Readonly<Record<string, unknown>> {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(code);
    if (Object.getPrototypeOf(value) !== Object.prototype) refuse(code);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.length) refuse(code);
    const fields: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < expectedKeys.length; index += 1) {
      const key = expectedKeys[index];
      if (keys[index] !== key) refuse(code);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
      ) {
        refuse(code);
      }
      fields[key] = descriptor.value;
    }
    return fields;
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    return refuse(code);
  }
}

function pathApi(platform: NativeHostPlatform): typeof posix | typeof win32 {
  return platform === 'win32' ? win32 : posix;
}

function normalizedAbsolutePath(
  value: unknown,
  platform: NativeHostPlatform,
  code: string,
): string {
  const api = pathApi(platform);
  if (!boundedString(value) || !api.isAbsolute(value)) refuse(code);
  const normalized = api.normalize(value);
  if (normalized !== value || normalized === api.parse(normalized).root) refuse(code);
  return normalized;
}

function pathsEqual(
  left: string,
  right: string,
  platform: NativeHostPlatform,
): boolean {
  return platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isSameOrInside(
  candidate: string,
  parent: string,
  platform: NativeHostPlatform,
): boolean {
  const api = pathApi(platform);
  const relativePath = api.relative(parent, candidate);
  return relativePath === ''
    || (!relativePath.startsWith(`..${api.sep}`)
      && relativePath !== '..'
      && !api.isAbsolute(relativePath));
}

function isTransientRoot(value: string, platform: NativeHostPlatform): boolean {
  const portable = value.replaceAll('\\', '/').toLowerCase();
  if (
    /(?:^|\/)(?:_npx|node_modules|\.cache|npm-cache|\.npm|worktrees)(?:\/|$)/u
      .test(portable)
  ) {
    return true;
  }
  const api = pathApi(platform);
  return !api.isAbsolute(value);
}

function validateInterpreterPair(
  candidate: unknown,
  realCandidate: unknown,
  platform: NativeHostPlatform,
  code: string,
): string {
  const pathValue = normalizedAbsolutePath(candidate, platform, code);
  const realPathValue = normalizedAbsolutePath(realCandidate, platform, code);
  if (!pathsEqual(pathValue, realPathValue, platform)) refuse(code);
  return realPathValue;
}

function freezeCommand(recipe: NativeHostCommandRecipe): NativeHostCommandRecipe {
  return Object.freeze({
    ...recipe,
    argv: Object.freeze([...recipe.argv]),
    ...(recipe.environment
      ? { environment: Object.freeze({ ...recipe.environment }) }
      : {}),
  });
}

export function renderPosixNativeHostLauncher(
  nodePath: string,
  nodeRealPath: string,
): string {
  if (
    !boundedString(nodePath)
    || !boundedString(nodeRealPath)
    || !posix.isAbsolute(nodePath)
    || nodePath !== posix.normalize(nodePath)
    || nodePath !== nodeRealPath
    || /\s/u.test(nodePath)
    || Buffer.byteLength(`#!${nodePath}\n`, 'utf8') > MAX_POSIX_SHEBANG_BYTES
  ) {
    refuse('FSBNH_LAYOUT_UNSAFE_NODE');
  }
  return `#!${nodePath}\n${POSIX_ENTRY_IMPORT}`;
}

export function resolveNativeHostRuntimeLayout(
  input: NativeHostRuntimeLayoutInput,
): NativeHostRuntimeLayout {
  if (!input || !['darwin', 'linux', 'win32'].includes(input.platform)) {
    refuse('FSBNH_LAYOUT_PLATFORM');
  }
  const platform = input.platform;
  const api = pathApi(platform);
  const homeDirectory = normalizedAbsolutePath(
    input.homeDirectory,
    platform,
    'FSBNH_LAYOUT_HOME',
  );
  const stableRoot = platform === 'win32'
    ? api.join(
      normalizedAbsolutePath(
        input.localAppData,
        platform,
        'FSBNH_LAYOUT_LOCAL_APP_DATA',
      ),
      'FSB',
      'NativeMessagingHost',
    )
    : api.join(homeDirectory, '.fsb', 'native-host');
  if (isTransientRoot(stableRoot, platform)) refuse('FSBNH_LAYOUT_TRANSIENT_ROOT');

  if (!PACKAGE_VERSION_PATTERN.test(input.packageVersion)) refuse('FSBNH_LAYOUT_VERSION');
  const extensionId = input.extensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
  if (!isNativeHostExtensionId(extensionId)) refuse('FSBNH_LAYOUT_EXTENSION_ID');
  if (!INSTALL_TOKEN_PATTERN.test(input.installToken)) refuse('FSBNH_LAYOUT_INSTALL_TOKEN');

  const nodePath = validateInterpreterPair(
    input.nodePath,
    input.nodeRealPath,
    platform,
    'FSBNH_LAYOUT_UNSAFE_NODE',
  );
  if (platform !== 'win32') renderPosixNativeHostLauncher(nodePath, input.nodeRealPath);
  const npmCliPath = validateInterpreterPair(
    input.npmCliPath,
    input.npmCliRealPath,
    platform,
    'FSBNH_LAYOUT_NPM_CLI',
  );
  if (api.basename(npmCliPath).toLowerCase() !== 'npm-cli.js') {
    refuse('FSBNH_LAYOUT_NPM_CLI');
  }
  const invokingPackageRoot = normalizedAbsolutePath(
    input.invokingPackageRoot,
    platform,
    'FSBNH_LAYOUT_PACKAGE_ROOT',
  );
  if (
    isSameOrInside(stableRoot, invokingPackageRoot, platform)
    || isSameOrInside(invokingPackageRoot, stableRoot, platform)
  ) {
    refuse('FSBNH_LAYOUT_TRANSIENT_ROOT');
  }

  const stageRoot = `${stableRoot}.stage-${input.installToken}`;
  const runtimeRoot = api.join(stableRoot, 'runtime');
  const packageRoot = api.join(stableRoot, ...NATIVE_HOST_PACKAGE_RELATIVE_PATH.split('/'));
  const packageEntryPath = api.join(
    stableRoot,
    ...NATIVE_HOST_ENTRY_RELATIVE_PATH.split('/'),
  );
  const integrityReceiptPath = api.join(
    stableRoot,
    ...NATIVE_HOST_INTEGRITY_RELATIVE_PATH.split('/'),
  );
  const launcherRelativePath = platform === 'win32'
    ? NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH
    : NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH;
  const launcherPath = api.join(stableRoot, ...launcherRelativePath.split(/[\\/]/u));
  const bootstrapConfigRelativePath = platform === 'win32'
    ? NATIVE_HOST_WINDOWS_CONFIG_RELATIVE_PATH
    : null;
  const bootstrapConfigPath = bootstrapConfigRelativePath
    ? api.join(stableRoot, ...bootstrapConfigRelativePath.split('\\'))
    : null;
  const registryHelperRelativePath = platform === 'win32'
    ? NATIVE_HOST_WINDOWS_REGISTRY_HELPER_RELATIVE_PATH
    : null;
  const registryHelperPath = registryHelperRelativePath
    ? api.join(stableRoot, ...registryHelperRelativePath.split('\\'))
    : null;
  const markerPath = api.join(stableRoot, 'owner.json');
  const tarballDirectory = api.join(stageRoot, 'pack');
  const tarballPath = api.join(
    tarballDirectory,
    `${NATIVE_HOST_PACKAGE_NAME}-${input.packageVersion}.tgz`,
  );
  const packCacheRoot = api.join(stageRoot, 'pack-cache');
  const offlineCacheRoot = api.join(stageRoot, 'offline-cache');
  const materializedRoot = api.join(stageRoot, 'materialized');

  const pack = freezeCommand({
    executable: nodePath,
    argv: [
      npmCliPath,
      'pack',
      '.',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      tarballDirectory,
      '--cache',
      packCacheRoot,
    ],
    cwd: invokingPackageRoot,
    shell: false,
  });
  const install = freezeCommand({
    executable: nodePath,
    argv: [
      npmCliPath,
      'install',
      '--offline',
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--cache',
      offlineCacheRoot,
      '--registry',
      OFFLINE_SENTINEL,
      tarballPath,
    ],
    cwd: materializedRoot,
    environment: {
      HTTP_PROXY: OFFLINE_SENTINEL,
      HTTPS_PROXY: OFFLINE_SENTINEL,
      ALL_PROXY: OFFLINE_SENTINEL,
      NO_PROXY: '',
      http_proxy: OFFLINE_SENTINEL,
      https_proxy: OFFLINE_SENTINEL,
      all_proxy: OFFLINE_SENTINEL,
      no_proxy: '',
      CI: 'true',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_offline: 'true',
      npm_config_update_notifier: 'false',
    },
    shell: false,
  });

  const layout: NativeHostRuntimeLayout = {
    schema: 1,
    platform,
    packageName: NATIVE_HOST_PACKAGE_NAME,
    packageVersion: input.packageVersion,
    extensionId,
    origin: nativeHostOrigin(extensionId),
    installToken: input.installToken,
    stableRoot,
    stageRoot,
    runtimeRoot,
    packageRoot,
    packageEntryPath,
    integrityReceiptPath,
    markerPath,
    launcherPath,
    launcherRelativePath,
    bootstrapConfigPath,
    bootstrapConfigRelativePath,
    registryHelperPath,
    registryHelperRelativePath,
    invokingPackageRoot,
    nodePath,
    npmCliPath,
    tarballPath,
    offlineCacheRoot,
    launcherMode: NATIVE_HOST_LAUNCHER_MODE,
    markerMode: NATIVE_HOST_PRIVATE_FILE_MODE,
    directoryMode: NATIVE_HOST_RUNTIME_DIRECTORY_MODE,
    pack,
    install,
  };
  const validation = validateNativeHostRuntimeLayout(layout);
  if (!validation.ok) refuse(`FSBNH_LAYOUT_${validation.reason.toUpperCase().replaceAll('-', '_')}`);
  return Object.freeze(layout);
}

export function validateNativeHostRuntimeLayout(
  value: unknown,
  evidence?: NativeHostRuntimeEvidence,
): NativeHostRuntimeLayoutValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({ ok: false, reason: 'invalid-layout' });
  }
  const layout = value as Partial<NativeHostRuntimeLayout>;
  if (
    layout.schema !== 1
    || !layout.platform
    || !['darwin', 'linux', 'win32'].includes(layout.platform)
    || layout.packageName !== NATIVE_HOST_PACKAGE_NAME
    || typeof layout.packageVersion !== 'string'
    || !PACKAGE_VERSION_PATTERN.test(layout.packageVersion)
    || typeof layout.extensionId !== 'string'
    || !isNativeHostExtensionId(layout.extensionId)
    || layout.origin !== nativeHostOrigin(layout.extensionId)
    || typeof layout.installToken !== 'string'
    || !INSTALL_TOKEN_PATTERN.test(layout.installToken)
  ) {
    return Object.freeze({ ok: false, reason: 'invalid-layout' });
  }
  const platform = layout.platform;
  const api = pathApi(platform);
  if (
    !boundedString(layout.stableRoot)
    || !api.isAbsolute(layout.stableRoot)
    || isTransientRoot(layout.stableRoot, platform)
    || !boundedString(layout.invokingPackageRoot)
    || isSameOrInside(layout.stableRoot, layout.invokingPackageRoot, platform)
    || isSameOrInside(layout.invokingPackageRoot, layout.stableRoot, platform)
  ) {
    return Object.freeze({ ok: false, reason: 'transient-target' });
  }
  const expectedLauncherRelativePath = platform === 'win32'
    ? NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH
    : NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH;
  const expectedPackageRoot = api.join(
    layout.stableRoot,
    ...NATIVE_HOST_PACKAGE_RELATIVE_PATH.split('/'),
  );
  const expectedLauncherPath = api.join(
    layout.stableRoot,
    ...expectedLauncherRelativePath.split(/[\\/]/u),
  );
  const expectedRegistryHelperRelativePath = platform === 'win32'
    ? NATIVE_HOST_WINDOWS_REGISTRY_HELPER_RELATIVE_PATH
    : null;
  const expectedRegistryHelperPath = expectedRegistryHelperRelativePath
    ? api.join(layout.stableRoot, ...expectedRegistryHelperRelativePath.split('\\'))
    : null;
  if (
    layout.packageRoot !== expectedPackageRoot
    || layout.launcherRelativePath !== expectedLauncherRelativePath
    || layout.launcherPath !== expectedLauncherPath
    || layout.registryHelperRelativePath !== expectedRegistryHelperRelativePath
    || layout.registryHelperPath !== expectedRegistryHelperPath
    || !isSameOrInside(layout.packageRoot, layout.stableRoot, platform)
    || isSameOrInside(layout.launcherPath, layout.invokingPackageRoot, platform)
    || layout.launcherMode !== NATIVE_HOST_LAUNCHER_MODE
    || layout.markerMode !== NATIVE_HOST_PRIVATE_FILE_MODE
    || layout.directoryMode !== NATIVE_HOST_RUNTIME_DIRECTORY_MODE
    || !layout.pack
    || layout.pack.shell !== false
    || !layout.install
    || layout.install.shell !== false
  ) {
    return Object.freeze({ ok: false, reason: 'invalid-layout' });
  }
  if (evidence) {
    const requiredEvidence: ReadonlyArray<readonly [keyof NativeHostRuntimeEvidence, string]> = [
      ['npmCli', 'missing-npm-cli'],
      ['runtimeIntegrity', 'missing-runtime-integrity'],
      ['bundleComplete', 'missing-bundle-complete'],
      ['launcherArtifact', 'missing-launcher-artifact'],
    ];
    for (const [field, reason] of requiredEvidence) {
      if (evidence[field] !== true) return Object.freeze({ ok: false, reason });
    }
  }
  return Object.freeze({ ok: true });
}

export function createNativeHostOwnerMarker(
  layout: NativeHostRuntimeLayout,
  artifactSha256: string,
): NativeHostOwnerMarker {
  const validation = validateNativeHostRuntimeLayout(layout);
  if (!validation.ok || !SHA256_PATTERN.test(artifactSha256)) {
    refuse('FSBNH_LAYOUT_OWNER_MARKER');
  }
  return Object.freeze({
    schema: NATIVE_HOST_OWNER_MARKER_SCHEMA,
    owner: NATIVE_HOST_OWNER,
    host: NATIVE_HOST_NAME,
    origin: layout.origin,
    platform: layout.platform,
    packageVersion: layout.packageVersion,
    launcherRelativePath: layout.launcherRelativePath,
    artifactSha256,
    installToken: layout.installToken,
  });
}

export function resolveNativeHostWakeRuntimeLayout(
  input: unknown,
): NativeHostWakeRuntimeLayout {
  const fields = exactDataValues(
    input,
    ['platform', 'absoluteEntryPath', 'absoluteNode'],
    'FSBNH_WAKE_RUNTIME',
  );
  if (!['darwin', 'linux', 'win32'].includes(String(fields.platform))) {
    refuse('FSBNH_WAKE_RUNTIME');
  }
  const platform = fields.platform as NativeHostPlatform;
  const api = pathApi(platform);
  const absoluteEntryPath = normalizedAbsolutePath(
    fields.absoluteEntryPath,
    platform,
    'FSBNH_WAKE_RUNTIME',
  );
  const absoluteNode = normalizedAbsolutePath(
    fields.absoluteNode,
    platform,
    'FSBNH_WAKE_RUNTIME',
  );
  const entryParts = NATIVE_HOST_ENTRY_RELATIVE_PATH.split('/');
  let stableRuntimeRoot = absoluteEntryPath;
  for (let index = 0; index < entryParts.length; index += 1) {
    stableRuntimeRoot = api.dirname(stableRuntimeRoot);
  }
  if (
    stableRuntimeRoot === api.parse(stableRuntimeRoot).root
    || !pathsEqual(
      absoluteEntryPath,
      api.join(stableRuntimeRoot, ...entryParts),
      platform,
    )
  ) {
    refuse('FSBNH_WAKE_RUNTIME');
  }
  return Object.freeze({
    platform,
    markerPath: api.join(stableRuntimeRoot, 'owner.json'),
    stableRuntimeRoot,
    absoluteNode,
    absoluteStableBuildIndex: api.join(
      stableRuntimeRoot,
      'runtime',
      'package',
      'build',
      'index.js',
    ),
  });
}

export function parseNativeHostOwnerMarker(
  value: unknown,
  expectedPlatform: NativeHostPlatform,
): NativeHostOwnerMarker {
  if (!['darwin', 'linux', 'win32'].includes(expectedPlatform)) {
    refuse('FSBNH_WAKE_OWNER_MARKER');
  }
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
    'FSBNH_WAKE_OWNER_MARKER',
  );
  const expectedLauncherRelativePath = expectedPlatform === 'win32'
    ? NATIVE_HOST_WINDOWS_LAUNCHER_RELATIVE_PATH
    : NATIVE_HOST_POSIX_LAUNCHER_RELATIVE_PATH;
  if (
    fields.schema !== NATIVE_HOST_OWNER_MARKER_SCHEMA
    || fields.owner !== NATIVE_HOST_OWNER
    || fields.host !== NATIVE_HOST_NAME
    || fields.platform !== expectedPlatform
    || typeof fields.origin !== 'string'
    || !fields.origin.startsWith('chrome-extension://')
    || !fields.origin.endsWith('/')
    || !isNativeHostExtensionId(fields.origin.slice(19, -1))
    || fields.origin !== nativeHostOrigin(fields.origin.slice(19, -1))
    || typeof fields.packageVersion !== 'string'
    || !PACKAGE_VERSION_PATTERN.test(fields.packageVersion)
    || fields.launcherRelativePath !== expectedLauncherRelativePath
    || typeof fields.artifactSha256 !== 'string'
    || !SHA256_PATTERN.test(fields.artifactSha256)
    || typeof fields.installToken !== 'string'
    || !INSTALL_TOKEN_PATTERN.test(fields.installToken)
  ) {
    refuse('FSBNH_WAKE_OWNER_MARKER');
  }
  return Object.freeze({
    schema: NATIVE_HOST_OWNER_MARKER_SCHEMA,
    owner: NATIVE_HOST_OWNER,
    host: NATIVE_HOST_NAME,
    origin: fields.origin,
    platform: expectedPlatform,
    packageVersion: fields.packageVersion,
    launcherRelativePath: expectedLauncherRelativePath,
    artifactSha256: fields.artifactSha256,
    installToken: fields.installToken,
  });
}
