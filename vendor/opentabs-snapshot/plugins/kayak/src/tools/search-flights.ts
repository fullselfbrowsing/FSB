// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../kayak-api.js';

export const searchFlights = defineTool({
  name: 'search_flights',
  displayName: 'Search Flights',
  description:
    'Search KAYAK across providers for flights between an origin and destination on given dates. Returns matching fares from multiple airlines and agencies.',
  summary: 'find flights on kayak',
  icon: 'plane',
  group: 'Flights',
  input: z.object({
    origin: z.string().min(1).describe('Departure airport or city'),
    destination: z.string().min(1).describe('Arrival airport or city'),
    depart_date: z.string().min(1).describe('Departure date (YYYY-MM-DD)'),
    return_date: z.string().optional().describe('Return date (YYYY-MM-DD) for a round trip'),
    passengers: z.number().int().min(1).optional().describe('Number of passengers'),
  }),
  output: z.object({
    flights: z.array(z.object({
      id: z.string(),
      carrier: z.string(),
      fare: z.number(),
    })).describe('Matching fares across providers'),
  }),
  handle: async (params: { origin: string; destination: string; depart_date: string; return_date?: string; passengers?: number }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/flights/search (default method).
    const data = await api<{ flights: unknown[] }>('/v1/flights/search', {
      query: {
        origin: params.origin,
        destination: params.destination,
        depart_date: params.depart_date,
        return_date: params.return_date,
        passengers: params.passengers,
      },
    });
    return { flights: data.flights as { id: string; carrier: string; fare: number }[] };
  },
});
