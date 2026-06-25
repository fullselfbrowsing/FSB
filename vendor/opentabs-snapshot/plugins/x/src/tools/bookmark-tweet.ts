import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const bookmarkTweet = defineTool({
  name: 'bookmark_tweet',
  displayName: 'Bookmark Tweet',
  description: 'Add a tweet to your bookmarks.',
  summary: 'Bookmark a tweet',
  icon: 'bookmark',
  group: 'Engagement',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to bookmark'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the bookmark was added'),
  }),
  handle: async params => {
    await graphqlMutation('CreateBookmark', { tweet_id: params.tweet_id });
    return { success: true };
  },
});
