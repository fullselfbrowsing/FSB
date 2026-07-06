import { redditPost } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const hide = defineTool({
  name: 'hide',
  displayName: 'Hide/Unhide Post',
  description:
    'Hide or unhide a post from your feed. Hidden posts no longer appear in listings but can be viewed directly.',
  summary: 'Hide or unhide a post',
  icon: 'eye-off',
  group: 'Actions',
  input: z.object({
    id: z.string().min(1).describe('Fullname of the post to hide (e.g., "t3_abc123")'),
    unhide: z.boolean().optional().describe('Set to true to unhide instead of hide (default: false)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the action was successful'),
  }),
  handle: async params => {
    const endpoint = params.unhide ? '/api/unhide' : '/api/hide';
    await redditPost<Record<string, never>>(endpoint, { id: params.id });
    return { success: true };
  },
});
