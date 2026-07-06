import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToProduct = defineTool({
  name: 'navigate_to_product',
  displayName: 'Go to Product',
  description:
    'Navigate the browser to a Home Depot product page. Accepts a product URL path from search results or product details.',
  summary: 'Navigate to a product page',
  icon: 'external-link',
  group: 'Products',
  input: z.object({
    url: z.string().describe('Product URL path (e.g., "/p/DEWALT-20V-MAX-Cordless-Drill-DCD771C2/205440279")'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation was initiated'),
    url: z.string().describe('The full URL navigated to'),
  }),
  handle: async params => {
    const fullUrl = params.url.startsWith('http')
      ? params.url
      : `https://www.homedepot.com${params.url.startsWith('/') ? '' : '/'}${params.url}`;

    window.location.href = fullUrl;
    return { success: true, url: fullUrl };
  },
});
