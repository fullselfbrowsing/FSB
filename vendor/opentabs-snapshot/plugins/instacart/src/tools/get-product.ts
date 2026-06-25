import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getLocationContext, gqlQuery } from '../instacart-api.js';
import { type RawProduct, mapProduct, productSchema } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product',
  description:
    'Get detailed information about a product by its item ID. The item ID format is "items_{shopId}-{productId}" (e.g. "items_121560-7079"). Requires a shop ID for pricing context.',
  summary: 'Get product details by item ID',
  icon: 'package',
  group: 'Shopping',
  input: z.object({
    item_ids: z.array(z.string()).min(1).describe('Item IDs to look up (format: items_{shopId}-{productId})'),
    shop_id: z.string().describe('Shop ID for pricing context'),
  }),
  output: z.object({
    products: z.array(productSchema).describe('Product details'),
  }),
  handle: async params => {
    const loc = getLocationContext();
    if (!loc) {
      throw ToolError.validation('No delivery location set.');
    }

    const data = await gqlQuery<{ items: RawProduct[] }>('Items', {
      ids: params.item_ids,
      shopId: params.shop_id,
      zoneId: loc.zoneId,
      postalCode: loc.postalCode,
    });

    return {
      products: (data.items ?? []).map(mapProduct),
    };
  },
});
