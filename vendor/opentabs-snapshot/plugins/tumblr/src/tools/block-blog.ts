import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const blockBlog = defineTool({
  name: 'block_blog',
  displayName: 'Block Blog',
  description: 'Block a Tumblr blog. The blocked blog will no longer be able to interact with your blog.',
  summary: 'Block a blog',
  icon: 'shield-ban',
  group: 'Moderation',
  input: z.object({
    blog_name: z.string().describe('Your blog name or identifier'),
    blocked_blog: z.string().describe('Blog name to block'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/blog/${params.blog_name}/blocks`, {
      method: 'POST',
      body: { blockedTumblelog: params.blocked_blog },
    });
    return { success: true };
  },
});
