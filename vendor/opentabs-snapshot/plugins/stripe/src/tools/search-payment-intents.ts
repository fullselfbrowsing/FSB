import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawPaymentIntent, type StripeList, mapPaymentIntent, paymentIntentSchema } from './schemas.js';

export const searchPaymentIntents = defineTool({
  name: 'search_payment_intents',
  displayName: 'Search Payment Intents',
  description:
    'Search payment intents using Stripe search syntax. Example queries: "status:\'succeeded\'", "customer:\'cus_xxx\'", "amount>1000".',
  summary: 'Search payment intents by query',
  icon: 'search',
  group: 'Payments',
  input: z.object({
    query: z.string().describe('Search query using Stripe search syntax'),
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
  }),
  output: z.object({
    payment_intents: z.array(paymentIntentSchema).describe('Matching payment intents'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawPaymentIntent>>('/payment_intents/search', {
      query: { query: params.query, limit: params.limit },
    });
    return {
      payment_intents: (data.data ?? []).map(mapPaymentIntent),
      has_more: data.has_more ?? false,
    };
  },
});
