import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

export const getLastRestaurant = defineTool({
  name: 'get_last_restaurant',
  displayName: 'Get Last Restaurant',
  description:
    'Get the last Chipotle restaurant the user ordered from. Returns the restaurant ID which can be used with get_restaurant for full details.',
  summary: 'Get the last restaurant ordered from',
  icon: 'history',
  group: 'Orders',
  input: z.object({}),
  output: z.object({
    restaurant_id: z.number().describe('Last ordered restaurant ID'),
  }),
  handle: async () => {
    const data = await api<{ restaurantNumber?: number }>('/order/v3/customer/recent/last/restaurant');
    return { restaurant_id: data.restaurantNumber ?? 0 };
  },
});
