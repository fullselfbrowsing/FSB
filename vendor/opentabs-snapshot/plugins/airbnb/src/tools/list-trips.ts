// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airbnb-api.js';

export const listTrips = defineTool({
  name: 'list_trips',
  displayName: 'List Trips',
  description: 'List your Airbnb trips (booked reservations). Optionally filter by status (upcoming, completed, cancelled).',
  summary: 'show me my airbnb trips',
  icon: 'map',
  group: 'Trips',
  input: z.object({
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional().describe('Filter trips by status'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of trips to return'),
  }),
  output: z.object({
    trips: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('Your trips'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v2/trips (default method).
    const data = await api<{ trips: unknown[] }>('/v2/trips', {
      query: { status: params.status, limit: params.limit },
    });
    return { trips: data.trips as { id: string; status: string }[] };
  },
});
