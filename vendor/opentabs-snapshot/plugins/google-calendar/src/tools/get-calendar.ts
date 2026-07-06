import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawCalendar } from './schemas.js';
import { calendarSchema, mapCalendar } from './schemas.js';

export const getCalendar = defineTool({
  name: 'get_calendar',
  displayName: 'Get Calendar',
  description:
    'Get metadata for a specific calendar by its ID. Returns the calendar title, description, location, and time zone.',
  summary: 'Get calendar metadata by ID',
  icon: 'calendar-search',
  group: 'Calendars',
  input: z.object({
    calendar_id: z.string().describe('Calendar ID to retrieve (use "primary" for the user\'s primary calendar)'),
  }),
  output: z.object({ calendar: calendarSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id);
    const data = await api<RawCalendar>(`/calendars/${calendarId}`);
    return { calendar: mapCalendar(data) };
  },
});
