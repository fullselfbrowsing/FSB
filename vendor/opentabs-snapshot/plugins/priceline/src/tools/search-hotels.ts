import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, getCguid, getAuthToken } from '../priceline-api.js';
import {
  type RawHotelListing,
  type RawCityInfo,
  mapHotelListing,
  mapCityInfo,
  hotelListingSchema,
  cityInfoSchema,
} from './schemas.js';

const PERSISTED_HASH = 'ffaeed6473a0adf0074403134bb897df6c6f402f9a0322017b0ec4d268d943c3';

interface ListingsResponse {
  listings?: {
    cityInfo?: RawCityInfo;
    hotels?: RawHotelListing[];
    totalSize?: number;
  };
}

export const searchHotels = defineTool({
  name: 'search_hotels',
  displayName: 'Search Hotels',
  description:
    'Search for hotels in a city by location ID and travel dates. Returns hotel listings with pricing, ratings, amenities, and availability. Use search_locations first to find the city ID. Date format is YYYYMMDD (e.g., 20260315). Returns up to 30 results per page; use offset for pagination.',
  summary: 'Search hotels by city and dates',
  icon: 'building-2',
  group: 'Hotels',
  input: z.object({
    location_id: z.string().describe('City or location ID from search_locations'),
    check_in: z.string().describe('Check-in date in YYYYMMDD format (e.g., 20260315)'),
    check_out: z.string().describe('Check-out date in YYYYMMDD format (e.g., 20260316)'),
    adults: z.number().int().min(1).max(8).optional().describe('Number of adults (default 2)'),
    rooms: z.number().int().min(1).max(8).optional().describe('Number of rooms (default 1)'),
    sort_by: z
      .enum(['HDR', 'GSR', 'PRC', 'SRN', 'DS'])
      .optional()
      .describe('Sort order: HDR=recommended, GSR=guest rating, PRC=price, SRN=star rating, DS=distance (default HDR)'),
    offset: z.number().int().min(0).optional().describe('Pagination offset (default 0, increments by 30)'),
  }),
  output: z.object({
    city: cityInfoSchema.describe('City information for the search'),
    hotels: z.array(hotelListingSchema).describe('Hotel listings'),
    total_count: z.number().int().describe('Total number of results'),
  }),
  handle: async params => {
    const adults = params.adults ?? 2;
    const rooms = params.rooms ?? 1;

    const variables: Record<string, unknown> = {
      adults,
      addErrToResponse: true,
      children: [],
      checkIn: params.check_in,
      checkOut: params.check_out,
      currencyCode: 'USD',
      first: 30,
      googleMapStatic: {
        size: { x: 300, y: 150 },
        zoomLevel: 8,
        hidePins: true,
      },
      imageCount: 5,
      allowAllInclusiveImageSort: false,
      imagesOffsetNum: 1,
      imagesSortBy: { amenities: [] },
      includeHotelContent: true,
      includePrepaidFeeRates: true,
      includePSLResponse: true,
      includeStaticFilters: true,
      locationID: params.location_id,
      sortBy: params.sort_by ?? 'HDR',
      offset: params.offset ?? 0,
      productTypes: ['RTL', 'SOPQ'],
      propertyTypeIds: '',
      roomCount: rooms,
      unlockDeals: true,
      vipDeals: false,
      appCode: 'DESKTOP',
      cguid: getCguid(),
      plfCode: 'PCLN',
      rID: 'DTDIRECT',
      authToken: getAuthToken(),
      userCountryCode: 'US',
    };

    const data = await graphql<ListingsResponse>('getAllListings', variables, PERSISTED_HASH);

    const listings = data.listings;
    return {
      city: mapCityInfo(listings?.cityInfo ?? {}),
      hotels: (listings?.hotels ?? []).map(mapHotelListing),
      total_count: listings?.totalSize ?? 0,
    };
  },
});
