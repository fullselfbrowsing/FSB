import { redditPost } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const deleteThing = defineTool({
  name: 'delete',
  displayName: 'Delete Post/Comment',
  description:
    'Permanently delete a post or comment. Only the author can delete their own content. This action cannot be undone.',
  summary: 'Delete a post or comment',
  icon: 'trash',
  group: 'Actions',
  input: z.object({
    id: z
      .string()
      .min(1)
      .describe('Fullname of the post or comment to delete (e.g., "t3_abc123" for a post, "t1_xyz" for a comment)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion was successful'),
  }),
  handle: async params => {
    await redditPost<Record<string, never>>('/api/del', { id: params.id });
    return { success: true };
  },
});
