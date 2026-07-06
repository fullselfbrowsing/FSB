import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const deletePost = defineTool({
  name: 'delete_post',
  displayName: 'Delete Post',
  description: 'Permanently delete a post from a Tumblr blog. This action cannot be undone.',
  summary: 'Delete a post',
  icon: 'trash-2',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Blog name or URL'),
    post_id: z.string().describe('Post ID to delete'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the deletion succeeded') }),
  handle: async params => {
    await api(`/blog/${params.blog_name}/post/delete`, {
      method: 'POST',
      body: { id: params.post_id },
    });
    return { success: true };
  },
});
