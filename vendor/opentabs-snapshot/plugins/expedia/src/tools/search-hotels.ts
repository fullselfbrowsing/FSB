import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../expedia-api.js';
import { hotelListingSchema, mapHotelListing } from './schemas.js';
import type { RawLodgingCard } from './schemas.js';

interface PropertySearchResponse {
  propertySearch?: {
    __typename?: string;
    summary?: { matchedPropertiesSize?: number };
    propertySearchListings?: RawLodgingCard[];
  };
}

const SEARCH_QUERY = `query HotelSearch($context: ContextInput!, $criteria: PropertySearchCriteriaInput) {
  propertySearch(context: $context, criteria: $criteria) {
    ... on PropertySearchResults {
      summary { matchedPropertiesSize }
      propertySearchListings {
        ... on LodgingCard {
          headingSection { heading }
          priceSection {
            priceSummary {
              displayMessages {
                lineItems {
                  ... on DisplayPrice { price { formatted } }
                  ... on LodgingEnrichedMessage { value }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export const searchHotels = defineTool({
  name: 'search_hotels',
  displayName: 'Search Hotels',
  description:
    'Search for hotels in a destination. Requires a region ID from search_locations. Returns hotel names and pricing. Results are sorted by "RECOMMENDED" by default.',
  summary: 'Search for hotels by destination and dates',
  icon: 'building-2',
  group: 'Hotels',
  input: z.object({
    region_id: z.string().describe('Gaia region ID from search_locations (e.g. "178293" for New York)'),
    check_in_date: z.string().describe('Check-in date in YYYY-MM-DD format'),
    check_out_date: z.string().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().int().min(1).max(14).optional().describe('Number of adults (default 2)'),
    children_ages: z
      .array(z.number().int().min(0).max(17))
      .optional()
      .describe('Ages of children (empty array if none)'),
    sort: z
      .enum(['RECOMMENDED', 'PRICE_LOW_TO_HIGH', 'PRICE_HIGH_TO_LOW', 'DISTANCE', 'REVIEW'])
      .optional()
      .describe('Sort order (default "RECOMMENDED")'),
  }),
  output: z.object({
    matched_count: z.number().int().describe('Total number of matching hotels'),
    hotels: z.array(hotelListingSchema).describe('Hotel listings'),
  }),
  handle: async params => {
    const [year, month, day] = params.check_in_date.split('-').map(Number);
    const [year2, month2, day2] = params.check_out_date.split('-').map(Number);

    const children = (params.children_ages ?? []).map(age => ({ age }));
    const adults = params.adults ?? 2;

    const data = await graphql<PropertySearchResponse>('HotelSearch', SEARCH_QUERY, {
      criteria: {
        primary: {
          dateRange: {
            checkInDate: { day, month, year },
            checkOutDate: { day: day2, month: month2, year: year2 },
          },
          destination: { regionId: params.region_id },
          rooms: [{ adults, children }],
        },
        secondary: {
          booleans: [],
          ranges: [],
          selections: [{ id: 'sort', value: params.sort ?? 'RECOMMENDED' }],
        },
      },
    });

    const listings = (data.propertySearch?.propertySearchListings ?? [])
      .filter(card => card.headingSection?.heading)
      .map(mapHotelListing);

    return {
      matched_count: data.propertySearch?.summary?.matchedPropertiesSize ?? 0,
      hotels: listings,
    };
  },
});
