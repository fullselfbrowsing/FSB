import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapPost, postSchema } from './schemas.js';

export const getFeed = defineTool({
  name: 'get_feed',
  displayName: 'Get Feed',
  description: "Get posts from a custom feed generator (e.g., Discover, What's Hot). Requires the feed AT URI.",
  summary: 'Get posts from a custom feed',
  icon: 'rss',
  group: 'Feed',
  input: z.object({
    feed: z.string().min(1).describe('AT URI of the feed generator (e.g., at://did/app.bsky.feed.generator/rkey)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of posts to return (default 50, max 100)'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Array of posts from the feed'),
    cursor: z.string().describe('Pagination cursor for fetching the next page'),
  }),
  handle: async params => {
    const data = await api<{
      feed?: { post: Record<string, unknown> }[];
      cursor?: string;
    }>('app.bsky.feed.getFeed', {
      query: {
        feed: params.feed,
        cursor: params.cursor,
        limit: params.limit ?? 50,
      },
    });
    return {
      posts: (data.feed ?? []).map(item => mapPost(item.post)),
      cursor: data.cursor ?? '',
    };
  },
});
