import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const SORT_MAP: Record<string, string> = {
  best_match: 'best_match',
  price_low: 'price_asc',
  price_high: 'price_desc',
  best_seller: 'best_seller',
  new: 'new',
  rating_high: 'rating_high',
};

export const navigateToSearch = defineTool({
  name: 'navigate_to_search',
  displayName: 'Navigate to Search',
  description: 'Navigate the browser to Walmart search results for a query. Useful for browsing products visually.',
  summary: 'Open search results in the browser',
  icon: 'search',
  group: 'Products',
  input: z.object({
    query: z.string().describe('Search keywords'),
    sort: z
      .enum(['best_match', 'price_low', 'price_high', 'best_seller', 'new', 'rating_high'])
      .optional()
      .describe('Sort order (default "best_match")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
  }),
  handle: async params => {
    const sort = SORT_MAP[params.sort ?? 'best_match'] ?? 'best_match';
    window.location.href = `https://www.walmart.com/search?q=${encodeURIComponent(params.query)}&sort=${sort}`;
    return { success: true };
  },
});
