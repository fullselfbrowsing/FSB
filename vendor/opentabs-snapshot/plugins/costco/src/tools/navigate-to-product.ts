import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToProduct = defineTool({
  name: 'navigate_to_product',
  displayName: 'Navigate to Product',
  description:
    'Navigate the browser to a Costco product page by item number. The user can view full product details, images, and reviews.',
  summary: 'Open a product page in the browser',
  icon: 'external-link',
  group: 'Navigation',
  input: z.object({
    item_number: z.string().describe('Costco item number'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
    url: z.string().describe('URL navigated to'),
  }),
  handle: async params => {
    const url = `https://www.costco.com/.product.${params.item_number}.html`;
    window.location.href = url;
    return { success: true, url };
  },
});
