import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlQuery } from '../instacart-api.js';
import { type RawOrder, mapOrder, orderSchema } from './schemas.js';

interface OrderConnection {
  orderDeliveriesConnection: {
    nodes?: RawOrder[];
    pageInfo?: { hasNextPage?: boolean; endCursor?: string };
  };
}

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description:
    'List recent Instacart orders with status, retailer, total, and item count. Supports cursor-based pagination. Returns orders sorted by most recent first.',
  summary: 'List recent orders',
  icon: 'receipt',
  group: 'Orders',
  input: z.object({
    first: z.number().int().min(1).max(50).optional().describe('Number of orders to return (default 10)'),
    after: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    orders: z.array(orderSchema).describe('Recent orders'),
    has_next_page: z.boolean().describe('Whether more orders are available'),
    end_cursor: z.string().describe('Cursor for the next page, empty if no more'),
  }),
  handle: async params => {
    const data = await gqlQuery<OrderConnection>('OrderDeliveriesConnection', {
      first: params.first ?? 10,
      after: params.after ?? null,
    });

    const conn = data.orderDeliveriesConnection;
    return {
      orders: (conn.nodes ?? []).map(mapOrder),
      has_next_page: conn.pageInfo?.hasNextPage ?? false,
      end_cursor: conn.pageInfo?.endCursor ?? '',
    };
  },
});
