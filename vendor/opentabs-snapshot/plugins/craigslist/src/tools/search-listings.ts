// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../craigslist-api.js';

export const searchListings = defineTool({
  name: 'search_listings',
  displayName: 'Search Listings',
  description:
    'Search Craigslist classified listings by keyword within a city/region and category (for-sale, housing, jobs, services).',
  summary: 'search listings on craigslist',
  icon: 'magnifying-glass',
  group: 'Listings',
  input: z.object({
    query: z.string().min(1).describe('Search keywords (what to look for)'),
    region: z.string().min(1).describe('City or region subdomain to search in (e.g. sfbay, newyork)'),
    category: z.string().optional().describe('Category to filter by (e.g. for-sale, housing, jobs)'),
    max_price: z.number().int().optional().describe('Maximum price filter'),
  }),
  output: z.object({
    listings: z.array(z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
    })).describe('Matching classified listings'),
  }),
  handle: async (params: { query: string; region: string; category?: string; max_price?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /search (default method, read).
    const data = await api<{ listings: unknown[] }>('/search', {
      query: { query: params.query, region: params.region, category: params.category, max_price: params.max_price },
    });
    return { listings: data.listings as { id: string; title: string; price: number }[] };
  },
});
