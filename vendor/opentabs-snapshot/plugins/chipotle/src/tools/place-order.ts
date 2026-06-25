// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../chipotle-api.js';

export const placeOrder = defineTool({
  name: 'place_order',
  displayName: 'Place Order',
  description:
    'Place a paid Chipotle order: submit a cart of menu items to a location for pickup or delivery. This charges your saved payment method -- a real money-moving action.',
  summary: 'place a chipotle order',
  icon: 'shopping-cart',
  group: 'Orders',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The location to order from'),
    items: z.array(z.object({
      item_id: z.string().describe('Menu item ID'),
      quantity: z.number().int().min(1).describe('Quantity of this item'),
    })).min(1).describe('The cart items to order'),
    fulfillment: z.enum(['pickup', 'delivery']).describe('Pickup or delivery'),
    payment_method_id: z.string().optional().describe('Optional saved payment method ID to charge'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The placed order'),
  }),
  handle: async (params: { restaurant_id: string; items: { item_id: string; quantity: number }[]; fulfillment: string; payment_method_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /orders -- PLACES (charges) the order
    // (place -> the PAYMENT WRITE via the {method:'POST'} literal; 'place' in 39-01 PAYMENT_VERBS,
    // place_order in PAYMENT_OP_NAMES). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/orders', {
      method: 'POST',
      body: {
        restaurant_id: params.restaurant_id,
        items: params.items,
        fulfillment: params.fulfillment,
        payment_method_id: params.payment_method_id,
      },
    });
    return { order: data.order };
  },
});
