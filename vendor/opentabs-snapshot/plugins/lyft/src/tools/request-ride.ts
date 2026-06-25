// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../lyft-api.js';

export const requestRide = defineTool({
  name: 'request_ride',
  displayName: 'Request Ride',
  description:
    'Request a paid Lyft ride: book a selected ride type from a pickup to a dropoff. This charges your saved payment method and dispatches a driver -- a real money-moving action.',
  summary: 'request a lyft ride',
  icon: 'navigation',
  group: 'Rides',
  input: z.object({
    pickup: z.string().min(1).describe('Pickup location or address'),
    dropoff: z.string().min(1).describe('Dropoff location or address'),
    ride_type_id: z.string().min(1).describe('The ride type to book'),
    payment_method_id: z.string().optional().describe('Optional payment method to charge'),
  }),
  output: z.object({
    ride: z.object({
      id: z.string(),
      status: z.string(),
      fare: z.number(),
    }).describe('The requested ride'),
  }),
  handle: async (params: { pickup: string; dropoff: string; ride_type_id: string; payment_method_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/rides -- REQUESTS (charges)
    // the ride (request -> the PAYMENT WRITE; the {method:'POST'} literal reinforces
    // write on both axes). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ ride: { id: string; status: string; fare: number } }>('/v1/rides', {
      method: 'POST',
      body: {
        pickup: params.pickup,
        dropoff: params.dropoff,
        ride_type_id: params.ride_type_id,
        payment_method_id: params.payment_method_id,
      },
    });
    return { ride: data.ride };
  },
});
