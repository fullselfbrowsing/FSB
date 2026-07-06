// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ticketmaster-api.js';

export const buyTickets = defineTool({
  name: 'buy_tickets',
  displayName: 'Buy Tickets',
  description:
    'Buy tickets to a Ticketmaster event for a given quantity and price level. This charges your saved payment method and issues the tickets -- a money-movement action.',
  summary: 'buy tickets on ticketmaster',
  icon: 'credit-card',
  group: 'Orders',
  input: z.object({
    event_id: z.string().min(1).describe('The event to buy tickets for'),
    quantity: z.number().int().min(1).describe('Number of tickets to buy'),
    price_level: z.string().optional().describe('Seating section or price level'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      status: z.string(),
    }).describe('The confirmed ticket order'),
  }),
  handle: async (params: { event_id: string; quantity: number; price_level?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /orders -- BUYS (charges your card)
    // the tickets (buy -> verbPrefix 'buy' is in the guard's PAYMENT_VERBS set AND 'buy_tickets'
    // is in PAYMENT_OP_NAMES -> a payment op; 'buy' is NOT a side-effect WRITE_VERB, so the
    // {method:'POST'} literal is REQUIRED to class it write). backing:'dom' keeps it DOM-only on
    // the sensitive ticketmaster origin (the payment-op guard passes via DOM-only-on-sensitive).
    const data = await api<{ order: { id: string; status: string } }>('/orders', {
      method: 'POST',
      body: {
        event_id: params.event_id,
        quantity: params.quantity,
        price_level: params.price_level,
      },
    });
    return { order: data.order };
  },
});
