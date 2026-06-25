import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawCalendarListEntry } from './schemas.js';
import { calendarListEntrySchema, mapCalendarListEntry } from './schemas.js';

export const listCalendars = defineTool({
  name: 'list_calendars',
  displayName: 'List Calendars',
  description:
    "List all calendars on the user's calendar list. Returns primary and secondary calendars, subscribed calendars, and holiday calendars with their display settings.",
  summary: 'List all calendars the user has access to',
  icon: 'layout-list',
  group: 'Calendars',
  input: z.object({
    show_hidden: z.boolean().optional().describe('Whether to include hidden calendars (default false)'),
    show_deleted: z.boolean().optional().describe('Whether to include deleted calendars (default false)'),
  }),
  output: z.object({
    calendars: z.array(calendarListEntrySchema).describe('List of calendars'),
  }),
  handle: async params => {
    const data = await api<{ items?: RawCalendarListEntry[] }>('/users/me/calendarList', {
      params: {
        showHidden: params.show_hidden,
        showDeleted: params.show_deleted,
      },
    });
    return { calendars: (data.items ?? []).map(mapCalendarListEntry) };
  },
});
