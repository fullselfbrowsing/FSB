import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlQuery } from '../instacart-api.js';
import { type RawCart, cartSchema, mapCart } from './schemas.js';

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'Get Cart',
  description:
    'Get full details of a shopping cart by its ID, including all items with item IDs and quantities. Use list_active_carts first to discover cart IDs. Use get_product with item IDs to get product names and images.',
  summary: 'Get cart details with items',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({
    cart_id: z.string().describe('Cart ID (from list_active_carts)'),
  }),
  output: z.object({ cart: cartSchema }),
  handle: async params => {
    const data = await gqlQuery<{ userCart?: RawCart }>('CartData', { id: params.cart_id });
    if (!data.userCart) {
      throw ToolError.notFound(`Cart ${params.cart_id} not found. It may have been deleted or checked out.`);
    }
    return { cart: mapCart(data.userCart) };
  },
});
