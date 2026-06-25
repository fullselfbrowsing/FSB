// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../expedia-api.js';

export const searchHotels = defineTool({
  name: 'search_hotels',
  displayName: 'Search Hotels',
  description:
    'Search Expedia for hotels in a destination for a set of dates and number of guests. Returns matching hotels with nightly prices.',
  summary: 'search hotels on expedia',
  icon: 'building',
  group: 'Hotels',
  input: z.object({
    destination: z.string().min(1).describe('City, region, or hotel name to search'),
    check_in: z.string().min(1).describe('Check-in date (YYYY-MM-DD)'),
    check_out: z.string().min(1).describe('Check-out date (YYYY-MM-DD)'),
    guests: z.number().int().min(1).optional().describe('Number of guests'),
  }),
  output: z.object({
    hotels: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Matching hotels'),
  }),
  handle: async (params: { destination: string; check_in: string; check_out: string; guests?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/hotels/search (default method).
    const data = await api<{ hotels: unknown[] }>('/v1/hotels/search', {
      query: {
        destination: params.destination,
        check_in: params.check_in,
        check_out: params.check_out,
        guests: params.guests,
      },
    });
    return { hotels: data.hotels as { id: string; name: string }[] };
  },
});
