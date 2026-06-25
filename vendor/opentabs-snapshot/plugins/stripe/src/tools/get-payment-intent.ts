import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../stripe-api.js';
import { type RawPaymentIntent, mapPaymentIntent, paymentIntentSchema } from './schemas.js';

export const getPaymentIntent = defineTool({
  name: 'get_payment_intent',
  displayName: 'Get Payment Intent',
  description: 'Get detailed information about a specific payment intent by its ID.',
  summary: 'Get a payment intent by ID',
  icon: 'credit-card',
  group: 'Payments',
  input: z.object({
    payment_intent_id: z.string().describe('PaymentIntent ID (e.g., pi_xxx)'),
  }),
  output: z.object({ payment_intent: paymentIntentSchema }),
  handle: async params => {
    const data = await api<RawPaymentIntent>(`/payment_intents/${params.payment_intent_id}`);
    return { payment_intent: mapPaymentIntent(data) };
  },
});
