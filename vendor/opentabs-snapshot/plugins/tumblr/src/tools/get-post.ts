import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { postSchema, type RawPost, mapPost } from './schemas.js';

export const getPost = defineTool({
  name: 'get_post',
  displayName: 'Get Post',
  description: 'Get detailed information about a specific Tumblr post by blog name and post ID.',
  summary: 'Get a post',
  icon: 'file-text',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name or URL (e.g. "staff" or "staff.tumblr.com")'),
    post_id: z.string().describe('Post ID'),
  }),
  output: z.object({ post: postSchema }),
  handle: async params => {
    const raw = await api<RawPost>(`/blog/${params.blog_name}/posts/${params.post_id}`, {
      query: { npf: true },
    });
    return { post: mapPost(raw) };
  },
});
