// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

export const getMenu = defineTool({
  name: 'get_menu',
  displayName: 'Get Menu',
  description: 'Get the full menu (entrees, sides, drinks, and prices) for a single Chipotle location by its restaurant ID.',
  summary: 'look up a single chipotle menu',
  icon: 'book-open',
  group: 'Locations',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The restaurant ID whose menu to fetch'),
  }),
  output: z.object({
    menu: z.object({
      restaurant_id: z.string(),
      items: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })),
    }).describe('The location menu'),
  }),
  handle: async (params: { restaurant_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /restaurants/:id/menu (default method, read).
    const data = await api<{ menu: { restaurant_id: string; items: { id: string; name: string; price: number }[] } }>(
      `/restaurants/${params.restaurant_id}/menu`
    );
    return { menu: data.menu };
  },
});
