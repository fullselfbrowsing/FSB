import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapPost, postSchema } from './schemas.js';

export const getListFeed = defineTool({
  name: 'get_list_feed',
  displayName: 'Get List Feed',
  description: 'Get posts from a user list. Requires the list AT URI.',
  summary: 'Get posts from a user list',
  icon: 'list-ordered',
  group: 'Feed',
  input: z.object({
    list: z.string().min(1).describe('AT URI of the list (e.g., at://did/app.bsky.graph.list/rkey)'),
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
    posts: z.array(postSchema).describe('Array of posts from the list'),
    cursor: z.string().describe('Pagination cursor for fetching the next page'),
  }),
  handle: async params => {
    const data = await api<{
      feed?: { post: Record<string, unknown> }[];
      cursor?: string;
    }>('app.bsky.feed.getListFeed', {
      query: {
        list: params.list,
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
