import { buildQueryString, defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPage, parseResultCount, parseSearchResults } from '../ebay-api.js';
import { mapSearchItem, searchItemSchema } from './schemas.js';

export const searchItems = defineTool({
  name: 'search_items',
  displayName: 'Search Items',
  description:
    'Search for items on eBay by keyword. Returns listings with title, price, condition, and shipping info. Supports filtering by category, condition, and price range. Results are paginated.',
  summary: 'Search for items on eBay',
  icon: 'search',
  group: 'Search',
  input: z.object({
    query: z.string().min(1).describe('Search keywords (e.g., "macbook pro", "vintage watch")'),
    category: z.string().optional().describe('Category ID to filter by (e.g., "175672" for Laptops)'),
    condition: z.enum(['new', 'used', 'refurbished']).optional().describe('Filter by item condition'),
    min_price: z.number().optional().describe('Minimum price in dollars'),
    max_price: z.number().optional().describe('Maximum price in dollars'),
    sort: z
      .enum(['best_match', 'price_asc', 'price_desc', 'ending_soonest', 'newly_listed'])
      .optional()
      .describe('Sort order (default: best_match)'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
  }),
  output: z.object({
    total_results: z.number().describe('Approximate total number of matching items'),
    items: z.array(searchItemSchema).describe('List of matching items'),
  }),
  handle: async params => {
    const conditionMap: Record<string, string> = {
      new: '1000',
      used: '3000',
      refurbished: '2000|2500',
    };

    const sortMap: Record<string, string> = {
      best_match: '12',
      price_asc: '15',
      price_desc: '16',
      ending_soonest: '1',
      newly_listed: '10',
    };

    const query: Record<string, string | number | boolean | undefined> = {
      _nkw: params.query,
      _sacat: params.category ?? '0',
      _sop: params.sort ? sortMap[params.sort] : undefined,
      _pgn: params.page,
      _udlo: params.min_price,
      _udhi: params.max_price,
      LH_ItemCondition: params.condition ? conditionMap[params.condition] : undefined,
    };

    const qs = buildQueryString(query);
    const url = `https://www.ebay.com/sch/i.html?${qs}`;
    const html = await fetchPage(url);

    const rawItems = parseSearchResults(html);
    const totalResults = parseResultCount(html);

    return {
      total_results: totalResults,
      items: rawItems.map(mapSearchItem),
    };
  },
});
