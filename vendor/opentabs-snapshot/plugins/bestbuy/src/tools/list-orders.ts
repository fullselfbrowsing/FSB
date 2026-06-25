// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../bestbuy-api.js';

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description: 'List your recent Best Buy orders. Optionally filter by status (open, shipped, ready_for_pickup, delivered, cancelled).',
  summary: 'show me my bestbuy order history',
  icon: 'receipt',
  group: 'Orders',
  input: z.object({
    status: z.enum(['open', 'shipped', 'ready_for_pickup', 'delivered', 'cancelled']).optional().describe('Filter orders by status'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of orders to return'),
  }),
  output: z.object({
    orders: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('Your recent orders'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/orders (default method, read).
    const data = await api<{ orders: unknown[] }>('/v1/orders', {
      query: { status: params.status, limit: params.limit },
    });
    return { orders: data.orders as { id: string; status: string }[] };
  },
});
