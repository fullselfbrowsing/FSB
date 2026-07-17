import type {
  NativeHostCommandRecipe,
  NativeHostOwnerMarker,
  NativeHostPlatform,
} from '../native-host/runtime-layout.js';

export type NativeHostOwnedState =
  | 'absent'
  | 'exact'
  | 'foreign'
  | 'mismatched'
  | 'invalid'
  | 'unavailable';

export type NativeHostRegistryView = 'user/32' | 'user/64';

export type NativeHostRegistrationKind = 'file' | 'registry';

export type NativeHostFileFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'symlink' }>
  | Readonly<{ status: 'other' }>
  | Readonly<{
      status: 'file';
      path: string;
      realPath: string;
      contents: string;
    }>;

export type NativeHostRegistryValueFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
      status: 'value';
      type: string;
      value: string;
    }>;

export type NativeHostRegistryKeyFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'empty' }>
  | Readonly<{ status: 'exact-default-only' }>
  | Readonly<{ status: 'nonempty' }>
  | Readonly<{ status: 'unavailable' }>;

export interface NativeHostInstallFileAdapter {
  inspectFile(pathname: string, maxBytes: number): Promise<NativeHostFileFact>;
  writePrivateFileAtomic(
    pathname: string,
    contents: string,
    mode: number,
  ): Promise<void>;
  removeFile(pathname: string): Promise<void>;
}

export interface NativeHostInstallRegistryAdapter {
  readDefault(
    view: NativeHostRegistryView,
    key: string,
  ): Promise<NativeHostRegistryValueFact>;
  writeDefault(
    view: NativeHostRegistryView,
    key: string,
    value: Readonly<{ type: 'REG_SZ'; value: string }>,
  ): Promise<void>;
  deleteDefault(view: NativeHostRegistryView, key: string): Promise<void>;
  inspectKey(
    view: NativeHostRegistryView,
    key: string,
  ): Promise<NativeHostRegistryKeyFact>;
  deleteEmptyKey(view: NativeHostRegistryView, key: string): Promise<void>;
}

export interface NativeHostInstallPlatformDependencies {
  files: NativeHostInstallFileAdapter;
  registry?: NativeHostInstallRegistryAdapter;
}

export type NativeHostFileRegistration = Readonly<{
  kind: 'file';
}>;

export type NativeHostRegistryRegistration = Readonly<{
  kind: 'registry';
  key: string;
  canonicalView: 'user/32';
  shadowView: 'user/64';
}>;

export interface NativeHostInstallPlatformLayout {
  platform: NativeHostPlatform;
  stableRoot: string;
  manifestPath: string;
  markerPath: string;
  launcherPath: string;
  registration: NativeHostFileRegistration | NativeHostRegistryRegistration;
}

export interface NativeHostRegistrationReadFacts {
  manifest: NativeHostFileFact;
  registry32?: NativeHostRegistryValueFact;
  registry64?: NativeHostRegistryValueFact;
}

export interface NativeHostInstallPlatformAdapter {
  readonly layout: NativeHostInstallPlatformLayout;
  readRegistrationFacts(): Promise<NativeHostRegistrationReadFacts>;
  publishRegistration(contents: string): Promise<void>;
  removeCanonicalRegistration(): Promise<void>;
  inspectCanonicalKey(): Promise<NativeHostRegistryKeyFact>;
  deleteCanonicalKeyIfEmpty(): Promise<void>;
}

export interface NativeHostRegistrationInspectionInput {
  layout: NativeHostInstallPlatformLayout;
  extensionId: string;
  manifest: NativeHostFileFact;
  marker: NativeHostFileFact;
  registry32?: NativeHostRegistryValueFact;
  registry64?: NativeHostRegistryValueFact;
}

export interface NativeHostRegistrationInspection<
  Manifest = unknown,
  Marker = unknown,
> {
  state: NativeHostOwnedState;
  reason: string;
  manifest: Manifest | null;
  marker: Marker | null;
}

export interface NativeHostProcessInvocation {
  executable: string;
  argv: readonly string[];
  cwd: string;
  environment: Readonly<Record<string, string>>;
  shell: false;
  maxOutputBytes: number;
}

export type NativeHostProcessResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
  networkRequests: number;
}>;

export interface NativeHostProcessMaterializer {
  run(invocation: NativeHostProcessInvocation): Promise<NativeHostProcessResult>;
}

export type NativeHostSecurePathFact =
  | Readonly<{ status: 'absent' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'symlink' }>
  | Readonly<{ status: 'other' }>
  | Readonly<{
      status: 'file' | 'directory';
      path: string;
      realPath: string;
      mode?: number;
    }>;

export type NativeHostRuntimeHashAlgorithm = 'sha256' | 'sha512';

export interface NativeHostRuntimeFileAdapter {
  inspectSecurePath(
    pathname: string,
    expectedKind: 'file' | 'directory',
  ): Promise<NativeHostSecurePathFact>;
  readPackageSnapshot(packageRoot: string): Promise<unknown>;
  createDirectoryExclusive(pathname: string, mode: number): Promise<void>;
  createDirectory(pathname: string, mode: number): Promise<void>;
  assertEmptyDirectory(pathname: string): Promise<void>;
  hashFile(
    pathname: string,
    algorithm: NativeHostRuntimeHashAlgorithm,
  ): Promise<string>;
  moveDirectoryExact(source: string, destination: string): Promise<void>;
  writeFileExclusiveNoFollow(
    pathname: string,
    contents: string | Uint8Array,
    mode: number,
  ): Promise<void>;
  copyFileExclusiveNoFollow(
    source: string,
    destination: string,
    mode: number,
  ): Promise<void>;
  restrictOwnedTree(
    pathname: string,
    directoryMode: number,
    fileMode: number,
  ): Promise<void>;
  fsyncFile(pathname: string): Promise<void>;
  fsyncDirectory(pathname: string): Promise<void>;
  renameDirectoryAtomic(source: string, destination: string): Promise<void>;
  removeStage(pathname: string): Promise<void>;
}

export interface NativeHostRuntimeDependencies {
  files: NativeHostRuntimeFileAdapter;
  process: NativeHostProcessMaterializer;
}

export type NativeHostWindowsArchitecture = 'x64' | 'arm64';

export interface NativeHostRuntimePublishOptions {
  architecture?: NativeHostWindowsArchitecture | string;
}

export type NativeHostRuntimeRefusalReason =
  | 'unsupported-architecture'
  | 'stable-root-not-absent'
  | 'invalid-source-package'
  | 'stage-failed'
  | 'pack-failed'
  | 'invalid-pack-receipt'
  | 'tarball-integrity-mismatch'
  | 'network-attempted'
  | 'process-output-exceeded'
  | 'install-failed'
  | 'invalid-materialized-package'
  | 'publication-failed';

export interface NativeHostRuntimeReceipt {
  schema: 1;
  platform: NativeHostPlatform;
  packageName: 'fsb-mcp-server';
  packageVersion: string;
  stableRoot: string;
  launcherPath: string;
  packageRoot: string;
  markerPath: string;
  origin: string;
  installToken: string;
  tarballIntegrity: string;
  artifactSha256: string;
  marker: NativeHostOwnerMarker;
}

export interface NativeHostRuntimeProcessTrace {
  pack: NativeHostProcessInvocation;
  install: NativeHostProcessInvocation;
}

export type NativeHostRuntimePublishResult =
  | Readonly<{
      status: 'published';
      reason: 'published';
      receipt: Readonly<NativeHostRuntimeReceipt>;
      trace: Readonly<NativeHostRuntimeProcessTrace>;
    }>
  | Readonly<{
      status: 'refused';
      reason: NativeHostRuntimeRefusalReason;
      receipt: null;
    }>;

export interface NativeHostRuntimePackageRecord {
  path: string;
  name: string;
  version: string;
  integrity: string;
  dev: false;
}

export interface NativeHostRuntimeIntegrityReceipt {
  schema: 1;
  packageName: 'fsb-mcp-server';
  packageVersion: string;
  lockSha256: string;
  directDependencies: ReadonlyArray<Readonly<{ name: string; version: string }>>;
  bundleDependencies: readonly string[];
  productionPackages: ReadonlyArray<
    Readonly<Omit<NativeHostRuntimePackageRecord, 'dev'>>
  >;
}

export interface NativeHostRuntimePackageSnapshot {
  schema: 1;
  packageRoot: string;
  packageRealPath: string;
  packageName: 'fsb-mcp-server';
  packageVersion: string;
  dependencies: Readonly<Record<string, string>>;
  bundleDependencies: readonly string[];
  integrityReceipt: Readonly<NativeHostRuntimeIntegrityReceipt>;
  productionPackages: readonly Readonly<NativeHostRuntimePackageRecord>[];
  buildEntry: Readonly<{
    status: 'file';
    path: string;
    realPath: string;
    sha256: string;
    bytes: number;
  }>;
  posixLauncherTemplate: Readonly<{
    status: 'file';
    path: string;
    realPath: string;
    contents: string;
    sha256: string;
    bytes: number;
  }> | null;
  windowsArtifacts: Readonly<{
    schema: 1;
    package: 'fsb-mcp-server';
    version: string;
    artifacts: ReadonlyArray<Readonly<{
      architecture: NativeHostWindowsArchitecture;
      path: string;
      bytes: number;
      peMachine: '0x8664' | '0xaa64';
      sha256: string;
      packageVersion: string;
    }>>;
  }> | null;
}

export interface NativeHostRuntimeOwnedInspection {
  state: NativeHostOwnedState;
  reason: string;
  markerFact: NativeHostFileFact;
  marker: NativeHostOwnerMarker | null;
  receipt: Readonly<NativeHostRuntimeReceipt> | null;
}

export interface NativeHostInstallRuntimeAdapter {
  readonly layout: import('../native-host/runtime-layout.js').NativeHostRuntimeLayout;
  inspectRuntime(): Promise<Readonly<NativeHostRuntimeOwnedInspection>>;
  publishRuntime(): Promise<NativeHostRuntimePublishResult>;
  recheckPublicationBoundary(
    receipt: Readonly<NativeHostRuntimeReceipt>,
  ): Promise<boolean>;
  recheckExactRuntime(
    receipt: Readonly<NativeHostRuntimeReceipt>,
  ): Promise<boolean>;
  removeExactRuntime(
    receipt: Readonly<NativeHostRuntimeReceipt>,
  ): Promise<void>;
}

export interface NativeHostInstallTransactionDependencies {
  platform: NativeHostInstallPlatformAdapter;
  runtime: NativeHostInstallRuntimeAdapter;
}

export interface NativeHostInstallRequest {
  extensionId?: string;
}

export type NativeHostInstallResult = Readonly<{
  status: 'installed' | 'already-installed' | 'refused';
  reason: string;
  location: string;
  origin: string | null;
  packageVersion: string | null;
}>;

export type NativeHostUninstallResult = Readonly<{
  status: 'removed' | 'not-installed' | 'refused';
  reason: string;
  location: string;
  origin: string | null;
  packageVersion: string | null;
}>;

export function nativeHostProcessInvocationFromRecipe(
  recipe: NativeHostCommandRecipe,
  maxOutputBytes: number,
): NativeHostProcessInvocation {
  return Object.freeze({
    executable: recipe.executable,
    argv: Object.freeze([...recipe.argv]),
    cwd: recipe.cwd,
    environment: Object.freeze({ ...(recipe.environment ?? {}) }),
    shell: false,
    maxOutputBytes,
  });
}
