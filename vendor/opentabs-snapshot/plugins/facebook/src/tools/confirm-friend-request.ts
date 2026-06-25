import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentUserData, graphql } from '../facebook-api.js';

export const confirmFriendRequest = defineTool({
  name: 'confirm_friend_request',
  displayName: 'Confirm Friend Request',
  description: "Accept an incoming Facebook friend request. Requires the sender's user ID.",
  summary: 'Accept a friend request',
  icon: 'user-check',
  group: 'Friends',
  input: z.object({
    user_id: z.string().describe('Facebook user ID of the person who sent the friend request'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the friend request was accepted'),
  }),
  handle: async params => {
    if (!params.user_id) {
      throw ToolError.validation('user_id is required.');
    }

    const user = getCurrentUserData();
    await graphql('FriendingCometFriendRequestConfirmMutation', {
      input: {
        friend_requester_id: params.user_id,
        source: 'friends_tab',
        actor_id: user.userId,
        client_mutation_id: '1',
      },
    });

    return { success: true };
  },
});
