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

export type NativeHostBrowser = 'chrome' | 'edge' | 'brave' | 'chromium';

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
  browser: NativeHostBrowser;
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
  /**
   * Registers one more browser beside an existing install. On Windows the
   * shared manifest may already exist with exactly these contents, and only
   * the browser's registry value is written.
   */
  publishBrowserRegistration(contents: string): Promise<void>;
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
  stdin?: Uint8Array;
  isolatedEnvironment?: true;
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

/**
 * Who asked for the helper. `auto` installs come from installing an MCP client
 * and may be removed again when the last client goes; `explicit` installs come
 * from `install --native-host` and stay until removed by name. It is recorded
 * in `provenance.json` inside the stable root, apart from the install receipt,
 * so earlier package versions can still read and remove the helper. A helper
 * with no record counts as `explicit`.
 */
export type NativeHostProvenance = 'auto' | 'explicit';

/** `<stableRoot>/provenance.json`: tied to one publication by its install token. */
export interface NativeHostProvenanceRecord {
  schema: 1;
  installToken: string;
  provenance: NativeHostProvenance;
}

/**
 * `stable` publishes into the absent stable root. `next` publishes beside a
 * live stable root, at `${stableRoot}.next-<installToken>`, so a refresh can
 * swap the finished tree in with two renames.
 */
export type NativeHostRuntimePublishDestination = 'stable' | 'next';

export interface NativeHostRuntimePublishOptions {
  architecture?: NativeHostWindowsArchitecture | string;
  destination?: NativeHostRuntimePublishDestination;
  provenance?: NativeHostProvenance;
  /**
   * Windows keeps the one manifest every browser's registry value points at
   * inside the stable root, so a replacement tree must carry it.
   */
  windowsManifest?: string | null;
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
  schema: 2;
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
  registryHelperPath: string | null;
  registryHelperSha256: string | null;
  marker: NativeHostOwnerMarker;
  /** Only in receipts from builds that kept provenance there; read, never written. */
  provenance?: NativeHostProvenance;
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
    schema: 2;
    package: 'fsb-mcp-server';
    version: string;
    artifacts: ReadonlyArray<Readonly<{
      architecture: NativeHostWindowsArchitecture;
      role: 'bootstrap' | 'registry-helper';
      path: string;
      bytes: number;
      peMachine: '0x8664' | '0xaa64';
      sha256: string;
      packageVersion: string;
      roleMarker: string;
    }>>;
  }> | null;
}

export interface NativeHostRuntimeOwnedInspection {
  state: NativeHostOwnedState;
  reason: string;
  markerFact: NativeHostFileFact;
  marker: NativeHostOwnerMarker | null;
  receipt: Readonly<NativeHostRuntimeReceipt> | null;
  /** Who asked for this runtime; absent counts as `explicit`. */
  provenance?: NativeHostProvenance;
}

export interface NativeHostRuntimeInspectionLayout {
  platform: NativeHostPlatform;
  stableRoot: string;
  markerPath: string;
  launcherPath: string;
  packageRoot: string;
  packageEntryPath: string;
  integrityReceiptPath: string;
  registryHelperPath: string | null;
}

export interface NativeHostUninstallRuntimeAdapter {
  readonly layout: NativeHostRuntimeInspectionLayout;
  inspectRuntime(): Promise<Readonly<NativeHostRuntimeOwnedInspection>>;
  recheckExactRuntime(
    receipt: Readonly<NativeHostRuntimeReceipt>,
  ): Promise<boolean>;
  removeExactRuntime(
    receipt: Readonly<NativeHostRuntimeReceipt>,
  ): Promise<void>;
}

export interface NativeHostInstallRuntimeAdapter extends NativeHostUninstallRuntimeAdapter {
  readonly layout: import('../native-host/runtime-layout.js').NativeHostRuntimeLayout;
  publishRuntime(): Promise<NativeHostRuntimePublishResult>;
  recheckPublicationBoundary(
    receipt: Readonly<NativeHostRuntimeReceipt>,
  ): Promise<boolean>;
}

export interface NativeHostInstallTransactionDependencies {
  platform: NativeHostInstallPlatformAdapter;
  runtime: NativeHostInstallRuntimeAdapter;
}

export interface NativeHostUninstallTransactionDependencies {
  platform: NativeHostInstallPlatformAdapter;
  runtime: NativeHostUninstallRuntimeAdapter;
}

export interface NativeHostInstallRequest {
  extensionId?: string;
  browser?: NativeHostBrowser;
}

export interface NativeHostUninstallRequest {
  browser?: NativeHostBrowser;
}

export type NativeHostInstallResult = Readonly<{
  status: 'installed' | 'already-installed' | 'refused';
  reason: string;
  location: string;
  origin: string | null;
  packageVersion: string | null;
}>;

export type NativeHostUninstallResult = Readonly<{
  // partial: the browser's registration is gone, but the step after it
  // stopped for `reason`, so the helper's files stay.
  status: 'removed' | 'not-installed' | 'refused' | 'partial';
  reason: string;
  location: string;
  origin: string | null;
  packageVersion: string | null;
}>;

/**
 * `install` may create the helper from nothing; `refresh-only` keeps an
 * existing helper current and never creates one, so registration stays an
 * explicit user action.
 */
export interface NativeHostEnsureRequest {
  mode: 'install' | 'refresh-only';
  browsers?: 'auto' | NativeHostBrowser[];
  extensionId?: string;
  provenance: NativeHostProvenance;
}

export type NativeHostEnsureOutcome =
  | 'installed'
  | 'refreshed'
  | 'current'
  | 'registered'
  | 'skipped-absent'
  | 'skipped-opt-out'
  | 'deferred'
  | 'refused'
  | 'unavailable';

export interface NativeHostEnsureResult {
  outcome: NativeHostEnsureOutcome;
  reason?: string;
  version?: string;
  browsers: NativeHostBrowser[];
  addedBrowsers: NativeHostBrowser[];
  stableRoot: string;
  /**
   * Browsers this run meant to register beside the others but could not.
   * Present only when one failed; the outcome still describes the rest.
   */
  failedBrowsers?: NativeHostBrowser[];
  /** Why the first of `failedBrowsers` failed. */
  failedReason?: string;
}

export interface NativeHostUninstallAllRequest {
  onlyProvenance?: 'auto';
}

export interface NativeHostUninstallAllResult {
  outcome: 'removed' | 'absent' | 'kept' | 'refused' | 'unavailable';
  reason?: string;
  removedBrowsers: NativeHostBrowser[];
  provenance?: NativeHostProvenance;
}

export interface NativeHostOptOutRecord {
  at: number;
  reason: string;
}

/** The operations the CLI adds on top of the single-browser install and uninstall. */
export interface NativeHostEnsureOperations {
  ensure(request: NativeHostEnsureRequest): Promise<NativeHostEnsureResult>;
  uninstallAll(request?: NativeHostUninstallAllRequest): Promise<NativeHostUninstallAllResult>;
  readOptOut(): NativeHostOptOutRecord | null;
  writeOptOut(reason: string): void;
  clearOptOut(): void;
}

/** The success-or-backoff record that gates the expensive publish step. */
export interface NativeHostEnsureStamp {
  version: 1;
  packageVersion: string;
  nodePath: string;
  browsers: NativeHostBrowser[];
  at: number;
  failures: number;
  nextAttemptAt: number;
}

/**
 * Directories that live beside the stable root while a transaction runs:
 * `stage` (publish in progress), `next` (finished replacement), `retired`
 * (the replaced tree), `quarantine` (a tree whose launcher failed its hash)
 * and `remove` (a tree on its way to deletion).
 */
export type NativeHostSiblingKind = 'stage' | 'next' | 'retired' | 'quarantine' | 'remove';

export interface NativeHostSiblingFact {
  kind: NativeHostSiblingKind;
  token: string;
  ageMs: number;
}

export interface NativeHostLockLease {
  /** Doubles as the install token, so every directory this holder creates carries it. */
  readonly token: string;
  /** Tokens of dead holders whose lock this acquisition broke. */
  readonly staleTokens: readonly string[];
  lost(): boolean;
  /** Re-reads the lock: true only while it still names this holder. */
  held(): Promise<boolean>;
  release(): Promise<void>;
}

/** The native host's wake lock, held inside the stable root by a transaction. */
export interface NativeHostWakeLockHold {
  /** Stops keeping the lock fresh, leaving it in place; call before the tree moves. */
  stopRefreshing(): Promise<void>;
  /** Stops keeping it fresh and removes it if it is still this holder's. */
  release(): Promise<void>;
}

export interface NativeHostEnsureStateAdapter {
  /** Resolves null when a live holder keeps the lock past `waitMs`. */
  acquireLock(waitMs: number): Promise<NativeHostLockLease | null>;
  /**
   * Takes the native host's wake lock inside the stable root, so no browser
   * starts a serve process from it until the tree has moved. Resolves null
   * when a wake in progress keeps it.
   */
  holdWakeLock(token: string): Promise<NativeHostWakeLockHold | null>;
  readOptOut(): Promise<NativeHostOptOutRecord | null>;
  clearOptOut(): Promise<void>;
  readStamp(): Promise<NativeHostEnsureStamp | null>;
  writeStamp(stamp: NativeHostEnsureStamp): Promise<void>;
  writeStopRequest(token: string, reason: 'refresh' | 'uninstall'): Promise<void>;
  removeStopRequest(token: string): Promise<void>;
  stableRootPresent(): Promise<boolean>;
  listSiblings(): Promise<readonly NativeHostSiblingFact[]>;
  moveStableToSibling(kind: NativeHostSiblingKind, token: string): Promise<void>;
  moveSiblingToStable(kind: NativeHostSiblingKind, token: string): Promise<void>;
  removeSibling(kind: NativeHostSiblingKind, token: string): Promise<void>;
}

/** What is listening on the local service port. */
export type NativeHostListenerFact =
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'other' }>
  | Readonly<{ status: 'stable-root'; pid: number }>
  | Readonly<{ status: 'unknown' }>;

/** What the local service says about itself on its loopback /health endpoint. */
export interface NativeHostServiceHealth {
  /** Package version of the listening process, when it reports a usable one. */
  version: string | null;
  /** True only when the process reports that it honors stop requests. */
  stopRequests: boolean;
  /** Open MCP sessions over HTTP, or null when not reported. */
  sessions: number | null;
  /** Whether a mutating tool call is running, or null when not reported. */
  queuedMutationTools: boolean | null;
}

export interface NativeHostDaemonStopAdapter {
  isOnline(): Promise<boolean>;
  waitForOffline(timeoutMs: number): Promise<boolean>;
  identifyListener(): Promise<NativeHostListenerFact>;
  /** The service's /health report, or null when nothing answers with one that parses. */
  readHealth(): Promise<Readonly<NativeHostServiceHealth> | null>;
  /** Whether `pid` has child processes of its own; null when that cannot be read. */
  hasChildProcesses(pid: number): Promise<boolean | null>;
  terminate(pid: number): Promise<boolean>;
}

export interface NativeHostPublisherOptions {
  extensionId: string;
  installToken: string;
  provenance: NativeHostProvenance;
  destination: NativeHostRuntimePublishDestination;
  windowsManifest: string | null;
}

export interface NativeHostEnsureTiming {
  lockWaitMs: number;
  offlineTimeoutMs: number;
}

export interface NativeHostEnsureDependencies {
  readonly platform: import('../native-host/runtime-layout.js').NativeHostPlatform;
  readonly stableRoot: string;
  /** Version of the package running this transaction. */
  readonly packageVersion: string;
  /** Interpreter a fresh publish would pin. */
  readonly nodePath: string;
  readonly runtime: NativeHostUninstallRuntimeAdapter;
  readonly registrations: Readonly<Record<NativeHostBrowser, NativeHostInstallPlatformAdapter>>;
  readonly state: NativeHostEnsureStateAdapter;
  readonly daemon: NativeHostDaemonStopAdapter;
  readonly timing: NativeHostEnsureTiming;
  /** Browsers whose profiles hold the extension; may be empty. */
  detectBrowsers(extensionId: string): Promise<readonly NativeHostBrowser[]>;
  /** False only when the interpreter the installed launcher names is gone. */
  pinnedNodePresent(): Promise<boolean>;
  createPublisher(options: NativeHostPublisherOptions): Promise<NativeHostInstallRuntimeAdapter>;
  /** Records `provenance` for the exact runtime `receipt` describes. */
  rewriteProvenance(
    receipt: Readonly<NativeHostRuntimeReceipt>,
    provenance: NativeHostProvenance,
  ): Promise<boolean>;
  now(): number;
}

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
