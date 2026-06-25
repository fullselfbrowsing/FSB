import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getCurrentUserData, graphql } from '../facebook-api.js';

export const deleteFriendRequest = defineTool({
  name: 'delete_friend_request',
  displayName: 'Delete Friend Request',
  description: "Decline or delete an incoming Facebook friend request. Requires the sender's user ID.",
  summary: 'Decline a friend request',
  icon: 'user-x',
  group: 'Friends',
  input: z.object({
    user_id: z.string().describe('Facebook user ID of the person who sent the friend request'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the friend request was declined'),
  }),
  handle: async params => {
    if (!params.user_id) {
      throw ToolError.validation('user_id is required.');
    }

    const user = getCurrentUserData();
    await graphql('FriendingCometFriendRequestDeleteMutation', {
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
