import {
  spawn as nodeSpawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import type { RetainedBinary } from './adapter.js';
import { createGrokBuildDetector } from './grok-detect.js';
import {
  createGrokBuildPrivateRuntime,
  GROK_BUILD_PROFILE_VERSION,
  type GrokBuildPrivateRuntime,
} from './grok-runtime.js';
import {
  runBoundedProcessProbe,
  type BoundedProcessProbeDescriptor,
  type BoundedProcessProbeResult,
} from './process-probe.js';
import { buildSanitizedGrokEnvironment } from './spawn-environment.js';

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const OPERATION_TIMEOUT_MS = 5_000;
const OUTPUT_LIMIT_BYTES = 64 * 1024;
const LOGIN_TERMINATION_GRACE_MS = 1_000;
const MAX_LOGIN_URL_BYTES = 2_048;
const URL_PATTERN = /https:\/\/[^\s<>"']+/gi;
const ALLOWED_LOGIN_HOSTS = new Set([
  'auth.x.ai',
  'accounts.x.ai',
  'grok.com',
  'auth.grok.com',
]);
const FORBIDDEN_LOGIN_QUERY_KEY_PATTERN =
  /(?:token|secret|password|credential|api[_-]?key|authorization)/i;

// An unhandled 'error' on a child stdio stream throws, which would take the
// whole delegation daemon down over one failed login. process-probe.ts holds the
// same listeners for the same reason; the login child is spawned directly and
// needs its own.
const ignoreStreamError = (): void => {};

export type GrokBuildAuthState = 'oauth' | 'unauthenticated' | 'unknown';
export type GrokBuildAuthProgressState =
  | 'opening_browser'
  | 'waiting'
  | 'authenticated'
  | 'failed'
  | 'cancelled';

export interface GrokBuildAuthProgress {
  readonly state: GrokBuildAuthProgressState;
  readonly url?: string;
}

export interface GrokBuildTaskLease {
  release(): void;
}

/**
 * The bridge collapses every ext-handler throw into one opaque code, so a
 * refusal the panel needs to name has to travel as data. Logout answers with
 * the settled state, or with the locked marker when a Grok run or a blocked
 * session cleanup owns the profile.
 */
export type GrokBuildLogoutResult =
  | Readonly<{ state: 'unauthenticated' }>
  | Readonly<{ state: 'unknown'; locked: true }>;

export type GrokBuildAuthSpawnDependency = (
  command: string,
  argv: readonly string[],
  options: Readonly<{
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: false;
    detached: true;
    windowsHide: true;
    stdio: ['pipe', 'pipe', 'pipe'];
  }>,
) => ChildProcessWithoutNullStreams;

export interface GrokBuildAuthCoordinator {
  recover(): Promise<void>;
  status(): Promise<Readonly<{ state: GrokBuildAuthState }>>;
  begin(
    emit: (progress: GrokBuildAuthProgress) => void,
    signal?: AbortSignal,
  ): Promise<Readonly<{ state: GrokBuildAuthState }>>;
  logout(): Promise<GrokBuildLogoutResult>;
  acquireTask(): Promise<GrokBuildTaskLease>;
  recordSession(delegationId: string, sessionId: string): Promise<void>;
  deleteSession(input: Readonly<{
    binary: RetainedBinary;
    delegationId: string;
    sessionId: string;
    cwd: string;
    journaled?: boolean;
  }>): Promise<void>;
}

export interface GrokBuildAuthCoordinatorDependencies {
  readonly runtime?: GrokBuildPrivateRuntime;
  readonly environment?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly detect?: ReturnType<typeof createGrokBuildDetector>['detect'];
  readonly spawn?: GrokBuildAuthSpawnDependency;
  readonly probe?: (
    descriptor: BoundedProcessProbeDescriptor,
  ) => Promise<BoundedProcessProbeResult>;
}

function safeState(value: unknown): GrokBuildAuthState {
  return value === 'oauth' || value === 'unauthenticated' ? value : 'unknown';
}

function safeLoginUrl(raw: string): string | null {
  if (Buffer.byteLength(raw, 'utf8') > MAX_LOGIN_URL_BYTES) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw.replace(/[),.;]+$/, ''));
  } catch {
    return null;
  }
  if (
    parsed.hash !== ''
    || [...parsed.searchParams.keys()].some((key) => (
      FORBIDDEN_LOGIN_QUERY_KEY_PATTERN.test(key)
    ))
  ) return null;
  // The bound above is on the raw bytes, but what leaves here is the normalized
  // form, and percent-encoding expands. serve-delegation.ts re-checks that form
  // against the same limit in characters and throws when it overflows, so bound
  // the output too rather than emitting a URL the progress sink will reject.
  const normalized = parsed.toString();
  return normalized.length <= MAX_LOGIN_URL_BYTES
    && parsed.protocol === 'https:'
    && parsed.username === ''
    && parsed.password === ''
    && ALLOWED_LOGIN_HOSTS.has(parsed.hostname.toLowerCase())
    ? normalized
    : null;
}

class Mutex {
  private tail: Promise<void> = Promise.resolve();

  async lock(): Promise<() => void> {
    let unlock!: () => void;
    const next = new Promise<void>((resolve) => { unlock = resolve; });
    const previous = this.tail;
    this.tail = previous.then(() => next, () => next);
    await previous;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unlock();
    };
  }
}

class DefaultGrokBuildAuthCoordinator implements GrokBuildAuthCoordinator {
  private readonly runtime: GrokBuildPrivateRuntime;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly platform: NodeJS.Platform;
  private readonly detect: ReturnType<typeof createGrokBuildDetector>['detect'];
  private readonly spawn: GrokBuildAuthSpawnDependency;
  private readonly probe: (
    descriptor: BoundedProcessProbeDescriptor,
  ) => Promise<BoundedProcessProbeResult>;
  private readonly mutex = new Mutex();
  private activeTasks = 0;
  private cleanupBlocked = false;

  constructor(dependencies: GrokBuildAuthCoordinatorDependencies) {
    this.runtime = dependencies.runtime ?? createGrokBuildPrivateRuntime();
    this.environment = dependencies.environment ?? process.env;
    this.platform = dependencies.platform ?? process.platform;
    this.detect = dependencies.detect ?? createGrokBuildDetector({
      runtime: this.runtime,
      sourceEnv: this.environment,
      platform: this.platform,
    }).detect;
    this.spawn = dependencies.spawn ?? ((command, argv, options) => (
      nodeSpawn(command, [...argv], options) as ChildProcessWithoutNullStreams
    ));
    this.probe = dependencies.probe ?? runBoundedProcessProbe;
  }

  private async detection() {
    const detection = await this.detect();
    return detection;
  }

  private supportedBinary(detection: Awaited<ReturnType<typeof this.detect>>): RetainedBinary {
    if (
      detection.installed !== true
      || detection.version !== GROK_BUILD_PROFILE_VERSION
      || detection.profileVersion !== GROK_BUILD_PROFILE_VERSION
      || !detection.binary
    ) throw new Error('adapter_unavailable');
    return detection.binary;
  }

  private operationDescriptor(
    binary: RetainedBinary,
    cwd: string,
    argv: readonly string[],
  ): BoundedProcessProbeDescriptor {
    return {
      command: binary.command,
      argv: Object.freeze([...binary.argvPrefix, ...argv]),
      cwd,
      environment: buildSanitizedGrokEnvironment(
        this.environment,
        this.runtime.authEnvironment(),
      ),
      timeoutMs: OPERATION_TIMEOUT_MS,
      stdoutLimitBytes: OUTPUT_LIMIT_BYTES,
      stderrLimitBytes: OUTPUT_LIMIT_BYTES,
    };
  }

  private async deleteLocalSession(
    binary: RetainedBinary,
    cwd: string,
    sessionId: string,
  ): Promise<void> {
    const result = await this.probe(this.operationDescriptor(
      binary,
      cwd,
      ['sessions', 'delete', sessionId],
    ));
    try {
      if (result.exit.code !== 0 || result.exit.signal !== null) {
        throw new Error('grok_session_cleanup_failed');
      }
    } finally {
      result.zeroize();
    }
  }

  async recover(): Promise<void> {
    const release = await this.mutex.lock();
    try {
      await this.runtime.ensureBase();
      const pending = await this.runtime.pendingSessions();
      if (pending.length === 0) {
        this.cleanupBlocked = false;
        return;
      }
      const detection = await this.detection();
      let binary: RetainedBinary;
      try {
        binary = this.supportedBinary(detection);
      } catch {
        throw new Error('grok_session_cleanup_failed');
      }
      for (const entry of pending) {
        const run = await this.runtime.prepareRun(entry.delegationId);
        await this.deleteLocalSession(binary, run.cwd, entry.sessionId);
        await this.runtime.clearSession(entry.delegationId, entry.sessionId);
        await this.runtime.removeRun(entry.delegationId);
      }
      this.cleanupBlocked = false;
    } catch {
      this.cleanupBlocked = true;
      throw new Error('grok_session_cleanup_failed');
    } finally {
      release();
    }
  }

  async status(): Promise<Readonly<{ state: GrokBuildAuthState }>> {
    const release = await this.mutex.lock();
    try {
      if (this.activeTasks > 0 || this.cleanupBlocked) {
        return Object.freeze({ state: 'unknown' });
      }
      await this.runtime.ensureBase();
      const detection = await this.detection();
      return Object.freeze({ state: safeState(detection.authState) });
    } finally {
      release();
    }
  }

  async begin(
    emit: (progress: GrokBuildAuthProgress) => void,
    signal?: AbortSignal,
  ): Promise<Readonly<{ state: GrokBuildAuthState }>> {
    const release = await this.mutex.lock();
    let child: ChildProcessWithoutNullStreams | null = null;
    let timer: NodeJS.Timeout | null = null;
    let escalationTimer: NodeJS.Timeout | null = null;
    let abortListener: (() => void) | null = null;
    let stopReason: 'cancelled' | 'timeout' | 'output_limit' | null = null;
    let stdoutTail = Buffer.alloc(0);
    let stderrTail = Buffer.alloc(0);
    try {
      if (this.activeTasks > 0 || this.cleanupBlocked) throw new Error('provider_auth_locked');
      if (signal?.aborted) {
        emit(Object.freeze({ state: 'cancelled' }));
        return Object.freeze({ state: 'unauthenticated' });
      }
      await this.runtime.ensureBase();
      const detection = await this.detection();
      const binary = this.supportedBinary(detection);
      if (detection.authState === 'oauth') {
        emit(Object.freeze({ state: 'authenticated' }));
        return Object.freeze({ state: 'oauth' });
      }
      emit(Object.freeze({ state: 'opening_browser' }));
      const environment = buildSanitizedGrokEnvironment(
        this.environment,
        this.runtime.authEnvironment(),
      );
      child = this.spawn(
        binary.command,
        [...binary.argvPrefix, 'login', '--oauth'],
        {
          cwd: this.runtime.paths.home,
          env: environment,
          shell: false,
          detached: true,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      ) as ChildProcessWithoutNullStreams;
      child.stdin.on('error', ignoreStreamError);
      child.stdout.on('error', ignoreStreamError);
      child.stderr.on('error', ignoreStreamError);
      child.stdin.end();
      emit(Object.freeze({ state: 'waiting' }));
      let bytes = 0;
      let announcedUrl = false;
      let stopChild: (reason: 'cancelled' | 'timeout' | 'output_limit') => void = () => {};
      const inspectChunk = (channel: 'stdout' | 'stderr', chunk: Buffer | string): void => {
        const value = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk, 'utf8');
        let candidate = Buffer.alloc(0);
        try {
          bytes += value.length;
          if (bytes > OUTPUT_LIMIT_BYTES) {
            stopChild('output_limit');
            return;
          }
          if (announcedUrl) return;
          const previous = channel === 'stdout' ? stdoutTail : stderrTail;
          candidate = Buffer.concat([previous, value]);
          previous.fill(0);
          const text = candidate.toString('utf8');
          for (const match of text.matchAll(URL_PATTERN)) {
            const matchEnd = (match.index ?? 0) + match[0].length;
            if (matchEnd === text.length) continue;
            const url = safeLoginUrl(match[0]);
            if (!url) continue;
            // This runs inside a stdio 'data' listener, and the daemon installs
            // no uncaughtException handler, so a throw from the progress sink
            // would take the whole delegation daemon down. Swallow it and leave
            // announcedUrl unset so a later chunk can still carry the link.
            try {
              emit(Object.freeze({ state: 'waiting', url }));
              announcedUrl = true;
            } catch { /* the panel keeps the plain waiting state */ }
            break;
          }
          const retained = Buffer.from(candidate.subarray(
            Math.max(0, candidate.length - MAX_LOGIN_URL_BYTES),
          ));
          if (channel === 'stdout') stdoutTail = retained;
          else stderrTail = retained;
        } finally {
          candidate.fill(0);
          value.fill(0);
        }
      };
      const inspectStdout = (chunk: Buffer | string): void => inspectChunk('stdout', chunk);
      const inspectStderr = (chunk: Buffer | string): void => inspectChunk('stderr', chunk);
      child.stdout.on('data', inspectStdout);
      child.stderr.on('data', inspectStderr);
      const exit = await new Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>(
        (resolve) => {
          let settled = false;
          const finish = (code: number | null, exitSignal: NodeJS.Signals | null): void => {
            if (settled) return;
            settled = true;
            resolve(Object.freeze({ code, signal: exitSignal }));
          };
          child!.once('close', finish);
          child!.once('error', () => finish(null, null));
          stopChild = (reason): void => {
            if (stopReason !== null) return;
            stopReason = reason;
            try {
              if (this.platform === 'win32') child!.kill('SIGTERM');
              else process.kill(-child!.pid!, 'SIGTERM');
            } catch {
              try { child!.kill('SIGTERM'); } catch { /* already closed */ }
            }
            escalationTimer = setTimeout(() => {
              try {
                if (this.platform === 'win32') child!.kill('SIGKILL');
                else process.kill(-child!.pid!, 'SIGKILL');
              } catch {
                try { child!.kill('SIGKILL'); } catch { /* already closed */ }
              }
            }, LOGIN_TERMINATION_GRACE_MS);
            escalationTimer.unref?.();
          };
          abortListener = () => stopChild('cancelled');
          signal?.addEventListener('abort', abortListener, { once: true });
          if (signal?.aborted) abortListener();
          timer = setTimeout(() => stopChild('timeout'), LOGIN_TIMEOUT_MS);
          timer.unref?.();
        },
      );
      if (timer) clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      child.stdout.off('data', inspectStdout);
      child.stderr.off('data', inspectStderr);
      if (abortListener) signal?.removeEventListener('abort', abortListener);
      if (stopReason === 'cancelled' || signal?.aborted) {
        emit(Object.freeze({ state: 'cancelled' }));
        return Object.freeze({ state: 'unauthenticated' });
      }
      if (
        stopReason === 'timeout'
        || stopReason === 'output_limit'
        || exit.code !== 0
        || exit.signal !== null
        || bytes > OUTPUT_LIMIT_BYTES
      ) {
        emit(Object.freeze({ state: 'failed' }));
        return Object.freeze({ state: 'unauthenticated' });
      }
      const verified = await this.detection();
      if (verified.authState !== 'oauth') {
        emit(Object.freeze({ state: 'failed' }));
        return Object.freeze({ state: safeState(verified.authState) });
      }
      emit(Object.freeze({ state: 'authenticated' }));
      return Object.freeze({ state: 'oauth' });
    } catch {
      emit(Object.freeze({ state: stopReason === 'cancelled' ? 'cancelled' : 'failed' }));
      return Object.freeze({ state: 'unknown' });
    } finally {
      if (timer) clearTimeout(timer);
      if (escalationTimer) clearTimeout(escalationTimer);
      if (abortListener) signal?.removeEventListener('abort', abortListener);
      if (child) {
        child.stdin.off('error', ignoreStreamError);
        child.stdout.off('error', ignoreStreamError);
        child.stderr.off('error', ignoreStreamError);
      }
      stdoutTail.fill(0);
      stderrTail.fill(0);
      release();
    }
  }

  async logout(): Promise<GrokBuildLogoutResult> {
    const release = await this.mutex.lock();
    try {
      if (this.activeTasks > 0 || this.cleanupBlocked) {
        return Object.freeze({ state: 'unknown', locked: true });
      }
      await this.runtime.ensureBase();
      const detection = await this.detection();
      const binary = this.supportedBinary(detection);
      const result = await this.probe(this.operationDescriptor(
        binary,
        this.runtime.paths.home,
        ['logout'],
      ));
      try {
        if (result.exit.code !== 0 || result.exit.signal !== null) {
          throw new Error('provider_auth_failed');
        }
      } finally {
        result.zeroize();
      }
      const verified = await this.detection();
      if (verified.authState !== 'unauthenticated') {
        throw new Error('provider_auth_failed');
      }
      return Object.freeze({ state: 'unauthenticated' });
    } finally {
      release();
    }
  }

  async acquireTask(): Promise<GrokBuildTaskLease> {
    const releaseLock = await this.mutex.lock();
    try {
      if (this.cleanupBlocked) throw new Error('grok_session_cleanup_failed');
      this.activeTasks += 1;
      let released = false;
      return Object.freeze({
        release: () => {
          if (released) return;
          released = true;
          this.activeTasks = Math.max(0, this.activeTasks - 1);
        },
      });
    } finally {
      releaseLock();
    }
  }

  recordSession(delegationId: string, sessionId: string): Promise<void> {
    return this.runtime.recordSession(delegationId, sessionId);
  }

  async deleteSession(input: Readonly<{
    binary: RetainedBinary;
    delegationId: string;
    sessionId: string;
    cwd: string;
    journaled?: boolean;
  }>): Promise<void> {
    try {
      await this.deleteLocalSession(input.binary, input.cwd, input.sessionId);
      if (input.journaled !== false) {
        await this.runtime.clearSession(input.delegationId, input.sessionId);
      }
    } catch {
      this.cleanupBlocked = true;
      throw new Error('grok_session_cleanup_failed');
    }
  }
}

export function createGrokBuildAuthCoordinator(
  dependencies: GrokBuildAuthCoordinatorDependencies = {},
): GrokBuildAuthCoordinator {
  return new DefaultGrokBuildAuthCoordinator(dependencies);
}
