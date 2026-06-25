// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../opentable-api.js';

export const getRestaurant = defineTool({
  name: 'get_restaurant',
  displayName: 'Get Restaurant',
  description: 'Get the details, menu, and available time slots of a single OpenTable restaurant by its ID.',
  summary: 'look up an opentable restaurant',
  icon: 'store',
  group: 'Restaurants',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The restaurant ID to fetch'),
    date: z.string().optional().describe('Reservation date (YYYY-MM-DD) for live availability'),
    party_size: z.number().int().min(1).optional().describe('Party size for live availability'),
  }),
  output: z.object({
    restaurant: z.object({
      id: z.string(),
      name: z.string(),
      slots: z.array(z.string()),
    }).describe('The restaurant detail + open time slots'),
  }),
  handle: async (params: { restaurant_id: string; date?: string; party_size?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/restaurants/:id (default method).
    const data = await api<{ restaurant: { id: string; name: string; slots: string[] } }>(
      `/v1/restaurants/${params.restaurant_id}`,
      { query: { date: params.date, party_size: params.party_size } }
    );
    return { restaurant: data.restaurant };
  },
});
