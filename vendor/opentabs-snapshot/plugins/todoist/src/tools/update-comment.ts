import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../todoist-api.js';
import { type RawComment, commentSchema, mapComment } from './schemas.js';

export const updateComment = defineTool({
  name: 'update_comment',
  displayName: 'Update Comment',
  description: 'Update the content of an existing comment.',
  summary: 'Update a comment',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    comment_id: z.string().describe('The ID of the comment to update'),
    content: z.string().describe('New comment content in markdown'),
  }),
  output: z.object({
    comment: commentSchema.describe('The updated comment'),
  }),
  handle: async params => {
    const data = await api<RawComment>(`/comments/${params.comment_id}`, {
      method: 'POST',
      body: { content: params.content },
    });
    return { comment: mapComment(data) };
  },
});
