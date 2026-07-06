import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery, USER_FEATURES } from '../x-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUserResult } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    "Get a user's profile by their screen name (username). Returns profile details including bio, follower counts, and verification status.",
  summary: 'Get user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    screen_name: z.string().min(1).describe('Username without @ (e.g., "elonmusk")'),
  }),
  output: z.object({
    user: userSchema,
  }),
  handle: async params => {
    const data = await graphqlQuery<{ data: { user: { result: RawUserResult } } }>(
      'UserByScreenName',
      {
        screen_name: params.screen_name,
        withGrokTranslatedBio: false,
      },
      {
        features: USER_FEATURES,
        fieldToggles: { withPayments: false, withAuxiliaryUserLabels: false },
      },
    );

    return { user: mapUser(data.data.user.result) };
  },
});
