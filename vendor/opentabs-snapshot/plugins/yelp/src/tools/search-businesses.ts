// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../yelp-api.js';

export const searchBusinesses = defineTool({
  name: 'search_businesses',
  displayName: 'Search Businesses',
  description:
    'Search Yelp for local businesses (restaurants, shops, services) by term and location. Returns matching businesses with ratings, price level, and categories.',
  summary: 'search businesses on yelp',
  icon: 'magnifying-glass',
  group: 'Businesses',
  input: z.object({
    term: z.string().min(1).describe('What to search for (e.g. coffee, plumber, sushi)'),
    location: z.string().min(1).describe('City, neighborhood, or address to search near'),
    price: z.enum(['1', '2', '3', '4']).optional().describe('Price level filter (1=$ to 4=$$$$)'),
    open_now: z.boolean().optional().describe('Only return businesses open now'),
  }),
  output: z.object({
    businesses: z.array(z.object({
      id: z.string(),
      name: z.string(),
      rating: z.number(),
    })).describe('Matching local businesses'),
  }),
  handle: async (params: { term: string; location: string; price?: string; open_now?: boolean }) => {
    // NEVER executed by the importer. Upstream: api GET /v3/businesses/search (default method, a READ).
    const data = await api<{ businesses: unknown[] }>('/v3/businesses/search', {
      query: {
        term: params.term,
        location: params.location,
        price: params.price,
        open_now: params.open_now,
      },
    });
    return { businesses: data.businesses as { id: string; name: string; rating: number }[] };
  },
});
