// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../tripadvisor-api.js';

export const getLocation = defineTool({
  name: 'get_location',
  displayName: 'Get Location',
  description: 'Get the details, address, rating, amenities, and ranking of a single Tripadvisor location by its ID.',
  summary: 'look up a location on tripadvisor',
  icon: 'location-dot',
  group: 'Locations',
  input: z.object({
    location_id: z.string().min(1).describe('The Tripadvisor location ID to fetch'),
  }),
  output: z.object({
    location: z.object({
      id: z.string(),
      name: z.string(),
      rating: z.number(),
    }).describe('The location detail'),
  }),
  handle: async (params: { location_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /location/:id/details (default method, a READ).
    const data = await api<{ location: { id: string; name: string; rating: number } }>(
      `/location/${params.location_id}/details`,
      {}
    );
    return { location: data.location };
  },
});
