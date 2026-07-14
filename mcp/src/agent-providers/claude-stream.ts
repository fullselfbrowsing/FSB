import { z } from 'zod';
import type { AgentEvent, AgentEventType } from './adapter.js';

export const CLAUDE_STREAM_LINE_LIMIT_BYTES = 256 * 1024;

const SESSION_ID_LIMIT = 256;
const KNOWN_STREAM_EVENT_TYPES = new Set([
  'content_block_delta',
  'content_block_start',
  'content_block_stop',
  'message_delta',
  'message_start',
  'message_stop',
]);

function isCustomizationEventName(value: unknown): boolean {
  return typeof value === 'string' && /^(?:hook|plugin)(?:_|$)/.test(value);
}

const UnknownRecordSchema = z.record(z.unknown());

const AgentEventSchema = z.object({
  type: z.enum([
    'init',
    'assistant',
    'assistant_delta',
    'user',
    'tool_use',
    'tool_result',
    'retry',
    'result',
    'diagnostic',
  ]),
  sessionId: z.string().min(1).max(SESSION_ID_LIMIT),
  payload: UnknownRecordSchema,
}).strict();

const McpServerSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    status: z.string().min(1).optional(),
  }).passthrough(),
]);

const InitSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  session_id: z.string().min(1).max(SESSION_ID_LIMIT),
  tools: z.array(z.string()).max(256),
  mcp_servers: z.array(McpServerSchema).max(16),
  plugins: z.array(z.unknown()).max(256).optional(),
  hooks: z.array(z.unknown()).max(256).optional(),
}).passthrough();

const MessageSchema = z.object({
  content: z.array(z.unknown()),
}).passthrough();

const AssistantSchema = z.object({
  type: z.literal('assistant'),
  session_id: z.string().min(1).max(SESSION_ID_LIMIT),
  message: MessageSchema,
}).passthrough();

const UserSchema = z.object({
  type: z.literal('user'),
  session_id: z.string().min(1).max(SESSION_ID_LIMIT),
  message: MessageSchema,
}).passthrough();

const StreamEventSchema = z.object({
  type: z.literal('stream_event'),
  session_id: z.string().min(1).max(SESSION_ID_LIMIT),
  event: z.object({
    type: z.string().min(1),
  }).passthrough(),
}).passthrough();

const RetrySchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('api_retry'),
  session_id: z.string().min(1).max(SESSION_ID_LIMIT).optional(),
  attempt: z.number().int().nonnegative(),
  max_retries: z.number().int().nonnegative(),
  retry_delay_ms: z.number().nonnegative(),
}).passthrough();

const ResultSchema = z.object({
  type: z.literal('result'),
  subtype: z.string().min(1),
  session_id: z.string().min(1).max(SESSION_ID_LIMIT),
  is_error: z.boolean(),
}).passthrough();

type DriftReason =
  | 'configuration_surface'
  | 'duplicate_init'
  | 'duplicate_result'
  | 'event_after_result'
  | 'event_before_init'
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_utf8'
  | 'line_too_large'
  | 'missing_result'
  | 'session_mismatch'
  | 'unknown_event_type'
  | 'unknown_stream_event'
  | 'unknown_system_subtype';

export class AgentProtocolDriftError extends Error {
  readonly code = 'agent_protocol_drift' as const;
  readonly eventIndex: number;
  readonly reason: DriftReason;
  readonly issuePaths: readonly string[];

  constructor(reason: DriftReason, eventIndex: number, issuePaths: readonly string[] = []) {
    super(`Claude stream protocol drift at event ${eventIndex}: ${reason}`);
    this.name = 'AgentProtocolDriftError';
    this.reason = reason;
    this.eventIndex = eventIndex;
    this.issuePaths = Object.freeze([...issuePaths]);
  }
}

function issuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.map(String).join('.')).filter(Boolean);
}

function parseShape<T>(schema: z.ZodType<T>, value: unknown, eventIndex: number): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AgentProtocolDriftError('invalid_shape', eventIndex, issuePaths(parsed.error));
  }
  return parsed.data;
}

function freezeEvent(
  type: AgentEventType,
  sessionId: string,
  payload: Record<string, unknown>,
): AgentEvent {
  const candidate = {
    type,
    sessionId,
    payload: Object.freeze({ ...payload }),
  };
  const parsed = AgentEventSchema.parse(candidate);
  return Object.freeze({
    ...parsed,
    payload: Object.freeze(parsed.payload),
  }) as AgentEvent;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function contentBlocks(message: { content?: unknown }): readonly Record<string, unknown>[] {
  if (!Array.isArray(message.content)) return [];
  return message.content.map(record).filter((item): item is Record<string, unknown> => item !== null);
}

function serverName(server: z.infer<typeof McpServerSchema>): string {
  return typeof server === 'string' ? server : server.name;
}

function attestInit(init: z.infer<typeof InitSchema>, eventIndex: number): void {
  const toolSurfaceOk = init.tools.every(
    (tool) => tool === 'mcp__fsb' || tool.startsWith('mcp__fsb__'),
  );
  const serverNames = init.mcp_servers.map(serverName);
  const mcpSurfaceOk = serverNames.length === 1 && serverNames[0] === 'fsb';
  const soleServer = init.mcp_servers[0];
  const serverStatus = !soleServer || typeof soleServer === 'string'
    ? null
    : soleServer.status ?? null;
  const serverReady = serverStatus === null || !/failed|error|disconnected/i.test(serverStatus);
  if (
    init.tools.length === 0
    || !toolSurfaceOk
    || !mcpSurfaceOk
    || !serverReady
    || (init.plugins?.length ?? 0) !== 0
    || (init.hooks?.length ?? 0) !== 0
  ) {
    throw new AgentProtocolDriftError('configuration_surface', eventIndex);
  }
}

class ClaudeEventNormalizer {
  private sessionId: string | null = null;
  private terminal = false;

  normalize(value: unknown, eventIndex: number): readonly AgentEvent[] {
    const envelope = record(value);
    if (!envelope || typeof envelope.type !== 'string') {
      throw new AgentProtocolDriftError('invalid_shape', eventIndex);
    }
    if (this.terminal) {
      throw new AgentProtocolDriftError(
        envelope.type === 'result' ? 'duplicate_result' : 'event_after_result',
        eventIndex,
      );
    }

    switch (envelope.type) {
      case 'system':
        return this.normalizeSystem(envelope, eventIndex);
      case 'assistant':
        return this.normalizeAssistant(envelope, eventIndex);
      case 'user':
        return this.normalizeUser(envelope, eventIndex);
      case 'stream_event':
        return this.normalizeStreamEvent(envelope, eventIndex);
      case 'result':
        return this.normalizeResult(envelope, eventIndex);
      default:
        if (isCustomizationEventName(envelope.type)) {
          throw new AgentProtocolDriftError('configuration_surface', eventIndex);
        }
        throw new AgentProtocolDriftError('unknown_event_type', eventIndex);
    }
  }

  finish(nextEventIndex: number): void {
    if (!this.terminal) {
      throw new AgentProtocolDriftError('missing_result', nextEventIndex);
    }
  }

  private requireSession(candidate: string | undefined, eventIndex: number): string {
    if (!this.sessionId) {
      throw new AgentProtocolDriftError('event_before_init', eventIndex);
    }
    if (candidate !== undefined && candidate !== this.sessionId) {
      throw new AgentProtocolDriftError('session_mismatch', eventIndex);
    }
    return this.sessionId;
  }

  private normalizeSystem(envelope: Record<string, unknown>, eventIndex: number): AgentEvent[] {
    if (envelope.subtype === 'init') {
      if (this.sessionId) throw new AgentProtocolDriftError('duplicate_init', eventIndex);
      const init = parseShape(InitSchema, envelope, eventIndex);
      attestInit(init, eventIndex);
      this.sessionId = init.session_id;
      return [freezeEvent('init', init.session_id, init)];
    }
    if (envelope.subtype === 'api_retry') {
      const retry = parseShape(RetrySchema, envelope, eventIndex);
      const sessionId = this.requireSession(retry.session_id, eventIndex);
      return [freezeEvent('retry', sessionId, retry)];
    }
    if (isCustomizationEventName(envelope.subtype)) {
      throw new AgentProtocolDriftError('configuration_surface', eventIndex);
    }
    throw new AgentProtocolDriftError('unknown_system_subtype', eventIndex);
  }

  private normalizeAssistant(envelope: Record<string, unknown>, eventIndex: number): AgentEvent[] {
    const assistant = parseShape(AssistantSchema, envelope, eventIndex);
    const sessionId = this.requireSession(assistant.session_id, eventIndex);
    const events: AgentEvent[] = [freezeEvent('assistant', sessionId, assistant)];
    for (const block of contentBlocks(assistant.message)) {
      if (block.type === 'tool_use') {
        if (typeof block.id !== 'string' || typeof block.name !== 'string' || !record(block.input)) {
          throw new AgentProtocolDriftError('invalid_shape', eventIndex, ['message.content.tool_use']);
        }
        events.push(freezeEvent('tool_use', sessionId, block));
      }
    }
    return events;
  }

  private normalizeUser(envelope: Record<string, unknown>, eventIndex: number): AgentEvent[] {
    const user = parseShape(UserSchema, envelope, eventIndex);
    const sessionId = this.requireSession(user.session_id, eventIndex);
    const events: AgentEvent[] = [freezeEvent('user', sessionId, user)];
    for (const block of contentBlocks(user.message)) {
      if (block.type === 'tool_result') {
        if (typeof block.tool_use_id !== 'string') {
          throw new AgentProtocolDriftError('invalid_shape', eventIndex, ['message.content.tool_result']);
        }
        events.push(freezeEvent('tool_result', sessionId, block));
      }
    }
    return events;
  }

  private normalizeStreamEvent(envelope: Record<string, unknown>, eventIndex: number): AgentEvent[] {
    const streamEvent = parseShape(StreamEventSchema, envelope, eventIndex);
    const sessionId = this.requireSession(streamEvent.session_id, eventIndex);
    if (!KNOWN_STREAM_EVENT_TYPES.has(streamEvent.event.type)) {
      throw new AgentProtocolDriftError('unknown_stream_event', eventIndex);
    }
    return [freezeEvent('assistant_delta', sessionId, streamEvent)];
  }

  private normalizeResult(envelope: Record<string, unknown>, eventIndex: number): AgentEvent[] {
    if (this.terminal) throw new AgentProtocolDriftError('duplicate_result', eventIndex);
    const result = parseShape(ResultSchema, envelope, eventIndex);
    const sessionId = this.requireSession(result.session_id, eventIndex);
    this.terminal = true;
    return [freezeEvent('result', sessionId, result)];
  }
}

function decodeLine(line: Buffer, eventIndex: number): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(line);
  } catch {
    throw new AgentProtocolDriftError('invalid_utf8', eventIndex);
  }
  if (text.length === 0) {
    throw new AgentProtocolDriftError('invalid_json', eventIndex);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AgentProtocolDriftError('invalid_json', eventIndex);
  }
}

function appendBounded(pending: Buffer, addition: Buffer, eventIndex: number): Buffer {
  if (pending.length + addition.length > CLAUDE_STREAM_LINE_LIMIT_BYTES) {
    throw new AgentProtocolDriftError('line_too_large', eventIndex);
  }
  if (pending.length === 0) return Buffer.from(addition);
  if (addition.length === 0) return pending;
  return Buffer.concat([pending, addition], pending.length + addition.length);
}

export async function* parseClaudeEvents(stream: NodeJS.ReadableStream): AsyncIterable<AgentEvent> {
  const iterable = stream as NodeJS.ReadableStream & AsyncIterable<Buffer | string>;
  if (typeof iterable[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Claude event stream must be async iterable');
  }

  const normalizer = new ClaudeEventNormalizer();
  let pending: Buffer = Buffer.alloc(0);
  let eventIndex = 1;

  for await (const input of iterable) {
    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline === -1) {
        pending = appendBounded(pending, chunk.subarray(offset), eventIndex);
        break;
      }
      pending = appendBounded(pending, chunk.subarray(offset, newline), eventIndex);
      const line = pending.length > 0 && pending[pending.length - 1] === 0x0d
        ? pending.subarray(0, pending.length - 1)
        : pending;
      const decoded = decodeLine(line, eventIndex);
      for (const event of normalizer.normalize(decoded, eventIndex)) yield event;
      eventIndex += 1;
      pending = Buffer.alloc(0);
      offset = newline + 1;
    }
  }

  if (pending.length > 0) {
    const line = pending[pending.length - 1] === 0x0d
      ? pending.subarray(0, pending.length - 1)
      : pending;
    const decoded = decodeLine(line, eventIndex);
    for (const event of normalizer.normalize(decoded, eventIndex)) yield event;
    eventIndex += 1;
  }

  normalizer.finish(eventIndex);
}
