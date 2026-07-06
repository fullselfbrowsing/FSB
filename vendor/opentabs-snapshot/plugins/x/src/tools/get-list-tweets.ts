import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, extractTweetsFromTimeline, extractCursor, mapTweet } from './schemas.js';

const TIMELINE_PATH = ['data', 'list', 'tweets_timeline', 'timeline'];

export const getListTweets = defineTool({
  name: 'get_list_tweets',
  displayName: 'Get List Tweets',
  description: "Get tweets from a list's timeline.",
  summary: 'Get tweets from a list',
  icon: 'list',
  group: 'Lists',
  input: z.object({
    list_id: z.string().min(1).describe('List ID'),
    count: z.int().min(1).max(40).optional().describe('Number of tweets (default 20, max 40)'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const data = await graphqlQuery<Record<string, unknown>>('ListRankedTweetsTimeline', {
      listId: params.list_id,
      count: params.count ?? 20,
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
