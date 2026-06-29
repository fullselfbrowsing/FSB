import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { WebSocketBridge } from '../bridge.js';
import type { TaskQueue } from '../queue.js';
import { AgentScope } from '../agent-scope.js';
import { sendAgentScopedBridgeMessage } from '../agent-bridge.js';
import { mapFSBError } from '../errors.js';

// invoke_capability does a real authenticated network round-trip in the page
// MAIN world (interpretRecipe -> executeBoundSpec), so it gets a longer timeout
// than the read-only search. Shorter than the 125s payment gate; a discovery
// search stays at the 5s read-only budget.
const CAPABILITY_INVOKE_TIMEOUT_MS = 30_000;

/**
 * Register the lean two-tool capability surface: search_capabilities (read-only,
 * progressive disclosure) and invoke_capability (queued, real side effects).
 *
 * SECURITY: These tools are registered directly (not via TOOL_REGISTRY) to
 * maintain an explicit security boundary -- this is the INV-01 seam. Keeping
 * them out of the registry holds the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH
 * (tool-definitions-parity) byte-stable and avoids forcing autopilot exposure
 * via getPublicTools(). The read-only/queued split lives entirely in
 * queue.ts's readOnlyTools Set: search_capabilities is a member (bypasses the
 * mutation queue, like search_memory); invoke_capability is NOT (serialized,
 * like fill_credential), so a mutating invoke can never race ahead of an
 * in-flight mutation.
 */
export function registerCapabilityTools(
  server: McpServer,
  bridge: WebSocketBridge,
  queue: TaskQueue,
  agentScope: AgentScope,
): void {
  // search_capabilities -- read-only progressive disclosure (SURF-01, SURF-05).
  // The model sees TWO tools, never the full slug-as-schema catalog. Returns up
  // to topN ranked hits, each with the params JSON-Schema (schema-on-hit) so the
  // model can construct invoke_capability args in one round-trip. The literal
  // name 'search_capabilities' MUST also live in queue.ts readOnlyTools or the
  // enqueue() below serializes instead of bypassing (search_memory precedent).
  server.tool(
    'search_capabilities',
    'Search the FSB capability catalog by intent. Use before DOM tools for first-party actions on the current site. Returns up to topN ranked capabilities with slug, service, side-effect class (read/mutate/destructive), readiness status, description, and params JSON-Schema (schema-on-hit). Results are biased toward the resolved tab origin; only t1-ready hits are direct API executable.',
    {
      query: z.string().describe('Natural-language intent, e.g. "show my github notifications"'),
      origin: z.string().optional().describe('Optional expected-origin hint (e.g. "https://github.com"). For agent-scoped calls, omit to use the resolved owned tab origin; if supplied, it must match that tab origin. Legacy callers may still use it as an origin override.'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional tab id; omit to use the active/owned tab'),
      topN: z.coerce.number().int().positive().finite().optional().describe('Max results (default 5, max 5)'),
    },
    async ({ query, origin, tab_id, topN }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      // enqueue() bypasses the queue immediately because 'search_capabilities'
      // is in the readOnlyTools Set -- discovery never parks behind a mutation.
      return queue.enqueue('search_capabilities', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = { query, origin, topN };
        if (tab_id !== undefined) payload.tab_id = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:capabilities-search',
          payload,
          { timeout: 5_000, targetTabId },
        );
        return mapFSBError(result);
      });
    },
  );

  // invoke_capability -- serialized execution (SURF-02, SURF-05). The schema is
  // GENERIC ({slug, params?, tab_id?}) because a static server.tool() schema
  // cannot express dynamic per-recipe params; the actual param validation runs
  // SW-side inside interpretRecipe against the recipe's params sub-document.
  // NOT in readOnlyTools -> queue.enqueue serializes it (fill_credential
  // precedent), so a mutating invoke can never race an in-flight mutation.
  server.tool(
    'invoke_capability',
    'Invoke a capability by slug (from a search_capabilities hit) with validated params. Verified T1/T1b capabilities execute the service\'s real web API in your authenticated session and return a structured result; guarded or catalog-tail hits return typed pending/fallback responses. Mutating ready capabilities perform real side effects -- check the side-effect class first. If it returns RECIPE_DOM_FALLBACK_PENDING, RECIPE_LEARN_PENDING, or RECIPE_EXPIRED, continue the same task with DOM tools.',
    {
      slug: z.string().describe('Capability slug from a search_capabilities hit'),
      params: z.record(z.any()).optional().describe('Parameters matching the hit\'s params JSON-Schema'),
      tab_id: z.coerce.number().int().positive().finite().optional().describe('Optional tab id; omit to use the active/owned tab'),
    },
    async ({ slug, params, tab_id }) => {
      if (!bridge.isConnected) {
        return mapFSBError({ success: false, error: 'extension_not_connected' });
      }
      return queue.enqueue('invoke_capability', async () => {
        const targetTabId = typeof tab_id === 'number' ? tab_id : null;
        const payload: Record<string, unknown> = { slug, params: params || {} };
        if (tab_id !== undefined) payload.tab_id = tab_id;
        const result = await sendAgentScopedBridgeMessage(
          bridge,
          agentScope,
          'mcp:capabilities-invoke',
          payload,
          { timeout: CAPABILITY_INVOKE_TIMEOUT_MS, targetTabId },
        );
        return mapFSBError(result);
      });
    },
  );
}
