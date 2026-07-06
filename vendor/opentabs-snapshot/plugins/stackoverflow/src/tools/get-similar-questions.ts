import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { questionSchema, mapQuestion } from './schemas.js';

export const getSimilarQuestions = defineTool({
  name: 'get_similar_questions',
  displayName: 'Get Similar Questions',
  description:
    'Find Stack Overflow questions similar to a given title. Uses title-based similarity matching to find potential duplicates or related content. Useful before asking a new question to check for existing answers.',
  summary: 'Find similar questions by title',
  icon: 'copy',
  group: 'Questions',
  input: z.object({
    title: z.string().describe('Title text to find similar questions for'),
    tagged: z.string().optional().describe('Semicolon-delimited tags to filter by (e.g., "javascript;react")'),
    nottagged: z.string().optional().describe('Semicolon-delimited tags to exclude'),
    sort: z.enum(['activity', 'creation', 'votes', 'relevance']).optional().describe('Sort order (default: relevance)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    questions: z.array(questionSchema).describe('Similar questions'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/similar', {
      query: {
        title: params.title,
        tagged: params.tagged,
        nottagged: params.nottagged,
        sort: params.sort ?? 'relevance',
        order: params.order ?? 'desc',
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
