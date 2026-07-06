import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const listEventInstances = defineTool({
  name: 'list_event_instances',
  displayName: 'List Event Instances',
  description:
    'List individual instances of a recurring event. Use timeMin/timeMax to scope the range of instances returned.',
  summary: 'List instances of a recurring event',
  icon: 'repeat',
  group: 'Events',
  input: z.object({
    calendar_id: z.string().optional().describe('Calendar ID (default "primary")'),
    event_id: z.string().describe('Recurring event ID'),
    time_min: z.string().optional().describe('Lower bound (inclusive) as ISO 8601 timestamp'),
    time_max: z.string().optional().describe('Upper bound (exclusive) as ISO 8601 timestamp'),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(2500)
      .optional()
      .describe('Maximum number of instances to return (default 25)'),
    page_token: z.string().optional().describe('Token for fetching the next page'),
  }),
  output: z.object({
    events: z.array(eventSchema).describe('List of event instances'),
    next_page_token: z.string().describe('Token for the next page, empty if no more results'),
  }),
  handle: async params => {
    const calendarId = encodeURIComponent(params.calendar_id ?? 'primary');
    const eventId = encodeURIComponent(params.event_id);
    const data = await api<{ items?: RawEvent[]; nextPageToken?: string }>(
      `/calendars/${calendarId}/events/${eventId}/instances`,
      {
        params: {
          timeMin: params.time_min,
          timeMax: params.time_max,
          maxResults: params.max_results ?? 25,
          pageToken: params.page_token,
        },
      },
    );
    return {
      events: (data.items ?? []).map(mapEvent),
      next_page_token: data.nextPageToken ?? '',
    };
  },
});
