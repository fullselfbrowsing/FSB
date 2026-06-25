import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import { searchResultSchema, mapSearchResult, type RawSearchResult } from './schemas.js';

export const listHotels = defineTool({
  name: 'list_hotels',
  displayName: 'List Hotels',
  description:
    'List hotels in a city or area on TripAdvisor. Returns a page of hotel listings. Uses the geo-based hotel listing page URL.',
  summary: 'List hotels in an area',
  icon: 'list',
  group: 'Hotels',
  input: z.object({
    url: z
      .string()
      .describe('Hotel listing page URL path (e.g., "/Hotels-g60713-San_Francisco_California-Hotels.html")'),
  }),
  output: z.object({
    hotels: z.array(searchResultSchema).describe('Hotel listings'),
  }),
  handle: async params => {
    const ssrData = await fetchSsrData(params.url);

    // Hotel search results may be in HotelListingPresentation or similar SSR operation
    const hotelResults = findSsrOperation(ssrData, 'HotelListPresentation_hotel') as {
      hotels?: RawSearchResult[];
    } | null;

    const results: RawSearchResult[] = hotelResults?.hotels ?? [];

    // Fall back to looking for location data
    if (results.length === 0) {
      const shelf = findSsrOperation(ssrData, 'hotelResults') as { hotels?: RawSearchResult[] } | null;
      if (shelf?.hotels) {
        results.push(...shelf.hotels);
      }
    }

    return {
      hotels: results.map(mapSearchResult),
    };
  },
});
