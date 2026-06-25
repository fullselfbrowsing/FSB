import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { rest } from '../priceline-api.js';
import { type RawSearchItem, mapSearchItem, searchItemSchema } from './schemas.js';

interface AutoSuggestResponse {
  resultCode?: number;
  searchItems?: RawSearchItem[];
}

export const searchLocations = defineTool({
  name: 'search_locations',
  displayName: 'Search Locations',
  description:
    'Search for cities, hotels, airports, neighborhoods, and points of interest by keyword. Returns location IDs needed for hotel search. Use this to find a city ID before searching for hotels.',
  summary: 'Search destinations by keyword',
  icon: 'map-pin',
  group: 'Search',
  input: z.object({
    keyword: z.string().describe('Search keyword (city name, hotel name, airport, POI)'),
  }),
  output: z.object({
    locations: z.array(searchItemSchema).describe('Matching locations sorted by relevance'),
  }),
  handle: async params => {
    const data = await rest<AutoSuggestResponse>('/index/relax/search/autoSuggest', { keyword: params.keyword });
    const items = data.searchItems ?? [];
    return { locations: items.map(mapSearchItem) };
  },
});
