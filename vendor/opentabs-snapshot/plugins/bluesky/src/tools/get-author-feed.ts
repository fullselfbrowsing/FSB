import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapPost, postSchema } from './schemas.js';

export const getAuthorFeed = defineTool({
  name: 'get_author_feed',
  displayName: 'Get Author Feed',
  description:
    'Get posts by a specific user. Filter by post type: posts_with_replies (default), posts_no_replies, posts_with_media, or posts_and_author_threads.',
  summary: 'Get posts by a specific user',
  icon: 'user',
  group: 'Feed',
  input: z.object({
    actor: z.string().min(1).describe('DID or handle of the user (e.g., "user.bsky.social" or "did:plc:...")'),
    filter: z
      .enum(['posts_with_replies', 'posts_no_replies', 'posts_with_media', 'posts_and_author_threads'])
      .optional()
      .describe('Filter posts by type (default "posts_with_replies")'),
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
    posts: z.array(postSchema).describe('Array of posts by the user'),
    cursor: z.string().describe('Pagination cursor for fetching the next page'),
  }),
  handle: async params => {
    const data = await api<{
      feed?: { post: Record<string, unknown> }[];
      cursor?: string;
    }>('app.bsky.feed.getAuthorFeed', {
      query: {
        actor: params.actor,
        filter: params.filter,
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
