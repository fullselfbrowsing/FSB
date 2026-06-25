// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../instacart-api.js';

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description: 'Search the products available in a single Instacart store by a query term.',
  summary: 'search for groceries on instacart',
  icon: 'search',
  group: 'Products',
  input: z.object({
    store_id: z.string().min(1).describe('The store to search within'),
    query: z.string().min(1).describe('The product search term'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of products to return'),
  }),
  output: z.object({
    products: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
    })).describe('Matching products'),
  }),
  handle: async (params: { store_id: string; query: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/stores/:id/products (default method, read).
    const data = await api<{ products: unknown[] }>(`/v1/stores/${params.store_id}/products`, {
      method: 'GET',
      query: { query: params.query, limit: params.limit },
    });
    return { products: data.products as { id: string; name: string; price: number }[] };
  },
});
