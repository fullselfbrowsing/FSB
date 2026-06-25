import { defineTool, getPageGlobal, ToolError } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { addToCartRest, getStoreId } from '../homedepot-api.js';

export const addToCart = defineTool({
  name: 'add_to_cart',
  displayName: 'Add to Cart',
  description:
    'Add a product to the Home Depot shopping cart by item ID. Falls back to the page-level cart API if the REST endpoint is unavailable.',
  summary: 'Add a product to cart',
  icon: 'plus-circle',
  group: 'Cart',
  input: z.object({
    item_id: z.string().describe('Product item ID to add'),
    quantity: z.number().int().min(1).optional().describe('Quantity to add (defaults to 1)'),
    store_id: z.string().optional().describe('Store ID for fulfillment'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the item was added successfully'),
    message: z.string().describe('Result message'),
  }),
  handle: async params => {
    const storeId = params.store_id || getStoreId();
    const quantity = params.quantity ?? 1;

    // Try REST API first
    try {
      await addToCartRest({
        itemId: params.item_id,
        quantity,
        storeId,
        fulfillmentMethod: 'BOPIS',
      });
      return { success: true, message: 'Item added to cart' };
    } catch {
      // REST endpoint is flaky — fall back to page global
    }

    // Fall back to THDCart global
    const THDCart = getPageGlobal('THDCart') as { addToCart?: (body: unknown) => Promise<unknown> } | undefined;

    if (THDCart?.addToCart) {
      await THDCart.addToCart([{ itemId: params.item_id, quantity }]);
      return { success: true, message: 'Item added to cart' };
    }

    throw ToolError.internal('Unable to add item to cart — neither the REST API nor the page cart API is available');
  },
});
