import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getReduxSlice } from '../starbucks-api.js';
import { mapPaymentMethod, paymentMethodSchema } from './schemas.js';

export const getPaymentMethods = defineTool({
  name: 'get_payment_methods',
  displayName: 'Get Payment Methods',
  description:
    "Get all payment methods in the user's Starbucks wallet including credit/debit cards, Apple Pay, Google Pay, and PayPal.",
  summary: 'List all payment methods in wallet',
  icon: 'wallet',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    payment_methods: z.array(paymentMethodSchema).describe('Payment instruments in wallet'),
  }),
  handle: async () => {
    interface WalletData {
      paymentInstruments?: Array<Record<string, unknown>>;
    }
    const data = getReduxSlice<WalletData>('wallet.data');
    return {
      payment_methods: (data?.paymentInstruments ?? []).map(p =>
        mapPaymentMethod(p as Parameters<typeof mapPaymentMethod>[0]),
      ),
    };
  },
});
