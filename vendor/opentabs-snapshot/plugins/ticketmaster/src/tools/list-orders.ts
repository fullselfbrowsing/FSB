// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ticketmaster-api.js';

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description: 'List your Ticketmaster ticket orders. Optionally filter by status (upcoming, past, cancelled).',
  summary: 'show me my ticketmaster orders',
  icon: 'list',
  group: 'Orders',
  input: z.object({
    status: z.enum(['upcoming', 'past', 'cancelled']).optional().describe('Filter orders by status'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of orders to return'),
  }),
  output: z.object({
    orders: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('Your ticket orders'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /orders (default method).
    const data = await api<{ orders: unknown[] }>('/orders', {
      query: { status: params.status, limit: params.limit },
    });
    return { orders: data.orders as { id: string; status: string }[] };
  },
});
