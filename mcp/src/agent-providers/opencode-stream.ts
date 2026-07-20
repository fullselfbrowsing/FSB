import { z } from 'zod';
import { OPENCODE_ADAPTER_ID, type AgentEvent } from './adapter.js';
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
  type OpenCodeProtocolDriftReason,
} from './protocol-drift.js';

export { AgentProtocolDriftError } from './protocol-drift.js';

export const OPENCODE_STREAM_LINE_LIMIT_BYTES = AGENT_STREAM_LINE_LIMIT_BYTES;
export const OPENCODE_STREAM_LIMIT_BYTES = AGENT_STREAM_LIMIT_BYTES;

const IDENTIFIER_LIMIT_BYTES = 256;
const REASON_LIMIT_BYTES = 64;
const TEXT_LIMIT_BYTES = 64 * 1024;
const TOOL_BODY_LIMIT_BYTES = 128 * 1024;
const JSON_DEPTH_LIMIT = 8;
const JSON_NODE_LIMIT = 4_096;
const JSON_RECORD_KEY_LIMIT = 256;
const JSON_ARRAY_LENGTH_LIMIT = 256;
const STEP_LIMIT = 256;
const TOOL_LIMIT = 1_024;
const COST_LIMIT = 1_000_000_000_000;

function boundedUtf8String(maxBytes: number, controlFree = false): z.ZodType<string> {
  return z.string().min(1).refine(
    (value) => Buffer.byteLength(value, 'utf8') <= maxBytes,
    'bounded utf8 string',
  ).refine(
    (value) => !controlFree || !/[\u0000-\u001f\u007f]/.test(value),
    'control-free string',
  );
}

const IdentifierSchema = boundedUtf8String(IDENTIFIER_LIMIT_BYTES, true);
const ReasonSchema = boundedUtf8String(REASON_LIMIT_BYTES, true);
const TextSchema = z.string().refine(
  (value) => Buffer.byteLength(value, 'utf8') <= TEXT_LIMIT_BYTES,
  'bounded text',
);
const ToolBodySchema = z.string().refine(
  (value) => Buffer.byteLength(value, 'utf8') <= TOOL_BODY_LIMIT_BYTES,
  'bounded tool body',
);
const SafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const CostSchema = z.number().finite().nonnegative().max(COST_LIMIT);
const UnknownRecordSchema = z.record(z.unknown());

const PartBase = {
  id: IdentifierSchema,
  sessionID: IdentifierSchema,
  messageID: IdentifierSchema,
};

const TimeSchema = z.object({
  start: SafeIntegerSchema,
  end: SafeIntegerSchema,
}).strict().refine((value) => value.end >= value.start, { path: ['end'] });

const SourceTextSchema = z.object({
  value: TextSchema,
  start: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  end: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
}).strict();

const PositionSchema = z.object({
  line: SafeIntegerSchema,
  character: SafeIntegerSchema,
}).strict();

const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
}).strict();

const FileSourceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('file'),
    path: ToolBodySchema,
    text: SourceTextSchema,
  }).strict(),
  z.object({
    type: z.literal('symbol'),
    path: ToolBodySchema,
    range: RangeSchema,
    name: IdentifierSchema,
    kind: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    text: SourceTextSchema,
  }).strict(),
  z.object({
    type: z.literal('resource'),
    clientName: IdentifierSchema,
    uri: ToolBodySchema,
    text: SourceTextSchema,
  }).strict(),
]);

const FilePartSchema = z.object({
  ...PartBase,
  type: z.literal('file'),
  mime: IdentifierSchema,
  filename: ToolBodySchema.optional(),
  url: ToolBodySchema,
  source: FileSourceSchema.optional(),
}).strict();

const StepStartPartSchema = z.object({
  ...PartBase,
  type: z.literal('step-start'),
  snapshot: ToolBodySchema.optional(),
}).strict();

const StepFinishPartSchema = z.object({
  ...PartBase,
  type: z.literal('step-finish'),
  reason: ReasonSchema,
  snapshot: ToolBodySchema.optional(),
  cost: CostSchema,
  tokens: z.object({
    total: SafeIntegerSchema.optional(),
    input: SafeIntegerSchema,
    output: SafeIntegerSchema,
    reasoning: SafeIntegerSchema,
    cache: z.object({
      read: SafeIntegerSchema,
      write: SafeIntegerSchema,
    }).strict(),
  }).strict(),
}).strict();

const TextPartSchema = z.object({
  ...PartBase,
  type: z.literal('text'),
  text: TextSchema,
  synthetic: z.boolean().optional(),
  ignored: z.boolean().optional(),
  time: TimeSchema,
  metadata: UnknownRecordSchema.optional(),
}).strict();

const ReasoningPartSchema = z.object({
  ...PartBase,
  type: z.literal('reasoning'),
  text: TextSchema,
  metadata: UnknownRecordSchema.optional(),
  time: TimeSchema,
}).strict();

const ToolCompletedStateSchema = z.object({
  status: z.literal('completed'),
  input: UnknownRecordSchema,
  output: ToolBodySchema,
  title: ToolBodySchema,
  metadata: UnknownRecordSchema,
  time: z.object({
    start: SafeIntegerSchema,
    end: SafeIntegerSchema,
    compacted: SafeIntegerSchema.optional(),
  }).strict().refine((value) => value.end >= value.start, { path: ['end'] }),
  attachments: z.array(FilePartSchema).max(16).optional(),
}).strict();

const ToolErrorStateSchema = z.object({
  status: z.literal('error'),
  input: UnknownRecordSchema,
  error: ToolBodySchema,
  metadata: UnknownRecordSchema.optional(),
  time: TimeSchema,
}).strict();

const ToolPartSchema = z.object({
  ...PartBase,
  type: z.literal('tool'),
  callID: IdentifierSchema,
  tool: IdentifierSchema,
  state: z.discriminatedUnion('status', [ToolCompletedStateSchema, ToolErrorStateSchema]),
  metadata: UnknownRecordSchema.optional(),
}).strict();

function partEnvelope<T extends z.ZodTypeAny>(type: string, part: T) {
  return z.object({
    type: z.literal(type),
    timestamp: SafeIntegerSchema,
    sessionID: IdentifierSchema,
    part,
  }).strict();
}

const StepStartEnvelopeSchema = partEnvelope('step_start', StepStartPartSchema);
const StepFinishEnvelopeSchema = partEnvelope('step_finish', StepFinishPartSchema);
const TextEnvelopeSchema = partEnvelope('text', TextPartSchema);
const ReasoningEnvelopeSchema = partEnvelope('reasoning', ReasoningPartSchema);
const ToolEnvelopeSchema = partEnvelope('tool_use', ToolPartSchema);
const ErrorEnvelopeSchema = z.object({
  type: z.literal('error'),
  timestamp: SafeIntegerSchema,
  sessionID: IdentifierSchema,
  error: z.object({
    name: IdentifierSchema,
    data: UnknownRecordSchema,
  }).strict(),
}).strict();

type StepStartEnvelope = z.infer<typeof StepStartEnvelopeSchema>;
type StepFinishEnvelope = z.infer<typeof StepFinishEnvelopeSchema>;
type TextEnvelope = z.infer<typeof TextEnvelopeSchema>;
type ReasoningEnvelope = z.infer<typeof ReasoningEnvelopeSchema>;
type ToolEnvelope = z.infer<typeof ToolEnvelopeSchema>;
type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

interface JsonBudget {
  nodes: number;
}

function validateBoundedJson(
  value: unknown,
  eventIndex: number,
  path: string,
  depth = 0,
  budget: JsonBudget = { nodes: 0 },
): void {
  budget.nodes += 1;
  if (depth > JSON_DEPTH_LIMIT || budget.nodes > JSON_NODE_LIMIT) {
    throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], OPENCODE_ADAPTER_ID);
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      throw new AgentProtocolDriftError('invalid_shape', eventIndex, [path], OPENCODE_ADAPTER_ID);
    }
    return;
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > TOOL_BODY_LIMIT_BYTES) {
      throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], OPENCODE_ADAPTER_ID);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > JSON_ARRAY_LENGTH_LIMIT || Object.keys(value).length !== value.length) {
      throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], OPENCODE_ADAPTER_ID);
    }
    value.forEach((item, index) => validateBoundedJson(item, eventIndex, `${path}.${index}`, depth + 1, budget));
    return;
  }
  const record = asPlainDataRecord(value);
  if (!record) {
    throw new AgentProtocolDriftError('invalid_shape', eventIndex, [path], OPENCODE_ADAPTER_ID);
  }
  const keys = Object.keys(record);
  if (keys.length > JSON_RECORD_KEY_LIMIT) {
    throw new AgentProtocolDriftError('counter_overflow', eventIndex, [path], OPENCODE_ADAPTER_ID);
  }
  for (const key of keys) {
    if (
      Buffer.byteLength(key, 'utf8') > IDENTIFIER_LIMIT_BYTES
      || /[\u0000-\u001f\u007f]/.test(key)
    ) {
      throw new AgentProtocolDriftError('invalid_shape', eventIndex, [path], OPENCODE_ADAPTER_ID);
    }
    validateBoundedJson(record[key], eventIndex, path, depth + 1, budget);
  }
}

interface NormalizeOutcome {
  readonly events: readonly AgentEvent[];
  readonly failureAfter?: OpenCodeProtocolDriftReason;
}

class OpenCodeEventNormalizer {
  private sessionId: string | null = null;
  private activeMessageId: string | null = null;
  private candidate: AgentEvent | null = null;
  private lastTimestamp = -1;
  private stepCount = 0;
  private toolCount = 0;
  private cumulativeCost = 0;
  private readonly cumulativeTokens = {
    total: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  private readonly seenPartIds = new Set<string>();
  private readonly seenMessageIds = new Set<string>();
  private readonly seenCallIds = new Set<string>();

  normalize(value: unknown, eventIndex: number): NormalizeOutcome {
    const envelope = asPlainDataRecord(value);
    if (!envelope || typeof envelope.type !== 'string') {
      throw this.drift('invalid_shape', eventIndex);
    }
    if (this.candidate) {
      throw this.drift(
        envelope.type === 'step_finish' ? 'duplicate_result' : 'event_after_result',
        eventIndex,
      );
    }

    switch (envelope.type) {
      case 'step_start':
        return { events: this.normalizeStepStart(envelope, eventIndex) };
      case 'step_finish':
        return { events: this.normalizeStepFinish(envelope, eventIndex) };
      case 'text':
        return { events: this.normalizeText(envelope, eventIndex) };
      case 'reasoning':
        return { events: this.normalizeReasoning(envelope, eventIndex) };
      case 'tool_use':
        return { events: this.normalizeTool(envelope, eventIndex) };
      case 'error':
        return this.normalizeError(envelope, eventIndex);
      default:
        throw this.drift('unknown_event_type', eventIndex);
    }
  }

  finish(nextEventIndex: number): AgentEvent {
    if (!this.candidate) throw this.drift('missing_result', nextEventIndex);
    return this.candidate;
  }

  private drift(
    reason: OpenCodeProtocolDriftReason,
    eventIndex: number,
    paths: readonly string[] = [],
  ): AgentProtocolDriftError {
    return new AgentProtocolDriftError(reason, eventIndex, paths, OPENCODE_ADAPTER_ID);
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown, eventIndex: number): T {
    return parseAgentShape(schema, value, eventIndex, OPENCODE_ADAPTER_ID);
  }

  private validateTimestamp(timestamp: number, eventIndex: number): void {
    if (timestamp < this.lastTimestamp) throw this.drift('invalid_order', eventIndex);
    this.lastTimestamp = timestamp;
  }

  private validateSession(outer: string, inner: string, eventIndex: number): string {
    if (inner !== outer) throw this.drift('session_mismatch', eventIndex);
    if (!this.sessionId) throw this.drift('event_before_init', eventIndex);
    if (outer !== this.sessionId) throw this.drift('session_mismatch', eventIndex);
    return this.sessionId;
  }

  private requireActive(messageId: string, eventIndex: number): void {
    if (!this.sessionId) throw this.drift('event_before_init', eventIndex);
    if (!this.activeMessageId) throw this.drift('invalid_order', eventIndex);
    if (messageId !== this.activeMessageId) throw this.drift('invalid_order', eventIndex);
  }

  private addPartId(partId: string, eventIndex: number): void {
    if (this.seenPartIds.has(partId)) throw this.drift('duplicate_id', eventIndex);
    this.seenPartIds.add(partId);
    if (this.seenPartIds.size > AGENT_STREAM_EVENT_LIMIT) {
      throw this.drift('counter_overflow', eventIndex);
    }
  }

  private normalizeStepStart(value: unknown, eventIndex: number): AgentEvent[] {
    const envelope: StepStartEnvelope = this.parse(StepStartEnvelopeSchema, value, eventIndex);
    this.validateTimestamp(envelope.timestamp, eventIndex);
    if (this.activeMessageId) throw this.drift('invalid_order', eventIndex);
    if (envelope.part.sessionID !== envelope.sessionID) {
      throw this.drift('session_mismatch', eventIndex);
    }
    if (this.sessionId && envelope.sessionID !== this.sessionId) {
      throw this.drift('session_mismatch', eventIndex);
    }
    if (this.seenMessageIds.has(envelope.part.messageID)) {
      throw this.drift('duplicate_id', eventIndex);
    }
    this.addPartId(envelope.part.id, eventIndex);
    this.seenMessageIds.add(envelope.part.messageID);
    this.stepCount += 1;
    if (this.stepCount > STEP_LIMIT) throw this.drift('counter_overflow', eventIndex);
    const firstStep = this.sessionId === null;
    this.sessionId = envelope.sessionID;
    this.activeMessageId = envelope.part.messageID;
    if (!firstStep) return [];
    return [freezeAgentEvent('init', envelope.sessionID, {
      stepId: envelope.part.id,
      messageId: envelope.part.messageID,
    })];
  }

  private normalizeText(value: unknown, eventIndex: number): AgentEvent[] {
    const envelope: TextEnvelope = this.parse(TextEnvelopeSchema, value, eventIndex);
    this.validateTimestamp(envelope.timestamp, eventIndex);
    const sessionId = this.validateSession(envelope.sessionID, envelope.part.sessionID, eventIndex);
    this.requireActive(envelope.part.messageID, eventIndex);
    this.addPartId(envelope.part.id, eventIndex);
    if (envelope.part.metadata) validateBoundedJson(envelope.part.metadata, eventIndex, 'part.metadata');
    return [freezeAgentEvent('assistant', sessionId, { text: envelope.part.text })];
  }

  private normalizeReasoning(value: unknown, eventIndex: number): AgentEvent[] {
    const envelope: ReasoningEnvelope = this.parse(ReasoningEnvelopeSchema, value, eventIndex);
    this.validateTimestamp(envelope.timestamp, eventIndex);
    const sessionId = this.validateSession(envelope.sessionID, envelope.part.sessionID, eventIndex);
    this.requireActive(envelope.part.messageID, eventIndex);
    this.addPartId(envelope.part.id, eventIndex);
    if (envelope.part.metadata) validateBoundedJson(envelope.part.metadata, eventIndex, 'part.metadata');
    return [freezeAgentEvent('assistant_delta', sessionId, { text: envelope.part.text })];
  }

  private normalizeTool(value: unknown, eventIndex: number): AgentEvent[] {
    const envelope: ToolEnvelope = this.parse(ToolEnvelopeSchema, value, eventIndex);
    this.validateTimestamp(envelope.timestamp, eventIndex);
    const sessionId = this.validateSession(envelope.sessionID, envelope.part.sessionID, eventIndex);
    this.requireActive(envelope.part.messageID, eventIndex);
    this.addPartId(envelope.part.id, eventIndex);
    if (this.seenCallIds.has(envelope.part.callID)) throw this.drift('duplicate_id', eventIndex);
    this.seenCallIds.add(envelope.part.callID);
    this.toolCount += 1;
    if (this.toolCount > TOOL_LIMIT) throw this.drift('counter_overflow', eventIndex);
    validateBoundedJson(envelope.part.state.input, eventIndex, 'part.state.input');
    validateBoundedJson(envelope.part.state.metadata ?? {}, eventIndex, 'part.state.metadata');
    if (envelope.part.metadata) validateBoundedJson(envelope.part.metadata, eventIndex, 'part.metadata');
    if (envelope.part.state.status === 'completed') {
      for (const attachment of envelope.part.state.attachments ?? []) {
        if (attachment.sessionID !== sessionId) {
          throw this.drift('session_mismatch', eventIndex);
        }
        if (attachment.messageID !== this.activeMessageId) {
          throw this.drift('invalid_order', eventIndex);
        }
        this.addPartId(attachment.id, eventIndex);
      }
    }
    return [
      freezeAgentEvent('tool_use', sessionId, {
        id: envelope.part.callID,
        name: envelope.part.tool,
      }),
      freezeAgentEvent('tool_result', sessionId, {
        tool_use_id: envelope.part.callID,
        is_error: envelope.part.state.status === 'error',
      }),
    ];
  }

  private addCounter(
    key: keyof OpenCodeEventNormalizer['cumulativeTokens'],
    value: number,
    eventIndex: number,
  ): void {
    const next = this.cumulativeTokens[key] + value;
    if (!Number.isSafeInteger(next)) throw this.drift('counter_overflow', eventIndex);
    this.cumulativeTokens[key] = next;
  }

  private normalizeStepFinish(value: unknown, eventIndex: number): AgentEvent[] {
    const envelope: StepFinishEnvelope = this.parse(StepFinishEnvelopeSchema, value, eventIndex);
    this.validateTimestamp(envelope.timestamp, eventIndex);
    const sessionId = this.validateSession(envelope.sessionID, envelope.part.sessionID, eventIndex);
    this.requireActive(envelope.part.messageID, eventIndex);
    this.addPartId(envelope.part.id, eventIndex);
    const tokens = envelope.part.tokens;
    this.addCounter('total', tokens.total ?? 0, eventIndex);
    this.addCounter('input', tokens.input, eventIndex);
    this.addCounter('output', tokens.output, eventIndex);
    this.addCounter('reasoning', tokens.reasoning, eventIndex);
    this.addCounter('cacheRead', tokens.cache.read, eventIndex);
    this.addCounter('cacheWrite', tokens.cache.write, eventIndex);
    const cumulativeCost = this.cumulativeCost + envelope.part.cost;
    if (!Number.isFinite(cumulativeCost) || cumulativeCost > COST_LIMIT) {
      throw this.drift('counter_overflow', eventIndex);
    }
    this.cumulativeCost = cumulativeCost;
    this.activeMessageId = null;
    if (envelope.part.reason === 'tool-calls' || envelope.part.reason === 'unknown') return [];
    this.candidate = freezeAgentEvent('result', sessionId, {
      subtype: envelope.part.reason,
      is_error: false,
      candidate: true,
      cost: this.cumulativeCost,
      tokens: {
        total: this.cumulativeTokens.total,
        input: this.cumulativeTokens.input,
        output: this.cumulativeTokens.output,
        reasoning: this.cumulativeTokens.reasoning,
        cache: {
          read: this.cumulativeTokens.cacheRead,
          write: this.cumulativeTokens.cacheWrite,
        },
      },
    });
    return [];
  }

  private normalizeError(value: unknown, eventIndex: number): NormalizeOutcome {
    const envelope: ErrorEnvelope = this.parse(ErrorEnvelopeSchema, value, eventIndex);
    this.validateTimestamp(envelope.timestamp, eventIndex);
    if (!this.sessionId) throw this.drift('event_before_init', eventIndex);
    if (envelope.sessionID !== this.sessionId) throw this.drift('session_mismatch', eventIndex);
    validateBoundedJson(envelope.error.data, eventIndex, 'error.data');
    return {
      events: [freezeAgentEvent('diagnostic', this.sessionId, { code: 'provider_error' })],
      failureAfter: 'provider_error',
    };
  }
}

function parseLine(
  normalizer: OpenCodeEventNormalizer,
  line: Buffer,
  eventIndex: number,
): NormalizeOutcome {
  const decoded = decodeAgentJsonLine(line, eventIndex, OPENCODE_ADAPTER_ID);
  return normalizer.normalize(decoded, eventIndex);
}

export async function* parseOpenCodeEvents(
  stream: NodeJS.ReadableStream,
): AsyncIterable<AgentEvent> {
  const iterable = stream as NodeJS.ReadableStream & AsyncIterable<Buffer | string>;
  if (typeof iterable[Symbol.asyncIterator] !== 'function') {
    throw new TypeError('OpenCode event stream must be async iterable');
  }

  const normalizer = new OpenCodeEventNormalizer();
  let pending: Buffer = Buffer.alloc(0);
  let eventIndex = 1;
  let streamBytes = 0;

  for await (const input of iterable) {
    const chunk = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
    streamBytes += chunk.length;
    if (!Number.isSafeInteger(streamBytes) || streamBytes > OPENCODE_STREAM_LIMIT_BYTES) {
      throw new AgentProtocolDriftError(
        'stream_too_large',
        eventIndex,
        [],
        OPENCODE_ADAPTER_ID,
      );
    }
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(0x0a, offset);
      if (newline === -1) {
        pending = appendBoundedAgentLine(
          pending,
          chunk.subarray(offset),
          eventIndex,
          OPENCODE_ADAPTER_ID,
          OPENCODE_STREAM_LINE_LIMIT_BYTES,
        );
        break;
      }
      pending = appendBoundedAgentLine(
        pending,
        chunk.subarray(offset, newline),
        eventIndex,
        OPENCODE_ADAPTER_ID,
        OPENCODE_STREAM_LINE_LIMIT_BYTES,
      );
      const line = pending.length > 0 && pending[pending.length - 1] === 0x0d
        ? pending.subarray(0, pending.length - 1)
        : pending;
      if (eventIndex > AGENT_STREAM_EVENT_LIMIT) {
        throw new AgentProtocolDriftError(
          'counter_overflow',
          eventIndex,
          [],
          OPENCODE_ADAPTER_ID,
        );
      }
      const outcome = parseLine(normalizer, line, eventIndex);
      for (const event of outcome.events) yield event;
      if (outcome.failureAfter) {
        throw new AgentProtocolDriftError(
          outcome.failureAfter,
          eventIndex,
          [],
          OPENCODE_ADAPTER_ID,
        );
      }
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
      throw new AgentProtocolDriftError('counter_overflow', eventIndex, [], OPENCODE_ADAPTER_ID);
    }
    const outcome = parseLine(normalizer, line, eventIndex);
    for (const event of outcome.events) yield event;
    if (outcome.failureAfter) {
      throw new AgentProtocolDriftError(
        outcome.failureAfter,
        eventIndex,
        [],
        OPENCODE_ADAPTER_ID,
      );
    }
    eventIndex += 1;
  }

  yield normalizer.finish(eventIndex);
}
