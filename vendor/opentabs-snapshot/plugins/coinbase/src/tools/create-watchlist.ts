import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';

const MUTATION = `mutation CreateWatchlist($input: CreateWatchlistInput!) {
  createWatchlist(input: $input) {
    __typename
  }
}`;

export const createWatchlist = defineTool({
  name: 'create_watchlist',
  displayName: 'Create Watchlist',
  description: 'Create a new empty watchlist with a given name. Use add_watchlist_item to add assets to it afterwards.',
  summary: 'Create a new watchlist',
  icon: 'list-plus',
  group: 'Watchlists',
  input: z.object({
    name: z.string().describe('Name for the new watchlist'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the operation succeeded'),
  }),
  handle: async params => {
    await gql(MUTATION, { input: { name: params.name } });
    return { success: true };
  },
});
