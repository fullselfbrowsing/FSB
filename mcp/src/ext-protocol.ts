import type { ExtError, ExtMessage, ExtResponse } from './types.js';

export const EXT_ERROR_CODES = Object.freeze([
  'agent_provider_offline',
  'bridge_topology_changed',
  'ext_unauthorized',
  'invalid_ext_request',
  'ext_request_timeout',
] as const);

export const EXT_FRAME_LIMITS = Object.freeze({
  idLength: 200,
  methodLength: 128,
  eventLength: 128,
  errorMessageLength: 300,
  payloadKeys: 100,
} as const);

const NAME_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/;
const CONTROL_PLANE_KEYS = new Set([
  'secret',
  'token',
  'flags',
  'argv',
  'command',
  'cwd',
  'env',
]);
const REQUEST_KEYS = new Set(['id', 'type', 'method', 'payload']);
const EVENT_KEYS = new Set(['id', 'type', 'event', 'payload']);
const RESPONSE_KEYS = new Set(['id', 'type', 'payload', 'error']);
const ERROR_KEYS = new Set(['code', 'message', 'retryable']);
const ERROR_CODE_SET = new Set<string>(EXT_ERROR_CODES);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasControlPlaneKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => CONTROL_PLANE_KEYS.has(key));
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= EXT_FRAME_LIMITS.idLength;
}

function isValidName(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength && NAME_PATTERN.test(value);
}

function isValidPayload(value: unknown): value is Record<string, unknown> {
  return isPlainRecord(value) && Object.keys(value).length <= EXT_FRAME_LIMITS.payloadKeys;
}

function isValidError(value: unknown): value is ExtError {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ERROR_KEYS)) return false;
  return typeof value.code === 'string'
    && ERROR_CODE_SET.has(value.code)
    && typeof value.message === 'string'
    && value.message.length > 0
    && value.message.length <= EXT_FRAME_LIMITS.errorMessageLength
    && typeof value.retryable === 'boolean';
}

export function parseExtFrame(raw: unknown): ExtMessage | null {
  if (!isPlainRecord(raw) || hasControlPlaneKey(raw)) return null;
  if (!isValidId(raw.id) || typeof raw.type !== 'string') return null;

  if (raw.type === 'ext:request') {
    if (!hasOnlyKeys(raw, REQUEST_KEYS)) return null;
    if (!isValidName(raw.method, EXT_FRAME_LIMITS.methodLength) || !isValidPayload(raw.payload)) return null;
    return { id: raw.id, type: raw.type, method: raw.method, payload: raw.payload };
  }

  if (raw.type === 'ext:event') {
    if (!hasOnlyKeys(raw, EVENT_KEYS)) return null;
    if (!isValidName(raw.event, EXT_FRAME_LIMITS.eventLength) || !isValidPayload(raw.payload)) return null;
    return { id: raw.id, type: raw.type, event: raw.event, payload: raw.payload };
  }

  if (raw.type === 'ext:response') {
    if (!hasOnlyKeys(raw, RESPONSE_KEYS)) return null;
    const hasPayload = Object.prototype.hasOwnProperty.call(raw, 'payload');
    const hasError = Object.prototype.hasOwnProperty.call(raw, 'error');
    if (hasPayload === hasError) return null;
    if (hasPayload) {
      if (!isValidPayload(raw.payload)) return null;
      return { id: raw.id, type: raw.type, payload: raw.payload };
    }
    if (!isValidError(raw.error)) return null;
    return { id: raw.id, type: raw.type, error: raw.error };
  }

  return null;
}

export function makeExtError(
  id: string,
  code: ExtError['code'],
  message: string,
  retryable: boolean,
): ExtResponse {
  return {
    id,
    type: 'ext:response',
    error: { code, message, retryable },
  };
}
