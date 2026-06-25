import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToProduct = defineTool({
  name: 'navigate_to_product',
  displayName: 'Navigate to Product',
  description:
    'Navigate the browser to a Walmart product page by its US item ID. Useful for viewing the product in full detail or adding it to cart.',
  summary: 'Open a product page in the browser',
  icon: 'external-link',
  group: 'Products',
  input: z.object({
    us_item_id: z.string().describe('Walmart US item ID'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
  }),
  handle: async params => {
    window.location.href = `https://www.walmart.com/ip/item/${params.us_item_id}`;
    return { success: true };
  },
});
