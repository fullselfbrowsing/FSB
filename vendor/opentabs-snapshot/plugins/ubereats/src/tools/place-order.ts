// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ubereats-api.js';

export const placeOrder = defineTool({
  name: 'place_order',
  displayName: 'Place Order',
  description:
    'Place a paid Uber Eats order: submit a cart of items from a restaurant to a delivery address. This charges your saved payment method and dispatches the order -- a real money-moving action.',
  summary: 'order food on ubereats',
  icon: 'shopping-cart',
  group: 'Orders',
  input: z.object({
    restaurant_id: z.string().min(1).describe('The restaurant to order from'),
    items: z.array(z.object({
      item_id: z.string().describe('Menu item ID'),
      quantity: z.number().int().min(1).describe('Quantity of this item'),
    })).min(1).describe('The cart items to order'),
    delivery_address: z.string().min(1).describe('The address to deliver to'),
    tip_amount: z.number().optional().describe('Optional tip amount in dollars'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The placed order'),
  }),
  handle: async (params: { restaurant_id: string; items: { item_id: string; quantity: number }[]; delivery_address: string; tip_amount?: number }) => {
    // NEVER executed by the importer. Upstream: api POST /eats/v1/orders -- PLACES
    // (charges) the order (place -> the PAYMENT WRITE; the {method:'POST'} literal
    // reinforces write on both axes). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/eats/v1/orders', {
      method: 'POST',
      body: {
        restaurant_id: params.restaurant_id,
        items: params.items,
        delivery_address: params.delivery_address,
        tip_amount: params.tip_amount,
      },
    });
    return { order: data.order };
  },
});
