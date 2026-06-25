import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserFromSearchResponse } from '../zillow-api.js';
import { mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the currently authenticated Zillow user profile including email, name, saved homes count, and agent status.',
  summary: 'Get the current Zillow user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({ user: userSchema }),
  handle: async () => {
    const raw = await getUserFromSearchResponse();
    return { user: mapUser(raw) };
  },
});
