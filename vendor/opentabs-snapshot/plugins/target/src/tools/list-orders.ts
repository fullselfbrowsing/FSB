import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../target-api.js';
import { orderSchema, mapOrder } from './schemas.js';
import type { RawOrder } from './schemas.js';

interface OrderHistoryResponse {
  total_orders?: number;
  total_pages?: number;
  orders?: RawOrder[];
}

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description:
    "List the user's Target order history with order number, date, total, and line items. Supports pagination. Returns both online and in-store orders.",
  summary: 'List order history',
  icon: 'receipt',
  group: 'Orders',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    per_page: z.number().int().min(1).max(20).optional().describe('Orders per page (default 10, max 20)'),
  }),
  output: z.object({
    orders: z.array(orderSchema),
    total_orders: z.number().int().describe('Total number of orders'),
    total_pages: z.number().int().describe('Total number of pages'),
  }),
  handle: async params => {
    const data = await api<OrderHistoryResponse>('guest_order_aggregations/v1/order_history', {
      query: {
        page: params.page ?? 1,
        per_page: params.per_page ?? 10,
      },
    });
    return {
      orders: (data.orders ?? []).map(mapOrder),
      total_orders: data.total_orders ?? 0,
      total_pages: data.total_pages ?? 0,
    };
  },
});
