import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type TLObject, getInputUser, invokeApi } from '../telegram-api.js';
import { type RawUserFull, mapUserProfile, userProfileSchema } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get full profile information for a Telegram user, including bio (about text) and common groups count. Requires the user ID.',
  summary: 'Get detailed user profile with bio',
  icon: 'user-circle',
  group: 'Users',
  input: z.object({
    user_id: z.number().describe('Telegram user ID'),
  }),
  output: z.object({
    profile: userProfileSchema.describe('Full user profile with bio'),
  }),
  handle: async params => {
    const inputUser = await getInputUser(params.user_id);

    const result = await invokeApi<TLObject>('users.getFullUser', {
      id: inputUser,
    });

    const data = result as unknown as RawUserFull;
    return { profile: mapUserProfile(data) };
  },
});
