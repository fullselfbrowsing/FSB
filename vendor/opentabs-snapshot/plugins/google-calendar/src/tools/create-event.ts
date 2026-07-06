import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const createEvent = defineTool({
  name: 'create_event',
  displayName: 'Create Event',
  description:
    'Create a new calendar event. For timed events, provide start_datetime and end_datetime in ISO 8601 format with timezone offset (e.g., "2024-01-15T10:00:00-08:00"). For all-day events, provide start_date and end_date in YYYY-MM-DD format (end_date is exclusive). At least one of (start_datetime or start_date) must be provided.',
  summary: 'Create a new calendar event',
  icon: 'calendar-plus',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    summary: z.string().describe('Event title'),
    description: z.string().optional().describe('Event description'),
    location: z.string().optional().describe('Event location'),
    start_datetime: z
      .string()
      .optional()
      .describe('Start datetime in ISO 8601 format with offset (e.g., "2024-01-15T10:00:00-08:00")'),
    start_date: z.string().optional().describe('Start date for all-day events in YYYY-MM-DD format'),
    end_datetime: z.string().optional().describe('End datetime in ISO 8601 format with offset'),
    end_date: z.string().optional().describe('End date (exclusive) for all-day events in YYYY-MM-DD format'),
    time_zone: z.string().optional().describe('IANA time zone for the event (e.g., "America/Los_Angeles")'),
    attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
    recurrence: z
      .array(z.string())
      .optional()
      .describe('RRULE, EXRULE, RDATE, or EXDATE lines (e.g., ["RRULE:FREQ=WEEKLY;COUNT=5"])'),
    reminders: z
      .array(
        z.object({
          method: z.enum(['email', 'popup']).describe('Reminder method'),
          minutes: z.number().int().min(0).describe('Minutes before the event'),
        }),
      )
      .optional()
      .describe('Custom reminder overrides'),
    color_id: z.string().optional().describe('Color ID (1-11) for the event'),
    visibility: z.enum(['default', 'public', 'private', 'confidential']).optional().describe('Event visibility'),
    transparency: z
      .enum(['opaque', 'transparent'])
      .optional()
      .describe('Whether the event blocks time on the calendar'),
    send_updates: z
      .enum(['all', 'externalOnly', 'none'])
      .optional()
      .describe('Who to send notifications to (default "none")'),
  }),
  output: z.object({ event: eventSchema }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');

    const body: Record<string, unknown> = { summary: params.summary };
    if (params.description) body.description = params.description;
    if (params.location) body.location = params.location;

    if (params.start_datetime) {
      body.start = { dateTime: params.start_datetime, timeZone: params.time_zone };
      body.end = { dateTime: params.end_datetime ?? params.start_datetime, timeZone: params.time_zone };
    } else if (params.start_date) {
      body.start = { date: params.start_date };
      body.end = { date: params.end_date ?? params.start_date };
    }

    if (params.attendees) {
      body.attendees = params.attendees.map(email => ({ email }));
    }
    if (params.recurrence) body.recurrence = params.recurrence;
    if (params.reminders) {
      body.reminders = { useDefault: false, overrides: params.reminders };
    }
    if (params.color_id) body.colorId = params.color_id;
    if (params.visibility) body.visibility = params.visibility;
    if (params.transparency) body.transparency = params.transparency;

    const data = await api<RawEvent>(`/calendars/${calendarId}/events`, {
      method: 'POST',
      body,
      params: { sendUpdates: params.send_updates ?? 'none' },
    });
    return { event: mapEvent(data) };
  },
});
