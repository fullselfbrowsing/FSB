import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../spotify-api.js';
import { type RawAccountAttributes, type RawProfileAttributes, mapUser, userSchema } from './schemas.js';

export const getCurrentUser = defineTool({
  name: 'get_current_user',
  displayName: 'Get Current User',
  description:
    'Get the authenticated Spotify user profile including username, display name, country, and subscription type.',
  summary: 'Get current Spotify user profile',
  icon: 'user',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    user: userSchema.describe('Authenticated user profile'),
  }),
  handle: async () => {
    const [profile, account] = await Promise.all([
      graphql<RawProfileAttributes>('profileAttributes'),
      graphql<RawAccountAttributes>('accountAttributes'),
    ]);
    return { user: mapUser(profile, account) };
  },
});
