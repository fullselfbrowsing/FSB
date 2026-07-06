import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawUser, mapUser, userSchema } from './schemas.js';

interface HintsResponse {
  list?: RawUser[];
  hasMore?: boolean;
}

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description: 'Search for creators by name or username. Returns matching user profiles with pagination support.',
  summary: 'Search for creators',
  icon: 'search',
  group: 'Users',
  input: z.object({
    query: z.string().min(1).describe('Search query (name or username)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0)'),
  }),
  output: z.object({
    users: z.array(userSchema).describe('Matching user profiles'),
    has_more: z.boolean().describe('Whether more results are available'),
  }),
  handle: async params => {
    const data = await api<HintsResponse>('/users/hints', {
      query: { search: params.query, offset: params.offset ?? 0 },
    });
    return {
      users: (data.list ?? []).map(mapUser),
      has_more: data.hasMore ?? false,
    };
  },
});
