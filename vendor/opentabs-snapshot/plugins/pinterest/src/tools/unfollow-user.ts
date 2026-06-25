import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourcePost } from '../pinterest-api.js';

export const unfollowUser = defineTool({
  name: 'unfollow_user',
  displayName: 'Unfollow User',
  description: 'Unfollow a Pinterest user by their user ID.',
  summary: 'Unfollow a Pinterest user',
  icon: 'user-minus',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User ID to unfollow'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await resourcePost('UserFollowResource', 'delete', {
      user_id: params.user_id,
    });

    return { success: true };
  },
});
