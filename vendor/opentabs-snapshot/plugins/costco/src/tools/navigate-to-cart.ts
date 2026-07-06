import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToCart = defineTool({
  name: 'navigate_to_cart',
  displayName: 'Navigate to Cart',
  description: 'Navigate the browser to the Costco shopping cart page where the user can view and manage cart items.',
  summary: 'Open the shopping cart page',
  icon: 'shopping-cart',
  group: 'Navigation',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
    url: z.string().describe('URL navigated to'),
  }),
  handle: async () => {
    const url = 'https://www.costco.com/OrderByItemsDisplayView?storeId=10301&langId=-1&catalogId=10701';
    window.location.href = url;
    return { success: true, url };
  },
});
