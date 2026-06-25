import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { searchExcerptSchema, mapSearchExcerpt } from './schemas.js';

export const searchExcerpts = defineTool({
  name: 'search_excerpts',
  displayName: 'Search with Excerpts',
  description:
    'Search Stack Overflow questions and answers and return results with text excerpts containing highlighted matches. Returns both question and answer results with their excerpts. Useful for getting a quick overview of search results.',
  summary: 'Search with highlighted excerpts',
  icon: 'file-search',
  group: 'Search',
  input: z.object({
    q: z.string().describe('Search query text'),
    tagged: z.string().optional().describe('Semicolon-delimited tags to filter by (e.g., "javascript;react")'),
    nottagged: z.string().optional().describe('Semicolon-delimited tags to exclude'),
    sort: z.enum(['activity', 'creation', 'votes', 'relevance']).optional().describe('Sort order (default: relevance)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    accepted: z.boolean().optional().describe('Filter by whether the question has an accepted answer'),
    answers: z.number().int().optional().describe('Minimum number of answers'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    results: z.array(searchExcerptSchema).describe('Search results with excerpts'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/search/excerpts', {
      query: {
        q: params.q,
        tagged: params.tagged,
        nottagged: params.nottagged,
        sort: params.sort ?? 'relevance',
        order: params.order ?? 'desc',
        accepted: params.accepted,
        answers: params.answers,
        page: params.page,
        pagesize: params.pagesize,
      },
    });
    return {
      results: (data.items ?? []).map(mapSearchExcerpt),
      has_more: data.has_more ?? false,
      quota_remaining: data.quota_remaining ?? 0,
    };
  },
});
