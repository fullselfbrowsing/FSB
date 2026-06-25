import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { questionSchema, mapQuestion } from './schemas.js';

export const searchQuestions = defineTool({
  name: 'search_questions',
  displayName: 'Search Questions',
  description:
    'Search Stack Overflow questions using advanced search. Supports full-text query, tag filtering, date ranges, and multiple sort options. Returns questions with body content. Use this as the primary way to find relevant questions.',
  summary: 'Search questions with full-text query and filters',
  icon: 'search',
  group: 'Questions',
  input: z.object({
    q: z.string().optional().describe('Full-text search query (e.g., "react hooks useEffect")'),
    tagged: z
      .string()
      .optional()
      .describe('Semicolon-delimited tags to filter by (e.g., "javascript;react"). Uses AND logic.'),
    nottagged: z.string().optional().describe('Semicolon-delimited tags to exclude (e.g., "jquery;angular")'),
    sort: z
      .enum(['activity', 'creation', 'votes', 'relevance'])
      .optional()
      .describe('Sort order (default: relevance when q is provided, activity otherwise)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    accepted: z.boolean().optional().describe('Filter by whether the question has an accepted answer'),
    answers: z.number().int().optional().describe('Minimum number of answers'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    questions: z.array(questionSchema).describe('Matching questions'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/search/advanced', {
      query: {
        q: params.q,
        tagged: params.tagged,
        nottagged: params.nottagged,
        sort: params.sort,
        order: params.order ?? 'desc',
        accepted: params.accepted,
        answers: params.answers,
        page: params.page,
        pagesize: params.pagesize,
      },
    });
    return {
      questions: (data.items ?? []).map(mapQuestion),
      has_more: data.has_more ?? false,
      quota_remaining: data.quota_remaining ?? 0,
    };
  },
});
