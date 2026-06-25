import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    "Get a user's public profile by their username. Returns profile details including post count, subscriber count, and subscription price.",
  summary: 'Get a user profile by username',
  icon: 'user',
  group: 'Account',
  input: z.object({
    username: z.string().min(1).describe('Username (URL slug, without @)'),
  }),
  output: z.object({
    user: userSchema.describe('User profile'),
  }),
  handle: async params => {
    const data = await api<RawUser>(`/users/${encodeURIComponent(params.username)}`);
    return { user: mapUser(data) };
  },
});
