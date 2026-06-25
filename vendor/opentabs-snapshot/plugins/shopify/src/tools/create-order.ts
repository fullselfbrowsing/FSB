// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../shopify-api.js';

export const createOrder = defineTool({
  name: 'create_order',
  displayName: 'Create Order',
  description:
    'Create a paid Shopify order: submit line items and a shipping address. This charges the saved payment method and dispatches the order -- a real money-moving action.',
  summary: 'create an order on shopify',
  icon: 'shopping-cart',
  group: 'Orders',
  input: z.object({
    line_items: z.array(z.object({
      variant_id: z.string().describe('The product variant ID'),
      quantity: z.number().int().min(1).describe('Quantity of this variant'),
    })).min(1).describe('The line items to order'),
    shipping_address: z.string().min(1).describe('The address to ship to'),
    payment_method_id: z.string().optional().describe('Optional saved payment method ID to charge'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The created order'),
  }),
  handle: async (params: { line_items: { variant_id: string; quantity: number }[]; shipping_address: string; payment_method_id?: string }) => {
    // NEVER executed by the importer. Upstream: api POST /admin/api/orders -- CREATES (charges)
    // the order (create_order -> the PAYMENT WRITE; in 39-01 PAYMENT_OP_NAMES; the {method:'POST'}
    // literal reinforces write on both axes). backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>('/admin/api/orders', {
      method: 'POST',
      body: {
        line_items: params.line_items,
        shipping_address: params.shipping_address,
        payment_method_id: params.payment_method_id,
      },
    });
    return { order: data.order };
  },
});
