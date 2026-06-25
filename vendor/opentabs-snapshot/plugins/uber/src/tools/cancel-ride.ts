// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../uber-api.js';

export const cancelRide = defineTool({
  name: 'cancel_ride',
  displayName: 'Cancel Ride',
  description: 'Cancel an in-progress Uber ride by its trip ID. A cancellation fee may apply once a driver is en route.',
  summary: 'cancel my uber ride',
  icon: 'x-circle',
  group: 'Rides',
  input: z.object({
    trip_id: z.string().min(1).describe('The trip ID to cancel'),
    reason: z.string().optional().describe('Optional cancellation reason'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the ride was successfully cancelled'),
  }),
  handle: async (params: { trip_id: string; reason?: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /v1/rides/:id
    // (cancel -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/v1/rides/${params.trip_id}`, { method: 'DELETE', body: { reason: params.reason } });
    return { success: true };
  },
});
