import { redditPost } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const save = defineTool({
  name: 'save',
  displayName: 'Save',
  description: 'Save or unsave a post or comment to your saved items',
  summary: 'Save or unsave a post/comment',
  icon: 'bookmark',
  group: 'Actions',
  input: z.object({
    id: z.string().min(1).describe('Fullname of the thing to save (e.g., "t3_abc123" for post, "t1_xyz" for comment)'),
    unsave: z.boolean().optional().describe('Set to true to unsave instead of save (default: false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the action was successful'),
  }),
  handle: async params => {
    const endpoint = params.unsave ? '/api/unsave' : '/api/save';
    await redditPost<Record<string, never>>(endpoint, { id: params.id });
    return { success: true };
  },
});
