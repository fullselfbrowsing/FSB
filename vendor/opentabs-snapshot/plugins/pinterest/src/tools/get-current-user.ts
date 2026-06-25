import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { currentUserSchema, mapCurrentUser } from './schemas.js';
import type { RawCurrentUser } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the profile of the currently authenticated Pinterest user, including email, name, follower counts, board count, and account details.',
  summary: 'Get the authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: currentUserSchema.describe('The authenticated user profile'),
  }),
  handle: async () => {
    // ApiSResource returns client_context with full user data
    const resp = await resourcePost<null>('ApiSResource', 'create', {
      source: 'browser',
      stats: [],
      keepAlive: false,
    });

    const user = resp.client_context?.user as RawCurrentUser | undefined;
    if (!user?.id) {
      throw ToolError.auth('Could not retrieve user data — please log in.');
    }

    return { user: mapCurrentUser(user) };
  },
});
