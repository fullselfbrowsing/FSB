import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawProduct, mapProduct, productSchema } from './schemas.js';

export const updateProduct = defineTool({
  name: 'update_product',
  displayName: 'Update Product',
  description: 'Update an existing product. Only specified fields are changed; omitted fields remain unchanged.',
  summary: 'Update a product',
  icon: 'package-open',
  group: 'Products',
  input: z.object({
    product_id: z.string().describe('Product ID to update (e.g., prod_xxx)'),
    name: z.string().optional().describe('New product name'),
    description: z.string().optional().describe('New description'),
    active: z.boolean().optional().describe('Whether the product is available for purchase'),
    metadata: z.record(z.string(), z.string()).optional().describe('New metadata (replaces existing)'),
  }),
  output: z.object({ product: productSchema }),
  handle: async params => {
    const body: Record<string, unknown> = {};
    if (params.name !== undefined) body.name = params.name;
    if (params.description !== undefined) body.description = params.description;
    if (params.active !== undefined) body.active = params.active;
    if (params.metadata !== undefined) body.metadata = params.metadata;
    const data = await api<RawProduct>(`/products/${params.product_id}`, { method: 'POST', body });
    return { product: mapProduct(data) };
  },
});
