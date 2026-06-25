// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../craigslist-api.js';

export const deleteListing = defineTool({
  name: 'delete_listing',
  displayName: 'Delete Listing',
  description: 'Delete one of your Craigslist listings by its ID. This permanently removes the classified ad.',
  summary: 'delete my craigslist listing',
  icon: 'trash',
  group: 'Listings',
  input: z.object({
    listing_id: z.string().min(1).describe('The listing ID to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the listing was successfully deleted'),
  }),
  handle: async (params: { listing_id: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /listing/:id
    // (delete -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/listing/${params.listing_id}`, { method: 'DELETE' });
    return { success: true };
  },
});
