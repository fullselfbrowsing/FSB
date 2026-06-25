// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../dominos-api.js';

export const getMenu = defineTool({
  name: 'get_menu',
  displayName: 'Get Menu',
  description: 'Get the full menu (pizzas, sides, drinks, prices, and coupons) for a single Domino’s store by its store ID.',
  summary: 'look up a single dominos menu',
  icon: 'book-open',
  group: 'Stores',
  input: z.object({
    store_id: z.string().min(1).describe('The store ID whose menu to fetch'),
  }),
  output: z.object({
    menu: z.object({
      store_id: z.string(),
      items: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })),
    }).describe('The store menu'),
  }),
  handle: async (params: { store_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /stores/:id/menu (default method, read).
    const data = await api<{ menu: { store_id: string; items: { id: string; name: string; price: number }[] } }>(
      `/stores/${params.store_id}/menu`
    );
    return { menu: data.menu };
  },
});
