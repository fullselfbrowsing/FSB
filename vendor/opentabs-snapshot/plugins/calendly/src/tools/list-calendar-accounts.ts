import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../calendly-api.js';
import { calendarAccountSchema, mapCalendarAccount } from './schemas.js';

export const listCalendarAccounts = defineTool({
  name: 'list_calendar_accounts',
  displayName: 'List Calendar Accounts',
  description:
    'List all connected calendar accounts (Google Calendar, Outlook, etc.) with their conflict checking and push settings.',
  summary: 'List connected calendar accounts',
  icon: 'calendar-range',
  group: 'Calendars',
  input: z.object({}),
  output: z.object({
    accounts: z.array(calendarAccountSchema).describe('List of connected calendar accounts'),
  }),
  handle: async () => {
    const data = await api<Record<string, unknown>[]>('/calendar_accounts');
    return { accounts: (data ?? []).map(mapCalendarAccount) };
  },
});
