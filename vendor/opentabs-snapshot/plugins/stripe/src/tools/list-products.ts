import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawProduct, type StripeList, mapProduct, productSchema } from './schemas.js';

export const listProducts = defineTool({
  name: 'list_products',
  displayName: 'List Products',
  description:
    'List products in your Stripe account. Returns products sorted by creation date (newest first). Use starting_after for cursor-based pagination.',
  summary: 'List products with pagination',
  icon: 'package',
  group: 'Products',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of products to return (default 10, max 100)'),
    starting_after: z.string().optional().describe('Product ID cursor — fetch products created after this ID'),
    active: z.boolean().optional().describe('Filter by active status'),
  }),
  output: z.object({
    products: z.array(productSchema).describe('List of products'),
    has_more: z.boolean().describe('Whether more products exist after this page'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawProduct>>('/products', {
      query: {
        limit: params.limit,
        starting_after: params.starting_after,
        active: params.active,
      },
    });
    return {
      products: (data.data ?? []).map(mapProduct),
      has_more: data.has_more ?? false,
    };
  },
});
