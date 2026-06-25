// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ebay-api.js';

export const buyNow = defineTool({
  name: 'buy_now',
  displayName: 'Buy It Now',
  description:
    'Buy an eBay fixed-price listing immediately (Buy It Now): submit the purchase to a shipping address. This charges your saved payment method and commits the order -- a real money-moving action.',
  summary: 'buy it now on ebay',
  icon: 'shopping-bag',
  group: 'Marketplace',
  input: z.object({
    listing_id: z.string().min(1).describe('The fixed-price listing ID to buy'),
    quantity: z.number().int().min(1).optional().describe('Quantity to buy (default 1)'),
    shipping_address: z.string().min(1).describe('The address to ship to'),
  }),
  output: z.object({
    order: z.object({
      id: z.string(),
      total: z.number(),
      status: z.string(),
    }).describe('The placed order'),
  }),
  handle: async (params: { listing_id: string; quantity?: number; shipping_address: string }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/listings/:id/buy -- BUYS
    // the item immediately (buy -> the PAYMENT WRITE; the {method:'POST'} literal
    // reinforces write on both axes -- a Buy It Now charges the saved payment method).
    // backing:'dom' keeps it DOM-only (not API-invocable).
    const data = await api<{ order: { id: string; total: number; status: string } }>(
      `/v1/listings/${params.listing_id}/buy`,
      { method: 'POST', body: { quantity: params.quantity, shipping_address: params.shipping_address } }
    );
    return { order: data.order };
  },
});
