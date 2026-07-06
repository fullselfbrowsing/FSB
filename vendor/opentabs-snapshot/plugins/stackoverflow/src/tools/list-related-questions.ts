import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stackoverflow-api.js';
import { questionSchema, mapQuestion } from './schemas.js';

export const listRelatedQuestions = defineTool({
  name: 'list_related_questions',
  displayName: 'List Related Questions',
  description:
    'Get questions related to a specific Stack Overflow question. Returns questions that the system considers similar based on content and tags.',
  summary: 'Get related questions',
  icon: 'link',
  group: 'Questions',
  input: z.object({
    question_id: z.number().int().describe('Question ID to find related questions for'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    pagesize: z.number().int().min(1).max(100).optional().describe('Results per page (default 30, max 100)'),
  }),
  output: z.object({
    questions: z.array(questionSchema).describe('Related questions'),
    has_more: z.boolean().describe('Whether more results are available'),
    quota_remaining: z.number().describe('API quota remaining for today'),
  }),
  handle: async params => {
    const data = await api(`/questions/${params.question_id}/related`, {
      query: {
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
