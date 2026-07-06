import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { wapi } from '../craigslist-api.js';
import { mapPaymentCard, paymentCardSchema } from './schemas.js';
import type { RawPaymentCard } from './schemas.js';

export const listPaymentCards = defineTool({
  name: 'list_payment_cards',
  displayName: 'List Payment Cards',
  description:
    'List all saved payment cards on the Craigslist account. Returns card type, last four digits, expiration, billing address, and default status.',
  summary: 'List saved payment cards',
  icon: 'credit-card',
  group: 'Billing',
  input: z.object({}),
  output: z.object({
    cards: z.array(paymentCardSchema).describe('List of payment cards'),
    canBulkPost: z.boolean().describe('Whether the account can use bulk posting'),
  }),
  handle: async () => {
    const resp = await wapi<{ items: RawPaymentCard[]; can_bulk_post: boolean }>('/user/billing/payment-cards');
    return {
      cards: (resp.data.items ?? []).map(mapPaymentCard),
      canBulkPost: resp.data.can_bulk_post ?? false,
    };
  },
});
