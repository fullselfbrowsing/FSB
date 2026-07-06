import { defineTool, ToolError, waitForSelector } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';

export const navigateToCheckout = defineTool({
  name: 'navigate_to_checkout',
  displayName: 'Navigate to Checkout',
  description:
    'Open the Instacart cart panel so the user can review items, select delivery time, and proceed to checkout. Call this after adding items to the cart. The user completes payment manually in the browser.',
  summary: 'Open cart for checkout',
  icon: 'credit-card',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    success: z.boolean().describe('Whether the cart panel was opened'),
  }),
  handle: async () => {
    if (typeof document === 'undefined') {
      throw ToolError.internal('Not running in a browser context');
    }

    // Click the "View Cart" button to open the cart side panel
    const cartButton = document.querySelector<HTMLButtonElement>('button[aria-label*="View Cart"]');
    if (!cartButton) {
      throw ToolError.validation('Cart button not found. Make sure you are on the Instacart store page.');
    }

    cartButton.click();

    // Wait for the cart panel to appear
    try {
      await waitForSelector('[aria-label="Close Cart"]', { timeout: 5000 });
    } catch {
      // Cart may already be open
    }

    return { success: true };
  },
});
