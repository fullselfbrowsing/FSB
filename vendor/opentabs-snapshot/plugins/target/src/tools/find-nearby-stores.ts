import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { redskyApi } from '../target-api.js';
import { storeSchema, mapStore } from './schemas.js';
import type { RawStore } from './schemas.js';

interface NearbyStoresResponse {
  data?: {
    nearby_stores?: {
      count?: number;
      stores?: RawStore[];
    };
  };
}

export const findNearbyStores = defineTool({
  name: 'find_nearby_stores',
  displayName: 'Find Nearby Stores',
  description:
    'Find Target stores near a ZIP code or city name. Returns store name, address, phone number, and distance. Default radius is 50 miles.',
  summary: 'Find Target stores near a location',
  icon: 'map-pin',
  group: 'Stores',
  input: z.object({
    place: z.string().describe('ZIP code or city name (e.g., "95133", "San Jose")'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe('Maximum number of stores to return (default 10, max 25)'),
    radius: z.number().min(1).max(100).optional().describe('Search radius in miles (default 50)'),
  }),
  output: z.object({
    stores: z.array(storeSchema),
    total: z.number().int().describe('Total number of stores found'),
  }),
  handle: async params => {
    const data = await redskyApi<NearbyStoresResponse>('redsky_aggregations/v1/web/nearby_stores_v1', {
      place: params.place,
      limit: params.limit ?? 10,
      within: params.radius ?? 50,
      unit: 'mile',
    });
    const stores = data.data?.nearby_stores?.stores ?? [];
    return {
      stores: stores.map(mapStore),
      total: data.data?.nearby_stores?.count ?? stores.length,
    };
  },
});
