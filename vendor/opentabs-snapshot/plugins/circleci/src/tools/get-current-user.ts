import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../circleci-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated CircleCI user including name, login, and avatar.',
  summary: 'Get your CircleCI user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await api<RawUser>('/me');
    return { user: mapUser(data) };
  },
});
