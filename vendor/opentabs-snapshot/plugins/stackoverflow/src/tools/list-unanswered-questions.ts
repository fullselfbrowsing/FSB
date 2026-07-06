import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { questionSchema, mapQuestion } from './schemas.js';

export const listUnansweredQuestions = defineTool({
  name: 'list_unanswered_questions',
  displayName: 'List Unanswered Questions',
  description:
    'List Stack Overflow questions that have no upvoted or accepted answers. Useful for finding questions that need help.',
  summary: 'List questions with no upvoted answers',
  icon: 'circle-help',
  group: 'Questions',
  input: z.object({
    tagged: z.string().optional().describe('Semicolon-delimited tags to filter by (e.g., "python;pandas")'),
    sort: z.enum(['activity', 'creation', 'votes']).optional().describe('Sort order (default: activity)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    questions: z.array(questionSchema).describe('Unanswered questions'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api('/questions/unanswered', {
      query: {
        tagged: params.tagged,
        sort: params.sort ?? 'activity',
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
