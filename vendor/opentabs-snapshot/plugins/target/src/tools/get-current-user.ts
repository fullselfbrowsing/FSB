import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../target-api.js';
import { userProfileSchema, mapUserProfile } from './schemas.js';
import type { RawUserProfile } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Target user profile including name, email, loyalty status, RedCard status, and membership details.',
  summary: 'Get the authenticated Target user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userProfileSchema }),
  handle: async () => {
    const data = await api<RawUserProfile>('guest_profile_details/v1/profile_details/profiles');
    return { user: mapUserProfile(data) };
  },
});
