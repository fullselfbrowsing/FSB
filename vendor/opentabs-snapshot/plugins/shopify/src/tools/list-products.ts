// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../shopify-api.js';

export const listProducts = defineTool({
  name: 'list_products',
  displayName: 'List Products',
  description:
    'List the products in a Shopify store. Optionally filter by collection or search term and limit the result count.',
  summary: 'list products on shopify',
  icon: 'tag',
  group: 'Catalog',
  input: z.object({
    collection: z.string().optional().describe('Collection handle or ID to filter by'),
    query: z.string().optional().describe('Search term to filter products by title'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum number of products to return'),
  }),
  output: z.object({
    products: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
    })).describe('The store products'),
  }),
  handle: async (params: { collection?: string; query?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /admin/api/products (default method, read).
    const data = await api<{ products: unknown[] }>('/admin/api/products', {
      query: { collection: params.collection, query: params.query, limit: params.limit },
    });
    return { products: data.products as { id: string; title: string; price: number }[] };
  },
});
