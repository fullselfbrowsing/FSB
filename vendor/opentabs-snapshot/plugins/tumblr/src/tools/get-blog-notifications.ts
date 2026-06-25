import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tumblr-api.js';
import { type RawNotification, notificationSchema, mapNotification } from './schemas.js';

export const getBlogNotifications = defineTool({
  name: 'get_blog_notifications',
  displayName: 'Get Blog Notifications',
  description: 'Get recent notifications for a Tumblr blog including likes, reblogs, follows, and mentions.',
  summary: 'List blog notifications',
  icon: 'bell',
  group: 'Blogs',
  input: z.object({
    blog_name: z.string().describe('Blog name or identifier (e.g., "staff" or "staff.tumblr.com")'),
    before: z.number().optional().describe('Unix timestamp for pagination — return notifications before this time'),
  }),
  output: z.object({
    notifications: z.array(notificationSchema).describe('Blog notifications'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params.before !== undefined) query.before = params.before;

    const data = await api<{ notifications: RawNotification[] }>(`/blog/${params.blog_name}/notifications`, { query });

    return {
      notifications: (data.notifications ?? []).map(mapNotification),
    };
  },
});
