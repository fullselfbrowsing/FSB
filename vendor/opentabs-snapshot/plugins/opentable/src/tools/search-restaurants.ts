// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../opentable-api.js';

export const searchRestaurants = defineTool({
  name: 'search_restaurants',
  displayName: 'Search Restaurants',
  description:
    'Search OpenTable for restaurants with availability in a location for a date, time, and party size. Returns matching restaurants with open time slots.',
  summary: 'search restaurants on opentable',
  icon: 'utensils',
  group: 'Restaurants',
  input: z.object({
    location: z.string().min(1).describe('City, neighborhood, or restaurant name to search'),
    date: z.string().optional().describe('Reservation date (YYYY-MM-DD)'),
    time: z.string().optional().describe('Desired time (HH:MM, 24h)'),
    party_size: z.number().int().min(1).optional().describe('Number of diners'),
  }),
  output: z.object({
    restaurants: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Matching restaurants with availability'),
  }),
  handle: async (params: { location: string; date?: string; time?: string; party_size?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/restaurants/search (default method).
    const data = await api<{ restaurants: unknown[] }>('/v1/restaurants/search', {
      query: {
        location: params.location,
        date: params.date,
        time: params.time,
        party_size: params.party_size,
      },
    });
    return { restaurants: data.restaurants as { id: string; name: string }[] };
  },
});
