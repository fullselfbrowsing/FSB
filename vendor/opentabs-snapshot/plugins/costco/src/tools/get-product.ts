// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../costco-api.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description: 'Get the full detail (title, price, availability, and description) of a single Costco product by its item number.',
  summary: 'look up a single costco product',
  icon: 'package',
  group: 'Catalog',
  input: z.object({
    product_id: z.string().min(1).describe('The Costco item number / product ID to fetch'),
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
