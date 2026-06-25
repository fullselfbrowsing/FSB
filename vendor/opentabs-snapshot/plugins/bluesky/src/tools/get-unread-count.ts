import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const getUnreadCount = defineTool({
  name: 'get_unread_count',
  displayName: 'Get Unread Count',
  description: 'Get the count of unread notifications.',
  summary: 'Get unread notification count',
  icon: 'hash',
  group: 'Notifications',
  input: z.object({}),
  output: z.object({
    count: z.number().describe('Number of unread notifications'),
  }),
  handle: async () => {
    const data = await api<{ count?: number }>('app.bsky.notification.getUnreadCount');
    return { count: data.count ?? 0 };
  },
});
