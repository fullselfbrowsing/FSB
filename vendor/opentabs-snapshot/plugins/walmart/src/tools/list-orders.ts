import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData, isAuthenticated } from '../walmart-api.js';
import { mapOrder, orderSchema, type RawOrder } from './schemas.js';

export const listOrders = defineTool({
  name: 'list_orders',
  displayName: 'List Orders',
  description: 'List recent Walmart purchase history. Returns orders with items, status, and delivery information.',
  summary: 'List recent purchase history',
  icon: 'package',
  group: 'Orders',
  input: z.object({}),
  output: z.object({
    orders: z.array(orderSchema),
  }),
  handle: async () => {
    if (!isAuthenticated()) {
      throw ToolError.auth('Not logged in to Walmart.');
    }

    const data = await fetchPageData('/orders');

    const phData = data.phRedesignInitialData as Record<string, unknown> | undefined;
    const phInner = phData?.data as Record<string, unknown> | undefined;
    const purchaseHistory = phInner?.purchaseHistory as Record<string, unknown> | undefined;
    const rawOrders = (purchaseHistory?.orders ?? []) as RawOrder[];

    return {
      orders: rawOrders.map(mapOrder),
    };
  },
});
