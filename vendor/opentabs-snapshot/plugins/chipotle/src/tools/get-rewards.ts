import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawRewardOffer, mapRewardOffer, rewardOfferSchema } from './schemas.js';

export const getRewards = defineTool({
  name: 'get_rewards',
  displayName: 'Get Rewards',
  description:
    'Get available rewards from the Chipotle Rewards store. Returns redeemable offers with point costs, descriptions, and images.',
  summary: 'Get available rewards and point costs',
  icon: 'gift',
  group: 'Rewards',
  input: z.object({}),
  output: z.object({
    offers: z.array(rewardOfferSchema).describe('Available reward offers'),
  }),
  handle: async () => {
    const data = await api<{ offers?: RawRewardOffer[] }>('/rewardstore/v2/rewardstore/web');
    return { offers: (data.offers ?? []).map(mapRewardOffer) };
  },
});
