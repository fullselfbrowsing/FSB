import { z } from 'zod';
import { CODEX_ADAPTER_ID, type AgentEvent } from './adapter.js';
import { CODEX_ALLOWED_MCP_TOOLS } from './codex-profile.js';
import {
  AGENT_STREAM_EVENT_LIMIT,
  AGENT_STREAM_LINE_LIMIT_BYTES,
  AGENT_STREAM_LIMIT_BYTES,
  AgentProtocolDriftError,
  appendBoundedAgentLine,
  asPlainDataRecord,
  decodeAgentJsonLine,
  freezeAgentEvent,
  parseAgentShape,
  type CodexProtocolDriftReason,
} from './protocol-drift.js';

export { AgentProtocolDriftError } from './protocol-drift.js';

export const CODEX_STREAM_LINE_LIMIT_BYTES = AGENT_STREAM_LINE_LIMIT_BYTES;
export const CODEX_STREAM_LIMIT_BYTES = AGENT_STREAM_LIMIT_BYTES;

const IDENTIFIER_LIMIT_BYTES = 256;
const TEXT_LIMIT_BYTES = 64 * 1024;
const JSON_STRING_LIMIT_BYTES = 128 * 1024;
const JSON_DEPTH_LIMIT = 8;
const JSON_NODE_LIMIT = 4_096;
const JSON_RECORD_KEY_LIMIT = 256;
const JSON_ARRAY_LENGTH_LIMIT = 256;
const TODO_ITEM_LIMIT = 256;

function boundedString(maxBytes: number, allowEmpty = false): z.ZodType<string> {
  return z.string().refine(
    (value) => (allowEmpty || value.length > 0) && Buffer.byteLength(value, 'utf8') <= maxBytes,
    'bounded utf8 string',
  );
}

const IdentifierSchema = boundedString(IDENTIFIER_LIMIT_BYTES).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value),
  'control-free identifier',
);
const TextSchema = boundedString(TEXT_LIMIT_BYTES, true);
const SafeTokenSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const UsageSchema = z.object({
  input_tokens: SafeTokenSchema,
  cached_input_tokens: SafeTokenSchema,
  output_tokens: SafeTokenSchema,
  reasoning_output_tokens: SafeTokenSchema,
}).strict().refine(
  (usage) => usage.cached_input_tokens <= usage.input_tokens
    && usage.reasoning_output_tokens <= usage.output_tokens,
  { path: ['input_tokens'] },
);
const ThreadStartedSchema = z.object({
  type: z.literal('thread.started'),
  thread_id: IdentifierSchema,
}).strict();
const TurnStartedSchema = z.object({ type: z.literal('turn.started') }).strict();
const TurnCompletedSchema = z.object({
  type: z.literal('turn.completed'),
  usage: UsageSchema,
}).strict();
const ItemEnvelopeSchema = z.object({
  type: z.enum(['item.started', 'item.updated', 'item.completed']),
  item: z.unknown(),
}).strict();

const AgentMessageSchema = z.object({
  id: IdentifierSchema,
  type: z.literal('agent_message'),
  text: TextSchema,
}).strict();
const ReasoningSchema = z.object({
  id: IdentifierSchema,
  type: z.literal('reasoning'),
  text: TextSchema,
}).strict();
const TodoItemSchema = z.object({
  text: TextSchema,
  completed: z.boolean(),
}).strict();
const TodoListSchema = z.object({
  id: IdentifierSchema,
  type: z.literal('todo_list'),
  items: z.array(TodoItemSchema).max(TODO_ITEM_LIMIT),
}).strict();
const McpResultSchema = z.object({
  content: z.array(z.unknown()).max(JSON_ARRAY_LENGTH_LIMIT),
  _meta: z.unknown().optional(),
  structured_content: z.unknown().nullable(),
}).strict();
const McpToolCallSchema = z.object({
  id: IdentifierSchema,
  type: z.literal('mcp_tool_call'),
  server: IdentifierSchema,
  tool: IdentifierSchema,
  arguments: z.unknown(),
  result: McpResultSchema.nullable(),
  error: z.object({ message: TextSchema }).strict().nullable(),
  status: z.enum(['in_progress', 'completed', 'failed']),
}).strict();

interface JsonBudget {
  nodes: number;
}

function validateBoundedJson(
  value: unknown,
  eventIndex: number,
  path = 'event',
  depth = 0,
  budget: JsonBudget = { nodes: 0 },
): void {
  budget.nodes += 1;
  if (depth > JSON_DEPTH_LIMIT || budget.nodes > JSON_NODE_LIMIT) {
    throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], CODEX_ADAPTER_ID);
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new AgentProtocolDriftError('invalid_shape', eventIndex, [path], CODEX_ADAPTER_ID);
    }
    return;
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > JSON_STRING_LIMIT_BYTES) {
      throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], CODEX_ADAPTER_ID);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > JSON_ARRAY_LENGTH_LIMIT || Object.keys(value).length !== value.length) {
      throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], CODEX_ADAPTER_ID);
    }
    value.forEach((item, index) => {
      validateBoundedJson(item, eventIndex, `${path}.${index}`, depth + 1, budget);
    });
    return;
  }
  const record = asPlainDataRecord(value);
  if (!record) {
    throw new AgentProtocolDriftError('invalid_shape', eventIndex, [path], CODEX_ADAPTER_ID);
  }
  const keys = Object.keys(record);
  if (keys.length > JSON_RECORD_KEY_LIMIT) {
    throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], CODEX_ADAPTER_ID);
  }
  for (const key of keys) {
    if (
      Buffer.byteLength(key, 'utf8') > IDENTIFIER_LIMIT_BYTES
      || /[\u0000-\u001f\u007f]/.test(key)
    ) throw new AgentProtocolDriftError('invalid_shape', eventIndex, [path], CODEX_ADAPTER_ID);
    validateBoundedJson(record[key], eventIndex, path, depth + 1, budget);
  }
}

interface OpenMcpCall {
  readonly id: string;
  readonly server: 'fsb';
  readonly tool: typeof CODEX_ALLOWED_MCP_TOOLS[number];
}

class CodexEventNormalizer {
  private sessionId: string | null = null;
  private turnStarted = false;
  private candidate: AgentEvent | null = null;
  private readonly seenItemIds = new Set<string>();
  private openMcp: OpenMcpCall | null = null;
  private openTodoId: string | null = null;

  normalize(value: unknown, eventIndex: number): readonly AgentEvent[] {
    validateBoundedJson(value, eventIndex);
    const envelope = asPlainDataRecord(value);
    if (!envelope || typeof envelope.type !== 'string') throw this.drift('invalid_shape', eventIndex);
    if (this.candidate) {
      throw this.drift(
        envelope.type === 'turn.completed' ? 'duplicate_result' : 'event_after_result',
        eventIndex,
      );
    }
    if (!this.sessionId && envelope.type !== 'thread.started') {
      throw this.drift('event_before_init', eventIndex);
    }
    switch (envelope.type) {
      case 'thread.started':
        return this.threadStarted(value, eventIndex);
      case 'turn.started':
        return this.turnStartedEvent(value, eventIndex);
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        return this.itemEvent(value, eventIndex);
      case 'turn.completed':
        return this.turnCompleted(value, eventIndex);
      case 'turn.failed':
      case 'error':
        throw this.drift('provider_error', eventIndex);
      default:
        throw this.drift('unknown_event_type', eventIndex);
    }
  }

  finish(nextEventIndex: number): AgentEvent {
    if (!this.candidate) throw this.drift('missing_result', nextEventIndex);
    return this.candidate;
  }

  private drift(
    reason: CodexProtocolDriftReason,
    eventIndex: number,
    paths: readonly string[] = [],
  ): AgentProtocolDriftError {
    return new AgentProtocolDriftError(reason, eventIndex, paths, CODEX_ADAPTER_ID);
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown, eventIndex: number): T {
    return parseAgentShape(schema, value, eventIndex, CODEX_ADAPTER_ID);
  }

  private requireTurn(eventIndex: number): string {
    if (!this.sessionId) throw this.drift('event_before_init', eventIndex);
    if (!this.turnStarted) throw this.drift('invalid_order', eventIndex);
    return this.sessionId;
  }

  private addItemId(id: string, eventIndex: number): void {
    if (this.seenItemIds.has(id)) throw this.drift('duplicate_id', eventIndex);
    this.seenItemIds.add(id);
    if (this.seenItemIds.size > AGENT_STREAM_EVENT_LIMIT) {
      throw this.drift('counter_overflow', eventIndex);
    }
  }

  private threadStarted(value: unknown, eventIndex: number): readonly AgentEvent[] {
    const event = this.parse(ThreadStartedSchema, value, eventIndex);
    if (this.sessionId) throw this.drift('duplicate_init', eventIndex);
    this.sessionId = event.thread_id;
    return [freezeAgentEvent('init', event.thread_id, { threadId: event.thread_id })];
  }

  private turnStartedEvent(value: unknown, eventIndex: number): readonly AgentEvent[] {
    this.parse(TurnStartedSchema, value, eventIndex);
    if (!this.sessionId) throw this.drift('event_before_init', eventIndex);
    if (this.turnStarted) throw this.drift('invalid_order', eventIndex);
    this.turnStarted = true;
    return [];
  }

  private itemEvent(value: unknown, eventIndex: number): readonly AgentEvent[] {
    const envelope = this.parse(ItemEnvelopeSchema, value, eventIndex);
    const sessionId = this.requireTurn(eventIndex);
    const item = asPlainDataRecord(envelope.item);
    if (!item || typeof item.type !== 'string') throw this.drift('invalid_shape', eventIndex);
    if (envelope.type === 'item.started') {
      if (item.type === 'mcp_tool_call') {
        const call = this.parse(McpToolCallSchema, item, eventIndex);
        if (
          call.status !== 'in_progress'
          || call.result !== null
          || call.error !== null
          || call.server !== 'fsb'
          || !(CODEX_ALLOWED_MCP_TOOLS as readonly string[]).includes(call.tool)
        ) throw this.drift('provider_error', eventIndex);
        if (this.openMcp) throw this.drift('invalid_order', eventIndex);
        this.addItemId(call.id, eventIndex);
        this.openMcp = Object.freeze({
          id: call.id,
          server: 'fsb',
          tool: call.tool as OpenMcpCall['tool'],
        });
        return [freezeAgentEvent('tool_use', sessionId, {
          id: call.id,
          name: `mcp__fsb__${call.tool}`,
        })];
      }
      if (item.type === 'todo_list') {
        const todo = this.parse(TodoListSchema, item, eventIndex);
        if (this.openTodoId) throw this.drift('invalid_order', eventIndex);
        this.addItemId(todo.id, eventIndex);
        this.openTodoId = todo.id;
        return [];
      }
      if (item.type === 'agent_message' || item.type === 'reasoning') {
        throw this.drift('invalid_order', eventIndex);
      }
      return this.rejectItemType(item.type, eventIndex);
    }

    if (envelope.type === 'item.updated') {
      if (item.type !== 'todo_list') return this.rejectItemType(item.type, eventIndex);
      const todo = this.parse(TodoListSchema, item, eventIndex);
      if (!this.openTodoId || todo.id !== this.openTodoId) {
        throw this.drift('invalid_order', eventIndex);
      }
      return [];
    }

    if (item.type === 'agent_message') {
      const message = this.parse(AgentMessageSchema, item, eventIndex);
      if (this.openMcp) throw this.drift('invalid_order', eventIndex);
      this.addItemId(message.id, eventIndex);
      return [freezeAgentEvent('assistant', sessionId, { text: message.text })];
    }
    if (item.type === 'reasoning') {
      const reasoning = this.parse(ReasoningSchema, item, eventIndex);
      this.addItemId(reasoning.id, eventIndex);
      return [];
    }
    if (item.type === 'todo_list') {
      const todo = this.parse(TodoListSchema, item, eventIndex);
      if (!this.openTodoId || todo.id !== this.openTodoId) {
        throw this.drift('invalid_order', eventIndex);
      }
      this.openTodoId = null;
      return [];
    }
    if (item.type === 'mcp_tool_call') {
      const call = this.parse(McpToolCallSchema, item, eventIndex);
      if (
        call.status !== 'completed'
        || call.result === null
        || call.error !== null
        || !this.openMcp
        || call.id !== this.openMcp.id
        || call.server !== this.openMcp.server
        || call.tool !== this.openMcp.tool
      ) {
        if (call.status === 'failed' || call.server !== 'fsb') {
          throw this.drift('provider_error', eventIndex);
        }
        throw this.drift('invalid_order', eventIndex);
      }
      this.openMcp = null;
      return [freezeAgentEvent('tool_result', sessionId, {
        tool_use_id: call.id,
        is_error: false,
      })];
    }
    return this.rejectItemType(item.type, eventIndex);
  }

  private rejectItemType(type: string, eventIndex: number): never {
    if ([
      'command_execution',
      'file_change',
      'web_search',
      'collab_tool_call',
      'error',
    ].includes(type)) throw this.drift('provider_error', eventIndex);
    throw this.drift('unknown_event_type', eventIndex);
  }

  private turnCompleted(value: unknown, eventIndex: number): readonly AgentEvent[] {
    const event = this.parse(TurnCompletedSchema, value, eventIndex);
    const sessionId = this.requireTurn(eventIndex);
    if (this.openMcp || this.openTodoId) throw this.drift('invalid_order', eventIndex);
    const usage = event.usage;
    const total = usage.input_tokens + usage.output_tokens;
    if (!Number.isSafeInteger(total)) throw this.drift('counter_overflow', eventIndex);
    this.candidate = freezeAgentEvent('result', sessionId, {
      subtype: 'success',
      is_error: false,
      candidate: true,
      cost: null,
      tokens: {
        total,
        input: usage.input_tokens,
        output: usage.output_tokens,
        reasoning: usage.reasoning_output_tokens,
        cache: {
          read: usage.cached_input_tokens,
          write: 0,
        },
      },
    });
    return [];
  }
}

function parseLine(
  normalizer: CodexEventNormalizer,
  line: Buffer,
  eventIndex: number,
): readonly AgentEvent[] {
  const value = decodeAgentJsonLine(line, eventIndex, CODEX_ADAPTER_ID);
  return normalizer.normalize(value, eventIndex);
}

export async function* parseCodexEvents(
  stream: NodeJS.ReadableStream,
): AsyncIterable<AgentEvent> {
  const iterable = stream as NodeJS.ReadableStream & AsyncIterable<Buffer | string>;
  if (typeof iterable[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('Codex event stream must be async iterable');
  }
  const normalizer = new CodexEventNormalizer();
  let pending: Buffer = Buffer.alloc(0);
  let eventIndex = 1;
  let streamBytes = 0;
  for await (const input of iterable) {
    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    streamBytes += chunk.length;
    if (!Number.isSafeInteger(streamBytes) || streamBytes > CODEX_STREAM_LIMIT_BYTES) {
      throw new AgentProtocolDriftError('stream_too_large', eventIndex, [], CODEX_ADAPTER_ID);
    }
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline === -1) {
        pending = appendBoundedAgentLine(
          pending,
          chunk.subarray(offset),
          eventIndex,
          CODEX_ADAPTER_ID,
          CODEX_STREAM_LINE_LIMIT_BYTES,
        );
        break;
      }
      pending = appendBoundedAgentLine(
        pending,
        chunk.subarray(offset, newline),
        eventIndex,
        CODEX_ADAPTER_ID,
        CODEX_STREAM_LINE_LIMIT_BYTES,
      );
      const line = pending.length > 0 && pending[pending.length - 1] === 0x0d
        ? pending.subarray(0, pending.length - 1)
        : pending;
      if (eventIndex > AGENT_STREAM_EVENT_LIMIT) {
        throw new AgentProtocolDriftError('counter_overflow', eventIndex, [], CODEX_ADAPTER_ID);
      }
      for (const event of parseLine(normalizer, line, eventIndex)) yield event;
      eventIndex += 1;
      pending = Buffer.alloc(0);
      offset = newline + 1;
    }
  }
  if (pending.length > 0) {
    const line = pending[pending.length - 1] === 0x0d
      ? pending.subarray(0, pending.length - 1)
      : pending;
    if (eventIndex > AGENT_STREAM_EVENT_LIMIT) {
      throw new AgentProtocolDriftError('counter_overflow', eventIndex, [], CODEX_ADAPTER_ID);
    }
    for (const event of parseLine(normalizer, line, eventIndex)) yield event;
    eventIndex += 1;
  }
  yield normalizer.finish(eventIndex);
}

export const parseCodexStream = parseCodexEvents;
