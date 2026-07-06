import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cartsApi } from '../target-api.js';

export const updateCartItemQuantity = defineTool({
  name: 'update_cart_item_quantity',
  displayName: 'Update Cart Item Quantity',
  description:
    'Update the quantity of an item in the Target cart. Get cart_item_id from get_cart. Set quantity to the new desired amount.',
  summary: 'Change item quantity in the cart',
  icon: 'pencil',
  group: 'Cart',
  input: z.object({
    cart_item_id: z.string().describe('Cart item ID (from get_cart)'),
    quantity: z.number().int().min(1).describe('New quantity for the item'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the update succeeded') }),
  handle: async params => {
    await cartsApi(`web_checkouts/v1/cart_items/${params.cart_item_id}`, {
      method: 'PUT',
      query: { field_groups: 'CART,CART_ITEMS,SUMMARY' },
      body: {
        cart_type: 'REGULAR',
        cart_item: {
          cart_item_id: params.cart_item_id,
          quantity: params.quantity,
        },
      },
    });
    return { success: true };
  },
});
