import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../target-api.js';
import { loyaltyDetailsSchema, mapLoyaltyDetails } from './schemas.js';
import type { RawLoyaltyDetails } from './schemas.js';

export const getLoyaltyDetails = defineTool({
  name: 'get_loyalty_details',
  displayName: 'Get Loyalty Details',
  description:
    'Get Target Circle loyalty account details including earnings balance, lifetime savings, community votes, enrollment date, and bonus offer slots.',
  summary: 'Get Target Circle loyalty balance and savings',
  icon: 'award',
  group: 'Account',
  input: z.object({}),
  output: z.object({ loyalty: loyaltyDetailsSchema }),
  handle: async () => {
    const data = await api<RawLoyaltyDetails>('loyalty_accounts/v2/details', {
      query: { loyalty_api_key: 'a5ae7fb188e78581614e4909f407462d8392b977' },
    });
    return { loyalty: mapLoyaltyDetails(data) };
  },
});
