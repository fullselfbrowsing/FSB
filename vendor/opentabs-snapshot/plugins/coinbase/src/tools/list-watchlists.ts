import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../coinbase-api.js';
import { type RawWatchlist, mapWatchlist, watchlistSchema } from './schemas.js';

const QUERY = `query ListWatchlists {
  viewer {
    watchlists {
      edges {
        node {
          uuid name description
          items { uuid type createdAt }
        }
      }
    }
  }
}`;

interface Response {
  viewer: {
    watchlists: { edges: Array<{ node: RawWatchlist }> };
  };
}

export const listWatchlists = defineTool({
  name: 'list_watchlists',
  displayName: 'List Watchlists',
  description:
    'List all watchlists for the authenticated user. Each watchlist contains items (assets) the user is tracking. Items include their UUID and type but not full asset details — use get_asset_by_uuid for that.',
  summary: 'List all watchlists',
  icon: 'eye',
  group: 'Watchlists',
  input: z.object({}),
  output: z.object({
    watchlists: z.array(watchlistSchema).describe('List of watchlists'),
  }),
  handle: async () => {
    const data = await gql<Response>(QUERY);
    const edges = data.viewer.watchlists?.edges ?? [];
    return { watchlists: edges.map(e => mapWatchlist(e.node)) };
  },
});
