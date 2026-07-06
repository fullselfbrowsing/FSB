import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, requireActiveCart } from '../dominos-api.js';
import { cartSchema, mapCartProduct } from './schemas.js';

export const getCart = defineTool({
  name: 'get_cart',
  displayName: 'Get Cart',
  description: 'View the current cart contents including all products, quantities, and the cart total.',
  summary: 'View your current cart',
  icon: 'shopping-bag',
  group: 'Cart',
  input: z.object({}),
  output: cartSchema,
  handle: async () => {
    const { cartId, storeId } = requireActiveCart();
    const data = await gql<{
      getCart: {
        id: string;
        products: Array<Record<string, unknown>>;
        summaryCharges?: { total?: number };
      };
    }>(
      'CartById',
      `query CartById($storeId: String!, $cartId: String!) {
  getCart(storeId: $storeId, cartId: $cartId) {
    id
    products { id quantity sku name price productType }
    summaryCharges { total }
  }
}`,
      { storeId, cartId },
    );
    const cart = data.getCart;
    return {
      id: cart?.id ?? '',
      store_id: storeId,
      products: (cart?.products ?? []).map(mapCartProduct),
      total: cart?.summaryCharges?.total ?? 0,
    };
  },
});
