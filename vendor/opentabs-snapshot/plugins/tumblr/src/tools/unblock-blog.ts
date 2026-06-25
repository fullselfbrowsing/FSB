import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const unblockBlog = defineTool({
  name: 'unblock_blog',
  displayName: 'Unblock Blog',
  description: 'Unblock a previously blocked Tumblr blog.',
  summary: 'Unblock a blog',
  icon: 'shield-off',
  group: 'Moderation',
  input: z.object({
    blog_name: z.string().describe('Your blog name or identifier'),
    blocked_blog: z.string().describe('Blog name to unblock'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await api(`/blog/${params.blog_name}/blocks`, {
      method: 'DELETE',
      query: { blockedTumblelog: params.blocked_blog },
    });
    return { success: true };
  },
});
