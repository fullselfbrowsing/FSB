import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { cardSchema, mapCard } from './schemas.js';

export const getSavedCards = defineTool({
  name: 'get_saved_cards',
  displayName: 'Get Saved Cards',
  description:
    'List saved payment cards on the customer account. Returns card type, last four digits, expiration, and whether the card is the default.',
  summary: 'List your saved payment cards',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    cards: z.array(cardSchema).describe('List of saved payment cards'),
    needs_password: z.boolean().describe('Whether a password is required to use saved cards'),
  }),
  handle: async () => {
    const data = await gql<{
      customerCardsV2: {
        cards: Array<Record<string, unknown>>;
        needPassword: boolean;
      };
    }>(
      'CustomerCardsV2',
      `query CustomerCardsV2 {
  customerCardsV2 {
    cards {
      id billingZip cardType expirationMonth expirationYear lastFour
      isExpired nickName isDefault
    }
    needPassword
  }
}`,
    );
    return {
      cards: (data.customerCardsV2?.cards ?? []).map(mapCard),
      needs_password: data.customerCardsV2?.needPassword ?? false,
    };
  },
});
