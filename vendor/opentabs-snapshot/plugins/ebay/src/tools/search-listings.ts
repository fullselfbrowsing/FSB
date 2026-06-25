// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ebay-api.js';

export const searchListings = defineTool({
  name: 'search_listings',
  displayName: 'Search Listings',
  description:
    'Search eBay marketplace listings by keyword. Optionally filter by category, condition, and buying format (auction or fixed-price).',
  summary: 'search listings on ebay',
  icon: 'search',
  group: 'Marketplace',
  input: z.object({
    query: z.string().min(1).describe('Search keywords (item name, brand, or description)'),
    category: z.string().optional().describe('Category to filter by'),
    condition: z.enum(['new', 'used', 'refurbished']).optional().describe('Item condition filter'),
    buying_format: z.enum(['auction', 'fixed_price', 'all']).optional().describe('Auction vs Buy It Now'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of listings to return'),
  }),
  output: z.object({
    listings: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
    })).describe('Matching listings'),
  }),
  handle: async (params: { query: string; category?: string; condition?: string; buying_format?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/listings/search (default method, read).
    const data = await api<{ listings: unknown[] }>('/v1/listings/search', {
      query: { query: params.query, category: params.category, condition: params.condition, buying_format: params.buying_format, limit: params.limit },
    });
    return { listings: data.listings as { id: string; title: string; price: number }[] };
  },
});
