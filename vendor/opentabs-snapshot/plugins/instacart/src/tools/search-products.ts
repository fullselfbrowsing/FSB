import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getLocationContext, gqlQuery } from '../instacart-api.js';
import { type RawSearchSuggestion, mapSearchSuggestion, searchSuggestionSchema } from './schemas.js';

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    "Search for products across all available retailers near the delivery address. Returns suggested items with thumbnails. Use get_location_context first if you need the zone ID. The search uses the user's current delivery location automatically.",
  summary: 'Search for grocery products',
  icon: 'search',
  group: 'Shopping',
  input: z.object({
    query: z.string().describe('Search query (e.g. "milk", "organic eggs", "chicken breast")'),
    limit: z.number().int().min(1).max(20).optional().describe('Max results (default 10)'),
  }),
  output: z.object({
    suggestions: z.array(searchSuggestionSchema).describe('Search suggestions'),
  }),
  handle: async params => {
    const loc = getLocationContext();
    if (!loc) {
      throw ToolError.validation('No delivery location set. The user needs to set a delivery address first.');
    }

    const data = await gqlQuery<{
      crossRetailerSearchAutosuggestions: RawSearchSuggestion[];
    }>('CrossRetailerSearchAutosuggestions', {
      query: params.query,
      limit: params.limit ?? 10,
      retailerIds: loc.retailerIds,
      zoneId: loc.zoneId,
      autosuggestionSessionId: crypto.randomUUID(),
    });

    return {
      suggestions: (data.crossRetailerSearchAutosuggestions ?? []).map(mapSearchSuggestion),
    };
  },
});
