import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { search, REGION_TYPE_MAP } from '../zillow-api.js';
import { listingSchema, mapListing } from './schemas.js';

export const searchForSale = defineTool({
  name: 'search_for_sale',
  displayName: 'Search For Sale',
  description:
    'Search for properties currently for sale on Zillow. Requires either a region_id (from search_locations) or map_bounds. Supports filtering by price, beds, baths, square footage, home type, and more. Returns up to 41 results per page with pagination support.',
  summary: 'Search properties for sale',
  icon: 'home',
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
    max_beds: z.number().int().optional().describe('Maximum bedrooms'),
    min_baths: z.number().int().optional().describe('Minimum bathrooms'),
    min_sqft: z.number().optional().describe('Minimum square footage'),
    max_sqft: z.number().optional().describe('Maximum square footage'),
    home_type: z
      .enum(['single_family', 'condo', 'townhouse', 'multi_family', 'lot_land', 'manufactured'])
      .optional()
      .describe('Property type filter'),
    sort: z
      .enum(['globalrelevanceex', 'days', 'pricea', 'priced', 'zest', 'zesta', 'size', 'lot', 'beds', 'baths'])
      .optional()
      .describe(
        'Sort order (default "globalrelevanceex" = Homes for You). "days"=Newest, "pricea"=Price low-high, "priced"=Price high-low, "zest"=Zestimate high-low',
      ),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    total: z.number().describe('Total number of matching listings'),
    listings: z.array(listingSchema).describe('Property listings'),
  }),
  handle: async params => {
    if (!params.region_id && !params.map_bounds) {
      throw ToolError.validation('Either region_id or map_bounds is required.');
    }

    const filterState: Record<string, unknown> = {};
    if (params.sort) filterState.sortSelection = { value: params.sort };
    if (params.min_price !== undefined || params.max_price !== undefined)
      filterState.price = { min: params.min_price, max: params.max_price };
    if (params.min_beds !== undefined) filterState.beds = { min: params.min_beds };
    if (params.max_beds !== undefined) filterState.beds = { ...(filterState.beds as object), max: params.max_beds };
    if (params.min_baths !== undefined) filterState.baths = { min: params.min_baths };
    if (params.min_sqft !== undefined || params.max_sqft !== undefined)
      filterState.sqft = { min: params.min_sqft, max: params.max_sqft };

    if (params.home_type) {
      const typeMap: Record<string, string> = {
        single_family: 'isSingleFamily',
        condo: 'isCondo',
        townhouse: 'isTownhouse',
        multi_family: 'isMultiFamily',
        lot_land: 'isLotLand',
        manufactured: 'isManufactured',
      };
      const key = typeMap[params.home_type];
      if (key) filterState[key] = { value: true };
    }

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
      { cat1: ['listResults', 'total'], cat2: ['total'] },
    );

    return {
      total: data.categoryTotals?.cat1?.totalResultCount ?? data.cat1?.searchResults?.listResults?.length ?? 0,
      listings: (data.cat1?.searchResults?.listResults ?? []).map(mapListing),
    };
  },
});
