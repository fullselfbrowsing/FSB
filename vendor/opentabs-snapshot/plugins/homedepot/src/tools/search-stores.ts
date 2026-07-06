import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../homedepot-api.js';
import { storeSchema, mapStore } from './schemas.js';
import type { RawStore } from './schemas.js';

const QUERY = `query storeSearch($zipCode: String!, $radius: Float!) {
  storeSearch(zipCode: $zipCode, radius: $radius) {
    storeId storeName phone
    address { street city state postalCode }
    storeHours { monday { open close } tuesday { open close } wednesday { open close } thursday { open close } friday { open close } saturday { open close } sunday { open close } }
  }
}`;

export const searchStores = defineTool({
  name: 'search_stores',
  displayName: 'Find Stores',
  description:
    'Find Home Depot stores near a ZIP code. Returns store name, address, phone number, and operating hours.',
  summary: 'Find stores near a ZIP code',
  icon: 'map-pin',
  group: 'Stores',
  input: z.object({
    zip_code: z.string().describe('ZIP code to search near (e.g., "90210")'),
    radius: z.number().optional().describe('Search radius in miles (default 25)'),
  }),
  output: z.object({
    stores: z.array(storeSchema).describe('Matching stores sorted by distance'),
  }),
  handle: async params => {
    const data = await gql<{ storeSearch: RawStore[] }>('storeSearch', QUERY, {
      zipCode: params.zip_code,
      radius: params.radius ?? 25,
    });

    return {
      stores: (data.storeSearch ?? []).map(mapStore),
    };
  },
});
