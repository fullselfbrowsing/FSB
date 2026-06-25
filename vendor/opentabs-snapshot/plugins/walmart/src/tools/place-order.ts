// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../walmart-api.js';

export const placeOrder = defineTool({
  name: 'place_order',
  displayName: 'Place Order',
  description:
    'Place a paid Walmart order: submit a cart of products for shipping or in-store pickup. This charges your saved payment method and commits the order -- a real money-moving action.',
  summary: 'order this on walmart',
  icon: 'shopping-cart',
  group: 'Orders',
  input: z.object({
    items: z.array(z.object({
      product_id: z.string().describe('Product item ID'),
      quantity: z.number().int().min(1).describe('Quantity of this item'),
    })).min(1).describe('The cart items to order'),
    fulfillment: z.enum(['ship', 'pickup']).describe('Ship to an address or pick up in store'),
    shipping_address: z.string().optional().describe('The address to ship to (required when fulfillment is ship)'),
    payment_method_id: z.string().optional().describe('Optional saved payment method ID to charge'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The placed order'),
  }),
  handle: async (params: { items: { product_id: string; quantity: number }[]; fulfillment: string; shipping_address?: string; payment_method_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/orders -- PLACES (charges)
    // the order (place -> the PAYMENT WRITE; the {method:'POST'} literal reinforces
    // write on both axes). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/v1/orders', {
      method: 'POST',
      body: {
        items: params.items,
        fulfillment: params.fulfillment,
        shipping_address: params.shipping_address,
        payment_method_id: params.payment_method_id,
      },
    });
    return { order: data.order };
  },
});
