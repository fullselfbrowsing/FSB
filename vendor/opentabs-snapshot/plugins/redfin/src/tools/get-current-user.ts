import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type RawUserProfile, userProfileSchema, mapUserProfile } from './schemas.js';

interface UserMenuPayload {
  data?: RawUserProfile;
}

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Redfin user including name and profile photo.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userProfileSchema.describe('Current user profile'),
  }),
  handle: async () => {
    const data = await api<UserMenuPayload>('/stingray/do/api-get-header-user-menu');

    return { user: mapUserProfile(data.data ?? {}) };
  },
});
