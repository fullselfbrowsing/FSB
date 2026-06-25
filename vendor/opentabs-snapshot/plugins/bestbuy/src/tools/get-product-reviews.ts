import { defineTool, fetchJSON } from '@opentabs-dev/plugin-sdk';
import { z } from 'zod';
import { mapReview, type RawReview, reviewSchema } from './schemas.js';

interface ReviewsResponse {
  currentPage?: number;
  totalPages?: number;
  totalResults?: number;
  topics?: RawReview[];
}

export const getProductReviews = defineTool({
  name: 'get_product_reviews',
  displayName: 'Get Product Reviews',
  description:
    'Get customer reviews for a Best Buy product by SKU ID. Returns review summary and individual reviews with ratings and text. Use search_products or get_product to find SKU IDs.',
  summary: 'Get product reviews by SKU ID',
  icon: 'message-square',
  group: 'Products',
  input: z.object({
    sku_id: z.string().describe('Best Buy SKU ID (e.g., "6612975")'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    page_size: z.number().int().min(1).max(50).optional().describe('Reviews per page (default 10, max 50)'),
    sort: z
      .enum(['BEST_REVIEW', 'MOST_RECENT', 'HIGHEST_RATING', 'LOWEST_RATING'])
      .optional()
      .describe('Sort order (default "BEST_REVIEW")'),
  }),
  output: z.object({
    reviews: z.array(reviewSchema).describe('Customer reviews'),
    current_page: z.number().int().describe('Current page number'),
    total_pages: z.number().int().describe('Total number of pages'),
    total_results: z.number().int().describe('Total number of reviews'),
  }),
  handle: async params => {
    const page = params.page ?? 1;
    const pageSize = params.page_size ?? 10;
    const sort = params.sort ?? 'BEST_REVIEW';

    const data = await fetchJSON<ReviewsResponse>(
      `/ugc/v2/reviews?sku=${params.sku_id}&page=${page}&pageSize=${pageSize}&sort=${sort}`,
    );

    return {
      reviews: (data?.topics ?? []).map(mapReview),
      current_page: data?.currentPage ?? page,
      total_pages: data?.totalPages ?? 0,
      total_results: data?.totalResults ?? 0,
    };
  },
});
