// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airbnb-api.js';

export const searchListings = defineTool({
  name: 'search_listings',
  displayName: 'Search Listings',
  description:
    'Search Airbnb for listings (homes, rooms, experiences) in a destination for a set of dates and number of guests. Returns matching listings with nightly prices.',
  summary: 'search listings on airbnb',
  icon: 'home',
  group: 'Listings',
  input: z.object({
    destination: z.string().min(1).describe('City, region, or area to search'),
    check_in: z.string().optional().describe('Check-in date (YYYY-MM-DD)'),
    check_out: z.string().optional().describe('Check-out date (YYYY-MM-DD)'),
    guests: z.number().int().min(1).optional().describe('Number of guests'),
  }),
  output: z.object({
    listings: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })).describe('Matching listings'),
  }),
  handle: async (params: { destination: string; check_in?: string; check_out?: string; guests?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v2/listings/search (default method).
    const data = await api<{ listings: unknown[] }>('/v2/listings/search', {
      query: {
        destination: params.destination,
        check_in: params.check_in,
        check_out: params.check_out,
        guests: params.guests,
      },
    });
    return { listings: data.listings as { id: string; title: string }[] };
  },
});
