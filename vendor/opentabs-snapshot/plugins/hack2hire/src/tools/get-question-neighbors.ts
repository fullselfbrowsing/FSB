import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { POST_TYPES, type RawPost, mapPostSummary, postSummarySchema } from './schemas.js';

const sortedByOptions = ['isLocked', 'frequency', 'difficulty', 'createdDate'] as const;

interface Response {
  previousPost?: RawPost | null;
  nextPost?: RawPost | null;
}

const emptyPost = (): RawPost => ({});

export const getQuestionNeighbors = defineTool({
  name: 'get_question_neighbors',
  displayName: 'Get Question Neighbors',
  description:
    'Get the previous and next questions relative to a given post within a filtered, sorted list. Pass the same `company`, `type`, and `sortedBy` you would use in `list_questions` so the navigation matches the UI ordering. The previous or next field has empty values when the post is at the start or end of the list.',
  summary: 'Get prev/next questions in a list',
  icon: 'arrow-right-left',
  group: 'Questions',
  input: z.object({
    postId: z.string().describe('Post ID to anchor navigation around.'),
    company: z
      .string()
      .optional()
      .describe('Company key in uppercase (e.g. "PINTEREST"). Match the list_questions call you used.'),
    type: z.enum(POST_TYPES).optional().describe('Post type filter.'),
    sortedBy: z
      .enum(sortedByOptions)
      .optional()
      .describe('Sort order. Defaults to "isLocked" — match the list_questions sortBy you used.'),
  }),
  output: z.object({
    previous: postSummarySchema.describe('The previous question summary, or all-empty fields when none.'),
    next: postSummarySchema.describe('The next question summary, or all-empty fields when none.'),
  }),
  handle: async params => {
    const data = await api<Response>(`/post/${params.postId}/previous-next`, {
      company: params.company,
      type: params.type,
      sortedBy: params.sortedBy ?? 'isLocked',
    });
    return {
      previous: mapPostSummary(data.previousPost ?? emptyPost()),
      next: mapPostSummary(data.nextPost ?? emptyPost()),
    };
  },
});
