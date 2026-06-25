import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, extractTweetsFromTimeline, extractCursor, mapTweet } from './schemas.js';

export const searchTweets = defineTool({
  name: 'search_tweets',
  displayName: 'Search Tweets',
  description:
    'Search for tweets matching a query. Supports standard X/Twitter search operators: exact phrases ("hello world"), OR (cats OR dogs), negation (-spam), from/to a user (from:username), mentions (@username), hashtags (#topic), min engagement (min_faves:100, min_retweets:10), filters (filter:links, filter:media, -filter:replies), language (lang:en), date range (since:2024-01-01 until:2024-12-31). Results can be sorted by relevance ("Top") or chronologically ("Latest").',
  summary: 'Search tweets by query with X search operators',
  icon: 'search',
  group: 'Explore',
  input: z.object({
    query: z.string().min(1).describe('Search query — supports X search operators (from:, #, OR, "", -, etc.)'),
    product: z
      .enum(['Top', 'Latest'])
      .optional()
      .describe('Sort order: "Top" for relevance (default), "Latest" for chronological'),
    count: z.int().min(1).max(40).optional().describe('Number of tweets to return (default 20, max 40)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema).describe('Matching tweets'),
    cursor: z.string().optional().describe('Cursor for the next page of results'),
  }),
  handle: async params => {
    const variables: Record<string, unknown> = {
      rawQuery: params.query,
      count: params.count ?? 20,
      querySource: 'typed_query',
      product: params.product ?? 'Top',
    };
    if (params.cursor) {
      variables.cursor = params.cursor;
    }

    const data = await graphqlQuery<Record<string, unknown>>('SearchTimeline', variables, { signed: true });

    const path = ['data', 'search_by_raw_query', 'search_timeline', 'timeline'];
    const rawTweets = extractTweetsFromTimeline(data, path);

    return {
      tweets: rawTweets.map(mapTweet),
      cursor: extractCursor(data, path),
    };
  },
});
