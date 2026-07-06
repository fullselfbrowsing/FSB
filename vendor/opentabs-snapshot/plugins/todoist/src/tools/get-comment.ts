import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const getComment = defineTool({
  name: 'get_comment',
  displayName: 'Get Comment',
  description: 'Get a specific comment by its ID.',
  summary: 'Get a comment by ID',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    comment_id: z.string().describe('The ID of the comment to retrieve'),
  }),
  output: z.object({
    comment: commentSchema.describe('The requested comment'),
  }),
  handle: async params => {
    const data = await api<RawComment>(`/comments/${params.comment_id}`);
    return { comment: mapComment(data) };
  },
});
