import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapPost, postSchema } from './schemas.js';

export const getTimeline = defineTool({
  name: 'get_timeline',
  displayName: 'Get Timeline',
  description:
    "Get the authenticated user's home timeline. Returns posts from followed accounts, sorted chronologically. Supports cursor-based pagination.",
  summary: 'Get the home timeline',
  icon: 'home',
  group: 'Feed',
  input: z.object({
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
    posts: z.array(postSchema).describe('Array of posts from the home timeline'),
    cursor: z.string().describe('Pagination cursor for fetching the next page'),
  }),
  handle: async params => {
    const data = await api<{
      feed?: { post: Record<string, unknown> }[];
      cursor?: string;
    }>('app.bsky.feed.getTimeline', {
      query: {
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
