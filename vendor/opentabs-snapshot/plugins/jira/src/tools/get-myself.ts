import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../jira-api.js';
import { mapUser, userSchema } from './schemas.js';

export const getMyself = defineTool({
  name: 'get_myself',
  displayName: 'Get Myself',
  description: 'Get the profile of the currently authenticated Jira user.',
  summary: "Get the current user's profile",
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('The authenticated user profile'),
  }),
  handle: async () => {
    const data = await api<Record<string, unknown>>('/myself');
    return { user: mapUser(data) };
  },
});
