// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../eventbrite-api.js';

export const searchEvents = defineTool({
  name: 'search_events',
  displayName: 'Search Events',
  description:
    'Search Eventbrite for events, workshops, classes, and conferences by keyword, city, and date range. Returns matching events with organizers and ticket types.',
  summary: 'search events on eventbrite',
  icon: 'ticket',
  group: 'Events',
  input: z.object({
    keyword: z.string().min(1).describe('Event, organizer, or topic to search for'),
    city: z.string().optional().describe('City to filter events by'),
    start_date: z.string().optional().describe('Earliest event date (YYYY-MM-DD)'),
    end_date: z.string().optional().describe('Latest event date (YYYY-MM-DD)'),
  }),
  output: z.object({
    events: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Matching events'),
  }),
  handle: async (params: { keyword: string; city?: string; start_date?: string; end_date?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v3/events/search (default method).
    const data = await api<{ events: unknown[] }>('/v3/events/search', {
      query: {
        q: params.keyword,
        'location.address': params.city,
        'start_date.range_start': params.start_date,
        'start_date.range_end': params.end_date,
      },
    });
    return { events: data.events as { id: string; name: string }[] };
  },
});
