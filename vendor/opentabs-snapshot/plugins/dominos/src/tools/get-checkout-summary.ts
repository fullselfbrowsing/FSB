import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, requireActiveCart } from '../dominos-api.js';
import { cartProductSchema, mapCartProduct } from './schemas.js';

export const getCheckoutSummary = defineTool({
  name: 'get_checkout_summary',
  displayName: 'Get Checkout Summary',
  description:
    'Get the full checkout summary including cart total, payment options, and all products. Use this before placing an order to review the total.',
  summary: 'Review your order before checkout',
  icon: 'receipt',
  group: 'Cart',
  input: z.object({}),
  output: z.object({
    cart_id: z.string().describe('Cart ID'),
    total: z.number().describe('Cart total in USD'),
    products: z.array(cartProductSchema).describe('Products in the order'),
    payment_options: z
      .array(
        z.object({
          type: z.string().describe('Payment type (e.g., CREDIT_CARD, CASH)'),
          enabled: z.boolean().describe('Whether this payment option is available'),
        }),
      )
      .describe('Available payment methods'),
  }),
  handle: async () => {
    const { cartId, storeId } = requireActiveCart();
    const data = await gql<{
      getCart: {
        id: string;
        summaryCharges: { total: number };
        products: Array<Record<string, unknown>>;
        paymentOptions: Array<{
          type: string;
          enabled: boolean;
        }>;
      };
    }>(
      'CheckoutData',
      `query CheckoutData($storeId: String!, $cartId: String!) {
  getCart(storeId: $storeId, cartId: $cartId) {
    id
    summaryCharges { total }
    paymentOptions { type enabled }
    products { id name quantity sku price productType }
  }
}`,
      { storeId, cartId },
    );
    const cart = data.getCart;
    return {
      cart_id: cart?.id ?? '',
      total: cart?.summaryCharges?.total ?? 0,
      products: (cart?.products ?? []).map(mapCartProduct),
      payment_options: (cart?.paymentOptions ?? []).map(o => ({
        type: o.type ?? '',
        enabled: o.enabled ?? false,
      })),
    };
  },
});
