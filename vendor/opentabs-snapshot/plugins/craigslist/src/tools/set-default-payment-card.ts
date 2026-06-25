import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { wapi } from '../craigslist-api.js';
import { mapPaymentCard, paymentCardSchema } from './schemas.js';
import type { RawPaymentCard } from './schemas.js';

export const setDefaultPaymentCard = defineTool({
  name: 'set_default_payment_card',
  displayName: 'Set Default Payment Card',
  description:
    'Set a payment card as the default payment method for the Craigslist account. Requires the card ID from list_payment_cards.',
  summary: 'Set a card as the default payment method',
  icon: 'star',
  group: 'Billing',
  input: z.object({
    card_id: z.string().min(1).describe('Payment card ID to set as default (from list_payment_cards)'),
  }),
  output: z.object({
    cards: z.array(paymentCardSchema).describe('Updated payment cards'),
  }),
  handle: async params => {
    const body = new FormData();
    body.append('is_default', '1');
    const resp = await wapi<{ items: RawPaymentCard[] }>(`/user/billing/payment-cards/${params.card_id}`, {
      method: 'PATCH',
      body,
    });
    return {
      cards: (resp.data.items ?? []).map(mapPaymentCard),
    };
  },
});
