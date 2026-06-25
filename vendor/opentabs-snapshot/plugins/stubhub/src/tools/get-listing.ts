// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../stubhub-api.js';

export const getListing = defineTool({
  name: 'get_listing',
  displayName: 'Get Listing',
  description: 'Get the seat, section, quantity, and price details of a single StubHub resale ticket listing by its ID.',
  summary: 'look up a stubhub listing',
  icon: 'tag',
  group: 'Events',
  input: z.object({
    listing_id: z.string().min(1).describe('The listing ID to fetch'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      price: z.string(),
    }).describe('The listing detail'),
  }),
  handle: async (params: { listing_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /inventory/listings/:id (default method).
    const data = await api<{ listing: { id: string; price: string } }>(
      `/inventory/listings/${params.listing_id}`,
      {}
    );
    return { listing: data.listing };
  },
});
