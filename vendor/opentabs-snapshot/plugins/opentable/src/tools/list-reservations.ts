// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../opentable-api.js';

export const listReservations = defineTool({
  name: 'list_reservations',
  displayName: 'List Reservations',
  description: 'List your OpenTable reservations. Optionally filter by status (upcoming, completed, cancelled).',
  summary: 'show me my opentable reservations',
  icon: 'list',
  group: 'Reservations',
  input: z.object({
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional().describe('Filter reservations by status'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of reservations to return'),
  }),
  output: z.object({
    reservations: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('Your reservations'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/reservations (default method).
    const data = await api<{ reservations: unknown[] }>('/v1/reservations', {
      query: { status: params.status, limit: params.limit },
    });
    return { reservations: data.reservations as { id: string; status: string }[] };
  },
});
