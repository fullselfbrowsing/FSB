// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../stubhub-api.js';

export const buyTickets = defineTool({
  name: 'buy_tickets',
  displayName: 'Buy Tickets',
  description:
    'Buy a StubHub resale ticket listing for a given quantity. This charges your saved payment method and transfers the tickets -- a money-movement action.',
  summary: 'buy tickets on stubhub',
  icon: 'credit-card',
  group: 'Orders',
  input: z.object({
    listing_id: z.string().min(1).describe('The resale listing to buy'),
    quantity: z.number().int().min(1).describe('Number of tickets to buy'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      status: z.string(),
    }).describe('The confirmed ticket order'),
  }),
  handle: async (params: { listing_id: string; quantity: number }) => {
    // NEVER executed by the importer. Upstream: api POST /orders -- BUYS (charges your card)
    // the resale tickets (buy -> verbPrefix 'buy' is in the guard's PAYMENT_VERBS set AND
    // 'buy_tickets' is in PAYMENT_OP_NAMES -> a payment op; 'buy' is NOT a side-effect WRITE_VERB,
    // so the {method:'POST'} literal is REQUIRED to class it write). backing:'dom' keeps it
    // DOM-only on the sensitive stubhub origin (the payment-op guard passes via DOM-only-on-sensitive).
    const data = await api<{ order: { id: string; status: string } }>('/orders', {
      method: 'POST',
      body: {
        listing_id: params.listing_id,
        quantity: params.quantity,
      },
    });
    return { order: data.order };
  },
});
