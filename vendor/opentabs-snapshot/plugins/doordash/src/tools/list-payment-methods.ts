import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../doordash-api.js';
import { paymentMethodSchema, mapPaymentMethod } from './schemas.js';

const QUERY = `query getPaymentMethodList {
  getPaymentMethodList {
    id isDefault type last4 expYear expMonth
    metadata { isDashCard isHsaFsaCard paypalAccount }
  }
}`;

interface PaymentMethodsResponse {
  getPaymentMethodList: Array<Record<string, unknown>>;
}

export const listPaymentMethods = defineTool({
  name: 'list_payment_methods',
  displayName: 'List Payment Methods',
  description:
    'List all saved payment methods on the DoorDash account. Returns card type, last 4 digits, expiration date, and whether the card is the default.',
  summary: 'List your saved payment methods',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({ payment_methods: z.array(paymentMethodSchema).describe('Saved payment methods') }),
  handle: async () => {
    const data = await gql<PaymentMethodsResponse>('getPaymentMethodList', QUERY);
    return { payment_methods: (data.getPaymentMethodList ?? []).map(mapPaymentMethod) };
  },
});
