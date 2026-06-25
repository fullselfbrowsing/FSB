// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../doordash-api.js';

export const listRestaurants = defineTool({
  name: 'list_restaurants',
  displayName: 'List Restaurants',
  description:
    'List or search DoorDash restaurants available for delivery to an address. Optionally filter by a search term (cuisine or restaurant name).',
  summary: 'show me restaurants on doordash',
  icon: 'utensils',
  group: 'Restaurants',
  input: z.object({
    address: z.string().optional().describe('Delivery address to find restaurants for'),
    query: z.string().optional().describe('Search term (cuisine, dish, or restaurant name)'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of restaurants to return'),
  }),
  output: z.object({
    restaurants: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Matching restaurants'),
  }),
  handle: async (params: { address?: string; query?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/restaurants (default method).
    const data = await api<{ restaurants: unknown[] }>('/v1/restaurants', {
      query: { address: params.address, query: params.query, limit: params.limit },
    });
    return { restaurants: data.restaurants as { id: string; name: string }[] };
  },
});
