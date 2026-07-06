import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapUser, userSchema } from './schemas.js';
import type { RawUser } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a Docker Hub user profile by username. Returns username, full name, location, company, account type, and join date.',
  summary: 'Get a Docker Hub user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('Docker Hub username'),
  }),
  output: z.object({ user: userSchema }),
  handle: async params => {
    const data = await api<RawUser>(`/v2/users/${params.username}`);
    return { user: mapUser(data) };
  },
});
