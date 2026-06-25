import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawBlog, blogSchema, mapBlog } from './schemas.js';

export const getRecommendedBlogs = defineTool({
  name: 'get_recommended_blogs',
  displayName: 'Get Recommended Blogs',
  description: 'Get recommended Tumblr blogs to follow.',
  summary: 'Discover recommended blogs',
  icon: 'sparkles',
  group: 'Explore',
  input: z.object({
    limit: z.number().int().min(1).max(20).optional().describe('Number of blogs to return (1-20)'),
  }),
  output: z.object({
    blogs: z.array(blogSchema).describe('Recommended blogs'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {};
    query.limit = params.limit ?? 8;

    const data = await api<{ blogs: RawBlog[] }>('/recommended/blogs', { query });

    return {
      blogs: (data.blogs ?? []).map(mapBlog),
    };
  },
});
