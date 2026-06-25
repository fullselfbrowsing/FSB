// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../instacart-api.js';

export const checkout = defineTool({
  name: 'checkout',
  displayName: 'Checkout',
  description:
    'Check out a paid Instacart cart: submit the cart of grocery items from a store to a delivery address. This charges your saved payment method and places the order -- a real money-moving action.',
  summary: 'checkout my instacart cart',
  icon: 'credit-card',
  group: 'Orders',
  input: z.object({
    store_id: z.string().min(1).describe('The store the cart is from'),
    items: z.array(z.object({
      product_id: z.string().describe('Product ID'),
      quantity: z.number().int().min(1).describe('Quantity of this product'),
    })).min(1).describe('The cart items to check out'),
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
  handle: async (params: { store_id: string; items: { product_id: string; quantity: number }[]; delivery_address: string; tip_amount?: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/checkout -- CHECKS OUT
    // (charges) the cart (checkout -> the PAYMENT WRITE; the {method:'POST'} literal
    // reinforces write on both axes). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/v1/checkout', {
      method: 'POST',
      body: {
        store_id: params.store_id,
        items: params.items,
        delivery_address: params.delivery_address,
        tip_amount: params.tip_amount,
      },
    });
    return { order: data.order };
  },
});
