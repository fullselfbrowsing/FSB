import { defineTool, buildQueryString } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToSearch = defineTool({
  name: 'navigate_to_search',
  displayName: 'Navigate to Search',
  description:
    'Navigate the browser to a Yelp search results page for a given query and location. Opens the search results in the current tab.',
  summary: 'Open Yelp search results in the browser',
  icon: 'external-link',
  group: 'Navigation',
  input: z.object({
    query: z.string().describe('Search keywords (e.g., "pizza", "dentist", "coffee")'),
    location: z.string().describe('Location to search near (e.g., "San Jose, CA", "New York, NY")'),
    sort_by: z
      .enum(['recommended', 'rating', 'review_count'])
      .optional()
      .describe('Sort order (default "recommended")'),
  }),
  output: z.object({
    url: z.string().describe('The URL that was navigated to'),
  }),
  handle: async params => {
    const queryString = buildQueryString({
      find_desc: params.query,
      find_loc: params.location,
      sortby: params.sort_by,
    });
    const url = `https://www.yelp.com/search?${queryString}`;

    window.location.href = url;

    return { url };
  },
});
