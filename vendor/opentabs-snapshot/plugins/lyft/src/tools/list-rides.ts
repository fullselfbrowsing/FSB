// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../lyft-api.js';

export const listRides = defineTool({
  name: 'list_rides',
  displayName: 'List Rides',
  description: 'List your recent Lyft rides. Optionally filter by status (active, completed, cancelled).',
  summary: 'show me my lyft ride history',
  icon: 'map',
  group: 'Rides',
  input: z.object({
    status: z.enum(['active', 'completed', 'cancelled']).optional().describe('Filter rides by status'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of rides to return'),
  }),
  output: z.object({
    rides: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('Your recent rides'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/rides (default method).
    const data = await api<{ rides: unknown[] }>('/v1/rides', {
      query: { status: params.status, limit: params.limit },
    });
    return { rides: data.rides as { id: string; status: string }[] };
  },
});
