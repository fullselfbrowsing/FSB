import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../hack2hire-api.js';
import { type RawComment, commentDetailSchema, mapCommentDetail } from './schemas.js';

export const getComment = defineTool({
  name: 'get_comment',
  displayName: 'Get Comment',
  description:
    'Get the full content of a single comment by ID, including its source code body (for code-snippet comments) or markdown text body (for prose comments). The list endpoints (`list_question_comments`, `list_comment_replies`) only return metadata — call this to read the actual content.',
  summary: 'Get the full content of a comment',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    commentId: z.string().describe('Comment ID — get this from list_question_comments or list_comment_replies.'),
  }),
  output: z.object({ comment: commentDetailSchema }),
  handle: async params => {
    const data = await api<RawComment>(`/comment/${params.commentId}`);
    return { comment: mapCommentDetail(data) };
  },
});
