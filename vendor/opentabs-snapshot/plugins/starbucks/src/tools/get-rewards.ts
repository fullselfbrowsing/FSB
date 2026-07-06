import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getReduxSlice } from '../starbucks-api.js';
import { mapRewardTier, rewardTierSchema } from './schemas.js';

export const getRewards = defineTool({
  name: 'get_rewards',
  displayName: 'Get Rewards',
  description:
    "Get the user's Starbucks Rewards program status including current Stars balance, reward tiers and what each tier unlocks. Each tier shows the Stars cost and whether the user can currently redeem it.",
  summary: 'Get Stars balance and available reward tiers',
  icon: 'star',
  group: 'Rewards',
  input: z.object({}),
  output: z.object({
    star_balance: z.number().describe('Current Stars balance'),
    stars_to_next_goal: z.number().describe('Stars needed to reach the next reward'),
    card_holder_since: z.string().describe('Loyalty member since date (ISO 8601)'),
    reward_tiers: z.array(rewardTierSchema).describe('Available reward tiers and their Star costs'),
  }),
  handle: async () => {
    interface LoyaltyData {
      progress?: { starBalance?: number; starsToNextGoal?: number };
      cardHolderSince?: string;
      rewards?: Array<Record<string, unknown>>;
    }

    const data = getReduxSlice<LoyaltyData>('rewards.loyaltyProfile.data');
    return {
      star_balance: data?.progress?.starBalance ?? 0,
      stars_to_next_goal: data?.progress?.starsToNextGoal ?? 0,
      card_holder_since: data?.cardHolderSince ?? '',
      reward_tiers: (data?.rewards ?? []).map(r => mapRewardTier(r as Parameters<typeof mapRewardTier>[0])),
    };
  },
});
