import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onenote-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Microsoft user including name, email, and language preference.',
  summary: 'Get the current user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Current user profile'),
  }),
  handle: async () => {
    const data = await api<RawUser>('/me');
    return { user: mapUser(data) };
  },
});
