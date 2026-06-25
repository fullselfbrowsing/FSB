// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ebay-api.js';

export const getListing = defineTool({
  name: 'get_listing',
  displayName: 'Get Listing',
  description: 'Get the full detail (title, current price, bids, time left, and seller) of a single eBay listing by its item ID.',
  summary: 'look up a single ebay listing',
  icon: 'tag',
  group: 'Marketplace',
  input: z.object({
    listing_id: z.string().min(1).describe('The eBay item / listing ID to fetch'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      title: z.string(),
      current_price: z.number(),
      bid_count: z.number(),
    }).describe('The listing detail'),
  }),
  handle: async (params: { listing_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/listings/:id (default method, read).
    const data = await api<{ listing: { id: string; title: string; current_price: number; bid_count: number } }>(
      `/v1/listings/${params.listing_id}`
    );
    return { listing: data.listing };
  },
});
