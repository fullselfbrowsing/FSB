import {
  encodeNativeWakeResponse,
  readNativeWakeRequest,
  validateNativeInvocation,
  type NativeWakeReason,
  type NativeWakeRequest,
  type NativeWakeResponse,
} from './protocol.js';

type NativeWakeHandlerResult = Readonly<{
  outcome: NativeWakeResponse['outcome'];
  reason: NativeWakeReason;
}>;

type NativeWakeHandler = (
  request: NativeWakeRequest,
) => Promise<NativeWakeHandlerResult> | NativeWakeHandlerResult;

type NativeReadable = NodeJS.ReadableStream & {
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
};

type NativeWritable = NodeJS.WritableStream & {
  once(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
};

export type NativeHostEntryDependencies = Readonly<{
  stdin: NativeReadable;
  stdout: NativeWritable;
  stderr: NativeWritable;
  argv: unknown;
  expectedOrigin: unknown;
  handleWake: NativeWakeHandler;
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}>;

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

function writeBytes(stream: NativeWritable, bytes: Buffer): Promise<void> {
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
  stderr: NativeWritable,
  code: 'FSBNH_INVALID_INVOCATION' | 'FSBNH_NATIVE_PROTOCOL' | 'FSBNH_STDOUT_FAILURE',
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

  try {
    validateNativeInvocation(dependencies.argv, dependencies.expectedOrigin);
  } catch (_error) {
    await writeStableDiagnostic(dependencies.stderr, 'FSBNH_INVALID_INVOCATION');
    return 1;
  }

  let encoded: Buffer;
  try {
    const handled = safeHandlerResult(await dependencies.handleWake(request));
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
