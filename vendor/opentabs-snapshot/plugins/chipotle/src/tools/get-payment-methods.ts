import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../chipotle-api.js';
import { type RawPaymentMethod, mapPaymentMethod, paymentMethodSchema } from './schemas.js';

export const getPaymentMethods = defineTool({
  name: 'get_payment_methods',
  displayName: 'Get Payment Methods',
  description:
    'List all saved payment methods on the Chipotle account including credit cards, debit cards, and gift cards with card type, last four digits, and expiration.',
  summary: 'List saved payment cards and gift cards',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    payment_methods: z.array(paymentMethodSchema).describe('Saved payment methods'),
  }),
  handle: async () => {
    const data = await api<RawPaymentMethod[]>('/transaction/v3/wallet/wallet');
    return { payment_methods: (data ?? []).map(mapPaymentMethod) };
  },
});
