import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawMenuItem, mapMenuItem, menuItemSchema } from './schemas.js';

interface MenuResponse {
  restaurantId?: number;
  entrees?: RawMenuItem[];
}

export const getMenu = defineTool({
  name: 'get_menu',
  displayName: 'Get Menu',
  description:
    'Get the full online menu for a specific Chipotle restaurant. Returns all entrees with item name, price, calorie range, availability, and thumbnail image.',
  summary: 'Get restaurant menu with prices and calories',
  icon: 'utensils',
  group: 'Menu',
  input: z.object({
    restaurant_id: z.number().int().describe('Restaurant ID (from find_restaurants)'),
  }),
  output: z.object({
    restaurant_id: z.number().describe('Restaurant the menu belongs to'),
    items: z.array(menuItemSchema).describe('Menu entrees'),
  }),
  handle: async params => {
    const data = await api<MenuResponse>(`/menuinnovation/v1/restaurants/${params.restaurant_id}/onlinemenu`, {
      query: {
        channelId: 'web',
        includeUnavailableItems: true,
      },
    });

    return {
      restaurant_id: data.restaurantId ?? params.restaurant_id,
      items: (data.entrees ?? []).map(mapMenuItem),
    };
  },
});
