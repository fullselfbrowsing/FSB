import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { MCPResponse } from '../types.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';
import { mcpToolDescription, mcpParamDescription } from './descriptions.js';
import { EXPECT_SHAPE, clampExpectTimeoutMs, EXPECT_BRIDGE_HEADROOM_MS, withUnsupportedExpectFill } from './manual.js';

/**
 * Register agent management tools: create, list, run, stop, delete, toggle,
 * stats, and history. These let MCP clients manage FSB background agents
 * without the extension UI.
 *
 * Phase 245 D-04 / D-05: action tools registered here (currently `back`)
 * return a `change_report` field describing what the action mutated -- URL
 * changes, dialogs opened, nodes added/removed, attribute changes, focus
 * shift -- so the agent learns the consequence without a follow-up
 * read_page. Read-only tools registered here (none today) would not include
 * this field. The contract is gated by the Action Change Reports toggle in
 * the extension control panel (default on); when off, action tools revert
 * to pre-Phase-245 response shape with zero observer overhead.
 */
export function registerAgentTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // Phase 242 D-01: 'back' MCP tool -- single-step ownership-gated history back.
  // Routes through extension dispatcher via the new 'mcp:go-back' bridge message.
  server.tool(
    'back',
    mcpToolDescription('back'),
    { tab_id: z.coerce.number().int().positive().finite().optional().describe(mcpParamDescription('back', 'tab_id')), ...EXPECT_SHAPE },
    async ({ tab_id, expect }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('back', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = {};
        if (typeof tab_id === 'number') payload.tabId = tab_id;
        // Phase 69 D-15: top-level sidecar, only when sent (no-expect payload unchanged).
        if (expect !== undefined) payload.expect = expect;
        // Phase 69 (RESEARCH Finding 1): the check runs after back's own settle,
        // so with expect the bridge waits for it too; without expect the timeout
        // stays exactly 5_000.
        const timeout = expect === undefined
          ? 5_000  // 2s settle + 3s headroom (RESEARCH Pattern 1)
          : 5_000 + clampExpectTimeoutMs(expect.timeout_ms) + EXPECT_BRIDGE_HEADROOM_MS;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:go-back',
          payload,
          { timeout, targetTabId },
        );
        return mapFSBError(withUnsupportedExpectFill(result, expect));
      });
    },
  );
  // DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md
  //   // create_agent -- create a new background agent (mutation)
//   server.tool(
//     'create_agent',
//     'Create a new background agent. The agent can either use a pinned URL or let AI choose its starting site at run time. Returns the created agent with its ID.',
//     {
//       name: z.string().describe('Agent display name'),
//       task: z.string().describe('Natural language task description the agent will execute'),
//       start_mode: z.enum(['pinned', 'ai_routed']).optional().describe('How the agent chooses its starting page. pinned uses target_url; ai_routed resolves from the task at run time.'),
//       target_url: z.string().url().optional().describe('Pinned start URL. Required when start_mode is pinned; omit for ai_routed.'),
//       schedule_type: z.enum(['interval', 'daily', 'once']).describe('Schedule type: interval (every N minutes), daily (at specific time), once (run once then disable)'),
//       interval_minutes: z.number().optional().describe('Minutes between runs (required for interval schedule)'),
//       daily_time: z.string().optional().describe('Time of day in HH:MM format (required for daily schedule)'),
//       days_of_week: z.array(z.number().min(0).max(6)).optional().describe('Days of week 0=Sun..6=Sat (optional for daily schedule, defaults to every day)'),
//       max_iterations: z.number().min(1).max(50).optional().describe('Max AI iterations per run (default: 15)'),
//     },
//     async ({ name, task, start_mode, target_url, schedule_type, interval_minutes, daily_time, days_of_week, max_iterations }) => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('create_agent', async () => {
//         const startMode = start_mode ?? (target_url ? 'pinned' : 'ai_routed');
//         if (startMode === 'pinned' && !target_url) {
//           return mapFSBError({ success: false, error: 'Pinned agents require target_url' });
//         }
//         const schedule: Record<string, unknown> = { type: schedule_type };
//         if (interval_minutes !== undefined) schedule.intervalMinutes = interval_minutes;
//         if (daily_time !== undefined) schedule.dailyTime = daily_time;
//         if (days_of_week !== undefined) schedule.daysOfWeek = days_of_week;
  //
//         const result = await bridge.sendAndWait(
//           {
//             type: 'mcp:create-agent',
//             payload: { name, task, startMode, targetUrl: target_url || '', schedule, maxIterations: max_iterations },
//           },
//           { timeout: 10_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // list_agents -- list all background agents (read-only, bypasses queue)
//   server.tool(
//     'list_agents',
//     'List all background agents with status, schedule, and last run info. Returns agent summaries without full run history.',
//     {},
//     async () => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('list_agents', async () => {
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:list-agents', payload: {} },
//           { timeout: 5_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // run_agent -- trigger immediate agent execution (mutation, with progress)
//   server.tool(
//     'run_agent',
//     'Trigger immediate execution of a background agent. The agent navigates to its target URL and runs its task. Returns execution result with status and summary.',
//     {
//       agent_id: z.string().describe('Agent ID to run'),
//     },
//     async ({ agent_id }, extra) => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('run_agent', async () => {
//         const onProgress = (p: MCPResponse) => {
//           const { progress, phase, eta, action, taskId } = p.payload as {
//             taskId?: string; progress?: number; phase?: string; eta?: string; action?: string;
//           };
//           const message = [phase && `[${phase}]`, action, eta && `(ETA: ${eta})`]
//             .filter(Boolean).join(' ');
  //
//           if (extra._meta?.progressToken !== undefined) {
//             extra.sendNotification({
//               method: 'notifications/progress',
//               params: {
//                 progressToken: extra._meta.progressToken,
//                 progress: progress ?? 0,
//                 total: 100,
//                 message,
//               },
//             }).catch(() => {});
//           }
  //
//           server.sendLoggingMessage({
//             level: 'info',
//             logger: 'fsb-agent',
//             data: { taskId, progress, phase, eta, action },
//           });
//         };
  //
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:run-agent', payload: { agentId: agent_id } },
//           { timeout: 300_000, onProgress },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // stop_agent -- stop a running agent execution (mutation)
//   server.tool(
//     'stop_agent',
//     'Stop a currently running agent execution. Use when an agent run is taking too long or needs to be cancelled.',
//     {
//       agent_id: z.string().describe('Agent ID to stop'),
//     },
//     async ({ agent_id }) => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('stop_agent', async () => {
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:stop-agent', payload: { agentId: agent_id } },
//           { timeout: 10_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // delete_agent -- permanently delete an agent (mutation)
//   server.tool(
//     'delete_agent',
//     'Delete a background agent and remove its scheduled alarm. This action is permanent.',
//     {
//       agent_id: z.string().describe('Agent ID to delete'),
//     },
//     async ({ agent_id }) => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('delete_agent', async () => {
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:delete-agent', payload: { agentId: agent_id } },
//           { timeout: 10_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // toggle_agent -- enable/disable an agent (mutation)
//   server.tool(
//     'toggle_agent',
//     'Enable or disable a background agent. Disabled agents keep their config but do not run on schedule.',
//     {
//       agent_id: z.string().describe('Agent ID to toggle'),
//     },
//     async ({ agent_id }) => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('toggle_agent', async () => {
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:toggle-agent', payload: { agentId: agent_id } },
//           { timeout: 10_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // get_agent_stats -- aggregate stats across all agents (read-only, bypasses queue)
//   server.tool(
//     'get_agent_stats',
//     'Get aggregate statistics across all agents: total runs, success rate, total cost, active agent count.',
//     {},
//     async () => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('get_agent_stats', async () => {
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:get-agent-stats', payload: {} },
//           { timeout: 5_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
  //
//   // get_agent_history -- run history for a specific agent (read-only, bypasses queue)
//   server.tool(
//     'get_agent_history',
//     'Get run history for a specific agent. Returns recent runs with status, duration, cost, and execution mode.',
//     {
//       agent_id: z.string().describe('Agent ID to get history for'),
//       limit: z.number().min(1).max(100).optional().describe('Max runs to return (default: 10)'),
//     },
//     async ({ agent_id, limit }) => {
//       if (!bridge.isConnected) {
//         return mapFSBError({ success: false, error: 'extension_not_connected' });
//       }
//       return queue.enqueue('get_agent_history', async () => {
//         const result = await bridge.sendAndWait(
//           { type: 'mcp:get-agent-history', payload: { agentId: agent_id, limit } },
//           { timeout: 5_000 },
//         );
//         return mapFSBError(result);
//       });
//     },
//   );
}
