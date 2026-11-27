import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage, sendBrowserMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';

// Must exceed the extension-side 120_000ms payment confirmation gate.
const PAYMENT_CONFIRMATION_TIMEOUT_MS = 125_000;

/**
 * Register vault tools: list_credentials, fill_credential,
 * list_payment_methods, use_payment_method.
 *
 * SECURITY: These tools are registered directly (not via TOOL_REGISTRY)
 * to maintain an explicit security boundary. Raw secrets never traverse
 * the WebSocket bridge -- only opaque IDs and masked metadata.
 */
export function registerVaultTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // Phase 246 D-13 vault overturn: Phase 238 D-06's "no agent identity
  // injection here" is OVERTURNED for fill_credential and use_payment_method.
  // The vault tools now thread agentId + optional tab_id so the extension-side
  // resolver picks the right tab and the dispatch gate enforces ownership.
  // list_credentials and list_payment_methods stay tab-agnostic (vault read-
  // only) so they remain signature-only.
  // list_credentials -- returns domain + username pairs only (MCP-01)
  // Password field is NEVER present in the response.
  server.tool(
    'list_credentials',
    'List saved credentials. Returns domain and username pairs only -- passwords are never included in the response. Use fill_credential to autofill a login form.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      const result = await sendBrowserMessage(
        bridge,
        agentScope,
        { type: 'mcp:list-credentials', payload: {} },
        { timeout: 5_000 },
      );
      return mapFSBError(result);
    },
  );

  // fill_credential -- triggers autofill on the active tab (MCP-02)
  // Password travels background.js -> content script only, never over WebSocket.
  // Phase 246 D-13: vault overturn. agentId + optional tab_id + ownershipToken
  // + connectionId now thread through the bridge payload so the extension-side
  // resolver picks the right tab and the dispatch gate enforces ownership.
  server.tool(
    'fill_credential',
    'Auto-fill login form on the active tab with a saved credential. The password is resolved inside the extension and injected directly into the page -- it never crosses the WebSocket bridge. The domain parameter is accepted for backward compatibility but the actual lookup domain is derived from the tab URL for security. Requires the credential vault to be unlocked. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED. Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    {
      domain: z.string().optional().describe('Hint for which credential to fill. Ignored for security -- the actual domain is derived from the resolved tab URL. Kept for backward compatibility.'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple.'),
    },
    async ({ domain, tab_id }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('fill_credential', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = { domain };
        if (tab_id !== undefined) payload.tab_id = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:fill-credential',
          payload,
          { timeout: 15_000, targetTabId },
        );
        return mapFSBError(result);
      });
    },
  );

  // list_payment_methods -- returns last 4 + brand only (MCP-03)
  // Full card data is NEVER present in the response.
  server.tool(
    'list_payment_methods',
    'List saved payment methods. Returns card brand, last 4 digits, and cardholder name only -- full card numbers and CVV are never included. Use use_payment_method to fill a checkout form.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      const result = await sendBrowserMessage(
        bridge,
        agentScope,
        { type: 'mcp:list-payments', payload: {} },
        { timeout: 5_000 },
      );
      return mapFSBError(result);
    },
  );

  // use_payment_method -- terminal confirmation before fill (MCP-04)
  // Fill domain is derived from chrome.tabs.get inside the extension,
  // NOT from this MCP request payload.
  // Phase 246 D-13: vault overturn. agentId + optional tab_id + ownershipToken
  // + connectionId now thread through the bridge payload (mirrors fill_credential).
  server.tool(
    'use_payment_method',
    'Fill checkout form on the active tab with a saved payment method. Shows a confirmation prompt with card brand, last 4 digits, and merchant domain before any fill occurs. The fill domain is derived from the resolved tab URL inside the extension, not from this request. Requires both credential vault and payment access to be unlocked. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED. Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    {
      payment_method_id: z.string().describe('ID of the payment method to use (from list_payment_methods)'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple.'),
    },
    async ({ payment_method_id, tab_id }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('use_payment_method', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = { paymentMethodId: payment_method_id };
        if (tab_id !== undefined) payload.tab_id = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:use-payment-method',
          payload,
          { timeout: PAYMENT_CONFIRMATION_TIMEOUT_MS, targetTabId },
        );
        return mapFSBError(result);
      });
    },
  );
}
