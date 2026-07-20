import { z } from 'zod';
import {
  CLAUDE_CODE_ADAPTER_ID,
  OPENCODE_ADAPTER_ID,
  type AgentEvent,
  type AgentEventType,
  type AgentProviderId,
} from './adapter.js';

export const AGENT_STREAM_LINE_LIMIT_BYTES = 256 * 1024;
export const AGENT_STREAM_LIMIT_BYTES = 2 * 1024 * 1024;
export const AGENT_STREAM_EVENT_LIMIT = 4_096;
export const AGENT_STREAM_ISSUE_PATH_LIMIT = 16;
export const AGENT_STREAM_ISSUE_PATH_BYTES = 128;
export const AGENT_STREAM_SESSION_ID_BYTES = 256;

const CLAUDE_PROTOCOL_DRIFT_REASONS = Object.freeze([
  'configuration_surface',
  'duplicate_init',
  'duplicate_result',
  'event_after_result',
  'event_before_init',
  'invalid_json',
  'invalid_shape',
  'invalid_utf8',
  'line_too_large',
  'missing_result',
  'session_mismatch',
  'unknown_event_type',
  'unknown_stream_event',
  'unknown_system_subtype',
] as const);

const OPENCODE_PROTOCOL_DRIFT_REASONS = Object.freeze([
  'counter_overflow',
  'duplicate_id',
  'duplicate_result',
  'event_after_result',
  'event_before_init',
  'invalid_json',
  'invalid_order',
  'invalid_shape',
  'invalid_utf8',
  'line_too_large',
  'missing_result',
  'provider_error',
  'session_mismatch',
  'stream_too_large',
  'unknown_event_type',
] as const);

export const AGENT_PROTOCOL_DRIFT_REASONS = Object.freeze({
  [CLAUDE_CODE_ADAPTER_ID]: CLAUDE_PROTOCOL_DRIFT_REASONS,
  [OPENCODE_ADAPTER_ID]: OPENCODE_PROTOCOL_DRIFT_REASONS,
});

export type ClaudeProtocolDriftReason = typeof CLAUDE_PROTOCOL_DRIFT_REASONS[number];
export type OpenCodeProtocolDriftReason = typeof OPENCODE_PROTOCOL_DRIFT_REASONS[number];
export type AgentProtocolDriftReason = ClaudeProtocolDriftReason | OpenCodeProtocolDriftReason;

const SAFE_ISSUE_PATH_SEGMENTS = new Set([
  'attachments',
  'attempt',
  'cache',
  'callID',
  'compacted',
  'content',
  'cost',
  'end',
  'error',
  'event',
  'hooks',
  'id',
  'ignored',
  'input',
  'is_error',
  'max_retries',
  'mcp_servers',
  'message',
  'messageID',
  'metadata',
  'name',
  'output',
  'part',
  'plugins',
  'reason',
  'reasoning',
  'retry_delay_ms',
  'session_id',
  'sessionID',
  'snapshot',
  'start',
  'state',
  'status',
  'subtype',
  'synthetic',
  'text',
  'time',
  'timestamp',
  'title',
  'tokens',
  'tool',
  'tools',
  'total',
  'type',
  'write',
  'read',
]);

function boundedEventIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return 1;
  return Math.min(value, AGENT_STREAM_EVENT_LIMIT + 1);
}

function boundedIssuePath(value: string): string {
  const segments = value.split('.').filter(Boolean);
  if (
    segments.length === 0
    || segments.some((segment) => !/^\d+$/.test(segment) && !SAFE_ISSUE_PATH_SEGMENTS.has(segment))
  ) {
    return 'shape';
  }
  return segments.join('.').slice(0, AGENT_STREAM_ISSUE_PATH_BYTES);
}

function providerReasons(providerId: AgentProviderId): readonly AgentProtocolDriftReason[] {
  return AGENT_PROTOCOL_DRIFT_REASONS[providerId];
}

export class AgentProtocolDriftError extends Error {
  readonly code = 'agent_protocol_drift' as const;
  readonly providerId: AgentProviderId;
  readonly eventIndex: number;
  readonly reason: AgentProtocolDriftReason;
  readonly issuePaths: readonly string[];

  constructor(
    reason: AgentProtocolDriftReason,
    eventIndex: number,
    issuePaths: readonly string[] = [],
    providerId: AgentProviderId = CLAUDE_CODE_ADAPTER_ID,
  ) {
    if (!providerReasons(providerId).includes(reason)) {
      throw new TypeError('Invalid provider protocol drift reason');
    }
    const safeIndex = boundedEventIndex(eventIndex);
    const safePaths = issuePaths
      .slice(0, AGENT_STREAM_ISSUE_PATH_LIMIT)
      .map((value) => boundedIssuePath(String(value)));
    const providerLabel = providerId === CLAUDE_CODE_ADAPTER_ID ? 'Claude' : 'OpenCode';
    super(`${providerLabel} stream protocol drift at event ${safeIndex}: ${reason}`);
    this.name = 'AgentProtocolDriftError';
    this.providerId = providerId;
    this.reason = reason;
    this.eventIndex = safeIndex;
    this.issuePaths = Object.freeze(safePaths);
  }
}

export function isExactOwnDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return false;
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  if (ownKeys.some((key) => !allowed.has(key as string))) return false;
  if (requiredKeys.some((key) => !Object.hasOwn(value, key))) return false;
  return ownKeys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

export function asPlainDataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return null;
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return null;
  }
  return value as Record<string, unknown>;
}

function issuePaths(error: z.ZodError): string[] {
  return error.issues
    .map((issue) => issue.path.map(String).join('.'))
    .filter(Boolean);
}

export function parseAgentShape<T>(
  schema: z.ZodType<T>,
  value: unknown,
  eventIndex: number,
  providerId: AgentProviderId,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AgentProtocolDriftError('invalid_shape', eventIndex, issuePaths(parsed.error), providerId);
  }
  return parsed.data;
}

function deepFreezeJson<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreezeJson(item);
    return Object.freeze(value) as T;
  }
  for (const item of Object.values(value as Record<string, unknown>)) deepFreezeJson(item);
  return Object.freeze(value) as T;
}

const AGENT_EVENT_TYPES = new Set<AgentEventType>([
  'init',
  'assistant',
  'assistant_delta',
  'user',
  'tool_use',
  'tool_result',
  'retry',
  'result',
  'diagnostic',
]);

export function freezeAgentEvent(
  type: AgentEventType,
  sessionId: string,
  payload: Record<string, unknown>,
): AgentEvent {
  if (
    !AGENT_EVENT_TYPES.has(type)
    || sessionId.length < 1
    || sessionId.length > AGENT_STREAM_SESSION_ID_BYTES
    || asPlainDataRecord(payload) === null
  ) {
    throw new TypeError('Invalid normalized agent event');
  }
  const frozenPayload = deepFreezeJson({ ...payload });
  return Object.freeze({ type, sessionId, payload: frozenPayload });
}

export function decodeAgentJsonLine(
  line: Buffer,
  eventIndex: number,
  providerId: AgentProviderId,
): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(line);
  } catch {
    throw new AgentProtocolDriftError('invalid_utf8', eventIndex, [], providerId);
  }
  if (text.length === 0) {
    throw new AgentProtocolDriftError('invalid_json', eventIndex, [], providerId);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AgentProtocolDriftError('invalid_json', eventIndex, [], providerId);
  }
}

export function appendBoundedAgentLine(
  pending: Buffer,
  addition: Buffer,
  eventIndex: number,
  providerId: AgentProviderId,
  limitBytes = AGENT_STREAM_LINE_LIMIT_BYTES,
): Buffer {
  const combinedLength = pending.length + addition.length;
  const lastByte = addition.length > 0
    ? addition[addition.length - 1]
    : pending[pending.length - 1];
  const crlfBoundaryOnly = combinedLength === limitBytes + 1 && lastByte === 0x0d;
  if (combinedLength > limitBytes && !crlfBoundaryOnly) {
    throw new AgentProtocolDriftError('line_too_large', eventIndex, [], providerId);
  }
  if (pending.length === 0) return Buffer.from(addition);
  if (addition.length === 0) return pending;
  return Buffer.concat([pending, addition], combinedLength);
}
