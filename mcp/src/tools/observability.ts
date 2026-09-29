import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { mapFSBError } from '../errors.js';

/**
 * Register observability tools: list_sessions, get_session_detail, get_session_replay,
 * get_logs, search_memory, get_memory_stats.
 *
 * Inspection tools are read-only and bypass TaskQueue mutation serialization.
 * replay_session is intentionally serialized because it creates a pending
 * user-consent request and can start browser execution after approval.
 */
export function registerObservabilityTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // Phase 238 D-06: scope discipline — observability is signature-parity only;
  // no agent identity injection here per CONTEXT.md.
  void agentScope;
  server.tool(
    'list_sessions',
    'List all past FSB automation sessions with summary info (task, status, duration, action count, cost). Use to find session IDs for deeper inspection with get_session_detail. Related: get_session_detail (inspect a specific session), get_logs (get raw logs).',
    { limit: z.coerce.number().int().nonnegative().finite().optional().describe('Max sessions to return (default: all, max 50)') },
    async ({ limit }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('list_sessions', async () => {
        const result = await bridge.sendAndWait(
          { type: 'mcp:list-sessions', payload: { limit } },
          { timeout: 5_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  server.tool(
    'get_session_detail',
    'Get full detail for an automation session including logs, action history, and timing. Use after list_sessions to inspect what happened. For an in-flight session id (one that get_task_status reports as currentSessionId), returns a partial snapshot with `final: false` and the latest known action; the full payload becomes available once the session finishes. Returns structured JSON or human-readable text report. Related: list_sessions (find session IDs first), get_logs (get raw log entries), get_task_status (check if a session is still in flight).',
    {
      sessionId: z.string().describe('Session ID from list_sessions'),
      format: z.enum(['json', 'text']).optional().describe('Output format: json (structured, default) or text (human-readable report)'),
    },
    async ({ sessionId, format }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('get_session_detail', async () => {
        const result = await bridge.sendAndWait(
          { type: 'mcp:get-session', payload: { sessionId, format } },
          { timeout: 10_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  server.tool(
    'get_session_replay',
    'Get the verified, structurally redacted replay manifest for a recorded session. Returns exact executable step structure, logical tab targets, risk classifications, and the manifest hash without returning signing receipts. Use this instead of reconstructing a replay from logs. Related: list_sessions (find a session), replay_session (request a consent-gated replay).',
    { sessionId: z.string().min(1).describe('Session ID from list_sessions') },
    async ({ sessionId }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('get_session_replay', async () => {
        const result = await bridge.sendAndWait(
          { type: 'mcp:get-session-replay', payload: { sessionId } },
          { timeout: 20_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  server.tool(
    'replay_session',
    'Request replay of a recorded session. FSB verifies the signed manifest and shows one approval card in the extension side panel; browser execution starts automatically only after the user approves that exact manifest hash. FSB creates the recorded tabs itself, so never ask the user to open target pages manually. Related: get_session_replay (inspect first), list_sessions (find a session).',
    { sessionId: z.string().min(1).describe('Session ID from list_sessions') },
    async ({ sessionId }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('replay_session', async () => {
        const result = await bridge.sendAndWait(
          { type: 'mcp:replay-session', payload: { sessionId } },
          { timeout: 20_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  server.tool(
    'get_logs',
    'Get recent automation logs or logs for a specific session. Includes error/warning summary report. Use to debug issues or understand what FSB has been doing.',
    {
      sessionId: z.string().optional().describe('If provided, get logs only for this session. Otherwise get most recent logs.'),
      count: z.coerce.number().int().nonnegative().finite().optional().describe('Number of recent logs to return (default: 50, max: 200). Ignored when sessionId is provided.'),
    },
    async ({ sessionId, count }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('get_logs', async () => {
        const result = await bridge.sendAndWait(
          { type: 'mcp:get-logs', payload: { sessionId, count } },
          { timeout: 5_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  server.tool(
    'search_memory',
    'Search FSB\'s memory system for relevant past experiences. Returns memories ranked by relevance with keyword matching and recency scoring. Use to find what FSB learned from previous tasks on similar sites or domains. When to use: before automating a site to check if FSB has learned relevant patterns from past sessions. Related: get_memory_stats (check memory size), list_sessions (find specific sessions).',
    {
      query: z.string().describe('Natural language search query'),
      domain: z.string().optional().describe('Filter by domain (e.g., "amazon.com")'),
      type: z.enum(['task', 'episodic', 'semantic', 'procedural']).optional().describe('Filter by memory type'),
      topN: z.coerce.number().int().positive().finite().optional().describe('Max results to return (default: 5)'),
    },
    async ({ query, domain, type, topN }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('search_memory', async () => {
        const filters: Record<string, unknown> = {};
        if (domain) filters.domain = domain;
        if (type) filters.type = type;
        const options: Record<string, unknown> = {};
        if (topN) options.topN = topN;

        const result = await bridge.sendAndWait(
          { type: 'mcp:search-memory', payload: { query, filters, options } },
          { timeout: 5_000 },
        );
        return mapFSBError(result);
      });
    },
  );

  server.tool(
    'get_memory_stats',
    'Get FSB memory system statistics including total count, type breakdown, and storage usage. Use to understand how much FSB has learned from past sessions.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('get_memory_stats', async () => {
        const result = await bridge.sendAndWait(
          { type: 'mcp:get-memory', payload: { statsOnly: true } },
          { timeout: 5_000 },
        );
        return mapFSBError(result);
      });
    },
  );
}
