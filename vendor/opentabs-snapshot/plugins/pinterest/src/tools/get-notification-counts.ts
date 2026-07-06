import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { resourceGet } from '../pinterest-api.js';

interface RawBadge {
  news_hub_count?: number;
  conversations_unseen_count?: number;
}

export const getNotificationCounts = defineTool({
  name: 'get_notification_counts',
  displayName: 'Get Notification Counts',
  description: 'Get unread notification and unseen message counts for the authenticated user.',
  summary: 'Get notification badge counts',
  icon: 'bell',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    news_hub_count: z.number().describe('Unread notification count'),
    conversations_unseen_count: z.number().describe('Unseen message/conversation count'),
  }),
  handle: async () => {
    const resp = await resourceGet<RawBadge>('NewsHubBadgeResource', {});

    const data = resp.resource_response.data;
    return {
      news_hub_count: data?.news_hub_count ?? 0,
      conversations_unseen_count: data?.conversations_unseen_count ?? 0,
    };
  },
});
