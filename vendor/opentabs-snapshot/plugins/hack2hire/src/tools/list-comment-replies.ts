import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type Hack2HireList, api } from '../hack2hire-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const listCommentReplies = defineTool({
  name: 'list_comment_replies',
  displayName: 'List Comment Replies',
  description:
    'List replies to a Hack2Hire comment. Each reply has the same shape as a top-level comment (body, vote scores, author, etc.).',
  summary: 'List replies to a comment',
  icon: 'corner-down-right',
  group: 'Comments',
  input: z.object({
    commentId: z.string().describe('Parent comment ID — get this from list_question_comments.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1).'),
    perPage: z.number().int().min(1).max(50).optional().describe('Results per page (default 10, max 50).'),
  }),
  output: z.object({
    replies: z.array(commentSchema),
    total: z.number().int().describe('Total replies across all pages.'),
  }),
  handle: async params => {
    const data = await api<Hack2HireList<RawComment>>('/comment/reply/filter', {
      commentId: params.commentId,
      page: params.page ?? 1,
      perPage: params.perPage ?? 10,
    });
    return {
      replies: (data.data ?? []).map(mapComment),
      total: data.total ?? 0,
    };
  },
});
