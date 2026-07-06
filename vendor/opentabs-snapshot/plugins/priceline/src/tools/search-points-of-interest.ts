import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rest } from '../priceline-api.js';
import { type RawSearchItem, mapSearchItem, searchItemSchema } from './schemas.js';

interface TopPOIResponse {
  resultCode?: number;
  searchItems?: RawSearchItem[];
}

export const searchPointsOfInterest = defineTool({
  name: 'search_points_of_interest',
  displayName: 'Search Points of Interest',
  description:
    'Search for top points of interest in a city. Returns landmarks, attractions, and popular areas near hotels. Useful for finding hotels near specific attractions.',
  summary: 'Find top attractions in a city',
  icon: 'landmark',
  group: 'Search',
  input: z.object({
    city_id: z.string().optional().describe('Priceline city ID to search within'),
    city_name: z.string().optional().describe('City name to search by (alternative to city_id)'),
    limit: z.number().int().min(1).max(20).optional().describe('Maximum number of results (default 10)'),
  }),
  output: z.object({
    points_of_interest: z.array(searchItemSchema).describe('Points of interest'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      numGenAiPOIs: params.limit ?? 10,
    };

    if (params.city_id) {
      query.cityId = params.city_id;
    } else if (params.city_name) {
      query.cityName = params.city_name;
    }

    const data = await rest<TopPOIResponse>('/index/relax/search/topPOIByCityIdOrCityName', query);

    const items = data.searchItems ?? [];
    return { points_of_interest: items.map(mapSearchItem) };
  },
});
