// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../airbnb-api.js';

export const bookStay = defineTool({
  name: 'book_stay',
  displayName: 'Book Stay',
  description:
    'Book a paid Airbnb stay: reserve a listing for the chosen dates and guests. This charges your saved payment method and confirms the reservation -- a real money-moving action.',
  summary: 'book a stay on airbnb',
  icon: 'calendar-check',
  group: 'Trips',
  input: z.object({
    listing_id: z.string().min(1).describe('The listing to book'),
    check_in: z.string().min(1).describe('Check-in date (YYYY-MM-DD)'),
    check_out: z.string().min(1).describe('Check-out date (YYYY-MM-DD)'),
    guests: z.number().int().min(1).describe('Number of guests'),
  }),
  output: z.object({
    reservation: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The confirmed reservation'),
  }),
  handle: async (params: { listing_id: string; check_in: string; check_out: string; guests: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v2/reservations -- BOOKS (charges)
    // the stay (book -> verbPrefix 'book' is in the guard's PAYMENT_VERBS set -> a payment op;
    // 'book' is NOT a side-effect WRITE_VERB, so the {method:'POST'} literal is REQUIRED to
    // class it write). backing:'dom' keeps it DOM-only (not API-invocable -> the guard passes).
    const data = await api<{ reservation: { id: string; total: number; status: string } }>('/v2/reservations', {
      method: 'POST',
      body: {
        listing_id: params.listing_id,
        check_in: params.check_in,
        check_out: params.check_out,
        guests: params.guests,
      },
    });
    return { reservation: data.reservation };
  },
});
