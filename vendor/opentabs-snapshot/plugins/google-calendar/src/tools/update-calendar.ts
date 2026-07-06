import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawCalendar } from './schemas.js';
import { calendarSchema, mapCalendar } from './schemas.js';

export const updateCalendar = defineTool({
  name: 'update_calendar',
  displayName: 'Update Calendar',
  description: 'Update metadata for a calendar. Only the fields you provide will be changed. Uses PATCH semantics.',
  summary: 'Update calendar metadata',
  icon: 'settings',
  group: 'Calendars',
  input: z.object({
    calendar_id: z.string().describe('Calendar ID to update'),
    summary: z.string().optional().describe('New calendar title'),
    description: z.string().optional().describe('New calendar description'),
    location: z.string().optional().describe('New geographic location'),
    time_zone: z.string().optional().describe('New IANA time zone'),
  }),
  output: z.object({ calendar: calendarSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id);
    const body: Record<string, unknown> = {};
    if (params.summary !== undefined) body.summary = params.summary;
    if (params.description !== undefined) body.description = params.description;
    if (params.location !== undefined) body.location = params.location;
    if (params.time_zone !== undefined) body.timeZone = params.time_zone;

    const data = await api<RawCalendar>(`/calendars/${calendarId}`, { method: 'PATCH', body });
    return { calendar: mapCalendar(data) };
  },
});
