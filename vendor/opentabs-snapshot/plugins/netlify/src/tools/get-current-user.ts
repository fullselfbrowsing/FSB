import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../netlify-api.js';
import { userSchema, type RawUser, mapUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Netlify user including name, email, site count, MFA status, and login providers.',
  summary: 'Get authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: userSchema,
  handle: async () => {
    const raw = await api<RawUser>('/user');
    return mapUser(raw);
  },
});
