import { ToolError, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type Hack2HireList, api } from '../hack2hire-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const listQuestionComments = defineTool({
  name: 'list_question_comments',
  displayName: 'List Question Comments',
  description:
    "List comments on a Hack2Hire interview question or coding question. Provide either `postId` (top-level discussion on the post) or `codingQuestionId` (comments anchored to a specific coding question — get this ID from `get_question`'s `codingQuestionIds` field). Each comment includes the body, language label for code snippets, vote scores, view count, reply count, and author identity.",
  summary: 'List comments on a question',
  icon: 'message-circle',
  group: 'Comments',
  input: z
    .object({
      postId: z.string().optional().describe('Post ID — list discussion comments on the post itself.'),
      codingQuestionId: z
        .string()
        .optional()
        .describe(
          "Coding question ID — list comments anchored to a specific coding question. Get this from get_question's codingQuestionIds field.",
        ),
      page: z.number().int().min(1).optional().describe('Page number (default 1).'),
      perPage: z.number().int().min(1).max(50).optional().describe('Results per page (default 10, max 50).'),
    })
    .refine(p => Boolean(p.postId) || Boolean(p.codingQuestionId), {
      message: 'Provide either postId or codingQuestionId.',
    }),
  output: z.object({
    comments: z.array(commentSchema),
    total: z.number().int().describe('Total comments matching the filter across all pages.'),
  }),
  handle: async params => {
    if (!params.postId && !params.codingQuestionId) {
      throw ToolError.validation('Provide either postId or codingQuestionId.');
    }
    const data = await api<Hack2HireList<RawComment>>('/comment/filter', {
      page: params.page ?? 1,
      perPage: params.perPage ?? 10,
      postId: params.postId,
      codingQuestionId: params.codingQuestionId,
    });
    return {
      comments: (data.data ?? []).map(mapComment),
      total: data.total ?? 0,
    };
  },
});
