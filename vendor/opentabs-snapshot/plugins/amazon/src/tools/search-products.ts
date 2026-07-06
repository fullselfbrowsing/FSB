// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../amazon-api.js';

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    'Search the Amazon product catalog by keyword. Optionally filter by department/category and sort the results.',
  summary: 'search for products on amazon',
  icon: 'search',
  group: 'Catalog',
  input: z.object({
    query: z.string().min(1).describe('Search keywords (product name, brand, or description)'),
    category: z.string().optional().describe('Department or category to filter by'),
    sort: z.enum(['relevance', 'price_low_to_high', 'price_high_to_low', 'rating']).optional().describe('Result ordering'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of products to return'),
  }),
  output: z.object({
    products: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
    })).describe('Matching products'),
  }),
  handle: async (params: { query: string; category?: string; sort?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/products/search (default method, read).
    const data = await api<{ products: unknown[] }>('/v1/products/search', {
      query: { query: params.query, category: params.category, sort: params.sort, limit: params.limit },
    });
    return { products: data.products as { id: string; title: string; price: number }[] };
  },
});
