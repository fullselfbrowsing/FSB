import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql } from '../dominos-api.js';
import { productBuilderSchema, mapProductBuilder } from './schemas.js';

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product Details',
  description:
    'Get detailed product builder information for a specific menu item. Returns name, description, available sizes, and quantity limits. Requires a store_id.',
  summary: 'Get details for a specific menu item',
  icon: 'utensils',
  group: 'Menu',
  input: z.object({
    product_code: z.string().describe('Product code/SKU (e.g., "S_PIZSC")'),
    store_id: z.string().describe('Store ID for store-specific details'),
  }),
  output: productBuilderSchema,
  handle: async params => {
    const data = await gql<{
      product: Record<string, unknown> | null;
    }>(
      'Product',
      `query Product($input: ProductBuilderInput!) {
  product(input: $input) {
    description name productType minQuantity maxQuantity selectedSize sizeLabel
  }
}`,
      {
        input: {
          productCode: params.product_code,
          storeId: params.store_id,
        },
      },
    );
    return mapProductBuilder(data.product ?? {});
  },
});
