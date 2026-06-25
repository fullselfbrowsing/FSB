import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, extractTweetsFromTimeline, extractCursor, mapTweet } from './schemas.js';

const TIMELINE_PATH = ['data', 'bookmark_timeline_v2', 'timeline'];

export const getBookmarks = defineTool({
  name: 'get_bookmarks',
  displayName: 'Get Bookmarks',
  description: "Get the authenticated user's bookmarked tweets.",
  summary: 'Get bookmarked tweets',
  icon: 'bookmark',
  group: 'Bookmarks',
  input: z.object({
    count: z.int().min(1).max(40).optional().describe('Number of tweets (default 20, max 40)'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const data = await graphqlQuery<Record<string, unknown>>('Bookmarks', {
      count: params.count ?? 20,
      includePromotedContent: false,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    });

    const rawTweets = extractTweetsFromTimeline(data, TIMELINE_PATH);
    const nextCursor = extractCursor(data, TIMELINE_PATH);

    return {
      tweets: rawTweets.map(mapTweet),
      cursor: nextCursor,
    };
  },
});
