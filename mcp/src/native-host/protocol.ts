import { endianness } from 'node:os';
import {
  NATIVE_HOST_MAX_FRAME_BYTES,
  NATIVE_HOST_PROTOCOL_VERSION,
} from './constants.js';

const NATIVE_HEADER_BYTES = 4;
const DEFAULT_TRAILING_SETTLE_MS = 10;
const CORRELATION_PATTERN = /^[A-Za-z0-9_-]{16,64}$/u;
const ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}\/$/u;
const PARENT_WINDOW_PATTERN = /^--parent-window=([0-9]{1,20})$/u;

const OUTCOME_REASONS = Object.freeze({
  already_running: Object.freeze(['daemon_already_ready']),
  started: Object.freeze(['daemon_started_ready']),
  unavailable: Object.freeze([
    'daemon_identity_mismatch',
    'daemon_protocol_mismatch',
    'runtime_invalid',
  ]),
  failed: Object.freeze([
    'wake_lock_timeout',
    'serve_spawn_failed',
    'serve_readiness_timeout',
    'internal_failure',
  ]),
} as const);

export type NativeWakeReason =
  | 'daemon_already_ready'
  | 'daemon_started_ready'
  | 'daemon_identity_mismatch'
  | 'daemon_protocol_mismatch'
  | 'runtime_invalid'
  | 'wake_lock_timeout'
  | 'serve_spawn_failed'
  | 'serve_readiness_timeout'
  | 'internal_failure';

export type NativeWakeRequest = Readonly<{
  v: 1;
  action: 'wake';
  correlationId: string;
}>;

export type NativeWakeResponse = Readonly<{
  v: 1;
  correlationId: string;
  outcome: 'already_running' | 'started' | 'unavailable' | 'failed';
  reason: NativeWakeReason;
}>;

export type NativeInvocation = Readonly<{
  origin: string;
  parentWindow: string | null;
}>;

export class NativeHostProtocolError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'NativeHostProtocolError';
    this.code = code;
  }
}

function fail(code: string): never {
  throw new NativeHostProtocolError(code);
}

function exactDataValues(
  value: unknown,
  expectedKeys: readonly string[],
  failureCode: string,
): Readonly<Record<string, unknown>> {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail(failureCode);
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return fail(failureCode);
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.length) return fail(failureCode);
    const values: Record<string, unknown> = Object.create(null);
    for (let index = 0; index < expectedKeys.length; index += 1) {
      if (keys[index] !== expectedKeys[index]) return fail(failureCode);
      const descriptor = Object.getOwnPropertyDescriptor(value, expectedKeys[index]);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return fail(failureCode);
      }
      values[expectedKeys[index]] = descriptor.value;
    }
    return values;
  } catch (error) {
    if (error instanceof NativeHostProtocolError) throw error;
    return fail(failureCode);
  }
}

function isCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && CORRELATION_PATTERN.test(value);
}

export function validateNativeWakeRequest(value: unknown): NativeWakeRequest {
  const fields = exactDataValues(
    value,
    ['v', 'action', 'correlationId'],
    'native_invalid_request',
  );
  if (
    fields.v !== NATIVE_HOST_PROTOCOL_VERSION
    || fields.action !== 'wake'
    || !isCorrelationId(fields.correlationId)
  ) {
    return fail('native_invalid_request');
  }
  return Object.freeze({
    v: 1,
    action: 'wake',
    correlationId: fields.correlationId,
  });
}

function exactInvocationArgs(argv: unknown): readonly string[] {
  try {
    if (!Array.isArray(argv) || Object.getPrototypeOf(argv) !== Array.prototype) {
      return fail('native_invalid_invocation');
    }
    if (argv.length < 1 || argv.length > 2) return fail('native_invalid_invocation');
    const keys = Reflect.ownKeys(argv);
    const expectedKeys = argv.length === 1
      ? ['0', 'length']
      : ['0', '1', 'length'];
    if (keys.length !== expectedKeys.length) return fail('native_invalid_invocation');
    for (let index = 0; index < expectedKeys.length; index += 1) {
      if (keys[index] !== expectedKeys[index]) return fail('native_invalid_invocation');
    }
    const values: string[] = [];
    for (let index = 0; index < argv.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(argv, String(index));
      if (
        !descriptor
        || !descriptor.enumerable
        || !Object.hasOwn(descriptor, 'value')
        || typeof descriptor.value !== 'string'
      ) {
        return fail('native_invalid_invocation');
      }
      values.push(descriptor.value);
    }
    return values;
  } catch (error) {
    if (error instanceof NativeHostProtocolError) throw error;
    return fail('native_invalid_invocation');
  }
}

export function validateNativeInvocation(
  argv: unknown,
  expectedOrigin: unknown,
): NativeInvocation {
  if (typeof expectedOrigin !== 'string' || !ORIGIN_PATTERN.test(expectedOrigin)) {
    return fail('native_invalid_invocation');
  }
  const args = exactInvocationArgs(argv);
  if (args[0] !== expectedOrigin) return fail('native_invalid_invocation');
  let parentWindow: string | null = null;
  if (args.length === 2) {
    const match = PARENT_WINDOW_PATTERN.exec(args[1]);
    if (!match) return fail('native_invalid_invocation');
    parentWindow = match[1];
  }
  return Object.freeze({ origin: expectedOrigin, parentWindow });
}

function decodeRequest(body: Buffer): NativeWakeRequest {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch (_error) {
    return fail('native_invalid_utf8');
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (_error) {
    return fail('native_invalid_json');
  }
  return validateNativeWakeRequest(value);
}

function readNativeLength(header: Buffer): number {
  return endianness() === 'LE'
    ? header.readUInt32LE(0)
    : header.readUInt32BE(0);
}

type NativeReadable = NodeJS.ReadableStream & {
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
};

type NativeReadOptions = Readonly<{
  settleMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}>;

export function readNativeWakeRequest(
  input: NativeReadable,
  options: NativeReadOptions = {},
): Promise<NativeWakeRequest | null> {
  const settleMs = options.settleMs ?? DEFAULT_TRAILING_SETTLE_MS;
  if (!Number.isSafeInteger(settleMs) || settleMs < 0 || settleMs > 1000) {
    return Promise.reject(new NativeHostProtocolError('native_invalid_settle'));
  }
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(NATIVE_HEADER_BYTES);
    let headerOffset = 0;
    let body: Buffer | null = null;
    let bodyOffset = 0;
    let request: NativeWakeRequest | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      input.removeListener('data', onData as (...args: never[]) => void);
      input.removeListener('end', onEnd as (...args: never[]) => void);
      input.removeListener('error', onError as (...args: never[]) => void);
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    };
    const finish = (value: NativeWakeRequest | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectWith = (code: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new NativeHostProtocolError(code));
    };
    const armSettle = () => {
      if (timer !== null || !request) return;
      timer = setTimer(() => finish(request), settleMs);
    };
    const consume = (chunk: Buffer) => {
      let offset = 0;
      while (offset < chunk.length) {
        if (request) return rejectWith('native_trailing_data');
        if (headerOffset < NATIVE_HEADER_BYTES) {
          const count = Math.min(NATIVE_HEADER_BYTES - headerOffset, chunk.length - offset);
          chunk.copy(header, headerOffset, offset, offset + count);
          headerOffset += count;
          offset += count;
          if (headerOffset < NATIVE_HEADER_BYTES) continue;
          const length = readNativeLength(header);
          if (length === 0 || length > NATIVE_HOST_MAX_FRAME_BYTES) {
            return rejectWith('native_invalid_length');
          }
          body = Buffer.alloc(length);
        }
        if (!body) return rejectWith('native_invalid_length');
        const count = Math.min(body.length - bodyOffset, chunk.length - offset);
        chunk.copy(body, bodyOffset, offset, offset + count);
        bodyOffset += count;
        offset += count;
        if (bodyOffset === body.length) {
          try {
            request = decodeRequest(body);
          } catch (error) {
            const code = error instanceof NativeHostProtocolError
              ? error.code
              : 'native_invalid_request';
            return rejectWith(code);
          }
          if (offset < chunk.length) return rejectWith('native_trailing_data');
          armSettle();
        }
      }
    };
    const onData = (value: unknown) => {
      if (settled) return;
      if (!(value instanceof Uint8Array)) return rejectWith('native_invalid_chunk');
      consume(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    };
    const onEnd = () => {
      if (settled) return;
      if (request) return finish(request);
      if (headerOffset === 0) return finish(null);
      if (headerOffset < NATIVE_HEADER_BYTES) return rejectWith('native_truncated_header');
      return rejectWith('native_truncated_body');
    };
    const onError = () => rejectWith('native_stream_error');

    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
  });
}

function validateNativeWakeResponse(value: unknown): NativeWakeResponse {
  const fields = exactDataValues(
    value,
    ['v', 'correlationId', 'outcome', 'reason'],
    'native_invalid_response',
  );
  if (
    fields.v !== NATIVE_HOST_PROTOCOL_VERSION
    || !isCorrelationId(fields.correlationId)
    || typeof fields.outcome !== 'string'
    || !Object.hasOwn(OUTCOME_REASONS, fields.outcome)
    || typeof fields.reason !== 'string'
  ) {
    return fail('native_invalid_response');
  }
  const reasons = OUTCOME_REASONS[fields.outcome as keyof typeof OUTCOME_REASONS];
  if (!(reasons as readonly string[]).includes(fields.reason)) {
    return fail('native_invalid_response');
  }
  return Object.freeze({
    v: 1,
    correlationId: fields.correlationId,
    outcome: fields.outcome as NativeWakeResponse['outcome'],
    reason: fields.reason as NativeWakeReason,
  });
}

export function encodeNativeWakeResponse(
  value: unknown,
  expectedCorrelationId: string,
): Buffer {
  const response = validateNativeWakeResponse(value);
  if (response.correlationId !== expectedCorrelationId) {
    return fail('native_correlation_mismatch');
  }
  const body = Buffer.from(JSON.stringify(response), 'utf8');
  if (body.length === 0 || body.length > NATIVE_HOST_MAX_FRAME_BYTES) {
    return fail('native_response_oversize');
  }
  const header = Buffer.alloc(NATIVE_HEADER_BYTES);
  if (endianness() === 'LE') header.writeUInt32LE(body.length, 0);
  else header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body], header.length + body.length);
}
