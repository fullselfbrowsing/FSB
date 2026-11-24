import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';

// The first 1Password call in a while can wait on the user approving FSB in the
// 1Password desktop app, so these leave room for that prompt.
const LIST_TIMEOUT_MS = 75_000;
// With nothing saved for the site, the user gets up to 2 minutes to type a
// login on the page, then saving it may wait on 1Password again.
const FILL_TIMEOUT_MS = 250_000;
// Card metadata lookup and the card read, each of which may wait on a
// 1Password approval. Over MCP FSB shows no prompt of its own: the agent asks
// the user first.
const PAYMENT_CONFIRMATION_TIMEOUT_MS = 160_000;
const MAX_CANDIDATES = 20;

/**
 * Several 1Password logins match the tab's site. mapFSBError renders only the
 * error text, which would drop the candidates and file this under page
 * navigation, so the choice is answered here. Each candidate is rebuilt from
 * id, title, and username only, so no other field can reach the tool result.
 * Returns null for any other result.
 */
export function multipleCredentialsResult(
  result: Record<string, unknown> | null | undefined,
): { content: Array<{ type: 'text'; text: string }>; isError: true } | null {
  if (!result || result.success === true || result.errorCode !== 'multiple_credentials') return null;
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const candidates = (Array.isArray(result.candidates) ? result.candidates : [])
    .map((entry) => {
      const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const candidate: { id: string; title: string; username: string; vault?: string } = {
        id: text(record.id),
        title: text(record.title),
        username: text(record.username),
      };
      // Which vault holds it, when 1Password named one: two copies of a login
      // in different vaults otherwise look the same.
      if (text(record.vault)) candidate.vault = text(record.vault);
      return candidate;
    })
    .filter((candidate) => candidate.id)
    .slice(0, MAX_CANDIDATES);
  const lines = [
    'Detected: Several 1Password logins match this site',
    `Why: ${text(result.error) || 'More than one saved login matches the tab\'s site.'}`,
    candidates.length > 0
      ? 'Next action: Call fill_credential again with credential_id set to the id of the login to use.'
      : 'Next action: Call list_credentials, then call fill_credential again with credential_id set to the id of the login to use.',
  ];
  return {
    isError: true,
    content: [{
      type: 'text',
      text: `${lines.join('\n')}\n\n${JSON.stringify({ errorCode: 'multiple_credentials', candidates }, null, 2)}`,
    }],
  };
}

/**
 * Register the credential tools: list_credentials, fill_credential,
 * list_payment_methods, use_payment_method.
 *
 * Credentials come from the user's 1Password account: every vault the sign-in
 * can read, or only the vaults the user limited FSB to. The FSB server's
 * 1Password broker resolves items for the extension over the paired loopback
 * bridge; the extension fills them into the page. Tool results carry only
 * ids, titles, hosts, usernames, vault names, and card brand, last 4,
 * cardholder name, and expiry -- never passwords, one-time codes, card
 * numbers, or CVVs.
 *
 * SECURITY: registered directly (not via TOOL_REGISTRY) to keep an explicit
 * security boundary around everything that ends in a secret being typed.
 */
export function registerVaultTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // Phase 246 D-13: fill_credential and use_payment_method are agent-scoped
  // (agentId + optional tab_id reach the extension-side resolver, the dispatch
  // gate enforces ownership). The list tools stay tab-agnostic.
  server.tool(
    'list_credentials',
    'List the 1Password logins FSB may use (every vault the user\'s 1Password sign-in can read, unless the user limited FSB to some vaults). Returns id, title, saved website domains, and username for each login -- passwords and one-time codes are never included. Use fill_credential to sign in.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      const result = await bridge.sendAndWait(
        { type: 'mcp:list-credentials', payload: {} },
        { timeout: LIST_TIMEOUT_MS },
      );
      return mapFSBError(result);
    },
  );

  server.tool(
    'fill_credential',
    'Sign in on the agent\'s tab with a login from the user\'s 1Password. Fills whichever login fields the page shows: username, password, and a one-time (TOTP) code when the 1Password item has one -- call it again on a two-factor code page. Values are resolved by FSB and typed into the page; they never appear in this tool\'s result. The login is chosen from the tab\'s real URL, never from a parameter. If nothing is saved for the site, FSB asks the user on the page to type a login (and optionally save it to 1Password); the call waits up to 2 minutes for them, and the result says by: "you". If they decline, the call fails with credential_not_provided: never ask for the password in chat. If several logins match, the call fails with the candidates; pass credential_id (from list_credentials or that error) to pick one. Does not press submit. The first call may wait for the user to approve FSB in the 1Password app. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED. Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    {
      credential_id: z.string().max(140).optional().describe('Optional. A login id from list_credentials. It must still be saved for the tab\'s site, otherwise the fill is refused.'),
      domain: z.string().optional().describe('Ignored. The site is always derived from the resolved tab URL. Kept for backward compatibility.'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional. Tab id this action targets. Omit when the calling agent owns exactly one tab; pass to disambiguate when the agent owns multiple.'),
    },
    async ({ credential_id, domain, tab_id }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('fill_credential', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = { domain };
        if (credential_id !== undefined) payload.credentialId = credential_id;
        if (tab_id !== undefined) payload.tab_id = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:fill-credential',
          payload,
          { timeout: FILL_TIMEOUT_MS, targetTabId },
        );
        return multipleCredentialsResult(result) ?? mapFSBError(result);
      });
    },
  );

  server.tool(
    'list_payment_methods',
    'List the credit cards saved in the 1Password vaults FSB may use. Returns id, title, card brand, last 4 digits, cardholder name, and expiry month/year -- full card numbers and CVVs are never included. Use use_payment_method to fill a checkout form.',
    {},
    async () => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      const result = await bridge.sendAndWait(
        { type: 'mcp:list-payments', payload: {} },
        { timeout: LIST_TIMEOUT_MS },
      );
      return mapFSBError(result);
    },
  );

  // Fill domain comes from chrome.tabs.get inside the extension, not from this
  // request. Over MCP the agent must ask the user before calling this tool;
  // FSB fills only https pages and only while the tab stays on that site.
  server.tool(
    'use_payment_method',
    'Fill the checkout form on the agent\'s tab with a credit card from the user\'s 1Password. FSB shows no approval prompt of its own: before calling, ask the user in this conversation and name the card (title, brand, last 4 from list_payment_methods) and the merchant. FSB fills only https pages, and only while the tab stays on the site it was on (taken from the tab URL, not this request); the card number and CVV never appear in the result. Never submits the payment. Multi-agent: agent-scoped tabs; cross-agent reject with TAB_NOT_OWNED. Pass tab_id only when this agent owns multiple tabs; auto-resolves otherwise.',
    {
      payment_method_id: z.string().max(140).describe('ID of the card to use (from list_payment_methods)'),
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
