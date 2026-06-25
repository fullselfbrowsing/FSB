import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { redskyApi } from '../target-api.js';
import { productSummarySchema, mapProductSummary } from './schemas.js';
import type { RawProductSummary } from './schemas.js';

interface SearchResponse {
  data?: {
    search?: {
      products?: RawProductSummary[];
      search_response?: {
        typed_metadata?: { total_results?: number };
      };
    };
  };
}

export const searchProducts = defineTool({
  name: 'search_products',
  displayName: 'Search Products',
  description:
    "Search the Target product catalog by keyword. Returns product name, price, brand, rating, and image. Results are personalized to the user's preferred store for pricing and availability.",
  summary: 'Search for products on Target',
  icon: 'search',
  group: 'Products',
  input: z.object({
    keyword: z.string().describe('Search keyword (e.g., "airpods", "paper towels")'),
    count: z.number().int().min(1).max(24).optional().describe('Number of results (default 10, max 24)'),
    offset: z.number().int().min(0).optional().describe('Result offset for pagination (default 0)'),
  }),
  output: z.object({
    products: z.array(productSummarySchema),
    total_results: z.number().int().describe('Total number of matching products'),
  }),
  handle: async params => {
    const data = await redskyApi<SearchResponse>('redsky_aggregations/v1/web/plp_search_v2', {
      keyword: params.keyword,
      count: params.count ?? 10,
      offset: params.offset ?? 0,
      default_purchasability_filter: true,
      include_dmc_dmr: true,
      page: `/s/${encodeURIComponent(params.keyword)}`,
    });
    return {
      products: (data.data?.search?.products ?? []).map(mapProductSummary),
      total_results: data.data?.search?.search_response?.typed_metadata?.total_results ?? 0,
    };
  },
});
