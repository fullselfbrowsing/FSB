import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bluesky-api.js';
import { mapNotification, notificationSchema } from './schemas.js';

export const listNotifications = defineTool({
  name: 'list_notifications',
  displayName: 'List Notifications',
  description:
    "List the authenticated user's notifications including likes, reposts, follows, mentions, replies, and quotes. Supports cursor-based pagination.",
  summary: 'List notifications',
  icon: 'bell',
  group: 'Notifications',
  input: z.object({
    cursor: z.string().optional().describe('Pagination cursor from a previous response'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Maximum number of notifications to return (default 25, max 100)'),
  }),
  output: z.object({
    notifications: z.array(notificationSchema).describe('Array of notifications'),
    cursor: z.string().describe('Pagination cursor for the next page'),
  }),
  handle: async params => {
    const data = await api<{
      notifications?: Record<string, unknown>[];
      cursor?: string;
    }>('app.bsky.notification.listNotifications', {
      query: { cursor: params.cursor, limit: params.limit ?? 25 },
    });
    return {
      notifications: (data.notifications ?? []).map(mapNotification),
      cursor: data.cursor ?? '',
    };
  },
});
