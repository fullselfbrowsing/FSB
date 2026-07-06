import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';

interface UnfollowUserData {
  unfollowUser: { id: string; name: string; username: string };
}

export const unfollowUser = defineTool({
  name: 'unfollow_user',
  displayName: 'Unfollow User',
  description: 'Unfollow a Medium user by their user ID.',
  summary: 'Unfollow a user',
  icon: 'user-minus',
  group: 'Users',
  input: z.object({
    user_id: z.string().describe('Medium user ID to unfollow'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await gql<UnfollowUserData>(
      'UnfollowUserMutation',
      `mutation UnfollowUserMutation($targetUserId: ID!) {
        unfollowUser(targetUserId: $targetUserId) { id name username }
      }`,
      { targetUserId: params.user_id },
      true,
    );
    return { success: true };
  },
});
