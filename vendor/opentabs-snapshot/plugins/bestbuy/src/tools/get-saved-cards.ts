import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { api } from '../bestbuy-api.js';
import { creditCardSchema, mapCreditCard, type RawCreditCard } from './schemas.js';

export const getSavedCards = defineTool({
  name: 'get_saved_cards',
  displayName: 'Get Saved Cards',
  description:
    'List all saved payment cards on the Best Buy account. Returns card type, last 4 digits, expiration date, cardholder name, billing address, and whether it is the default payment method.',
  summary: 'List saved payment cards',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    cards: z.array(creditCardSchema).describe('Saved payment cards'),
  }),
  handle: async () => {
    const data = await api<RawCreditCard[]>('/profile/rest/c/paymentinfo/creditcard/all');

    return { cards: (data ?? []).map(mapCreditCard) };
  },
});
