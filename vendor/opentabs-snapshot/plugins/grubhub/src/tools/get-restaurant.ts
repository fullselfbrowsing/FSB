// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../grubhub-api.js';

export const getRestaurant = defineTool({
  name: 'get_restaurant',
  displayName: 'Get Restaurant',
  description: 'Get the details and menu of a single Grubhub restaurant by its ID.',
  summary: 'look up a grubhub restaurant menu',
  icon: 'store',
  group: 'Restaurants',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The restaurant ID to fetch'),
  }),
  output: z.object({
    restaurant: z.object({
      id: z.string(),
      name: z.string(),
      menu: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })),
    }).describe('The restaurant detail + menu'),
  }),
  handle: async (params: { restaurant_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/restaurants/:id (default method).
    const data = await api<{ restaurant: { id: string; name: string; menu: unknown[] } }>(
      `/v1/restaurants/${params.restaurant_id}`
    );
    return { restaurant: data.restaurant as { id: string; name: string; menu: { id: string; name: string; price: number }[] } };
  },
});
