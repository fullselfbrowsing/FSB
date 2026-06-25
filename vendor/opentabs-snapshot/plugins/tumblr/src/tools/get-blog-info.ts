import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawBlog, blogSchema, mapBlog } from './schemas.js';

export const getBlogInfo = defineTool({
  name: 'get_blog_info',
  displayName: 'Get Blog Info',
  description: 'Get information about a Tumblr blog including title, description, post count, and avatar.',
  summary: 'Get blog details',
  icon: 'book-open',
  group: 'Blogs',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
  }),
  output: z.object({ blog: blogSchema }),
  handle: async params => {
    const data = await api<{ blog: RawBlog }>(`/blog/${params.blog_name}/info`);
    return { blog: mapBlog(data.blog ?? {}) };
  },
});
