import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';

export const followBlog = defineTool({
  name: 'follow_blog',
  displayName: 'Follow Blog',
  description: 'Follow a Tumblr blog by URL.',
  summary: 'Follow a blog',
  icon: 'user-plus',
  group: 'Account',
  input: z.object({
    url: z.string().describe('Blog URL to follow (e.g., "staff.tumblr.com" or "https://staff.tumblr.com")'),
  }),
  output: z.object({ success: z.boolean().describe('Whether the operation succeeded') }),
  handle: async params => {
    const url = params.url.startsWith('http') ? params.url : `https://${params.url}`;
    await api('/user/follow', { method: 'POST', body: { url } });
    return { success: true };
  },
});
