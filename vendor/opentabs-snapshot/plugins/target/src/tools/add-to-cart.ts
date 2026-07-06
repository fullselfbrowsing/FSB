import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cartsApi } from '../target-api.js';

export const addToCart = defineTool({
  name: 'add_to_cart',
  displayName: 'Add to Cart',
  description:
    'Add a product to the Target shopping cart by its TCIN (Target item number). Use search_products to find TCINs. Returns the updated cart item count and total.',
  summary: 'Add a product to the cart',
  icon: 'plus-circle',
  group: 'Cart',
  input: z.object({
    tcin: z.string().describe('Target item number (TCIN) of the product to add'),
    quantity: z.number().int().min(1).optional().describe('Quantity to add (default 1)'),
  }),
  output: z.object({
    cart_item_id: z.string().describe('Cart item ID of the added item'),
    tcin: z.string().describe('TCIN of the added product'),
    quantity: z.number().int().describe('Quantity added'),
    total_cart_quantity: z.number().int().describe('Total items in cart after adding'),
  }),
  handle: async params => {
    const data = await cartsApi<Record<string, unknown>>('web_checkouts/v1/cart_items', {
      method: 'POST',
      query: { field_groups: 'CART,CART_ITEMS,SUMMARY' },
      body: {
        cart_type: 'REGULAR',
        channel_id: 10,
        shopping_context: 'DIGITAL',
        cart_item: {
          tcin: params.tcin,
          quantity: params.quantity ?? 1,
          item_channel_id: 10,
        },
      },
    });
    return {
      cart_item_id: String(data.cart_item_id ?? ''),
      tcin: String(data.tcin ?? params.tcin),
      quantity: Number(data.quantity ?? params.quantity ?? 1),
      total_cart_quantity: Number(data.total_cart_item_quantity ?? 0),
    };
  },
});
