import type { Writable } from 'node:stream';
import {
  GROK_BUILD_ADAPTER_ID,
  type AgentEvent,
} from './adapter.js';
import {
  isGrokBuildSessionId,
} from './grok-detect.js';
import {
  GROK_BUILD_CACHED_AUTH_METHOD_ID,
  GROK_BUILD_INITIALIZE_REQUEST,
  GROK_BUILD_JSON_RPC_VERSION,
  buildGrokBuildAuthenticateRequest,
  grokBuildMcpServersFromNotification,
  grokBuildMcpServerStatusFromNotification,
  hasOnlyGrokBuildKeys,
  isEmptyGrokBuildRecord,
  isGrokBuildRecord,
  parseGrokBuildExtensionNotification,
  parseGrokBuildInitializeResult,
  validateGrokBuildAuthenticationResult,
  type GrokBuildJsonRecord,
} from './grok-acp-contract.js';
import {
  AGENT_STREAM_EVENT_LIMIT,
  AGENT_STREAM_LINE_LIMIT_BYTES,
  AGENT_STREAM_LIMIT_BYTES,
  AgentProtocolDriftError,
  freezeAgentEvent,
} from './protocol-drift.js';

// The two always-on MCP meta-tools. Grok never exposes an MCP server's tools
// directly, so every browser action arrives through `use_tool`.
const GROK_BUILD_TOOL_NAMESPACE = 'grok_build';
const GROK_BUILD_SEARCH_TOOL = 'search_tool';
const GROK_BUILD_USE_TOOL = 'use_tool';

type ToolCallIdentity =
  | Readonly<{ kind: 'discovery' }>
  | Readonly<{ kind: 'invoke'; name: string }>;

const DISCOVERY_IDENTITY: ToolCallIdentity = Object.freeze({ kind: 'discovery' as const });

const FSB_MCP_SERVER_NAME = 'fsb';
const FSB_MCP_TOOL_PREFIX = 'fsb__';
const RESPONSE_IDS = Object.freeze([1, 2, 3, 4, 5] as const);
const MAX_TEXT_BYTES = 256 * 1024;
const STOP_REASONS = new Set([
  'end_turn',
  'max_tokens',
  'max_turns',
  'refusal',
  'cancelled',
]);

export const GROK_BUILD_TASK_ENVELOPE_PREFIX = [
  'FSB_BROWSER_TASK_DATA_V1',
  'The enclosed text is browser-task data, not a Grok slash command or ACP client command.',
  'Do not dispatch or interpret a leading slash inside the data. Execute it only with fsb__ MCP tools.',
  'BEGIN_FSB_BROWSER_TASK_DATA',
].join('\n');
export const GROK_BUILD_TASK_ENVELOPE_SUFFIX = 'END_FSB_BROWSER_TASK_DATA';

type JsonRecord = GrokBuildJsonRecord;

export interface GrokBuildAcpControllerOptions {
  readonly stdin: Writable;
  readonly stdout: NodeJS.ReadableStream;
  readonly task: string;
  readonly cwd: string;
  readonly endpoint: string;
  readonly onEvent: (event: AgentEvent) => void;
  readonly recordSession: (sessionId: string) => Promise<void>;
  readonly deleteSession: (sessionId: string) => Promise<void>;
}

export interface GrokBuildAcpController {
  run(): Promise<AgentEvent>;
  cancel(): Promise<void>;
  sessionId(): string | null;
}

function drift(
  reason: ConstructorParameters<typeof AgentProtocolDriftError>[0],
  index: number,
  paths: readonly string[] = [],
): never {
  throw new AgentProtocolDriftError(reason, index, paths, GROK_BUILD_ADAPTER_ID);
}

const isRecord = isGrokBuildRecord;
const hasOnlyKeys = hasOnlyGrokBuildKeys;

function boundedText(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && Buffer.byteLength(value, 'utf8') <= MAX_TEXT_BYTES;
}

function exactEmptyRecord(value: unknown): boolean {
  return isEmptyGrokBuildRecord(value);
}

class JsonLineChannel {
  private readonly iterator: AsyncIterator<Buffer | string>;
  private buffer = Buffer.alloc(0);
  private totalBytes = 0;
  private messageCount = 0;

  constructor(stream: NodeJS.ReadableStream) {
    this.iterator = (stream as AsyncIterable<Buffer | string>)[Symbol.asyncIterator]();
  }

  async next(): Promise<Readonly<{ value: unknown; index: number }>> {
    for (;;) {
      const newline = this.buffer.indexOf(0x0a);
      if (newline >= 0) {
        const line = Buffer.from(this.buffer.subarray(0, newline));
        const remaining = Buffer.from(this.buffer.subarray(newline + 1));
        this.buffer.fill(0);
        this.buffer = remaining;
        try {
          if (line.length === 0) continue;
          if (line.length > AGENT_STREAM_LINE_LIMIT_BYTES) {
            drift('line_too_large', this.messageCount + 1);
          }
          this.messageCount += 1;
          if (this.messageCount > AGENT_STREAM_EVENT_LIMIT) {
            drift('counter_overflow', this.messageCount);
          }
          let decoded: string;
          try {
            decoded = new TextDecoder('utf-8', { fatal: true }).decode(line);
          } catch {
            drift('invalid_utf8', this.messageCount);
          }
          try {
            return Object.freeze({ value: JSON.parse(decoded!) as unknown, index: this.messageCount });
          } catch {
            drift('invalid_json', this.messageCount);
          }
        } finally {
          line.fill(0);
        }
      }
      const next = await this.iterator.next();
      if (next.done) {
        if (this.buffer.length !== 0) drift('invalid_json', this.messageCount + 1);
        drift('missing_result', this.messageCount + 1);
      }
      const chunk = Buffer.isBuffer(next.value)
        ? Buffer.from(next.value)
        : Buffer.from(next.value, 'utf8');
      try {
        this.totalBytes += chunk.length;
        if (this.totalBytes > AGENT_STREAM_LIMIT_BYTES) {
          drift('stream_too_large', this.messageCount + 1);
        }
        const combined = Buffer.concat([this.buffer, chunk]);
        this.buffer.fill(0);
        this.buffer = combined;
        if (
          this.buffer.length > AGENT_STREAM_LINE_LIMIT_BYTES
          && this.buffer.indexOf(0x0a) < 0
        ) drift('line_too_large', this.messageCount + 1);
      } finally {
        chunk.fill(0);
      }
    }
  }
}

class DefaultGrokBuildAcpController implements GrokBuildAcpController {
  private readonly options: GrokBuildAcpControllerOptions;
  private readonly channel: JsonLineChannel;
  private readonly responseIds = new Set<number>();
  private readonly toolCallNames = new Map<string, string>();
  // Catalog lookups are real tool calls with their own ids and updates, but they
  // reach no browser, so they are tracked without ever becoming a tool_use.
  private readonly discoveryToolCallIds = new Set<string>();
  private readonly pendingToolCallNames = new Map<string, string>();
  private readonly pendingToolIndexes = new Map<number, Readonly<{ id: string; name: string }>>();
  private currentSessionId: string | null = null;
  private writeTail: Promise<void> = Promise.resolve();
  private cancelSent = false;
  private closed = false;
  private sessionNewRequested = false;
  // Grok streams sessionId-bearing notifications (mcp init progress, the
  // available-commands update) before the session/new response that first tells
  // the client what the session id is. Latch the id the stream announces, then
  // require the response to agree with it.
  private observedSessionId: string | null = null;
  private mcpConfirmed = false;
  private assistantText = '';

  constructor(options: GrokBuildAcpControllerOptions) {
    this.options = options;
    this.channel = new JsonLineChannel(options.stdout);
  }

  sessionId(): string | null {
    return this.currentSessionId;
  }

  private write(value: unknown): Promise<void> {
    const serialized = `${JSON.stringify(value)}\n`;
    this.writeTail = this.writeTail.then(() => new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error | null): void => {
        if (settled) return;
        settled = true;
        this.options.stdin.off('error', onError);
        if (error) reject(new Error('stdin_failed'));
        else resolve();
      };
      const onError = (): void => finish(new Error('stdin_failed'));
      this.options.stdin.once('error', onError);
      try {
        this.options.stdin.write(serialized, 'utf8', finish);
      } catch {
        finish(new Error('stdin_failed'));
      }
    }));
    return this.writeTail;
  }

  private async response(id: number): Promise<Readonly<{ result: JsonRecord; index: number }>> {
    if (!RESPONSE_IDS.includes(id as typeof RESPONSE_IDS[number])) {
      drift('invalid_order', 1, ['id']);
    }
    for (;;) {
      const next = await this.channel.next();
      const message = next.value;
      if (!isRecord(message) || message.jsonrpc !== GROK_BUILD_JSON_RPC_VERSION) {
        drift('invalid_shape', next.index);
      }
      if (Object.hasOwn(message, 'id')) {
        if (typeof message.id !== 'number' || !Number.isSafeInteger(message.id)) {
          drift('invalid_shape', next.index, ['id']);
        }
        if (this.responseIds.has(message.id)) drift('duplicate_id', next.index, ['id']);
        this.responseIds.add(message.id);
        if (message.id !== id) drift('invalid_order', next.index, ['id']);
        if (Object.hasOwn(message, 'error')) drift('provider_error', next.index, ['error']);
        if (!hasOnlyKeys(message, ['jsonrpc', 'id', 'result']) || !isRecord(message.result)) {
          drift('invalid_shape', next.index, ['result']);
        }
        return Object.freeze({ result: message.result, index: next.index });
      }
      await this.notification(message, next.index);
    }
  }

  /**
   * Grok reaches MCP servers through two always-on meta-tools rather than
   * exposing their tools directly, so a browser action arrives as `use_tool`
   * with the real name in `rawInput.tool_name`. That target is where the
   * fsb-only rule is enforced; `search_tool` only reads the tool catalog and
   * never becomes a browser action. Any other built-in tool still fails closed.
   */
  private validateToolMeta(update: JsonRecord, index: number): ToolCallIdentity {
    const meta = update._meta;
    const tool = isRecord(meta) ? meta['x.ai/tool'] : null;
    if (!isRecord(tool) || tool.version !== 1 || !boundedText(tool.name)) {
      drift('configuration_surface', index, ['_meta', 'x.ai/tool']);
    }
    if (tool.namespace === GROK_BUILD_TOOL_NAMESPACE) {
      if (tool.name === GROK_BUILD_SEARCH_TOOL) return DISCOVERY_IDENTITY;
      if (tool.name !== GROK_BUILD_USE_TOOL) {
        drift('configuration_surface', index, ['_meta', 'x.ai/tool', 'name']);
      }
      const target = isRecord(update.rawInput) ? update.rawInput.tool_name : null;
      if (!boundedText(target) || !target.startsWith(FSB_MCP_TOOL_PREFIX)) {
        drift('configuration_surface', index, ['rawInput', 'tool_name']);
      }
      return Object.freeze({ kind: 'invoke' as const, name: target });
    }
    if (tool.namespace !== 'mcp' || !tool.name.startsWith(FSB_MCP_TOOL_PREFIX)) {
      drift('configuration_surface', index, ['_meta', 'x.ai/tool']);
    }
    return Object.freeze({ kind: 'invoke' as const, name: tool.name });
  }

  private bindSessionId(value: unknown, index: number): void {
    if (!this.sessionNewRequested || !isGrokBuildSessionId(value)) {
      drift('session_mismatch', index, ['params', 'sessionId']);
      return;
    }
    const known = this.currentSessionId ?? this.observedSessionId;
    if (known === null) {
      this.observedSessionId = value;
      return;
    }
    if (known !== value) drift('session_mismatch', index, ['params', 'sessionId']);
  }

  private requireMcpConfirmation(index: number): void {
    if (!this.mcpConfirmed) {
      drift('configuration_surface', index, ['params', 'mcpServers']);
    }
  }

  private emit(type: AgentEvent['type'], payload: Record<string, unknown>): void {
    if (!this.currentSessionId) drift('event_before_init', 1);
    this.options.onEvent(freezeAgentEvent(type, this.currentSessionId, payload));
  }

  private handleSessionUpdate(params: JsonRecord, index: number): void {
    this.bindSessionId(params.sessionId, index);
    if (
      !isRecord(params.update)
      || !boundedText(params.update.sessionUpdate)
    ) drift('session_mismatch', index, ['sessionId']);
    const update = params.update;
    const kind = update.sessionUpdate;
    // Transcript and session-title chatter carries no authority and no browser
    // result; it is observed and dropped.
    if (
      kind === 'agent_thought_chunk'
      || kind === 'user_message_chunk'
      || kind === 'session_info_update'
    ) return;
    if (kind === 'agent_message_chunk') {
      if (
        !isRecord(update.content)
        || update.content.type !== 'text'
        || !boundedText(update.content.text)
      ) drift('invalid_shape', index, ['content', 'text']);
      this.assistantText += update.content.text;
      if (Buffer.byteLength(this.assistantText, 'utf8') > MAX_TEXT_BYTES) {
        drift('stream_too_large', index, ['content', 'text']);
      }
      this.emit('assistant_delta', { text: update.content.text });
      return;
    }
    if (kind === 'tool_call') {
      this.requireMcpConfirmation(index);
      if (
        !boundedText(update.toolCallId)
        || this.toolCallNames.has(update.toolCallId)
        || this.discoveryToolCallIds.has(update.toolCallId)
      ) drift('duplicate_id', index, ['toolCallId']);
      const identity = this.validateToolMeta(update, index);
      if (identity.kind === 'discovery') {
        this.discoveryToolCallIds.add(update.toolCallId);
        this.emit('diagnostic', { kind: 'tool_discovery', toolCallId: update.toolCallId });
        return;
      }
      const name = identity.name;
      const pendingName = this.pendingToolCallNames.get(update.toolCallId);
      if (pendingName !== undefined && pendingName !== name) {
        drift('configuration_surface', index, ['_meta', 'x.ai/tool', 'name']);
      }
      this.pendingToolCallNames.delete(update.toolCallId);
      for (const [toolIndex, pending] of this.pendingToolIndexes) {
        if (pending.id === update.toolCallId) this.pendingToolIndexes.delete(toolIndex);
      }
      this.toolCallNames.set(update.toolCallId, name);
      this.emit('tool_use', {
        id: update.toolCallId,
        name,
        ...(boundedText(update.title) ? { title: update.title } : {}),
        ...(Object.hasOwn(update, 'rawInput') ? { input: update.rawInput } : {}),
        ...(typeof update.status === 'string' ? { status: update.status } : {}),
      });
      return;
    }
    if (kind === 'tool_call_delta_chunk') {
      this.requireMcpConfirmation(index);
      const toolCallId = update.tool_call_id;
      const name = update.name;
      const toolIndex = update.tool_index;
      if (!Number.isSafeInteger(toolIndex) || (toolIndex as number) < 0) {
        drift('invalid_shape', index, ['tool_index']);
      }
      const pending = this.pendingToolIndexes.get(toolIndex as number);
      if (toolCallId === undefined && name === undefined) {
        if (!pending || !boundedText(update.arguments_delta)) {
          drift('invalid_order', index, ['tool_index']);
        }
        return;
      }
      if (
        !boundedText(toolCallId)
        || !boundedText(name)
        || !name.startsWith(FSB_MCP_TOOL_PREFIX)
        || pending !== undefined
        || this.toolCallNames.has(toolCallId)
        || this.pendingToolCallNames.has(toolCallId)
      ) drift('configuration_surface', index, ['name']);
      this.pendingToolCallNames.set(toolCallId, name);
      this.pendingToolIndexes.set(toolIndex as number, Object.freeze({ id: toolCallId, name }));
      return;
    }
    if (kind === 'tool_call_update') {
      if (
        boundedText(update.toolCallId)
        && this.discoveryToolCallIds.has(update.toolCallId)
      ) {
        // Catalog results are tool names and descriptions, never browser output.
        this.emit('diagnostic', { kind: 'tool_discovery', toolCallId: update.toolCallId });
        return;
      }
      if (!boundedText(update.toolCallId) || !this.toolCallNames.has(update.toolCallId)) {
        drift('invalid_order', index, ['toolCallId']);
      }
      if (Object.hasOwn(update, '_meta')) {
        const identity = this.validateToolMeta(update, index);
        if (
          identity.kind !== 'invoke'
          || identity.name !== this.toolCallNames.get(update.toolCallId)
        ) drift('configuration_surface', index, ['_meta', 'x.ai/tool', 'name']);
      }
      if (update.status === 'completed' || update.status === 'failed') {
        this.emit('tool_result', {
          tool_use_id: update.toolCallId,
          is_error: update.status === 'failed',
          ...(Object.hasOwn(update, 'rawOutput') ? { content: update.rawOutput } : {}),
          ...(Object.hasOwn(update, 'content') ? { blocks: update.content } : {}),
        });
        return;
      }
      if (update.status === 'pending' || update.status === 'in_progress' || update.status === undefined) {
        this.emit('diagnostic', {
          kind: 'tool_call_update',
          toolCallId: update.toolCallId,
          ...(typeof update.status === 'string' ? { status: update.status } : {}),
        });
        return;
      }
      drift('invalid_shape', index, ['status']);
    }
    if (kind === 'plan') {
      this.emit('diagnostic', { kind: 'plan', entries: update.entries ?? update.plan ?? [] });
      return;
    }
    if (kind === 'usage_update') {
      this.emit('diagnostic', { kind: 'usage', usage: update.usage ?? {} });
      return;
    }
    if (kind === 'turn_completed') {
      if (!boundedText(update.stop_reason) || !STOP_REASONS.has(update.stop_reason)) {
        drift('invalid_shape', index, ['stop_reason']);
      }
      this.emit('diagnostic', {
        kind: 'usage',
        stop_reason: update.stop_reason,
        usage: update.usage ?? {},
      });
      return;
    }
    if (kind === 'available_commands_update') {
      if (!Array.isArray(update.availableCommands) && !Array.isArray(update.commands)) {
        drift('invalid_shape', index, ['commands']);
      }
      return;
    }
    drift('unknown_event_type', index, ['sessionUpdate']);
  }

  private async notification(message: JsonRecord, index: number): Promise<void> {
    const extension = parseGrokBuildExtensionNotification(message);
    if (extension) {
      if (extension.kind === 'mcp_servers') {
        // Only ever arrives empty, ahead of session/new. A populated list would
        // mean a server FSB did not ask for.
        const servers = grokBuildMcpServersFromNotification(extension);
        if (!servers || servers.length !== 0) {
          drift('configuration_surface', index, ['params', 'mcpServers']);
        }
        return;
      }
      if (extension.kind === 'mcp_server_status') {
        const status = grokBuildMcpServerStatusFromNotification(extension);
        if (
          !status
          || !this.sessionNewRequested
          || status.name !== FSB_MCP_SERVER_NAME
          || status.source !== 'local'
        ) drift('configuration_surface', index, ['params', 'name']);
        this.bindSessionId(status.sessionId, index);
        // 'unavailable' carries a handshake failure detail that must not be
        // forwarded; the surface itself is the fact worth reporting.
        if (status.status !== 'ready') {
          drift('configuration_surface', index, ['params', 'status']);
        }
        this.mcpConfirmed = true;
        return;
      }
      if (Object.hasOwn(extension.params, 'sessionId')) {
        this.bindSessionId(extension.params.sessionId, index);
      }
      return;
    }
    if (
      !hasOnlyKeys(message, ['jsonrpc', 'method', 'params'])
      || message.method !== 'session/update'
      || !isRecord(message.params)
    ) drift('unknown_event_type', index, ['method']);
    this.handleSessionUpdate(message.params, index);
  }

  async run(): Promise<AgentEvent> {
    let completed = false;
    try {
      await this.write(GROK_BUILD_INITIALIZE_REQUEST);
      const initialized = await this.response(1);
      const negotiation = parseGrokBuildInitializeResult(initialized.result);
      if (
        !negotiation
        || negotiation.authState !== 'oauth'
        || negotiation.authenticationMethodId !== GROK_BUILD_CACHED_AUTH_METHOD_ID
      ) drift('invalid_shape', initialized.index, ['result', 'authMethods']);

      await this.write(buildGrokBuildAuthenticateRequest());
      const authenticated = await this.response(2);
      if (!validateGrokBuildAuthenticationResult(authenticated.result)) {
        drift('invalid_shape', authenticated.index, ['result']);
      }

      this.sessionNewRequested = true;
      await this.write({
        jsonrpc: GROK_BUILD_JSON_RPC_VERSION,
        id: 3,
        method: 'session/new',
        params: {
          cwd: this.options.cwd,
          mcpServers: [{
            name: FSB_MCP_SERVER_NAME,
            type: 'http',
            url: this.options.endpoint,
            headers: [],
          }],
        },
      });
      const created = await this.response(3);
      if (!isGrokBuildSessionId(created.result.sessionId)) {
        drift('invalid_shape', created.index, ['sessionId']);
      }
      if (
        this.observedSessionId !== null
        && this.observedSessionId !== created.result.sessionId
      ) drift('session_mismatch', created.index, ['sessionId']);
      this.currentSessionId = created.result.sessionId;
      await this.options.recordSession(this.currentSessionId);
      this.emit('init', {
        provider: GROK_BUILD_ADAPTER_ID,
        protocolVersion: 1,
        mcpServers: [FSB_MCP_SERVER_NAME],
      });

      const prompt = `${GROK_BUILD_TASK_ENVELOPE_PREFIX}\n${this.options.task}\n${GROK_BUILD_TASK_ENVELOPE_SUFFIX}`;
      await this.write({
        jsonrpc: GROK_BUILD_JSON_RPC_VERSION,
        id: 4,
        method: 'session/prompt',
        params: {
          sessionId: this.currentSessionId,
          prompt: [{ type: 'text', text: prompt }],
        },
      });
      const prompted = await this.response(4);
      if (
        !boundedText(prompted.result.stopReason)
        || !STOP_REASONS.has(prompted.result.stopReason)
      ) drift('invalid_shape', prompted.index, ['stopReason']);
      this.requireMcpConfirmation(prompted.index);
      if (prompted.result.stopReason === 'cancelled') {
        throw new Error('cancelled');
      }
      if (Object.hasOwn(prompted.result, 'usage')) {
        this.emit('diagnostic', { kind: 'usage', usage: prompted.result.usage });
      }
      if (this.assistantText.length > 0) {
        this.emit('assistant', { text: this.assistantText });
      }
      const result = freezeAgentEvent('result', this.currentSessionId, {
        is_error: prompted.result.stopReason === 'refusal',
        stop_reason: prompted.result.stopReason,
        ...(Object.hasOwn(prompted.result, 'usage') ? { usage: prompted.result.usage } : {}),
      });

      await this.write({
        jsonrpc: GROK_BUILD_JSON_RPC_VERSION,
        id: 5,
        method: 'session/close',
        params: { sessionId: this.currentSessionId },
      });
      const closed = await this.response(5);
      // 1.0.4 answers session/close with a close-outcome _meta rather than {}.
      if (
        !exactEmptyRecord(closed.result)
        && !(hasOnlyKeys(closed.result, ['_meta']) && isRecord(closed.result._meta))
      ) drift('invalid_shape', closed.index, ['result']);
      this.closed = true;
      await this.options.deleteSession(this.currentSessionId);
      completed = true;
      return result;
    } finally {
      if (!completed && this.currentSessionId && !this.closed && !this.cancelSent) {
        await this.cancel().catch(() => undefined);
      }
    }
  }

  async cancel(): Promise<void> {
    if (this.cancelSent || !this.currentSessionId || this.closed) return;
    this.cancelSent = true;
    await this.write({
      jsonrpc: GROK_BUILD_JSON_RPC_VERSION,
      method: 'session/cancel',
      params: { sessionId: this.currentSessionId },
    });
  }
}

export function createGrokBuildAcpController(
  options: GrokBuildAcpControllerOptions,
): GrokBuildAcpController {
  return new DefaultGrokBuildAcpController(options);
}
