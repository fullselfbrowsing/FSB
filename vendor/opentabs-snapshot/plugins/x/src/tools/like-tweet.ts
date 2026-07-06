import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const likeTweet = defineTool({
  name: 'like_tweet',
  displayName: 'Like Tweet',
  description: 'Like (favorite) a tweet.',
  summary: 'Like a tweet',
  icon: 'heart',
  group: 'Engagement',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to like'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the like succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('FavoriteTweet', { tweet_id: params.tweet_id });
    return { success: true };
  },
});
