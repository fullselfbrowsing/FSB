import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { storeGet } from '../steam-api.js';
import { type RawSearchResult, mapSearchResult, searchResultSchema } from './schemas.js';

interface StoreSearchResponse {
  total: number;
  items: RawSearchResult[];
}

export const searchStore = defineTool({
  name: 'search_store',
  displayName: 'Search Store',
  description:
    'Search the Steam store for games, DLC, software, and other apps by keyword. Returns matching items with name, type, price, and thumbnail image. Prices are in cents (e.g., 5999 = $59.99).',
  summary: 'Search for games and apps on the Steam store',
  icon: 'search',
  group: 'Store',
  input: z.object({
    term: z.string().describe('Search query (e.g., "elden ring", "indie roguelike")'),
    count: z.number().int().min(1).max(25).optional().describe('Max results to return (default 10, max 25)'),
  }),
  output: z.object({
    total: z.number().describe('Total number of matching results'),
    items: z.array(searchResultSchema).describe('Search results'),
  }),
  handle: async params => {
    const data = await storeGet<StoreSearchResponse>('/api/storesearch/', {
      term: params.term,
      l: 'english',
      cc: 'US',
    });
    const items = (data.items ?? []).slice(0, params.count ?? 10).map(mapSearchResult);
    return { total: data.total ?? 0, items };
  },
});
