import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const unlikePost = defineTool({
  name: 'unlike_post',
  displayName: 'Unlike Post',
  description: 'Remove a like from a Tumblr post. Requires the post ID and reblog key.',
  summary: 'Unlike a post',
  icon: 'heart-off',
  group: 'Posts',
  input: z.object({
    post_id: z.string().describe('Post ID'),
    reblog_key: z.string().describe('Reblog key for the post (from post data)'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    await api('/user/unlike', { method: 'POST', body: { id: params.post_id, reblog_key: params.reblog_key } });
    return { success: true };
  },
});
