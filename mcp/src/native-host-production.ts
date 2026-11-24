import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  constants as fsConstants,
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_HOST_DEFAULT_EXTENSION_ID,
  NATIVE_HOST_ENTRY_RELATIVE_PATH,
  NATIVE_HOST_HEALTH_TIMEOUT_MS,
  NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH,
  NATIVE_HOST_INTEGRITY_RELATIVE_PATH,
  NATIVE_HOST_PACKAGE_NAME,
  NATIVE_HOST_PACKAGE_RELATIVE_PATH,
  NATIVE_HOST_SERVICE_PORT,
  NATIVE_HOST_WINDOWS_CONFIG_RELATIVE_PATH,
  NATIVE_HOST_WINDOWS_REGISTRY_HELPER_RELATIVE_PATH,
  isNativeHostExtensionId,
  nativeHostOrigin,
} from './native-host/constants.js';
import { resolveNativeHostRuntimeLayout } from './native-host/runtime-layout.js';
import {
  inspectNativeHostRegistration,
  validateNativeHostManifest,
  validateNativeHostMarker,
} from './native-host-registration.js';
import { inspectNativeHostDaemonHealth } from './native-host/daemon.js';
import { createNativeHostDaemonDependencies } from './native-host/platform.js';
import { createNativeHostRegistryHelperAdapter } from './native-host-registry-helper.js';
import {
  ensureNativeHost,
  installNativeHostBrowser,
  uninstallAllNativeHost,
  uninstallNativeHostBrowser,
} from './native-host-install/index.js';
import { NATIVE_HOST_BROWSERS, isNativeHostBrowser } from './native-host-install/browser.js';
import {
  createNativeHostPlatformAdapter,
  detectFsbBrowsers,
  nativeHostBrowsersFromEnvironment,
  resolveNativeHostPlatformLayout,
} from './native-host-install/platform.js';
import { publishNativeHostRuntime } from './native-host-install/runtime.js';
import type {
  NativeHostDaemonStopAdapter,
  NativeHostEnsureDependencies,
  NativeHostEnsureOperations,
  NativeHostEnsureRequest,
  NativeHostEnsureResult,
  NativeHostEnsureStamp,
  NativeHostEnsureStateAdapter,
  NativeHostEnsureTiming,
  NativeHostFileFact,
  NativeHostBrowser,
  NativeHostInstallFileAdapter,
  NativeHostInstallRequest,
  NativeHostInstallResult,
  NativeHostInstallRuntimeAdapter,
  NativeHostListenerFact,
  NativeHostLockLease,
  NativeHostOptOutRecord,
  NativeHostProcessInvocation,
  NativeHostProvenance,
  NativeHostPublisherOptions,
  NativeHostSiblingFact,
  NativeHostSiblingKind,
  NativeHostUninstallAllRequest,
  NativeHostUninstallAllResult,
  NativeHostUninstallResult,
  NativeHostProcessResult,
  NativeHostRuntimeFileAdapter,
  NativeHostRuntimeInspectionLayout,
  NativeHostRuntimeOwnedInspection,
  NativeHostRuntimePublishOptions,
  NativeHostRuntimeReceipt,
  NativeHostRegistrationReadFacts,
  NativeHostSecurePathFact,
  NativeHostUninstallRuntimeAdapter,
  NativeHostUninstallRequest,
} from './native-host-install/types.js';
import type { NativeHostCliOperations } from './install.js';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_PROCESS_MS = 120_000;
const RECEIPT_KEYS = Object.freeze([
  'schema',
  'platform',
  'packageName',
  'packageVersion',
  'stableRoot',
  'launcherPath',
  'packageRoot',
  'markerPath',
  'origin',
  'installToken',
  'tarballIntegrity',
  'artifactSha256',
  'registryHelperPath',
  'registryHelperSha256',
  'marker',
]);

function ordinaryRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    ? value as Record<string, unknown>
    : null;
}

function sameKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function inside(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function pathsEqual(left: string, right: string): boolean {
  return process.platform === 'win32'
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

async function readBoundedRegular(pathname: string, maxBytes: number): Promise<Buffer> {
  const before = await lstat(pathname);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maxBytes) {
    throw new Error('unsafe-file');
  }
  const flags = fsConstants.O_RDONLY
    | (process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW);
  const handle = await open(pathname, flags);
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size !== before.size || current.size > maxBytes) {
      throw new Error('changed-file');
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function readJson(pathname: string, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  return JSON.parse((await readBoundedRegular(pathname, maxBytes)).toString('utf8')) as unknown;
}

async function hashFile(pathname: string, algorithm: 'sha256' | 'sha512'): Promise<string> {
  const digest = createHash(algorithm)
    .update(await readBoundedRegular(pathname, 128 * 1024 * 1024))
    .digest(algorithm === 'sha512' ? 'base64' : 'hex');
  return algorithm === 'sha512' ? `sha512-${digest}` : digest;
}

async function inspectFile(pathname: string, maxBytes: number): Promise<NativeHostFileFact> {
  try {
    const value = await lstat(pathname);
    if (value.isSymbolicLink()) return Object.freeze({ status: 'symlink' });
    if (!value.isFile()) return Object.freeze({ status: 'other' });
    if (value.size > maxBytes) return Object.freeze({ status: 'unavailable' });
    const resolved = await realpath(pathname);
    if (resolved !== resolve(pathname)) return Object.freeze({ status: 'symlink' });
    return Object.freeze({
      status: 'file',
      path: pathname,
      realPath: resolved,
      contents: (await readBoundedRegular(pathname, maxBytes)).toString('utf8'),
    });
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? Object.freeze({ status: 'absent' })
      : Object.freeze({ status: 'unavailable' });
  }
}

async function ensureParents(pathname: string): Promise<void> {
  const target = dirname(pathname);
  const parsed = resolve(target);
  const root = parsed.slice(0, parsed.indexOf(sep) + 1) || sep;
  const segments = relative(root, parsed).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    try {
      const fact = await lstat(cursor);
      if (!fact.isDirectory() || fact.isSymbolicLink()) throw new Error('unsafe-parent');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        await mkdir(cursor, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError;
      }
      const created = await lstat(cursor);
      if (!created.isDirectory() || created.isSymbolicLink()) throw new Error('unsafe-parent');
    }
  }
}

async function writePrivateFileAtomic(
  pathname: string,
  contents: string,
  mode: number,
): Promise<void> {
  await ensureParents(pathname);
  const temporary = join(dirname(pathname), `.${basename(pathname)}.${randomBytes(16).toString('hex')}`);
  const handle = await open(
    temporary,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
      | (process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW),
    mode,
  );
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, pathname);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function createInstallFileAdapter(): NativeHostInstallFileAdapter {
  return Object.freeze({
    inspectFile,
    writePrivateFileAtomic,
    removeFile: async (pathname: string): Promise<void> => {
      const fact = await lstat(pathname);
      if (!fact.isFile() || fact.isSymbolicLink()) throw new Error('unsafe-remove');
      await unlink(pathname);
    },
  });
}

function sanitizedEnvironment(
  extra: Readonly<Record<string, string>>,
  isolated: boolean,
): NodeJS.ProcessEnv {
  const allowed = [
    'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'SYSTEMROOT',
    'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
  ];
  const environment: NodeJS.ProcessEnv = Object.create(null);
  if (!isolated) {
    for (const key of allowed) {
      if (typeof process.env[key] === 'string') environment[key] = process.env[key];
    }
  }
  for (const [key, value] of Object.entries(extra)) environment[key] = value;
  return environment;
}

async function runProcess(invocation: NativeHostProcessInvocation): Promise<NativeHostProcessResult> {
  if (invocation.shell !== false || !isAbsolute(invocation.executable)) {
    throw new Error('unsafe-process');
  }
  return new Promise((resolveResult, rejectResult) => {
    const projectsPackReceipt = invocation.argv[1] === 'pack'
      && invocation.argv.includes('--json');
    const rawOutputLimit = projectsPackReceipt ? 8 * 1024 * 1024 : invocation.maxOutputBytes;
    const child = spawn(invocation.executable, [...invocation.argv], {
      cwd: invocation.cwd,
      env: sanitizedEnvironment(
        invocation.environment,
        invocation.isolatedEnvironment === true,
      ),
      shell: false,
      windowsHide: true,
      stdio: [invocation.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    if (invocation.stdin && child.stdin) {
      child.stdin.on('error', () => undefined);
      child.stdin.end(Buffer.from(invocation.stdin));
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let exceeded = false;
    const collect = (target: Buffer[]) => (chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes <= rawOutputLimit + 1) target.push(Buffer.from(chunk));
      if (outputBytes > rawOutputLimit && !exceeded) {
        exceeded = true;
        child.kill();
      }
    };
    child.stdout?.on('data', collect(stdout));
    child.stderr?.on('data', collect(stderr));
    const timer = setTimeout(() => child.kill(), MAX_PROCESS_MS);
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectResult(error);
    });
    child.once('close', (status) => {
      clearTimeout(timer);
      let stdoutText = Buffer.concat(stdout).toString('utf8');
      if (projectsPackReceipt && !exceeded && status === 0) {
        try {
          const parsed = JSON.parse(stdoutText) as unknown;
          const receipt = Array.isArray(parsed) && parsed.length === 1
            ? ordinaryRecord(parsed[0])
            : null;
          if (!receipt) throw new Error('invalid-pack-receipt');
          stdoutText = JSON.stringify([{
            name: receipt.name,
            version: receipt.version,
            filename: receipt.filename,
            integrity: receipt.integrity,
            bundled: receipt.bundled,
          }]);
          if (Buffer.byteLength(stdoutText, 'utf8') > invocation.maxOutputBytes) {
            throw new Error('oversized-pack-receipt');
          }
        } catch {
          exceeded = true;
          stdoutText = '';
        }
      }
      resolveResult(Object.freeze({
        status: exceeded ? 1 : (status ?? 1),
        stdout: stdoutText,
        stderr: Buffer.concat(stderr).toString('utf8'),
        networkRequests: 0,
      }));
    });
  });
}

async function artifact(pathname: string, withContents = false): Promise<Record<string, unknown>> {
  const bytes = await readBoundedRegular(pathname, 128 * 1024 * 1024);
  const resolved = await realpath(pathname);
  return {
    status: 'file',
    path: pathname,
    realPath: resolved,
    ...(withContents ? { contents: bytes.toString('utf8') } : {}),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.byteLength,
  };
}

async function inspectSecurePath(
  pathname: string,
  expectedKind: 'file' | 'directory',
): Promise<NativeHostSecurePathFact> {
  try {
    const value = await lstat(pathname);
    if (value.isSymbolicLink()) return Object.freeze({ status: 'symlink' });
    const kind = value.isFile() ? 'file' : value.isDirectory() ? 'directory' : 'other';
    if (kind !== expectedKind) return Object.freeze({ status: 'other' });
    const resolved = await realpath(pathname);
    if (resolved !== resolve(pathname)) return Object.freeze({ status: 'symlink' });
    return Object.freeze({
      status: expectedKind,
      path: pathname,
      realPath: resolved,
      mode: value.mode & 0o7777,
    });
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT'
      ? Object.freeze({ status: 'absent' })
      : Object.freeze({ status: 'unavailable' });
  }
}

function createRuntimeFiles(stageRoot: string, platform: NodeJS.Platform): NativeHostRuntimeFileAdapter {
  const requireStagePath = (pathname: string): void => {
    if (!inside(pathname, stageRoot)) throw new Error('outside-stage');
  };
  return Object.freeze({
    inspectSecurePath: async (
      pathname: string,
      expectedKind: 'file' | 'directory',
    ): Promise<NativeHostSecurePathFact> => inspectSecurePath(pathname, expectedKind),
    readPackageSnapshot: async (packageRoot: string): Promise<unknown> => {
      const packageRealPath = await realpath(packageRoot);
      if (packageRealPath !== resolve(packageRoot)) throw new Error('unsafe-package-root');
      const manifest = ordinaryRecord(await readJson(join(packageRoot, 'package.json')));
      const integrity = ordinaryRecord(await readJson(
        join(packageRoot, 'native-host', 'runtime-integrity.json'),
      ));
      if (!manifest || !integrity || !Array.isArray(integrity.productionPackages)) {
        throw new Error('invalid-package');
      }
      const productionPackages = [];
      for (const entryValue of integrity.productionPackages) {
        const entry = ordinaryRecord(entryValue);
        if (!entry || typeof entry.path !== 'string') throw new Error('invalid-package');
        const dependencyRoot = join(packageRoot, ...entry.path.split('/'));
        if (!inside(dependencyRoot, packageRoot)) throw new Error('invalid-package');
        const dependency = ordinaryRecord(await readJson(join(dependencyRoot, 'package.json')));
        if (!dependency) throw new Error('invalid-package');
        productionPackages.push({
          path: entry.path,
          name: dependency.name,
          version: dependency.version,
          integrity: entry.integrity,
          dev: false,
        });
      }
      return {
        schema: 1,
        packageRoot,
        packageRealPath,
        packageName: manifest.name,
        packageVersion: manifest.version,
        dependencies: manifest.dependencies,
        bundleDependencies: manifest.bundleDependencies,
        integrityReceipt: integrity,
        productionPackages,
        buildEntry: await artifact(join(packageRoot, 'build', 'native-host', 'index.js')),
        posixLauncherTemplate: platform === 'win32' ? null : await artifact(
          join(packageRoot, 'native-host', 'posix', 'fsb-native-host-launcher.mjs.in'),
          true,
        ),
        windowsArtifacts: platform === 'win32'
          ? await readJson(join(packageRoot, 'native-host', 'windows-artifacts.json'))
          : null,
      };
    },
    createDirectoryExclusive: async (pathname: string, mode: number): Promise<void> => {
      if (pathname !== stageRoot) throw new Error('unexpected-stage');
      await ensureParents(pathname);
      await mkdir(pathname, { mode });
    },
    createDirectory: async (pathname: string, mode: number): Promise<void> => {
      requireStagePath(pathname);
      await mkdir(pathname, { recursive: true, mode });
    },
    assertEmptyDirectory: async (pathname: string): Promise<void> => {
      requireStagePath(pathname);
      if ((await readdir(pathname)).length !== 0) throw new Error('not-empty');
    },
    hashFile,
    moveDirectoryExact: async (source: string, destination: string): Promise<void> => {
      requireStagePath(source);
      requireStagePath(destination);
      try {
        await lstat(destination);
        throw new Error('destination-exists');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rename(source, destination);
    },
    writeFileExclusiveNoFollow: async (
      pathname: string,
      contents: string | Uint8Array,
      mode: number,
    ): Promise<void> => {
      requireStagePath(pathname);
      const handle = await open(
        pathname,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
          | (process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW),
        mode,
      );
      try {
        await handle.writeFile(contents);
      } finally {
        await handle.close();
      }
    },
    copyFileExclusiveNoFollow: async (
      source: string,
      destination: string,
      mode: number,
    ): Promise<void> => {
      requireStagePath(source);
      requireStagePath(destination);
      const sourceFact = await lstat(source);
      if (!sourceFact.isFile() || sourceFact.isSymbolicLink()) throw new Error('unsafe-copy');
      await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
      await chmod(destination, mode);
    },
    restrictOwnedTree: async (
      pathname: string,
      directoryMode: number,
      fileMode: number,
    ): Promise<void> => {
      requireStagePath(pathname);
      const visit = async (candidate: string): Promise<void> => {
        const value = await lstat(candidate);
        if (value.isSymbolicLink()) {
          const target = await realpath(candidate);
          if (!inside(target, pathname)) throw new Error('escaping-symlink');
          return;
        }
        if (value.isDirectory()) {
          await chmod(candidate, directoryMode);
          for (const name of await readdir(candidate)) await visit(join(candidate, name));
          return;
        }
        if (!value.isFile()) throw new Error('unsupported-entry');
        await chmod(candidate, fileMode);
      };
      await visit(pathname);
    },
    fsyncFile: async (pathname: string): Promise<void> => {
      requireStagePath(pathname);
      const handle = await open(pathname, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    },
    fsyncDirectory: async (pathname: string): Promise<void> => {
      requireStagePath(pathname);
      if (process.platform === 'win32') return;
      const handle = await open(pathname, 'r');
      try { await handle.sync(); } finally { await handle.close(); }
    },
    renameDirectoryAtomic: async (source: string, destination: string): Promise<void> => {
      if (source !== stageRoot) throw new Error('unexpected-stage');
      try {
        await lstat(destination);
        throw new Error('destination-exists');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await rename(source, destination);
    },
    removeStage: async (pathname: string): Promise<void> => {
      if (pathname !== stageRoot) throw new Error('unexpected-stage');
      await rm(pathname, { recursive: true, force: true });
    },
  });
}

function parseReceipt(value: unknown, platform: 'darwin' | 'linux' | 'win32'):
Readonly<NativeHostRuntimeReceipt> | null {
  const fields = ordinaryRecord(value);
  const markerFields = ordinaryRecord(fields?.marker);
  const origin = markerFields?.origin;
  const marker = typeof origin === 'string'
    ? validateNativeHostMarker(markerFields, { platform, origin })
    : null;
  if (
    !fields
    || !(sameKeys(fields, RECEIPT_KEYS)
      || (sameKeys(fields, [...RECEIPT_KEYS, 'provenance'])
        && (fields.provenance === 'auto' || fields.provenance === 'explicit')))
    || fields.schema !== 2
    || !marker
    || (platform === 'win32'
      ? typeof fields.registryHelperPath !== 'string'
        || typeof fields.registryHelperSha256 !== 'string'
        || !/^[a-f0-9]{64}$/u.test(fields.registryHelperSha256)
      : fields.registryHelperPath !== null || fields.registryHelperSha256 !== null)
  ) return null;
  return fields as unknown as Readonly<NativeHostRuntimeReceipt>;
}

function receiptsEqual(
  left: Readonly<NativeHostRuntimeReceipt> | null,
  right: Readonly<NativeHostRuntimeReceipt>,
): boolean {
  return Boolean(left && JSON.stringify(left) === JSON.stringify(right));
}

async function inspectOwnedRuntime(
  layout: NativeHostRuntimeInspectionLayout,
): Promise<Readonly<NativeHostRuntimeOwnedInspection>> {
  const receiptPath = join(layout.stableRoot, NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH);
  const root = await inspectSecurePath(layout.stableRoot, 'directory');
  if (root.status === 'absent') {
    return Object.freeze({
      state: 'absent', reason: 'absent', markerFact: Object.freeze({ status: 'absent' }),
      marker: null, receipt: null,
    });
  }
  if (root.status !== 'directory') {
    return Object.freeze({
      state: root.status === 'unavailable' ? 'unavailable' : 'foreign',
      reason: 'runtime-root-not-owned',
      markerFact: Object.freeze({ status: 'unavailable' }), marker: null, receipt: null,
    });
  }
  const markerFact = await inspectFile(layout.markerPath, 16 * 1024);
  const receiptFact = await inspectFile(receiptPath, 32 * 1024);
  if (markerFact.status !== 'file' || receiptFact.status !== 'file') {
    return Object.freeze({
      state: markerFact.status === 'unavailable' ? 'unavailable' : 'invalid',
      reason: 'runtime-metadata-invalid', markerFact, marker: null, receipt: null,
    });
  }
  try {
    const markerValue = ordinaryRecord(JSON.parse(markerFact.contents) as unknown);
    const markerOrigin = markerValue?.origin;
    const marker = typeof markerOrigin === 'string'
      ? validateNativeHostMarker(markerValue, { platform: layout.platform, origin: markerOrigin })
      : null;
    const receipt = parseReceipt(JSON.parse(receiptFact.contents) as unknown, layout.platform);
    if (!marker || !receipt || JSON.stringify(marker) !== JSON.stringify(receipt.marker)) {
      throw new Error('invalid-metadata');
    }
    if (
      receipt.stableRoot !== layout.stableRoot
      || receipt.markerPath !== layout.markerPath
      || receipt.launcherPath !== layout.launcherPath
      || receipt.packageRoot !== layout.packageRoot
      || receipt.platform !== layout.platform
      || receipt.registryHelperPath !== layout.registryHelperPath
    ) {
      return Object.freeze({
        state: 'mismatched', reason: 'runtime-layout-mismatch', markerFact, marker, receipt,
      });
    }
    const launcher = await inspectSecurePath(layout.launcherPath, 'file');
    const entry = await inspectSecurePath(layout.packageEntryPath, 'file');
    const integrity = await inspectSecurePath(layout.integrityReceiptPath, 'file');
    const registryHelper = layout.registryHelperPath
      ? await inspectSecurePath(layout.registryHelperPath, 'file')
      : null;
    if (
      launcher.status !== 'file' || entry.status !== 'file' || integrity.status !== 'file'
      || (layout.platform === 'win32' && (
        !registryHelper
        || registryHelper.status !== 'file'
        || !receipt.registryHelperSha256
        || await hashFile(layout.registryHelperPath as string, 'sha256')
          !== receipt.registryHelperSha256
      ))
    ) {
      throw new Error('invalid-runtime');
    }
    if (await hashFile(layout.launcherPath, 'sha256') !== receipt.artifactSha256) {
      // Marker, receipt and layout agree and every other file is in place;
      // only the launcher changed. That one case is safe to rebuild.
      return Object.freeze({
        state: 'invalid', reason: 'launcher-integrity', markerFact, marker, receipt,
      });
    }
    return Object.freeze({ state: 'exact', reason: 'exact', markerFact, marker, receipt });
  } catch {
    return Object.freeze({
      state: 'invalid', reason: 'runtime-metadata-invalid', markerFact, marker: null, receipt: null,
    });
  }
}

function createUninstallRuntimeAdapter(
  layout: NativeHostRuntimeInspectionLayout,
): NativeHostUninstallRuntimeAdapter {
  const inspectRuntime = (): Promise<Readonly<NativeHostRuntimeOwnedInspection>> => (
    inspectOwnedRuntime(layout)
  );
  return Object.freeze({
    layout,
    inspectRuntime,
    recheckExactRuntime: async (receipt: Readonly<NativeHostRuntimeReceipt>): Promise<boolean> => {
      const inspected = await inspectRuntime();
      return inspected.state === 'exact' && receiptsEqual(inspected.receipt, receipt);
    },
    removeExactRuntime: async (receipt: Readonly<NativeHostRuntimeReceipt>): Promise<void> => {
      const inspected = await inspectRuntime();
      if (inspected.state !== 'exact' || !receiptsEqual(inspected.receipt, receipt)) {
        throw new Error('runtime-boundary-changed');
      }
      const tombstone = `${layout.stableRoot}.remove-${randomBytes(16).toString('hex')}`;
      await rename(layout.stableRoot, tombstone);
      await rm(tombstone, { recursive: true });
    },
  });
}

function createRuntimeAdapter(
  layout: ReturnType<typeof resolveNativeHostRuntimeLayout>,
  publishOptions: Omit<NativeHostRuntimePublishOptions, 'architecture'> = {},
): NativeHostInstallRuntimeAdapter {
  const uninstall = createUninstallRuntimeAdapter(layout);
  const files = createRuntimeFiles(layout.stageRoot, process.platform);
  return Object.freeze({
    layout,
    inspectRuntime: uninstall.inspectRuntime,
    publishRuntime: () => publishNativeHostRuntime(
      layout,
      Object.freeze({ files, process: Object.freeze({ run: runProcess }) }),
      Object.freeze({ ...publishOptions, architecture: process.arch }),
    ),
    recheckPublicationBoundary: async (
      receipt: Readonly<NativeHostRuntimeReceipt>,
    ): Promise<boolean> => {
      const inspected = await uninstall.inspectRuntime();
      return inspected.state === 'exact' && receiptsEqual(inspected.receipt, receipt);
    },
    recheckExactRuntime: uninstall.recheckExactRuntime,
    removeExactRuntime: uninstall.removeExactRuntime,
  });
}

async function validatedNpmCliCandidate(npmPackageRoot: string): Promise<string | null> {
  try {
    const expectedRoot = resolve(npmPackageRoot);
    const rootFact = await lstat(expectedRoot);
    if (!rootFact.isDirectory() || rootFact.isSymbolicLink()) return null;
    const resolvedRoot = await realpath(expectedRoot);
    if (!pathsEqual(resolvedRoot, expectedRoot) || basename(resolvedRoot).toLowerCase() !== 'npm') {
      return null;
    }
    const parent = dirname(resolvedRoot);
    if (basename(parent).toLowerCase() !== 'node_modules') return null;

    const manifest = ordinaryRecord(await readJson(join(resolvedRoot, 'package.json'), 128 * 1024));
    if (manifest?.name !== 'npm' || typeof manifest.version !== 'string') return null;

    const expectedCli = join(resolvedRoot, 'bin', 'npm-cli.js');
    const cliFact = await lstat(expectedCli);
    if (!cliFact.isFile() || cliFact.isSymbolicLink()) return null;
    const resolvedCli = await realpath(expectedCli);
    const resolvedFact = await lstat(resolvedCli);
    if (
      !resolvedFact.isFile()
      || resolvedFact.isSymbolicLink()
      || !pathsEqual(resolvedCli, expectedCli)
      || basename(resolvedCli).toLowerCase() !== 'npm-cli.js'
      || !inside(resolvedCli, resolvedRoot)
    ) {
      return null;
    }
    return resolvedCli;
  } catch {
    return null;
  }
}

async function resolveNpmCliPath(
  nodeRealPath: string,
  invokingPackageRoot: string,
): Promise<string> {
  const nodeDirectory = dirname(nodeRealPath);
  const nodePrefix = dirname(nodeDirectory);
  const candidates = [
    join(nodeDirectory, 'node_modules', 'npm'),
    join(nodePrefix, 'lib', 'node_modules', 'npm'),
    join(nodePrefix, 'node_modules', 'npm'),
  ];
  const invokingModulesRoot = dirname(invokingPackageRoot);
  if (basename(invokingModulesRoot).toLowerCase() === 'node_modules') {
    candidates.push(join(invokingModulesRoot, 'npm'));
  }
  for (const candidate of new Set(candidates)) {
    const npmCliPath = await validatedNpmCliCandidate(candidate);
    if (npmCliPath) return npmCliPath;
  }
  throw new Error('npm-cli-unavailable');
}

async function productionRegistryAdapter(): Promise<
ReturnType<typeof createNativeHostRegistryHelperAdapter>
> {
  const packageRoot = await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const manifest = ordinaryRecord(await readJson(join(packageRoot, 'package.json')));
  if (
    !manifest
    || manifest.name !== NATIVE_HOST_PACKAGE_NAME
    || typeof manifest.version !== 'string'
  ) {
    throw new Error('registry-helper-unavailable');
  }
  return createNativeHostRegistryHelperAdapter(Object.freeze({
    packageRoot,
    packageVersion: manifest.version,
    architecture: process.arch,
    process: Object.freeze({ run: runProcess }),
  }));
}

function runtimeInspectionLayout(
  platformLayout: ReturnType<typeof resolveNativeHostPlatformLayout>,
): NativeHostRuntimeInspectionLayout {
  return Object.freeze({
    platform: platformLayout.platform,
    stableRoot: platformLayout.stableRoot,
    markerPath: platformLayout.markerPath,
    launcherPath: platformLayout.launcherPath,
    packageRoot: join(
      platformLayout.stableRoot,
      ...NATIVE_HOST_PACKAGE_RELATIVE_PATH.split('/'),
    ),
    packageEntryPath: join(
      platformLayout.stableRoot,
      ...NATIVE_HOST_ENTRY_RELATIVE_PATH.split('/'),
    ),
    integrityReceiptPath: join(
      platformLayout.stableRoot,
      ...NATIVE_HOST_INTEGRITY_RELATIVE_PATH.split('/'),
    ),
    registryHelperPath: platformLayout.platform === 'win32'
      ? join(
        platformLayout.stableRoot,
        ...NATIVE_HOST_WINDOWS_REGISTRY_HELPER_RELATIVE_PATH.split('\\'),
      )
      : null,
  });
}

type RegistrationDoctorFacts = Readonly<{
  registration: 'valid' | 'missing' | 'invalid' | 'unavailable';
  registrationShadow: 'clear' | 'shadowed' | 'not_reported' | 'unavailable';
  allowlist: 'matches' | 'mismatch' | 'not_reported';
}>;

const NATIVE_HOST_BROWSER_PRIORITY = Object.freeze<readonly NativeHostBrowser[]>([
  'chrome',
  'edge',
  'brave',
  'chromium',
]);

type NativeHostDoctorBrowserState = Readonly<{
  exactOwned: boolean;
  absent: boolean;
}>;

export function selectNativeHostDoctorBrowser(
  states: Readonly<Record<NativeHostBrowser, NativeHostDoctorBrowserState>>,
): NativeHostBrowser {
  return NATIVE_HOST_BROWSER_PRIORITY.find((browser) => states[browser].exactOwned)
    ?? NATIVE_HOST_BROWSER_PRIORITY.find((browser) => !states[browser].absent)
    ?? 'chrome';
}

function extensionIdFromOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('chrome-extension://') || !value.endsWith('/')) {
    return null;
  }
  const extensionId = value.slice('chrome-extension://'.length, -1);
  return isNativeHostExtensionId(extensionId) && nativeHostOrigin(extensionId) === value
    ? extensionId
    : null;
}

function inspectManifestForDoctor(
  fact: NativeHostFileFact,
  platformLayout: ReturnType<typeof resolveNativeHostPlatformLayout>,
  expectedExtensionId: string,
): Omit<RegistrationDoctorFacts, 'registrationShadow'> {
  if (fact.status === 'absent') {
    return Object.freeze({ registration: 'missing', allowlist: 'not_reported' });
  }
  if (fact.status === 'unavailable') {
    return Object.freeze({ registration: 'unavailable', allowlist: 'not_reported' });
  }
  if (fact.status !== 'file') {
    return Object.freeze({ registration: 'invalid', allowlist: 'not_reported' });
  }
  try {
    const value = JSON.parse(fact.contents) as unknown;
    const fields = ordinaryRecord(value);
    const allowedOrigins = fields?.allowed_origins;
    const candidateOrigin = Array.isArray(allowedOrigins) && allowedOrigins.length === 1
      ? allowedOrigins[0]
      : null;
    const candidateExtensionId = extensionIdFromOrigin(candidateOrigin);
    if (
      !candidateExtensionId
      || !validateNativeHostManifest(value, {
        platform: platformLayout.platform,
        launcherPath: platformLayout.launcherPath,
        extensionId: candidateExtensionId,
      })
    ) {
      return Object.freeze({ registration: 'invalid', allowlist: 'not_reported' });
    }
    return Object.freeze({
      registration: 'valid',
      allowlist: candidateExtensionId === expectedExtensionId ? 'matches' : 'mismatch',
    });
  } catch {
    return Object.freeze({ registration: 'invalid', allowlist: 'not_reported' });
  }
}

function inspectRegistrationForDoctor(
  facts: Awaited<ReturnType<ReturnType<typeof createNativeHostPlatformAdapter>['readRegistrationFacts']>>,
  platformLayout: ReturnType<typeof resolveNativeHostPlatformLayout>,
  expectedExtensionId: string,
): RegistrationDoctorFacts {
  const manifest = inspectManifestForDoctor(facts.manifest, platformLayout, expectedExtensionId);
  if (platformLayout.registration.kind !== 'registry') {
    return Object.freeze({ ...manifest, registrationShadow: 'not_reported' });
  }
  const canonical = facts.registry32;
  let registration = manifest.registration;
  if (registration === 'valid') {
    if (!canonical || canonical.status === 'unavailable') registration = 'unavailable';
    else if (canonical.status === 'absent') registration = 'missing';
    else if (
      canonical.type !== 'REG_SZ'
      || canonical.value.toLowerCase() !== platformLayout.manifestPath.toLowerCase()
    ) registration = 'invalid';
  }
  const shadow = facts.registry64;
  const registrationShadow = !shadow || shadow.status === 'unavailable'
    ? 'unavailable'
    : shadow.status === 'absent'
      ? 'clear'
      : 'shadowed';
  return Object.freeze({
    registration,
    registrationShadow,
    allowlist: manifest.allowlist,
  });
}

function registrationSurfaceAbsent(
  layout: ReturnType<typeof resolveNativeHostPlatformLayout>,
  facts: NativeHostRegistrationReadFacts,
): boolean {
  if (layout.registration.kind === 'file') return facts.manifest.status === 'absent';
  return facts.registry32?.status === 'absent' && facts.registry64?.status === 'absent';
}

function unavailableDoctorInspection(expectedLocation: string): Readonly<Record<string, unknown>> {
  return Object.freeze({
    platform: 'supported',
    expectedLocation,
    registration: 'unavailable',
    registrationShadow: 'unavailable',
    allowlist: 'not_reported',
    runtime: 'unavailable',
    launcher: 'unavailable',
    daemon: 'unavailable',
  });
}

export async function inspectProductionNativeHost(): Promise<unknown> {
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) {
    return Object.freeze({ platform: 'unsupported' });
  }
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  let expectedLocation = 'Not reported';
  try {
    const homeDirectory = await realpath(homedir());
    const platformInput = {
      platform,
      homeDirectory,
      ...(platform === 'win32' ? { localAppData: process.env.LOCALAPPDATA } : {}),
    };
    const platformLayouts = NATIVE_HOST_BROWSER_PRIORITY.map((browser) => (
      resolveNativeHostPlatformLayout({ ...platformInput, browser })
    ));
    expectedLocation = platformLayouts[0].manifestPath;
    const runtimeLayout = runtimeInspectionLayout(platformLayouts[0]);
    const registry = platform === 'win32' ? await productionRegistryAdapter() : undefined;
    const files = createInstallFileAdapter();
    const runtimeInspection = await inspectOwnedRuntime(runtimeLayout);
    const expectedExtensionId = extensionIdFromOrigin(runtimeInspection.marker?.origin)
      ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
    const candidates = [];
    for (const layout of platformLayouts) {
      const adapter = createNativeHostPlatformAdapter(layout, Object.freeze({
        files,
        ...(registry ? { registry } : {}),
      }));
      const facts = await adapter.readRegistrationFacts();
      candidates.push(Object.freeze({
        layout,
        facts,
        ownership: inspectNativeHostRegistration({
          layout,
          extensionId: expectedExtensionId,
          manifest: facts.manifest,
          marker: runtimeInspection.markerFact,
          registry32: facts.registry32,
          registry64: facts.registry64,
        }),
        doctor: inspectRegistrationForDoctor(facts, layout, expectedExtensionId),
      }));
    }
    const selectedBrowser = selectNativeHostDoctorBrowser(Object.fromEntries(
      candidates.map(({ layout, facts, ownership }) => [
        layout.browser,
        Object.freeze({
          exactOwned: ownership.state === 'exact',
          absent: registrationSurfaceAbsent(layout, facts),
        }),
      ]),
    ) as Record<NativeHostBrowser, NativeHostDoctorBrowserState>);
    const selected = candidates.find(({ layout }) => layout.browser === selectedBrowser)
      ?? candidates[0];
    expectedLocation = selected.layout.manifestPath;
    const registration = selected.doctor;
    const launcherFact = await inspectSecurePath(selected.layout.launcherPath, 'file');
    const launcher = launcherFact.status === 'absent'
      ? 'missing'
      : launcherFact.status === 'unavailable'
        ? 'unavailable'
        : launcherFact.status === 'file' && runtimeInspection.state === 'exact'
          ? 'reachable'
          : 'invalid';
    const runtime = runtimeInspection.state === 'absent'
      ? 'missing'
      : runtimeInspection.state === 'exact'
        ? 'valid'
        : runtimeInspection.state === 'unavailable'
          ? 'unavailable'
          : 'invalid';
    const health = await inspectNativeHostDaemonHealth(createNativeHostDaemonDependencies());
    const daemon = health === 'ready'
      ? 'reachable'
      : health === 'offline' || health === 'not_ready'
        ? 'offline'
        : health;
    return Object.freeze({
      platform: 'supported',
      expectedLocation,
      registration: registration.registration,
      registrationShadow: registration.registrationShadow,
      allowlist: registration.allowlist,
      runtime,
      launcher,
      daemon,
    });
  } catch {
    return unavailableDoctorInspection(expectedLocation);
  }
}

function unavailableLocation(
  browser: NativeHostBrowser = 'chrome',
  options: NativeHostProductionOptions = {},
): string {
  try {
    if (!['darwin', 'linux', 'win32'].includes(process.platform)) return 'Unavailable';
    const environment = options.environment ?? process.env;
    return resolveNativeHostPlatformLayout({
      platform: process.platform as 'darwin' | 'linux' | 'win32',
      browser,
      homeDirectory: options.homeDirectory ?? homedir(),
      ...(process.platform === 'win32'
        ? { localAppData: options.localAppData ?? environment.LOCALAPPDATA }
        : {}),
    }).manifestPath;
  } catch {
    return 'Unavailable';
  }
}

// ---------------------------------------------------------------------------
// Keeping the helper current: production composition for the ensure,
// refresh, per-browser and uninstall-all transactions.
// ---------------------------------------------------------------------------

/** Everything here is injectable so tests run against a temp home and fake ports. */
export interface NativeHostProductionOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  homeDirectory?: string;
  localAppData?: string;
  /** Replaces the local-service probes and the terminate signal. */
  daemon?: NativeHostDaemonStopAdapter;
  timing?: Partial<NativeHostEnsureTiming>;
  now?: () => number;
}

const DEFAULT_ENSURE_TIMING: NativeHostEnsureTiming = Object.freeze({
  // Long enough for a concurrent publish (two bounded package-manager runs).
  lockWaitMs: 4 * 60_000,
  // The serve daemon polls its stop request every two seconds, then drains.
  offlineTimeoutMs: 20_000,
});
const LOCK_STALE_MS = 5 * 60_000;
const LOCK_HEARTBEAT_MS = 30_000;
const LOCK_POLL_MS = 250;
const UNPARSEABLE_LOCK_GRACE_MS = 30_000;
const STATE_FILE_MAX_BYTES = 16 * 1024;
const SIBLING_NAME_PATTERN = /^(stage|next|retired|quarantine|remove)-([a-f0-9]{32})$/u;
const TOKEN_PATTERN = /^[a-f0-9]{32}$/u;
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_MAX_OUTPUT_BYTES = 1024 * 1024;

type ProductionContext = Readonly<{
  platform: 'darwin' | 'linux' | 'win32';
  homeDirectory: string;
  localAppData?: string;
  environment: Readonly<Record<string, string | undefined>>;
  servicePort: number;
  timing: NativeHostEnsureTiming;
  now: () => number;
  daemon?: NativeHostDaemonStopAdapter;
}>;

function testModeEnabled(environment: Readonly<Record<string, string | undefined>>): boolean {
  return environment.FSB_NATIVE_HOST_TEST_MODE === '1';
}

function servicePortFor(environment: Readonly<Record<string, string | undefined>>): number {
  // Tests point the stop probes at a port they own; real runs always use 7226.
  if (testModeEnabled(environment) && environment.FSB_NATIVE_HOST_TEST_SERVICE_PORT) {
    const port = Number(environment.FSB_NATIVE_HOST_TEST_SERVICE_PORT);
    if (Number.isInteger(port) && port > 0 && port < 65_536) return port;
  }
  return NATIVE_HOST_SERVICE_PORT;
}

function resolveContextSync(options: NativeHostProductionOptions): ProductionContext {
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) {
    throw new Error('unsupported-platform');
  }
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const environment = options.environment ?? process.env;
  const requestedHome = options.homeDirectory ?? homedir();
  let homeDirectory = requestedHome;
  try {
    homeDirectory = realpathSync(requestedHome);
  } catch {
    homeDirectory = requestedHome;
  }
  return Object.freeze({
    platform,
    homeDirectory,
    ...(platform === 'win32'
      ? { localAppData: options.localAppData ?? environment.LOCALAPPDATA }
      : {}),
    environment,
    servicePort: servicePortFor(environment),
    timing: Object.freeze({ ...DEFAULT_ENSURE_TIMING, ...(options.timing ?? {}) }),
    now: options.now ?? (() => Date.now()),
    ...(options.daemon ? { daemon: options.daemon } : {}),
  });
}

function contextLayout(
  context: ProductionContext,
  browser: NativeHostBrowser,
): ReturnType<typeof resolveNativeHostPlatformLayout> {
  return resolveNativeHostPlatformLayout({
    platform: context.platform,
    browser,
    homeDirectory: context.homeDirectory,
    ...(context.localAppData ? { localAppData: context.localAppData } : {}),
  });
}

/** `D` in `D/native-host-opt-out.json`: the directory that holds the stable root. */
function stateDirectory(stableRoot: string): string {
  return dirname(stableRoot);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => {
    setTimeout(resolveWait, milliseconds);
  });
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

async function createFileExclusive(pathname: string, contents: string): Promise<void> {
  const temporary = `${pathname}.${randomBytes(16).toString('hex')}.tmp`;
  const handle = await open(
    temporary,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
      | (process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW),
    0o600,
  );
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    // A hard link publishes complete contents and fails if the name exists.
    await link(temporary, pathname);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function replaceFileAtomic(pathname: string, contents: string): Promise<void> {
  await ensureParents(pathname);
  const temporary = `${pathname}.${randomBytes(16).toString('hex')}.tmp`;
  const handle = await open(
    temporary,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
      | (process.platform === 'win32' ? 0 : fsConstants.O_NOFOLLOW),
    0o600,
  );
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, pathname);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function readSmallFile(pathname: string): Promise<string | null> {
  try {
    return (await readBoundedRegular(pathname, STATE_FILE_MAX_BYTES)).toString('utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

function readSmallFileSync(pathname: string): string | null {
  try {
    const fact = lstatSync(pathname);
    if (!fact.isFile() || fact.isSymbolicLink() || fact.size > STATE_FILE_MAX_BYTES) return null;
    return readFileSync(pathname, 'utf8');
  } catch {
    return null;
  }
}

function ensureParentsSync(pathname: string): void {
  const parsed = resolve(dirname(pathname));
  const root = parsed.slice(0, parsed.indexOf(sep) + 1) || sep;
  let cursor = root;
  for (const segment of relative(root, parsed).split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    try {
      const fact = lstatSync(cursor);
      if (!fact.isDirectory() || fact.isSymbolicLink()) throw new Error('unsafe-parent');
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      try {
        mkdirSync(cursor, { mode: 0o700 });
      } catch (mkdirError) {
        if (errorCode(mkdirError) !== 'EEXIST') throw mkdirError;
      }
    }
  }
}

function replaceFileAtomicSync(pathname: string, contents: string): void {
  ensureParentsSync(pathname);
  const temporary = `${pathname}.${randomBytes(16).toString('hex')}.tmp`;
  writeFileSync(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try {
    renameSync(temporary, pathname);
  } catch (error) {
    try { unlinkSync(temporary); } catch { /* already gone */ }
    throw error;
  }
}

function boundedReason(reason: unknown): string {
  return typeof reason === 'string'
    && reason.length > 0
    && Buffer.byteLength(reason, 'utf8') <= 200
    && !/[\0-\x1f]/u.test(reason)
    ? reason
    : 'unspecified';
}

function parseOptOut(raw: string | null): NativeHostOptOutRecord | null {
  if (!raw) return null;
  try {
    const value = ordinaryRecord(JSON.parse(raw) as unknown);
    if (
      !value
      || value.version !== 1
      || !Number.isSafeInteger(value.at)
      || typeof value.reason !== 'string'
    ) {
      return null;
    }
    return Object.freeze({ at: value.at as number, reason: value.reason });
  } catch {
    return null;
  }
}

function parseStamp(raw: string | null): NativeHostEnsureStamp | null {
  if (!raw) return null;
  try {
    const value = ordinaryRecord(JSON.parse(raw) as unknown);
    if (
      !value
      || value.version !== 1
      || typeof value.packageVersion !== 'string'
      || typeof value.nodePath !== 'string'
      || !Array.isArray(value.browsers)
      || !value.browsers.every((browser) => isNativeHostBrowser(browser))
      || !Number.isSafeInteger(value.at)
      || !Number.isSafeInteger(value.failures)
      || (value.failures as number) < 0
      || !Number.isSafeInteger(value.nextAttemptAt)
    ) {
      return null;
    }
    return Object.freeze({
      version: 1,
      packageVersion: value.packageVersion,
      nodePath: value.nodePath,
      browsers: [...value.browsers] as NativeHostBrowser[],
      at: value.at as number,
      failures: value.failures as number,
      nextAttemptAt: value.nextAttemptAt as number,
    });
  } catch {
    return null;
  }
}

type LockRecord = Readonly<{
  version: 1;
  pid: number;
  token: string;
  startedAt: number;
  heartbeatAt: number;
}>;

function parseLockRecord(raw: string | null): LockRecord | null {
  if (!raw) return null;
  try {
    const value = ordinaryRecord(JSON.parse(raw) as unknown);
    if (
      !value
      || value.version !== 1
      || !Number.isSafeInteger(value.pid)
      || (value.pid as number) <= 0
      || typeof value.token !== 'string'
      || !TOKEN_PATTERN.test(value.token)
      || !Number.isSafeInteger(value.startedAt)
      || !Number.isSafeInteger(value.heartbeatAt)
    ) {
      return null;
    }
    return value as unknown as LockRecord;
  } catch {
    return null;
  }
}

/** Signal 0 only asks whether the process exists; nothing is delivered. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === 'EPERM';
  }
}

/**
 * Moves a stale lock aside and deletes it only if it is still the record that
 * was judged stale; a lock taken over in between is put back.
 */
async function breakStaleLock(lockPath: string, observed: string): Promise<boolean> {
  const moved = `${lockPath}.break-${randomBytes(16).toString('hex')}`;
  try {
    await rename(lockPath, moved);
  } catch {
    return false;
  }
  let current: string | null = null;
  try {
    current = await readSmallFile(moved);
  } catch {
    current = null;
  }
  if (current === observed) {
    await unlink(moved).catch(() => undefined);
    return true;
  }
  await link(moved, lockPath).catch(() => undefined);
  await unlink(moved).catch(() => undefined);
  return false;
}

/**
 * The cross-process lock at `${stableRoot}.lock`. It is stale only when its
 * holder is gone or its heartbeat is older than five minutes; the holder
 * refreshes the heartbeat every thirty seconds and notices if the lock was
 * taken from it.
 */
async function acquireStableRootLock(
  stableRoot: string,
  waitMs: number,
  now: () => number,
): Promise<NativeHostLockLease | null> {
  const lockPath = `${stableRoot}.lock`;
  await ensureParents(lockPath);
  const token = randomBytes(16).toString('hex');
  const staleTokens: string[] = [];
  const deadline = Date.now() + Math.max(0, waitMs);
  for (;;) {
    const startedAt = now();
    try {
      await createFileExclusive(lockPath, `${JSON.stringify({
        version: 1,
        pid: process.pid,
        token,
        startedAt,
        heartbeatAt: startedAt,
      })}\n`);
      break;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
    }
    let raw: string | null;
    let ageMs = 0;
    try {
      raw = await readSmallFile(lockPath);
      ageMs = Date.now() - (await lstat(lockPath)).mtimeMs;
    } catch {
      raw = null;
    }
    if (raw === null) continue;
    const record = parseLockRecord(raw);
    const stale = record
      ? !processAlive(record.pid) || now() - record.heartbeatAt > LOCK_STALE_MS
      : ageMs > UNPARSEABLE_LOCK_GRACE_MS;
    if (stale) {
      if (await breakStaleLock(lockPath, raw) && record) staleTokens.push(record.token);
      continue;
    }
    if (Date.now() >= deadline) return null;
    await wait(LOCK_POLL_MS);
  }

  let lost = false;
  let beating = false;
  const beat = async (): Promise<void> => {
    if (lost || beating) return;
    beating = true;
    try {
      const record = parseLockRecord(await readSmallFile(lockPath));
      if (!record || record.token !== token) {
        lost = true;
        return;
      }
      await replaceFileAtomic(lockPath, `${JSON.stringify({ ...record, heartbeatAt: now() })}\n`);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') lost = true;
    } finally {
      beating = false;
    }
  };
  const heartbeat = setInterval(() => { void beat(); }, LOCK_HEARTBEAT_MS);
  heartbeat.unref?.();
  return Object.freeze({
    token,
    staleTokens: Object.freeze([...staleTokens]),
    lost: () => lost,
    release: async (): Promise<void> => {
      clearInterval(heartbeat);
      try {
        const record = parseLockRecord(await readSmallFile(lockPath));
        if (record?.token === token) await unlink(lockPath);
      } catch {
        // A lock that cannot be removed goes stale with this process.
      }
    },
  });
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  // Windows refuses to rename a tree while a just-stopped process still holds
  // a handle in it; that clears within moments.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      if (
        process.platform !== 'win32'
        || attempt >= 9
        || !RENAME_RETRY_CODES.has(errorCode(error) ?? '')
      ) {
        throw error;
      }
      await wait(200 * (attempt + 1));
    }
  }
}

async function requireAbsent(pathname: string): Promise<void> {
  try {
    await lstat(pathname);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
  throw new Error('destination-exists');
}

async function requireOwnedDirectory(pathname: string): Promise<void> {
  const fact = await lstat(pathname);
  if (!fact.isDirectory() || fact.isSymbolicLink()) throw new Error('unsafe-directory');
}

function createEnsureStateAdapter(
  context: ProductionContext,
  stableRoot: string,
): NativeHostEnsureStateAdapter {
  const directory = stateDirectory(stableRoot);
  const optOutPath = join(directory, 'native-host-opt-out.json');
  const stampPath = join(directory, 'native-host-ensure.json');
  const stopPath = `${stableRoot}.stop-requested`;
  const stableName = basename(stableRoot);
  const siblingPath = (kind: NativeHostSiblingKind, token: string): string => {
    if (!SIBLING_NAME_PATTERN.test(`${kind}-${token}`)) throw new Error('invalid-sibling');
    return `${stableRoot}.${kind}-${token}`;
  };
  return Object.freeze({
    acquireLock: (waitMs: number) => acquireStableRootLock(stableRoot, waitMs, context.now),
    readOptOut: async () => parseOptOut(await readSmallFile(optOutPath)),
    clearOptOut: async () => {
      await unlink(optOutPath).catch((error) => {
        if (errorCode(error) !== 'ENOENT') throw error;
      });
    },
    readStamp: async () => parseStamp(await readSmallFile(stampPath)),
    writeStamp: async (stamp: NativeHostEnsureStamp) => {
      await replaceFileAtomic(stampPath, `${JSON.stringify(stamp)}\n`);
    },
    writeStopRequest: async (token: string, reason: 'refresh' | 'uninstall') => {
      if (!TOKEN_PATTERN.test(token)) throw new Error('invalid-token');
      await replaceFileAtomic(stopPath, `${JSON.stringify({
        version: 1,
        token,
        requestedAt: Date.now(),
        reason,
      })}\n`);
    },
    removeStopRequest: async (token: string) => {
      const raw = await readSmallFile(stopPath);
      if (!raw) return;
      try {
        if (ordinaryRecord(JSON.parse(raw) as unknown)?.token !== token) return;
      } catch {
        return;
      }
      await unlink(stopPath).catch(() => undefined);
    },
    stableRootPresent: async () => {
      try {
        await lstat(stableRoot);
        return true;
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return false;
        throw error;
      }
    },
    listSiblings: async (): Promise<readonly NativeHostSiblingFact[]> => {
      const siblings: NativeHostSiblingFact[] = [];
      let names: string[];
      try {
        names = await readdir(directory);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return Object.freeze([]);
        throw error;
      }
      for (const name of names) {
        if (!name.startsWith(`${stableName}.`)) continue;
        const match = SIBLING_NAME_PATTERN.exec(name.slice(stableName.length + 1));
        if (!match) continue;
        try {
          const fact = await lstat(join(directory, name));
          if (!fact.isDirectory() || fact.isSymbolicLink()) continue;
          siblings.push(Object.freeze({
            kind: match[1] as NativeHostSiblingKind,
            token: match[2],
            ageMs: Math.max(0, Date.now() - fact.mtimeMs),
          }));
        } catch {
          // Vanished while listing.
        }
      }
      return Object.freeze(siblings);
    },
    moveStableToSibling: async (kind: NativeHostSiblingKind, token: string) => {
      const destination = siblingPath(kind, token);
      await requireOwnedDirectory(stableRoot);
      await requireAbsent(destination);
      await renameWithRetry(stableRoot, destination);
    },
    moveSiblingToStable: async (kind: NativeHostSiblingKind, token: string) => {
      const source = siblingPath(kind, token);
      await requireOwnedDirectory(source);
      await requireAbsent(stableRoot);
      await renameWithRetry(source, stableRoot);
    },
    removeSibling: async (kind: NativeHostSiblingKind, token: string) => {
      const target = siblingPath(kind, token);
      try {
        await requireOwnedDirectory(target);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return;
        throw error;
      }
      // Deletion authority is limited to this exact tokened sibling of the
      // stable root, checked above to be a real directory.
      await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  });
}

function probeServicePort(port: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (online: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(online);
    };
    socket.setTimeout(NATIVE_HOST_HEALTH_TIMEOUT_MS, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      finish(error.code !== 'ECONNREFUSED' && error.code !== 'ECONNRESET');
    });
  });
}

function captureProcessOutput(executable: string, argv: readonly string[]): Promise<Readonly<{
  status: number;
  stdout: string;
}> | null> {
  return new Promise((resolveCapture) => {
    execFile(
      executable,
      [...argv],
      {
        shell: false,
        windowsHide: true,
        timeout: PROBE_TIMEOUT_MS,
        maxBuffer: PROBE_MAX_OUTPUT_BYTES,
        encoding: 'utf8',
        env: sanitizedEnvironment({}, false),
      },
      (error, stdout) => {
        const status = error ? Number((error as { code?: unknown }).code) : 0;
        if (error && !Number.isInteger(status)) {
          resolveCapture(null);
          return;
        }
        resolveCapture(Object.freeze({ status, stdout: String(stdout) }));
      },
    );
  });
}

function parsePidLines(output: string): number[] {
  return [...new Set(output.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/u.test(line))
    .map(Number)
    .filter((pid) => Number.isSafeInteger(pid) && pid > 0))];
}

async function listeningPidsDarwin(port: number): Promise<number[] | null> {
  const result = await captureProcessOutput('/usr/sbin/lsof', [
    '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t',
  ]);
  if (!result) return null;
  // lsof exits 1 with no output when nothing matches.
  if (result.status !== 0 && result.stdout.trim() !== '') return null;
  return parsePidLines(result.stdout);
}

async function listeningPidsLinux(port: number): Promise<number[] | null> {
  const portHex = port.toString(16).toUpperCase().padStart(4, '0');
  const inodes = new Set<string>();
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string;
    try {
      text = await readFile(table, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const columns = line.trim().split(/\s+/u);
      if (columns.length < 10) continue;
      const localPort = columns[1].split(':')[1];
      if (localPort === portHex && columns[3] === '0A' && columns[9] !== '0') inodes.add(columns[9]);
    }
  }
  if (inodes.size === 0) return [];
  const pids: number[] = [];
  let entries: string[];
  try {
    entries = await readdir('/proc');
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!/^\d+$/u.test(entry)) continue;
    let descriptors: string[];
    try {
      descriptors = await readdir(`/proc/${entry}/fd`);
    } catch {
      continue;
    }
    for (const descriptor of descriptors) {
      try {
        const target = await readlink(`/proc/${entry}/fd/${descriptor}`);
        const match = /^socket:\[(\d+)\]$/u.exec(target);
        if (match && inodes.has(match[1])) {
          pids.push(Number(entry));
          break;
        }
      } catch {
        // Closed while scanning.
      }
    }
  }
  // A listener whose owner cannot be seen belongs to another user.
  return pids.length > 0 ? [...new Set(pids)] : null;
}

function windowsSystemExecutable(environment: Readonly<Record<string, string | undefined>>, ...parts: string[]): string {
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? 'C:\\Windows';
  if (!win32.isAbsolute(systemRoot)) throw new Error('invalid-system-root');
  return win32.join(systemRoot, 'System32', ...parts);
}

async function listeningPidsWindows(
  port: number,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<number[] | null> {
  const result = await captureProcessOutput(
    windowsSystemExecutable(environment, 'netstat.exe'),
    ['-ano', '-p', 'TCP'],
  );
  if (!result || result.status !== 0) return null;
  const pids = new Set<number>();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const columns = line.trim().split(/\s+/u);
    // TCP <local> <remote> <state> <pid>; the state word is localized, so a
    // listener is recognized by its unconnected remote address instead.
    if (columns.length !== 5 || columns[0].toUpperCase() !== 'TCP') continue;
    const localPort = columns[1].slice(columns[1].lastIndexOf(':') + 1);
    const remotePort = columns[2].slice(columns[2].lastIndexOf(':') + 1);
    if (localPort === String(port) && remotePort === '0' && /^\d+$/u.test(columns[4])) {
      pids.add(Number(columns[4]));
    }
  }
  return [...pids];
}

async function processCommandLine(
  platform: 'darwin' | 'linux' | 'win32',
  pid: number,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<readonly string[] | string | null> {
  if (platform === 'linux') {
    try {
      const raw = await readFile(`/proc/${pid}/cmdline`, 'utf8');
      return Object.freeze(raw.split('\0').filter((part, index, all) => (
        part.length > 0 || index < all.length - 1
      )));
    } catch {
      return null;
    }
  }
  if (platform === 'darwin') {
    const result = await captureProcessOutput('/bin/ps', ['-o', 'command=', '-p', String(pid)]);
    return result && result.status === 0 ? result.stdout.trim() : null;
  }
  const result = await captureProcessOutput(
    windowsSystemExecutable(environment, 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `(Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId=${pid}').CommandLine`,
    ],
  );
  return result && result.status === 0 ? result.stdout.trim() : null;
}

/**
 * True only for `<node> <stableRoot>/runtime/package/build/index.js serve ...`,
 * the command the native host's wake path spawns.
 */
export function isStableRootServeCommand(
  platform: 'darwin' | 'linux' | 'win32',
  command: readonly string[] | string,
  stableRoot: string,
): boolean {
  const api = platform === 'win32' ? win32 : posix;
  const buildIndex = api.join(stableRoot, 'runtime', 'package', 'build', 'index.js');
  if (Array.isArray(command)) {
    return command.length >= 3
      && (platform === 'win32'
        ? command[1].toLowerCase() === buildIndex.toLowerCase()
        : command[1] === buildIndex)
      && command[2] === 'serve';
  }
  if (typeof command !== 'string' || command.length === 0) return false;
  const normalized = ` ${command.replaceAll('"', '')} `;
  const needle = ` ${buildIndex} serve `;
  return platform === 'win32'
    ? normalized.toLowerCase().includes(needle.toLowerCase())
    : normalized.includes(needle);
}

function createProductionDaemonStopAdapter(
  context: ProductionContext,
  stableRoot: string,
): NativeHostDaemonStopAdapter {
  const port = context.servicePort;
  const isOnline = (): Promise<boolean> => probeServicePort(port);
  return Object.freeze({
    isOnline,
    waitForOffline: async (timeoutMs: number): Promise<boolean> => {
      const deadline = Date.now() + Math.max(0, timeoutMs);
      for (;;) {
        if (!await isOnline()) return true;
        if (Date.now() >= deadline) return false;
        await wait(250);
      }
    },
    identifyListener: async (): Promise<NativeHostListenerFact> => {
      const pids = context.platform === 'darwin'
        ? await listeningPidsDarwin(port)
        : context.platform === 'linux'
          ? await listeningPidsLinux(port)
          : await listeningPidsWindows(port, context.environment);
      if (pids === null) return Object.freeze({ status: 'unknown' });
      if (pids.length === 0) return Object.freeze({ status: 'none' });
      let unidentified = false;
      for (const pid of pids) {
        const command = await processCommandLine(context.platform, pid, context.environment);
        if (command === null) {
          unidentified = true;
          continue;
        }
        if (isStableRootServeCommand(context.platform, command, stableRoot)) {
          return Object.freeze({ status: 'stable-root', pid });
        }
      }
      return Object.freeze({ status: unidentified ? 'unknown' : 'other' });
    },
    // Only reached for a pid whose command line was just confirmed to be the
    // stable root's own serve daemon.
    terminate: async (pid: number): Promise<boolean> => {
      if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return false;
      try {
        process.kill(pid, 'SIGTERM');
        return true;
      } catch {
        return false;
      }
    },
  });
}

/**
 * False only when the interpreter the installed launcher was pinned to no
 * longer exists (an upgraded or removed Node). Anything unreadable counts as
 * present, so an unknown never triggers a rebuild.
 */
async function pinnedNodePresent(layout: NativeHostRuntimeInspectionLayout): Promise<boolean> {
  let nodePath: string;
  try {
    if (layout.platform === 'win32') {
      const config = await readBoundedRegular(
        join(layout.stableRoot, ...NATIVE_HOST_WINDOWS_CONFIG_RELATIVE_PATH.split('\\')),
        64 * 1024,
      );
      if (
        config.byteLength < 24
        || config.subarray(0, 8).toString('latin1') !== 'FSBNH01\0'
        || config.readUInt32LE(8) !== 1
      ) {
        return true;
      }
      const length = config.readUInt32LE(12);
      if (length < 1 || 24 + length > config.byteLength) return true;
      nodePath = config.subarray(24, 24 + length).toString('utf8');
    } else {
      const launcher = (await readBoundedRegular(layout.launcherPath, 4096)).toString('utf8');
      const firstLine = launcher.split('\n', 1)[0];
      if (!firstLine.startsWith('#!')) return true;
      nodePath = firstLine.slice(2);
    }
  } catch {
    return true;
  }
  if (!isAbsolute(nodePath)) return true;
  try {
    return (await stat(nodePath)).isFile();
  } catch (error) {
    return !['ENOENT', 'ENOTDIR'].includes(errorCode(error) ?? '');
  }
}

async function rewriteReceiptProvenance(
  layout: NativeHostRuntimeInspectionLayout,
  receipt: Readonly<NativeHostRuntimeReceipt>,
  provenance: NativeHostProvenance,
): Promise<boolean> {
  const inspected = await inspectOwnedRuntime(layout);
  if (inspected.state !== 'exact' || !receiptsEqual(inspected.receipt, receipt)) return false;
  const receiptPath = join(layout.stableRoot, NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH);
  await replaceFileAtomic(receiptPath, `${JSON.stringify({ ...receipt, provenance })}\n`);
  return true;
}

async function invokingPackage(): Promise<Readonly<{ root: string; version: string }>> {
  const root = await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const manifest = ordinaryRecord(await readJson(join(root, 'package.json')));
  if (
    !manifest
    || manifest.name !== NATIVE_HOST_PACKAGE_NAME
    || typeof manifest.version !== 'string'
  ) {
    throw new Error('invalid-package');
  }
  return Object.freeze({ root, version: manifest.version });
}

async function productionEnsureDependencies(
  options: NativeHostProductionOptions,
): Promise<NativeHostEnsureDependencies> {
  const context = resolveContextSync(options);
  const layouts = Object.fromEntries(NATIVE_HOST_BROWSERS.map((browser) => [
    browser,
    contextLayout(context, browser),
  ])) as Record<NativeHostBrowser, ReturnType<typeof resolveNativeHostPlatformLayout>>;
  const registry = context.platform === 'win32' ? await productionRegistryAdapter() : undefined;
  const files = createInstallFileAdapter();
  const registrations = Object.freeze(Object.fromEntries(NATIVE_HOST_BROWSERS.map((browser) => [
    browser,
    createNativeHostPlatformAdapter(layouts[browser], Object.freeze({
      files,
      ...(registry ? { registry } : {}),
    })),
  ])) as Record<NativeHostBrowser, ReturnType<typeof createNativeHostPlatformAdapter>>);
  const inspectionLayout = runtimeInspectionLayout(layouts.chrome);
  const stableRoot = inspectionLayout.stableRoot;
  const invoking = await invokingPackage();
  const nodePath = await realpath(process.execPath);
  return Object.freeze({
    platform: context.platform,
    stableRoot,
    packageVersion: invoking.version,
    nodePath,
    runtime: createUninstallRuntimeAdapter(inspectionLayout),
    registrations,
    state: createEnsureStateAdapter(context, stableRoot),
    daemon: context.daemon ?? createProductionDaemonStopAdapter(context, stableRoot),
    timing: context.timing,
    detectBrowsers: async (extensionId: string) => {
      const fixed = nativeHostBrowsersFromEnvironment(context.environment);
      if (fixed) return fixed;
      return detectFsbBrowsers(
        {
          platform: context.platform,
          homeDirectory: context.homeDirectory,
          ...(context.localAppData ? { localAppData: context.localAppData } : {}),
          extensionId,
        },
        Object.freeze({
          listDirectory: async (pathname: string) => {
            try {
              const fact = await lstat(pathname);
              if (!fact.isDirectory() || fact.isSymbolicLink()) return null;
              return await readdir(pathname);
            } catch {
              return null;
            }
          },
          isDirectory: async (pathname: string) => {
            try {
              const fact = await lstat(pathname);
              return fact.isDirectory() && !fact.isSymbolicLink();
            } catch {
              return false;
            }
          },
        }),
      );
    },
    pinnedNodePresent: () => pinnedNodePresent(inspectionLayout),
    createPublisher: async (publisher: NativeHostPublisherOptions) => {
      const npmCliPath = await resolveNpmCliPath(nodePath, invoking.root);
      const runtimeLayout = resolveNativeHostRuntimeLayout({
        platform: context.platform,
        homeDirectory: context.homeDirectory,
        ...(context.localAppData ? { localAppData: context.localAppData } : {}),
        packageVersion: invoking.version,
        extensionId: publisher.extensionId,
        installToken: publisher.installToken,
        nodePath,
        nodeRealPath: nodePath,
        npmCliPath,
        npmCliRealPath: npmCliPath,
        invokingPackageRoot: invoking.root,
      });
      return createRuntimeAdapter(runtimeLayout, Object.freeze({
        destination: publisher.destination,
        provenance: publisher.provenance,
        windowsManifest: publisher.windowsManifest,
      }));
    },
    rewriteReceiptProvenance: (
      receipt: Readonly<NativeHostRuntimeReceipt>,
      provenance: NativeHostProvenance,
    ) => rewriteReceiptProvenance(inspectionLayout, receipt, provenance),
    now: context.now,
  });
}

function stableRootFor(options: NativeHostProductionOptions): string | null {
  try {
    return contextLayout(resolveContextSync(options), 'chrome').stableRoot;
  } catch {
    return null;
  }
}

export function createProductionNativeHostCliOperations(
  options: NativeHostProductionOptions = {},
): NativeHostCliOperations & NativeHostEnsureOperations {
  const environment = options.environment ?? process.env;
  const refusedInstall = (browser: NativeHostBrowser): NativeHostInstallResult => Object.freeze({
    status: 'refused', reason: 'unavailable', location: unavailableLocation(browser, options),
    origin: null, packageVersion: null,
  });
  return Object.freeze({
    install: async (request: NativeHostInstallRequest): Promise<NativeHostInstallResult> => {
      const browser = isNativeHostBrowser(request?.browser) ? request.browser : 'chrome';
      try {
        return await installNativeHostBrowser(request, await productionEnsureDependencies(options));
      } catch {
        return refusedInstall(browser);
      }
    },
    uninstall: async (request: NativeHostUninstallRequest = {}): Promise<NativeHostUninstallResult> => {
      const browser = isNativeHostBrowser(request?.browser) ? request.browser : 'chrome';
      try {
        return await uninstallNativeHostBrowser(request, await productionEnsureDependencies(options));
      } catch {
        return Object.freeze({
          status: 'refused', reason: 'unavailable', location: unavailableLocation(browser, options),
          origin: null, packageVersion: null,
        });
      }
    },
    ensure: async (request: NativeHostEnsureRequest): Promise<NativeHostEnsureResult> => {
      const stableRoot = stableRootFor(options) ?? '';
      if (request?.mode === 'refresh-only' && environment.FSB_NATIVE_HOST_AUTO === '0') {
        return Object.freeze({
          outcome: 'skipped-opt-out',
          reason: 'auto-disabled',
          browsers: [],
          addedBrowsers: [],
          stableRoot,
        });
      }
      try {
        return await ensureNativeHost(request, await productionEnsureDependencies(options));
      } catch {
        return Object.freeze({
          outcome: 'unavailable',
          reason: 'unavailable',
          browsers: [],
          addedBrowsers: [],
          stableRoot,
        });
      }
    },
    uninstallAll: async (
      request: NativeHostUninstallAllRequest = {},
    ): Promise<NativeHostUninstallAllResult> => {
      try {
        return await uninstallAllNativeHost(request, await productionEnsureDependencies(options));
      } catch {
        return Object.freeze({ outcome: 'unavailable', reason: 'unavailable', removedBrowsers: [] });
      }
    },
    readOptOut: (): NativeHostOptOutRecord | null => {
      const stableRoot = stableRootFor(options);
      return stableRoot
        ? parseOptOut(readSmallFileSync(join(stateDirectory(stableRoot), 'native-host-opt-out.json')))
        : null;
    },
    writeOptOut: (reason: string): void => {
      const stableRoot = stableRootFor(options);
      if (!stableRoot) return;
      try {
        replaceFileAtomicSync(
          join(stateDirectory(stableRoot), 'native-host-opt-out.json'),
          `${JSON.stringify({ version: 1, at: Date.now(), reason: boundedReason(reason) })}\n`,
        );
      } catch {
        // Without the marker an automatic run can still only refresh an
        // existing helper; it never installs one.
      }
    },
    clearOptOut: (): void => {
      const stableRoot = stableRootFor(options);
      if (!stableRoot) return;
      try {
        unlinkSync(join(stateDirectory(stableRoot), 'native-host-opt-out.json'));
      } catch {
        // Absent already.
      }
    },
  });
}
