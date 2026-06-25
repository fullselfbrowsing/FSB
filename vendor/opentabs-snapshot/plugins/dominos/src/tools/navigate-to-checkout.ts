import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { requireActiveCart } from '../dominos-api.js';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Go to Checkout',
  description:
    "Navigate the browser to the Domino's checkout page so the user can review the order and place it. Call this after adding items to the cart.",
  summary: 'Open the checkout page to place your order',
  icon: 'external-link',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether navigation was initiated'),
  }),
  handle: async () => {
    requireActiveCart();
    window.location.href = 'https://www.dominos.com/checkout';
    return { success: true };
  },
});
