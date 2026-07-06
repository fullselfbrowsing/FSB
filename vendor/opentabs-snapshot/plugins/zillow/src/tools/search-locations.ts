import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { autocomplete } from '../zillow-api.js';
import { locationSchema, mapLocation } from './schemas.js';

export const searchLocations = defineTool({
  name: 'search_locations',
  displayName: 'Search Locations',
  description:
    'Search for cities, ZIP codes, neighborhoods, and addresses on Zillow. Returns location suggestions with region IDs that can be used with search tools. Use this to resolve a location name to a region_id before calling search_for_sale, search_for_rent, or search_recently_sold.',
  summary: 'Search for cities, ZIP codes, neighborhoods, and addresses',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Location search text (e.g., "San Francisco", "94107", "Mission District")'),
  }),
  output: z.object({
    locations: z.array(locationSchema).describe('Matching locations'),
  }),
  handle: async params => {
    const results = await autocomplete(params.query);
    return { locations: results.map(mapLocation) };
  },
});
