import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawPrice, mapPrice, priceSchema } from './schemas.js';

export const createPrice = defineTool({
  name: 'create_price',
  displayName: 'Create Price',
  description: 'Create a new price for a product. Prices define how much and how often to charge for a product.',
  summary: 'Create a new price',
  icon: 'tag',
  group: 'Products',
  input: z.object({
    product: z.string().describe('Product ID to attach this price to'),
    unit_amount: z.number().int().describe('Price in smallest currency unit (e.g., 1000 = $10.00)'),
    currency: z.string().describe('Three-letter ISO currency code (e.g., usd)'),
    recurring_interval: z
      .enum(['day', 'week', 'month', 'year'])
      .optional()
      .describe('Billing interval for recurring prices (omit for one-time)'),
    recurring_interval_count: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe('Number of intervals between billings (default 1)'),
    metadata: z.record(z.string(), z.string()).optional().describe('Arbitrary key-value metadata'),
  }),
  output: z.object({ price: priceSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {
      product: params.product,
      unit_amount: params.unit_amount,
      currency: params.currency,
    };
    if (params.recurring_interval !== undefined) {
      body.recurring = {
        interval: params.recurring_interval,
        interval_count: params.recurring_interval_count ?? 1,
      };
    }
    if (params.metadata !== undefined) body.metadata = params.metadata;
    const data = await api<RawPrice>('/prices', { method: 'POST', body });
    return { price: mapPrice(data) };
  },
});
