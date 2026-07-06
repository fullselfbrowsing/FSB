import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';

const MUTATION = `mutation updateNotificationReadStatus($notificationIdsList: [String!]!, $action: String) {
  updateNotificationReadStatus(notificationIdsList: $notificationIdsList, action: $action)
}`;

interface MarkReadResponse {
  updateNotificationReadStatus: unknown;
}

export const markNotificationsRead = defineTool({
  name: 'mark_notifications_read',
  displayName: 'Mark Notifications Read',
  description: 'Mark one or more DoorDash notifications as read by their IDs.',
  summary: 'Mark notifications as read',
  icon: 'bell-off',
  group: 'Account',
  input: z.object({
    notification_ids: z.array(z.string()).min(1).describe('Array of notification IDs to mark as read'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the mutation completed without error'),
  }),
  handle: async params => {
    await gql<MarkReadResponse>('updateNotificationReadStatus', MUTATION, {
      notificationIdsList: params.notification_ids,
      action: 'read',
    });
    // The mutation returns {} on success — if gql() did not throw, it succeeded
    return { success: true };
  },
});
