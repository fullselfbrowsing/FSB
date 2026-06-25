import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentUserData } from '../facebook-api.js';
import { userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently authenticated Facebook user profile including user ID, full name, and short name. Reads from the page session — no API call.',
  summary: 'Get the logged-in user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = getCurrentUserData();
    return {
      user: {
        id: data.userId,
        name: data.name,
        short_name: data.shortName,
      },
    };
  },
});
