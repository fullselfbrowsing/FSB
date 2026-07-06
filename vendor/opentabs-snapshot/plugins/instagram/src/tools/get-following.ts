import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawUserSummary, mapUserSummary, userSummarySchema } from './schemas.js';

interface FollowingResponse {
  users?: RawUserSummary[];
  big_list?: boolean;
  next_max_id?: string;
}

export const getFollowing = defineTool({
  name: 'get_following',
  displayName: 'Get Following',
  description:
    'List accounts that a user follows. Requires the user numeric ID. Supports cursor pagination via max_id.',
  summary: 'List who a user follows',
  icon: 'users',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
    count: z.number().int().min(1).max(100).optional().describe('Number of results to return (default 20)'),
    max_id: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    users: z.array(userSummarySchema).describe('Followed accounts'),
    has_more: z.boolean().describe('Whether more results are available'),
    next_max_id: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<FollowingResponse>(`/friendships/${params.user_id}/following/`, {
      query: { count: params.count ?? 20, max_id: params.max_id },
    });
    return {
      users: (data.users ?? []).map(mapUserSummary),
      has_more: data.big_list ?? false,
      next_max_id: data.next_max_id ?? '',
    };
  },
});
