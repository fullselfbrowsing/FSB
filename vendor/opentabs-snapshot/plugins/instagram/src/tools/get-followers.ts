import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawUserSummary, mapUserSummary, userSummarySchema } from './schemas.js';

interface FollowersResponse {
  users?: RawUserSummary[];
  big_list?: boolean;
  next_max_id?: string;
}

export const getFollowers = defineTool({
  name: 'get_followers',
  displayName: 'Get Followers',
  description:
    'List followers of a user. Requires the user numeric ID. Supports cursor pagination via max_id. Private accounts only show followers to the account owner.',
  summary: "List a user's followers",
  icon: 'users',
  group: 'Social',
  input: z.object({
    user_id: z.string().describe('User numeric ID (pk)'),
    count: z.number().int().min(1).max(100).optional().describe('Number of followers to return (default 20)'),
    max_id: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    users: z.array(userSummarySchema).describe('Follower accounts'),
    has_more: z.boolean().describe('Whether more followers are available'),
    next_max_id: z.string().describe('Cursor for next page, empty if no more'),
  }),
  handle: async params => {
    const data = await api<FollowersResponse>(`/friendships/${params.user_id}/followers/`, {
      query: { count: params.count ?? 20, max_id: params.max_id },
    });
    return {
      users: (data.users ?? []).map(mapUserSummary),
      has_more: data.big_list ?? false,
      next_max_id: data.next_max_id ?? '',
    };
  },
});
