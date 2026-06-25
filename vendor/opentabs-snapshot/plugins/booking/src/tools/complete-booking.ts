// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../booking-api.js';

export const completeBooking = defineTool({
  name: 'complete_booking',
  displayName: 'Complete Booking',
  description:
    'Complete a paid Booking.com reservation: confirm a selected property and room for the chosen dates and guests. This charges your saved payment method and books the stay -- a real money-moving action.',
  summary: 'complete my booking reservation',
  icon: 'check-circle',
  group: 'Bookings',
  input: z.object({
    property_id: z.string().min(1).describe('The property to book'),
    room_id: z.string().min(1).describe('The selected room option'),
    check_in: z.string().min(1).describe('Check-in date (YYYY-MM-DD)'),
    check_out: z.string().min(1).describe('Check-out date (YYYY-MM-DD)'),
    guests: z.number().int().min(1).describe('Number of guests'),
  }),
  output: z.object({
    booking: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The confirmed booking'),
  }),
  handle: async (params: { property_id: string; room_id: string; check_in: string; check_out: string; guests: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/bookings -- COMPLETES (charges)
    // the booking (complete -> a WRITE verb; complete_booking is in the guard's PAYMENT_OP_NAMES
    // set -> a payment op; the {method:'POST'} literal reinforces write on both axes).
    // backing:'dom' keeps it DOM-only (not API-invocable -> the payment-op guard passes).
    const data = await api<{ booking: { id: string; total: number; status: string } }>('/v1/bookings', {
      method: 'POST',
      body: {
        property_id: params.property_id,
        room_id: params.room_id,
        check_in: params.check_in,
        check_out: params.check_out,
        guests: params.guests,
      },
    });
    return { booking: data.booking };
  },
});
