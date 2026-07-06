import { defineTool } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { redskyApi } from '../target-api.js';
import { productSummarySchema, mapProductSummary } from './schemas.js';
import type { RawProductSummary } from './schemas.js';

interface FavoritesResponse {
  data?: {
    favorites?: {
      total_count?: number;
      products?: RawProductSummary[];
    };
  };
}

export const listFavorites = defineTool({
  name: 'list_favorites',
  displayName: 'List Favorites',
  description:
    "List the user's favorited/saved Target products with name, price, brand, and rating. Supports pagination.",
  summary: 'List saved/favorited products',
  icon: 'heart',
  group: 'Favorites',
  input: z.object({
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    count: z.number().int().min(1).max(24).optional().describe('Items per page (default 10, max 24)'),
  }),
  output: z.object({
    products: z.array(productSummarySchema),
    total_count: z.number().int().describe('Total number of favorited items'),
  }),
  handle: async params => {
    const data = await redskyApi<FavoritesResponse>('redsky_aggregations/v1/web/favorites_list_v1', {
      page: params.page ?? 1,
      count: params.count ?? 10,
    });
    return {
      products: (data.data?.favorites?.products ?? []).map(mapProductSummary),
      total_count: data.data?.favorites?.total_count ?? 0,
    };
  },
});
