import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../docker-hub-api.js';
import { mapSearchResult, searchResultSchema } from './schemas.js';
import type { PaginatedResponse, RawSearchResult } from './schemas.js';

export const searchRepositories = defineTool({
  name: 'search_repositories',
  displayName: 'Search Repositories',
  description:
    'Search Docker Hub repositories by keyword. Returns matching repositories with pull counts, star counts, and official/automated status.',
  summary: 'Search repositories by keyword',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Search query'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(100).optional().describe('Results per page (default 25, max 100)'),
  }),
  output: z.object({
    count: z.number().describe('Total number of matching repositories'),
    results: z.array(searchResultSchema),
  }),
  handle: async params => {
    const data = await api<PaginatedResponse<RawSearchResult>>('/v2/search/repositories', {
      query: {
        query: params.query,
        page: params.page,
        page_size: params.page_size ?? 25,
      },
    });
    return {
      count: data.count ?? 0,
      results: (data.results ?? []).map(mapSearchResult),
    };
  },
});
