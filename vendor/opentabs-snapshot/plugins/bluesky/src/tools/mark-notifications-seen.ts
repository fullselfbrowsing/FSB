import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';

export const markNotificationsSeen = defineTool({
  name: 'mark_notifications_seen',
  displayName: 'Mark Notifications Seen',
  description: 'Mark all notifications as seen up to the current timestamp.',
  summary: 'Mark notifications as seen',
  icon: 'check-circle',
  group: 'Notifications',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async () => {
    await api('app.bsky.notification.updateSeen', {
      method: 'POST',
      body: { seenAt: new Date().toISOString() },
    });
    return { success: true };
  },
});
