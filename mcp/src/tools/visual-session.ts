import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { mapFSBError } from '../errors.js';
import { mcpToolDescription, mcpParamDescription } from './descriptions.js';

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
    mcpToolDescription('start_visual_session'),
    {
      client: z.string().describe(mcpParamDescription('start_visual_session', 'client')),
      task: z.string().describe(mcpParamDescription('start_visual_session', 'task')),
      detail: z.string().optional().describe(mcpParamDescription('start_visual_session', 'detail')),
      tab_id: z.coerce.number().int().positive().finite().optional().describe(mcpParamDescription('start_visual_session', 'tab_id')),
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
    mcpToolDescription('end_visual_session'),
    {
      session_token: z.string().describe(mcpParamDescription('end_visual_session', 'session_token')),
      reason: z.enum(['cancelled', 'ended']).optional().describe(mcpParamDescription('end_visual_session', 'reason')),
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
