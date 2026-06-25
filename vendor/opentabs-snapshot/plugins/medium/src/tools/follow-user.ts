import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';

interface FollowUserData {
  followUser: { id: string; name: string; username: string };
}

export const followUser = defineTool({
  name: 'follow_user',
  displayName: 'Follow User',
  description: 'Follow a Medium user by their user ID.',
  summary: 'Follow a user',
  icon: 'user-plus',
  group: 'Users',
  input: z.object({
    user_id: z.string().describe('Medium user ID to follow'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
    user_id: z.string().describe('Followed user ID'),
    name: z.string().describe('Followed user display name'),
  }),
  handle: async params => {
    const data = await gql<FollowUserData>(
      'FollowUserMutation',
      `mutation FollowUserMutation($targetUserId: ID!) {
        followUser(targetUserId: $targetUserId) { id name username }
      }`,
      { targetUserId: params.user_id },
      true,
    );
    return {
      success: true,
      user_id: data.followUser?.id ?? params.user_id,
      name: data.followUser?.name ?? '',
    };
  },
});
