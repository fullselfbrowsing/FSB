import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage, targetTabIdFromParams } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import {
  TOOL_REGISTRY,
  jsonSchemaToZod,
  PARAM_TRANSFORMS,
  type ToolDefinition,
} from './schema-bridge.js';
import { isAllowedMcpVisualClientLabel, getAllowedMcpVisualClientLabels, normalizeMcpVisualClientLabel } from './visual-session.js';

type ToolCallResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

// Phase 245 D-04 / D-05: action tools return a `change_report` field describing
// what the action mutated -- URL changes, dialogs opened, nodes added/removed,
// attribute changes, focus shift -- so the agent can learn the consequence
// without a follow-up read_page. Read-only tools (get_text, get_attribute,
// read_page, get_dom_snapshot, list_tabs, etc.) do not include this field.
// Tools where the diff is reliably noise (scroll, scroll_at, hover, focus)
// also opt out per D-06. The contract is gated by the Action Change Reports
// toggle in the extension control panel (default on); when off, action tools
// revert to pre-Phase-245 response shape with zero observer overhead.
const CHANGE_REPORT_DESCRIPTION_SUFFIX =
  ' RETURNS change_report: when this tool runs, the response includes a `change_report` field with a compact diff of what the action mutated (URL, dialogs_opened, nodes_added, nodes_removed, attrs_changed, inputs_changed, focus_shift). Use this to learn the consequence without calling read_page next. If the report exceeds the size cap, `change_report.truncated:true` and `change_report_hint` are set; call read_page for the full state.';

const TRIGGER_MANUAL_EXCLUSIONS = new Set(['trigger']); function isManualTool(t: ToolDefinition): boolean { return !t._readOnly && !TRIGGER_MANUAL_EXCLUSIONS.has(t.name); }

/**
 * Phase 255 Plan 03: visual-session field-bundle validator.
 *
 * Runs at the dispatch chokepoint for every action tool (registered by
 * registerManualTools below). Read-only tools bypass this validator
 * entirely because they are registered through registerReadOnlyTools
 * (mcp/src/tools/read-only.ts), which does not import this function.
 *
 * Validation steps (matches .planning/phases/255-schema-enforcement-on-
 * action-tools/255-CONTEXT.md Validator location section, steps 3-4):
 *   1. visual_reason MUST be a non-empty string. Empty / missing -> reject
 *      with VISUAL_FIELDS_REQUIRED.
 *   2. client MUST be a non-empty string. Empty / missing -> reject with
 *      VISUAL_FIELDS_REQUIRED.
 *   3. client MUST pass isAllowedMcpVisualClientLabel(). Failed -> reject
 *      with BADGE_NOT_ALLOWED.
 *
 * On success returns null (caller proceeds to execAction). On rejection
 * returns the ToolCallResult the MCP SDK should serialize back to the
 * caller; the underlying FSB action does NOT run.
 *
 * Source-of-truth for field names and error codes: .planning/v0.9.62-
 * CONTRACT.md (Field Bundle + Typed Errors sections).
 */
function validateVisualSessionFields(
  toolName: string,
  params: Record<string, unknown>,
): ToolCallResult | null {
  const visualReason = params.visual_reason;
  const client = params.client;

  const visualReasonOk = typeof visualReason === 'string' && visualReason.trim().length > 0;
  const clientOk = typeof client === 'string' && client.trim().length > 0;

  if (!visualReasonOk || !clientOk) {
    return mapFSBError({
      success: false,
      errorCode: 'VISUAL_FIELDS_REQUIRED',
      tool: toolName,
    });
  }

  if (!isAllowedMcpVisualClientLabel(client)) {
    return mapFSBError({
      success: false,
      errorCode: 'BADGE_NOT_ALLOWED',
      tool: toolName,
      clientLabel: client,
      allowedClients: getAllowedMcpVisualClientLabels(),
    });
  }

  return null;
}

/**
 * Phase 255 Plan 03: strip the visual-session field bundle from caller
 * params before forwarding to the FSB extension. The extension protocol
 * does not yet consume these fields (lifecycle code lands in Phase 256);
 * leaving them in the payload would noise up the bridge wire.
 */
function stripVisualSessionFields(params: Record<string, unknown>): Record<string, unknown> {
  const { visual_reason: _vr, client: _cl, is_final: _if, ...rest } = params;
  return rest;
}

/**
 * Phase 256 Plan 02: visual-session SIDECAR builder.
 *
 * After validateVisualSessionFields passes, this helper extracts the
 * validated field bundle from the ORIGINAL caller params (before the
 * Phase 255 strip helper runs) and returns it as a sibling sidecar
 * object that the bridge payload carries alongside the agentId /
 * ownershipToken / connectionId top-level fields (see
 * mcp/src/agent-bridge.ts buildAgentPayload).
 *
 * Source-of-truth for the field names is .planning/v0.9.62-CONTRACT.md
 * lines 70-86 (Field Bundle section): the schema-side keys remain
 * snake_case (visual_reason / client / is_final), and this helper
 * converts them to the wire-side camelCase (visualReason / client /
 * isFinal) so the sidecar matches the existing agent-bridge.ts wire
 * conventions (agentId, ownershipToken, connectionId).
 *
 * Preconditions (enforced by validateVisualSessionFields, which MUST
 * have returned null before this helper runs):
 *   - params.visual_reason is a non-empty trimmed string.
 *   - params.client normalises to an allowlisted label.
 *
 * The client value is RE-NORMALISED here via
 * normalizeMcpVisualClientLabel so the sidecar carries the CANONICAL
 * casing (not whatever casing the caller sent); this is a tampering
 * mitigation per the Phase 256 Plan 02 threat register (T-256-02-01)
 * and protects the extension-side lifecycle code (Phase 256 Plan 03)
 * from caller-supplied label drift.
 */
type VisualSessionSidecar = {
  visualReason: string;
  client: string;
  isFinal: boolean;
};

function buildVisualSessionSidecar(params: Record<string, unknown>): VisualSessionSidecar {
  const reasonRaw = params.visual_reason;
  const clientRaw = params.client;
  const isFinalRaw = params.is_final;
  const visualReason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
  const clientNormalised = normalizeMcpVisualClientLabel(clientRaw);
  // After the validator passes, clientNormalised MUST be a non-null
  // string. The `?? ''` is belt-and-suspenders against a future
  // refactor that drops the validator gate by accident.
  const client = clientNormalised ?? '';
  const isFinal = isFinalRaw === true;
  return { visualReason, client, isFinal };
}

/**
 * Execute a single browser action through the FSB extension.
 * All manual tools funnel through this helper which checks connectivity,
 * enqueues via TaskQueue (mutation serialization), and maps the result.
 */
async function execAction(
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
  toolName: string,
  fsbVerb: string,
  params: Record<string, unknown>,
  visualSession: VisualSessionSidecar | null,
): Promise<ToolCallResult> {
  if (!bridge.isConnected) {
    console.error(`[FSB Manual] ${toolName}: bridge not connected`);
    return mapFSBError({ success: false, error: 'extension_not_connected' });
  }
  console.error(`[FSB Manual] ${toolName}: sending verb=${fsbVerb} params=${JSON.stringify(params).slice(0, 150)}`);
  // fill_sheet types cell-by-cell into Google Sheets and can take minutes for large datasets.
  // Default 30s is insufficient; give it 120s like the content script's own timeout.
  const LONG_TIMEOUT_TOOLS = new Set(['fill_sheet', 'read_sheet']);
  const timeout = LONG_TIMEOUT_TOOLS.has(toolName) ? 120_000 : 30_000;

  return queue.enqueue(toolName, async () => {
    try {
      // Phase 256 Plan 02: when the visual-session sidecar is present, attach
      // it as a TOP-LEVEL field on the bridge payload base object (not inside
      // `params`). sendAgentScopedBridgeMessage merges agentId, ownershipToken,
      // and connectionId at the same top level; `visualSession` becomes a
      // sibling of those existing fields and is what the extension-side
      // lifecycle code (Phase 256 Plan 03) reads after the v0.9.60 ownership
      // gate fires. The action params shipped under `params` stay scrubbed
      // (Phase 255 strip preserved verbatim).
      const basePayload: Record<string, unknown> = { tool: fsbVerb, params };
      if (visualSession) {
        basePayload.visualSession = visualSession;
      }
      const result = await sendAgentScopedBridgeMessage(
        bridge,
        agentScope,
        'mcp:execute-action',
        basePayload,
        { timeout, targetTabId: targetTabIdFromParams(params) },
      );
      if (!result?.success) {
        console.error(`[FSB Manual] ${toolName}: FAILED - ${result?.error || 'unknown error'}`);
      }
      return mapFSBError(result);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[FSB Manual] ${toolName}: EXCEPTION - ${errMsg}`);
      return mapFSBError({ success: false, error: errMsg });
    }
  });
}

/**
 * Register all manual (non-read-only) browser action tools from the shared
 * TOOL_REGISTRY. Each tool's JSON Schema inputSchema is converted to Zod
 * on the fly via jsonSchemaToZod(), and parameter transforms are applied
 * for tools where MCP param names differ from FSB internal names.
 */
export function registerManualTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // Filter to non-read-only tools from canonical registry
  const manualTools = TOOL_REGISTRY.filter(isManualTool);

  for (const tool of manualTools) {
    const zodShape = jsonSchemaToZod(tool.inputSchema);
    const fsbVerb = tool._contentVerb || tool._cdpVerb || tool.name;
    const transform = PARAM_TRANSFORMS[tool.name];

    // Phase 245 D-04 / D-05: append change_report contract to descriptions of
    // action tools whose _emitChangeReport flag is true (per D-05 INCLUDE list,
    // minus D-06 opt-outs scroll/scroll_at/hover/focus).
    const description = (tool._emitChangeReport === true)
      ? `${tool.description}${CHANGE_REPORT_DESCRIPTION_SUFFIX}`
      : tool.description;

    server.tool(
      tool.name,
      description,
      zodShape,
      async (params: Record<string, unknown>) => {
        // Phase 255 Plan 03: visual-session field-bundle gate runs
        // BEFORE the param transform + execAction. Rejections do not
        // proceed to queue.enqueue or sendAgentScopedBridgeMessage, so
        // no DOM mutation, no change_report, no overlay change.
        const rejection = validateVisualSessionFields(tool.name, params);
        if (rejection) return rejection;

        // Phase 256 Plan 02: capture the validated field bundle as a
        // SIDECAR from the ORIGINAL caller params, BEFORE the Phase 255
        // strip helper runs. The sidecar travels as a top-level field
        // on the bridge payload (sibling of agentId / ownershipToken /
        // connectionId in agent-bridge.ts buildAgentPayload), so the
        // extension-side lifecycle code (Phase 256 Plan 03) can record
        // a tick after the v0.9.60 ownership gate fires.
        const visualSession = buildVisualSessionSidecar(params);

        const cleanedParams = stripVisualSessionFields(params);
        const finalParams = transform ? transform(cleanedParams) : cleanedParams;
        return execAction(bridge, queue, agentScope, tool.name, fsbVerb, finalParams, visualSession);
      },
    );
  }
}
