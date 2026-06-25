import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const reblogPost = defineTool({
  name: 'reblog_post',
  displayName: 'Reblog Post',
  description: 'Reblog a post to your Tumblr blog, optionally adding a comment.',
  summary: 'Reblog a post',
  icon: 'repeat',
  group: 'Posts',
  input: z.object({
    blog_name: z.string().describe('Your blog name to reblog to'),
    parent_blog_name: z.string().describe('Source blog name where the post originated'),
    parent_post_id: z.string().describe('Post ID of the original post to reblog'),
    reblog_key: z.string().describe('Reblog key for the post (from post data)'),
    comment: z.string().optional().describe('Optional text comment to add to the reblog'),
  }),
  output: z.object({ id: z.string().describe('New reblog post ID') }),
  handle: async params => {
    const res = await api<{ id: number }>(`/blog/${params.blog_name}/posts`, {
      method: 'POST',
      body: {
        parent_tumblelog_uuid: params.parent_blog_name,
        parent_post_id: params.parent_post_id,
        reblog_key: params.reblog_key,
        content: params.comment ? [{ type: 'text', text: params.comment }] : [],
        state: 'published',
      },
    });
    return { id: String(res.id) };
  },
});
