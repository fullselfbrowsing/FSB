import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getViewerId } from '../medium-api.js';
import { userSummarySchema, type RawUserSummary, mapUserSummary } from './schemas.js';

interface FollowingData {
  user: {
    id: string;
    followingUserConnection: {
      users: RawUserSummary[];
      pagingInfo: { next: { limit: number; page: number | null } | null };
    };
  };
}

export const listFollowing = defineTool({
  name: 'list_following',
  displayName: 'List Following',
  description: 'List users that the current user is following on Medium.',
  summary: 'List users you follow',
  icon: 'users',
  group: 'Users',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Maximum results to return (default 20)'),
  }),
  output: z.object({
    users: z.array(userSummarySchema),
  }),
  handle: async params => {
    const viewerId = getViewerId();
    const limit = params.limit ?? 20;
    const data = await gql<FollowingData>(
      'FollowingQuery',
      `query FollowingQuery($userId: ID!, $paging: PagingOptions) {
        user(id: $userId) {
          id
          followingUserConnection(paging: $paging) {
            users {
              id name username bio imageId
              socialStats { followerCount }
            }
            pagingInfo { next { limit page } }
          }
        }
      }`,
      { userId: viewerId, paging: { limit } },
    );
    return {
      users: (data.user?.followingUserConnection?.users ?? []).map(mapUserSummary),
    };
  },
});
