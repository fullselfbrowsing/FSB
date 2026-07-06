import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { questionSchema, mapQuestion } from './schemas.js';

export const listQuestions = defineTool({
  name: 'list_questions',
  displayName: 'List Questions',
  description:
    'List Stack Overflow questions sorted by activity, creation date, votes, or trending periods (hot, week, month). Returns questions with body content. Use this to browse recent or popular questions.',
  summary: 'List questions by activity, votes, or trending',
  icon: 'list',
  group: 'Questions',
  input: z.object({
    sort: z
      .enum(['activity', 'creation', 'votes', 'hot', 'week', 'month'])
      .optional()
      .describe('Sort order (default: activity)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    tagged: z
      .string()
      .optional()
      .describe('Semicolon-delimited tags to filter by (e.g., "javascript;react"). AND logic.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    questions: z.array(questionSchema).describe('Questions'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/questions', {
      query: {
        sort: params.sort ?? 'activity',
        order: params.order ?? 'desc',
        tagged: params.tagged,
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
