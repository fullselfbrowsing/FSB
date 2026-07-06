import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../redfin-api.js';
import { type RawPropertyListing, propertyListingSchema, mapPropertyListing } from './schemas.js';

interface GisPayload {
  homes?: RawPropertyListing[];
  searchMedian?: { homePrice?: number; sqFt?: number; dom?: number };
}

export const searchProperties = defineTool({
  name: 'search_properties',
  displayName: 'Search Properties',
  description:
    'Search for properties on Redfin in a given region. Returns listings with price, beds, baths, sqft, and location. Use search_locations first to find region_id and region_type values. Status filter: 9=for sale, 32=off market, 130=sold. Common region types: 2=city, 5=county, 6=zip.',
  summary: 'Search properties by region with filters',
  icon: 'home',
  group: 'Search',
  input: z.object({
    region_id: z
      .number()
      .int()
      .describe('Region ID from search_locations (numeric part of the location id, e.g., 17151)'),
    region_type: z.number().int().describe('Region type from search_locations (e.g., 2=city, 5=county, 6=zip)'),
    num_homes: z.number().int().min(1).max(50).optional().describe('Maximum number of results (default 20, max 50)'),
    status: z
      .number()
      .int()
      .optional()
      .describe('Listing status filter: 9=for sale (default), 32=off market, 130=recently sold'),
    min_price: z.number().optional().describe('Minimum listing price in dollars'),
    max_price: z.number().optional().describe('Maximum listing price in dollars'),
    min_beds: z.number().int().optional().describe('Minimum bedrooms'),
    max_beds: z.number().int().optional().describe('Maximum bedrooms'),
    min_baths: z.number().int().optional().describe('Minimum bathrooms'),
    min_sqft: z.number().optional().describe('Minimum square footage'),
    max_sqft: z.number().optional().describe('Maximum square footage'),
    property_type: z
      .string()
      .optional()
      .describe('Property type filter codes, comma-separated (e.g., "1,2,3,4,5,6,7" for all types)'),
  }),
  output: z.object({
    properties: z.array(propertyListingSchema).describe('Matching property listings'),
    median_price: z.number().describe('Median home price in the area (0 if unavailable)'),
    median_sqft: z.number().describe('Median square footage in the area (0 if unavailable)'),
    median_dom: z.number().describe('Median days on market (0 if unavailable)'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      al: 1,
      region_id: params.region_id,
      region_type: params.region_type,
      num_homes: params.num_homes ?? 20,
      status: params.status ?? 9,
      sf: params.property_type ?? '1,2,3,4,5,6,7',
    };

    if (params.min_price !== undefined) query.min_price = params.min_price;
    if (params.max_price !== undefined) query.max_price = params.max_price;
    if (params.min_beds !== undefined) query.min_beds = params.min_beds;
    if (params.max_beds !== undefined) query.max_beds = params.max_beds;
    if (params.min_baths !== undefined) query.min_baths = params.min_baths;
    if (params.min_sqft !== undefined) query.min_sqft = params.min_sqft;
    if (params.max_sqft !== undefined) query.max_sqft = params.max_sqft;

    const data = await api<GisPayload>('/stingray/api/gis', { query });

    return {
      properties: (data.homes ?? []).map(mapPropertyListing),
      median_price: data.searchMedian?.homePrice ?? 0,
      median_sqft: data.searchMedian?.sqFt ?? 0,
      median_dom: data.searchMedian?.dom ?? 0,
    };
  },
});
