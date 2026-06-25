import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { graphql } from '../tripadvisor-api.js';
import { awardSchema, mapAward, type RawAward } from './schemas.js';

interface AwardsResponse {
  RestaurantAwards_getRestaurantAwards: RawAward[];
}

export const getRestaurantAwards = defineTool({
  name: 'get_restaurant_awards',
  displayName: 'Get Restaurant Awards',
  description:
    'Get MICHELIN Guide awards and other accolades for a restaurant. Returns award details including stars, Bib Gourmand status, and MICHELIN review text. Requires the restaurant location ID.',
  summary: 'Get MICHELIN and other awards',
  icon: 'award',
  group: 'Restaurants',
  input: z.object({
    location_id: z.number().int().describe('Restaurant location ID (from search or listing)'),
  }),
  output: z.object({
    awards: z.array(awardSchema).describe('Restaurant awards'),
  }),
  handle: async params => {
    const results = await graphql<AwardsResponse>([
      {
        variables: { ids: [params.location_id] },
        queryId: '496720f897546a4e',
      },
    ]);

    const awardsData = results[0]?.RestaurantAwards_getRestaurantAwards?.[0];
    if (!awardsData) return { awards: [] };

    return { awards: mapAward(awardsData) };
  },
});
