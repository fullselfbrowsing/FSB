import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { answerSchema, mapAnswer } from './schemas.js';

export const getUserAnswers = defineTool({
  name: 'get_user_answers',
  displayName: 'Get User Answers',
  description:
    "Get answers posted by a specific Stack Overflow user. Returns the user's answers sorted by activity, creation date, or votes.",
  summary: 'Get answers by a user',
  icon: 'message-square',
  group: 'Users',
  input: z.object({
    user_id: z.number().int().describe('User ID'),
    sort: z.enum(['activity', 'creation', 'votes']).optional().describe('Sort order (default: activity)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    answers: z.array(answerSchema).describe("User's answers"),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api(`/users/${params.user_id}/answers`, {
      query: {
        sort: params.sort ?? 'activity',
        order: params.order ?? 'desc',
        page: params.page,
        pagesize: params.pagesize,
      },
    });
    return {
      answers: (data.items ?? []).map(mapAnswer),
      has_more: data.has_more ?? false,
      quota_remaining: data.quota_remaining ?? 0,
    };
  },
});
