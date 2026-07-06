import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { notificationStatusSchema, mapNotificationStatus } from './schemas.js';

const QUERY = `query getHasNewNotifications {
  getHasNewNotifications {
    hasNewNotifications
    numUnreadNotifications
  }
}`;

interface NotificationsResponse {
  getHasNewNotifications: Record<string, unknown>;
}

export const getNotifications = defineTool({
  name: 'get_notifications',
  displayName: 'Get Notifications',
  description: 'Check whether the user has new or unread notifications on DoorDash.',
  summary: 'Check for new notifications',
  icon: 'bell',
  group: 'Account',
  input: z.object({}),
  output: z.object({ status: notificationStatusSchema }),
  handle: async () => {
    const data = await gql<NotificationsResponse>('getHasNewNotifications', QUERY);
    return { status: mapNotificationStatus(data.getHasNewNotifications) };
  },
});
