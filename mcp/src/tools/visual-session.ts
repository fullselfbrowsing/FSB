import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { mapFSBError } from '../errors.js';

// Approved visual-session client labels (must match the extension's allowlist)
const MCP_VISUAL_CLIENT_LABELS: string[] = [
  'Claude', 'Codex', 'ChatGPT', 'Perplexity', 'Windsurf',
  'Cursor', 'Antigravity', 'OpenCode', 'OpenClaw', 'OpenClaw 🦀', 'Grok', 'Gemini', 'Hermes',
  // Quick task 260608-6nm -- Tier-1 MCP clients (modelcontextprotocol.io clients + awesome-mcp-clients + Nimbalyst 2026)
  'Cline', 'Continue', 'Zed', 'VS Code', 'Copilot',
  'JetBrains', 'Xcode', 'Eclipse', 'Cody', 'Roo Code', 'Kiro', 'Goose',
];

const CLIENT_LABEL_MAP: Record<string, string> = Object.create(null);
for (const label of MCP_VISUAL_CLIENT_LABELS) {
  CLIENT_LABEL_MAP[label.toLowerCase().replace(/[\s_-]+/g, '')] = label;
}

export function normalizeMcpVisualClientLabel(raw: unknown): string | null {
  const key = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  return key ? (CLIENT_LABEL_MAP[key] ?? null) : null;
}

/**
 * Phase 255 Plan 03: boolean-returning wrapper consumed by the
 * action-tool dispatch validator in mcp/src/tools/manual.ts. Returns
 * true iff `raw` normalises to a label on the v0.9.36 shared allowlist.
 */
export function isAllowedMcpVisualClientLabel(raw: unknown): boolean {
  return normalizeMcpVisualClientLabel(raw) !== null;
}

export function getAllowedMcpVisualClientLabels(): string[] {
  return MCP_VISUAL_CLIENT_LABELS.slice();
}

export function registerVisualSessionTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  server.tool(
    'start_visual_session',
    '[REMOVED in v0.9.0] This tool was removed in fsb-mcp-server v0.9.0 (FSB v0.9.62 implicit visual-session contract). Calling it returns the typed TOOL_REMOVED error with a migration recipe pointer. The visual session is now implicit on every action tool call via the required visual_reason + client field bundle -- there is no longer a separate start call. See CHANGELOG.md#v0.9.0 and the Visual Session Lifecycle section of mcp/README.md for the migration recipe.',
    {
      client: z.string().describe('Trusted MCP client label, for example Codex, ChatGPT, Claude, or Gemini. Must be on the approved allowlist.'),
      task: z.string().describe('Short task title shown in the visible automation surface.'),
      detail: z.string().optional().describe('Optional initial detail line for the overlay, such as "Preparing checkout flow".'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional. Tab id the visual session attaches to. Omit when this agent owns exactly one tab; required to disambiguate when this agent owns multiple. Legacy popup/sidepanel/autopilot do not need to pass this.'),
    },
    async () => {
      // Phase 258 Plan 01 -- TOOL_REMOVED stub. Synchronous rejection
      // BEFORE the task queue and BEFORE the bridge connectivity check:
      // a caller of a removed tool gets the migration recipe even if
      // the extension is offline. See .planning/v0.9.62-CONTRACT.md
      // Typed Errors section (TOOL_REMOVED body intent).
      return mapFSBError({
        success: false,
        errorCode: 'TOOL_REMOVED',
        removed_tool: 'start_visual_session',
        removed_in_version: '0.9.0',
      });
    },
  );

  server.tool(
    'end_visual_session',
    '[REMOVED in v0.9.0] This tool was removed in fsb-mcp-server v0.9.0 (FSB v0.9.62 implicit visual-session contract). Calling it returns the typed TOOL_REMOVED error with a migration recipe pointer. The visual session now clears either automatically after 60 seconds of silence (sliding window) or immediately when an action tool is called with is_final: true -- there is no longer a separate end call. See CHANGELOG.md#v0.9.0 and the Visual Session Lifecycle section of mcp/README.md for the migration recipe.',
    {
      session_token: z.string().describe('Session token returned by start_visual_session.'),
      reason: z.enum(['cancelled', 'ended']).optional().describe('Optional end reason for analytics/debugging.'),
    },
    async () => {
      // Phase 258 Plan 01 -- TOOL_REMOVED stub. Synchronous rejection
      // BEFORE the task queue and BEFORE the bridge connectivity check:
      // a caller of a removed tool gets the migration recipe even if
      // the extension is offline. See .planning/v0.9.62-CONTRACT.md
      // Typed Errors section (TOOL_REMOVED body intent).
      return mapFSBError({
        success: false,
        errorCode: 'TOOL_REMOVED',
        removed_tool: 'end_visual_session',
        removed_in_version: '0.9.0',
      });
    },
  );
}
