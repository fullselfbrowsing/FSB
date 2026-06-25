// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../expedia-api.js';

export const bookFlight = defineTool({
  name: 'book_flight',
  displayName: 'Book Flight',
  description:
    'Book a paid Expedia flight: confirm a selected flight itinerary for the given passengers. This charges your saved payment method and tickets the flight -- a real money-moving action.',
  summary: 'book a flight on expedia',
  icon: 'plane',
  group: 'Flights',
  input: z.object({
    flight_id: z.string().min(1).describe('The flight itinerary to book'),
    passengers: z.array(z.object({
      full_name: z.string().describe('Passenger full name'),
      date_of_birth: z.string().describe('Passenger date of birth (YYYY-MM-DD)'),
    })).min(1).describe('The passengers to ticket'),
  }),
  output: z.object({
    itinerary: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The ticketed flight itinerary'),
  }),
  handle: async (params: { flight_id: string; passengers: { full_name: string; date_of_birth: string }[] }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/flights/book -- BOOKS (charges)
    // the flight (book -> verbPrefix 'book' is in the guard's PAYMENT_VERBS set + book_flight is
    // in PAYMENT_OP_NAMES -> a payment op; 'book' is NOT a side-effect WRITE_VERB, so the
    // {method:'POST'} literal is REQUIRED to class it write). backing:'dom' keeps it DOM-only.
    const data = await api<{ itinerary: { id: string; total: number; status: string } }>('/v1/flights/book', {
      method: 'POST',
      body: {
        flight_id: params.flight_id,
        passengers: params.passengers,
      },
    });
    return { itinerary: data.itinerary };
  },
});
