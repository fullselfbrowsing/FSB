import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cartsApi } from '../target-api.js';

export const applyPromoCode = defineTool({
  name: 'apply_promo_code',
  displayName: 'Apply Promo Code',
  description: 'Apply a promotion code or coupon to the Target shopping cart.',
  summary: 'Apply a promo code to the cart',
  icon: 'tag',
  group: 'Cart',
  input: z.object({
    code: z.string().describe('Promotion code or coupon code'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the promo code was applied') }),
  handle: async params => {
    await cartsApi('web_checkouts/v1/cart_promotion_codes', {
      method: 'POST',
      query: { field_groups: 'CART,CART_ITEMS,SUMMARY,PROMOTION_CODES' },
      body: {
        promotion_code: params.code,
        promotion_type: 'promotion',
        cart_type: 'REGULAR',
      },
    });
    return { success: true };
  },
});
