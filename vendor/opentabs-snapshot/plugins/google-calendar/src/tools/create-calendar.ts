import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawCalendar } from './schemas.js';
import { calendarSchema, mapCalendar } from './schemas.js';

export const createCalendar = defineTool({
  name: 'create_calendar',
  displayName: 'Create Calendar',
  description: 'Create a new secondary calendar. The authenticated user becomes the owner of the new calendar.',
  summary: 'Create a new secondary calendar',
  icon: 'calendar-plus-2',
  group: 'Calendars',
  input: z.object({
    summary: z.string().describe('Calendar title'),
    description: z.string().optional().describe('Calendar description'),
    location: z.string().optional().describe('Geographic location'),
    time_zone: z.string().optional().describe('IANA time zone (e.g., "America/Los_Angeles")'),
  }),
  output: z.object({ calendar: calendarSchema }),
  handle: async params => {
    const body: Record<string, unknown> = { summary: params.summary };
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;
    if (params.time_zone) body.timeZone = params.time_zone;

    const data = await api<RawCalendar>('/calendars', { method: 'POST', body });
    return { calendar: mapCalendar(data) };
  },
});
