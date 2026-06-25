import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../priceline-api.js';
import { type RawDatePriceMap, mapPriceGuidance, priceGuidanceEntrySchema } from './schemas.js';

const PERSISTED_HASH = '973c01ae60710b06f8078c6b84ecd353734d7fb5da5eaa664ffabf23d901f15f';

interface PriceGuidanceResponse {
  hotelsPriceGuidance?: {
    data?: {
      datePriceMap?: RawDatePriceMap[];
    };
  };
}

export const getPriceGuidance = defineTool({
  name: 'get_price_guidance',
  displayName: 'Get Price Guidance',
  description:
    'Get hotel price trends for a city over a date range. Shows min, max, and average prices by star rating and product type for each date. Useful for finding the cheapest travel dates. Date format is YYYYMMDD.',
  summary: 'Get hotel price trends for a city',
  icon: 'trending-down',
  group: 'Hotels',
  input: z.object({
    city_id: z.number().int().describe('Priceline city ID (numeric, from search_locations)'),
    start_date: z.string().describe('Start of date range in YYYYMMDD format'),
    end_date: z.string().describe('End of date range in YYYYMMDD format'),
    star_rating: z
      .enum(['All_Star', 'Star_2', 'Star_3', 'Star_4', 'Star_5'])
      .optional()
      .describe('Filter by star rating (default returns all star ratings)'),
  }),
  output: z.object({
    prices: z.array(priceGuidanceEntrySchema).describe('Price guidance entries per date'),
  }),
  handle: async params => {
    const data = await graphql<PriceGuidanceResponse>(
      'getHotelsPriceGuidance',
      {
        includeMandPropFees: false,
        currency: 'USD',
        entityId: params.city_id,
        entityType: 'CITY',
        startDate: params.start_date,
        endDate: params.end_date,
        product: 'ALL',
        appCode: 'DESKTOP',
      },
      PERSISTED_HASH,
    );

    const dateMap = data.hotelsPriceGuidance?.data?.datePriceMap ?? [];
    const prices: ReturnType<typeof mapPriceGuidance>[] = [];

    for (const entry of dateMap) {
      for (const value of entry.values ?? []) {
        if (params.star_rating && value.starRating !== params.star_rating) {
          continue;
        }
        prices.push(mapPriceGuidance(entry, value));
      }
    }

    return { prices };
  },
});
