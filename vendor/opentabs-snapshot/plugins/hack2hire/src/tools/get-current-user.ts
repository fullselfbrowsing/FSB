import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawUserProfile, mapUserProfile, userProfileSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Hack2Hire user profile, including the user ID, email, public alias, avatar URL, account type, premium expiration date, account credit balance, account creation date, and last login timestamp.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userProfileSchema }),
  handle: async () => {
    const data = await api<RawUserProfile>('/user/profile');
    return { user: mapUserProfile(data) };
  },
});
