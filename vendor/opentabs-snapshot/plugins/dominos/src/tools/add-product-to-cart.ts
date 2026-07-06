import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, requireActiveCart, syncCartUI } from '../dominos-api.js';

export const addProductToCart = defineTool({
  name: 'add_product_to_cart',
  displayName: 'Add Product to Cart',
  description:
    "Quick-add a product to the cart by its product code. Get product codes from get_category_products. Optionally specify a quantity (defaults to 1). The user must have selected a store on the Domino's website first.",
  summary: 'Add a menu item to your cart',
  icon: 'plus-circle',
  group: 'Cart',
  input: z.object({
    product_code: z.string().describe('Product code/SKU from the menu (e.g., "S_PIZSC")'),
    quantity: z.number().int().optional().describe('Quantity to add (default 1)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether the product was added successfully'),
  }),
  handle: async params => {
    const { cartId, storeId } = requireActiveCart();
    await gql<unknown>(
      'QuickAddProductMenu',
      `mutation QuickAddProductMenu(
  $storeId: String!
  $cartId: String!
  $productCode: String!
  $quantity: Int
) {
  quickAddProductMenu(
    quickAddProductMenuInput: {
      storeId: $storeId
      cartId: $cartId
      productCode: $productCode
      quantity: $quantity
    }
  )
}`,
      {
        storeId,
        cartId,
        productCode: params.product_code,
        quantity: params.quantity ?? 1,
      },
    );
    syncCartUI();
    return { success: true };
  },
});
