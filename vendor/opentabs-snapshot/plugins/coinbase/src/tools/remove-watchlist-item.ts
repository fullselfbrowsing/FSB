import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';

const MUTATION = `mutation RemoveWatchlistItem($input: RemoveWatchlistItemInput!) {
  removeWatchlistItem(input: $input) {
    __typename
  }
}`;

export const removeWatchlistItem = defineTool({
  name: 'remove_watchlist_item',
  displayName: 'Remove Watchlist Item',
  description:
    'Remove an asset from a watchlist. Use list_watchlists to find the watchlist item UUID for the asset you want to remove.',
  summary: 'Remove an asset from a watchlist',
  icon: 'eye-off',
  group: 'Watchlists',
  input: z.object({
    watchlist_uuid: z.string().describe('Watchlist UUID (from list_watchlists)'),
    item_uuid: z.string().describe('Watchlist item UUID to remove (from the items array in list_watchlists)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await gql(MUTATION, {
      input: {
        watchlistUuid: params.watchlist_uuid,
        itemUuid: params.item_uuid,
      },
    });
    return { success: true };
  },
});
