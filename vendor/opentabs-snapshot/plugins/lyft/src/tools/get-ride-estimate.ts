// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../lyft-api.js';

export const getRideEstimate = defineTool({
  name: 'get_ride_estimate',
  displayName: 'Get Ride Estimate',
  description: 'Get the fare and ETA estimate for a single Lyft ride type between a pickup and dropoff.',
  summary: 'estimate a lyft fare',
  icon: 'calculator',
  group: 'Rides',
  input: z.object({
    pickup: z.string().min(1).describe('Pickup location or address'),
    dropoff: z.string().min(1).describe('Dropoff location or address'),
    ride_type_id: z.string().min(1).describe('The ride type to estimate'),
  }),
  output: z.object({
    fare: z.number().describe('Estimated fare in dollars'),
    eta_minutes: z.number().describe('Estimated minutes until pickup'),
  }),
  handle: async (params: { pickup: string; dropoff: string; ride_type_id: string }) => {
    // NEVER executed by the importer. Upstream: api GET /v1/ride-estimate (default method, read).
    const data = await api<{ fare: number; eta_minutes: number }>('/v1/ride-estimate', {
      method: 'GET',
      query: { pickup: params.pickup, dropoff: params.dropoff, ride_type_id: params.ride_type_id },
    });
    return { fare: data.fare, eta_minutes: data.eta_minutes };
  },
});
