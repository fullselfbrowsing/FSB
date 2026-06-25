import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { type WatchResponse, extractSrt, fetchJson, fetchPage } from '../ebay-api.js';

export const watchItem = defineTool({
  name: 'watch_item',
  displayName: 'Watch Item',
  description:
    "Add an item to the authenticated user's eBay watchlist. Requires the item ID. The tool fetches the item page to extract the required CSRF token, then calls the watch API.",
  summary: 'Add an item to your eBay watchlist',
  icon: 'eye',
  group: 'Watchlist',
  input: z.object({
    item_id: z.string().min(1).describe('eBay item ID to watch'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the item was added to the watchlist'),
    item_id: z.string().describe('The watched item ID'),
  }),
  handle: async params => {
    // Fetch the item page to extract the SRT (CSRF) token
    const itemHtml = await fetchPage(`https://www.ebay.com/itm/${params.item_id}`);
    const srt = extractSrt(itemHtml);

    const url = `https://www.ebay.com/mye/myebay/ajax/watch/watchInline?itemId=${params.item_id}&forceWatch=true&srt=${srt}`;
    const data = await fetchJson<WatchResponse>(url);

    return {
      success: data.status === true,
      item_id: params.item_id,
    };
  },
});
