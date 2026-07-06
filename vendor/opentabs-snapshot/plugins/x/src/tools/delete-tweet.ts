import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const deleteTweet = defineTool({
  name: 'delete_tweet',
  displayName: 'Delete Tweet',
  description: 'Delete a tweet. Only works for tweets authored by the authenticated user.',
  summary: 'Delete a tweet',
  icon: 'trash-2',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the deletion succeeded'),
  }),
  handle: async params => {
    await graphqlMutation('DeleteTweet', {
      tweet_id: params.tweet_id,
      dark_request: false,
    });

    return { success: true };
  },
});
