// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ubereats-api.js';

export const getMenu = defineTool({
  name: 'get_menu',
  displayName: 'Get Menu',
  description: 'Get the full menu of a single Uber Eats restaurant by its ID.',
  summary: 'look up an ubereats restaurant menu',
  icon: 'book-open',
  group: 'Restaurants',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The restaurant ID to fetch the menu for'),
  }),
  output: z.object({
    menu: z.array(z.object({
      item_id: z.string(),
      name: z.string(),
      price: z.number(),
    })).describe('The restaurant menu items'),
  }),
  handle: async (params: { restaurant_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /eats/v1/restaurants/:id/menu (default method).
    const data = await api<{ menu: unknown[] }>(`/eats/v1/restaurants/${params.restaurant_id}/menu`);
    return { menu: data.menu as { item_id: string; name: string; price: number }[] };
  },
});
