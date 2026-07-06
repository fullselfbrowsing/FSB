import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery, USER_FEATURES } from '../x-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUserResult } from './schemas.js';

export const getUserById = defineTool({
  name: 'get_user_by_id',
  displayName: 'Get User by ID',
  description: "Get a user's profile by their numeric user ID. Use get_user_profile for lookup by screen name.",
  summary: 'Get user profile by numeric ID',
  icon: 'user-check',
  group: 'Users',
  input: z.object({
    user_id: z.string().min(1).describe('Numeric user ID'),
  }),
  output: z.object({
    user: userSchema,
  }),
  handle: async params => {
    const data = await graphqlQuery<{ data: { user: { result: RawUserResult } } }>(
      'UserByRestId',
      {
        userId: params.user_id,
        withGrokTranslatedBio: false,
      },
      {
        features: USER_FEATURES,
      },
    );

    return { user: mapUser(data.data.user.result) };
  },
});
