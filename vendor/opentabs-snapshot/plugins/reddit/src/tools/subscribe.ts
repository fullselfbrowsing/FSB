import { redditPost } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const subscribe = defineTool({
  name: 'subscribe',
  displayName: 'Subscribe',
  description: 'Subscribe to or unsubscribe from a subreddit',
  summary: 'Subscribe or unsubscribe from a subreddit',
  icon: 'bell',
  group: 'Subreddits',
  input: z.object({
    subreddit: z.string().min(1).describe('Subreddit name without r/ prefix'),
    action: z.enum(['sub', 'unsub']).describe('"sub" to subscribe, "unsub" to unsubscribe'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the action was successful'),
  }),
  handle: async params => {
    await redditPost<Record<string, never>>('/api/subscribe', {
      action: params.action,
      sr_name: params.subreddit,
    });
    return { success: true };
  },
});
