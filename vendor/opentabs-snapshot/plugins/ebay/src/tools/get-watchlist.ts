import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, parseWatchlist } from '../ebay-api.js';
import { mapWatchlistItem, watchlistItemSchema } from './schemas.js';

export const getWatchlist = defineTool({
  name: 'get_watchlist',
  displayName: 'Get Watchlist',
  description:
    "Get the authenticated user's eBay watchlist. Returns items being watched with their current price, title, and time remaining. Parses the My eBay watchlist HTML page.",
  summary: 'Get your eBay watchlist items',
  icon: 'list',
  group: 'Watchlist',
  input: z.object({}),
  output: z.object({
    items: z.array(watchlistItemSchema).describe('Watchlist items'),
  }),
  handle: async () => {
    const html = await fetchPage('https://www.ebay.com/mye/myebay/Watchlist');
    const rawItems = parseWatchlist(html);
    return { items: rawItems.map(mapWatchlistItem) };
  },
});
