// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../booking-api.js';

export const listBookings = defineTool({
  name: 'list_bookings',
  displayName: 'List Bookings',
  description: 'List your Booking.com reservations. Optionally filter by status (upcoming, completed, cancelled).',
  summary: 'show me my booking reservations',
  icon: 'list',
  group: 'Bookings',
  input: z.object({
    status: z.enum(['upcoming', 'completed', 'cancelled']).optional().describe('Filter bookings by status'),
    limit: z.number().int().min(1).max(50).optional().describe('Maximum number of bookings to return'),
  }),
  output: z.object({
    bookings: z.array(z.object({
      id: z.string(),
      status: z.string(),
    })).describe('Your reservations'),
  }),
  handle: async (params: { status?: string; limit?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/bookings (default method).
    const data = await api<{ bookings: unknown[] }>('/v1/bookings', {
      query: { status: params.status, limit: params.limit },
    });
    return { bookings: data.bookings as { id: string; status: string }[] };
  },
});
