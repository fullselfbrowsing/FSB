// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../dominos-api.js';

export const trackOrder = defineTool({
  name: 'track_order',
  displayName: 'Track Order',
  description: 'Track the live status of a single Domino’s order by its ID (prep, baking, out for delivery, delivered).',
  summary: 'track my dominos order',
  icon: 'truck',
  group: 'Orders',
  input: z.object({
    order_id: z.string().min(1).describe('The order ID to track'),
  }),
  output: z.object({
    tracking: z.object({
      order_id: z.string(),
      stage: z.string(),
      eta_minutes: z.number(),
    }).describe('The live tracking status'),
  }),
  handle: async (params: { order_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /orders/:id/track (default method, read).
    const data = await api<{ tracking: { order_id: string; stage: string; eta_minutes: number } }>(
      `/orders/${params.order_id}/track`
    );
    return { tracking: data.tracking };
  },
});
