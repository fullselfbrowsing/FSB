import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../ynab-api.js';
import type { RawUser } from './schemas.js';
import { mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated YNAB user including name and email.',
  summary: 'Get your YNAB user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await api<RawUser>('/user');
    return { user: mapUser(data) };
  },
});
