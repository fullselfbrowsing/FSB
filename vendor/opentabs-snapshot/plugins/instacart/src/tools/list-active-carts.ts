import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gqlQuery } from '../instacart-api.js';
import { type RawCart, cartSummarySchema, mapCartSummary } from './schemas.js';

export const listActiveCarts = defineTool({
  name: 'list_active_carts',
  displayName: 'List Active Carts',
  description:
    'List all active shopping carts across all retailers. Returns cart ID, item count, and retailer name for each cart.',
  summary: 'List all shopping carts',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    carts: z.array(cartSummarySchema).describe('Active carts'),
  }),
  handle: async () => {
    const data = await gqlQuery<{ userCarts: { carts?: RawCart[] } }>('PersonalActiveCarts');
    return {
      carts: (data.userCarts?.carts ?? []).map(mapCartSummary),
    };
  },
});
