import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getUserInfo } from '../gemini-api.js';
import { userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Google Gemini user profile including email and user ID.',
  summary: 'Get the current Gemini user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: userSchema,
  handle: async () => {
    const info = getUserInfo();
    return { email: info.email, user_id: info.userId };
  },
});
