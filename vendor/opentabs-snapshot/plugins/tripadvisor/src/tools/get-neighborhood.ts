import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchSsrData, findSsrOperation } from '../tripadvisor-api.js';
import { neighborhoodSchema, mapNeighborhood, type RawNeighborhood } from './schemas.js';

export const getNeighborhood = defineTool({
  name: 'get_neighborhood',
  displayName: 'Get Neighborhood',
  description:
    'Get information about the neighborhood of a restaurant, hotel, or attraction on TripAdvisor including the neighborhood description. Extracted from the detail page SSR data.',
  summary: 'Get neighborhood info',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({
    url: z.string().describe('Detail page URL path of a restaurant, hotel, or attraction'),
  }),
  output: z.object({
    neighborhood: neighborhoodSchema,
  }),
  handle: async params => {
    const ssrData = await fetchSsrData(params.url);

    const bestNearby = findSsrOperation(ssrData, 'RestaurantPresentation_getBestNearby') as {
      neighborhood?: RawNeighborhood;
    } | null;

    return {
      neighborhood: mapNeighborhood(bestNearby?.neighborhood ?? {}),
    };
  },
});
