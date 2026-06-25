import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getReduxSlice } from '../starbucks-api.js';
import { mapUserProfile, userProfileSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Starbucks user profile including name, email, Stars balance, loyalty program status, and birthday.',
  summary: 'Get current user profile and rewards info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userProfileSchema }),
  handle: async () => {
    const data = getReduxSlice<Record<string, unknown>>('user.accountProfile.data');
    if (!data) {
      return { user: mapUserProfile({}) };
    }
    return { user: mapUserProfile(data as Parameters<typeof mapUserProfile>[0]) };
  },
});
