import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getStoreId } from '../homedepot-api.js';
import { productDetailSchema, mapProductDetail } from './schemas.js';
import type { RawProductDetail } from './schemas.js';

const QUERY = `query productClientOnlyProduct($storeId: String, $itemId: String!) {
  product(itemId: $itemId) {
    itemId dataSources
    identifiers { itemId productLabel storeSkuNumber brandName modelNumber parentId canonicalUrl }
    details { description collection { name url } }
    media { images { url sizes type subType } }
    pricing(storeId: $storeId) { value original mapAboveOriginalPrice message unitOfMeasure }
    reviews { ratingsReviews { averageRating totalReviews } }
    availabilityType { type discontinued }
    fulfillment(storeId: $storeId) { fulfillmentOptions { type services { type locations { isAnchor inventory { isInStock isLimitedQuantity quantity } } } } }
  }
}`;

export const getProduct = defineTool({
  name: 'get_product',
  displayName: 'Get Product Details',
  description:
    'Get detailed information about a Home Depot product by its item ID. Returns description, pricing, availability, fulfillment options, and reviews.',
  summary: 'Get product details by item ID',
  icon: 'package',
  group: 'Products',
  input: z.object({
    item_id: z.string().describe('Home Depot product item ID (e.g., "312610058")'),
    store_id: z.string().optional().describe('Store ID for local pricing and fulfillment'),
  }),
  output: z.object({
    product: productDetailSchema.describe('Full product details'),
  }),
  handle: async params => {
    const storeId = params.store_id || getStoreId();

    const data = await gql<{ product: RawProductDetail }>('productClientOnlyProduct', QUERY, {
      itemId: params.item_id,
      storeId,
    });

    return {
      product: mapProductDetail(data.product),
    };
  },
});
