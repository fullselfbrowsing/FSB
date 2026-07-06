import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../zendesk-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Zendesk user.',
  summary: 'Get current user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('The current user profile'),
  }),
  handle: async () => {
    const data = await api<{ user: RawUser }>('/users/me.json');
    return { user: mapUser(data.user) };
  },
});
