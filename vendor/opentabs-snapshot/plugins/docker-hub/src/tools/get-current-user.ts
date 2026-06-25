import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapUser, userSchema } from './schemas.js';
import type { RawUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Docker Hub user including username, full name, location, company, and account creation date.',
  summary: 'Get the authenticated Docker Hub user profile',
  icon: 'user',
  group: 'Users',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await api<RawUser>('/auth/profile', {});
    // The /auth/profile wraps user data inside a profile field
    const profile = (data as unknown as { profile?: RawUser }).profile ?? data;
    const user = await api<RawUser>(`/v2/users/${profile.username ?? ''}`);
    return { user: mapUser(user) };
  },
});
