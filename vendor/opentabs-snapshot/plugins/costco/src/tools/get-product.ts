import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchProducts } from '../costco-api.js';
import { mapProduct, productSchema } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description:
    'Get detailed information about a Costco product by its item number. Returns pricing, description, rating, availability, and more.',
  summary: 'Get product details by item number',
  icon: 'package',
  group: 'Products',
  input: z.object({
    item_number: z.string().describe('Costco item number (e.g., "4000369340")'),
    warehouse_number: z.string().optional().describe('Warehouse number for pricing (defaults to nearest warehouse)'),
  }),
  output: z.object({ product: productSchema }),
  handle: async params => {
    const resp = await fetchProducts([params.item_number], params.warehouse_number);
    const catalog = resp.data?.products?.catalogData?.[0];
    if (!catalog) throw ToolError.notFound(`Product ${params.item_number} not found.`);
    const fulfillment = resp.data?.products?.fulfillmentData?.[0];
    return { product: mapProduct(catalog, fulfillment) };
  },
});
