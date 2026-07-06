import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawPrice, type StripeList, mapPrice, priceSchema } from './schemas.js';

export const listPrices = defineTool({
  name: 'list_prices',
  displayName: 'List Prices',
  description:
    'List prices in your Stripe account. Optionally filter by product. Returns prices sorted by creation date (newest first).',
  summary: 'List prices with pagination',
  icon: 'tag',
  group: 'Products',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of prices to return (default 10, max 100)'),
    starting_after: z.string().optional().describe('Price ID cursor — fetch prices created after this ID'),
    product: z.string().optional().describe('Filter by product ID'),
    active: z.boolean().optional().describe('Filter by active status'),
    type: z.enum(['one_time', 'recurring']).optional().describe('Filter by price type'),
  }),
  output: z.object({
    prices: z.array(priceSchema).describe('List of prices'),
    has_more: z.boolean().describe('Whether more prices exist after this page'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawPrice>>('/prices', {
      query: {
        limit: params.limit,
        starting_after: params.starting_after,
        product: params.product,
        active: params.active,
        type: params.type,
      },
    });
    return {
      prices: (data.data ?? []).map(mapPrice),
      has_more: data.has_more ?? false,
    };
  },
});
