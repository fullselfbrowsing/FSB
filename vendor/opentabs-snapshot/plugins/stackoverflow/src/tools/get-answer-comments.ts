import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { commentSchema, mapComment } from './schemas.js';

export const getAnswerComments = defineTool({
  name: 'get_answer_comments',
  displayName: 'Get Answer Comments',
  description: 'Get comments on a specific Stack Overflow answer. Returns comment body, score, and author information.',
  summary: 'Get comments on an answer',
  icon: 'message-circle',
  group: 'Answers',
  input: z.object({
    answer_id: z.number().int().describe('Answer ID'),
    sort: z.enum(['creation', 'votes']).optional().describe('Sort order (default: creation)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    comments: z.array(commentSchema).describe('Comments on the answer'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api(`/answers/${params.answer_id}/comments`, {
      query: {
        sort: params.sort ?? 'creation',
        order: params.order ?? 'desc',
        page: params.page,
        pagesize: params.pagesize,
      },
    });
    return {
      comments: (data.items ?? []).map(mapComment),
      has_more: data.has_more ?? false,
      quota_remaining: data.quota_remaining ?? 0,
    };
  },
});
