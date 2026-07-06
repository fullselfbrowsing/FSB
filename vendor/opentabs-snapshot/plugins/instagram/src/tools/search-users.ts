import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../instagram-api.js';
import { type RawUserSummary, mapUserSummary, userSummarySchema } from './schemas.js';

interface SearchResponse {
  users?: { user?: RawUserSummary }[];
}

export const searchUsers = defineTool({
  name: 'search_users',
  displayName: 'Search Users',
  description: 'Search for Instagram users by name or username. Returns matching user profiles ranked by relevance.',
  summary: 'Search for users',
  icon: 'search',
  group: 'Users',
  input: z.object({
    query: z.string().describe('Search query (name or username)'),
  }),
  output: z.object({
    users: z.array(userSummarySchema).describe('Matching users'),
  }),
  handle: async params => {
    const data = await api<SearchResponse>('/web/search/topsearch/', {
      query: { context: 'blended', query: params.query, include_reel: 'true' },
    });
    return {
      users: (data.users ?? []).map(u => mapUserSummary(u.user ?? {})),
    };
  },
});
