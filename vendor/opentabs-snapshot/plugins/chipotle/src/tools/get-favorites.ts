import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawRecentOrder, mapRecentOrder, recentOrderSchema } from './schemas.js';

export const getFavorites = defineTool({
  name: 'get_favorites',
  displayName: 'Get Favorites',
  description:
    "Get the user's favorited/saved meals for a specific Chipotle restaurant. Returns meal details with reorder availability.",
  summary: 'Get saved favorite meals for a restaurant',
  icon: 'heart',
  group: 'Orders',
  input: z.object({
    restaurant_id: z.number().int().describe('Restaurant ID to get favorites for'),
  }),
  output: z.object({
    favorites: z.array(recentOrderSchema).describe('Favorited meals'),
  }),
  handle: async params => {
    const data = await api<RawRecentOrder[]>('/order/v3/customer/favorite', {
      query: { restaurantId: params.restaurant_id },
    });
    return { favorites: (data ?? []).map(mapRecentOrder) };
  },
});
