import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api, getUsername } from '../gitlab-api.js';
import { mapUser, userSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description: 'Get a user profile by username. Defaults to the authenticated user if no username is specified.',
  summary: 'Get a user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().optional().describe('Username — defaults to the authenticated user'),
  }),
  output: z.object({
    user: userSchema.describe('The user profile'),
  }),
  handle: async params => {
    const username = params.username ?? getUsername();

    const users = await api<Record<string, unknown>[]>('/users', {
      query: { username },
    });

    const first = users?.[0];
    if (!first) throw ToolError.notFound(`User not found: ${username}`);

    return { user: mapUser(first) };
  },
});
