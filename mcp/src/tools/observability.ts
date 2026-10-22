import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { mapFSBError } from '../errors.js';
import { mcpToolDescription, mcpParamDescription } from './descriptions.js';

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
    mcpToolDescription('list_sessions'),
    { limit: z.coerce.number().int().nonnegative().finite().optional().describe(mcpParamDescription('list_sessions', 'limit')) },
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
    mcpToolDescription('get_session_detail'),
    {
      sessionId: z.string().describe(mcpParamDescription('get_session_detail', 'sessionId')),
      format: z.enum(['json', 'text']).optional().describe(mcpParamDescription('get_session_detail', 'format')),
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
    mcpToolDescription('get_session_replay'),
    { sessionId: z.string().min(1).describe(mcpParamDescription('get_session_replay', 'sessionId')) },
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

  // replay_session: FSB opens the recorded tabs itself; never ask the user to open target pages manually.
  server.tool(
    'replay_session',
    mcpToolDescription('replay_session'),
    { sessionId: z.string().min(1).describe(mcpParamDescription('replay_session', 'sessionId')) },
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
    mcpToolDescription('get_logs'),
    {
      sessionId: z.string().optional().describe(mcpParamDescription('get_logs', 'sessionId')),
      count: z.coerce.number().int().nonnegative().finite().optional().describe(mcpParamDescription('get_logs', 'count')),
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
    mcpToolDescription('search_memory'),
    {
      query: z.string().describe(mcpParamDescription('search_memory', 'query')),
      domain: z.string().optional().describe(mcpParamDescription('search_memory', 'domain')),
      type: z.enum(['task', 'episodic', 'semantic', 'procedural']).optional().describe(mcpParamDescription('search_memory', 'type')),
      topN: z.coerce.number().int().positive().finite().optional().describe(mcpParamDescription('search_memory', 'topN')),
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
    mcpToolDescription('get_memory_stats'),
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
