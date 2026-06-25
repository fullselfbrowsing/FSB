// Vendored metadata slice (OpenTabs SHA 4b170216). Wall 1: handle() NEVER executed.
import { defineTool } from '../sdk-stub.js';
import { z } from 'zod';
import { api } from '../ebay-api.js';

export const placeBid = defineTool({
  name: 'place_bid',
  displayName: 'Place Bid',
  description:
    'Place a bid on an eBay auction listing. A winning bid is a binding obligation to pay -- this can charge your saved payment method if you win, a real money-moving action.',
  summary: 'bid on an ebay auction',
  icon: 'gavel',
  group: 'Marketplace',
  input: z.object({
    listing_id: z.string().min(1).describe('The auction listing ID to bid on'),
    max_bid: z.number().positive().describe('Your maximum bid amount in dollars'),
  }),
  output: z.object({
    bid: z.object({
      id: z.string(),
      amount: z.number(),
      status: z.string(),
    }).describe('The placed bid'),
  }),
  handle: async (params: { listing_id: string; max_bid: number }) => {
    // NEVER executed by the importer. Upstream: api POST /v1/listings/:id/bids -- PLACES
    // a bid (place -> a PAYMENT-bearing WRITE; the {method:'POST'} literal reinforces
    // write on both axes -- a winning bid is a binding obligation to pay). backing:'dom'
    // keeps it DOM-only (not API-invocable).
    const data = await api<{ bid: { id: string; amount: number; status: string } }>(
      `/v1/listings/${params.listing_id}/bids`,
      { method: 'POST', body: { max_bid: params.max_bid } }
    );
    return { bid: data.bid };
  },
});
