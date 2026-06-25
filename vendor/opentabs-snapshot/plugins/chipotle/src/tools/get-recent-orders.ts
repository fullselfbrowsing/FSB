import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawRecentOrder, mapRecentOrder, recentOrderSchema } from './schemas.js';

export const getRecentOrders = defineTool({
  name: 'get_recent_orders',
  displayName: 'Get Recent Orders',
  description:
    "Get the authenticated user's recent Chipotle orders with meal details, reorder availability, and order dates. Optionally filter by restaurant ID.",
  summary: 'Get recent order history with meal details',
  icon: 'clock',
  group: 'Orders',
  input: z.object({
    restaurant_id: z.number().int().optional().describe('Filter by restaurant ID'),
    total_records: z.number().int().optional().describe('Maximum number of orders to return (default 5)'),
  }),
  output: z.object({
    orders: z.array(recentOrderSchema).describe('Recent orders'),
  }),
  handle: async params => {
    const data = await api<RawRecentOrder[]>('/order/v3/customer/recent', {
      query: {
        restaurantId: params.restaurant_id,
        totalRecords: params.total_records ?? 5,
      },
    });
    return { orders: (data ?? []).map(mapRecentOrder) };
  },
});
