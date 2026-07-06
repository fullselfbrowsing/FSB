import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, postSchema, mapPost } from './schemas.js';

export const getBlogLikes = defineTool({
  name: 'get_blog_likes',
  displayName: 'Get Blog Likes',
  description: 'Get the posts liked by a Tumblr blog.',
  summary: 'List liked posts',
  icon: 'heart',
  group: 'Blogs',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of liked posts to return (1-20)'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Liked posts'),
    liked_count: z.number().describe('Total liked posts'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = { npf: true };
    query.limit = params.limit ?? 20;
    if (params.offset !== undefined) query.offset = params.offset;

    const data = await api<{ likedPosts: RawPost[]; likedCount: number }>(`/blog/${params.blog_name}/likes`, { query });

    return {
      posts: (data.likedPosts ?? []).map(mapPost),
      liked_count: data.likedCount ?? 0,
    };
  },
});
