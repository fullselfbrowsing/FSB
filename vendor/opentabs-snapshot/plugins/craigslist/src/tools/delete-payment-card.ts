import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { wapi } from '../craigslist-api.js';
import { mapPaymentCard, paymentCardSchema } from './schemas.js';
import type { RawPaymentCard } from './schemas.js';

export const deletePaymentCard = defineTool({
  name: 'delete_payment_card',
  displayName: 'Delete Payment Card',
  description: 'Delete a saved payment card from the Craigslist account. Requires the card ID from list_payment_cards.',
  summary: 'Delete a saved payment card',
  icon: 'trash-2',
  group: 'Billing',
  input: z.object({
    card_id: z.string().min(1).describe('Payment card ID to delete (from list_payment_cards)'),
  }),
  output: z.object({
    cards: z.array(paymentCardSchema).describe('Remaining payment cards after deletion'),
  }),
  handle: async params => {
    const resp = await wapi<{ items: RawPaymentCard[] }>(`/user/billing/payment-cards/${params.card_id}`, {
      method: 'DELETE',
    });
    return {
      cards: (resp.data.items ?? []).map(mapPaymentCard),
    };
  },
});
