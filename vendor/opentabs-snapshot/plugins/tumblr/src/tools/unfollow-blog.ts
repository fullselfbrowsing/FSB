import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const unfollowBlog = defineTool({
  name: 'unfollow_blog',
  displayName: 'Unfollow Blog',
  description: 'Unfollow a Tumblr blog by URL.',
  summary: 'Unfollow a blog',
  icon: 'user-minus',
  group: 'Account',
  input: z.object({
    url: z.string().describe('Blog URL to unfollow (e.g., "staff.tumblr.com" or "https://staff.tumblr.com")'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    const url = params.url.startsWith('http') ? params.url : `https://${params.url}`;
    await api('/user/unfollow', { method: 'POST', body: { url } });
    return { success: true };
  },
});
