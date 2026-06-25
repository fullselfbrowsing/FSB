// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../dominos-api.js';

export const listStores = defineTool({
  name: 'list_stores',
  displayName: 'List Stores',
  description: 'List nearby Domino’s stores by address or ZIP code, with their hours and delivery/carryout availability.',
  summary: 'find nearby dominos stores',
  icon: 'map-pin',
  group: 'Stores',
  input: z.object({
    address: z.string().min(1).describe('Address or ZIP code to search near'),
    service: z.enum(['delivery', 'carryout']).optional().describe('Filter by service type'),
  }),
  output: z.object({
    stores: z.array(z.object({
      id: z.string(),
      name: z.string(),
      address: z.string(),
    })).describe('Nearby stores'),
  }),
  handle: async (params: { address: string; service?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /stores (default method, read).
    const data = await api<{ stores: unknown[] }>('/stores', {
      query: { address: params.address, service: params.service },
    });
    return { stores: data.stores as { id: string; name: string; address: string }[] };
  },
});
