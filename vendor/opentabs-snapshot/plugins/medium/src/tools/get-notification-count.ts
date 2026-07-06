import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../medium-api.js';

interface NotificationCountData {
  notificationStatus: {
    unreadNotificationCount: number;
  };
}

export const getNotificationCount = defineTool({
  name: 'get_notification_count',
  displayName: 'Get Notification Count',
  description: 'Get the number of unread notifications for the current Medium user.',
  summary: 'Get unread notification count',
  icon: 'bell',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    unread_count: z.number().describe('Number of unread notifications'),
  }),
  handle: async () => {
    const data = await gql<NotificationCountData>(
      'UnreadNotificationCount',
      `query UnreadNotificationCount {
        notificationStatus {
          unreadNotificationCount
        }
      }`,
    );
    return {
      unread_count: data.notificationStatus?.unreadNotificationCount ?? 0,
    };
  },
});
