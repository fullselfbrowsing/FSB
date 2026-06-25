import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../starbucks-api.js';
import { mapProduct, productSchema } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description:
    'Get details for a specific menu product at a store, including name, description, image, Star cost, and product type. Requires product number and form (e.g., "iced" or "hot").',
  summary: 'Get product details by number and form',
  icon: 'coffee',
  group: 'Menu',
  input: z.object({
    product_number: z.number().int().describe('Product number (from get_store_menu results)'),
    form: z.string().describe('Product form (e.g., "iced", "hot")'),
    store_number: z.string().describe('Store number for availability and pricing'),
  }),
  output: z.object({ product: productSchema }),
  handle: async params => {
    interface ProductResponse {
      products?: Array<Record<string, unknown>>;
    }
    const data = await api<ProductResponse>(`/ordering/${params.product_number}/${params.form}`, {
      query: { storeNumber: params.store_number },
    });
    const product = data.products?.[0];
    return {
      product: mapProduct((product ?? {}) as Parameters<typeof mapProduct>[0]),
    };
  },
});
