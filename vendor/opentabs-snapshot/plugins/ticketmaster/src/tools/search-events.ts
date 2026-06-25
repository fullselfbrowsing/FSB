// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ticketmaster-api.js';

export const searchEvents = defineTool({
  name: 'search_events',
  displayName: 'Search Events',
  description:
    'Search Ticketmaster for concerts, sports, theater, and other live events by keyword, city, and date range. Returns matching events with venues and on-sale dates.',
  summary: 'search events on ticketmaster',
  icon: 'ticket',
  group: 'Events',
  input: z.object({
    keyword: z.string().min(1).describe('Artist, team, event, or venue to search for'),
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
    // NEVER executed by the importer. Upstream: api GET /discovery/v2/events (default method).
    const data = await api<{ events: unknown[] }>('/discovery/v2/events', {
      query: {
        keyword: params.keyword,
        city: params.city,
        startDateTime: params.start_date,
        endDateTime: params.end_date,
      },
    });
    return { events: data.events as { id: string; name: string }[] };
  },
});
