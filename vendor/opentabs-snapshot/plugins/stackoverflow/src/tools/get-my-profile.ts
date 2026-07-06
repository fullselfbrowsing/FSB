import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getCurrentUserId } from '../stackoverflow-api.js';
import { userSchema, mapUser } from './schemas.js';

export const getMyProfile = defineTool({
  name: 'get_my_profile',
  displayName: 'Get My Profile',
  description:
    "Get the currently authenticated Stack Overflow user's profile. Returns reputation, badge counts, question/answer counts, and profile information. Requires being logged in.",
  summary: 'Get current user profile',
  icon: 'user-circle',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Current user profile'),
  }),
  handle: async () => {
    const userId = getCurrentUserId();
    const data = await api(`/users/${userId}`);
    return { user: mapUser(data.items?.[0] ?? { user_id: userId }) };
  },
});
