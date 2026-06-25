import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { cartsApi } from '../target-api.js';
import { cartSummarySchema, mapCartView } from './schemas.js';
import type { RawCartView } from './schemas.js';

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'Get Cart',
  description:
    'View the current Target shopping cart contents including items, quantities, prices, and the cart total.',
  summary: 'View current cart contents and total',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({}),
  output: z.object({ cart: cartSummarySchema }),
  handle: async () => {
    const data = await cartsApi<RawCartView>('web_checkouts/v1/cart_views');
    return { cart: mapCartView(data) };
  },
});
