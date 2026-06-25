import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../onlyfans-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

interface UserPostsResponse {
  list?: RawPost[];
  hasMore?: boolean;
  tailMarker?: string;
}

export const getUserPosts = defineTool({
  name: 'get_user_posts',
  displayName: 'Get User Posts',
  description:
    'Get posts from a specific user by their numeric ID. Returns posts in reverse chronological order with pagination.',
  summary: 'Get posts from a user',
  icon: 'image',
  group: 'Feed',
  input: z.object({
    user_id: z.number().int().describe('User ID to get posts from'),
    limit: z.number().int().min(1).max(50).optional().describe('Number of posts to return (default 10)'),
    offset: z.string().optional().describe('Pagination marker from a previous response (tail_marker)'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('User posts'),
    has_more: z.boolean().describe('Whether more posts are available'),
    tail_marker: z.string().describe('Pagination marker for the next page'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      limit: params.limit ?? 10,
      skip_users: 'all',
      format: 'infinite',
    };
    if (params.offset) query.afterPublishTime = params.offset;

    const data = await api<UserPostsResponse>(`/users/${params.user_id}/posts`, { query });
    return {
      posts: (data.list ?? []).map(mapPost),
      has_more: data.hasMore ?? false,
      tail_marker: data.tailMarker ?? '',
    };
  },
});
