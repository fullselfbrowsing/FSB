// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../opentable-api.js';

export const reserveTable = defineTool({
  name: 'reserve_table',
  displayName: 'Reserve Table',
  description:
    'Reserve a table at an OpenTable restaurant for a date, time, and party size. This holds your card against the reservation (a no-show or late cancellation may be charged) -- a money-adjacent action.',
  summary: 'reserve a table on opentable',
  icon: 'calendar-check',
  group: 'Reservations',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The restaurant to reserve at'),
    date: z.string().min(1).describe('Reservation date (YYYY-MM-DD)'),
    time: z.string().min(1).describe('Reservation time (HH:MM, 24h)'),
    party_size: z.number().int().min(1).describe('Number of diners'),
  }),
  output: z.object({
    reservation: z.object({
      id: z.string(),
      status: z.string(),
    }).describe('The confirmed reservation'),
  }),
  handle: async (params: { restaurant_id: string; date: string; time: string; party_size: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/reservations -- RESERVES (holds a card)
    // the table (reserve -> verbPrefix 'reserve' is in the guard's PAYMENT_VERBS set -> a payment op;
    // 'reserve' is NOT a side-effect WRITE_VERB, so the {method:'POST'} literal is REQUIRED to class it
    // write). backing:'dom' keeps it DOM-only on the unconditionally-sensitive origin (the guard passes).
    const data = await api<{ reservation: { id: string; status: string } }>('/v1/reservations', {
      method: 'POST',
      body: {
        restaurant_id: params.restaurant_id,
        date: params.date,
        time: params.time,
        party_size: params.party_size,
      },
    });
    return { reservation: data.reservation };
  },
});
