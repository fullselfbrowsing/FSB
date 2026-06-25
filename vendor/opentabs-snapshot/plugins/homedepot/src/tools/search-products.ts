import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { gql, getStoreId } from '../homedepot-api.js';
import { productSummarySchema, mapProductSummary } from './schemas.js';
import type { RawSearchResult } from './schemas.js';

const QUERY = `query searchModel($keyword: String!, $channel: Channel!, $storefilter: StoreFilter, $storeId: String) {
  searchModel(keyword: $keyword, channel: $channel, storefilter: $storefilter, storeId: $storeId) {
    searchReport { totalProducts keyword }
    products {
      itemId
      identifiers { itemId productLabel storeSkuNumber brandName modelNumber canonicalUrl }
      media { images { url } }
      pricing(storeId: $storeId) { value original unitOfMeasure }
      reviews { ratingsReviews { averageRating totalReviews } }
      availabilityType { type }
    }
  }
}`;

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    "Search for products on The Home Depot by keyword. Returns up to 24 matching products with price, rating, and availability. Results are from the user's local store.",
  summary: 'Search Home Depot products by keyword',
  icon: 'search',
  group: 'Products',
  input: z.object({
    keyword: z.string().describe('Search keyword (e.g., "cordless drill", "ceiling fan")'),
    store_id: z.string().optional().describe('Store ID for local pricing and availability'),
  }),
  output: z.object({
    products: z.array(productSummarySchema).describe('Matching product results'),
    total_products: z.number().int().describe('Total number of matching products'),
    keyword: z.string().describe('Search keyword used'),
  }),
  handle: async params => {
    const storeId = params.store_id || getStoreId();

    const data = await gql<{ searchModel: RawSearchResult }>('searchModel', QUERY, {
      keyword: params.keyword,
      channel: 'DESKTOP',
      storefilter: 'ALL',
      storeId,
    });

    const model = data.searchModel;

    return {
      products: (model.products ?? []).map(mapProductSummary),
      total_products: model.searchReport?.totalProducts ?? 0,
      keyword: model.searchReport?.keyword ?? params.keyword,
    };
  },
});
