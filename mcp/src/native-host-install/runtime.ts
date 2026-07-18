import { posix, win32 } from 'node:path';
import {
  NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH,
  NATIVE_HOST_PACKAGE_NAME,
  NATIVE_HOST_PRIVATE_FILE_MODE,
} from '../native-host/constants.js';
import {
  createNativeHostOwnerMarker,
  renderPosixNativeHostLauncher,
  validateNativeHostRuntimeLayout,
  type NativeHostRuntimeLayout,
} from '../native-host/runtime-layout.js';
import {
  nativeHostProcessInvocationFromRecipe,
  type NativeHostProcessInvocation,
  type NativeHostProcessResult,
  type NativeHostRuntimeDependencies,
  type NativeHostRuntimeIntegrityReceipt,
  type NativeHostRuntimePackageRecord,
  type NativeHostRuntimePackageSnapshot,
  type NativeHostRuntimePublishOptions,
  type NativeHostRuntimePublishResult,
  type NativeHostRuntimeReceipt,
  type NativeHostRuntimeRefusalReason,
  type NativeHostSecurePathFact,
  type NativeHostWindowsArchitecture,
} from './types.js';

const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_PATH_BYTES = 4096;
const MAX_PACKAGE_COUNT = 1024;
const POSIX_LAUNCHER_TEMPLATE =
  "#!__FSB_ABSOLUTE_NODE__\nimport '../runtime/package/build/native-host/index.js';\n";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SHA512_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]{86}==$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const PACKAGE_PATH_PATTERN = /^node_modules\/(?:@[^/]+\/)?[^/]+$/u;

class RuntimeRefusal extends Error {
  readonly reason: NativeHostRuntimeRefusalReason;

  constructor(reason: NativeHostRuntimeRefusalReason) {
    super(reason);
    this.reason = reason;
  }
}

function refuse(reason: NativeHostRuntimeRefusalReason): never {
  throw new RuntimeRefusal(reason);
}

function pathApi(layout: NativeHostRuntimeLayout): typeof posix | typeof win32 {
  return layout.platform === 'win32' ? win32 : posix;
}

function pathsEqual(
  layout: NativeHostRuntimeLayout,
  left: string,
  right: string,
): boolean {
  return layout.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function boundedString(value: unknown, maxBytes = MAX_PATH_BYTES): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= maxBytes
    && !value.includes('\0')
    && !value.includes('\r')
    && !value.includes('\n');
}

function ordinaryDataRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const record: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      return null;
    }
    record[key] = descriptor.value;
  }
  return record;
}

function exactOwnKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(record).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === [...expected].sort()[index]);
}

function stringArray(value: unknown, maxItems = MAX_PACKAGE_COUNT): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) return null;
  const output: string[] = [];
  for (const entry of value) {
    if (!boundedString(entry, 512)) return null;
    output.push(entry);
  }
  return Object.freeze(output);
}

function stringMap(value: unknown): Readonly<Record<string, string>> | null {
  const fields = ordinaryDataRecord(value);
  if (!fields || Object.keys(fields).length === 0 || Object.keys(fields).length > 128) {
    return null;
  }
  const output: Record<string, string> = Object.create(null);
  for (const name of Object.keys(fields)) {
    const version = fields[name];
    if (!boundedString(name, 256) || typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
      return null;
    }
    output[name] = version;
  }
  return Object.freeze(output);
}

function packageNameFromPath(packagePath: string): string | null {
  const match = packagePath.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/u);
  return match?.[1] ?? null;
}

function parseReceiptPackage(value: unknown): Readonly<Omit<NativeHostRuntimePackageRecord, 'dev'>> | null {
  const fields = ordinaryDataRecord(value);
  if (!fields || !exactOwnKeys(fields, ['path', 'name', 'version', 'integrity'])) return null;
  if (
    typeof fields.path !== 'string'
    || !PACKAGE_PATH_PATTERN.test(fields.path)
    || packageNameFromPath(fields.path) !== fields.name
    || !boundedString(fields.name, 256)
    || typeof fields.version !== 'string'
    || !VERSION_PATTERN.test(fields.version)
    || typeof fields.integrity !== 'string'
    || !SHA512_INTEGRITY_PATTERN.test(fields.integrity)
  ) {
    return null;
  }
  return Object.freeze({
    path: fields.path,
    name: fields.name,
    version: fields.version,
    integrity: fields.integrity,
  });
}

function parseIntegrityReceipt(
  value: unknown,
  packageVersion: string,
): Readonly<NativeHostRuntimeIntegrityReceipt> | null {
  const fields = ordinaryDataRecord(value);
  if (
    !fields
    || !exactOwnKeys(fields, [
      'schema',
      'packageName',
      'packageVersion',
      'lockSha256',
      'directDependencies',
      'bundleDependencies',
      'productionPackages',
    ])
    || fields.schema !== 1
    || fields.packageName !== NATIVE_HOST_PACKAGE_NAME
    || fields.packageVersion !== packageVersion
    || typeof fields.lockSha256 !== 'string'
    || !SHA256_PATTERN.test(fields.lockSha256)
    || /^0+$/u.test(fields.lockSha256)
  ) {
    return null;
  }
  const bundleDependencies = stringArray(fields.bundleDependencies, 128);
  if (!bundleDependencies || new Set(bundleDependencies).size !== bundleDependencies.length) return null;

  if (!Array.isArray(fields.directDependencies)
    || fields.directDependencies.length !== bundleDependencies.length) {
    return null;
  }
  const directDependencies: Array<Readonly<{ name: string; version: string }>> = [];
  for (let index = 0; index < fields.directDependencies.length; index += 1) {
    const direct = ordinaryDataRecord(fields.directDependencies[index]);
    if (
      !direct
      || !exactOwnKeys(direct, ['name', 'version'])
      || direct.name !== bundleDependencies[index]
      || !boundedString(direct.name, 256)
      || typeof direct.version !== 'string'
      || !VERSION_PATTERN.test(direct.version)
    ) {
      return null;
    }
    directDependencies.push(Object.freeze({ name: direct.name, version: direct.version }));
  }

  if (!Array.isArray(fields.productionPackages)
    || fields.productionPackages.length === 0
    || fields.productionPackages.length > MAX_PACKAGE_COUNT) {
    return null;
  }
  const productionPackages: Array<Readonly<Omit<NativeHostRuntimePackageRecord, 'dev'>>> = [];
  let previousPath = '';
  for (const candidate of fields.productionPackages) {
    const parsed = parseReceiptPackage(candidate);
    if (!parsed || parsed.path <= previousPath) return null;
    previousPath = parsed.path;
    productionPackages.push(parsed);
  }
  const names = new Set(productionPackages.map((entry) => entry.name));
  if (bundleDependencies.some((name) => !names.has(name))) return null;

  return Object.freeze({
    schema: 1,
    packageName: NATIVE_HOST_PACKAGE_NAME,
    packageVersion,
    lockSha256: fields.lockSha256,
    directDependencies: Object.freeze(directDependencies),
    bundleDependencies,
    productionPackages: Object.freeze(productionPackages),
  });
}

function parseProductionPackages(
  value: unknown,
  receipt: NativeHostRuntimeIntegrityReceipt,
): readonly Readonly<NativeHostRuntimePackageRecord>[] | null {
  if (!Array.isArray(value) || value.length !== receipt.productionPackages.length) return null;
  const output: Array<Readonly<NativeHostRuntimePackageRecord>> = [];
  for (let index = 0; index < value.length; index += 1) {
    const fields = ordinaryDataRecord(value[index]);
    const expected = receipt.productionPackages[index];
    if (
      !fields
      || !exactOwnKeys(fields, ['path', 'name', 'version', 'integrity', 'dev'])
      || fields.path !== expected.path
      || fields.name !== expected.name
      || fields.version !== expected.version
      || fields.integrity !== expected.integrity
      || fields.dev !== false
    ) {
      return null;
    }
    output.push(Object.freeze({ ...expected, dev: false }));
  }
  return Object.freeze(output);
}

function parseArtifactFile(
  value: unknown,
  expectedPath: string,
  layout: NativeHostRuntimeLayout,
  withContents: boolean,
): Readonly<Record<string, unknown>> | null {
  const fields = ordinaryDataRecord(value);
  const expectedKeys = withContents
    ? ['status', 'path', 'realPath', 'contents', 'sha256', 'bytes']
    : ['status', 'path', 'realPath', 'sha256', 'bytes'];
  if (
    !fields
    || !exactOwnKeys(fields, expectedKeys)
    || fields.status !== 'file'
    || typeof fields.path !== 'string'
    || typeof fields.realPath !== 'string'
    || !pathsEqual(layout, fields.path, expectedPath)
    || !pathsEqual(layout, fields.realPath, expectedPath)
    || typeof fields.sha256 !== 'string'
    || !SHA256_PATTERN.test(fields.sha256)
    || !Number.isSafeInteger(fields.bytes)
    || Number(fields.bytes) <= 0
    || Number(fields.bytes) > 128 * 1024 * 1024
    || (withContents && typeof fields.contents !== 'string')
  ) {
    return null;
  }
  return fields;
}

function parseWindowsArtifacts(
  value: unknown,
  packageVersion: string,
): NativeHostRuntimePackageSnapshot['windowsArtifacts'] | null {
  const fields = ordinaryDataRecord(value);
  if (
    !fields
    || !exactOwnKeys(fields, ['schema', 'package', 'version', 'artifacts'])
    || fields.schema !== 1
    || fields.package !== NATIVE_HOST_PACKAGE_NAME
    || fields.version !== packageVersion
    || !Array.isArray(fields.artifacts)
    || fields.artifacts.length !== 2
  ) {
    return null;
  }
  const expected = Object.freeze({
    x64: Object.freeze({
      path: 'native-host/bin/win32-x64/fsb-native-host.exe',
      peMachine: '0x8664' as const,
    }),
    arm64: Object.freeze({
      path: 'native-host/bin/win32-arm64/fsb-native-host.exe',
      peMachine: '0xaa64' as const,
    }),
  });
  const artifacts: NonNullable<NativeHostRuntimePackageSnapshot['windowsArtifacts']>['artifacts'][number][] = [];
  for (let index = 0; index < fields.artifacts.length; index += 1) {
    const artifact = ordinaryDataRecord(fields.artifacts[index]);
    const architecture = index === 0 ? 'x64' : 'arm64';
    const expectation = expected[architecture];
    if (
      !artifact
      || !exactOwnKeys(artifact, [
        'architecture',
        'path',
        'bytes',
        'peMachine',
        'sha256',
        'packageVersion',
      ])
      || artifact.architecture !== architecture
      || artifact.path !== expectation.path
      || artifact.peMachine !== expectation.peMachine
      || artifact.packageVersion !== packageVersion
      || !Number.isSafeInteger(artifact.bytes)
      || Number(artifact.bytes) < 64
      || Number(artifact.bytes) > 16 * 1024 * 1024
      || typeof artifact.sha256 !== 'string'
      || !SHA256_PATTERN.test(artifact.sha256)
    ) {
      return null;
    }
    artifacts.push(Object.freeze({
      architecture,
      path: expectation.path,
      bytes: Number(artifact.bytes),
      peMachine: expectation.peMachine,
      sha256: artifact.sha256,
      packageVersion,
    }));
  }
  return Object.freeze({
    schema: 1,
    package: NATIVE_HOST_PACKAGE_NAME,
    version: packageVersion,
    artifacts: Object.freeze(artifacts),
  });
}

function parsePackageSnapshot(
  value: unknown,
  expectedRoot: string,
  layout: NativeHostRuntimeLayout,
): Readonly<NativeHostRuntimePackageSnapshot> | null {
  const fields = ordinaryDataRecord(value);
  if (
    !fields
    || !exactOwnKeys(fields, [
      'schema',
      'packageRoot',
      'packageRealPath',
      'packageName',
      'packageVersion',
      'dependencies',
      'bundleDependencies',
      'integrityReceipt',
      'productionPackages',
      'buildEntry',
      'posixLauncherTemplate',
      'windowsArtifacts',
    ])
    || fields.schema !== 1
    || typeof fields.packageRoot !== 'string'
    || typeof fields.packageRealPath !== 'string'
    || !pathsEqual(layout, fields.packageRoot, expectedRoot)
    || !pathsEqual(layout, fields.packageRealPath, expectedRoot)
    || fields.packageName !== NATIVE_HOST_PACKAGE_NAME
    || fields.packageVersion !== layout.packageVersion
  ) {
    return null;
  }
  const dependencies = stringMap(fields.dependencies);
  const bundleDependencies = stringArray(fields.bundleDependencies, 128);
  const integrityReceipt = parseIntegrityReceipt(fields.integrityReceipt, layout.packageVersion);
  if (!dependencies || !bundleDependencies || !integrityReceipt) return null;
  if (
    bundleDependencies.length !== Object.keys(dependencies).length
    || bundleDependencies.length !== integrityReceipt.bundleDependencies.length
    || bundleDependencies.some((name, index) => (
      name !== integrityReceipt.bundleDependencies[index]
      || dependencies[name] !== integrityReceipt.directDependencies[index]?.version
    ))
  ) {
    return null;
  }
  const productionPackages = parseProductionPackages(
    fields.productionPackages,
    integrityReceipt,
  );
  if (!productionPackages) return null;

  const api = pathApi(layout);
  const buildEntryPath = api.join(expectedRoot, 'build', 'native-host', 'index.js');
  const buildEntry = parseArtifactFile(fields.buildEntry, buildEntryPath, layout, false);
  if (!buildEntry) return null;

  let posixLauncherTemplate: NativeHostRuntimePackageSnapshot['posixLauncherTemplate'] = null;
  let windowsArtifacts: NativeHostRuntimePackageSnapshot['windowsArtifacts'] = null;
  if (layout.platform === 'win32') {
    if (fields.posixLauncherTemplate !== null) return null;
    windowsArtifacts = parseWindowsArtifacts(fields.windowsArtifacts, layout.packageVersion);
    if (!windowsArtifacts) return null;
  } else {
    if (fields.windowsArtifacts !== null) return null;
    const templatePath = api.join(
      expectedRoot,
      'native-host',
      'posix',
      'fsb-native-host-launcher.mjs.in',
    );
    const template = parseArtifactFile(
      fields.posixLauncherTemplate,
      templatePath,
      layout,
      true,
    );
    if (!template || template.contents !== POSIX_LAUNCHER_TEMPLATE) return null;
    posixLauncherTemplate = Object.freeze({
      status: 'file',
      path: String(template.path),
      realPath: String(template.realPath),
      contents: String(template.contents),
      sha256: String(template.sha256),
      bytes: Number(template.bytes),
    });
  }

  return Object.freeze({
    schema: 1,
    packageRoot: expectedRoot,
    packageRealPath: expectedRoot,
    packageName: NATIVE_HOST_PACKAGE_NAME,
    packageVersion: layout.packageVersion,
    dependencies,
    bundleDependencies,
    integrityReceipt,
    productionPackages,
    buildEntry: Object.freeze({
      status: 'file',
      path: String(buildEntry.path),
      realPath: String(buildEntry.realPath),
      sha256: String(buildEntry.sha256),
      bytes: Number(buildEntry.bytes),
    }),
    posixLauncherTemplate,
    windowsArtifacts,
  });
}

function snapshotContract(snapshot: NativeHostRuntimePackageSnapshot): string {
  return JSON.stringify({
    packageName: snapshot.packageName,
    packageVersion: snapshot.packageVersion,
    dependencies: snapshot.dependencies,
    bundleDependencies: snapshot.bundleDependencies,
    integrityReceipt: snapshot.integrityReceipt,
    productionPackages: snapshot.productionPackages,
    buildEntry: {
      sha256: snapshot.buildEntry.sha256,
      bytes: snapshot.buildEntry.bytes,
    },
    posixLauncherTemplate: snapshot.posixLauncherTemplate
      ? {
        contents: snapshot.posixLauncherTemplate.contents,
        sha256: snapshot.posixLauncherTemplate.sha256,
        bytes: snapshot.posixLauncherTemplate.bytes,
      }
      : null,
    windowsArtifacts: snapshot.windowsArtifacts,
  });
}

function exactSecurePath(
  fact: NativeHostSecurePathFact,
  pathname: string,
  expectedKind: 'file' | 'directory',
  layout: NativeHostRuntimeLayout,
): boolean {
  return fact.status === expectedKind
    && pathsEqual(layout, fact.path, pathname)
    && pathsEqual(layout, fact.realPath, pathname);
}

function validateProcessResult(
  result: NativeHostProcessResult,
  failureReason: 'pack-failed' | 'install-failed',
): void {
  const fields = ordinaryDataRecord(result);
  if (
    !fields
    || !Number.isSafeInteger(fields.status)
    || typeof fields.stdout !== 'string'
    || typeof fields.stderr !== 'string'
    || !Number.isSafeInteger(fields.networkRequests)
    || Number(fields.networkRequests) < 0
  ) {
    refuse(failureReason);
  }
  if (Number(fields.networkRequests) !== 0) refuse('network-attempted');
  if (
    Buffer.byteLength(fields.stdout, 'utf8') > MAX_PROCESS_OUTPUT_BYTES
    || Buffer.byteLength(fields.stderr, 'utf8') > MAX_PROCESS_OUTPUT_BYTES
  ) {
    refuse('process-output-exceeded');
  }
  if (fields.status !== 0) refuse(failureReason);
}

function parsePackReceipt(
  stdout: string,
  layout: NativeHostRuntimeLayout,
  source: NativeHostRuntimePackageSnapshot,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return refuse('invalid-pack-receipt');
  }
  if (!Array.isArray(parsed) || parsed.length !== 1) refuse('invalid-pack-receipt');
  const fields = ordinaryDataRecord(parsed[0]);
  const bundled = fields ? stringArray(fields.bundled) : null;
  const expectedBundled = [...new Set(
    source.integrityReceipt.productionPackages.map((entry) => entry.name),
  )].sort();
  const api = pathApi(layout);
  if (
    !fields
    || fields.name !== NATIVE_HOST_PACKAGE_NAME
    || fields.version !== layout.packageVersion
    || fields.filename !== api.basename(layout.tarballPath)
    || typeof fields.integrity !== 'string'
    || !SHA512_INTEGRITY_PATTERN.test(fields.integrity)
    || !bundled
    || JSON.stringify([...bundled].sort()) !== JSON.stringify(expectedBundled)
  ) {
    refuse('invalid-pack-receipt');
  }
  return fields.integrity;
}

function stagePath(layout: NativeHostRuntimeLayout, finalPath: string): string {
  const api = pathApi(layout);
  const relative = api.relative(layout.stableRoot, finalPath);
  if (
    relative.length === 0
    || relative === '..'
    || relative.startsWith(`..${api.sep}`)
    || api.isAbsolute(relative)
  ) {
    refuse('publication-failed');
  }
  return api.join(layout.stageRoot, relative);
}

function renderWindowsBootstrapConfig(layout: NativeHostRuntimeLayout): Uint8Array {
  const values = [layout.nodePath, layout.packageEntryPath, layout.origin]
    .map((value) => Buffer.from(value, 'utf8'));
  if (values.some((value) => value.length === 0 || value.includes(0))) {
    refuse('publication-failed');
  }
  const total = 24 + values.reduce((sum, value) => sum + value.length, 0);
  if (total > MAX_METADATA_BYTES) refuse('publication-failed');
  const header = Buffer.alloc(24);
  Buffer.from('FSBNH01\0', 'ascii').copy(header, 0);
  header.writeUInt32LE(1, 8);
  header.writeUInt32LE(values[0].length, 12);
  header.writeUInt32LE(values[1].length, 16);
  header.writeUInt32LE(values[2].length, 20);
  return Buffer.concat([header, ...values]);
}

function published(
  receipt: NativeHostRuntimeReceipt,
  pack: NativeHostProcessInvocation,
  install: NativeHostProcessInvocation,
): NativeHostRuntimePublishResult {
  return Object.freeze({
    status: 'published',
    reason: 'published',
    receipt: Object.freeze(receipt),
    trace: Object.freeze({ pack, install }),
  });
}

function refused(reason: NativeHostRuntimeRefusalReason): NativeHostRuntimePublishResult {
  return Object.freeze({ status: 'refused', reason, receipt: null });
}

export async function publishNativeHostRuntime(
  layout: NativeHostRuntimeLayout,
  dependencies: NativeHostRuntimeDependencies,
  options: NativeHostRuntimePublishOptions = {},
): Promise<NativeHostRuntimePublishResult> {
  const layoutValidation = validateNativeHostRuntimeLayout(layout);
  if (!layoutValidation.ok) return refused('invalid-source-package');
  const architecture = options.architecture;
  if (
    layout.platform === 'win32'
    && architecture !== 'x64'
    && architecture !== 'arm64'
  ) {
    return refused('unsupported-architecture');
  }

  const { files, process: materializer } = dependencies;
  const api = pathApi(layout);
  let stageTouched = false;
  let publicationStarted = false;
  let sourceSnapshot: Readonly<NativeHostRuntimePackageSnapshot> | null = null;
  try {
    const stableFact = await files.inspectSecurePath(layout.stableRoot, 'directory');
    if (stableFact.status !== 'absent') return refused('stable-root-not-absent');

    const nodeFact = await files.inspectSecurePath(layout.nodePath, 'file');
    const npmFact = await files.inspectSecurePath(layout.npmCliPath, 'file');
    const sourceRootFact = await files.inspectSecurePath(
      layout.invokingPackageRoot,
      'directory',
    );
    if (
      !exactSecurePath(nodeFact, layout.nodePath, 'file', layout)
      || !exactSecurePath(npmFact, layout.npmCliPath, 'file', layout)
      || !exactSecurePath(
        sourceRootFact,
        layout.invokingPackageRoot,
        'directory',
        layout,
      )
    ) {
      return refused('invalid-source-package');
    }
    sourceSnapshot = parsePackageSnapshot(
      await files.readPackageSnapshot(layout.invokingPackageRoot),
      layout.invokingPackageRoot,
      layout,
    );
    if (!sourceSnapshot) return refused('invalid-source-package');

    const pack = nativeHostProcessInvocationFromRecipe(
      layout.pack,
      MAX_PROCESS_OUTPUT_BYTES,
    );
    const install = nativeHostProcessInvocationFromRecipe(
      layout.install,
      MAX_PROCESS_OUTPUT_BYTES,
    );
    const packRoot = api.dirname(layout.tarballPath);
    const packCacheIndex = layout.pack.argv.indexOf('--cache');
    const packCacheRoot = packCacheIndex >= 0
      ? layout.pack.argv[packCacheIndex + 1]
      : '';
    const materializedRoot = layout.install.cwd;
    const materializedPackageRoot = api.join(
      materializedRoot,
      'node_modules',
      NATIVE_HOST_PACKAGE_NAME,
    );
    const stagedRuntimeRoot = api.join(layout.stageRoot, 'runtime');
    const stagedPackageRoot = api.join(stagedRuntimeRoot, 'package');
    const stagedBinRoot = api.join(layout.stageRoot, 'bin');
    const stagedMarkerPath = api.join(layout.stageRoot, 'owner.json');
    const stagedReceiptPath = api.join(
      layout.stageRoot,
      NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH,
    );
    const stagedLauncherPath = stagePath(layout, layout.launcherPath);
    const stagedEntryPath = stagePath(layout, layout.packageEntryPath);
    const stagedIntegrityPath = stagePath(layout, layout.integrityReceiptPath);
    const stagedBootstrapConfigPath = layout.bootstrapConfigPath
      ? stagePath(layout, layout.bootstrapConfigPath)
      : null;
    if (!boundedString(packCacheRoot) || !packCacheRoot.startsWith(layout.stageRoot)) {
      return refused('invalid-source-package');
    }

    stageTouched = true;
    try {
      await files.createDirectoryExclusive(layout.stageRoot, layout.directoryMode);
      for (const directory of [
        packRoot,
        packCacheRoot,
        layout.offlineCacheRoot,
        materializedRoot,
        stagedRuntimeRoot,
        stagedBinRoot,
      ]) {
        await files.createDirectory(directory, layout.directoryMode);
      }
      await files.assertEmptyDirectory(layout.offlineCacheRoot);
    } catch {
      refuse('stage-failed');
    }

    let packResult: NativeHostProcessResult;
    try {
      packResult = await materializer.run(pack);
    } catch {
      return refuse('pack-failed');
    }
    validateProcessResult(packResult, 'pack-failed');
    const packIntegrity = parsePackReceipt(packResult.stdout, layout, sourceSnapshot);
    const tarballIntegrity = await files.hashFile(layout.tarballPath, 'sha512');
    if (tarballIntegrity !== packIntegrity) refuse('tarball-integrity-mismatch');
    await files.assertEmptyDirectory(layout.offlineCacheRoot);

    let installResult: NativeHostProcessResult;
    try {
      installResult = await materializer.run(install);
    } catch {
      return refuse('install-failed');
    }
    validateProcessResult(installResult, 'install-failed');
    const installedSnapshot = parsePackageSnapshot(
      await files.readPackageSnapshot(materializedPackageRoot),
      materializedPackageRoot,
      layout,
    );
    if (
      !installedSnapshot
      || snapshotContract(installedSnapshot) !== snapshotContract(sourceSnapshot)
    ) {
      refuse('invalid-materialized-package');
    }
    if (
      await files.hashFile(installedSnapshot.buildEntry.path, 'sha256')
      !== installedSnapshot.buildEntry.sha256
    ) {
      refuse('invalid-materialized-package');
    }

    publicationStarted = true;
    await files.moveDirectoryExact(materializedPackageRoot, stagedPackageRoot);
    const stagedSnapshot = parsePackageSnapshot(
      await files.readPackageSnapshot(stagedPackageRoot),
      stagedPackageRoot,
      layout,
    );
    if (
      !stagedSnapshot
      || snapshotContract(stagedSnapshot) !== snapshotContract(sourceSnapshot)
      || await files.hashFile(stagedSnapshot.buildEntry.path, 'sha256')
        !== stagedSnapshot.buildEntry.sha256
    ) {
      refuse('publication-failed');
    }
    await files.restrictOwnedTree(
      stagedPackageRoot,
      layout.directoryMode,
      NATIVE_HOST_PRIVATE_FILE_MODE,
    );

    let artifactSha256: string;
    if (layout.platform === 'win32') {
      const selectedArchitecture = architecture as NativeHostWindowsArchitecture;
      const selected = stagedSnapshot.windowsArtifacts?.artifacts.find(
        (artifact) => artifact.architecture === selectedArchitecture,
      );
      if (!selected || !stagedBootstrapConfigPath) refuse('publication-failed');
      const selectedSource = api.join(
        stagedPackageRoot,
        ...selected.path.split('/'),
      );
      await files.copyFileExclusiveNoFollow(
        selectedSource,
        stagedLauncherPath,
        layout.launcherMode,
      );
      artifactSha256 = await files.hashFile(stagedLauncherPath, 'sha256');
      if (artifactSha256 !== selected.sha256) refuse('publication-failed');
      await files.writeFileExclusiveNoFollow(
        stagedBootstrapConfigPath,
        renderWindowsBootstrapConfig(layout),
        layout.markerMode,
      );
    } else {
      await files.writeFileExclusiveNoFollow(
        stagedLauncherPath,
        renderPosixNativeHostLauncher(layout.nodePath, layout.nodePath),
        layout.launcherMode,
      );
      artifactSha256 = await files.hashFile(stagedLauncherPath, 'sha256');
      if (!SHA256_PATTERN.test(artifactSha256)) refuse('publication-failed');
    }

    const marker = createNativeHostOwnerMarker(layout, artifactSha256);
    const receipt: NativeHostRuntimeReceipt = {
      schema: 1,
      platform: layout.platform,
      packageName: NATIVE_HOST_PACKAGE_NAME,
      packageVersion: layout.packageVersion,
      stableRoot: layout.stableRoot,
      launcherPath: layout.launcherPath,
      packageRoot: layout.packageRoot,
      markerPath: layout.markerPath,
      origin: layout.origin,
      installToken: layout.installToken,
      tarballIntegrity,
      artifactSha256,
      marker,
    };
    await files.writeFileExclusiveNoFollow(
      stagedReceiptPath,
      `${JSON.stringify(receipt)}\n`,
      layout.markerMode,
    );
    await files.writeFileExclusiveNoFollow(
      stagedMarkerPath,
      `${JSON.stringify(marker)}\n`,
      layout.markerMode,
    );
    for (const pathname of [
      stagedEntryPath,
      stagedIntegrityPath,
      stagedLauncherPath,
      ...(stagedBootstrapConfigPath ? [stagedBootstrapConfigPath] : []),
      stagedMarkerPath,
      stagedReceiptPath,
    ]) {
      await files.fsyncFile(pathname);
    }
    for (const pathname of [stagedPackageRoot, stagedRuntimeRoot, stagedBinRoot, layout.stageRoot]) {
      await files.fsyncDirectory(pathname);
    }
    await files.renameDirectoryAtomic(layout.stageRoot, layout.stableRoot);
    stageTouched = false;

    return published(receipt, pack, install);
  } catch (error) {
    if (error instanceof RuntimeRefusal) return refused(error.reason);
    return refused(publicationStarted ? 'publication-failed' : 'invalid-source-package');
  } finally {
    if (stageTouched) {
      try {
        await files.removeStage(layout.stageRoot);
      } catch {
        // Cleanup authority remains restricted to this attempt's tokened stage.
      }
    }
  }
}
