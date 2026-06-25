import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../target-api.js';
import { orderSchema, mapOrder } from './schemas.js';
import type { RawOrder } from './schemas.js';

interface OrderSearchResponse {
  orders?: RawOrder[];
}

export const getOrder = defineTool({
  name: 'get_order',
  displayName: 'Get Order',
  description:
    'Get details for a specific Target order by order number. Returns order items, fulfillment status, and total. Use list_orders to find order numbers.',
  summary: 'Get details for a specific order',
  icon: 'file-text',
  group: 'Orders',
  input: z.object({
    order_number: z.string().describe('Order number (e.g., "912003308575842")'),
  }),
  output: z.object({ order: orderSchema }),
  handle: async params => {
    const data = await api<OrderSearchResponse>('guest_order_aggregations/v1/orders/search', {
      query: { order_number: params.order_number },
    });
    const order = data.orders?.[0] ?? {};
    return { order: mapOrder(order as RawOrder) };
  },
});
