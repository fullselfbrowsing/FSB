import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Navigate to Checkout',
  description:
    'Navigate the browser to the Walmart checkout page so the user can review the cart and complete payment.',
  summary: 'Navigate to checkout page',
  icon: 'credit-card',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether navigation succeeded'),
  }),
  handle: async () => {
    window.location.href = 'https://www.walmart.com/checkout';
    return { success: true };
  },
});
