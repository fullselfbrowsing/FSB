import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const unretweet = defineTool({
  name: 'unretweet',
  displayName: 'Unretweet',
  description: 'Remove a retweet.',
  summary: 'Undo a retweet',
  icon: 'repeat',
  group: 'Engagement',
  input: z.object({
    tweet_id: z.string().min(1).describe('Original tweet ID to unretweet'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unretweet succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('DeleteRetweet', { source_tweet_id: params.tweet_id, dark_request: false });
    return { success: true };
  },
});
