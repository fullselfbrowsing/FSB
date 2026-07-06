import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Navigate to Checkout',
  description:
    'Navigate the browser to the Costco checkout page where the user can review the order and complete payment. The user must complete the payment manually.',
  summary: 'Open the checkout page',
  icon: 'credit-card',
  group: 'Navigation',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
    url: z.string().describe('URL navigated to'),
  }),
  handle: async () => {
    const url = 'https://www.costco.com/CheckoutView?storeId=10301&langId=-1&catalogId=10701';
    window.location.href = url;
    return { success: true, url };
  },
});
