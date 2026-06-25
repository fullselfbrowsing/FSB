import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { orchestraApi } from '../starbucks-api.js';

const previousOrderSchema = z.object({
  order_id: z.string().describe('Order ID'),
  store_name: z.string().describe('Store name where the order was placed'),
  store_number: z.string().describe('Store number'),
  order_date: z.string().describe('Order date (ISO 8601)'),
  total: z.string().describe('Order total (formatted, e.g., "$5.95")'),
  items: z
    .array(
      z.object({
        name: z.string().describe('Item name'),
        quantity: z.number().describe('Quantity ordered'),
      }),
    )
    .describe('Items in the order'),
});

interface RawOrderItem {
  name?: string;
  quantity?: number;
}

interface RawPreviousOrder {
  orderId?: string;
  storeName?: string;
  storeNumber?: string;
  orderDate?: string;
  orderTotal?: string;
  basket?: { items?: RawOrderItem[] };
}

const mapPreviousOrder = (o: RawPreviousOrder) => ({
  order_id: o.orderId ?? '',
  store_name: o.storeName ?? '',
  store_number: o.storeNumber ?? '',
  order_date: o.orderDate ?? '',
  total: o.orderTotal ?? '',
  items: (o.basket?.items ?? []).map(i => ({
    name: i.name ?? '',
    quantity: i.quantity ?? 1,
  })),
});

export const getPreviousOrders = defineTool({
  name: 'get_previous_orders',
  displayName: 'Get Previous Orders',
  description:
    "Get the user's previous Starbucks orders with store info, order total, and items. Requires a store number to scope the results.",
  summary: 'List previous orders',
  icon: 'history',
  group: 'Orders',
  input: z.object({
    store_number: z
      .string()
      .optional()
      .describe('Store number to scope results (e.g., "53646-283069"). Omit for all stores.'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of orders to return (default 10)'),
  }),
  output: z.object({
    orders: z.array(previousOrderSchema).describe('Previous orders'),
  }),
  handle: async params => {
    interface OrchestraResponse {
      data?: { previousOrders?: RawPreviousOrder[] };
    }
    const data = await orchestraApi<OrchestraResponse>('get-previous-orders', {
      storeNumber: params.store_number ?? null,
      locale: 'en-US',
      limit: params.limit ?? 10,
    });
    return {
      orders: (data.data?.previousOrders ?? []).map(mapPreviousOrder),
    };
  },
});
