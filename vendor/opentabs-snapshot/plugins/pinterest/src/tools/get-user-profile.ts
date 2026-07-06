import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet } from '../pinterest-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUser } from './schemas.js';

export const getUserProfile = defineTool({
  name: 'get_user_profile',
  displayName: 'Get User Profile',
  description:
    'Get a Pinterest user profile by username. Returns display name, follower/following counts, pin count, board count, and profile image.',
  summary: 'Get a user profile by username',
  icon: 'user',
  group: 'Users',
  input: z.object({
    username: z.string().describe('Pinterest username (e.g., "pinterest")'),
  }),
  output: z.object({
    user: userSchema.describe('The user profile'),
  }),
  handle: async params => {
    const resp = await resourceGet<RawUser>(
      'UserResource',
      {
        username: params.username,
        field_set_key: 'profile',
      },
      `/${params.username}/`,
    );

    return { user: mapUser(resp.resource_response.data) };
  },
});
