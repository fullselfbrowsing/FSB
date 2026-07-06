import { defineTool, ToolError, getPageGlobal } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { extractSearchResults } from '../yelp-api.js';
import type { SearchPageData } from '../yelp-api.js';
import { businessSchema, mapBusiness } from './schemas.js';

export const getCurrentPageBusinesses = defineTool({
  name: 'get_current_page_businesses',
  displayName: 'Get Current Page Businesses',
  description:
    'Read the business listings from the currently displayed Yelp search results page. Must be called while the Yelp search results page is open in the browser. Returns all businesses shown on the current page with their details.',
  summary: 'Extract businesses from the current search results page',
  icon: 'list',
  group: 'Businesses',
  input: z.object({}),
  output: z.object({
    businesses: z.array(businessSchema).describe('Businesses on the current page'),
    total_results: z.number().int().describe('Total results available across all pages'),
    start: z.number().int().describe('Current page offset'),
    location: z.string().describe('Location query from the current search'),
    query: z.string().describe('Search query from the current search'),
  }),
  handle: async () => {
    const props = getPageGlobal('yelp.react_root_props') as SearchPageData | undefined;
    if (!props) {
      throw ToolError.internal('No Yelp page data found — navigate to a Yelp search results page first.');
    }

    const { items, totalResults, startResult } = extractSearchResults(props);

    const url = new URL(window.location.href);
    return {
      businesses: items.map(mapBusiness),
      total_results: totalResults,
      start: startResult,
      location: url.searchParams.get('find_loc') ?? '',
      query: url.searchParams.get('find_desc') ?? '',
    };
  },
});
