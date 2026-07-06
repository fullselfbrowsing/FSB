import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiVoid } from '../todoist-api.js';

export const deleteComment = defineTool({
  name: 'delete_comment',
  displayName: 'Delete Comment',
  description: 'Permanently delete a comment. This action cannot be undone.',
  summary: 'Delete a comment',
  icon: 'message-square',
  group: 'Comments',
  input: z.object({
    comment_id: z.string().describe('The ID of the comment to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the comment was deleted successfully'),
  }),
  handle: async params => {
    await apiVoid(`/comments/${params.comment_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
