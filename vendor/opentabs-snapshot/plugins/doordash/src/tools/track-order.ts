// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../doordash-api.js';

export const trackOrder = defineTool({
  name: 'track_order',
  displayName: 'Track Order',
  description: 'Track the live delivery status and ETA of a single DoorDash order by its ID.',
  summary: 'track my doordash order',
  icon: 'map-pin',
  group: 'Orders',
  input: z.object({
    order_id: z.string().min(1).describe('The order ID to track'),
  }),
  output: z.object({
    status: z.string().describe('Current delivery status'),
    eta_minutes: z.number().describe('Estimated minutes until delivery'),
  }),
  handle: async (params: { order_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/orders/:id/tracking (default method, read).
    const data = await api<{ status: string; eta_minutes: number }>(
      `/v1/orders/${params.order_id}/tracking`,
      { method: 'GET' }
    );
    return { status: data.status, eta_minutes: data.eta_minutes };
  },
});
