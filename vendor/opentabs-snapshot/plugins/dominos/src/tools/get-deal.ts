import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { dealSchema, mapDeal } from './schemas.js';

export const getDeal = defineTool({
  name: 'get_deal',
  displayName: 'Get Deal Details',
  description:
    'Get details for a specific deal or coupon by its code. Requires a store ID and cart ID to check deal availability.',
  summary: 'Get details for a specific deal/coupon',
  icon: 'tag',
  group: 'Menu',
  input: z.object({
    deal_code: z.string().describe('Deal/coupon code'),
    store_id: z.string().describe('Store ID'),
    cart_id: z.string().describe('Cart ID'),
  }),
  output: z.object({ deal: dealSchema.describe('Deal details') }),
  handle: async params => {
    const data = await gql<{ deal: Record<string, unknown> }>(
      'Deal',
      `query Deal($dealCode: String!, $storeId: String!, $cartId: String!) {
  deal(dealCode: $dealCode, storeId: $storeId, cartId: $cartId) {
    code name description image visualDescription
  }
}`,
      {
        dealCode: params.deal_code,
        storeId: params.store_id,
        cartId: params.cart_id,
      },
    );
    return { deal: mapDeal(data.deal ?? {}) };
  },
});
