import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiPost } from '../chipotle-api.js';
import { type RawRestaurant, mapRestaurant, restaurantSchema } from './schemas.js';

export const findRestaurants = defineTool({
  name: 'find_restaurants',
  displayName: 'Find Restaurants',
  description:
    'Search for nearby Chipotle restaurants by geographic coordinates. Returns restaurants sorted by distance with address, phone, online ordering availability, and Chipotlane status.',
  summary: 'Find nearby Chipotle locations by coordinates',
  icon: 'map-pin',
  group: 'Stores',
  input: z.object({
    latitude: z.number().describe('Latitude coordinate of the search center'),
    longitude: z.number().describe('Longitude coordinate of the search center'),
    radius: z.number().optional().describe('Search radius in meters (default 8045, ~5 miles)'),
    page_size: z.number().int().optional().describe('Number of results per page (default 10)'),
    page_index: z.number().int().optional().describe('Page index for pagination (default 0)'),
  }),
  output: z.object({
    restaurants: z.array(restaurantSchema).describe('Nearby Chipotle restaurants sorted by distance'),
  }),
  handle: async params => {
    const data = await apiPost<{ data?: RawRestaurant[] }>('/restaurant/v3/restaurant', {
      latitude: params.latitude,
      longitude: params.longitude,
      radius: params.radius ?? 8045,
      restaurantStatuses: ['OPEN', 'LAB'],
      orderBy: 'distance',
      orderByDescending: false,
      pageSize: params.page_size ?? 10,
      pageIndex: params.page_index ?? 0,
    });
    return { restaurants: (data.data ?? []).map(mapRestaurant) };
  },
});
