import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { isAbsolute } from 'node:path';
import {
  isSanitizedAgentEnvironment,
  type SanitizedAgentEnvironment,
} from './spawn-environment.js';
import {
  terminateDetachedProcessTree,
} from './process-tree.js';

const MAX_PROBE_ARGUMENTS = 256;
const MAX_PROBE_ARGUMENT_BYTES = 64 * 1024;
const MAX_PROBE_CHANNEL_BYTES = 1024 * 1024;
const MAX_PROBE_TIMEOUT_MS = 60_000;

export type ProcessProbeFailureCode =
  | 'invalid_descriptor'
  | 'spawn_failed'
  | 'aborted'
  | 'timeout'
  | 'stdout_overflow'
  | 'stderr_overflow'
  | 'malformed_channel'
  | 'invalid_exit'
  | 'tree_unsettled';

export class ProcessProbeError extends Error {
  readonly code: ProcessProbeFailureCode;

  constructor(code: ProcessProbeFailureCode) {
    super(`process_probe_${code}`);
    this.name = 'ProcessProbeError';
    this.code = code;
  }
}

export interface BoundedProcessProbeDescriptor {
  readonly command: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly environment: SanitizedAgentEnvironment;
  readonly timeoutMs: number;
  readonly stdoutLimitBytes: number;
  readonly stderrLimitBytes: number;
  readonly signal?: AbortSignal;
}

export interface BoundedProcessProbeResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly exit: Readonly<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>;
  /** Zero both owned channels. Safe to call repeatedly. */
  zeroize(): void;
}

export interface ProcessProbeDependencies {
  readonly spawn?: (
    command: string,
    argv: readonly string[],
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
  readonly terminateTree?: (
    pid: number,
    childClosed: Promise<void>,
  ) => Promise<void>;
}

type OwnDataRecord = Readonly<Record<string, unknown>>;

function invalidDescriptor(): never {
  throw new ProcessProbeError('invalid_descriptor');
}

function ownDataRecord(value: unknown): OwnDataRecord {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) invalidDescriptor();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) invalidDescriptor();
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalidDescriptor();
    }
  }
  return value as OwnDataRecord;
}

function ownValue(record: OwnDataRecord, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalidDescriptor();
  return descriptor.value;
}

function boundedInteger(value: unknown, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    invalidDescriptor();
  }
  return value as number;
}

function boundedString(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.includes('\0')
    || Buffer.byteLength(value, 'utf8') > MAX_PROBE_ARGUMENT_BYTES
  ) invalidDescriptor();
  return value;
}

function cloneArguments(value: unknown): readonly string[] {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > MAX_PROBE_ARGUMENTS
    || Reflect.ownKeys(value).length !== value.length + 1
  ) invalidDescriptor();
  const result: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      invalidDescriptor();
    }
    result.push(boundedString(descriptor.value));
  }
  return Object.freeze(result);
}

function validateSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined) return undefined;
  if (
    !value
    || typeof value !== 'object'
    || typeof (value as AbortSignal).aborted !== 'boolean'
    || typeof (value as AbortSignal).addEventListener !== 'function'
    || typeof (value as AbortSignal).removeEventListener !== 'function'
  ) invalidDescriptor();
  return value as AbortSignal;
}

function validateDescriptor(value: unknown): BoundedProcessProbeDescriptor {
  const record = ownDataRecord(value);
  const requiredKeys = [
    'command',
    'argv',
    'cwd',
    'environment',
    'timeoutMs',
    'stdoutLimitBytes',
    'stderrLimitBytes',
  ];
  const keys = Reflect.ownKeys(record) as string[];
  if (
    (keys.length !== requiredKeys.length && keys.length !== requiredKeys.length + 1)
    || requiredKeys.some((key) => !keys.includes(key))
    || keys.some((key) => !requiredKeys.includes(key) && key !== 'signal')
  ) invalidDescriptor();
  const command = boundedString(ownValue(record, 'command'));
  const cwd = boundedString(ownValue(record, 'cwd'));
  const environment = ownValue(record, 'environment');
  if (!isAbsolute(command) || !isAbsolute(cwd) || !isSanitizedAgentEnvironment(environment)) {
    invalidDescriptor();
  }
  return Object.freeze({
    command,
    argv: cloneArguments(ownValue(record, 'argv')),
    cwd,
    environment,
    timeoutMs: boundedInteger(ownValue(record, 'timeoutMs'), MAX_PROBE_TIMEOUT_MS),
    stdoutLimitBytes: boundedInteger(
      ownValue(record, 'stdoutLimitBytes'),
      MAX_PROBE_CHANNEL_BYTES,
    ),
    stderrLimitBytes: boundedInteger(
      ownValue(record, 'stderrLimitBytes'),
      MAX_PROBE_CHANNEL_BYTES,
    ),
    ...(keys.includes('signal') ? { signal: validateSignal(ownValue(record, 'signal')) } : {}),
  });
}

function zeroBuffers(buffers: readonly Buffer[]): void {
  for (const buffer of buffers) buffer.fill(0);
}

/**
 * Execute one non-shell probe with byte-bounded channels. No raw channel byte
 * is converted to text or included in diagnostics; callers classify the owned
 * buffers and must zeroize the result in a finally block.
 */
export function runBoundedProcessProbe(
  input: BoundedProcessProbeDescriptor,
  dependencies: ProcessProbeDependencies = {},
): Promise<BoundedProcessProbeResult> {
  let descriptor: BoundedProcessProbeDescriptor;
  try {
    descriptor = validateDescriptor(input);
  } catch (error) {
    if (error instanceof ProcessProbeError) return Promise.reject(error);
    return Promise.reject(new ProcessProbeError('invalid_descriptor'));
  }
  if (descriptor.signal?.aborted) {
    return Promise.reject(new ProcessProbeError('aborted'));
  }

  const options: SpawnOptionsWithoutStdio = Object.freeze({
    shell: false,
    detached: true,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    cwd: descriptor.cwd,
    env: descriptor.environment,
  });

  let child: ChildProcessWithoutNullStreams;
  try {
    child = dependencies.spawn
      ? dependencies.spawn(descriptor.command, descriptor.argv, options)
      : nodeSpawn(descriptor.command, descriptor.argv, options);
  } catch {
    return Promise.reject(new ProcessProbeError('spawn_failed'));
  }

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let failureStarted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closePromiseResolve: (() => void) | null = null;
    const childClosed = new Promise<void>((resolve) => {
      closePromiseResolve = resolve;
    });

    const cleanup = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      descriptor.signal?.removeEventListener('abort', onAbort);
      child.stdout.removeListener('data', onStdout);
      child.stderr.removeListener('data', onStderr);
      child.stdout.removeListener('error', onStdoutError);
      child.stderr.removeListener('error', onStderrError);
      child.stdin.removeListener('error', onStdinError);
      child.removeListener('error', onError);
      child.removeListener('close', onClose);
    };

    const fail = (code: ProcessProbeFailureCode): void => {
      if (settled || failureStarted) return;
      failureStarted = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      descriptor.signal?.removeEventListener('abort', onAbort);
      child.stdout.removeListener('data', onStdout);
      child.stderr.removeListener('data', onStderr);
      zeroBuffers(stdoutChunks);
      zeroBuffers(stderrChunks);
      const terminateTree = dependencies.terminateTree ?? terminateDetachedProcessTree;
      void terminateTree(child.pid ?? 0, childClosed).then(
        () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new ProcessProbeError(code));
        },
        () => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new ProcessProbeError('tree_unsettled'));
        },
      );
    };

    const append = (
      value: unknown,
      chunks: Buffer[],
      channel: 'stdout' | 'stderr',
    ): void => {
      if (!Buffer.isBuffer(value)) {
        fail('malformed_channel');
        return;
      }
      const copy = Buffer.from(value);
      const next = (channel === 'stdout' ? stdoutBytes : stderrBytes) + copy.length;
      const limit = channel === 'stdout'
        ? descriptor.stdoutLimitBytes
        : descriptor.stderrLimitBytes;
      if (next > limit) {
        copy.fill(0);
        fail(channel === 'stdout' ? 'stdout_overflow' : 'stderr_overflow');
        return;
      }
      chunks.push(copy);
      if (channel === 'stdout') stdoutBytes = next;
      else stderrBytes = next;
    };

    const onStdout = (value: unknown): void => append(value, stdoutChunks, 'stdout');
    const onStderr = (value: unknown): void => append(value, stderrChunks, 'stderr');
    const onError = (): void => fail('spawn_failed');
    const onStdoutError = (): void => fail('malformed_channel');
    const onStderrError = (): void => fail('malformed_channel');
    const onStdinError = (): void => fail('spawn_failed');
    const onAbort = (): void => fail('aborted');
    const onClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      closePromiseResolve?.();
      closePromiseResolve = null;
      if (settled || failureStarted) return;
      if (
        (code !== null && !Number.isSafeInteger(code))
        || (signal !== null && (typeof signal !== 'string' || signal.length === 0))
      ) {
        fail('invalid_exit');
        return;
      }

      let stdout: Buffer | null = null;
      let stderr: Buffer | null = null;
      try {
        stdout = Buffer.concat(stdoutChunks, stdoutBytes);
        stderr = Buffer.concat(stderrChunks, stderrBytes);
      } catch {
        if (stdout) stdout.fill(0);
        if (stderr) stderr.fill(0);
        fail('invalid_exit');
        return;
      } finally {
        zeroBuffers(stdoutChunks);
        zeroBuffers(stderrChunks);
      }

      settled = true;
      cleanup();
      let zeroed = false;
      const ownedStdout = stdout;
      const ownedStderr = stderr;
      resolve(Object.freeze({
        stdout: ownedStdout,
        stderr: ownedStderr,
        exit: Object.freeze({ code, signal }),
        zeroize(): void {
          if (zeroed) return;
          zeroed = true;
          ownedStdout.fill(0);
          ownedStderr.fill(0);
        },
      }));
    };

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.stdout.once('error', onStdoutError);
    child.stderr.once('error', onStderrError);
    child.stdin.once('error', onStdinError);
    child.once('error', onError);
    child.once('close', onClose);
    descriptor.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => fail('timeout'), descriptor.timeoutMs);
    timer.unref?.();
    try {
      child.stdin.end();
    } catch {
      fail('spawn_failed');
    }
  });
}

export const PROCESS_PROBE_MAX_CHANNEL_BYTES = MAX_PROBE_CHANNEL_BYTES;
export const PROCESS_PROBE_MAX_TIMEOUT_MS = MAX_PROBE_TIMEOUT_MS;
