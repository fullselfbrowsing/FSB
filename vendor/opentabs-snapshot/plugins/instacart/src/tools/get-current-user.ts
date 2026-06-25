import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlQuery } from '../instacart-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Instacart user profile including name, email, order count, and avatar.',
  summary: 'Get your Instacart profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const data = await gqlQuery<{ currentUser: RawUser }>('CurrentUser');
    return { user: mapUser(data.currentUser ?? {}) };
  },
});
