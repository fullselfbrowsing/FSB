import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawLoyaltyPoints, loyaltyPointsSchema, mapLoyaltyPoints } from './schemas.js';

export const getLoyaltyPoints = defineTool({
  name: 'get_loyalty_points',
  displayName: 'Get Loyalty Points',
  description: 'Get the current Chipotle Rewards loyalty points balance and the threshold needed to earn a reward.',
  summary: 'Get loyalty points balance and reward threshold',
  icon: 'award',
  group: 'Account',
  input: z.object({}),
  output: loyaltyPointsSchema,
  handle: async () => {
    const data = await api<RawLoyaltyPoints>('/loyalty/v2/points');
    return mapLoyaltyPoints(data);
  },
});
