import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentUser } from '../ebay-api.js';
import { userProfileSchema } from './schemas.js';

export const getCurrentUserTool = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the currently authenticated eBay user profile including user ID and first name.',
  summary: 'Get the authenticated eBay user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userProfileSchema }),
  handle: async () => {
    const auth = getCurrentUser();
    return {
      user: {
        user_id: auth.userId,
        first_name: auth.firstName,
      },
    };
  },
});
