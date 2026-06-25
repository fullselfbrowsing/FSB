import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';
import { type RawFriendRequestEdge, friendRequestSchema, mapFriendRequest } from './schemas.js';

interface FriendsRootResponse {
  viewer?: {
    friend_requests?: {
      edges?: RawFriendRequestEdge[];
      count?: number;
    };
    friends_container_pymk_count?: { count?: number };
  };
}

export const listFriendRequests = defineTool({
  name: 'list_friend_requests',
  displayName: 'List Friend Requests',
  description:
    "List pending incoming friend requests on Facebook. Returns the requester's name, profile picture, mutual friends count, and user ID (needed for confirm/delete).",
  summary: 'List pending friend requests',
  icon: 'user-plus',
  group: 'Friends',
  input: z.object({}),
  output: z.object({
    friend_requests: z.array(friendRequestSchema),
    total_count: z.number().int().describe('Total number of pending friend requests'),
    people_you_may_know_count: z.number().int().describe('Number of friend suggestions'),
  }),
  handle: async () => {
    const data = await graphql<FriendsRootResponse>('FriendingCometRootContentQuery', { scale: 2 });

    const viewer = data.viewer;
    const edges = viewer?.friend_requests?.edges ?? [];

    return {
      friend_requests: edges.map(mapFriendRequest),
      total_count: viewer?.friend_requests?.count ?? edges.length,
      people_you_may_know_count: viewer?.friends_container_pymk_count?.count ?? 0,
    };
  },
});
