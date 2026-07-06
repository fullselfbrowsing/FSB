import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentUserInfo } from '../notebooklm-api.js';
import { accountUserSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: "Get the currently logged-in user's account information (email and user ID).",
  summary: 'Get current user info',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: accountUserSchema,
  }),
  handle: async () => {
    const info = getCurrentUserInfo();
    return {
      user: {
        email: info.email,
        name: info.email.split('@')[0] ?? '',
        avatar_url: '',
      },
    };
  },
});
