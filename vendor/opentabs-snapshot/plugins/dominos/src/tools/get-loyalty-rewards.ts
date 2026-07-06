import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';

export const getLoyaltyRewards = defineTool({
  name: 'get_loyalty_rewards',
  displayName: 'Get Available Rewards',
  description:
    'Get the count of available loyalty rewards the customer can redeem. Optionally scoped to a specific store and cart.',
  summary: 'Check available loyalty rewards',
  icon: 'gift',
  group: 'Account',
  input: z.object({
    store_id: z.string().optional().describe('Store ID to check reward availability for'),
    cart_id: z.string().optional().describe('Cart ID to check reward availability for'),
  }),
  output: z.object({
    total_rewards: z.number().int().describe('Number of rewards available to redeem'),
  }),
  handle: async params => {
    const data = await gql<{
      loyaltyAvailabilityCounters: { totalCounter: number } | null;
    }>(
      'LoyaltyAvailabilityCounters',
      `query LoyaltyAvailabilityCounters($storeId: String, $cartId: String) {
  loyaltyAvailabilityCounters(storeId: $storeId, cartId: $cartId) {
    totalCounter
  }
}`,
      { storeId: params.store_id, cartId: params.cart_id },
    );
    return {
      total_rewards: data.loyaltyAvailabilityCounters?.totalCounter ?? 0,
    };
  },
});
