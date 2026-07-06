import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { callManager } from '../telegram-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description: 'Get the authenticated Telegram user profile including name, username, phone number, and online status.',
  summary: 'Get your Telegram profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('The authenticated user profile'),
  }),
  handle: async () => {
    const data = await callManager<RawUser>('appUsersManager', 'getSelf');
    return { user: mapUser(data) };
  },
});
