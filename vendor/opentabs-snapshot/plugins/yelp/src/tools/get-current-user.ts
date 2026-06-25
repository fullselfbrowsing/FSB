import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserId } from '../yelp-api.js';
import { currentUserSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated Yelp user. Returns the encrypted user ID.',
  summary: 'Get the authenticated Yelp user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: currentUserSchema }),
  handle: async () => {
    const userId = getUserId();
    return { user: { user_id: userId } };
  },
});
