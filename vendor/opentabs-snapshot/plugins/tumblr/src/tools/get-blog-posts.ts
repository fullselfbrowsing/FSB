import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawPost, postSchema, mapPost } from './schemas.js';

export const getBlogPosts = defineTool({
  name: 'get_blog_posts',
  displayName: 'Get Blog Posts',
  description: 'Get posts from a Tumblr blog. Optionally filter by post type or tag.',
  summary: 'List blog posts',
  icon: 'list',
  group: 'Blogs',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of posts to return (default 20, max 20)'),
    offset: z.number().int().min(0).optional().describe('Post offset for pagination'),
    type: z
      .enum(['text', 'photo', 'quote', 'link', 'chat', 'audio', 'video'])
      .optional()
      .describe('Filter by post type'),
    tag: z.string().optional().describe('Filter posts by tag'),
  }),
  output: z.object({
    posts: z.array(postSchema).describe('Blog posts'),
    total_posts: z.number().describe('Total post count for the blog'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = { npf: true };
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    if (params.type !== undefined) query.type = params.type;
    if (params.tag !== undefined) query.tag = params.tag;

    const data = await api<{ posts: RawPost[]; totalPosts?: number; blog?: { posts?: number } }>(
      `/blog/${params.blog_name}/posts`,
      { query },
    );

    return {
      posts: (data.posts ?? []).map(mapPost),
      total_posts: data.totalPosts ?? data.blog?.posts ?? 0,
    };
  },
});
