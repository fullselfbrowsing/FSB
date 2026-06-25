import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlMutation } from '../instacart-api.js';
import { type RawCart, cartSchema, mapCart } from './schemas.js';

export const updateCartItems = defineTool({
  name: 'update_cart_items',
  displayName: 'Update Cart Items',
  description:
    'Add, update, or remove items in a shopping cart. Each update specifies an item ID and a quantity. Set quantity to 0 to remove an item. Set quantity > 0 to add or update. The item ID format is "items_{shopId}-{productId}" (e.g. "items_121560-7079"). Returns the updated cart.',
  summary: 'Add, update, or remove cart items',
  icon: 'plus-circle',
  group: 'Cart',
  input: z.object({
    updates: z
      .array(
        z.object({
          item_id: z.string().describe('Item ID (format: items_{shopId}-{productId})'),
          quantity: z.number().int().min(0).describe('New quantity (0 to remove)'),
        }),
      )
      .min(1)
      .describe('Item updates to apply'),
  }),
  output: z.object({ cart: cartSchema }),
  handle: async params => {
    const cartItemUpdates = params.updates.map(u => ({
      itemId: u.item_id,
      quantity: u.quantity,
    }));

    const data = await gqlMutation<{ updateCartItems: { cart: RawCart } }>('UpdateCartItemsMutation', {
      cartItemUpdates,
    });

    const cart = data.updateCartItems?.cart;
    if (!cart) {
      throw ToolError.internal('No cart returned after update');
    }
    return { cart: mapCart(cart) };
  },
});
