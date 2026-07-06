import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, requireActiveCart, syncCartUI } from '../dominos-api.js';

export const updateProductQuantity = defineTool({
  name: 'update_product_quantity',
  displayName: 'Update Product Quantity',
  description:
    'Change the quantity of a product already in the cart. Set quantity to 0 to remove it. Get the product_instance_id from get_cart (the "id" field of each product).',
  summary: 'Change quantity of a cart item',
  icon: 'hash',
  group: 'Cart',
  input: z.object({
    product_instance_id: z.string().describe('Product instance ID from get_cart (the "id" field of each cart product)'),
    quantity: z.number().int().describe('New quantity (0 to remove the item)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the quantity was updated'),
  }),
  handle: async params => {
    const { cartId, storeId } = requireActiveCart();
    await gql<unknown>(
      'UpdateProductQuantity',
      `mutation UpdateProductQuantity(
  $storeId: String!
  $cartId: String!
  $productInstanceId: String!
  $quantity: Int!
) {
  updateProductQuantity(
    storeId: $storeId
    cartId: $cartId
    productInstanceId: $productInstanceId
    quantity: $quantity
  )
}`,
      {
        storeId,
        cartId,
        productInstanceId: params.product_instance_id,
        quantity: params.quantity,
      },
    );
    syncCartUI();
    return { success: true };
  },
});
