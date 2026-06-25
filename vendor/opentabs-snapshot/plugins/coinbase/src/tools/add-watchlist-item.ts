import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';

const MUTATION = `mutation AddWatchlistItem($input: AddWatchlistItemInput!) {
  addWatchlistItem(input: $input) {
    __typename
  }
}`;

export const addWatchlistItem = defineTool({
  name: 'add_watchlist_item',
  displayName: 'Add Watchlist Item',
  description:
    'Add an asset to a watchlist by providing the watchlist UUID and the asset UUID. Use list_watchlists to find watchlist UUIDs and get_asset_by_symbol/slug to find asset UUIDs.',
  summary: 'Add an asset to a watchlist',
  icon: 'plus',
  group: 'Watchlists',
  input: z.object({
    watchlist_uuid: z.string().describe('Watchlist UUID (from list_watchlists)'),
    asset_uuid: z.string().describe('Asset UUID to add'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await gql(MUTATION, {
      input: {
        watchlistUuid: params.watchlist_uuid,
        assetUuid: params.asset_uuid,
      },
    });
    return { success: true };
  },
});
