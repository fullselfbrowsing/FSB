import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../youtube-api.js';
import { type NotificationResponse, mapNotification, notificationSchema } from './schemas.js';

export const getNotifications = defineTool({
  name: 'get_notifications',
  displayName: 'Get Notifications',
  description:
    'Get the YouTube notification inbox. Returns recent notifications including video uploads, live streams, and community posts from subscribed channels.',
  summary: 'Get notification inbox',
  icon: 'bell',
  group: 'Notifications',
  input: z.object({}),
  output: z.object({
    notifications: z.array(notificationSchema).describe('List of notifications'),
  }),
  handle: async () => {
    const data = await api<NotificationResponse>('notification/get_notification_menu', {
      notificationsMenuRequestType: 'NOTIFICATIONS_MENU_REQUEST_TYPE_INBOX',
    });

    const popup = data.actions?.[0]?.openPopupAction?.popup;
    const sections = popup?.multiPageMenuRenderer?.sections;
    const notifSection = sections?.[0]?.multiPageMenuNotificationSectionRenderer;
    const items = notifSection?.items;

    const notifications = (items ?? []).flatMap(item => (item.notificationRenderer ? [item.notificationRenderer] : []));

    return { notifications: notifications.map(mapNotification) };
  },
});
