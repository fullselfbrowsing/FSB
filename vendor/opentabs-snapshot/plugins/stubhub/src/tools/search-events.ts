// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../stubhub-api.js';

export const searchEvents = defineTool({
  name: 'search_events',
  displayName: 'Search Events',
  description:
    'Search StubHub for concerts, sports, and theater events with resale tickets by keyword, city, and date range. Returns matching events with the lowest available ticket prices.',
  summary: 'search events on stubhub',
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
    })).describe('Matching events with resale listings'),
  }),
  handle: async (params: { keyword: string; city?: string; start_date?: string; end_date?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /search/catalog/events (default method).
    const data = await api<{ events: unknown[] }>('/search/catalog/events', {
      query: {
        q: params.keyword,
        city: params.city,
        dateStart: params.start_date,
        dateEnd: params.end_date,
      },
    });
    return { events: data.events as { id: string; name: string }[] };
  },
});
