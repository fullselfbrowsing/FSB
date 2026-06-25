import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const retweet = defineTool({
  name: 'retweet',
  displayName: 'Retweet',
  description: 'Retweet (repost) a tweet.',
  summary: 'Retweet a tweet',
  icon: 'repeat',
  group: 'Engagement',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to retweet'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the retweet succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('CreateRetweet', { tweet_id: params.tweet_id, dark_request: false });
    return { success: true };
  },
});
