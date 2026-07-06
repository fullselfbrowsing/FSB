import { defineTool, fetchJSON, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapProduct, productSchema, type RawPriceBlock } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description:
    'Get detailed information about a Best Buy product by its SKU ID. Returns description, pricing, availability, fulfillment options, and reviews. Use search_products to find SKU IDs.',
  summary: 'Get product details by SKU ID',
  icon: 'package',
  group: 'Products',
  input: z.object({
    sku_id: z.string().describe('Best Buy SKU ID (e.g., "6612975")'),
  }),
  output: z.object({
    product: productSchema.describe('Product details'),
  }),
  handle: async params => {
    const blocks = await fetchJSON<RawPriceBlock[]>(`/api/3.0/priceBlocks?skus=${params.sku_id}`);
    const block = blocks?.[0];

    if (!block?.sku) {
      throw ToolError.notFound(`Product with SKU ID "${params.sku_id}" not found`);
    }

    return { product: mapProduct(block) };
  },
});
