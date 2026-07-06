import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, extractTweetsFromTimeline, extractCursor, mapTweet } from './schemas.js';

export const getUserTweets = defineTool({
  name: 'get_user_tweets',
  displayName: 'Get User Tweets',
  description:
    "Get tweets posted by a specific user. Requires the user's numeric ID (use get_user_profile to find it from a screen name).",
  summary: 'Get tweets by a user',
  icon: 'message-square',
  group: 'Timelines',
  input: z.object({
    user_id: z.string().min(1).describe('User ID (numeric)'),
    count: z.int().min(1).max(40).optional().describe('Number of tweets (default 20, max 40)'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const data = await graphqlQuery<Record<string, unknown>>('UserTweets', {
      userId: params.user_id,
      count: params.count ?? 20,
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      ...(params.cursor ? { cursor: params.cursor } : {}),
    });

    const path = ['data', 'user', 'result', 'timeline_v2', 'timeline'];
    const rawTweets = extractTweetsFromTimeline(data, path);
    return {
      tweets: rawTweets.map(mapTweet),
      cursor: extractCursor(data, path),
    };
  },
});
