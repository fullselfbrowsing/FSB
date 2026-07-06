import { defineTool, fetchJSON } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cartSchema, mapCart, type RawCart } from './schemas.js';

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'Get Cart',
  description:
    'View the current Best Buy shopping cart contents including items, quantities, prices, and the cart total.',
  summary: 'View current cart contents and total',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    cart: cartSchema.describe('Shopping cart contents and totals'),
  }),
  handle: async () => {
    const data = await fetchJSON<RawCart>('/cart/json');

    return { cart: mapCart(data ?? {}) };
  },
});
