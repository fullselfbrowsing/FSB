import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a public Instagram user profile by username. Returns bio, follower/following counts, post count, and verification status.',
  summary: 'Get a user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('Instagram username (without @)'),
  }),
  output: z.object({ user: userSchema }),
  handle: async params => {
    const data = await api<{ data?: { user?: RawUser } }>('/users/web_profile_info/', {
      query: { username: params.username },
    });
    return { user: mapUser(data.data?.user ?? {}) };
  },
});
