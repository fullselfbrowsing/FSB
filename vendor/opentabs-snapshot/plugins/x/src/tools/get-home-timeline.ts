import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlMutation } from '../x-api.js';
import { tweetSchema, extractTweetsFromTimeline, extractCursor, mapTweet } from './schemas.js';

export const getHomeTimeline = defineTool({
  name: 'get_home_timeline',
  displayName: 'Get Home Timeline',
  description:
    "Get tweets from the authenticated user's home timeline (For You feed). Returns the most recent tweets. Use cursor for pagination.",
  summary: 'Get home timeline tweets',
  icon: 'home',
  group: 'Timelines',
  input: z.object({
    count: z.int().min(1).max(40).optional().describe('Number of tweets to return (default 20, max 40)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const data = await graphqlMutation<Record<string, unknown>>('HomeTimeline', {
      count: params.count ?? 20,
      includePromotedContent: false,
      withCommunity: true,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.cursor ? { seenTweetIds: [] } : { latestControlAvailable: true }),
    });

    const path = ['data', 'home', 'home_timeline_urt'];
    const rawTweets = extractTweetsFromTimeline(data, path);
    return {
      tweets: rawTweets.map(mapTweet),
      cursor: extractCursor(data, path),
    };
  },
});
