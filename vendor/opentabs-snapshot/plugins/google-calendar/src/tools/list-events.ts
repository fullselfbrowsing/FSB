import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const listEvents = defineTool({
  name: 'list_events',
  displayName: 'List Events',
  description:
    'List events on a calendar. Returns upcoming events by default. Use timeMin/timeMax to specify a date range. Use q to search event text. Results are ordered by start time when singleEvents is true.',
  summary: 'List events on a calendar',
  icon: 'calendar',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    time_min: z.string().optional().describe('Lower bound (inclusive) for event start time as ISO 8601 timestamp'),
    time_max: z.string().optional().describe('Upper bound (exclusive) for event start time as ISO 8601 timestamp'),
    q: z
      .string()
      .optional()
      .describe(
        'Free text search terms to find events matching these terms in summary, description, location, attendee name, etc.',
      ),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(2500)
      .optional()
      .describe('Maximum number of events to return (default 25, max 2500)'),
    page_token: z.string().optional().describe('Token for fetching the next page of results'),
    single_events: z.boolean().optional().describe('Whether to expand recurring events into instances (default true)'),
    order_by: z
      .enum(['startTime', 'updated'])
      .optional()
      .describe('Sort order: startTime (requires singleEvents=true) or updated (default startTime)'),
    show_deleted: z.boolean().optional().describe('Whether to include deleted events (default false)'),
  }),
  output: z.object({
    events: z.array(eventSchema).describe('List of events'),
    next_page_token: z.string().describe('Token for the next page, empty if no more results'),
  }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const singleEvents = params.single_events ?? true;
    const data = await api<{ items?: RawEvent[]; nextPageToken?: string }>(`/calendars/${calendarId}/events`, {
      params: {
        timeMin: params.time_min,
        timeMax: params.time_max,
        q: params.q,
        maxResults: params.max_results ?? 25,
        pageToken: params.page_token,
        singleEvents,
        orderBy: params.order_by ?? (singleEvents ? 'startTime' : undefined),
        showDeleted: params.show_deleted,
      },
    });
    return {
      events: (data.items ?? []).map(mapEvent),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
