import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tiktok-api.js';
import { searchUserSchema, mapSearchUser } from './schemas.js';
import type { RawSearchUser } from './schemas.js';

interface SearchUserResponse {
  status_code?: number;
  user_list?: RawSearchUser[];
  has_more?: number | boolean;
  cursor?: number;
}

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description:
    'Search for TikTok users by name or username. Returns matching user profiles with follower counts, bio, and verification status.',
  summary: 'Search for users by name or username',
  icon: 'users',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query — name or username'),
    count: z.number().int().min(1).max(20).optional().describe('Number of results to return (default 10, max 20)'),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Pagination offset from a previous response cursor (default 0)'),
  }),
  output: z.object({
    users: z.array(searchUserSchema).describe('Matching user profiles'),
    has_more: z.boolean().describe('Whether more results are available'),
    cursor: z.number().int().describe('Cursor value for the next page of results'),
  }),
  handle: async params => {
    const count = params.count ?? 10;
    const offset = params.offset ?? 0;

    const data = await api<SearchUserResponse>('/search/user/full/', {
      keyword: params.query,
      count,
      offset,
    });

    const users = (data.user_list ?? []).map(mapSearchUser);

    return {
      users,
      has_more: data.has_more === 1 || data.has_more === true,
      cursor: data.cursor ?? 0,
    };
  },
});
