import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../google-calendar-api.js';
import type { RawEvent, RawCalendarListEntry } from './schemas.js';
import { eventSchema, mapEvent } from './schemas.js';

export const searchEvents = defineTool({
  name: 'search_events',
  displayName: 'Search Events',
  description:
    'Search for events across all writable calendars by text query. Searches event summary, description, location, and attendee names. Returns matching events from all calendars the user has write access to.',
  summary: 'Search events across all calendars',
  icon: 'search',
  group: 'Events',
  input: z.object({
    q: z.string().describe('Search query to match against event text'),
    time_min: z.string().optional().describe('Lower bound (inclusive) as ISO 8601 timestamp'),
    time_max: z.string().optional().describe('Upper bound (exclusive) as ISO 8601 timestamp'),
    max_results_per_calendar: z
      .number()
      .int()
      .min(1)
      .max(250)
      .optional()
      .describe('Maximum results per calendar (default 10)'),
  }),
  output: z.object({
    events: z.array(eventSchema).describe('Matching events across all calendars'),
  }),
  handle: async params => {
    // First get all writable calendars
    const calList = await api<{ items?: RawCalendarListEntry[] }>('/users/me/calendarList');
    const writableCalendars = (calList.items ?? []).filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');

    const maxPerCal = params.max_results_per_calendar ?? 10;
    const allEvents: ReturnType<typeof mapEvent>[] = [];

    // Search each calendar
    for (const cal of writableCalendars) {
      if (!cal.id) continue;
      try {
        const data = await api<{ items?: RawEvent[] }>(`/calendars/${encodeURIComponent(cal.id)}/events`, {
          params: {
            q: params.q,
            timeMin: params.time_min,
            timeMax: params.time_max,
            maxResults: maxPerCal,
            singleEvents: true,
            orderBy: 'startTime',
          },
        });
        for (const item of data.items ?? []) {
          allEvents.push(mapEvent(item));
        }
      } catch {
        // Skip calendars that error (e.g., permission issues)
      }
    }

    return { events: allEvents };
  },
});
