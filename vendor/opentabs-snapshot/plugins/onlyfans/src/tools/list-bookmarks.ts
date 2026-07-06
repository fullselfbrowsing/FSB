import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

interface BookmarksResponse {
  list?: RawPost[];
  hasMore?: boolean;
}

export const listBookmarks = defineTool({
  name: 'list_bookmarks',
  displayName: 'List Bookmarks',
  description: 'List your bookmarked/saved posts. Returns posts you have previously bookmarked.',
  summary: 'List your bookmarked posts',
  icon: 'bookmark',
  group: 'Bookmarks',
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('Number of posts to return (default 10)'),
    offset: z.string().optional().describe('Pagination marker from a previous response'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Bookmarked posts'),
    has_more: z.boolean().describe('Whether more bookmarks are available'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      limit: params.limit ?? 10,
      skip_users: 'all',
      format: 'infinite',
    };
    if (params.offset) query.afterPublishTime = params.offset;

    const data = await api<BookmarksResponse>('/posts/bookmarks', { query });
    return {
      posts: (data.list ?? []).map(mapPost),
      has_more: data.hasMore ?? false,
    };
  },
});
