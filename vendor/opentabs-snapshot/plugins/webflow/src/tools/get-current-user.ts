import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../webflow-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Webflow user profile including name, email, plan, and account details.',
  summary: 'Get your Webflow profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await api<RawUser>('/user');
    return { user: mapUser(data) };
  },
});
