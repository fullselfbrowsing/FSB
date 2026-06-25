import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';

interface Response {
  total?: number;
}

export const getCompletedQuestionCount = defineTool({
  name: 'get_completed_question_count',
  displayName: 'Get Completed Question Count',
  description:
    'Get how many questions the authenticated user has marked as COMPLETED, scoped to a single dimension. Provide exactly one of `company` (uppercase company key), `type` (ALGORITHM, SD, ML_SD, BLOG), or `selectedCollectionKey` (e.g. "hack2hire-50-picks"). Useful for showing study progress against a goal.',
  summary: 'Count completed questions in a scope',
  icon: 'check-circle',
  group: 'Account',
  input: z
    .object({
      company: z.string().optional().describe('Company key in uppercase (e.g. "PINTEREST", "AMAZON").'),
      type: z
        .enum(['ALGORITHM', 'SD', 'ML_SD', 'BLOG'])
        .optional()
        .describe('Post type to count completed questions for.'),
      selectedCollectionKey: z.string().optional().describe('Curated collection key (e.g. "hack2hire-50-picks").'),
    })
    .refine(p => Boolean(p.company) || Boolean(p.type) || Boolean(p.selectedCollectionKey), {
      message: 'Provide one of company, type, or selectedCollectionKey.',
    }),
  output: z.object({
    total: z.number().int().describe('Number of questions marked COMPLETED in the requested scope.'),
  }),
  handle: async params => {
    const data = await api<Response>('/user/completed-post-count', {
      company: params.company,
      type: params.type,
      selectedCollectionKey: params.selectedCollectionKey,
    });
    return { total: data.total ?? 0 };
  },
});
