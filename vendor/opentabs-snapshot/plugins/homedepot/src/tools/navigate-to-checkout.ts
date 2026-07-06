import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

const CHECKOUT_URL = 'https://www.homedepot.com/mycart/home';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Go to Checkout',
  description:
    'Navigate the browser to the Home Depot cart/checkout page so the user can review items and complete their purchase.',
  summary: 'Navigate to the checkout page',
  icon: 'credit-card',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether navigation was initiated'),
    url: z.string().describe('The checkout URL navigated to'),
  }),
  handle: async () => {
    window.location.href = CHECKOUT_URL;
    return { success: true, url: CHECKOUT_URL };
  },
});
