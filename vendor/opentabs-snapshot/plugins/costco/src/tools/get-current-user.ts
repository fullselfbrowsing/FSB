import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getMemberData } from '../costco-api.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently logged-in Costco member profile including name, email, member number, and membership tier.',
  summary: 'Get logged-in member profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    email: z.string().describe('Member email address'),
    member_number: z.string().describe('Costco membership number'),
    member_tier: z.string().describe('Membership tier code (e.g., "Z00020" for Executive)'),
    member_type: z.string().describe('Membership type code'),
    logged_in: z.boolean().describe('Whether the user is logged in'),
  }),
  handle: async () => {
    const member = getMemberData();
    if (!member) {
      return { email: '', member_number: '', member_tier: '', member_type: '', logged_in: false };
    }
    return {
      email: member.email,
      member_number: member.memberNumber,
      member_tier: member.memberTier,
      member_type: member.memberType,
      logged_in: member.loggedIn,
    };
  },
});
