import { defineTool, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData } from '../walmart-api.js';
import { mapSearchItem, type RawSearchItem, searchItemSchema } from './schemas.js';

const SORT_MAP: Record<string, string> = {
  best_match: 'best_match',
  price_low: 'price_asc',
  price_high: 'price_desc',
  best_seller: 'best_seller',
  new: 'new',
  rating_high: 'rating_high',
};

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    'Search for products on Walmart by keyword. Returns up to 40 products per page with prices, ratings, and availability. Supports pagination and sorting.',
  summary: 'Search for products on Walmart',
  icon: 'search',
  group: 'Products',
  input: z.object({
    query: z.string().describe('Search keywords'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    sort: z
      .enum(['best_match', 'price_low', 'price_high', 'best_seller', 'new', 'rating_high'])
      .optional()
      .describe('Sort order (default "best_match")'),
  }),
  output: z.object({
    items: z.array(searchItemSchema),
    total_results: z.number().int().describe('Total matching products'),
    max_page: z.number().int().describe('Maximum page number'),
    current_page: z.number().int().describe('Current page number'),
  }),
  handle: async params => {
    const page = params.page ?? 1;
    const sort = SORT_MAP[params.sort ?? 'best_match'] ?? 'best_match';

    const data = await fetchPageData('/search', {
      q: params.query,
      page,
      sort,
    });

    const initialData = data.initialData as Record<string, unknown> | undefined;
    const searchResult = initialData?.searchResult as Record<string, unknown> | undefined;

    if (!searchResult) {
      throw ToolError.internal('No search results found in page data.');
    }

    const itemStacks = searchResult.itemStacks as Array<Record<string, unknown>> | undefined;
    const rawItems = (itemStacks?.[0]?.items ?? []) as RawSearchItem[];

    const items = rawItems.filter(i => i.usItemId).map(mapSearchItem);

    const paginationV2 = searchResult.paginationV2 as Record<string, unknown> | undefined;
    const maxPage = (paginationV2?.maxPage as number) ?? 1;
    const totalResults = (searchResult.count as number) ?? items.length;

    return {
      items,
      total_results: totalResults,
      max_page: maxPage,
      current_page: page,
    };
  },
});
