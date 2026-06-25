import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, setFrontendCartCookies } from '../dominos-api.js';

export const createCart = defineTool({
  name: 'create_cart',
  displayName: 'Create Cart',
  description:
    "Create a new shopping cart at a specific store for carryout. Sets up the browser so the Domino's website recognizes the cart. Call this before add_product_to_cart if no store has been selected yet.",
  summary: 'Start a new carryout order at a store',
  icon: 'shopping-cart',
  group: 'Cart',
  input: z.object({
    store_id: z.string().describe('Store ID (e.g., "8290"). Use find_stores_by_address to find stores.'),
  }),
  output: z.object({
    cart_id: z.string().describe('Created cart ID'),
    store_id: z.string().describe('Store ID'),
  }),
  handle: async params => {
    const cartInput = {
      storeId: Number(params.store_id),
      serviceMethod: 'CARRYOUT',
      timing: { type: 'ASAP' },
    };
    const data = await gql<{
      createCart: { id: string; storeId: string };
    }>(
      'CreateCart',
      `mutation CreateCart($cart: CartInput!) {
  createCart(cart: $cart) { id storeId }
}`,
      { cart: cartInput },
    );
    const cartId = data.createCart?.id ?? '';
    const storeId = data.createCart?.storeId ?? params.store_id;

    setFrontendCartCookies(cartId, storeId, 'CARRYOUT', cartInput);
    return { cart_id: cartId, store_id: storeId };
  },
});
