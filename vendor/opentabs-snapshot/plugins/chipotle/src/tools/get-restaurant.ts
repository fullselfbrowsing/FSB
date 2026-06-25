import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import {
  type RawHour,
  type RawRestaurant,
  mapHour,
  mapRestaurant,
  restaurantHoursSchema,
  restaurantSchema,
} from './schemas.js';

export const getRestaurant = defineTool({
  name: 'get_restaurant',
  displayName: 'Get Restaurant',
  description:
    'Get detailed information about a specific Chipotle restaurant including address, hours, phone number, online ordering status, and Chipotlane availability.',
  summary: 'Get restaurant details with hours and status',
  icon: 'store',
  group: 'Stores',
  input: z.object({
    restaurant_id: z.number().int().describe('Restaurant ID (from find_restaurants)'),
  }),
  output: z.object({
    restaurant: restaurantSchema.describe('Restaurant details'),
    hours: z.array(restaurantHoursSchema).describe('Weekly operating hours'),
  }),
  handle: async params => {
    const data = await api<RawRestaurant & { realHours?: RawHour[] }>(
      `/restaurant/v3/restaurant/${params.restaurant_id}`,
      {
        query: {
          embed: 'addresses,realHours,onlineOrdering,chipotlane,sustainability',
        },
      },
    );
    return {
      restaurant: mapRestaurant(data),
      hours: (data.realHours ?? []).map(mapHour),
    };
  },
});
