import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlMutation } from '../instacart-api.js';

export const deleteCart = defineTool({
  name: 'delete_cart',
  displayName: 'Delete Cart',
  description:
    'Delete a shopping cart and all its items. This action cannot be undone. Use list_active_carts to find cart IDs.',
  summary: 'Delete a shopping cart',
  icon: 'trash-2',
  group: 'Cart',
  input: z.object({
    cart_id: z.string().describe('Cart ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the cart was deleted'),
  }),
  handle: async params => {
    await gqlMutation('DeleteCart', { cartId: params.cart_id });
    return { success: true };
  },
});
