// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airbnb-api.js';

export const getListing = defineTool({
  name: 'get_listing',
  displayName: 'Get Listing',
  description: 'Get the full details, amenities, and availability of a single Airbnb listing by its ID.',
  summary: 'look up an airbnb listing',
  icon: 'home',
  group: 'Listings',
  input: z.object({
    listing_id: z.string().min(1).describe('The listing ID to fetch'),
    check_in: z.string().optional().describe('Check-in date (YYYY-MM-DD) for live availability + price'),
    check_out: z.string().optional().describe('Check-out date (YYYY-MM-DD) for live availability + price'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      title: z.string(),
      nightly_price: z.number(),
    }).describe('The listing detail'),
  }),
  handle: async (params: { listing_id: string; check_in?: string; check_out?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v2/listings/:id (default method).
    const data = await api<{ listing: { id: string; title: string; nightly_price: number } }>(
      `/v2/listings/${params.listing_id}`,
      { query: { check_in: params.check_in, check_out: params.check_out } }
    );
    return { listing: data.listing };
  },
});
