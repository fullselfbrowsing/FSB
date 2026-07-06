// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../amazon-api.js';

export const trackOrder = defineTool({
  name: 'track_order',
  displayName: 'Track Order',
  description: 'Track the live shipment status and estimated delivery date of a single Amazon order by its ID.',
  summary: 'track my amazon order',
  icon: 'truck',
  group: 'Orders',
  input: z.object({
    order_id: z.string().min(1).describe('The order ID to track'),
  }),
  output: z.object({
    status: z.string().describe('Current shipment status'),
    estimated_delivery: z.string().describe('Estimated delivery date'),
  }),
  handle: async (params: { order_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/orders/:id/tracking (default method, read).
    const data = await api<{ status: string; estimated_delivery: string }>(
      `/v1/orders/${params.order_id}/tracking`,
      { method: 'GET' }
    );
    return { status: data.status, estimated_delivery: data.estimated_delivery };
  },
});
