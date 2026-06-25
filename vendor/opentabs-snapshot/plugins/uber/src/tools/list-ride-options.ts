// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../uber-api.js';

export const listRideOptions = defineTool({
  name: 'list_ride_options',
  displayName: 'List Ride Options',
  description:
    'List the available Uber ride options (UberX, Comfort, XL, Black, ...) for a pickup and dropoff location.',
  summary: 'show me uber ride options',
  icon: 'car',
  group: 'Rides',
  input: z.object({
    pickup: z.string().min(1).describe('Pickup location or address'),
    dropoff: z.string().min(1).describe('Dropoff location or address'),
  }),
  output: z.object({
    options: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).describe('Available ride options'),
  }),
  handle: async (params: { pickup: string; dropoff: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/ride-options (default method).
    const data = await api<{ options: unknown[] }>('/v1/ride-options', {
      query: { pickup: params.pickup, dropoff: params.dropoff },
    });
    return { options: data.options as { id: string; name: string }[] };
  },
});
