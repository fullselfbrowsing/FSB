import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Navigate to Checkout',
  description:
    'Navigate the browser to the Starbucks cart/checkout page so the user can review the order and place it. Call this after adding items to the cart.',
  summary: 'Go to cart page for checkout',
  icon: 'shopping-bag',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    navigated: z.boolean().describe('Whether navigation was initiated'),
  }),
  handle: async () => {
    window.location.href = '/menu/cart';
    return { navigated: true };
  },
});
