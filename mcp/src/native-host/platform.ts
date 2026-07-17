import { spawn as spawnChild } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { request as requestHttp } from 'node:http';

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
  removeDirectory(pathname: string): Promise<void>;
  spawn(
    command: string,
    argv: readonly string[],
    options: NativeHostSpawnOptions,
  ): NativeHostSpawnHandle;
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
      try {
        await rename(source, destination);
        return true;
      } catch (error) {
        if (isMissing(error) || isAlreadyPresent(error)) return false;
        throw error;
      }
    },
    removeDirectory: async (pathname: string) => {
      await rm(pathname, { recursive: true, force: false, maxRetries: 0 });
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
