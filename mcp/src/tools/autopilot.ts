import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isBridgeDisconnectError, type WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import type { MCPResponse } from '../types.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';

/**
 * Register autopilot tools: run_task, stop_task, get_task_status.
 * These let an AI agent delegate to FSB's built-in AI loop for
 * natural-language browser automation.
 *
 * Phase 245 D-04 / D-05: autopilot tools registered here are task-lifecycle
 * tools (run_task, stop_task, get_task_status) and intentionally do NOT
 * include the `change_report` field on their response. Per-step diffs are
 * surfaced inside the autopilot's own action log (each individual action
 * tool the loop dispatches still emits change_report when the global toggle
 * is on). Read run_task's completion summary or call get_task_status for
 * autopilot-level state; the action-tool change_report contract documented
 * on the manual tools (manual.ts) and on `back` (agents.ts) is the right
 * place to consume per-action consequences.
 */
export function registerAutopilotTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // run_task -- execute a natural language automation task
  server.tool(
    'run_task',
    'IMPORTANT: Only use this tool if the user explicitly requests autopilot, asks to "run a task", or says "let FSB handle it". For all other browser tasks, use the manual tools (navigate, read_page, get_dom_snapshot, click, type_text, execute_js, etc.) to accomplish the task step by step -- they are more reliable and give you full control. This tool hands control to FSB\'s built-in AI which decides the steps autonomously. Returns a completion summary with success status and action log. Multi-agent contract: agent_id is FSB-issued and required (the server captures it via agent:register on first tool call -- callers do not provide it). The concurrency cap is configurable (default 8, range 1-64); the (N+1)th agent claim is rejected with AGENT_CAP_REACHED { cap, active }. Ownership enforcement: cross-agent calls reject with TAB_NOT_OWNED; incognito tabs reject with TAB_INCOGNITO_NOT_SUPPORTED; cross-window tabs reject with TAB_OUT_OF_SCOPE.',
    { task: z.string().describe('Natural language description of the task to perform') },
    async ({ task }, extra) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('run_task', async () => {
        // Phase 239 plan 02 -- onProgress now re-shapes Phase 239 heartbeat
        // ticks (D-01 9-field payload arriving from mcp-bridge-client.js's
        // 30s setInterval) into the MCP `notifications/progress` envelope
        // with rich fields under `params._meta` (D-02 wire shape; the MCP
        // spec 2025-03-26 _meta vendor-extension slot). Non-heartbeat
        // progress (existing dashboard progress from automationProgress
        // events) keeps the legacy shape -- params._meta is only present
        // when the extension sent at least one D-01 field. See
        // .planning/phases/239-mcp-run-task-return-on-completion-phase-236-reborn/239-CONTEXT.md
        // (D-01, D-02) for the locked payload + wire shapes.
        const onProgress = (p: MCPResponse) => {
          // Existing fields (preserve every existing field -- D-07 additive-only)
          const { progress, phase, eta, action, taskId } = p.payload as {
            taskId?: string; progress?: number; phase?: string; eta?: string; action?: string;
          };

          // Phase 239 plan 02 -- D-01 rich heartbeat fields (when extension sends a heartbeat tick)
          const { alive, step, elapsed_ms, current_url, ai_cycles, last_action } = p.payload as {
            alive?: boolean; step?: number; elapsed_ms?: number;
            current_url?: string | null; ai_cycles?: number; last_action?: string | null;
          };

          const message = [phase && `[${phase}]`, action, eta && `(ETA: ${eta})`]
            .filter(Boolean).join(' ');

          // Send MCP progress notification if client provided a progressToken
          if (extra._meta?.progressToken !== undefined) {
            // Build params._meta only when at least one heartbeat field is
            // present; non-heartbeat progress messages (existing dashboard
            // progress) keep the current shape unchanged so D-07 holds.
            const hasHeartbeatFields = alive !== undefined || step !== undefined ||
                                        elapsed_ms !== undefined || current_url !== undefined ||
                                        ai_cycles !== undefined || last_action !== undefined;

            // Build params with required progressToken/progress/total/message
            // and conditionally attach the D-02 _meta block when the extension
            // sent at least one heartbeat field. ProgressToken type is
            // string | number (MCP spec); narrow via the extra._meta shape.
            const baseParams = {
              progressToken: extra._meta.progressToken as string | number,
              progress: progress ?? 0,
              total: 100,
              message,
            };

            if (hasHeartbeatFields) {
              // D-02 wire shape: rich fields under params._meta vendor-extension slot
              extra.sendNotification({
                method: 'notifications/progress',
                params: {
                  ...baseParams,
                  _meta: {
                    alive: alive ?? false,
                    step,
                    elapsed_ms,
                    current_url,
                    ai_cycles,
                    last_action,
                  },
                },
              }).catch(() => {});
            } else {
              extra.sendNotification({
                method: 'notifications/progress',
                params: baseParams,
              }).catch(() => {});
            }
          }

          // Always send logging message as universal fallback. Logging now
          // includes the D-01 fields too so server logs carry the same
          // observability surface as the MCP host.
          server.sendLoggingMessage({
            level: 'info',
            logger: 'fsb-autopilot',
            data: { taskId, progress, phase, eta, action, alive, step, elapsed_ms, current_url, ai_cycles, last_action },
          });
        };

        let agentIdForSnapshot: string | null = null;
        const startPayload: Record<string, unknown> = { task };
        let result: Record<string, unknown>;
        try {
          result = await sendAgentScopedBridgeMessage(
            bridge,
            agentScope,
            'mcp:start-automation',
            startPayload,
            {
              timeout: 600_000, // Phase 239 plan 03 -- 600s safety net (was 300_000); CONTEXT.md D-04 + ROADMAP SC#1
              onProgress,
              onAgentId: (agentId) => { agentIdForSnapshot = agentId; },
            },
          );
        } catch (sendErr) {
          // Phase 239 plan 03 -- D-05 sw_evicted detection. mcp/src/bridge.ts
          // rejects in-flight pendingRequests on three disconnect paths:
          //   - 'Bridge disconnected'    (server shutdown; disconnect())
          //   - 'Extension disconnected' (MV3 SW eviction, hub mode)
          //   - 'Lost connection to hub' (relay-mode hub loss)
          // Treat ALL three as sw_evicted -- previously this branch tested
          // only the shutdown string, leaving real eviction to surface as a
          // raw tool failure. isBridgeDisconnectError is the single source
          // of truth kept next to the rejection sites in bridge.ts so a
          // future disconnect path added there has one place to be wired
          // through here.
          if (isBridgeDisconnectError(sendErr)) {
            // After the bridge reconnects (which the bridge client handles
            // via its existing reconnect logic), ask the extension for the
            // persisted snapshot via a new mcp:get-task-snapshot bridge
            // message. The extension-side handler reads from
            // globalThis.FsbMcpTaskStore. Correlation key is `agentId`
            // (LOCKED for v0.9.60 single-task semantics; Phase 240+ may
            // migrate to a per-task ID when concurrent tasks per agent
            // become possible).
            let partial_state: Record<string, unknown> | null = null;
            let last_heartbeat_at: number | null = null;
            try {
              // Wait briefly for bridge to reconnect; if it does not within
              // the configurable grace, settle with null partial_state
              // (best effort).
              const reconnectGraceMs = 30_000;
              const reconnectDeadline = Date.now() + reconnectGraceMs;
              while (!bridge.isConnected && Date.now() < reconnectDeadline) {
                await new Promise((r) => setTimeout(r, 250));
              }
              if (bridge.isConnected) {
                const snap = await bridge.sendAndWait(
                  { type: 'mcp:get-task-snapshot', payload: { agentId: agentIdForSnapshot || agentScope.current() || '' } },
                  { timeout: 5_000 },
                );
                const snapshot = (snap as Record<string, unknown> | undefined)?.snapshot as Record<string, unknown> | undefined;
                if (snapshot && typeof snapshot === 'object') {
                  partial_state = snapshot;
                  last_heartbeat_at = (snapshot.last_heartbeat_at as number) ?? null;
                }
              }
            } catch (_lookupErr) { /* best-effort */ }

            // Best inference for `success`: snapshot.status === 'complete'
            // -> true; status === 'error' -> false; everything else (the
            // common case for sw_evicted: status was 'in_progress' at the
            // time of eviction) -> false because the task did not complete
            // to its intended end state.
            let success = false;
            if (partial_state && typeof partial_state === 'object') {
              const status = (partial_state as { status?: unknown }).status;
              if (status === 'complete') success = true;
              else if (status === 'error') success = false;
              else success = false;
            }

            const swEvictedResult = {
              success,
              sw_evicted: true,
              partial_state,
              last_heartbeat_at,
            };
            return { content: [{ type: 'text', text: JSON.stringify(swEvictedResult, null, 2) }] };
          }

          // Any other error -- re-throw to the existing MCP error path.
          throw sendErr;
        }
        return mapFSBError(result);
      });
    },
  );

  // stop_task -- cancel the currently running automation
  server.tool(
    'stop_task',
    'Cancel the currently running automation task. Returns confirmation of cancellation. When to use: when run_task is taking too long, heading in the wrong direction, or you need to regain manual control. Related: get_task_status (check progress before deciding to stop), run_task (the task being cancelled). Agent-scoped: only the calling agent\'s task is cancelled; cross-agent calls reject with TAB_NOT_OWNED.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      const result = await sendAgentScopedBridgeMessage(
        bridge,
        agentScope,
        'mcp:stop-automation',
        {},
        { timeout: 10_000 },
      );
      return mapFSBError(result);
    },
  );

  // get_task_status -- check running task progress (read-only, bypasses queue)
  server.tool(
    'get_task_status',
    'Check whether a task is currently running and its progress. Use to poll status when not receiving progress notifications. Returns percent complete, current phase, and ETA. Related: run_task (the task being monitored), stop_task (cancel if needed). Agent-scoped: returns the calling agent\'s task status only.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('get_task_status', async () => {
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:get-status',
          {},
          { timeout: 5_000, includeOwnershipToken: false },
        );
        return mapFSBError(result);
      });
    },
  );
}
