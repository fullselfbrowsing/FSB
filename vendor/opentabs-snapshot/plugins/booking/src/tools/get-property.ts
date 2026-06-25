// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../booking-api.js';

export const getProperty = defineTool({
  name: 'get_property',
  displayName: 'Get Property',
  description: 'Get the full details, room options, and availability of a single Booking.com property by its ID.',
  summary: 'look up a booking property',
  icon: 'building',
  group: 'Stays',
  input: z.object({
    property_id: z.string().min(1).describe('The property ID to fetch'),
    check_in: z.string().optional().describe('Check-in date (YYYY-MM-DD) for live availability'),
    check_out: z.string().optional().describe('Check-out date (YYYY-MM-DD) for live availability'),
  }),
  output: z.object({
    property: z.object({
      id: z.string(),
      name: z.string(),
      rooms: z.array(z.object({ id: z.string(), name: z.string(), price: z.number() })),
    }).describe('The property detail + room options'),
  }),
  handle: async (params: { property_id: string; check_in?: string; check_out?: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/properties/:id (default method).
    const data = await api<{ property: { id: string; name: string; rooms: unknown[] } }>(
      `/v1/properties/${params.property_id}`,
      { query: { check_in: params.check_in, check_out: params.check_out } }
    );
    return { property: data.property as { id: string; name: string; rooms: { id: string; name: string; price: number }[] } };
  },
});
