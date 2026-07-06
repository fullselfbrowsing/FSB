import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';

const MUTATION = `mutation DeleteWatchlist($input: DeleteWatchlistInput!) {
  deleteWatchlist(input: $input) {
    __typename
  }
}`;

export const deleteWatchlist = defineTool({
  name: 'delete_watchlist',
  displayName: 'Delete Watchlist',
  description: 'Delete a watchlist by its UUID. Use list_watchlists to find watchlist UUIDs.',
  summary: 'Delete a watchlist',
  icon: 'trash-2',
  group: 'Watchlists',
  input: z.object({
    watchlist_uuid: z.string().describe('UUID of the watchlist to delete'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await gql(MUTATION, { input: { watchlistUuid: params.watchlist_uuid } });
    return { success: true };
  },
});
