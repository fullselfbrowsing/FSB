// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../walmart-api.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description: 'Get the full detail (title, price, availability, and description) of a single Walmart product by its item ID.',
  summary: 'look up a single walmart product',
  icon: 'package',
  group: 'Catalog',
  input: z.object({
    product_id: z.string().min(1).describe('The item / product ID to fetch'),
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
    // NEVER executed by the importer. Upstream: api GET /v1/products/:id (default method, read).
    const data = await api<{ product: { id: string; title: string; price: number; in_stock: boolean } }>(
      `/v1/products/${params.product_id}`
    );
    return { product: data.product };
  },
});
