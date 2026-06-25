// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../zillow-api.js';

export const searchListings = defineTool({
  name: 'search_listings',
  displayName: 'Search Listings',
  description:
    'Search Zillow real-estate listings for sale or rent in a location, with optional price, beds, and home-type filters.',
  summary: 'search listings on zillow',
  icon: 'magnifying-glass',
  group: 'Listings',
  input: z.object({
    location: z.string().min(1).describe('City, neighborhood, or ZIP code to search in'),
    listing_type: z.enum(['for_sale', 'for_rent', 'sold']).optional().describe('For-sale, for-rent, or sold listings'),
    min_price: z.number().int().optional().describe('Minimum price filter'),
    max_price: z.number().int().optional().describe('Maximum price filter'),
    beds: z.number().int().min(0).optional().describe('Minimum number of bedrooms'),
  }),
  output: z.object({
    listings: z.array(z.object({
      id: z.string(),
      address: z.string(),
      price: z.number(),
    })).describe('Matching real-estate listings'),
  }),
  handle: async (params: { location: string; listing_type?: string; min_price?: number; max_price?: number; beds?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /search (default method, a READ).
    const data = await api<{ listings: unknown[] }>('/search', {
      query: {
        location: params.location,
        listing_type: params.listing_type,
        min_price: params.min_price,
        max_price: params.max_price,
        beds: params.beds,
      },
    });
    return { listings: data.listings as { id: string; address: string; price: number }[] };
  },
});
