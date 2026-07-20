import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { MCPMessageType } from '../types.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import { TOOL_REGISTRY, jsonSchemaToZod } from './schema-bridge.js';

// ---------------------------------------------------------------------------
// Bridge message type mapping
// ---------------------------------------------------------------------------

type BridgeMessage = { type: MCPMessageType; payload: Record<string, unknown> };

/**
 * Read-only tools use DIFFERENT bridge message types, not the standard
 * 'mcp:execute-action'. This map converts tool name + params into the
 * correct {type, payload} for bridge.sendAndWait().
 *
 * Phase 246 D-02: tab_id is forwarded into the payload (top-level for the
 * direct read routes, inside params for the execute-action variants) so the
 * extension-side resolver can address the caller-specified tab. Unspecified
 * tab_id falls through to the resolver's registry path.
 */
const MESSAGE_TYPE_MAP: Record<
  string,
  (params: Record<string, unknown>) => BridgeMessage
> = {
  read_page: (p) => ({
    type: 'mcp:read-page',
    payload: { full: p.full, ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) },
  }),
  get_text: (p) => ({
    type: 'mcp:execute-action',
    payload: { tool: 'getText', params: { selector: p.selector, ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) } },
  }),
  get_attribute: (p) => ({
    type: 'mcp:execute-action',
    payload: { tool: 'getAttribute', params: { selector: p.selector, attribute: p.attribute, ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) } },
  }),
  get_dom_snapshot: (p) => ({
    type: 'mcp:get-dom',
    payload: { maxElements: p.maxElements, ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) },
  }),
  list_tabs: () => ({
    type: 'mcp:get-tabs',
    payload: {},
  }),
  read_sheet: (p) => ({
    type: 'mcp:execute-action',
    payload: { tool: 'readsheet', params: { range: p.range, ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) } },
  }),
  get_page_snapshot: (p) => ({
    type: 'mcp:get-page-snapshot',
    payload: { ...(p.tab_id !== undefined ? { tab_id: p.tab_id } : {}) },
  }),
  get_site_guide: (p) => ({
    type: 'mcp:get-site-guides',
    payload: {
      ...(p.domain ? { domain: p.domain, url: p.domain } : {}),
    },
  }),
  complete_task: (p) => ({
    type: 'mcp:task-status',
    payload: { tool: 'complete_task', params: { ...p } },
  }),
  partial_task: (p) => ({
    type: 'mcp:task-status',
    payload: { tool: 'partial_task', params: { ...p } },
  }),
  fail_task: (p) => ({
    type: 'mcp:task-status',
    payload: { tool: 'fail_task', params: { ...p } },
  }),
};

// ---------------------------------------------------------------------------
// Per-tool timeout overrides (all others default to 30s)
// ---------------------------------------------------------------------------

const TIMEOUT_OVERRIDES: Record<string, number> = {
  read_page: 45_000,
  list_tabs: 5_000,
  get_page_snapshot: 45_000,
  get_site_guide: 15_000,
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register read-only information tools from the shared TOOL_REGISTRY.
 * Most bypass TaskQueue mutation serialization so they can execute while a
 * mutation is running. The terminal lifecycle tools remain registered here,
 * but TaskQueue deliberately serializes them so their outcomes cannot overtake
 * the final mutation.
 *
 * Each tool's JSON Schema inputSchema is converted to Zod on the fly.
 * Bridge message types are resolved via MESSAGE_TYPE_MAP.
 */
export function registerReadOnlyTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // Phase 246 D-02: Phase 238 D-06's "no agent identity injection here" is
  // OVERTURNED. Read-only tools now thread agentId + optional tab_id so the
  // extension-side resolver can pick the right tab and the dispatch gate
  // can enforce ownership_token on explicit-tab_id calls.
  const readOnlyTools = TOOL_REGISTRY.filter(t => t._readOnly);

  for (const tool of readOnlyTools) {
    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const messageBuilder = MESSAGE_TYPE_MAP[tool.name];

    if (!messageBuilder) {
      continue;
    }

    const timeout = TIMEOUT_OVERRIDES[tool.name] ?? 30_000;

    server.tool(
      tool.name,
      tool.description,
      zodShape,
      async (params: Record<string, unknown>) => {
        if (!bridge.isConnected) {
          return mapFSBError({ success: false, error: 'extension_not_connected' });
        }
        return queue.enqueue(tool.name, async () => {
          const targetTabId = typeof params.tab_id === 'number' ? params.tab_id : null;
          const built = messageBuilder(params);
          const result = await sendAgentScopedBridgeMessage(
            bridge,
            agentScope,
            built.type,
            built.payload as Record<string, unknown>,
            { timeout, targetTabId },
          );
          // fail_task reports the task's outcome with success:false even when
          // the dispatcher successfully recorded it. Treat only that canonical
          // lifecycle envelope as an acknowledgement; genuine tool failures
          // must still flow through mapFSBError.
          if (
            tool.name === 'fail_task' &&
            result.success === false &&
            result.tool === 'fail_task' &&
            result.status === 'failed'
          ) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
            };
          }
          return mapFSBError(result);
        });
      },
    );
  }
}
