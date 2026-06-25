import { defineTool, postJSON } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { addToCartResponseSchema, mapAddToCartResponse, type RawAddToCartResponse } from './schemas.js';

export const addToCart = defineTool({
  name: 'add_to_cart',
  displayName: 'Add to Cart',
  description:
    'Add a product to the Best Buy shopping cart by its SKU ID. Use search_products or get_product to find SKU IDs. Returns the updated cart item count and subtotal.',
  summary: 'Add a product to the cart',
  icon: 'plus-circle',
  group: 'Cart',
  input: z.object({
    sku_id: z.string().describe('Best Buy SKU ID of the product to add (e.g., "6612975")'),
  }),
  output: addToCartResponseSchema,
  handle: async params => {
    const data = await postJSON<RawAddToCartResponse>('/cart/api/v1/addToCart', {
      items: [{ skuId: params.sku_id }],
    });

    return mapAddToCartResponse(data ?? {});
  },
});
