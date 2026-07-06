import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../facebook-api.js';
import { type RawNotificationEdge, mapNotification, notificationSchema } from './schemas.js';

interface NotificationsResponse {
  viewer?: {
    notifications_page?: {
      edges?: RawNotificationEdge[];
      page_info?: { has_next_page?: boolean; end_cursor?: string };
    };
  };
}

export const listNotifications = defineTool({
  name: 'list_notifications',
  displayName: 'List Notifications',
  description:
    'List Facebook notifications for the current user. Returns notification text, read status, timestamp, and associated actors. ' +
    'Use the cursor parameter to paginate through older notifications. ' +
    'Filter tokens: "Cg8CZnQPA2FsbAE=" for all notifications, "Cg8CZnQPBnVucmVhZAE=" for unread only.',
  summary: 'List your Facebook notifications',
  icon: 'bell',
  group: 'Notifications',
  input: z.object({
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of notifications to return (default 10, max 50)'),
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    filter: z.enum(['all', 'unread']).optional().describe('Notification filter (default "all")'),
  }),
  output: z.object({
    notifications: z.array(notificationSchema),
    has_next_page: z.boolean().describe('Whether more notifications are available'),
    end_cursor: z.string().describe('Cursor for the next page, empty if no more'),
  }),
  handle: async params => {
    const filterToken = params.filter === 'unread' ? 'Cg8CZnQPBnVucmVhZAE=' : 'Cg8CZnQPA2FsbAE=';

    const variables: Record<string, unknown> = {
      count: params.count ?? 10,
      cursor: params.cursor ?? null,
      environment: 'MAIN_SURFACE',
      filter_tokens: [filterToken],
      is_comet: true,
      include_wa_p2b_notifs: true,
      scale: 2,
    };

    const data = await graphql<NotificationsResponse>('CometNotificationsRootQuery', variables);

    const page = data.viewer?.notifications_page;
    const edges = page?.edges ?? [];

    // Filter to only notification rows (skip bucket headers, ads, etc.)
    const notifEdges = edges.filter(e => e.node?.row_type === 'NOTIFICATION');

    return {
      notifications: notifEdges.map(mapNotification),
      has_next_page: page?.page_info?.has_next_page ?? false,
      end_cursor: page?.page_info?.end_cursor ?? '',
    };
  },
});
