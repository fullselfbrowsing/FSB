// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../instacart-api.js';

export const listStores = defineTool({
  name: 'list_stores',
  displayName: 'List Stores',
  description:
    'List Instacart grocery stores available for delivery to an address. Optionally filter by a search term (store or retailer name).',
  summary: 'show me grocery stores on instacart',
  icon: 'shopping-bag',
  group: 'Stores',
  input: z.object({
    address: z.string().optional().describe('Delivery address to find stores for'),
    query: z.string().optional().describe('Search term (store or retailer name)'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of stores to return'),
  }),
  output: z.object({
    stores: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Matching stores'),
  }),
  handle: async (params: { address?: string; query?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/stores (default method).
    const data = await api<{ stores: unknown[] }>('/v1/stores', {
      query: { address: params.address, query: params.query, limit: params.limit },
    });
    return { stores: data.stores as { id: string; name: string }[] };
  },
});
