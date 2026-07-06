import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cartsApi } from '../target-api.js';

export const removeCartItem = defineTool({
  name: 'remove_cart_item',
  displayName: 'Remove Cart Item',
  description: 'Remove an item from the Target shopping cart. Get cart_item_id from get_cart.',
  summary: 'Remove an item from the cart',
  icon: 'trash-2',
  group: 'Cart',
  input: z.object({
    cart_item_id: z.string().describe('Cart item ID to remove (from get_cart)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the removal succeeded') }),
  handle: async params => {
    await cartsApi(`web_checkouts/v1/cart_items/${params.cart_item_id}`, {
      method: 'DELETE',
    });
    return { success: true };
  },
});
