import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawProduct, mapProduct, productSchema } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description: 'Get detailed information about a specific product by its ID.',
  summary: 'Get a product by ID',
  icon: 'package',
  group: 'Products',
  input: z.object({
    product_id: z.string().describe('Product ID (e.g., prod_xxx)'),
  }),
  output: z.object({ product: productSchema }),
  handle: async params => {
    const data = await api<RawProduct>(`/products/${params.product_id}`);
    return { product: mapProduct(data) };
  },
});
