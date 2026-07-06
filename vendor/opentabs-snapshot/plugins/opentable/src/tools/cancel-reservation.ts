// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../opentable-api.js';

export const cancelReservation = defineTool({
  name: 'cancel_reservation',
  displayName: 'Cancel Reservation',
  description: 'Cancel an OpenTable reservation by its ID. A late cancellation may incur a charge per the restaurant policy.',
  summary: 'cancel my opentable reservation',
  icon: 'x-circle',
  group: 'Reservations',
  input: z.object({
    reservation_id: z.string().min(1).describe('The reservation ID to cancel'),
    reason: z.string().optional().describe('Optional cancellation reason'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the reservation was successfully cancelled'),
  }),
  handle: async (params: { reservation_id: string; reason?: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /v1/reservations/:id
    // (cancel -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/v1/reservations/${params.reservation_id}`, { method: 'DELETE', body: { reason: params.reason } });
    return { success: true };
  },
});
