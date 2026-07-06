// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../shopify-api.js';

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description: 'List the orders in a Shopify store. Optionally filter by fulfillment or financial status.',
  summary: 'show me my shopify order history',
  icon: 'receipt',
  group: 'Orders',
  input: z.object({
    status: z.enum(['open', 'closed', 'cancelled', 'any']).optional().describe('Filter orders by status'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of orders to return'),
  }),
  output: z.object({
    orders: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('The store orders'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /admin/api/orders (default method, read).
    const data = await api<{ orders: unknown[] }>('/admin/api/orders', {
      query: { status: params.status, limit: params.limit },
    });
    return { orders: data.orders as { id: string; status: string }[] };
  },
});
