import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql, getCguid, getAuthToken } from '../priceline-api.js';
import { type RawDynamicFilter, mapDynamicFilter, dynamicFilterSchema } from './schemas.js';

const PERSISTED_HASH = '42166a77a084495355dbecd9598223d19017d1a6df298575d4b17894384faa6a';

interface FiltersResponse {
  hotelDynamicFilters?: {
    filters?: RawDynamicFilter[];
  };
}

export const getHotelFilters = defineTool({
  name: 'get_hotel_filters',
  displayName: 'Get Hotel Filters',
  description:
    'Get available dynamic filter options for a hotel search. Returns filter categories (amenities, price ranges, deal types, rate options, zones) with their selectable values. Use these filters to understand what refinements are available for a specific city and date combination.',
  summary: 'Get available hotel search filters',
  icon: 'sliders-horizontal',
  group: 'Hotels',
  input: z.object({
    city_id: z.string().describe('Priceline city ID'),
    check_in: z.string().describe('Check-in date in YYYYMMDD format'),
    check_out: z.string().describe('Check-out date in YYYYMMDD format'),
    adults: z.number().int().min(1).optional().describe('Number of adults (default 2)'),
  }),
  output: z.object({
    filters: z.array(dynamicFilterSchema).describe('Available filter categories and values'),
  }),
  handle: async params => {
    const data = await graphql<FiltersResponse>(
      'getHotelDynamicFilters',
      {
        appc: 'DESKTOP',
        adults: params.adults ?? 2,
        appliedFilters: [],
        authToken: getAuthToken(),
        checkIn: params.check_in,
        checkOut: params.check_out,
        childAges: [],
        children: 0,
        cguid: getCguid(),
        cityId: params.city_id,
        tierLabel: '',
        mapView: false,
      },
      PERSISTED_HASH,
    );

    const filters = data.hotelDynamicFilters?.filters ?? [];
    return { filters: filters.map(mapDynamicFilter) };
  },
});
