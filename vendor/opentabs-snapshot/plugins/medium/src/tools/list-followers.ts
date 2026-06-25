import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getViewerId } from '../medium-api.js';
import { userSummarySchema, type RawUserSummary, mapUserSummary } from './schemas.js';

interface FollowersData {
  user: {
    id: string;
    followersUserConnection: {
      users: RawUserSummary[];
      pagingInfo: { next: { limit: number; page: number | null } | null };
    };
  };
}

export const listFollowers = defineTool({
  name: 'list_followers',
  displayName: 'List Followers',
  description: 'List users that follow the current user on Medium.',
  summary: 'List your followers',
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
    const data = await gql<FollowersData>(
      'FollowersQuery',
      `query FollowersQuery($userId: ID!, $paging: PagingOptions) {
        user(id: $userId) {
          id
          followersUserConnection(paging: $paging) {
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
      users: (data.user?.followersUserConnection?.users ?? []).map(mapUserSummary),
    };
  },
});
