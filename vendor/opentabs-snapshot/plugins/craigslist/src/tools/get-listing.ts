// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../craigslist-api.js';

export const getListing = defineTool({
  name: 'get_listing',
  displayName: 'Get Listing',
  description: 'Get the full detail (title, price, description, contact, and posting date) of a single Craigslist listing by its ID.',
  summary: 'look up a single craigslist listing',
  icon: 'document',
  group: 'Listings',
  input: z.object({
    listing_id: z.string().min(1).describe('The listing ID to fetch'),
  }),
  output: z.object({
    listing: z.object({
      id: z.string(),
      title: z.string(),
      price: z.number(),
      description: z.string(),
    }).describe('The listing detail'),
  }),
  handle: async (params: { listing_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /listing/:id (default method, read).
    const data = await api<{ listing: { id: string; title: string; price: number; description: string } }>(
      `/listing/${params.listing_id}`
    );
    return { listing: data.listing };
  },
});
