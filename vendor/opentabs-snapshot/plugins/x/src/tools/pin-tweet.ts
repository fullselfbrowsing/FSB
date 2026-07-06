import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const pinTweet = defineTool({
  name: 'pin_tweet',
  displayName: 'Pin Tweet',
  description: 'Pin a tweet to your profile.',
  summary: 'Pin a tweet to your profile',
  icon: 'pin',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to pin'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the pin succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('PinTweet', { tweet_id: params.tweet_id });
    return { success: true };
  },
});
