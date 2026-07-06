import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import type { RawFulfillment, RawProductCatalog } from '../costco-api.js';
import { fetchProducts } from '../costco-api.js';
import { mapProduct, productSchema } from './schemas.js';

export const getProducts = defineTool({
  name: 'get_products',
  displayName: 'Get Products',
  description:
    'Get details for multiple Costco products by their item numbers in a single request. Returns pricing, description, rating, and more for each product.',
  summary: 'Get multiple products by item numbers',
  icon: 'package',
  group: 'Products',
  input: z.object({
    item_numbers: z.array(z.string()).describe('Array of Costco item numbers (max 25)'),
    warehouse_number: z.string().optional().describe('Warehouse number for pricing (defaults to nearest warehouse)'),
  }),
  output: z.object({ products: z.array(productSchema) }),
  handle: async params => {
    const items = params.item_numbers.slice(0, 25);
    const resp = await fetchProducts(items, params.warehouse_number);
    const catalogData = resp.data?.products?.catalogData ?? [];
    const fulfillmentData = resp.data?.products?.fulfillmentData ?? [];

    const products = catalogData.map((c: RawProductCatalog) => {
      const f = fulfillmentData.find((fd: RawFulfillment) => fd.itemNumber === c.itemNumber);
      return mapProduct(c, f);
    });

    return { products };
  },
});
