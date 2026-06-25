import { redditPost } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const report = defineTool({
  name: 'report',
  displayName: 'Report',
  description: 'Report a post or comment to the subreddit moderators for rule violations.',
  summary: 'Report a post or comment',
  icon: 'flag',
  group: 'Actions',
  input: z.object({
    thing_id: z.string().min(1).describe('Fullname of the post or comment to report (e.g., "t3_abc123" or "t1_xyz")'),
    reason: z.string().min(1).describe('Reason for the report'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the report was submitted'),
  }),
  handle: async params => {
    await redditPost<Record<string, never>>('/api/report', {
      thing_id: params.thing_id,
      reason: params.reason,
    });
    return { success: true };
  },
});
