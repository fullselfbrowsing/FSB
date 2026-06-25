import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bestbuy-api.js';
import { mapOrder, orderSchema, type RawOrder } from './schemas.js';

interface PurchasesResponse {
  orderList?: {
    orders?: RawOrder[];
  };
}

export const listPurchases = defineTool({
  name: 'list_purchases',
  displayName: 'List Purchases',
  description:
    'List purchase history from Best Buy. Returns all orders including in-store purchases and online orders. Each order includes order ID, channel (store/online), date, total amount, and line items with product details. Optionally filter by year (e.g., 2024). By default returns the past 3 years of purchases. Negative totals indicate returns.',
  summary: 'List purchase history',
  icon: 'list',
  group: 'Purchases',
  input: z.object({
    year: z
      .number()
      .int()
      .min(2010)
      .max(2030)
      .optional()
      .describe('Filter by year (e.g., 2024). Omit for past 3 years.'),
  }),
  output: z.object({
    orders: z.array(orderSchema).describe('Purchase orders'),
  }),
  handle: async params => {
    const query = params.year ? `?year=${params.year}` : '';
    const data = await api<PurchasesResponse>(`/purchasehistory/rest/purchases${query}`);

    return { orders: (data.orderList?.orders ?? []).map(mapOrder) };
  },
});
