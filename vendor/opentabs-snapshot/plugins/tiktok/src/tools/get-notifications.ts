import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../tiktok-api.js';
import { noticeSchema, mapNotice } from './schemas.js';
import type { RawNotice } from './schemas.js';

interface NoticeResponse {
  status_code?: number;
  notice_lists?: Array<{
    notice_list?: RawNotice[];
    has_more?: boolean;
    max_time?: number;
    min_time?: number;
    total?: number;
  }>;
}

export const getNotifications = defineTool({
  name: 'get_notifications',
  displayName: 'Get Notifications',
  description:
    'Get recent notifications for the authenticated TikTok user. Includes likes, comments, follows, and mentions. The notification group parameter controls what types of notifications to fetch.',
  summary: 'Get recent notifications',
  icon: 'bell',
  group: 'Account',
  input: z.object({
    count: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Number of notifications to return (default 20, max 50)'),
  }),
  output: z.object({
    notifications: z.array(noticeSchema).describe('Recent notifications'),
    has_more: z.boolean().describe('Whether more notifications are available'),
  }),
  handle: async params => {
    const count = params.count ?? 20;

    const groupList = JSON.stringify([
      {
        count,
        is_mark_read: 0,
        group: 500,
        max_time: 0,
        min_time: 0,
      },
    ]);

    const data = await api<NoticeResponse>('/notice/multi/', {
      group_list: groupList,
    });

    const group = data.notice_lists?.[0];
    const notifications = (group?.notice_list ?? []).map(mapNotice);

    return {
      notifications,
      has_more: group?.has_more ?? false,
    };
  },
});
