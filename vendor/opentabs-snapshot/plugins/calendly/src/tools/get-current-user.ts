import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Calendly user including name, email, booking URL, timezone, and event count.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await api<Record<string, unknown>>('/user');
    return { user: mapUser(data) };
  },
});
