import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToSearch = defineTool({
  name: 'navigate_to_search',
  displayName: 'Navigate to Search',
  description: 'Navigate the browser to a Costco search results page for a given keyword.',
  summary: 'Open search results in the browser',
  icon: 'search',
  group: 'Navigation',
  input: z.object({
    keyword: z.string().describe('Search keyword'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
    url: z.string().describe('URL navigated to'),
  }),
  handle: async params => {
    const url = `https://www.costco.com/s?keyword=${encodeURIComponent(params.keyword)}`;
    window.location.href = url;
    return { success: true, url };
  },
});
