import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, parseItemDetail } from '../ebay-api.js';
import { itemDetailSchema, mapItemDetail } from './schemas.js';

export const getItem = defineTool({
  name: 'get_item',
  displayName: 'Get Item',
  description:
    'Get detailed information about a specific eBay item by its item ID. Returns title, price, condition, images, seller info, shipping details, and return policy. Uses JSON-LD structured data embedded in the item page.',
  summary: 'Get details for an eBay item listing',
  icon: 'package',
  group: 'Items',
  input: z.object({
    item_id: z.string().min(1).describe('eBay item ID (numeric string, e.g., "236495878573")'),
  }),
  output: z.object({ item: itemDetailSchema }),
  handle: async params => {
    const url = `https://www.ebay.com/itm/${params.item_id}`;
    const html = await fetchPage(url);
    const rawItem = parseItemDetail(html, params.item_id);
    return { item: mapItemDetail(rawItem) };
  },
});
