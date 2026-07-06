import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';

export const getLoyaltyPoints = defineTool({
  name: 'get_loyalty_points',
  displayName: 'Get Loyalty Points',
  description: "Get the customer's Domino's Rewards loyalty point balance. Points can be redeemed for free menu items.",
  summary: 'Check your loyalty point balance',
  icon: 'star',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    points: z.number().describe('Current vested loyalty point balance'),
  }),
  handle: async () => {
    const data = await gql<{
      loyaltyPoints: { vestedPointBalance: number } | null;
    }>('LoyaltyPoints', `query LoyaltyPoints { loyaltyPoints { vestedPointBalance } }`);
    return { points: data.loyaltyPoints?.vestedPointBalance ?? 0 };
  },
});
