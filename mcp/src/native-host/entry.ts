import { wakeServeDaemon } from './daemon.js';
import type {
  NativeHostDaemonDependencies,
  NativeHostReadable,
  NativeHostWritable,
} from './platform.js';
import {
  encodeNativeWakeResponse,
  readNativeWakeRequest,
  validateNativeInvocation,
  type NativeWakeReason,
  type NativeWakeRequest,
  type NativeWakeResponse,
} from './protocol.js';
import {
  parseNativeHostOwnerMarker,
  resolveNativeHostWakeRuntimeLayout,
} from './runtime-layout.js';

type NativeWakeHandlerResult = Readonly<{
  outcome: NativeWakeResponse['outcome'];
  reason: NativeWakeReason;
}>;

type NativeWakeHandler = (
  request: NativeWakeRequest,
) => Promise<NativeWakeHandlerResult> | NativeWakeHandlerResult;

export type NativeHostEntryDependencies = Readonly<{
  stdin: NativeHostReadable;
  stdout: NativeHostWritable;
  stderr: NativeHostWritable;
  argv: unknown;
  expectedOrigin: unknown;
  handleWake: NativeWakeHandler;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}>;

export type NativeHostProductionEntryDependencies = Readonly<{
  stdin: NativeHostReadable;
  stdout: NativeHostWritable;
  stderr: NativeHostWritable;
  argv: unknown;
  platform: unknown;
  absoluteEntryPath: unknown;
  absoluteNode: unknown;
  daemonDependencies: NativeHostDaemonDependencies;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}>;

type NativeHostOneShotDependencies = Readonly<{
  stdin: NativeHostReadable;
  stdout: NativeHostWritable;
  stderr: NativeHostWritable;
  argv: unknown;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}>;

type NativeWakeAuthority = Readonly<{
  expectedOrigin: unknown;
  handleWake: NativeWakeHandler;
}>;

type NativeWakeAuthorityLoader = () => Promise<NativeWakeAuthority> | NativeWakeAuthority;

type NativeStableDiagnostic =
  | 'FSBNH_INVALID_INVOCATION'
  | 'FSBNH_NATIVE_PROTOCOL'
  | 'FSBNH_RUNTIME_CONFIG'
  | 'FSBNH_STDOUT_FAILURE';

const OWNER_MARKER_MAX_BYTES = 4096;

const INTERNAL_FAILURE = Object.freeze({
  outcome: 'failed',
  reason: 'internal_failure',
} as const);

function safeHandlerResult(value: unknown): NativeWakeHandlerResult | null {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 2 || keys[0] !== 'outcome' || keys[1] !== 'reason') return null;
    const outcome = Object.getOwnPropertyDescriptor(value, 'outcome');
    const reason = Object.getOwnPropertyDescriptor(value, 'reason');
    if (
      !outcome
      || !reason
      || !outcome.enumerable
      || !reason.enumerable
      || !Object.hasOwn(outcome, 'value')
      || !Object.hasOwn(reason, 'value')
    ) {
      return null;
    }
    return Object.freeze({
      outcome: outcome.value as NativeWakeResponse['outcome'],
      reason: reason.value as NativeWakeReason,
    });
  } catch (_error) {
    return null;
  }
}

function writeBytes(stream: NativeHostWritable, bytes: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.removeListener('error', onError as (...args: never[]) => void);
    };
    const finish = (error?: Error | null, keepErrorListener = false) => {
      if (settled) return;
      settled = true;
      if (!keepErrorListener) cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onError = () => finish(new Error('write_failed'));
    stream.once('error', onError as (...args: never[]) => void);
    try {
      stream.write(bytes, (error?: Error | null) => {
        // Node emits an `error` event after a write callback receives an error.
        // Keep the one-shot listener until that event consumes itself.
        finish(error, Boolean(error));
      });
    } catch (_error) {
      finish(new Error('write_failed'));
    }
  });
}

async function writeStableDiagnostic(
  stderr: NativeHostWritable,
  code: NativeStableDiagnostic,
): Promise<void> {
  try {
    await writeBytes(stderr, Buffer.from(`${code}\n`, 'ascii'));
  } catch (_error) {
    // stderr is best-effort and never changes protocol settlement.
  }
}

function encodeHandlerResult(
  request: NativeWakeRequest,
  result: NativeWakeHandlerResult,
): Buffer {
  return encodeNativeWakeResponse({
    v: 1,
    correlationId: request.correlationId,
    outcome: result.outcome,
    reason: result.reason,
  }, request.correlationId);
}

export async function runNativeHostEntry(
  dependencies: NativeHostEntryDependencies,
): Promise<0 | 1> {
  return runNativeHostEntryWithAuthority(
    dependencies,
    () => Object.freeze({
      expectedOrigin: dependencies.expectedOrigin,
      handleWake: dependencies.handleWake,
    }),
    'FSBNH_INVALID_INVOCATION',
  );
}

async function runNativeHostEntryWithAuthority(
  dependencies: NativeHostOneShotDependencies,
  loadAuthority: NativeWakeAuthorityLoader,
  authorityFailureCode: Extract<NativeStableDiagnostic, 'FSBNH_INVALID_INVOCATION' | 'FSBNH_RUNTIME_CONFIG'>,
): Promise<0 | 1> {
  let request: NativeWakeRequest | null;
  try {
    request = await readNativeWakeRequest(dependencies.stdin, {
      settleMs: dependencies.settleMs,
      setTimer: dependencies.setTimer,
      clearTimer: dependencies.clearTimer,
    });
  } catch (_error) {
    await writeStableDiagnostic(dependencies.stderr, 'FSBNH_NATIVE_PROTOCOL');
    return 1;
  }

  if (request === null) return 0;

  let authority: NativeWakeAuthority;
  try {
    authority = await loadAuthority();
  } catch (_error) {
    await writeStableDiagnostic(dependencies.stderr, authorityFailureCode);
    return 1;
  }

  try {
    validateNativeInvocation(dependencies.argv, authority.expectedOrigin);
  } catch (_error) {
    await writeStableDiagnostic(dependencies.stderr, 'FSBNH_INVALID_INVOCATION');
    return 1;
  }

  let encoded: Buffer;
  try {
    const handled = safeHandlerResult(await authority.handleWake(request));
    encoded = encodeHandlerResult(request, handled ?? INTERNAL_FAILURE);
  } catch (_error) {
    encoded = encodeHandlerResult(request, INTERNAL_FAILURE);
  }

  try {
    await writeBytes(dependencies.stdout, encoded);
  } catch (_error) {
    await writeStableDiagnostic(dependencies.stderr, 'FSBNH_STDOUT_FAILURE');
    return 1;
  }
  return 0;
}

export async function runProductionNativeHostEntry(
  dependencies: NativeHostProductionEntryDependencies,
): Promise<0 | 1> {
  return runNativeHostEntryWithAuthority(
    dependencies,
    async () => {
      const wakeLayout = resolveNativeHostWakeRuntimeLayout({
        platform: dependencies.platform,
        absoluteEntryPath: dependencies.absoluteEntryPath,
        absoluteNode: dependencies.absoluteNode,
      });
      const markerText = await dependencies.daemonDependencies.readPrivateFile(
        wakeLayout.markerPath,
        OWNER_MARKER_MAX_BYTES,
      );
      if (
        typeof markerText !== 'string'
        || Buffer.byteLength(markerText, 'utf8') < 1
        || Buffer.byteLength(markerText, 'utf8') > OWNER_MARKER_MAX_BYTES
      ) {
        throw new Error('runtime_config');
      }
      const marker = parseNativeHostOwnerMarker(
        JSON.parse(markerText) as unknown,
        wakeLayout.platform,
      );
      const runtime = Object.freeze({
        stableRuntimeRoot: wakeLayout.stableRuntimeRoot,
        absoluteNode: wakeLayout.absoluteNode,
        absoluteStableBuildIndex: wakeLayout.absoluteStableBuildIndex,
      });
      return Object.freeze({
        expectedOrigin: marker.origin,
        handleWake: async () => wakeServeDaemon({
          runtime,
          dependencies: dependencies.daemonDependencies,
        }),
      });
    },
    'FSBNH_RUNTIME_CONFIG',
  );
}
