// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../tripadvisor-api.js';

export const searchLocations = defineTool({
  name: 'search_locations',
  displayName: 'Search Locations',
  description:
    'Search Tripadvisor for hotels, restaurants, and attractions by query and place. Returns matching locations with ratings and review counts.',
  summary: 'search locations on tripadvisor',
  icon: 'map-pin',
  group: 'Locations',
  input: z.object({
    query: z.string().min(1).describe('What to search for (e.g. hotels, museums, a restaurant name)'),
    place: z.string().min(1).describe('City or area to search in'),
    category: z.enum(['hotels', 'restaurants', 'attractions']).optional().describe('Filter by location category'),
  }),
  output: z.object({
    locations: z.array(z.object({
      id: z.string(),
      name: z.string(),
      rating: z.number(),
    })).describe('Matching travel locations'),
  }),
  handle: async (params: { query: string; place: string; category?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /location/search (default method, a READ).
    const data = await api<{ locations: unknown[] }>('/location/search', {
      query: {
        searchQuery: params.query,
        place: params.place,
        category: params.category,
      },
    });
    return { locations: data.locations as { id: string; name: string; rating: number }[] };
  },
});
