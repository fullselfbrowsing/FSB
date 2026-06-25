import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, requireActiveCart, syncCartUI } from '../dominos-api.js';

export const addDealToCart = defineTool({
  name: 'add_deal_to_cart',
  displayName: 'Add Deal to Cart',
  description: 'Apply a deal or coupon code to the cart. The deal may automatically add or discount products.',
  summary: 'Apply a deal/coupon to your cart',
  icon: 'ticket',
  group: 'Cart',
  input: z.object({
    deal_code: z.string().describe('Deal/coupon code'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deal was applied'),
    message: z.string().describe('Response message from the server'),
  }),
  handle: async params => {
    const { cartId, storeId } = requireActiveCart();
    const data = await gql<{
      addDealToCart: { message?: string } | null;
    }>(
      'AddDealToCart',
      `mutation AddDealToCart($dealCart: DealCartInput) {
  addDealToCart(dealCart: $dealCart) { message }
}`,
      {
        dealCart: {
          dealCode: params.deal_code,
          storeId,
          cartId,
        },
      },
    );
    syncCartUI();
    return {
      success: true,
      message: data.addDealToCart?.message ?? '',
    };
  },
});
