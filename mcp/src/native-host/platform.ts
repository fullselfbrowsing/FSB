import { spawn as spawnChild } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { request as requestHttp } from 'node:http';
import { isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export type NativeHostReadable = NodeJS.ReadableStream & {
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
};

export type NativeHostWritable = NodeJS.WritableStream & {
  once(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
};

export type NativeHostHttpRequest = Readonly<{
  url: string;
  timeoutMs: number;
  maxBytes: number;
}>;

export type NativeHostHttpResponse = Readonly<{
  statusCode: number;
  body: Uint8Array;
}>;

export type NativeHostSpawnOptions = Readonly<{
  cwd: string;
  env: Readonly<Record<string, string>>;
  shell: false;
  detached: true;
  stdio: 'ignore';
  windowsHide: true;
}>;

export interface NativeHostSpawnHandle {
  once(event: 'spawn' | 'error', listener: (...args: unknown[]) => void): this;
  removeListener(event: 'spawn' | 'error', listener: (...args: unknown[]) => void): this;
  unref(): void;
}

export interface NativeHostRuntimeConfig {
  stableRuntimeRoot: string;
  absoluteNode: string;
  absoluteStableBuildIndex: string;
}

export interface NativeHostDaemonDependencies {
  environment: Readonly<Record<string, string | undefined>>;
  now(): number;
  wait(milliseconds: number): Promise<void>;
  randomToken(): string;
  requestHealth(request: NativeHostHttpRequest): Promise<NativeHostHttpResponse>;
  createDirectory(pathname: string, mode: number): Promise<boolean>;
  writePrivateFile(pathname: string, contents: string, mode: number): Promise<void>;
  readPrivateFile(pathname: string, maxBytes: number): Promise<string | null>;
  renameDirectory(source: string, destination: string): Promise<boolean>;
  removeAttemptDirectory(pathname: string, token: string): Promise<boolean>;
  removeOwnedDirectory(
    pathname: string,
    kind: 'quarantine' | 'release',
    directoryToken: string,
    ownerToken: string,
  ): Promise<boolean>;
  spawn(
    command: string,
    argv: readonly string[],
    options: NativeHostSpawnOptions,
  ): NativeHostSpawnHandle;
}

export interface NativeHostProductionEnvironment {
  stdin: NativeHostReadable;
  stdout: NativeHostWritable;
  stderr: NativeHostWritable;
  argv: readonly string[];
  platform: NodeJS.Platform;
  absoluteEntryPath: string;
  absoluteNode: string;
  daemonDependencies: NativeHostDaemonDependencies;
  settleExitCode(status: 0 | 1): void;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function isAlreadyPresent(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && ['EEXIST', 'ENOTEMPTY'].includes(String(error.code)),
  );
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await lstat(pathname);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function requestBoundedHealth(
  request: NativeHostHttpRequest,
): Promise<NativeHostHttpResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: NativeHostHttpResponse) => {
      if (settled) return;
      settled = true;
      resolve(Object.freeze(value));
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      reject(new Error('health_unavailable'));
    };

    let outgoing;
    try {
      outgoing = requestHttp(request.url, {
        method: 'GET',
        headers: Object.freeze({ accept: 'application/json' }),
      }, (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (value: unknown) => {
          if (settled || !(value instanceof Uint8Array)) return;
          const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
          total += chunk.length;
          if (total > request.maxBytes) {
            finish({
              statusCode: response.statusCode ?? 0,
              body: Buffer.alloc(request.maxBytes + 1),
            });
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.once('end', () => {
          finish({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks, total),
          });
        });
        response.once('error', fail);
        response.once('aborted', fail);
      });
    } catch (_error) {
      fail();
      return;
    }
    outgoing.setTimeout(request.timeoutMs, () => {
      outgoing.destroy(new Error('health_timeout'));
    });
    outgoing.once('error', fail);
    outgoing.end();
  });
}

async function readBoundedPrivateFile(
  pathname: string,
  maxBytes: number,
): Promise<string | null> {
  try {
    const stat = await lstat(pathname);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > maxBytes) {
      return null;
    }
    const contents = await readFile(pathname);
    if (contents.length < 1 || contents.length > maxBytes) return null;
    return contents.toString('utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

const LOCK_OWNER_NAME = 'owner.json';
const LOCK_TOKEN_PATTERN = /^[a-f0-9]{32}$/u;

function exactLockMetadataOwner(value: string | null, ownerToken: string): boolean {
  if (!value || !LOCK_TOKEN_PATTERN.test(ownerToken)) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !parsed
      || typeof parsed !== 'object'
      || Array.isArray(parsed)
      || Object.getPrototypeOf(parsed) !== Object.prototype
    ) {
      return false;
    }
    const fields = parsed as Record<string, unknown>;
    const keys = Reflect.ownKeys(fields);
    return keys.length === 3
      && keys[0] === 'schema'
      && keys[1] === 'token'
      && keys[2] === 'createdAt'
      && fields.schema === 1
      && fields.token === ownerToken
      && Number.isSafeInteger(fields.createdAt)
      && (fields.createdAt as number) >= 0;
  } catch (_error) {
    return false;
  }
}

async function exactLockDirectoryEntries(pathname: string): Promise<readonly string[] | null> {
  const stat = await lstat(pathname);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
  const entries = await readdir(pathname, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name !== LOCK_OWNER_NAME || !entry.isFile() || entry.isSymbolicLink()) return null;
  }
  return Object.freeze(entries.map((entry) => entry.name));
}

function exactTokenedLockPath(
  pathname: string,
  kind: 'pending' | 'quarantine' | 'release',
  token: string,
): boolean {
  return LOCK_TOKEN_PATTERN.test(token)
    && Buffer.byteLength(pathname, 'utf8') <= 4096
    && isAbsolute(pathname)
    && normalize(pathname) === pathname
    && pathname.endsWith(`wake.lock.${kind}-${token}`)
    && !pathname.includes('\0')
    && !pathname.includes('\r')
    && !pathname.includes('\n');
}

export function createNativeHostDaemonDependencies(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): NativeHostDaemonDependencies {
  return Object.freeze({
    environment: Object.freeze({ ...environment }),
    now: () => Date.now(),
    wait: (milliseconds: number) => new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
    randomToken: () => randomBytes(16).toString('hex'),
    requestHealth: requestBoundedHealth,
    createDirectory: async (pathname: string, mode: number) => {
      try {
        await mkdir(pathname, { mode });
        return true;
      } catch (error) {
        if (isAlreadyPresent(error)) return false;
        throw error;
      }
    },
    writePrivateFile: async (pathname: string, contents: string, mode: number) => {
      await writeFile(pathname, contents, { encoding: 'utf8', flag: 'wx', mode });
    },
    readPrivateFile: readBoundedPrivateFile,
    renameDirectory: async (source: string, destination: string) => {
      if (await pathExists(destination)) return false;
      try {
        await rename(source, destination);
        return true;
      } catch (error) {
        if (isMissing(error) || isAlreadyPresent(error)) return false;
        if (await pathExists(destination)) return false;
        throw error;
      }
    },
    removeAttemptDirectory: async (pathname: string, token: string) => {
      if (!exactTokenedLockPath(pathname, 'pending', token)) return false;
      try {
        const entries = await exactLockDirectoryEntries(pathname);
        if (!entries || entries.length > 1) return false;
        if (entries.length === 1) await unlink(join(pathname, LOCK_OWNER_NAME));
        await rmdir(pathname);
        return true;
      } catch (error) {
        return isMissing(error);
      }
    },
    removeOwnedDirectory: async (
      pathname: string,
      kind: 'quarantine' | 'release',
      directoryToken: string,
      ownerToken: string,
    ) => {
      if (
        !['quarantine', 'release'].includes(kind)
        || !exactTokenedLockPath(pathname, kind, directoryToken)
        || !LOCK_TOKEN_PATTERN.test(ownerToken)
      ) {
        return false;
      }
      try {
        const entries = await exactLockDirectoryEntries(pathname);
        if (!entries || entries.length !== 1) return false;
        const metadataPath = join(pathname, LOCK_OWNER_NAME);
        const metadata = await readBoundedPrivateFile(metadataPath, 256);
        if (!exactLockMetadataOwner(metadata, ownerToken)) return false;
        await unlink(metadataPath);
        await rmdir(pathname);
        return true;
      } catch (_error) {
        return false;
      }
    },
    spawn: (
      command: string,
      argv: readonly string[],
      options: NativeHostSpawnOptions,
    ) => (
      spawnChild(command, [...argv], options) as unknown as NativeHostSpawnHandle
    ),
  });
}

export function createNativeHostProductionEnvironment(
  entryUrl: string,
): NativeHostProductionEnvironment {
  const daemonDependencies = createNativeHostDaemonDependencies();
  return Object.freeze({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    argv: Object.freeze(process.argv.slice(2)),
    platform: process.platform,
    absoluteEntryPath: fileURLToPath(entryUrl),
    absoluteNode: process.execPath,
    daemonDependencies,
    settleExitCode: (status: 0 | 1) => {
      process.stdin.pause();
      process.exitCode = status;
    },
  });
}
