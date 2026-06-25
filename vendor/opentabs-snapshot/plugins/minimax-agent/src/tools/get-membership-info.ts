import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../minimax-api.js';
import { type RawMembership, mapMembership, membershipSchema } from './schemas.js';

export const getMembershipInfo = defineTool({
  name: 'get_membership_info',
  displayName: 'Get Membership Info',
  description:
    'Get the current MiniMax Agent membership details including plan type, plan name, remaining credits, pending credits, renewal status, expiration date, and Pro Builder status.',
  summary: 'Get membership plan and credit details',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({ membership: membershipSchema }),
  handle: async () => {
    const data = await apiPost<RawMembership>('/matrix/api/v1/commerce/get_membership_info');
    return { membership: mapMembership(data) };
  },
});
