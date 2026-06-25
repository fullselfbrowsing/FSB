import { redditPost } from '../reddit-api.js';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const vote = defineTool({
  name: 'vote',
  displayName: 'Vote',
  description: 'Upvote, downvote, or remove a vote on a post or comment',
  summary: 'Vote on a post or comment',
  icon: 'arrow-up',
  group: 'Actions',
  input: z.object({
    id: z
      .string()
      .min(1)
      .describe('Fullname of the thing to vote on (e.g., "t3_abc123" for post, "t1_xyz" for comment)'),
    dir: z.number().int().min(-1).max(1).describe('Vote direction: 1 = upvote, -1 = downvote, 0 = remove vote'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the vote was recorded'),
  }),
  handle: async params => {
    await redditPost<Record<string, never>>('/api/vote', {
      id: params.id,
      dir: String(params.dir),
    });
    return { success: true };
  },
});
