import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { search, REGION_TYPE_MAP } from '../zillow-api.js';
import { listingSchema, mapListing } from './schemas.js';

export const searchOpenHouses = defineTool({
  name: 'search_open_houses',
  displayName: 'Search Open Houses',
  description:
    'Search for properties with upcoming open houses in a given area. Requires either a region_id (from search_locations) or map_bounds.',
  summary: 'Find properties with open houses',
  icon: 'door-open',
  group: 'Search',
  input: z.object({
    region_id: z
      .number()
      .int()
      .optional()
      .describe('Zillow region ID (from search_locations). Required if map_bounds is not provided.'),
    region_type: z
      .string()
      .optional()
      .describe('Region type: "city", "county", "zipcode", "neighborhood" (default "city")'),
    map_bounds: z
      .object({
        west: z.number().describe('Western longitude'),
        east: z.number().describe('Eastern longitude'),
        south: z.number().describe('Southern latitude'),
        north: z.number().describe('Northern latitude'),
      })
      .optional()
      .describe('Map bounding box. Required if region_id is not provided.'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    total: z.number().describe('Total listings with open houses'),
    listings: z.array(listingSchema).describe('Properties with open houses'),
  }),
  handle: async params => {
    if (!params.region_id && !params.map_bounds) {
      throw ToolError.validation('Either region_id or map_bounds is required.');
    }

    const bounds = params.map_bounds ?? { west: -122.5, east: -122.3, south: 37.7, north: 37.8 };

    const data = await search(
      {
        pagination: params.page && params.page > 1 ? { currentPage: params.page } : undefined,
        mapBounds: bounds,
        regionSelection: params.region_id
          ? [{ regionId: params.region_id, regionType: REGION_TYPE_MAP[params.region_type ?? 'city'] ?? 6 }]
          : undefined,
        filterState: {
          isOpenHousesOnly: { value: true },
        },
        isMapVisible: true,
      },
      { cat1: ['listResults', 'total'] },
    );

    return {
      total: data.categoryTotals?.cat1?.totalResultCount ?? data.cat1?.searchResults?.listResults?.length ?? 0,
      listings: (data.cat1?.searchResults?.listResults ?? []).map(mapListing),
    };
  },
});
