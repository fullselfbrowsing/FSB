// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../zillow-api.js';

export const getListing = defineTool({
  name: 'get_listing',
  displayName: 'Get Listing',
  description: 'Get the full detail (address, price, photos, beds/baths, and description) of a single Zillow listing by its ID.',
  summary: 'look up a single zillow listing',
  icon: 'home',
  group: 'Listings',
  input: z.object({
    listing_id: z.string().min(1).describe('The Zillow listing ID (zpid) to fetch'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      address: z.string(),
      price: z.number(),
      beds: z.number(),
    }).describe('The listing detail'),
  }),
  handle: async (params: { listing_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /listing/:id (default method, a READ).
    const data = await api<{ listing: { id: string; address: string; price: number; beds: number } }>(
      `/listing/${params.listing_id}`
    );
    return { listing: data.listing };
  },
});
