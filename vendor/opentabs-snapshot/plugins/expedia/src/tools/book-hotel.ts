// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../expedia-api.js';

export const bookHotel = defineTool({
  name: 'book_hotel',
  displayName: 'Book Hotel',
  description:
    'Book a paid Expedia hotel: confirm a selected hotel and room for the chosen dates and guests. This charges your saved payment method and reserves the room -- a real money-moving action.',
  summary: 'book a hotel on expedia',
  icon: 'building',
  group: 'Hotels',
  input: z.object({
    hotel_id: z.string().min(1).describe('The hotel to book'),
    room_id: z.string().min(1).describe('The selected room option'),
    check_in: z.string().min(1).describe('Check-in date (YYYY-MM-DD)'),
    check_out: z.string().min(1).describe('Check-out date (YYYY-MM-DD)'),
    guests: z.number().int().min(1).describe('Number of guests'),
  }),
  output: z.object({
    reservation: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The confirmed hotel reservation'),
  }),
  handle: async (params: { hotel_id: string; room_id: string; check_in: string; check_out: string; guests: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/hotels/book -- BOOKS (charges)
    // the hotel (book -> verbPrefix 'book' is in the guard's PAYMENT_VERBS set + book_hotel is
    // in PAYMENT_OP_NAMES -> a payment op; 'book' is NOT a side-effect WRITE_VERB, so the
    // {method:'POST'} literal is REQUIRED to class it write). backing:'dom' keeps it DOM-only.
    const data = await api<{ reservation: { id: string; total: number; status: string } }>('/v1/hotels/book', {
      method: 'POST',
      body: {
        hotel_id: params.hotel_id,
        room_id: params.room_id,
        check_in: params.check_in,
        check_out: params.check_out,
        guests: params.guests,
      },
    });
    return { reservation: data.reservation };
  },
});
