import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawCurrentUser, currentUserSchema, mapCurrentUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    "Get the authenticated user's profile including email, subscription count, notification count, and credit balance.",
  summary: 'Get your OnlyFans profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: currentUserSchema.describe('Current user profile'),
  }),
  handle: async () => {
    const data = await api<RawCurrentUser>('/users/me');
    return { user: mapCurrentUser(data) };
  },
});
