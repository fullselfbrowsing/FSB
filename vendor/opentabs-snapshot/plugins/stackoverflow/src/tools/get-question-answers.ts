import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { answerSchema, mapAnswer } from './schemas.js';

export const getQuestionAnswers = defineTool({
  name: 'get_question_answers',
  displayName: 'Get Question Answers',
  description:
    'Get all answers for a specific Stack Overflow question. Returns answer body, score, acceptance status, and author information. Answers can be sorted by activity, creation date, or votes.',
  summary: 'Get answers for a question',
  icon: 'message-square',
  group: 'Questions',
  input: z.object({
    question_id: z.number().int().describe('Question ID'),
    sort: z.enum(['activity', 'creation', 'votes']).optional().describe('Sort order (default: votes)'),
    order: z.enum(['asc', 'desc']).optional().describe('Sort direction (default: desc)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    answers: z.array(answerSchema).describe('Answers to the question'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api(`/questions/${params.question_id}/answers`, {
      query: {
        sort: params.sort ?? 'votes',
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
