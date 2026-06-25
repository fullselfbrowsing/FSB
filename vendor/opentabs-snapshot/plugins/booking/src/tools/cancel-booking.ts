// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { apiVoid } from '../booking-api.js';

export const cancelBooking = defineTool({
  name: 'cancel_booking',
  displayName: 'Cancel Booking',
  description: 'Cancel a Booking.com reservation by its ID. This may be irreversible and may incur a cancellation fee depending on the rate.',
  summary: 'cancel my booking reservation',
  icon: 'x-circle',
  group: 'Bookings',
  input: z.object({
    booking_id: z.string().min(1).describe('The booking ID to cancel'),
    reason: z.string().optional().describe('Optional cancellation reason'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the booking was successfully cancelled'),
  }),
  handle: async (params: { booking_id: string; reason?: string }) => {
    // NEVER executed by the importer. Upstream: apiVoid DELETE /v1/bookings/:id
    // (cancel -> DESTRUCTIVE via the shared verb set; apiVoid {method:'DELETE'} -> apiDelete/destructive).
    await apiVoid(`/v1/bookings/${params.booking_id}`, { method: 'DELETE', body: { reason: params.reason } });
    return { success: true };
  },
});
