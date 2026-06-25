import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { search, REGION_TYPE_MAP } from '../zillow-api.js';
import { listingSchema, mapListing } from './schemas.js';

export const searchByOwner = defineTool({
  name: 'search_by_owner',
  displayName: 'Search For Sale by Owner',
  description:
    'Search for properties listed for sale by owner (FSBO) on Zillow. Requires either a region_id (from search_locations) or map_bounds.',
  summary: 'Find for-sale-by-owner listings',
  icon: 'user-check',
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
    min_price: z.number().optional().describe('Minimum price in dollars'),
    max_price: z.number().optional().describe('Maximum price in dollars'),
    min_beds: z.number().int().optional().describe('Minimum bedrooms'),
    sort: z
      .enum(['globalrelevanceex', 'days', 'pricea', 'priced', 'size'])
      .optional()
      .describe('Sort order (default "globalrelevanceex")'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    total: z.number().describe('Total FSBO listings'),
    listings: z.array(listingSchema).describe('For-sale-by-owner listings'),
  }),
  handle: async params => {
    if (!params.region_id && !params.map_bounds) {
      throw ToolError.validation('Either region_id or map_bounds is required.');
    }

    const filterState: Record<string, unknown> = {
      isForSaleByOwner: { value: true },
      isForSaleByAgent: { value: false },
      isNewConstruction: { value: false },
      isComingSoon: { value: false },
      isAuction: { value: false },
      isForSaleForeclosure: { value: false },
    };

    if (params.sort) filterState.sortSelection = { value: params.sort };
    if (params.min_price !== undefined || params.max_price !== undefined)
      filterState.price = { min: params.min_price, max: params.max_price };
    if (params.min_beds !== undefined) filterState.beds = { min: params.min_beds };

    const bounds = params.map_bounds ?? { west: -122.5, east: -122.3, south: 37.7, north: 37.8 };

    const data = await search(
      {
        pagination: params.page && params.page > 1 ? { currentPage: params.page } : undefined,
        mapBounds: bounds,
        regionSelection: params.region_id
          ? [{ regionId: params.region_id, regionType: REGION_TYPE_MAP[params.region_type ?? 'city'] ?? 6 }]
          : undefined,
        filterState,
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
