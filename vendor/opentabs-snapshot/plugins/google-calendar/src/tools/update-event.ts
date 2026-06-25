import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const updateEvent = defineTool({
  name: 'update_event',
  displayName: 'Update Event',
  description:
    'Update an existing event. Only the fields you provide will be changed; omitted fields remain unchanged. Uses PATCH semantics.',
  summary: 'Update an existing event',
  icon: 'calendar-cog',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    event_id: z.string().describe('Event ID to update'),
    summary: z.string().optional().describe('New event title'),
    description: z.string().optional().describe('New event description'),
    location: z.string().optional().describe('New event location'),
    start_datetime: z.string().optional().describe('New start datetime in ISO 8601 format'),
    start_date: z.string().optional().describe('New start date for all-day events in YYYY-MM-DD format'),
    end_datetime: z.string().optional().describe('New end datetime in ISO 8601 format'),
    end_date: z.string().optional().describe('New end date (exclusive) for all-day events'),
    time_zone: z.string().optional().describe('IANA time zone for the event'),
    attendees: z.array(z.string()).optional().describe('Replace all attendees with these email addresses'),
    color_id: z.string().optional().describe('Color ID (1-11) for the event'),
    visibility: z.enum(['default', 'public', 'private', 'confidential']).optional().describe('Event visibility'),
    transparency: z.enum(['opaque', 'transparent']).optional().describe('Whether the event blocks time'),
    send_updates: z
      .enum(['all', 'externalOnly', 'none'])
      .optional()
      .describe('Who to send notifications to (default "none")'),
  }),
  output: z.object({ event: eventSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const eventId = encodeURIComponent(params.event_id);

    const body: Record<string, unknown> = {};
    if (params.summary !== undefined) body.summary = params.summary;
    if (params.description !== undefined) body.description = params.description;
    if (params.location !== undefined) body.location = params.location;

    if (params.start_datetime) {
      body.start = { dateTime: params.start_datetime, timeZone: params.time_zone };
    } else if (params.start_date) {
      body.start = { date: params.start_date };
    }

    if (params.end_datetime) {
      body.end = { dateTime: params.end_datetime, timeZone: params.time_zone };
    } else if (params.end_date) {
      body.end = { date: params.end_date };
    }

    if (params.attendees) {
      body.attendees = params.attendees.map(email => ({ email }));
    }
    if (params.color_id) body.colorId = params.color_id;
    if (params.visibility) body.visibility = params.visibility;
    if (params.transparency) body.transparency = params.transparency;

    const data = await api<RawEvent>(`/calendars/${calendarId}/events/${eventId}`, {
      method: 'PATCH',
      body,
      params: { sendUpdates: params.send_updates ?? 'none' },
    });
    return { event: mapEvent(data) };
  },
});
