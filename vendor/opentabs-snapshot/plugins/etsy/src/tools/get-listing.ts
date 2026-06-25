// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../etsy-api.js';

export const getListing = defineTool({
  name: 'get_listing',
  displayName: 'Get Listing',
  description: 'Get the full detail (title, price, shop, and availability) of a single Etsy listing by its listing ID.',
  summary: 'look up a single etsy listing',
  icon: 'tag',
  group: 'Marketplace',
  input: z.object({
    listing_id: z.string().min(1).describe('The Etsy listing ID to fetch'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      shop_name: z.string(),
    }).describe('The listing detail'),
  }),
  handle: async (params: { listing_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/listings/:id (default method, read).
    const data = await api<{ listing: { id: string; title: string; price: number; shop_name: string } }>(
      `/v1/listings/${params.listing_id}`
    );
    return { listing: data.listing };
  },
});
