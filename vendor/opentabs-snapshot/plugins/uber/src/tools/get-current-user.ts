import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../uber-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Uber user profile including first name, last name, and profile picture.',
  summary: 'Get the current Uber user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await api<{ user: RawUser }>('/getCurrentUser?localeCode=en');
    return { user: mapUser(data.user ?? {}) };
  },
});
