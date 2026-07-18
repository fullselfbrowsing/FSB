import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  constants as fsConstants,
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NATIVE_HOST_DEFAULT_EXTENSION_ID,
  NATIVE_HOST_ENTRY_RELATIVE_PATH,
  NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH,
  NATIVE_HOST_INTEGRITY_RELATIVE_PATH,
  NATIVE_HOST_PACKAGE_NAME,
  NATIVE_HOST_PACKAGE_RELATIVE_PATH,
  NATIVE_HOST_WINDOWS_REGISTRY_HELPER_RELATIVE_PATH,
  isNativeHostExtensionId,
  nativeHostOrigin,
} from './native-host/constants.js';
import { resolveNativeHostRuntimeLayout } from './native-host/runtime-layout.js';
import {
  validateNativeHostManifest,
  validateNativeHostMarker,
} from './native-host-registration.js';
import { inspectNativeHostDaemonHealth } from './native-host/daemon.js';
import { createNativeHostDaemonDependencies } from './native-host/platform.js';
import { createNativeHostRegistryHelperAdapter } from './native-host-registry-helper.js';
import {
  installNativeHost,
  uninstallNativeHost,
} from './native-host-install/index.js';
import {
  createNativeHostPlatformAdapter,
  resolveNativeHostPlatformLayout,
} from './native-host-install/platform.js';
import { publishNativeHostRuntime } from './native-host-install/runtime.js';
import type {
  NativeHostFileFact,
  NativeHostInstallFileAdapter,
  NativeHostInstallRequest,
  NativeHostInstallRuntimeAdapter,
  NativeHostInstallTransactionDependencies,
  NativeHostProcessInvocation,
  NativeHostProcessResult,
  NativeHostRuntimeFileAdapter,
  NativeHostRuntimeInspectionLayout,
  NativeHostRuntimeOwnedInspection,
  NativeHostRuntimeReceipt,
  NativeHostSecurePathFact,
  NativeHostUninstallRuntimeAdapter,
  NativeHostUninstallTransactionDependencies,
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
    || !sameKeys(fields, RECEIPT_KEYS)
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
      || await hashFile(layout.launcherPath, 'sha256') !== receipt.artifactSha256
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
): NativeHostInstallRuntimeAdapter {
  const uninstall = createUninstallRuntimeAdapter(layout);
  const files = createRuntimeFiles(layout.stageRoot, process.platform);
  return Object.freeze({
    layout,
    inspectRuntime: uninstall.inspectRuntime,
    publishRuntime: () => publishNativeHostRuntime(
      layout,
      Object.freeze({ files, process: Object.freeze({ run: runProcess }) }),
      Object.freeze({ architecture: process.arch }),
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

type ProductionPlatformComposition = Readonly<{
  platform: 'darwin' | 'linux' | 'win32';
  homeDirectory: string;
  localAppData?: string;
  layout: ReturnType<typeof resolveNativeHostPlatformLayout>;
  adapter: ReturnType<typeof createNativeHostPlatformAdapter>;
}>;

async function productionPlatformComposition(): Promise<ProductionPlatformComposition> {
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) {
    throw new Error('unsupported-platform');
  }
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const homeDirectory = await realpath(homedir());
  const input = {
    platform,
    homeDirectory,
    ...(platform === 'win32' ? { localAppData: process.env.LOCALAPPDATA } : {}),
  };
  const layout = resolveNativeHostPlatformLayout(input);
  const registry = platform === 'win32' ? await productionRegistryAdapter() : undefined;
  return Object.freeze({
    ...input,
    layout,
    adapter: createNativeHostPlatformAdapter(layout, Object.freeze({
      files: createInstallFileAdapter(),
      ...(registry ? { registry } : {}),
    })),
  });
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

async function productionInstallDependencies(
  extensionId = NATIVE_HOST_DEFAULT_EXTENSION_ID,
): Promise<NativeHostInstallTransactionDependencies> {
  const composition = await productionPlatformComposition();
  const invokingPackageRoot = await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const manifest = ordinaryRecord(await readJson(join(invokingPackageRoot, 'package.json')));
  if (
    !manifest
    || manifest.name !== NATIVE_HOST_PACKAGE_NAME
    || typeof manifest.version !== 'string'
  ) {
    throw new Error('invalid-package');
  }
  const nodePath = await realpath(process.execPath);
  const npmCliPath = await resolveNpmCliPath(nodePath, invokingPackageRoot);
  const runtimeLayout = resolveNativeHostRuntimeLayout({
    platform: composition.platform,
    homeDirectory: composition.homeDirectory,
    ...(composition.localAppData ? { localAppData: composition.localAppData } : {}),
    packageVersion: manifest.version,
    extensionId,
    installToken: randomBytes(16).toString('hex'),
    nodePath,
    nodeRealPath: nodePath,
    npmCliPath,
    npmCliRealPath: npmCliPath,
    invokingPackageRoot,
  });
  return Object.freeze({
    platform: composition.adapter,
    runtime: createRuntimeAdapter(runtimeLayout),
  });
}

async function productionUninstallDependencies(
): Promise<NativeHostUninstallTransactionDependencies> {
  const composition = await productionPlatformComposition();
  return Object.freeze({
    platform: composition.adapter,
    runtime: createUninstallRuntimeAdapter(runtimeInspectionLayout(composition.layout)),
  });
}

type RegistrationDoctorFacts = Readonly<{
  registration: 'valid' | 'missing' | 'invalid' | 'unavailable';
  registrationShadow: 'clear' | 'shadowed' | 'not_reported' | 'unavailable';
  allowlist: 'matches' | 'mismatch' | 'not_reported';
}>;

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
    const platformLayout = resolveNativeHostPlatformLayout({
      platform,
      homeDirectory: await realpath(homedir()),
      ...(platform === 'win32' ? { localAppData: process.env.LOCALAPPDATA } : {}),
    });
    expectedLocation = platformLayout.manifestPath;
    const runtimeLayout = runtimeInspectionLayout(platformLayout);
    const registry = platform === 'win32' ? await productionRegistryAdapter() : undefined;
    const platformAdapter = createNativeHostPlatformAdapter(platformLayout, Object.freeze({
      files: createInstallFileAdapter(),
      ...(registry ? { registry } : {}),
    }));
    const runtimeInspection = await inspectOwnedRuntime(runtimeLayout);
    const expectedExtensionId = extensionIdFromOrigin(runtimeInspection.marker?.origin)
      ?? NATIVE_HOST_DEFAULT_EXTENSION_ID;
    const registration = inspectRegistrationForDoctor(
      await platformAdapter.readRegistrationFacts(),
      platformLayout,
      expectedExtensionId,
    );
    const launcherFact = await inspectSecurePath(platformLayout.launcherPath, 'file');
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

function unavailableLocation(): string {
  try {
    if (!['darwin', 'linux', 'win32'].includes(process.platform)) return 'Unavailable';
    return resolveNativeHostPlatformLayout({
      platform: process.platform as 'darwin' | 'linux' | 'win32',
      homeDirectory: homedir(),
      ...(process.platform === 'win32' ? { localAppData: process.env.LOCALAPPDATA } : {}),
    }).manifestPath;
  } catch {
    return 'Unavailable';
  }
}

export function createProductionNativeHostCliOperations(): NativeHostCliOperations {
  return Object.freeze({
    install: async (request: NativeHostInstallRequest) => {
      try {
        return await installNativeHost(
          request,
          await productionInstallDependencies(
            request.extensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID,
          ),
        );
      } catch {
        return Object.freeze({
          status: 'refused', reason: 'unavailable', location: unavailableLocation(),
          origin: null, packageVersion: null,
        });
      }
    },
    uninstall: async () => {
      try {
        return await uninstallNativeHost(await productionUninstallDependencies());
      } catch {
        return Object.freeze({
          status: 'refused', reason: 'unavailable', location: unavailableLocation(),
          origin: null, packageVersion: null,
        });
      }
    },
  });
}
