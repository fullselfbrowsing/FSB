// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../instacart-api.js';

export const cancelOrder = defineTool({
  name: 'cancel_order',
  displayName: 'Cancel Order',
  description: 'Cancel an in-progress Instacart order by its ID. This may be irreversible once the shopper has started.',
  summary: 'cancel my instacart order',
  icon: 'x-circle',
  group: 'Orders',
  input: z.object({
    order_id: z.string().min(1).describe('The order ID to cancel'),
    reason: z.string().optional().describe('Optional cancellation reason'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the order was successfully cancelled'),
  }),
  handle: async (params: { order_id: string; reason?: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /v1/orders/:id
    // (cancel -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/v1/orders/${params.order_id}`, { method: 'DELETE', body: { reason: params.reason } });
    return { success: true };
  },
});
