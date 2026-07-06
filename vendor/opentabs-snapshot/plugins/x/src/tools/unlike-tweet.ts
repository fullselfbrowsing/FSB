import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const unlikeTweet = defineTool({
  name: 'unlike_tweet',
  displayName: 'Unlike Tweet',
  description: 'Remove a like from a tweet.',
  summary: 'Unlike a tweet',
  icon: 'heart-off',
  group: 'Engagement',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to unlike'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the unlike succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('UnfavoriteTweet', { tweet_id: params.tweet_id });
    return { success: true };
  },
});
