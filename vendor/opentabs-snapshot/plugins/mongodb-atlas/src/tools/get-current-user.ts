import { ToolError, defineTool, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the profile of the currently authenticated MongoDB Atlas user including name and email.',
  summary: 'Get authenticated user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema.describe('The authenticated user') }),
  handle: async () => {
    const raw = getPageGlobal('PARAMS.appUser') as RawUser | undefined;
    if (!raw) throw ToolError.auth('User not found — ensure you are logged in to MongoDB Atlas.');
    return { user: mapUser(raw) };
  },
});
