import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { fetchPageData, extractSearchResults } from '../yelp-api.js';
import type { SearchPageData } from '../yelp-api.js';
import { businessSchema, mapBusiness } from './schemas.js';

export const searchBusinesses = defineTool({
  name: 'search_businesses',
  displayName: 'Search Businesses',
  description:
    'Search for businesses on Yelp by keyword and location. Returns up to 10 results per page with business name, rating, review count, price range, categories, phone, and address. Use the start parameter to paginate through results.',
  summary: 'Search for businesses by keyword and location',
  icon: 'search',
  group: 'Businesses',
  input: z.object({
    query: z.string().describe('Search keywords (e.g., "pizza", "plumber", "coffee shop")'),
    location: z.string().describe('Location to search near (e.g., "San Jose, CA", "10001", "Manhattan")'),
    start: z.number().int().min(0).optional().describe('Result offset for pagination (default 0, increment by 10)'),
    sort_by: z
      .enum(['recommended', 'rating', 'review_count'])
      .optional()
      .describe('Sort order (default "recommended")'),
    price: z
      .string()
      .optional()
      .describe(
        'Price filter — comma-separated levels: "1" ($), "2" ($$), "3" ($$$), "4" ($$$$). Example: "1,2" for $ and $$',
      ),
    open_now: z.boolean().optional().describe('Filter to only businesses that are currently open'),
  }),
  output: z.object({
    businesses: z.array(businessSchema).describe('List of matching businesses'),
    total_results: z.number().int().describe('Total number of results available'),
    start: z.number().int().describe('Current result offset'),
    results_per_page: z.number().int().describe('Number of results per page'),
  }),
  handle: async params => {
    const query: Record<string, string | number | boolean | undefined> = {
      find_desc: params.query,
      find_loc: params.location,
    };

    if (params.start) query.start = params.start;
    if (params.sort_by) query.sortby = params.sort_by;
    if (params.price) query.attrs = `RestaurantsPriceRange2.${params.price}`;
    if (params.open_now) query.open_now = true;

    const data = await fetchPageData<SearchPageData>('/search', query);
    const { items, totalResults, startResult, resultsPerPage } = extractSearchResults(data);

    return {
      businesses: items.map(mapBusiness),
      total_results: totalResults,
      start: startResult,
      results_per_page: resultsPerPage,
    };
  },
});
