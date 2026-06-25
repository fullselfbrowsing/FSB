import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawBlog, blogSchema, mapBlog } from './schemas.js';

export const getBlogFollowing = defineTool({
  name: 'get_blog_following',
  displayName: 'Get Blog Following',
  description: 'Get the list of blogs that a Tumblr blog is following.',
  summary: 'List followed blogs',
  icon: 'eye',
  group: 'Blogs',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
    limit: z.number().int().min(1).max(20).optional().describe('Number of blogs to return (1-20)'),
    offset: z.number().int().min(0).optional().describe('Offset for pagination'),
  }),
  output: z.object({
    blogs: z.array(blogSchema).describe('Blogs this blog follows'),
    total: z.number().describe('Total blogs followed'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {};
    query.limit = params.limit ?? 20;
    if (params.offset !== undefined) query.offset = params.offset;

    const data = await api<{ blogs: RawBlog[]; totalBlogs: number }>(`/blog/${params.blog_name}/following`, { query });

    return {
      blogs: (data.blogs ?? []).map(mapBlog),
      total: data.totalBlogs ?? 0,
    };
  },
});
