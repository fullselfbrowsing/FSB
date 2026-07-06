import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const getEvent = defineTool({
  name: 'get_event',
  displayName: 'Get Event',
  description:
    'Get detailed information about a specific event by its ID. Returns the full event resource including attendees, reminders, and conference data.',
  summary: 'Get a specific event by ID',
  icon: 'calendar-check',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    event_id: z.string().describe('Event ID to retrieve'),
  }),
  output: z.object({ event: eventSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const eventId = encodeURIComponent(params.event_id);
    const data = await api<RawEvent>(`/calendars/${calendarId}/events/${eventId}`);
    return { event: mapEvent(data) };
  },
});
