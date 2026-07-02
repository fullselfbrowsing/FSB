import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { MCPMessageType, MCPResponse } from '../types.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage, targetTabIdFromParams } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import { TOOL_REGISTRY, jsonSchemaToZod } from './schema-bridge.js';

export const TRIGGER_TOOL_NAMES = [
  'trigger',
  'stop_trigger',
  'get_trigger_status',
  'list_triggers',
] as const;

type TriggerToolName = typeof TRIGGER_TOOL_NAMES[number];

const TRIGGER_MESSAGE_TYPES: Record<TriggerToolName, MCPMessageType> = {
  trigger: 'mcp:trigger',
  stop_trigger: 'mcp:stop-trigger',
  get_trigger_status: 'mcp:get-trigger-status',
  list_triggers: 'mcp:list-triggers',
};

const TRIGGER_TIMEOUTS: Record<TriggerToolName, number> = {
  trigger: 30_000,
  stop_trigger: 10_000,
  get_trigger_status: 5_000,
  list_triggers: 5_000,
};

const TRIGGER_HEARTBEAT_INTERVAL_MS = 30_000;
const TRIGGER_BLOCKING_TIMEOUT_DEFAULT_MS = 120_000;
const TRIGGER_BLOCKING_SAFETY_CEILING_MS = 240_000; const TRIGGER_BLOCKING_MAX_WAIT_MS = TRIGGER_BLOCKING_SAFETY_CEILING_MS;
const TRIGGER_BRIDGE_SETTLE_GRACE_MS = 30_000;

type McpToolExtra = {
  _meta?: { progressToken?: unknown };
  sendNotification?: (payload: any) => Promise<void>;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function triggerTargetTabId(params: Record<string, unknown>): number | null {
  return finiteNumber(params.tab_id)
    ?? finiteNumber(params.target_tab_id)
    ?? finiteNumber(params.tabId)
    ?? targetTabIdFromParams(params);
}

function ensureTriggerId(params: Record<string, unknown>): Record<string, unknown> {
  const existing = typeof params.trigger_id === 'string' ? params.trigger_id.trim() : '';
  return {
    ...params,
    trigger_id: existing || randomUUID(),
  };
}

// Claude Code's MCP stdio transport JSON-stringifies object-valued tool args
// (the same way it stringifies numbers; see schema-bridge.ts numeric preprocess).
// The trigger tool's `condition` is untyped in the input schema (zod z.any()),
// so it passes through verbatim — the extension's
// fsbTriggerValidateToolCondition then rejects the string with reason
// 'condition_required' (typeof !== 'object'). Parse it here so the extension
// receives a real object. Idempotent: leaves already-parsed objects untouched.
function parseTriggerConditionIfStringified(params: Record<string, unknown>): Record<string, unknown> {
  const raw = params.condition;
  if (typeof raw !== 'string') return params;
  const trimmed = raw.trim();
  if (!trimmed || trimmed[0] !== '{' && trimmed[0] !== '[') return params;
  try {
    const parsed = JSON.parse(trimmed);
    return { ...params, condition: parsed };
  } catch {
    return params;
  }
}

function isDetached(params: Record<string, unknown>): boolean {
  return params.detached === true;
}

function finitePositiveMs(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function blockingWaitMs(params: Record<string, unknown>): number {
  const requested = finitePositiveMs(params.timeout_ms) ?? TRIGGER_BLOCKING_TIMEOUT_DEFAULT_MS;
  const safety = finitePositiveMs(params.safety_ceiling_ms) ?? TRIGGER_BLOCKING_MAX_WAIT_MS;
  return Math.min(requested, safety, TRIGGER_BLOCKING_MAX_WAIT_MS);
}

function triggerProgressToNotification(
  server: McpServer,
  extra: McpToolExtra | undefined,
  progress: MCPResponse,
): void {
  const payload = (progress && progress.payload) || {};
  const meta = {
    alive: payload.alive === true,
    trigger_id: payload.trigger_id,
    elapsed_ms: payload.elapsed_ms,
    status: payload.status,
    current_value: payload.current_value,
    last_evaluated_at: payload.last_evaluated_at,
    last_reported_at: payload.last_reported_at,
    target_tab_id: payload.target_tab_id,
  };

  const progressToken = extra?._meta?.progressToken;
  if ((typeof progressToken === 'string' || typeof progressToken === 'number')
      && typeof extra?.sendNotification === 'function') {
    extra.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: 0,
        total: 100,
        message: `trigger ${String(meta.trigger_id || '')} ${String(meta.status || 'watching')}`,
        _meta: meta,
      },
    }).catch(() => {});
  }

  server.sendLoggingMessage({
    level: 'info',
    logger: 'fsb-trigger',
    data: meta,
  });
}

async function waitForBridgeReconnect(bridge: WebSocketBridge, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!bridge.isConnected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function jsonText(value: Record<string, unknown>): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function disconnectedTriggerResult(
  triggerId: string,
  lookup: Record<string, unknown> | null,
): Record<string, unknown> {
  // The extension's get-trigger-status (background.js fsbTriggerHandleToolStatus)
  // returns { success:true, status: <projected-object> } where the projected
  // object has its own `status: 'fired' | 'armed' | ...` string field. The old
  // reader assumed lookup.snapshot or a flat lookup with a string .status --
  // neither matches, so the 'fired' / 'timed_out' recovery branches below were
  // unreachable and every fired-after-drop trigger reported as outcome:'detached'.
  // Unwrap in priority order: (1) explicit lookup.status object (current shape),
  // (2) legacy lookup.snapshot object, (3) flat lookup.
  const partialState = lookup && typeof lookup === 'object'
    ? ((lookup.status && typeof lookup.status === 'object')
        ? lookup.status as Record<string, unknown>
        : (lookup.snapshot && typeof lookup.snapshot === 'object')
          ? lookup.snapshot as Record<string, unknown>
          : lookup)
    : null;
  const status = partialState && typeof partialState.status === 'string' ? partialState.status : 'unknown';

  if (status === 'fired') {
    return {
      success: true,
      sw_evicted: true,
      outcome: 'fired',
      trigger_id: triggerId,
      event: partialState?.last_event ?? partialState?.last_fire_event ?? null,
      status: partialState,
    };
  }

  if (status === 'timed_out') {
    return {
      success: true,
      sw_evicted: true,
      outcome: 'timed_out',
      trigger_id: triggerId,
      status: partialState,
    };
  }

  return {
    success: false,
    sw_evicted: true,
    outcome: 'detached',
    trigger_id: triggerId,
    partial_state: partialState,
    last_heartbeat_at: partialState?.last_heartbeat_at ?? null,
  };
}

export function registerTriggerTools(
  server: McpServer,
  bridge: WebSocketBridge,
  _queue: TaskQueue,
  agentScope: AgentScope,
): void {
  for (const toolName of TRIGGER_TOOL_NAMES) {
    const tool = TOOL_REGISTRY.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`Missing trigger tool definition: ${toolName}`);
    }

    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const messageType = TRIGGER_MESSAGE_TYPES[toolName];
    const timeout = TRIGGER_TIMEOUTS[toolName];

    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (params: Record<string, unknown>, extra?: McpToolExtra) => {
        if (!bridge.isConnected) {
          return mapFSBError({ success: false, error: 'extension_not_connected' });
        }

        if (toolName !== 'trigger') {
          const result = await sendAgentScopedBridgeMessage(
            bridge,
            agentScope,
            messageType,
            params,
            { timeout, targetTabId: triggerTargetTabId(params) },
          );
          return mapFSBError(result);
        }

        const triggerPayload = ensureTriggerId(parseTriggerConditionIfStringified(params));
        const triggerId = triggerPayload.trigger_id as string;
        const targetTabId = triggerTargetTabId(triggerPayload);
        const detached = isDetached(triggerPayload);

        let result: Record<string, unknown>;
        try {
          result = await sendAgentScopedBridgeMessage(
            bridge,
            agentScope,
            messageType,
            triggerPayload,
            {
              timeout: detached ? TRIGGER_TIMEOUTS.trigger : blockingWaitMs(triggerPayload) + TRIGGER_BRIDGE_SETTLE_GRACE_MS,
              targetTabId,
              onProgress: detached ? undefined : (progress) => triggerProgressToNotification(server, extra, progress),
            },
          );
        } catch (sendErr) {
          const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
          if (errMsg !== 'Bridge disconnected' || detached) {
            throw sendErr;
          }

          let lookup: Record<string, unknown> | null = null;
          try {
            await waitForBridgeReconnect(bridge, TRIGGER_HEARTBEAT_INTERVAL_MS);
            if (bridge.isConnected) {
              lookup = await sendAgentScopedBridgeMessage(
                bridge,
                agentScope,
                'mcp:get-trigger-status',
                {
                  trigger_id: triggerId,
                  ...(targetTabId ? { tab_id: targetTabId } : {}),
                },
                { timeout: 5_000, targetTabId },
              );
            }
          } catch (_lookupErr) {
            lookup = null;
          }
          return jsonText(disconnectedTriggerResult(triggerId, lookup));
        }

        if (detached && result && result.success && result.outcome === undefined) {
          return mapFSBError({
            ...result,
            outcome: 'detached',
            detached: true,
            trigger_id: result.trigger_id ?? triggerId,
          });
        }

        return mapFSBError(result);
      },
    );
  }
}
