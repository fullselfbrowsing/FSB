// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../etsy-api.js';

export const searchListings = defineTool({
  name: 'search_listings',
  displayName: 'Search Listings',
  description:
    'Search Etsy handmade and vintage marketplace listings by keyword. Optionally filter by category and sort the results.',
  summary: 'search listings on etsy',
  icon: 'search',
  group: 'Marketplace',
  input: z.object({
    query: z.string().min(1).describe('Search keywords (item name, material, or style)'),
    category: z.string().optional().describe('Category to filter by'),
    sort: z.enum(['relevance', 'price_low_to_high', 'price_high_to_low', 'newest']).optional().describe('Result ordering'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of listings to return'),
  }),
  output: z.object({
    listings: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
    })).describe('Matching listings'),
  }),
  handle: async (params: { query: string; category?: string; sort?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/listings/search (default method, read).
    const data = await api<{ listings: unknown[] }>('/v1/listings/search', {
      query: { query: params.query, category: params.category, sort: params.sort, limit: params.limit },
    });
    return { listings: data.listings as { id: string; title: string; price: number }[] };
  },
});
