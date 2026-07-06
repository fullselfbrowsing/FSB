import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, requireActiveCart, syncCartUI } from '../dominos-api.js';

export const removeDealFromCart = defineTool({
  name: 'remove_deal_from_cart',
  displayName: 'Remove Deal from Cart',
  description: 'Remove a deal/coupon from the cart by its deal code.',
  summary: 'Remove a deal/coupon from your cart',
  icon: 'x-circle',
  group: 'Cart',
  input: z.object({
    deal_code: z.string().describe('Deal/coupon code to remove'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deal was removed'),
  }),
  handle: async params => {
    const { cartId, storeId } = requireActiveCart();
    await gql<unknown>(
      'RemoveDeal',
      `mutation RemoveDeal(
  $dealCode: String!
  $storeId: String!
  $cartId: String!
) {
  removeDeal(
    removeDealInput: {
      dealCode: $dealCode
      storeId: $storeId
      cartId: $cartId
    }
  )
}`,
      {
        dealCode: params.deal_code,
        storeId,
        cartId,
      },
    );
    syncCartUI();
    return { success: true };
  },
});
