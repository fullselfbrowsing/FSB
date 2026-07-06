import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { apiArray } from '../starbucks-api.js';
import { mapStore, storeSchema } from './schemas.js';

export const findStores = defineTool({
  name: 'find_stores',
  displayName: 'Find Stores',
  description:
    'Find Starbucks stores near a given latitude/longitude. Returns stores sorted by distance with hours, address, amenities, and mobile ordering availability. Use limit to control result count (default 10).',
  summary: 'Find nearby Starbucks stores by coordinates',
  icon: 'map-pin',
  group: 'Stores',
  input: z.object({
    lat: z.number().describe('Latitude coordinate'),
    lng: z.number().describe('Longitude coordinate'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of stores to return (default 10, max 50)'),
  }),
  output: z.object({
    stores: z.array(storeSchema).describe('Nearby Starbucks stores sorted by distance'),
  }),
  handle: async params => {
    const data = await apiArray<Record<string, unknown>>('/locations', {
      query: {
        lat: params.lat,
        lng: params.lng,
        limit: params.limit ?? 10,
      },
    });
    return {
      stores: data.map(r => mapStore(r as Parameters<typeof mapStore>[0])),
    };
  },
});
