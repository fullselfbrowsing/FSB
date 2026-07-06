import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiGet } from '../minimax-api.js';
import { mapUser, userSchema } from './schemas.js';
import type { RawUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated MiniMax Agent user profile including user ID, display name, email, avatar, and login status.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await apiGet<{ data: { userInfo?: RawUser } }>('/v1/api/user/info');
    return { user: mapUser(data.data?.userInfo ?? {}) };
  },
});
