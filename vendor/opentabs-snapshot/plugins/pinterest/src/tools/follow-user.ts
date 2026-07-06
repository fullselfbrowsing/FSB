import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';
import { userSchema, mapUser } from './schemas.js';
import type { RawUser } from './schemas.js';

export const followUser = defineTool({
  name: 'follow_user',
  displayName: 'Follow User',
  description: 'Follow a Pinterest user by their user ID. Use get_user_profile to find the user ID from a username.',
  summary: 'Follow a Pinterest user',
  icon: 'user-plus',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User ID to follow'),
  }),
  output: z.object({
    user: userSchema.describe('The followed user'),
  }),
  handle: async params => {
    const resp = await resourcePost<RawUser>('UserFollowResource', 'create', { user_id: params.user_id });

    return { user: mapUser(resp.resource_response.data) };
  },
});
