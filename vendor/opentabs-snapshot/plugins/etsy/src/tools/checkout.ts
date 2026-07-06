// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../etsy-api.js';

export const checkout = defineTool({
  name: 'checkout',
  displayName: 'Checkout',
  description:
    'Check out your Etsy cart: submit the cart for payment to a shipping address. This charges your saved payment method and commits the order -- a real money-moving action.',
  summary: 'checkout my etsy cart',
  icon: 'credit-card',
  group: 'Cart',
  input: z.object({
    shipping_address: z.string().min(1).describe('The address to ship to'),
    payment_method_id: z.string().optional().describe('Optional saved payment method ID to charge'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The placed order'),
  }),
  handle: async (params: { shipping_address: string; payment_method_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/cart/checkout -- CHECKS OUT
    // the cart (checkout -> the PAYMENT WRITE; the {method:'POST'} literal reinforces
    // write on both axes -- a checkout charges the saved payment method). backing:'dom'
    // keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/v1/cart/checkout', {
      method: 'POST',
      body: { shipping_address: params.shipping_address, payment_method_id: params.payment_method_id },
    });
    return { order: data.order };
  },
});
