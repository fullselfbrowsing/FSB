import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Navigate to Checkout',
  description:
    'Navigate the browser to the Target checkout page so the user can review the order, select payment, and complete the purchase. Call this after adding items to the cart.',
  summary: 'Go to checkout to complete purchase',
  icon: 'credit-card',
  group: 'Cart',
  input: z.object({}),
  output: z.object({ success: z.boolean().describe('Whether navigation succeeded') }),
  handle: async () => {
    window.location.href = 'https://www.target.com/co-cart';
    return { success: true };
  },
});
