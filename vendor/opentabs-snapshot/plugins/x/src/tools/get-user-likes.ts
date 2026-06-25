import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, mapTweet, extractTweetsFromTimeline, extractCursor } from './schemas.js';

export const getUserLikes = defineTool({
  name: 'get_user_likes',
  displayName: 'Get User Likes',
  description: "Get tweets liked by a specific user. Requires the user's numeric ID.",
  summary: 'Get tweets liked by a user',
  icon: 'heart',
  group: 'Users',
  input: z.object({
    user_id: z.string().min(1).describe('User ID'),
    count: z.int().min(1).max(40).optional().describe('Number of tweets (default 20, max 40)'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const data = await graphqlQuery<Record<string, unknown>>('Likes', {
      userId: params.user_id,
      count: params.count ?? 20,
      includePromotedContent: false,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    });

    const timelinePath = ['data', 'user', 'result', 'timeline_v2', 'timeline'];
    const rawTweets = extractTweetsFromTimeline(data, timelinePath);
    const nextCursor = extractCursor(data, timelinePath);

    return {
      tweets: rawTweets.map(mapTweet),
      cursor: nextCursor,
    };
  },
});
