import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { getReduxSlice } from '../starbucks-api.js';
import { mapSvcCard, svcCardSchema } from './schemas.js';

export const getCards = defineTool({
  name: 'get_cards',
  displayName: 'Get Starbucks Cards',
  description:
    'Get all Starbucks gift/stored value cards on the account including balance, card number, and primary card status.',
  summary: 'List all Starbucks cards and balances',
  icon: 'credit-card',
  group: 'Account',
  input: z.object({}),
  output: z.object({
    cards: z.array(svcCardSchema).describe('Starbucks stored value cards'),
  }),
  handle: async () => {
    const data = getReduxSlice<Array<Record<string, unknown>>>('svcCards.data');
    return {
      cards: (data ?? []).map(c => mapSvcCard(c as Parameters<typeof mapSvcCard>[0])),
    };
  },
});
