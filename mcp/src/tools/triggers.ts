import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { MCPMessageType } from '../types.js';
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

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function triggerTargetTabId(params: Record<string, unknown>): number | null {
  return finiteNumber(params.tab_id)
    ?? finiteNumber(params.target_tab_id)
    ?? finiteNumber(params.tabId)
    ?? targetTabIdFromParams(params);
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
      async (params: Record<string, unknown>) => {
        if (!bridge.isConnected) {
          return mapFSBError({ success: false, error: 'extension_not_connected' });
        }

        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          messageType,
          params,
          { timeout, targetTabId: triggerTargetTabId(params) },
        );
        return mapFSBError(result);
      },
    );
  }
}
