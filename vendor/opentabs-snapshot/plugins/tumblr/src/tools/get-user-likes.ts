import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, mapPost, postSchema } from './schemas.js';

export const getUserLikes = defineTool({
  name: 'get_user_likes',
  displayName: 'Get User Likes',
  description: 'Get posts liked by the authenticated Tumblr user. Returns liked posts with the total like count.',
  summary: 'Get your liked posts',
  icon: 'heart',
  group: 'Account',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Number of liked posts to return (default 20, max 20)'),
    offset: z.number().int().min(0).optional().describe('Post offset for pagination'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Liked posts'),
    liked_count: z.number().describe('Total liked posts'),
  }),
  handle: async params => {
    const data = await api<{ liked_posts: RawPost[]; liked_count: number }>('/user/likes', {
      query: {
        npf: true,
        limit: params.limit ?? 20,
        offset: params.offset,
      },
    });
    return {
      posts: (data.liked_posts ?? []).map(mapPost),
      liked_count: data.liked_count ?? 0,
    };
  },
});
