import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../wikipedia-api.js';
import { searchResultSchema, mapSearchResult } from './schemas.js';
import type { RawSearchResult } from './schemas.js';

interface SearchResponse {
  query?: {
    search?: RawSearchResult[];
    searchinfo?: { totalhits?: number; suggestion?: string };
  };
}

export const searchArticles = defineTool({
  name: 'search_articles',
  displayName: 'Search Articles',
  description:
    'Search Wikipedia articles by keyword. Returns matching articles with snippets, word counts, and timestamps. Supports pagination via offset.',
  summary: 'Search Wikipedia for articles matching a query',
  icon: 'search',
  group: 'Articles',
  input: z.object({
    query: z.string().describe('Search query text'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (default 10, max 50)'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination (default 0)'),
  }),
  output: z.object({
    results: z.array(searchResultSchema),
    total_hits: z.number().int().describe('Total number of matching articles'),
    suggestion: z.string().describe('Search suggestion if available (empty if none)'),
  }),
  handle: async params => {
    const data = await api<SearchResponse>({
      action: 'query',
      list: 'search',
      srsearch: params.query,
      srlimit: params.limit ?? 10,
      sroffset: params.offset,
    });

    const results = (data.query?.search ?? []).map(mapSearchResult);
    return {
      results,
      total_hits: data.query?.searchinfo?.totalhits ?? 0,
      suggestion: data.query?.searchinfo?.suggestion ?? '',
    };
  },
});
