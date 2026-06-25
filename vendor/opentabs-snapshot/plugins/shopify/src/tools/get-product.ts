// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../shopify-api.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description: 'Get the full detail (title, price, variants, inventory, and description) of a single Shopify product by its ID.',
  summary: 'look up a single shopify product',
  icon: 'package',
  group: 'Catalog',
  input: z.object({
    product_id: z.string().min(1).describe('The product ID to fetch'),
  }),
  output: z.object({
    product: z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      in_stock: z.boolean(),
    }).describe('The product detail'),
  }),
  handle: async (params: { product_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /admin/api/products/:id (default method, read).
    const data = await api<{ product: { id: string; title: string; price: number; in_stock: boolean } }>(
      `/admin/api/products/${params.product_id}`
    );
    return { product: data.product };
  },
});
