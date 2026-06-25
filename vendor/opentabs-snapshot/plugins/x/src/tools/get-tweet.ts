import { z } from 'zod';
import { defineTool } from '@opentabs-dev/plugin-sdk';
import { graphqlQuery } from '../x-api.js';
import { tweetSchema, mapTweet } from './schemas.js';
import type { RawTweetResult } from './schemas.js';

export const getTweet = defineTool({
  name: 'get_tweet',
  displayName: 'Get Tweet',
  description:
    'Get detailed information about a specific tweet by its ID. Returns the tweet with full engagement metrics, author details, and reply thread context.',
  summary: 'Get tweet details by ID',
  icon: 'file-text',
  group: 'Tweets',
  input: z.object({
    tweet_id: z.string().min(1).describe('Tweet ID'),
  }),
  output: z.object({
    tweet: tweetSchema,
  }),
  handle: async params => {
    const data = await graphqlQuery<{ data: { tweetResult: { result: RawTweetResult } } }>('TweetResultByRestId', {
      tweetId: params.tweet_id,
      withCommunity: true,
      includePromotedContent: false,
      withVoice: false,
    });

    let raw = data.data.tweetResult.result;
    if (raw.__typename === 'TweetWithVisibilityResults') {
      raw = (raw as unknown as { tweet: RawTweetResult }).tweet;
    }

    return { tweet: mapTweet(raw) };
  },
});
