// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../dominos-api.js';

export const placeOrder = defineTool({
  name: 'place_order',
  displayName: 'Place Order',
  description:
    'Place a paid Domino’s order: submit a cart of menu items to a store for delivery or carryout. This charges your saved payment method -- a real money-moving action.',
  summary: 'order pizza on dominos',
  icon: 'shopping-cart',
  group: 'Orders',
  input: z.object({
    store_id: z.string().min(1).describe('The store to order from'),
    items: z.array(z.object({
      item_id: z.string().describe('Menu item ID'),
      quantity: z.number().int().min(1).describe('Quantity of this item'),
    })).min(1).describe('The cart items to order'),
    service: z.enum(['delivery', 'carryout']).describe('Delivery or carryout'),
    address: z.string().optional().describe('Delivery address (required for delivery)'),
    payment_method_id: z.string().optional().describe('Optional saved payment method ID to charge'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The placed order'),
  }),
  handle: async (params: { store_id: string; items: { item_id: string; quantity: number }[]; service: string; address?: string; payment_method_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /orders -- PLACES (charges) the order
    // (place -> the PAYMENT WRITE via the {method:'POST'} literal; 'place' in 39-01 PAYMENT_VERBS,
    // place_order in PAYMENT_OP_NAMES). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/orders', {
      method: 'POST',
      body: {
        store_id: params.store_id,
        items: params.items,
        service: params.service,
        address: params.address,
        payment_method_id: params.payment_method_id,
      },
    });
    return { order: data.order };
  },
});
