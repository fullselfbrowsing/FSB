import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawProduct, mapProduct, productSchema } from './schemas.js';

export const createProduct = defineTool({
  name: 'create_product',
  displayName: 'Create Product',
  description: 'Create a new product. Products describe the specific goods or services you offer to your customers.',
  summary: 'Create a new product',
  icon: 'package-plus',
  group: 'Products',
  input: z.object({
    name: z.string().describe('Product name'),
    description: z.string().optional().describe('Product description'),
    active: z.boolean().optional().describe('Whether the product is available for purchase (default true)'),
    metadata: z.record(z.string(), z.string()).optional().describe('Arbitrary key-value metadata'),
  }),
  output: z.object({ product: productSchema }),
  handle: async params => {
    const body: Record<string, unknown> = { name: params.name };
    if (params.description !== undefined) body.description = params.description;
    if (params.active !== undefined) body.active = params.active;
    if (params.metadata !== undefined) body.metadata = params.metadata;
    const data = await api<RawProduct>('/products', { method: 'POST', body });
    return { product: mapProduct(data) };
  },
});
