// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../lyft-api.js';

export const listRideTypes = defineTool({
  name: 'list_ride_types',
  displayName: 'List Ride Types',
  description:
    'List the available Lyft ride types (Lyft, XL, Lux, Lux Black, ...) for a pickup and dropoff location.',
  summary: 'show me lyft ride types',
  icon: 'car',
  group: 'Rides',
  input: z.object({
    pickup: z.string().min(1).describe('Pickup location or address'),
    dropoff: z.string().min(1).describe('Dropoff location or address'),
  }),
  output: z.object({
    ride_types: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Available ride types'),
  }),
  handle: async (params: { pickup: string; dropoff: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/ride-types (default method).
    const data = await api<{ ride_types: unknown[] }>('/v1/ride-types', {
      query: { pickup: params.pickup, dropoff: params.dropoff },
    });
    return { ride_types: data.ride_types as { id: string; name: string }[] };
  },
});
