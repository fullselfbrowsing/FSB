// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../booking-api.js';

export const searchStays = defineTool({
  name: 'search_stays',
  displayName: 'Search Stays',
  description:
    'Search Booking.com for places to stay (hotels, apartments, homes) in a destination for a set of dates and number of guests. Returns matching properties with prices.',
  summary: 'search stays on booking',
  icon: 'bed',
  group: 'Stays',
  input: z.object({
    destination: z.string().min(1).describe('City, region, or property name to search'),
    check_in: z.string().optional().describe('Check-in date (YYYY-MM-DD)'),
    check_out: z.string().optional().describe('Check-out date (YYYY-MM-DD)'),
    guests: z.number().int().min(1).optional().describe('Number of guests'),
    rooms: z.number().int().min(1).optional().describe('Number of rooms'),
  }),
  output: z.object({
    properties: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Matching properties'),
  }),
  handle: async (params: { destination: string; check_in?: string; check_out?: string; guests?: number; rooms?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/stays/search (default method).
    const data = await api<{ properties: unknown[] }>('/v1/stays/search', {
      query: {
        destination: params.destination,
        check_in: params.check_in,
        check_out: params.check_out,
        guests: params.guests,
        rooms: params.rooms,
      },
    });
    return { properties: data.properties as { id: string; name: string }[] };
  },
});
