import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { searchTypeahead } from '../facebook-api.js';
import { type RawSearchResult, mapSearchResult, searchResultSchema } from './schemas.js';

export const search = defineTool({
  name: 'search',
  displayName: 'Search Facebook',
  description:
    'Search Facebook for people, pages, groups, and other entities. Returns results with entity ID, type, title, and link URL. Useful for finding user IDs to use with other tools.',
  summary: 'Search Facebook entities',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z.number().int().min(1).max(100).optional().describe('Maximum results to return (default 20, max 100)'),
  }),
  output: z.object({
    results: z.array(searchResultSchema),
  }),
  handle: async params => {
    const entries = (await searchTypeahead(params.query)) as RawSearchResult[];
    const results = entries.slice(0, params.limit ?? 20).map(mapSearchResult);
    return { results };
  },
});
