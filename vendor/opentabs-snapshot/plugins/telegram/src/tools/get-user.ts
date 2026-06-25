import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { callManager } from '../telegram-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

export const getUser = defineTool({
  name: 'get_user',
  displayName: 'Get User',
  description:
    'Get basic profile information for a Telegram user by their numeric user ID. Returns name, username, phone, bot status, and online status.',
  summary: 'Get a user profile by ID',
  icon: 'user',
  group: 'Users',
  input: z.object({
    user_id: z.number().describe('Telegram user ID'),
  }),
  output: z.object({
    user: userSchema.describe('User profile'),
  }),
  handle: async params => {
    const data = await callManager<RawUser>('appUsersManager', 'getUser', params.user_id);
    return { user: mapUser(data) };
  },
});
