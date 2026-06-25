// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../eventbrite-api.js';

export const registerForEvent = defineTool({
  name: 'register_for_event',
  displayName: 'Register for Event',
  description:
    'Register for an Eventbrite event by selecting a ticket type and quantity. For paid events this charges your saved payment method and issues the tickets -- a money-movement action.',
  summary: 'register for an event on eventbrite',
  icon: 'credit-card',
  group: 'Orders',
  input: z.object({
    event_id: z.string().min(1).describe('The event to register for'),
    ticket_type_id: z.string().min(1).describe('The ticket type to purchase'),
    quantity: z.number().int().min(1).describe('Number of tickets to register'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      status: z.string(),
    }).describe('The confirmed registration order'),
  }),
  handle: async (params: { event_id: string; ticket_type_id: string; quantity: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v3/events/:id/orders -- REGISTERS
    // (charges your card for a paid event) (register -> verbPrefix 'register' is in the guard's
    // PAYMENT_VERBS set AND 'register_for_event' is in PAYMENT_OP_NAMES -> a payment op;
    // 'register' is NOT a side-effect WRITE_VERB, so the {method:'POST'} literal is REQUIRED to
    // class it write). backing:'dom' keeps it DOM-only on the sensitive eventbrite origin (the
    // payment-op guard passes via DOM-only-on-sensitive).
    const data = await api<{ order: { id: string; status: string } }>(
      `/v3/events/${params.event_id}/orders`,
      {
        method: 'POST',
        body: {
          ticket_type_id: params.ticket_type_id,
          quantity: params.quantity,
        },
      }
    );
    return { order: data.order };
  },
});
