import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';

export const removeBookmark = defineTool({
  name: 'remove_bookmark',
  displayName: 'Remove Bookmark',
  description: 'Remove a tweet from your bookmarks.',
  summary: 'Remove a bookmark',
  icon: 'bookmark-minus',
  group: 'Engagement',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to remove from bookmarks'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the bookmark was removed'),
  }),
  handle: async params => {
    await graphqlMutation('DeleteBookmark', { tweet_id: params.tweet_id });
    return { success: true };
  },
});
