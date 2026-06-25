import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, extractTweetsFromTimeline, extractCursor, mapTweet } from './schemas.js';

const TIMELINE_PATH = ['data', 'threaded_conversation_with_injections_v2'];

export const getTweetReplies = defineTool({
  name: 'get_tweet_replies',
  displayName: 'Get Tweet Replies',
  description: 'Get the reply thread for a tweet. Returns the original tweet and its replies.',
  summary: 'Get replies to a tweet',
  icon: 'message-circle',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID to get replies for'),
    cursor: z.string().optional().describe('Pagination cursor'),
  }),
  output: z.object({
    tweets: z.array(tweetSchema),
    cursor: z.string().optional().describe('Cursor for next page'),
  }),
  handle: async params => {
    const variables: Record<string, unknown> = {
      focalTweetId: params.tweet_id,
      with_rux_injections: false,
      rankingMode: 'Relevance',
      includePromotedContent: false,
      withCommunity: true,
      withQuickPromoteEligibilityTweetFields: true,
      withBirdwatchNotes: true,
      withVoice: true,
    };

    if (params.cursor) {
      variables.cursor = params.cursor;
    }

    const data = await graphqlQuery<Record<string, unknown>>('TweetDetail', variables);

    const rawTweets = extractTweetsFromTimeline(data, TIMELINE_PATH);
    const nextCursor = extractCursor(data, TIMELINE_PATH);

    return {
      tweets: rawTweets.map(mapTweet),
      cursor: nextCursor,
    };
  },
});
