// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

export const listLocations = defineTool({
  name: 'list_locations',
  displayName: 'List Locations',
  description: 'List nearby Chipotle locations by address or ZIP code, with their hours and pickup availability.',
  summary: 'find nearby chipotle locations',
  icon: 'map-pin',
  group: 'Locations',
  input: z.object({
    address: z.string().min(1).describe('Address or ZIP code to search near'),
    radius_miles: z.number().int().min(1).max(50).optional().describe('Search radius in miles'),
  }),
  output: z.object({
    locations: z.array(z.object({
      id: z.string(),
      name: z.string(),
      address: z.string(),
    })).describe('Nearby locations'),
  }),
  handle: async (params: { address: string; radius_miles?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /restaurants (default method, read).
    const data = await api<{ locations: unknown[] }>('/restaurants', {
      query: { address: params.address, radius_miles: params.radius_miles },
    });
    return { locations: data.locations as { id: string; name: string; address: string }[] };
  },
});
