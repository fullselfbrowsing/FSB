import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawPaymentIntent, type StripeList, mapPaymentIntent, paymentIntentSchema } from './schemas.js';

export const listPaymentIntents = defineTool({
  name: 'list_payment_intents',
  displayName: 'List Payment Intents',
  description:
    'List payment intents in your Stripe account. Returns payment intents sorted by creation date (newest first).',
  summary: 'List payment intents with pagination',
  icon: 'credit-card',
  group: 'Payments',
  input: z.object({
    limit: z.number().int().min(1).max(100).optional().describe('Number of results (default 10, max 100)'),
    starting_after: z.string().optional().describe('PaymentIntent ID cursor for pagination'),
    customer: z.string().optional().describe('Filter by customer ID'),
  }),
  output: z.object({
    payment_intents: z.array(paymentIntentSchema).describe('List of payment intents'),
    has_more: z.boolean().describe('Whether more results exist'),
  }),
  handle: async params => {
    const data = await api<StripeList<RawPaymentIntent>>('/payment_intents', {
      query: { limit: params.limit, starting_after: params.starting_after, customer: params.customer },
    });
    return {
      payment_intents: (data.data ?? []).map(mapPaymentIntent),
      has_more: data.has_more ?? false,
    };
  },
});
