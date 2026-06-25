import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const likePost = defineTool({
  name: 'like_post',
  displayName: 'Like Post',
  description: 'Like a Tumblr post. Requires the post ID and reblog key.',
  summary: 'Like a post',
  icon: 'heart',
  group: 'Posts',
  input: z.object({
    post_id: z.string().describe('Post ID'),
    reblog_key: z.string().describe('Reblog key for the post (from post data)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api('/user/like', { method: 'POST', body: { id: params.post_id, reblog_key: params.reblog_key } });
    return { success: true };
  },
});
