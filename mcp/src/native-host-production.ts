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
  NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH,
} from './native-host/constants.js';
import { resolveNativeHostRuntimeLayout } from './native-host/runtime-layout.js';
import { validateNativeHostMarker } from './native-host-registration.js';
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
  NativeHostInstallRegistryAdapter,
  NativeHostInstallRuntimeAdapter,
  NativeHostInstallTransactionDependencies,
  NativeHostProcessInvocation,
  NativeHostProcessResult,
  NativeHostRegistryKeyFact,
  NativeHostRegistryView,
  NativeHostRegistryValueFact,
  NativeHostRuntimeFileAdapter,
  NativeHostRuntimeOwnedInspection,
  NativeHostRuntimeReceipt,
  NativeHostSecurePathFact,
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

function sanitizedEnvironment(extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const allowed = [
    'PATH', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SystemRoot', 'SYSTEMROOT',
    'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL',
  ];
  const environment: NodeJS.ProcessEnv = Object.create(null);
  for (const key of allowed) {
    if (typeof process.env[key] === 'string') environment[key] = process.env[key];
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
      env: sanitizedEnvironment(invocation.environment),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
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

async function runRegistry(args: readonly string[]): Promise<Readonly<{
  status: number;
  stdout: string;
}>> {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  if (!systemRoot || !isAbsolute(systemRoot)) throw new Error('registry-unavailable');
  const executable = join(systemRoot, 'System32', 'reg.exe');
  const result = await runProcess(Object.freeze({
    executable,
    argv: Object.freeze([...args]),
    cwd: systemRoot,
    environment: Object.freeze({}),
    shell: false,
    maxOutputBytes: 32 * 1024,
  }));
  return Object.freeze({ status: result.status, stdout: result.stdout });
}

function registryView(view: 'user/32' | 'user/64'): '/reg:32' | '/reg:64' {
  return view === 'user/32' ? '/reg:32' : '/reg:64';
}

function createRegistryAdapter(): NativeHostInstallRegistryAdapter {
  const fullKey = (key: string): string => `HKCU\\${key}`;
  return Object.freeze({
    readDefault: async (view: NativeHostRegistryView, key: string): Promise<NativeHostRegistryValueFact> => {
      try {
        const result = await runRegistry(['QUERY', fullKey(key), '/ve', registryView(view)]);
        if (result.status === 1) return Object.freeze({ status: 'absent' });
        if (result.status !== 0) return Object.freeze({ status: 'unavailable' });
        const match = result.stdout.match(/^\s+\(Default\)\s+(REG_[A-Z0-9_]+)\s+([^\r\n]+)$/mu);
        return match
          ? Object.freeze({ status: 'value', type: match[1], value: match[2].trim() })
          : Object.freeze({ status: 'absent' });
      } catch {
        return Object.freeze({ status: 'unavailable' });
      }
    },
    writeDefault: async (
      view: NativeHostRegistryView,
      key: string,
      value: Readonly<{ type: 'REG_SZ'; value: string }>,
    ): Promise<void> => {
      if (view !== 'user/32' || value.type !== 'REG_SZ') throw new Error('unsafe-registry-write');
      const result = await runRegistry([
        'ADD', fullKey(key), '/ve', '/t', 'REG_SZ', '/d', value.value, '/f', '/reg:32',
      ]);
      if (result.status !== 0) throw new Error('registry-write-failed');
    },
    deleteDefault: async (view: NativeHostRegistryView, key: string): Promise<void> => {
      if (view !== 'user/32') throw new Error('unsafe-registry-delete');
      const result = await runRegistry(['DELETE', fullKey(key), '/ve', '/f', '/reg:32']);
      if (result.status !== 0) throw new Error('registry-delete-failed');
    },
    inspectKey: async (view: NativeHostRegistryView, key: string): Promise<NativeHostRegistryKeyFact> => {
      try {
        const result = await runRegistry(['QUERY', fullKey(key), registryView(view)]);
        if (result.status === 1) return Object.freeze({ status: 'absent' });
        if (result.status !== 0) return Object.freeze({ status: 'unavailable' });
        const values = result.stdout.match(/^\s+[^\r\n]+\s+REG_[A-Z0-9_]+\s+[^\r\n]+$/gmu) ?? [];
        if (values.length === 0) return Object.freeze({ status: 'empty' });
        return values.length === 1 && /\(Default\)/u.test(values[0])
          ? Object.freeze({ status: 'exact-default-only' })
          : Object.freeze({ status: 'nonempty' });
      } catch {
        return Object.freeze({ status: 'unavailable' });
      }
    },
    deleteEmptyKey: async (view: NativeHostRegistryView, key: string): Promise<void> => {
      if (view !== 'user/32') throw new Error('unsafe-registry-delete');
      const result = await runRegistry(['DELETE', fullKey(key), '/f', '/reg:32']);
      if (result.status !== 0) throw new Error('registry-delete-failed');
    },
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

function createRuntimeFiles(stageRoot: string, platform: NodeJS.Platform): NativeHostRuntimeFileAdapter {
  const requireStagePath = (pathname: string): void => {
    if (!inside(pathname, stageRoot)) throw new Error('outside-stage');
  };
  return Object.freeze({
    inspectSecurePath: async (
      pathname: string,
      expectedKind: 'file' | 'directory',
    ): Promise<NativeHostSecurePathFact> => {
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
    },
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
  if (!fields || !sameKeys(fields, RECEIPT_KEYS) || !marker) return null;
  return fields as unknown as Readonly<NativeHostRuntimeReceipt>;
}

function receiptsEqual(
  left: Readonly<NativeHostRuntimeReceipt> | null,
  right: Readonly<NativeHostRuntimeReceipt>,
): boolean {
  return Boolean(left && JSON.stringify(left) === JSON.stringify(right));
}

function createRuntimeAdapter(
  layout: ReturnType<typeof resolveNativeHostRuntimeLayout>,
): NativeHostInstallRuntimeAdapter {
  const receiptPath = join(layout.stableRoot, NATIVE_HOST_INSTALL_RECEIPT_RELATIVE_PATH);
  const files = createRuntimeFiles(layout.stageRoot, process.platform);
  const inspectRuntime = async (): Promise<Readonly<NativeHostRuntimeOwnedInspection>> => {
    const root = await files.inspectSecurePath(layout.stableRoot, 'directory');
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
      ) {
        return Object.freeze({
          state: 'mismatched', reason: 'runtime-layout-mismatch', markerFact, marker, receipt,
        });
      }
      const launcher = await files.inspectSecurePath(layout.launcherPath, 'file');
      const entry = await files.inspectSecurePath(layout.packageEntryPath, 'file');
      const integrity = await files.inspectSecurePath(layout.integrityReceiptPath, 'file');
      if (
        launcher.status !== 'file' || entry.status !== 'file' || integrity.status !== 'file'
        || await hashFile(layout.launcherPath, 'sha256') !== receipt.artifactSha256
      ) {
        throw new Error('invalid-runtime');
      }
      return Object.freeze({ state: 'exact', reason: 'exact', markerFact, marker, receipt });
    } catch {
      return Object.freeze({
        state: 'invalid', reason: 'runtime-metadata-invalid', markerFact, marker: null, receipt: null,
      });
    }
  };
  return Object.freeze({
    layout,
    inspectRuntime,
    publishRuntime: () => publishNativeHostRuntime(
      layout,
      Object.freeze({ files, process: Object.freeze({ run: runProcess }) }),
      Object.freeze({ architecture: process.arch }),
    ),
    recheckPublicationBoundary: async (
      receipt: Readonly<NativeHostRuntimeReceipt>,
    ): Promise<boolean> => {
      const inspected = await inspectRuntime();
      return inspected.state === 'exact' && receiptsEqual(inspected.receipt, receipt);
    },
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

async function resolveNpmCliPath(): Promise<string> {
  const candidate = process.env.npm_execpath;
  if (!candidate || !isAbsolute(candidate) || basename(candidate).toLowerCase() !== 'npm-cli.js') {
    throw new Error('npm-cli-unavailable');
  }
  const resolved = await realpath(candidate);
  if (basename(resolved).toLowerCase() !== 'npm-cli.js') throw new Error('npm-cli-unavailable');
  return resolved;
}

async function productionDependencies(
  extensionId = NATIVE_HOST_DEFAULT_EXTENSION_ID,
): Promise<NativeHostInstallTransactionDependencies> {
  if (!['darwin', 'linux', 'win32'].includes(process.platform)) throw new Error('unsupported-platform');
  const platform = process.platform as 'darwin' | 'linux' | 'win32';
  const invokingPackageRoot = await realpath(dirname(dirname(fileURLToPath(import.meta.url))));
  const manifest = ordinaryRecord(await readJson(join(invokingPackageRoot, 'package.json')));
  if (!manifest || typeof manifest.version !== 'string') throw new Error('invalid-package');
  const nodePath = await realpath(process.execPath);
  const npmCliPath = await resolveNpmCliPath();
  const homeDirectory = await realpath(homedir());
  const input = {
    platform,
    homeDirectory,
    ...(platform === 'win32' ? { localAppData: process.env.LOCALAPPDATA } : {}),
  };
  const platformLayout = resolveNativeHostPlatformLayout(input);
  const runtimeLayout = resolveNativeHostRuntimeLayout({
    ...input,
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
    platform: createNativeHostPlatformAdapter(platformLayout, Object.freeze({
      files: createInstallFileAdapter(),
      ...(platform === 'win32' ? { registry: createRegistryAdapter() } : {}),
    })),
    runtime: createRuntimeAdapter(runtimeLayout),
  });
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
          await productionDependencies(request.extensionId ?? NATIVE_HOST_DEFAULT_EXTENSION_ID),
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
        return await uninstallNativeHost(await productionDependencies());
      } catch {
        return Object.freeze({
          status: 'refused', reason: 'unavailable', location: unavailableLocation(),
          origin: null, packageVersion: null,
        });
      }
    },
  });
}
